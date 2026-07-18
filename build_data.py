#!/usr/bin/env python3
"""Parse Connections.csv -> data.js with derived sector + position category."""
import csv, json, re, datetime

SRC = "Connections.csv"
OUT = "data.js"

# ---------------------------------------------------------------------------
# Sector classification (priority order — first match wins, specific first).
# Each rule: (sector_name, [lowercase keyword fragments]) matched against the
# lowercased company name.
# ---------------------------------------------------------------------------
SECTOR_RULES = [
    ("Freelance / Stealth", [
        "stealth", "freelance", "freelancer", "self-employed", "self employed",
        "independent", "confidential", "own venture", "solo",
    ]),
    ("Crypto & Web3", [
        "crypto", "blockchain", "web3", "defi", "nft", "token", "dao",
        "binance", "bybit", "bitget", "bitbns", "bitfinex", "bitunix",
        "coindcx", "coinstore", "kucoin", "okx", "kraken", "polygon",
        "ethereum", "solana", "chain", "ledger", "metamask", "wallet",
        "dex", "coin", "bit", "onramp", "ramp", "minance", "mint", "satosh",
        "threeway studio", "launchpad", "coinlist", "wazir", "bingx",
        "fireblocks", "gate", "cipherbc", "htx", "mexc", "hex trust",
        "bkex", "phemex", "straitsx", "circle", "gnosis", "hashlock",
        "blockseblock", "blocsys", "liminal", "hypernative", "nillion",
        "logx", "m0", "staynex", "immunebyte", "avalanche", "cosmos",
        "polkadot", "cardano", "arbitrum", "optimism", "tether", "ripple",
        "litecoin", "uniswap", "sushiswap", "aave", "compound", "metamask",
        "trust wallet", "phantom", "anchorage", "falconx", "galaxy",
        "smart contract", "etherium", "gate.io", "gateio", "block", "hash",
    ]),
    ("Banking & Broking", [
        "bank", "kotak", "hdfc", "icici", "sbi", "axis", "broker", "broking",
        "brokage", "securities", "angel one", "angelone", "upstox", "zerodha",
        "groww", "trading", "trade", "stock", "neo", "exchange", "nse", "bse",
        "demat", "invest", "portfolio", "jpmorgan", "chase", "goldman",
        "morgan stanley", "hsbc", "citibank", "wells fargo", "barclays",
        "ngân hàng",
    ]),
    ("Banking & Broking", [
        "bank", "kotak", "hdfc", "icici", "sbi", "axis", "broker", "broking",
        "brokage", "securities", "angel one", "angelone", "upstox", "zerodha",
        "groww", "trading", "trade", "stock", "neo", "exchange", "nse", "bse",
        "demat", "invest", "portfolio",
    ]),
    ("Fintech & Payments", [
        "pay", "fintech", "razorpay", "phonepe", "paytm", "payu", "cashfree",
        "pinelabs", "pine labs", "stripe", "upi", "lending", "lend", "loan",
        "insurance", "insur", "money", "wallet", "bharatpe", "cred", "slice",
        "fi money", " Jupiter", "wealth",
    ]),
    ("AI & Data", [
        " ai", "ai ", "artificial intelligence", "machine learning", " ml ",
        "data science", "data", "analytics", "deep learning", "llm",
        "generative", "quant", "research", "insti", "predict",
    ]),
    ("Education & Learning", [
        "education", "learn", "academy", "institute", "school", "university",
        "college", "edtech", "course", "training", "tutorial", "duolingo",
        "udemy", "coursera", "teach",
    ]),
    ("Media & Marketing", [
        "media", "marketing", "creative", "studio", "agency", "ad ", "advert",
        "content", "brand", "news", "publish", "magazine", "broadcast",
        "production", "design", "digital media",
    ]),
    ("Consulting & Advisory", [
        "consult", "advisory", "advisor", "consultancy", "strategy", "mckinsey",
        "bain", "bcg", "deloitte", "pwc", "ey ", "kpmg", "accenture",
    ]),
    ("E-commerce & Retail", [
        "commerce", "retail", "shop", "store", "mart", "marketplace", "flipkart",
        "amazon", "myntra", "snapdeal", "ebay", "cart", "buy",
    ]),
    ("Healthcare & Pharma", [
        "health", "med", "pharma", "care", "clinic", "hospital", "bio",
        "wellness", "fitness", "diagnostic", "tax2win",
    ]),
    ("HR & Talent", [
        "talent", "recruit", "staffing", "hr ", "hiring", "people ops",
        "headhunter", "jobs", "career", "reliable jobs",
    ]),
    ("Gaming & Entertainment", [
        "game", "gaming", "esports", "play", "sport", "entertainment",
        "fan", "stream", "tournament",
    ]),
    ("Finance & Investment", [
        "finance", "fund", "capital", "ventures", "venture", "holdings",
        "private equity", "asset", "investment", "pe firm", "vc ", "family office",
        " angels", "angel investor", "index", "sequoia", "a16z", "tiger global",
    ]),
    ("Technology / SaaS", [
        "software", "saas", "tech", "labs", "technologies", "platform",
        "systems", "cloud", "dev", "app", "digital", "network", "cyber",
        "security", "internet", "it ", "solution", "infotech", "global",
        "ventures", "capital", "group", "inc", "pvt", "ltd", "limited",
        "company", "corp", "llc", "foundation", "protocol",
    ]),
]


