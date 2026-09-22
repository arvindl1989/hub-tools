"""The KONE public site estate, classified by Area and frontline.

Kept here rather than pasted into the tool each time so that auditing a region
is one click. It is the list as supplied by Digital Marketing; when a site is
added, retired or moves frontline, this is the one place to change.

Several entries share a host and differ only by language path — www.kone.bg/en/
and www.kone.bg/bg/ — which is why the path is part of the entry and not
discarded: each language is audited, reported and brand-inferred separately
while the host's sitemap is still read only once.
"""
from __future__ import annotations

# (country, language, domain, area, frontline)
SITES: list = [
    ("Corporate",              "English",    "www.kone.com/en/",     "Global", "Global"),
    ("Corporate",              "Finnish",    "www.kone.com/fi/",     "Global", "Global"),
    ("Egypt",                  "English",    "www.kone.eg/en/",      "APM",    "KMTA"),
    ("Kenya",                  "Default",    "www.kone.co.ke",       "APM",    "KMTA"),
    ("Morocco",                "Default",    "www.kone.ma",          "APM",    "KMTA"),
    ("South Africa",           "Default",    "www.kone.co.za",       "APM",    "KMTA"),
    ("Tunisia",                "Default",    "www.kone.tn",          "APM",    "KMTA"),
    ("Uganda",                 "Default",    "www.kone.ug",          "APM",    "KMTA"),
    ("United Arab Emirates",   "Default",    "www.kone.ae",          "APM",    "KMTA"),
    ("Austria",                "Default",    "www.kone.at",          "EU",     "DACH"),
    ("Bosnia and Herzegovina", "Default",    "www.kone.ba",          "EU",     "EEM"),
    ("Belgium",                "French",     "www.kone.be/fr/",      "EU",     "FBL"),
    ("Belgium",                "Dutch",      "www.kone.be/nl/",      "EU",     "FBL"),
    ("Bulgaria",               "English",    "www.kone.bg/en/",      "EU",     "EEM"),
    ("Bulgaria",               "Bulgarian",  "www.kone.bg/bg/",      "EU",     "EEM"),
    ("Bahrain",                "Default",    "www.kone.bh",          "APM",    "KMTA"),
    ("Canada",                 "English",    "www.kone.ca/en/",      "AME",    "USCA"),
    ("Canada",                 "French",     "www.kone.ca/fr/",      "AME",    "USCA"),
    ("Switzerland",            "German",     "www.kone.ch/de/",      "EU",     "DACH"),
    ("Switzerland",            "French",     "www.kone.ch/fr/",      "EU",     "DACH"),
    ("China",                  "English",    "www.kone.cn/en/",      "GCN",    "GCN"),
    ("China",                  "Chinese",    "www.kone.cn/zh/",      "GCN",    "GCN"),
    ("Indonesia",              "Indonesian", "www.kone.co.id/id/",   "APM",    "KSEA"),
    ("Indonesia",              "English",    "www.kone.co.id/en/",   "APM",    "KSEA"),
    ("Israel",                 "Default",    "www.kone.co.il",       "EU",     "EEM"),
    ("New Zealand",            "Default",    "www.kone.co.nz",       "APM",    "KANZ"),
    ("Thailand",               "Thai",       "www.kone.co.th/th/",   "APM",    "KSEA"),
    ("Thailand",               "English",    "www.kone.co.th/en/",   "APM",    "KSEA"),
    ("United Kingdom",         "Default",    "www.kone.co.uk",       "EU",     "GIN"),
    ("Australia",              "Default",    "www.kone.com.au",      "APM",    "KANZ"),
    ("Cyprus",                 "Greek",      "www.kone.com.cy/el/",  "EU",     "EEM"),
    ("Cyprus",                 "English",    "www.kone.com.cy/en/",  "EU",     "EEM"),
    ("Kuwait",                 "Default",    "www.kone.com.kw",      "APM",    "KMTA"),
    ("Romania",                "Romanian",   "www.kone.com.ro/ro/",  "EU",     "EEM"),
    ("Romania",                "English",    "www.kone.com.ro/en/",  "EU",     "EEM"),
    ("Türkiye",                "Default",    "www.kone.com.tr",      "APM",    "KMTA"),
    ("Czech Republic",         "Default",    "www.kone.cz",          "EU",     "EEM"),
    ("Germany",                "Default",    "www.kone.de",          "EU",     "DACH"),
    ("Denmark",                "Default",    "www.kone.dk",          "EU",     "NORD"),
    ("Estonia",                "Default",    "www.kone.ee",          "EU",     "NORD"),
    ("Spain",                  "Default",    "www.kone.es",          "EU",     "ITIB"),
    ("Finland",                "Default",    "www.kone.fi",          "EU",     "NORD"),
    ("France",                 "Default",    "www.kone.fr",          "EU",     "FBL"),
    ("Greece",                 "Greek",      "www.kone.gr/el/",      "EU",     "EEM"),
    ("Greece",                 "English",    "www.kone.gr/en/",      "EU",     "EEM"),
    ("Hong Kong",              "Chinese",    "www.kone.hk/zh/",      "GCN",    "HK"),
    ("Hong Kong",              "English",    "www.kone.hk/en/",      "GCN",    "HK"),
    ("Croatia",                "Croatian",   "www.kone.hr/hr/",      "EU",     "EEM"),
    ("Croatia",                "English",    "www.kone.hr/en/",      "EU",     "EEM"),
    ("Hungary",                "Default",    "www.kone.hu",          "EU",     "EEM"),
    ("Ireland",                "Default",    "www.kone.ie",          "EU",     "GIN"),
    ("India",                  "Default",    "www.kone.in",          "APM",    "KEI"),
    ("Iceland",                "Default",    "www.kone.is",          "EU",     "NORD"),
    ("Italy",                  "Default",    "www.kone.it",          "EU",     "ITIB"),
    ("Kazakhstan",             "Default",    "www.kone.kz",          "APM",    "KMTA"),
    ("Lithuania",              "Default",    "www.kone.lt",          "EU",     "NORD"),
    ("Latvia",                 "Default",    "www.kone.lv",          "EU",     "NORD"),
    ("Montenegro",             "Default",    "www.kone.me",          "EU",     "EEM"),
    ("Macedonia",              "Default",    "www.kone.mk",          "EU",     "EEM"),
    ("Mexico",                 "Default",    "www.kone.mx",          "AME",    "USMX"),
    ("Malaysia",               "Default",    "www.kone.my",          "APM",    "KSEA"),
    ("Netherlands",            "Default",    "www.kone.nl",          "EU",     "GIN"),
    ("Norway",                 "Default",    "www.kone.no",          "EU",     "NORD"),
    ("Oman",                   "Default",    "www.kone.om",          "APM",    "KMTA"),
    ("Philippines",            "Default",    "www.kone.ph",          "APM",    "KSEA"),
    ("Poland",                 "Default",    "www.kone.pl",          "EU",     "EEM"),
    ("Portugal",               "Default",    "www.kone.pt",          "EU",     "ITIB"),
    ("Qatar",                  "Default",    "www.kone.qa",          "APM",    "KMTA"),
    ("Serbia",                 "Serbian",    "www.kone.rs/sr/",      "EU",     "EEM"),
    ("Serbia",                 "English",    "www.kone.rs/en/",      "EU",     "EEM"),
    ("Saudi Arabia",           "Default",    "www.kone.sa",          "APM",    "KMTA"),
    ("Sweden",                 "Default",    "www.kone.se",          "EU",     "NORD"),
    ("Singapore",              "Default",    "www.kone.sg",          "APM",    "KSEA"),
    ("Slovenia",               "Default",    "www.kone.si",          "EU",     "EEM"),
    ("Slovakia",               "Default",    "www.kone.sk",          "EU",     "EEM"),
    ("Taiwan",                 "Default",    "www.kone.tw",          "GCN",    "TW"),
    ("Ukraine",                "Default",    "www.kone.ua",          "EU",     "EEM"),
    ("United States",          "Default",    "www.kone.us",          "AME",    "USCA"),
    ("Vietnam",                "Vietnamese", "www.kone.vn/vi/",      "APM",    "KSEA"),
    ("Vietnam",                "English",    "www.kone.vn/en/",      "APM",    "KSEA"),
]


def as_records() -> list:
    return [
        {"country": country, "language": language, "domain": domain,
         "area": area, "frontline": frontline}
        for country, language, domain, area, frontline in SITES
    ]


def _ordered(values: list) -> list:
    """Distinct values, most sites first, so the busiest group is the leftmost
    button rather than whichever happens to sort first."""
    counts: dict = {}
    for v in values:
        counts[v] = counts.get(v, 0) + 1
    return [{"name": name, "count": n}
            for name, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]


def groups() -> dict:
    records = as_records()
    return {
        "total": len(records),
        "areas": _ordered([r["area"] for r in records]),
        "frontlines": _ordered([r["frontline"] for r in records]),
    }
