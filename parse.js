/*!
 * parse.js — ConnectionsParser
 * --------------------------------------------------------------------------
 * Browser-side mirror of build_data.py: parses the full contents of a LinkedIn
 * `Connections.csv` (string) into `{ connections, summary }` using the SAME
 * sector (SECTOR_RULES) and position-category (POSITION_RULES) classification
 * tables as the Python build script, so in-browser classification matches the
 * output of build_data.py exactly.
 *
 * Dependencies:
 *   - PapaParse, loaded globally as `Papa` via CDN, BEFORE this script.
 *
 * Exposes:
 *   window.ConnectionsParser.parse(text) -> { connections, summary }
 *   window.ConnectionsParser.SAMPLE_CSV  -> demo LinkedIn Connections.csv string
 *
 * Classification helpers (parseDate, classifySector, classifyPosition) are kept
 * internal. NOTE: build_data.py contained a DUPLICATE "Banking & Broking" rule
 * block (the second was a strict subset of the first and never reachable under
 * first-match-wins); it is de-duplicated to a single block here.
 */
(function (global) {
  'use strict';

  // =========================================================================
  // SECTOR_RULES — ported VERBATIM from build_data.py (one Banking block).
  // First-match-wins. Each keyword fragment is matched as a case-SENSITIVE
  // substring of (" " + lowercased company + " "). The leading/trailing spaces
  // inside some fragments (" ai", "ai ", " ml ", "ad ", "ey ", "vc ",
  // " angels", "it ", "hr ", " Jupiter") are intentional and preserved exactly.
  // =========================================================================
  var SECTOR_RULES = [
    ['Freelance / Stealth', [
      'stealth', 'freelance', 'freelancer', 'self-employed', 'self employed',
      'independent', 'confidential', 'own venture', 'solo'
    ]],
    ['Crypto & Web3', [
      'crypto', 'blockchain', 'web3', 'defi', 'nft', 'token', 'dao',
      'binance', 'bybit', 'bitget', 'bitbns', 'bitfinex', 'bitunix',
      'coindcx', 'coinstore', 'kucoin', 'okx', 'kraken', 'polygon',
      'ethereum', 'solana', 'chain', 'ledger', 'metamask', 'wallet',
      'dex', 'coin', 'bit', 'onramp', 'ramp', 'minance', 'mint', 'satosh',
      'threeway studio', 'launchpad', 'coinlist', 'wazir', 'bingx',
      'fireblocks', 'gate', 'cipherbc', 'htx', 'mexc', 'hex trust',
      'bkex', 'phemex', 'straitsx', 'circle', 'gnosis', 'hashlock',
      'blockseblock', 'blocsys', 'liminal', 'hypernative', 'nillion',
      'logx', 'm0', 'staynex', 'immunebyte', 'avalanche', 'cosmos',
      'polkadot', 'cardano', 'arbitrum', 'optimism', 'tether', 'ripple',
      'litecoin', 'uniswap', 'sushiswap', 'aave', 'compound', 'metamask',
      'trust wallet', 'phantom', 'anchorage', 'falconx', 'galaxy',
      'smart contract', 'etherium', 'gate.io', 'gateio', 'block', 'hash'
    ]],
    ['Banking & Broking', [
      'bank', 'kotak', 'hdfc', 'icici', 'sbi', 'axis', 'broker', 'broking',
      'brokage', 'securities', 'angel one', 'angelone', 'upstox', 'zerodha',
      'groww', 'trading', 'trade', 'stock', 'neo', 'exchange', 'nse', 'bse',
      'demat', 'invest', 'portfolio', 'jpmorgan', 'chase', 'goldman',
      'morgan stanley', 'hsbc', 'citibank', 'wells fargo', 'barclays',
      'ngân hàng'
    ]],
    ['Fintech & Payments', [
      'pay', 'fintech', 'razorpay', 'phonepe', 'paytm', 'payu', 'cashfree',
      'pinelabs', 'pine labs', 'stripe', 'upi', 'lending', 'lend', 'loan',
      'insurance', 'insur', 'money', 'wallet', 'bharatpe', 'cred', 'slice',
      'fi money', ' Jupiter', 'wealth'
    ]],
    ['AI & Data', [
      ' ai', 'ai ', 'artificial intelligence', 'machine learning', ' ml ',
      'data science', 'data', 'analytics', 'deep learning', 'llm',
      'generative', 'quant', 'research', 'insti', 'predict'
    ]],
    ['Education & Learning', [
      'education', 'learn', 'academy', 'institute', 'school', 'university',
      'college', 'edtech', 'course', 'training', 'tutorial', 'duolingo',
      'udemy', 'coursera', 'teach'
    ]],
    ['Media & Marketing', [
      'media', 'marketing', 'creative', 'studio', 'agency', 'ad ', 'advert',
      'content', 'brand', 'news', 'publish', 'magazine', 'broadcast',
      'production', 'design', 'digital media'
    ]],
    ['Consulting & Advisory', [
      'consult', 'advisory', 'advisor', 'consultancy', 'strategy', 'mckinsey',
      'bain', 'bcg', 'deloitte', 'pwc', 'ey ', 'kpmg', 'accenture'
    ]],
    ['E-commerce & Retail', [
      'commerce', 'retail', 'shop', 'store', 'mart', 'marketplace', 'flipkart',
      'amazon', 'myntra', 'snapdeal', 'ebay', 'cart', 'buy'
    ]],
    ['Healthcare & Pharma', [
      'health', 'med', 'pharma', 'care', 'clinic', 'hospital', 'bio',
      'wellness', 'fitness', 'diagnostic', 'tax2win'
    ]],
    ['HR & Talent', [
      'talent', 'recruit', 'staffing', 'hr ', 'hiring', 'people ops',
      'headhunter', 'jobs', 'career', 'reliable jobs'
    ]],
    ['Gaming & Entertainment', [
      'game', 'gaming', 'esports', 'play', 'sport', 'entertainment',
      'fan', 'stream', 'tournament'
    ]],
    ['Finance & Investment', [
      'finance', 'fund', 'capital', 'ventures', 'venture', 'holdings',
      'private equity', 'asset', 'investment', 'pe firm', 'vc ', 'family office',
      ' angels', 'angel investor', 'index', 'sequoia', 'a16z', 'tiger global'
    ]],
    ['Technology / SaaS', [
      'software', 'saas', 'tech', 'labs', 'technologies', 'platform',
      'systems', 'cloud', 'dev', 'app', 'digital', 'network', 'cyber',
      'security', 'internet', 'it ', 'solution', 'infotech', 'global',
      'ventures', 'capital', 'group', 'inc', 'pvt', 'ltd', 'limited',
      'company', 'corp', 'llc', 'foundation', 'protocol'
    ]]
  ];

  // =========================================================================
  // POSITION_RULES — ported VERBATIM from build_data.py (regex search,
  // lowercased input, first-match-wins). Product rules come FIRST. Patterns are
  // case-sensitive regexes run against the lowercased position string.
  // =========================================================================
  var POSITION_RULES = [
    ['Product', [
      /\bproduct\b/, /\bpm\b/, /\bapm\b/, /\btpm\b/, /gpm\b/,
      /product management/, /product owner/
    ]],
    ['Founder & Executive', [
      /\bfounder\b/, /co-founder/, /cofounder/, /\bceo\b/, /chief exec/,
      /\bcto\b/, /chief tech/, /\bcoo\b/, /chief oper/, /\bcfo\b/,
      /chief fin/, /\bcmo\b/, /chief mark/, /\bpresident\b/,
      /managing director/, /\bmd\b/, /proprietor/, /owner/, /managing partner/,
      /\bpartner\b/
    ]],
    ['Leadership & Management', [
      /vice president/, /\bvp\b/, /head of/, /\bdirector\b/, /general manager/,
      /\bgm\b/, /lead/, /principal/, /manager/, /chief/
    ]],
    ['Engineering & Tech', [
      /engineer/, /developer/, /software/, /programm/, /fullstack/,
      /full stack/, /frontend/, /front-end/, /backend/, /back-end/,
      /devops/, /sre/, /architect/, /tech lead/, /engineering/,
      /coder/, /hack/
    ]],
    ['Data & AI', [
      /data scientist/, /data engineer/, /data analyst/, /machine learning/,
      /\bai\b/, /deep learning/, /research/, /quant/, /ml engineer/
    ]],
    ['Design & UX', [
      /design/, /\bux\b/, /\bui\b/, /product designer/, /creative/
    ]],
    ['Marketing & Growth', [
      /marketing/, /growth/, /\bseo\b/, /content/, /brand/, /social media/,
      /performance/, /campaign/, /communication/, /pr /
    ]],
    ['Sales & BD', [
      /business development/, /\bbd\b/, /sales/, /account/, /partnership/,
      /revenue/, /client/, /deal/, /enterprise/
    ]],
    ['Finance', [
      /finance/, /financial/, /accountant/, /treasury/, /audit/, /tax/,
      /\bfund\b/, /investment/
    ]],
    ['Operations', [
      /operation/, /\bops\b/, /supply/, /logistic/, /project/,
      /procurement/, /administration/
    ]],
    ['HR & People', [
      /\bhr\b/, /human resource/, /talent/, /recruit/, /people/,
      /hiring/, /l&d/, /learning/
    ]],
    ['Trading & Research', [
      /trader/, /trading/, /portfolio/, /analyst/, /quant/,
      /investment/, /advisor/, /wealth/
    ]]
  ];

  // Month abbreviation -> 2-digit month, for "DD Mon YYYY" parsing.
  var MONTHS = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  // Mirrors classify_sector(company): lowercase, strip, pad with spaces, then
  // case-SENSITIVE substring match, first-match-wins. Returns "Other" fallback.
  function classifySector(company) {
    var c = ' ' + String(company == null ? '' : company).toLowerCase().trim() + ' ';
    for (var i = 0; i < SECTOR_RULES.length; i++) {
      var sector = SECTOR_RULES[i][0];
      var keys = SECTOR_RULES[i][1];
      for (var j = 0; j < keys.length; j++) {
        if (c.indexOf(keys[j]) !== -1) {
          return sector;
        }
      }
    }
    return 'Other';
  }

  // Mirrors classify_position(pos): lowercase, then regex search,
  // first-match-wins. Returns "Other" fallback.
  function classifyPosition(pos) {
    var p = String(pos == null ? '' : pos).toLowerCase();
    for (var i = 0; i < POSITION_RULES.length; i++) {
      var cat = POSITION_RULES[i][0];
      var patterns = POSITION_RULES[i][1];
      for (var j = 0; j < patterns.length; j++) {
        if (patterns[j].test(p)) {
          return cat;
        }
      }
    }
    return 'Other';
  }

  // Mirrors parse_date(s): accepts "DD Mon YYYY" (e.g. "17 Jul 2026") or
  // "YYYY-MM-DD" (e.g. "2026-12-31"). Returns "" if unparseable.
  function parseDate(s) {
    if (s == null) return '';
    s = String(s).trim();
    if (!s) return '';

    // "DD Mon YYYY"
    var m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
    if (m) {
      var mon = MONTHS[m[2].toLowerCase()];
      if (mon) {
        var day = m[1].length < 2 ? '0' + m[1] : m[1];
        return m[3] + '-' + mon + '-' + day;
      }
    }

    // "YYYY-MM-DD"
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      var mm = m[2].length < 2 ? '0' + m[2] : m[2];
      var dd = m[3].length < 2 ? '0' + m[3] : m[3];
      return m[1] + '-' + mm + '-' + dd;
    }

    return '';
  }

  // Find the column index whose trimmed header cell equals `name` (-1 if absent).
  function findCol(header, name) {
    for (var i = 0; i < header.length; i++) {
      var cell = header[i] == null ? '' : String(header[i]);
      if (cell.trim() === name) {
        return i;
      }
    }
    return -1;
  }

  // Read+trim a cell by index; '' when missing.
  function getField(row, idx) {
    if (idx < 0 || !row || idx >= row.length) return '';
    var v = row[idx];
    return v == null ? '' : String(v).trim();
  }

  // Return a NEW object whose keys are the keys of `counts` reordered by
  // frequency descending. Stable sort preserves first-appearance order on ties
  // (mirrors Python's collections.Counter.most_common()).
  function sortByFreq(counts) {
    var keys = Object.keys(counts);
    keys.sort(function (a, b) { return counts[b] - counts[a]; });
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = counts[keys[i]];
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // parse(text)
  // -------------------------------------------------------------------------
  function parse(text) {
    if (typeof text !== 'string') {
      throw new Error('ConnectionsParser.parse: expected a CSV string');
    }
    if (typeof global.Papa === 'undefined') {
      throw new Error('ConnectionsParser.parse: PapaParse (global "Papa") is not loaded');
    }

    var parsed = global.Papa.parse(text, { skipEmptyLines: 'greedy' });
    var data = parsed.data || [];

    // Detect the header row: first row whose joined cells (lowercased) contain
    // "first name". Do NOT hard-code a row offset — the CSV has a Notes preamble.
    var headerIdx = -1;
    for (var i = 0; i < data.length; i++) {
      var candidate = data[i] || [];
      if (candidate.join(' ').toLowerCase().indexOf('first name') !== -1) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      throw new Error('ConnectionsParser.parse: no valid header row found (expected a row containing "First Name")');
    }

    // Map columns by header NAME (tolerant of reordering).
    var header = data[headerIdx];
    var iFirst = findCol(header, 'First Name');
    var iLast = findCol(header, 'Last Name');
    var iUrl = findCol(header, 'URL');
    var iEmail = findCol(header, 'Email Address');
    var iCompany = findCol(header, 'Company');
    var iPosition = findCol(header, 'Position');
    var iConnected = findCol(header, 'Connected On');

    var people = [];
    var id = 0; // 0-based index over VALID people
    for (var r = headerIdx + 1; r < data.length; r++) {
      var drow = data[r] || [];
      var first = getField(drow, iFirst);
      var last = getField(drow, iLast);
      var url = getField(drow, iUrl);
      var email = getField(drow, iEmail);
      var company = getField(drow, iCompany);
      var position = getField(drow, iPosition);
      var connected = getField(drow, iConnected);

      // Skip rows where first, last, company, AND position are all empty.
      if (!first && !last && !company && !position) {
        continue;
      }

      var name = (first + ' ' + last).trim();
      company = company || 'Unknown';
      position = position || 'Unknown';

      people.push({
        id: id,
        name: name,
        firstName: first,
        lastName: last,
        url: url,
        email: email,
        company: company,
        position: position,
        sector: classifySector(company),
        category: classifyPosition(position),
        connected: parseDate(connected)
      });
      id++;
    }

    // Summary stats (sectors + categories inserted in frequency-descending order).
    var sectorCounts = {};
    var categoryCounts = {};
    var companyCounts = {};
    var positionCounts = {};
    for (var p = 0; p < people.length; p++) {
      var person = people[p];
      sectorCounts[person.sector] = (sectorCounts[person.sector] || 0) + 1;
      categoryCounts[person.category] = (categoryCounts[person.category] || 0) + 1;
      companyCounts[person.company] = (companyCounts[person.company] || 0) + 1;
      positionCounts[person.position] = (positionCounts[person.position] || 0) + 1;
    }

    var summary = {
      total: people.length,
      sectors: sortByFreq(sectorCounts),
      categories: sortByFreq(categoryCounts),
      companyCount: Object.keys(companyCounts).length,
      positionCount: Object.keys(positionCounts).length
    };

    return { connections: people, summary: summary };
  }

  // -------------------------------------------------------------------------
  // SAMPLE_CSV — a small (~30 row) realistic LinkedIn Connections.csv with the
  // Notes preamble + header row. All names/companies/emails are FAKE demo data.
  // -------------------------------------------------------------------------
  var SAMPLE_CSV = [
    'Notes,"Connections are the people you have connected with on LinkedIn. You can export this list to keep a copy of your data.",',
    '"You can learn more about how LinkedIn uses your data by reviewing the LinkedIn Privacy Policy.",',
    '',
    'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
    'Aarav,Sharma,https://www.linkedin.com/in/aarav-sharma-demo,aarav.demo@example.com,Bybit,Product Manager,17 Jul 2026',
    'Bhavna,Patel,https://www.linkedin.com/in/bhavna-patel-demo,bhavna.demo@example.com,Binance,Software Engineer,2 Jan 2025',
    'Chetan,Mehta,https://www.linkedin.com/in/chetan-mehta-demo,chetan.demo@example.com,Polygon,Founder,2024-05-10',
    'Deepak,Rao,https://www.linkedin.com/in/deepak-rao-demo,deepak.demo@example.com,HDFC Bank,Trader,15 Mar 2026',
    'Esha,Gupta,https://www.linkedin.com/in/esha-gupta-demo,esha.demo@example.com,Zerodha,VP of Marketing,20 Dec 2025',
    'Farhan,Khan,https://www.linkedin.com/in/farhan-khan-demo,farhan.demo@example.com,Razorpay,Data Scientist,5 Feb 2026',
    'Geeta,Nair,https://www.linkedin.com/in/geeta-nair-demo,geeta.demo@example.com,PhonePe,APM,10 Aug 2024',
    'Harish,Iyer,https://www.linkedin.com/in/harish-iyer-demo,harish.demo@example.com,Paytm,CEO,1 Nov 2025',
    'Isha,Joshi,https://www.linkedin.com/in/isha-joshi-demo,isha.demo@example.com,DataDream AI,ML Engineer,25 Sep 2026',
    'Jay,Kapoor,https://www.linkedin.com/in/jay-kapoor-demo,jay.demo@example.com,Acme Technologies,Sales Lead,8 Jun 2025',
    'Kavya,Reddy,https://www.linkedin.com/in/kavya-reddy-demo,kavya.demo@example.com,CloudSoft Labs,Designer,30 Oct 2024',
    'Lalit,Verma,https://www.linkedin.com/in/lalit-verma-demo,lalit.demo@example.com,BrandWave Agency,Growth Marketer,12 Apr 2026',
    'Meera,Shetty,https://www.linkedin.com/in/meera-shetty-demo,meera.demo@example.com,McKinsey & Co,Engagement Manager,3 Jul 2025',
    'Nikhil,Jain,https://www.linkedin.com/in/nikhil-jain-demo,nikhil.demo@example.com,ShopMart,Operations Manager,18 Jan 2026',
    'Omar,Sheikh,https://www.linkedin.com/in/omar-sheikh-demo,omar.demo@example.com,Flipkart,Category Manager,22 May 2025',
    'Priya,Nambiar,https://www.linkedin.com/in/priya-nambiar-demo,priya.demo@example.com,Stealth Startup,Founder,7 Sep 2026',
    'Qasim,Ali,https://www.linkedin.com/in/qasim-ali-demo,qasim.demo@example.com,Freelance,Consultant,14 Nov 2024',
    'Rohan,Das,https://www.linkedin.com/in/rohan-das-demo,rohan.demo@example.com,Solana Labs,Protocol Engineer,9 Mar 2025',
    'Sara,Pillai,https://www.linkedin.com/in/sara-pillai-demo,sara.demo@example.com,Coinbase Wallet,PM,28 Feb 2026',
    'Tarun,Malhotra,https://www.linkedin.com/in/tarun-malhotra-demo,tarun.demo@example.com,ICICI Securities,Analyst,4 Jul 2024',
    'Uma,Krishnan,https://www.linkedin.com/in/uma-krishnan-demo,uma.demo@example.com,EduTech Academy,Head of Content,19 Oct 2025',
    'Vivek,Bose,https://www.linkedin.com/in/vivek-bose-demo,vivek.demo@example.com,MediCare Clinics,Doctor,11 Aug 2025',
    'Waseem,Ahmed,https://www.linkedin.com/in/waseem-ahmed-demo,waseem.demo@example.com,GameVerse,Game Designer,6 Dec 2025',
    'Xavier,D Costa,https://www.linkedin.com/in/xavier-dcosta-demo,xavier.demo@example.com,Quant Research Labs,Quant,16 May 2026',
    'Yamini,Deshpande,https://www.linkedin.com/in/yamini-deshpande-demo,yamini.demo@example.com,Sequoia Capital,Investment Analyst,21 Sep 2024',
    'Zara,Begum,https://www.linkedin.com/in/zara-begum-demo,zara.demo@example.com,BitGet,Blockchain Developer,2 Apr 2026',
    'Arjun,Menon,https://www.linkedin.com/in/arjun-menon-demo,arjun.demo@example.com,Groww,Backend Engineer,13 Jun 2025',
    'Ananya,Iyer,https://www.linkedin.com/in/ananya-iyer-demo,ananya.demo@example.com,OpenAI,Research Scientist,27 Nov 2025',
    'Kabir,Saxena,https://www.linkedin.com/in/kabir-saxena-demo,kabir.demo@example.com,Polygon Labs,Developer Advocate,8 Oct 2024',
    'Leila,Fernandes,https://www.linkedin.com/in/leila-fernandes-demo,leila.demo@example.com,WazirX,Compliance Lead,23 Feb 2026',
    ''
  ].join('\n');

  // -------------------------------------------------------------------------
  // Public namespace
  // -------------------------------------------------------------------------
  global.ConnectionsParser = {
    parse: parse,
    SAMPLE_CSV: SAMPLE_CSV
  };
})(typeof window !== 'undefined' ? window : this);