def classify_sector(company: str) -> str:
    c = " " + company.lower().strip() + " "
    for sector, keys in SECTOR_RULES:
        for k in keys:
            if k in c:
                return sector
    return "Other"


# ---------------------------------------------------------------------------
# Position category classification.
# ---------------------------------------------------------------------------
POSITION_RULES = [
    # Product first: any title mentioning product / common PM abbreviations
    # rolls up here, so PM/APM/Product Lead/TPM/Head of Product/CPO all group together.
    ("Product", [
        r"\bproduct\b", r"\bpm\b", r"\bapm\b", r"\btpm\b", r"gpm\b",
        r"product management", r"product owner",
    ]),
    ("Founder & Executive", [
        r"\bfounder\b", r"co-founder", r"cofounder", r"\bceo\b", r"chief exec",
        r"\bcto\b", r"chief tech", r"\bcoo\b", r"chief oper", r"\bcfo\b",
        r"chief fin", r"\bcmo\b", r"chief mark", r"\bpresident\b",
        r"managing director", r"\bmd\b", r"proprietor", r"owner", r"managing partner",
        r"\bpartner\b",
    ]),
    ("Leadership & Management", [
        r"vice president", r"\bvp\b", r"head of", r"\bdirector\b", r"general manager",
        r"\bgm\b", r"lead", r"principal", r"manager", r"chief",
    ]),
    ("Engineering & Tech", [
        r"engineer", r"developer", r"software", r"programm", r"fullstack",
        r"full stack", r"frontend", r"front-end", r"backend", r"back-end",
        r"devops", r"sre", r"architect", r"tech lead", r"engineering",
        r"coder", r"hack",
    ]),
    ("Data & AI", [
        r"data scientist", r"data engineer", r"data analyst", r"machine learning",
        r"\bai\b", r"deep learning", r"research", r"quant", r"ml engineer",
    ]),
    ("Design & UX", [
        r"design", r"\bux\b", r"\bui\b", r"product designer", r"creative",
    ]),
    ("Marketing & Growth", [
        r"marketing", r"growth", r"\bseo\b", r"content", r"brand", r"social media",
        r"performance", r"campaign", r"communication", r"pr ",
    ]),
    ("Sales & BD", [
        r"business development", r"\bbd\b", r"sales", r"account", r"partnership",
        r"revenue", r"client", r"deal", r"enterprise",
    ]),
    ("Finance", [
        r"finance", r"financial", r"accountant", r"treasury", r"audit", r"tax",
        r"\bfund\b", r"investment",
    ]),
    ("Operations", [
        r"operation", r"\bops\b", r"supply", r"logistic", r"project",
        r"procurement", r"administration",
    ]),
    ("HR & People", [
        r"\bhr\b", r"human resource", r"talent", r"recruit", r"people",
        r"hiring", r"l&d", r"learning",
    ]),
    ("Trading & Research", [
        r"trader", r"trading", r"portfolio", r"analyst", r"quant",
        r"investment", r"advisor", r"wealth",
    ]),
]


def classify_position(pos: str) -> str:
    p = pos.lower()
    for cat, patterns in POSITION_RULES:
        for pat in patterns:
            if re.search(pat, p):
                return cat
    return "Other"


def parse_date(s):
    s = s.strip()
    for fmt in ("%d %b %Y", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


def main():
    with open(SRC, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))[4:]  # skip notes + blank + header

    people = []
    for i, r in enumerate(rows):
        if len(r) < 7:
            continue
        first, last, url, email, company, position, connected = [x.strip() for x in r[:7]]
        if not (first or last or company or position):
            continue
        name = f"{first} {last}".strip()
        company = company or "Unknown"
        position = position or "Unknown"
        people.append({
            "id": i,
            "name": name,
            "firstName": first,
            "lastName": last,
            "url": url,
            "email": email,
            "company": company,
            "position": position,
            "sector": classify_sector(company),
            "category": classify_position(position),
            "connected": parse_date(connected),
        })

    # summary stats
    from collections import Counter
    sectors = Counter(p["sector"] for p in people)
    categories = Counter(p["category"] for p in people)
    companies = Counter(p["company"] for p in people)
    positions = Counter(p["position"] for p in people)

    summary = {
        "total": len(people),
        "sectors": dict(sectors.most_common()),
        "categories": dict(categories.most_common()),
        "companyCount": len(companies),
        "positionCount": len(positions),
    }

    js = "// Auto-generated from Connections.csv by build_data.py — do not edit by hand.\n"
    js += "window.CONNECTIONS = " + json.dumps(people, ensure_ascii=False) + ";\n"
    js += "window.SUMMARY = " + json.dumps(summary, ensure_ascii=False) + ";\n"

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)

    print(f"Wrote {OUT}: {len(people)} people")
    print("Sector distribution:")
    for s, n in sectors.most_common():
        print(f"  {n:4d}  {s}")
    print("\nPosition-category distribution:")
    for c, n in categories.most_common():
        print(f"  {n:4d}  {c}")


if __name__ == "__main__":
    main()
