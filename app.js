/* ============================================================
   Connections Explorer
   Section 1: filterable directory
   Section 2: hub-and-spoke network graph (D3 force layout)
   ============================================================ */
(function () {
  'use strict';

  let PEOPLE = [];
  let SUMMARY = {};

  /* ----- sector palette (kept in sync with styles.css) ----- */
  const SECTOR_COLORS = {
    'Crypto & Web3':       '#f7931a',
    'Banking & Broking':   '#4f8bff',
    'Fintech & Payments':  '#2dd4a7',
    'AI & Data':           '#a78bfa',
    'Finance & Investment':'#fbbf24',
    'Technology / SaaS':   '#22d3ee',
    'Media & Marketing':   '#f472b6',
    'Consulting & Advisory':'#2dd4bf',
    'E-commerce & Retail': '#fb7185',
    'HR & Talent':         '#a3e635',
    'Gaming & Entertainment':'#c084fc',
    'Education & Learning':'#facc15',
    'Healthcare & Pharma': '#fb5e7d',
    'Freelance / Stealth': '#94a3b8',
    'Other':               '#8893ad',
  };
  const sectorColor = s => SECTOR_COLORS[s] || '#8893ad';

  /* ----- helpers ----- */
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ----- theme (light / dark) ----- */
  const THEME_KEY = 'ce-theme';
  function preferredTheme() {
    let t;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    refreshGraphColors(); // function declarations are hoisted; defined further down
  }
  applyTheme(preferredTheme()); // mirror the head script (covers no-JS-cache / changed-pref cases)
  $$('[data-theme-toggle]').forEach(b => b.addEventListener('click', toggleTheme));
  const initials = name => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  // deterministic avatar gradient from a string
  function avatarStyle(name) {
    let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    const h1 = Math.abs(h) % 360, h2 = (h1 + 50) % 360;
    return `background: linear-gradient(135deg, hsl(${h1} 70% 62%), hsl(${h2} 70% 52%));`;
  }

  /* ========================================================
     TAB NAVIGATION
     ======================================================== */
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  function switchView(view) {
    const tab = document.querySelector(`.tab[data-view="${view}"]`);
    $$('.tab').forEach(t => { t.classList.toggle('active', t === tab); t.setAttribute('aria-selected', t === tab); });
    $$('.view').forEach(v => { const on = v.id === 'view-' + view; v.classList.toggle('active', on); v.hidden = !on; });
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    if (view === 'graph') { ensureGraph(); resizeGraph(); }
  }
  window.switchView = switchView;

  /* ========================================================
     SECTION 1 — DIRECTORY / FILTERS
     ======================================================== */
  const state = {
    q: '', sectors: new Set(), categories: new Set(),
    company: '', position: '', sort: 'recent', year: '',
  };

  // ordered sector + category lists (by frequency) — recomputed when data loads
  let SECTORS = [];
  let CATEGORIES = [];
  function computeFacets() {
    SECTORS = Object.keys(SUMMARY.sectors || {}).filter(s => s !== 'Other').concat(['Other']).filter(s => (SUMMARY.sectors || {})[s]);
    CATEGORIES = Object.keys(SUMMARY.categories || {});
  }

  function buildFilterUI() {
    // sector chips
    const sf = $('#sector-filters');
    sf.innerHTML = SECTORS.map(s => {
      const n = SUMMARY.sectors[s] || 0;
      return `<div class="chip" data-sector="${s}"><span class="dot" style="background:${sectorColor(s)}"></span><span class="label">${s}</span><span class="count">${n}</span></div>`;
    }).join('');
    sf.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
      const s = c.dataset.sector;
      if (state.sectors.has(s)) { state.sectors.delete(s); c.classList.remove('active'); } else { state.sectors.add(s); c.classList.add('active'); }
      renderDirectory();
    }));

    // category chips
    const cf = $('#category-filters');
    cf.innerHTML = CATEGORIES.map(c => {
      const n = SUMMARY.categories[c] || 0;
      return `<div class="chip" data-cat="${c}"><span class="dot" style="background:var(--accent)"></span><span class="label">${c}</span><span class="count">${n}</span></div>`;
    }).join('');
    cf.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
      const cat = c.dataset.cat;
      if (state.categories.has(cat)) { state.categories.delete(cat); c.classList.remove('active'); } else { state.categories.add(cat); c.classList.add('active'); }
      renderDirectory();
    }));

    // company + position dropdowns
    const companies = [...new Set(PEOPLE.map(p => p.company))].filter(Boolean).sort((a, b) => a.localeCompare(b));
    const positions = [...new Set(PEOPLE.map(p => p.position))].filter(Boolean).sort((a, b) => a.localeCompare(b));
    const co = $('#company-filter');
    co.innerHTML = '<option value="">All companies</option>' + companies.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    const po = $('#position-filter');
    po.innerHTML = '<option value="">All positions</option>' + positions.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');

    // years
    const years = [...new Set(PEOPLE.map(p => (p.connected || '').slice(0, 4)))].filter(Boolean).sort().reverse();
    $('#year-filter').innerHTML = '<option value="">All time</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');

    // wire up
    $('#search').addEventListener('input', e => { state.q = e.target.value.toLowerCase().trim(); renderDirectory(); });
    co.addEventListener('change', e => { state.company = e.target.value; renderDirectory(); });
    po.addEventListener('change', e => { state.position = e.target.value; renderDirectory(); });
    $('#sort-filter').addEventListener('change', e => { state.sort = e.target.value; renderDirectory(); });
    $('#year-filter').addEventListener('change', e => { state.year = e.target.value; renderDirectory(); });
    $('#clear-filters').addEventListener('click', resetFilters);
  }

  function resetFilters() {
    state.q = ''; state.sectors.clear(); state.categories.clear();
    state.company = ''; state.position = ''; state.sort = 'recent'; state.year = '';
    $('#search').value = ''; $('#company-filter').value = ''; $('#position-filter').value = '';
    $('#sort-filter').value = 'recent'; $('#year-filter').value = '';
    $$('.chip').forEach(c => c.classList.remove('active'));
    renderDirectory();
  }

  function filterPeople() {
    const q = state.q;
    return PEOPLE.filter(p => {
      if (state.sectors.size && !state.sectors.has(p.sector)) return false;
      if (state.categories.size && !state.categories.has(p.category)) return false;
      if (state.company && p.company !== state.company) return false;
      if (state.position && p.position !== state.position) return false;
      if (state.year && !(p.connected || '').startsWith(state.year)) return false;
      if (q) {
        const hay = `${p.name} ${p.company} ${p.position}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function sortPeople(list) {
    const s = state.sort;
    return list.slice().sort((a, b) => {
      if (s === 'name') return (a.name || '').localeCompare(b.name || '');
      if (s === 'company') return (a.company || '').localeCompare(b.company || '');
      if (s === 'position') return (a.position || '').localeCompare(b.position || '');
      return (b.connected || '').localeCompare(a.connected || ''); // recent
    });
  }

  function renderDirectory() {
    const list = sortPeople(filterPeople());
    const grid = $('#card-grid');
    const empty = $('#empty-state');

    $('#result-count').textContent = `${list.length} of ${PEOPLE.length}`;
    $('#results-title').textContent = activeFilterTitle();

    // summary
    const sectors = new Set(list.map(p => p.sector));
    const companies = new Set(list.map(p => p.company));
    $('#directory-summary').innerHTML = `
      <div><b>${list.length}</b> people · <b>${companies.size}</b> companies</div>
      <div><b>${sectors.size}</b> sectors represented</div>`;

    if (!list.length) { grid.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;

    const cards = list.slice(0, 400).map(p => {
      const sc = sectorColor(p.sector);
      return `<div class="card" style="--accent:${sc}">
        <div class="card-top">
          <div class="avatar" style="${avatarStyle(p.name)}">${esc(initials(p.name))}</div>
          <div style="min-width:0">
            <div class="card-name">${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener" title="Open on LinkedIn">${esc(p.name)}</a>` : esc(p.name)}</div>
            <div class="card-role">${esc(p.position)}</div>
          </div>
        </div>
        <div class="card-company"><span class="co-dot" style="background:${sc}"></span>${esc(p.company)}</div>
        <div class="card-tags">
          <span class="tag sector" style="background:${sc}">${esc(p.sector)}</span>
          <span class="tag cat">${esc(p.category)}</span>
        </div>
        <div class="card-foot">
          <span>${p.connected ? '🔗 ' + p.connected : ''}</span>
          ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">LinkedIn →</a>` : ''}
        </div>
      </div>`;
    }).join('');
    grid.innerHTML = cards;
    if (list.length > 400) {
      grid.innerHTML += `<div class="card" style="display:grid;place-items:center;color:var(--text-mute);font-size:12.5px">+ ${list.length - 400} more — narrow your filters</div>`;
    }
  }

  function activeFilterTitle() {
    const parts = [];
    if (state.sectors.size === 1) parts.push([...state.sectors][0]);
    if (state.categories.size === 1) parts.push([...state.categories][0]);
    if (state.company) parts.push(state.company);
    if (state.position) parts.push(state.position);
    if (parts.length) return parts.join(' · ');
    if (state.q) return `“${state.q}”`;
    return 'All connections';
  }

  /* ========================================================
     SECTION 2 — NETWORK GRAPH (hub & spoke)
     ======================================================== */
  const graph = {
    ready: false, mode: 'company', sector: '', category: '', minLinks: 3, focus: '',
    svg: null, g: null, sim: null, zoom: null, width: 0, height: 0,
    nodes: [], links: [], isolated: null,
  };

  function ensureGraph() {
    if (graph.ready) { drawGraph(); return; }
    graph.ready = true;

    const svg = d3.select('#graph-svg');
    graph.svg = svg;
    graph.g = svg.append('g').attr('class', 'zoom-layer');
    graph.linkSel = graph.g.append('g').attr('class', 'links').selectAll('line');
    graph.nodeSel = graph.g.append('g').attr('class', 'nodes').selectAll('g');

    graph.zoom = d3.zoom().scaleExtent([0.15, 4]).on('zoom', e => graph.g.attr('transform', e.transform));
    svg.call(graph.zoom);

    // sector dropdown
    const gs = $('#graph-sector');
    gs.innerHTML = '<option value="">All sectors</option>' + SECTORS.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    gs.addEventListener('change', e => { graph.sector = e.target.value; clearIsolation(); drawGraph(); });

    // role-category dropdown
    const gc = $('#graph-category');
    gc.innerHTML = '<option value="">All roles</option>' + CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    gc.addEventListener('change', e => { graph.category = e.target.value; clearIsolation(); drawGraph(); });

    $('#graph-mode').querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => {
      $('#graph-mode').querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('active', x === b));
      graph.mode = b.dataset.mode; graph.isolated = null; updateModeHint(); drawGraph();
    }));
    updateModeHint();
    $('#graph-min').addEventListener('input', e => { graph.minLinks = +e.target.value; $('#graph-min-val').textContent = e.target.value; clearIsolation(); drawGraph(); });
    $('#graph-search').addEventListener('input', e => { graph.focus = e.target.value.toLowerCase().trim(); clearIsolation(); drawGraph(); });
    $('#graph-reset').addEventListener('click', () => { if (graph.sim) graph.sim.alpha(0.8).restart(); });
    $('#graph-fit').addEventListener('click', fitToScreen);
    $('#detail-close').addEventListener('click', () => { graph.isolated = null; $('#detail-panel').hidden = true; drawGraph(); });

    // legend
    $('#graph-legend').innerHTML = SECTORS.filter(s => s !== 'Other').map(s =>
      `<span class="legend-item"><span class="dot" style="background:${sectorColor(s)}"></span>${esc(s)}</span>`).join('');

    // deep-link: ?view=graph&mode=category&category=Product
    const p = new URLSearchParams(location.search);
    const m = p.get('mode');
    if (m && ['company', 'position', 'category'].includes(m)) {
      graph.mode = m;
      $('#graph-mode').querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('active', x.dataset.mode === m));
      updateModeHint();
    }
    if (p.get('category')) { graph.category = p.get('category'); $('#graph-category').value = p.get('category'); }
    if (p.get('sector')) { graph.sector = p.get('sector'); $('#graph-sector').value = p.get('sector'); }
    if (p.get('min')) { const mv = Math.max(1, Math.min(10, +p.get('min'))); graph.minLinks = mv; $('#graph-min').value = mv; $('#graph-min-val').textContent = mv; }

    drawGraph();
  }

  function resizeGraph() {
    const stage = $('.graph-stage'); if (!stage) return;
    graph.width = stage.clientWidth; graph.height = stage.clientHeight;
    if (graph.svg) graph.svg.attr('viewBox', `0 0 ${graph.width} ${graph.height}`);
    if (graph.sim) {
      graph.sim.force('center', d3.forceCenter(graph.width / 2, graph.height / 2));
      graph.sim.force('x', d3.forceX(graph.width / 2).strength(0.04));
      graph.sim.force('y', d3.forceY(graph.height / 2).strength(0.04));
      graph.sim.alpha(0.3).restart();
    }
  }
  window.addEventListener('resize', () => { if (!$('#view-graph').hidden) resizeGraph(); });

  function modeLabel() {
    return graph.mode === 'company' ? 'Company'
         : graph.mode === 'position' ? 'Position'
         : 'Role category';
  }
  function updateModeHint() {
    const el = $('#mode-hint'); if (!el) return;
    const tips = {
      company:  'Hub = company. Everyone at the same firm links to one dot.',
      position: 'Hub = exact job title. Each distinct title is its own dot.',
      category: 'Hub = role family. All product titles (PM, APM, Lead, CPO…) merge into one <b>Product</b> hub.',
    };
    el.innerHTML = tips[graph.mode];
  }

  function buildGraphData() {
    const key = graph.mode; // 'company' | 'position' | 'category'
    // filter people by sector + role category
    let pool = PEOPLE.filter(p => p.company && p.position);
    if (graph.sector) pool = pool.filter(p => p.sector === graph.sector);
    if (graph.category) pool = pool.filter(p => p.category === graph.category);

    // count members per hub
    const counts = new Map();
    pool.forEach(p => { const k = p[key]; counts.set(k, (counts.get(k) || 0) + 1); });

    // hubs passing the min threshold (or matched by focus)
    const focus = graph.focus;
    const hubSet = new Map();
    counts.forEach((n, name) => {
      if (n >= graph.minLinks || (focus && name.toLowerCase().includes(focus))) hubSet.set(name, n);
    });
    // if a single hub is isolated, restrict to it
    if (graph.isolated) hubSet.clear(), hubSet.set(graph.isolated, counts.get(graph.isolated) || 0);

    const nodes = [];
    const links = [];
    const hubsInGraph = new Set(hubSet.keys());

    // hub nodes
    hubSet.forEach((n, name) => {
      // sector of hub = dominant sector among its members
      const members = pool.filter(p => p[key] === name);
      const sec = dominant(members.map(m => m.sector));
      nodes.push({ id: 'hub:' + name, type: 'hub', label: name, hubName: name, members, sector: sec, count: n });
    });
    // person nodes
    pool.forEach(p => {
      if (!hubsInGraph.has(p[key])) return;
      const pid = 'p:' + p.id;
      nodes.push({ id: pid, type: 'person', label: p.name, person: p, sector: p.sector });
      links.push({ source: 'hub:' + p[key], target: pid });
    });

    // sort so largest hubs render first
    graph.nodes = nodes;
    graph.links = links;
    return { nodes, links };
  }

  function dominant(arr) {
    const m = {}; let best = arr[0], max = 0;
    arr.forEach(v => { m[v] = (m[v] || 0) + 1; if (m[v] > max) { max = m[v]; best = v; } });
    return best;
  }

  function drawGraph() {
    if (!graph.ready) return;
    resizeGraph();
    const { nodes, links } = buildGraphData();

    // stats
    const hubs = nodes.filter(n => n.type === 'hub');
    const heavy = nodes.length > 1000;
    $('#graph-stats').innerHTML =
      `<div><b>${hubs.length}</b> hubs · <b>${nodes.length - hubs.length}</b> people</div>` +
      `<div><b>${links.length}</b> connections</div>` +
      (heavy ? `<div style="color:var(--accent);margin-top:5px">Large graph — layout is settling, give it a moment.</div>` : '');

    if (!hubs.length) {
      graph.svg.selectAll('g.links line, g.nodes g').remove();
      return;
    }

    // ----- simulation (faster settle when the graph is huge) -----
    const hubR = d => 10 + Math.sqrt(d.count) * 4.2;

    if (graph.sim) graph.sim.stop();
    graph.sim = d3.forceSimulation(nodes)
      .alphaDecay(heavy ? 0.06 : 0.0228)
      .velocityDecay(heavy ? 0.35 : 0.4)
      .force('link', d3.forceLink(links).id(d => d.id)
        .distance(l => l.target.type === 'person' ? 55 : 120).strength(0.5))
      .force('charge', d3.forceManyBody().strength(d => d.type === 'hub' ? -380 - d.count * 6 : -55))
      .force('center', d3.forceCenter(graph.width / 2, graph.height / 2))
      .force('collide', d3.forceCollide().radius(d => (d.type === 'hub' ? hubR(d) : 6) + 4))
      .force('x', d3.forceX(graph.width / 2).strength(0.04))
      .force('y', d3.forceY(graph.height / 2).strength(0.04));

    // ----- links -----
    graph.linkSel = graph.g.select('g.links').selectAll('line').data(links, d => (d.source.id || d.source) + '-' + (d.target.id || d.target));
    graph.linkSel.exit().remove();
    graph.linkSel = graph.linkSel.enter().append('line').attr('stroke', cssVar('--graph-link')).attr('stroke-width', 1).merge(graph.linkSel);

    // ----- nodes -----
    const nodeG = graph.g.select('g.nodes');
    graph.nodeSel = nodeG.selectAll('g.node').data(nodes, d => d.id);
    graph.nodeSel.exit().remove();

    const enter = graph.nodeSel.enter().append('g').attr('class', 'node').style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) graph.sim.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) graph.sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    // hub visuals
    const hubEnter = enter.filter(d => d.type === 'hub');
    hubEnter.append('circle').attr('class', 'halo').attr('r', d => hubR(d) + 6).attr('fill', d => sectorColor(d.sector)).attr('opacity', 0.16);
    hubEnter.append('circle').attr('class', 'core').attr('r', d => hubR(d)).attr('fill', d => sectorColor(d.sector)).attr('stroke', cssVar('--graph-node-stroke')).attr('stroke-width', 1.5);
    hubEnter.append('text').attr('class', 'hub-label')
      .attr('dy', d => hubR(d) + 16).attr('text-anchor', 'middle')
      .attr('fill', cssVar('--text')).attr('font-size', 11).attr('font-weight', 700)
      .attr('font-family', "'Space Grotesk', sans-serif").text(d => truncate(d.hubName, 24));
    hubEnter.append('text').attr('class', 'hub-count')
      .attr('text-anchor', 'middle').attr('dy', 4).attr('fill', cssVar('--on-accent'))
      .attr('font-size', 11).attr('font-weight', 800).attr('font-family', "'Space Grotesk', sans-serif")
      .text(d => d.count);

    // person visuals
    const perEnter = enter.filter(d => d.type === 'person');
    perEnter.append('circle').attr('class', 'p-dot').attr('r', 5).attr('fill', d => sectorColor(d.sector)).attr('stroke', cssVar('--graph-node-stroke')).attr('stroke-width', 1);

    graph.nodeSel = enter.merge(graph.nodeSel);

    // interactivity
    graph.nodeSel.on('mouseenter', (e, d) => showTooltip(e, d))
      .on('mousemove', moveTooltip)
      .on('mouseleave', hideTooltip)
      .on('click', (e, d) => { e.stopPropagation(); if (d.type === 'hub') isolateHub(d); else openLinkedIn(d); });

    graph.sim.on('tick', () => {
      graph.linkSel.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      graph.nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // auto-fit after layout settles
    graph.sim.alpha(1).restart();
  }

  /* re-skin the graph for the current theme without re-running the simulation */
  function refreshGraphColors() {
    if (!graph.ready) return;
    const link = cssVar('--graph-link');
    const stroke = cssVar('--graph-node-stroke');
    const text = cssVar('--text');
    graph.g.selectAll('g.links line').attr('stroke', link);
    graph.g.selectAll('circle.core, circle.p-dot').attr('stroke', stroke);
    graph.g.selectAll('text.hub-label').attr('fill', text);
  }

  function isolateHub(d) {
    graph.isolated = graph.isolated === d.hubName ? null : d.hubName;
    if (graph.isolated) showHubDetail(d); else $('#detail-panel').hidden = true;
    drawGraph();
  }
  function clearIsolation() { graph.isolated = null; $('#detail-panel').hidden = true; }

  function showHubDetail(d) {
    const panel = $('#detail-panel');
    const sc = sectorColor(d.sector);
    const members = d.members.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    $('#detail-content').innerHTML = `
      <h3 style="color:${sc}">${esc(d.hubName)}</h3>
      <div class="d-sub">${modeLabel()} · ${d.count} ${graph.mode === 'company' ? 'connections' : 'people'}</div>
      <div class="d-stat">${esc(d.sector)}${members.some(m => m.category !== members[0].category) ? '' : ' · ' + esc(members[0].category)}</div>
      ${members.map(m => {
        const role = graph.mode === 'company' ? m.position
                   : graph.mode === 'position' ? m.company
                   : `${m.position} · ${m.company}`;
        return `
        <div class="d-person">
          <div class="mini-av" style="${avatarStyle(m.name)}">${esc(initials(m.name))}</div>
          <div style="min-width:0;flex:1">
            ${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.name)}</a>` : `<span>${esc(m.name)}</span>`}
            <div class="d-role">${esc(role)}</div>
          </div>
        </div>`;
      }).join('')}`;
    panel.hidden = false;
  }

  function openLinkedIn(d) { if (d.person && d.person.url) window.open(d.person.url, '_blank', 'noopener'); }

  /* ----- tooltip ----- */
  function showTooltip(e, d) {
    const t = $('#tooltip');
    if (d.type === 'hub') {
      t.innerHTML = `<div class="t-name" style="color:${sectorColor(d.sector)}">${esc(d.hubName)}</div>
        <div class="t-sub">${d.count} ${graph.mode === 'company' ? 'connections' : 'people'} · ${esc(d.sector)}</div>
        <div class="t-meta">Click to isolate</div>`;
    } else {
      const p = d.person;
      t.innerHTML = `<div class="t-name">${esc(p.name)}</div>
        <div class="t-sub">${esc(p.position)}</div>
        <div class="t-sub">${esc(p.company)} · ${esc(p.sector)}</div>
        <div class="t-meta">${p.url ? 'Click to open LinkedIn' : ''}</div>`;
    }
    t.hidden = false; moveTooltip(e);
  }
  function moveTooltip(e) {
    const t = $('#tooltip'); const pad = 14;
    let x = e.offsetX + pad, y = e.offsetY + pad;
    // place relative to stage
    const stage = $('.graph-stage').getBoundingClientRect();
    x = e.clientX - stage.left + pad; y = e.clientY - stage.top + pad;
    if (x + 240 > stage.width) x = e.clientX - stage.left - 250;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTooltip() { $('#tooltip').hidden = true; }

  function fitToScreen() {
    if (!graph.nodes.length) return;
    const svg = graph.svg;
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    graph.nodes.forEach(n => { if (n.x == null) return; bounds.minX = Math.min(bounds.minX, n.x); bounds.minY = Math.min(bounds.minY, n.y); bounds.maxX = Math.max(bounds.maxX, n.x); bounds.maxY = Math.max(bounds.maxY, n.y); });
    const w = bounds.maxX - bounds.minX || 1, h = bounds.maxY - bounds.minY || 1;
    const pad = 80, scale = Math.min((graph.width - pad) / w, (graph.height - pad) / h, 1.4);
    const tx = (graph.width - scale * (bounds.minX + bounds.maxX)) / 2;
    const ty = (graph.height - scale * (bounds.minY + bounds.maxY)) / 2;
    svg.transition().duration(600).call(graph.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  /* ----- utils ----- */
  function truncate(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ========================================================
     BOOT
     ======================================================== */
  function boot() {
    $('#brand-stats').textContent = `${SUMMARY.total || PEOPLE.length} connections · ${SUMMARY.companyCount || ''} companies · ${SECTORS.length} sectors`;
    buildFilterUI();
    renderDirectory();
    const initial = (location.hash || '').replace('#', '') || (new URLSearchParams(location.search).get('view') || '');
    if (initial === 'graph') switchView('graph');
  }

  /* ----- data intake: drop / pick / sample ----- */
  function initApp(connections, summary) {
    PEOPLE = (connections || []).filter(p => p.name || p.company);
    SUMMARY = summary || {};
    computeFacets();
    const landing = document.getElementById('landing');
    if (landing) landing.hidden = true;
    boot();
  }
  window.ConnectionsApp = { initApp };

  function showLandingError(msg) {
    const el = document.getElementById('drop-error');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  function handleFile(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && !/csv/i.test(file.type || '')) {
      showLandingError('That doesn’t look like a .csv — please drop your LinkedIn Connections.csv.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const out = window.ConnectionsParser.parse(reader.result);
        if (!out || !out.connections || !out.connections.length) throw new Error('No connection rows found in this file.');
        initApp(out.connections, out.summary);
        if (window.ceTrack) window.ceTrack('csv-loaded');
      } catch (ex) {
        showLandingError('Couldn’t read that file: ' + ((ex && ex.message) || ex));
      }
    };
    reader.onerror = () => showLandingError('Could not read the file. Please try again.');
    reader.readAsText(file);
  }

  function loadSample() {
    try {
      const out = window.ConnectionsParser.parse(window.ConnectionsParser.SAMPLE_CSV);
      initApp(out.connections, out.summary);
      if (window.ceTrack) window.ceTrack('sample-loaded');
    } catch (ex) {
      showLandingError('Sample data failed to load: ' + ((ex && ex.message) || ex));
    }
  }

  function setupLanding() {
    const landing = document.getElementById('landing');
    if (!landing) return;
    const dz = document.getElementById('dropzone');
    const input = document.getElementById('file-input');

    if (dz) {
      dz.addEventListener('click', e => { if (e.target.id !== 'browse-btn') input && input.click(); });
      dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input && input.click(); } });
    }
    const browse = document.getElementById('browse-btn');
    if (browse) browse.addEventListener('click', e => { e.stopPropagation(); input && input.click(); });
    if (input) input.addEventListener('change', () => { if (input.files && input.files[0]) handleFile(input.files[0]); });
    const sample = document.getElementById('sample-btn');
    if (sample) sample.addEventListener('click', loadSample);

    // drop anywhere on the page while the landing is still showing
    let depth = 0;
    window.addEventListener('dragenter', e => { if (landing.hidden) return; e.preventDefault(); depth++; dz && dz.classList.add('drag'); });
    window.addEventListener('dragover', e => { if (landing.hidden) return; e.preventDefault(); });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (depth === 0) dz && dz.classList.remove('drag'); });
    window.addEventListener('drop', e => {
      e.preventDefault(); depth = 0; dz && dz.classList.remove('drag');
      if (landing.hidden) return;
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupLanding);
  else setupLanding();
})();
