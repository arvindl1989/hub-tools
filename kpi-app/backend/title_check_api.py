"""Page title verifier.

Reads a sitemap (or a pasted list of URLs), fetches each page and reports the
title that is actually in the HTML, flagging the ones where the site name has
been appended twice.

The fetching has to happen here rather than in the browser: the pages being
checked are on other origins and send no CORS headers, so a fetch() from the
tool's own page is blocked before it ever sees the markup. This is a plain
proxy — it reads the title and the page's TCM ID and nothing else.

The TCM ID comes out of the same response. The TCM ID Extractor gets it by
having someone open every page and click a bookmarklet, because it runs in the
browser; reading the markup here means it costs nothing on top of the fetch
already being made for the title.
"""
from __future__ import annotations

import gzip
import html as html_mod
import io
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urldefrag, urljoin, urlparse
from typing import Optional

import httpx
import xlsxwriter
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/title-check", tags=["title-check"])

# A browser UA: some sites answer a bare client with a consent wall or a 403,
# and the title of that page is not the title being checked.
_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
# A user-agent string on its own is not a browser. A CDN's bot protection looks
# at the whole request, and one carrying a Chrome UA but none of the headers
# Chrome always sends is exactly what it is built to reject — which is how real,
# working pages came back 403. Accept-Encoding is deliberately absent: httpx
# sets it from the decoders actually installed, and overriding it to advertise
# brotli we cannot decode would break every response.
_HEADERS = {
    "User-Agent": _UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Sec-CH-UA": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
}

_CONNECT_TIMEOUT = 8.0
_READ_TIMEOUT = 15.0
# Six rather than ten: a site's CDN sees a few hundred requests from one server
# address in a burst, and rate-limiting or a bot challenge comes back as 403 or
# 429 on a run that worked the first time. Slightly slower, far fewer false
# failures.
_WORKERS = 6
_ATTEMPTS = 2
_MAX_RETRY_WAIT = 5.0
# Statuses worth trying again — a timeout, a throttle, or a gateway hiccup says
# nothing about the page, unlike a 404.
# 403 is included: bot protection often challenges the first request and
# lets the second through now that the session cookie is kept.
_RETRY_STATUS = {403, 408, 425, 429, 500, 502, 503, 504}
# The title lives in <head>, so the rest of the document is never read. Pages
# that somehow have no </head> stop at this cap instead of streaming megabytes.
_MAX_HTML_BYTES = 250_000
# Whole-page reads for the audit and form checks. Larger, because an H1 or a
# form can sit well down a long page, but still bounded.
_MAX_BODY_BYTES = 800_000
_MAX_SITEMAP_BYTES = 30_000_000
_MAX_URLS = 50_000
_MAX_SITEMAP_DEPTH = 3
_MAX_BATCH = 50

SINGLE, DOUBLE, MISSING, FAILED = "Single Title", "Double Title", "Missing Title", "Unable to Verify"
PARTIAL = "Partial Duplicate"

# The separators a CMS puts between the page name and the site name.
_SEPARATORS = "-|–—"


# ── Title classification ─────────────────────────────────────────────────────

def _normalise(text: str) -> str:
    """Decode entities and flatten whitespace, so a title split across lines in
    the source compares the same as one written inline."""
    return re.sub(r"\s+", " ", html_mod.unescape(text)).strip()


# Word characters in any alphabet — the brands this runs against include
# "KONE Sverige" and "KONE Česká republika".
_WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)


def _words(text: str) -> list:
    return [w.lower() for w in _WORD_RE.findall(text or "")]


def peel_trailing_brand(title: str, brand: str) -> tuple:
    """(times the brand repeats at the end, what is left in front of it).

    Stripping one trailing "<separator> <brand>" at a time rather than splitting
    the whole title on separators, because a brand may itself contain one —
    "KONE – Dedicated to People Flow" would be torn in half by a split and then
    never match.
    """
    brand = brand.strip()
    rest = title.strip()
    if not brand:
        return 0, rest
    pattern = re.compile(r"(?:[" + _SEPARATORS + r"]\s*)?" + re.escape(brand) + r"\s*$", re.I)
    seen = 0
    while True:
        m = pattern.search(rest)
        if not m:
            return seen, rest
        rest = rest[:m.start()].rstrip()
        seen += 1
        if not rest:
            return seen, rest


def count_trailing_brand(title: str, brand: str) -> int:
    return peel_trailing_brand(title, brand)[0]


# Titles are built by joining parts with a pipe, a dash, or an en/em dash. A
# bare hyphen only splits when it has whitespace around it, so a hyphenated
# word like "e-handel" stays in one piece.
_SEGMENT_SPLIT_RE = re.compile(r"\s*[|\u2013\u2014]\s*|\s+-\s+")


def _title_segments(text: str) -> list:
    return [part.strip() for part in _SEGMENT_SPLIT_RE.split(text or "") if part.strip()]


def classify(title: Optional[str], brand: str) -> str:
    if title is None:
        return MISSING
    title = _normalise(title)
    if not title:
        return MISSING
    if not brand.strip():
        return SINGLE
    repeats, rest = peel_trailing_brand(title, brand)
    if repeats >= 2:
        return DOUBLE
    # A brand that repeats without sitting flush at the end — "KONE Australia |
    # Lifts | KONE Australia" — is the same duplication and is still worth
    # flagging.
    if len(re.findall(re.escape(brand.strip()), title, re.I)) >= 2:
        return DOUBLE
    # "KONE - KONE Sverige", and equally "Handbok för hissplanering | KONE -
    # KONE Sverige": the brand appears once, so this is not a double title, but
    # the segment sitting immediately in front of it adds nothing the brand
    # does not already say, and the brand word reads twice.
    #
    # Only that last segment is tested, not everything before the brand. An
    # earlier version required the whole remainder to be brand words, which
    # meant a title with real content in front of the redundant part — exactly
    # the case above — was passed as a normal title.
    if repeats == 1 and rest:
        tail = _title_segments(rest)[-1] if _title_segments(rest) else ""
        tail_words = _words(tail)
        if tail_words and set(tail_words) <= set(_words(brand)):
            return PARTIAL
    return SINGLE


# ── Fetching ─────────────────────────────────────────────────────────────────

def _decode(raw: bytes, content_type: str) -> str:
    """Decode using the charset the response declares, then the one the markup
    declares, and only then fall back — a mis-decoded page yields a title with
    replacement characters in it, which reads as a content error rather than an
    encoding one."""
    m = re.search(r"charset=([\w\-]+)", content_type or "", re.I)
    if not m:
        m = re.search(rb"<meta[^>]+charset=[\"']?([\w\-]+)", raw[:4096], re.I)
        enc = m.group(1).decode("ascii", "ignore") if m else None
    else:
        enc = m.group(1)
    for candidate in (enc, "utf-8", "windows-1252"):
        if not candidate:
            continue
        try:
            return raw.decode(candidate)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", "replace")


_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)

# Same signal the TCM ID Extractor's bookmarklet reads: <meta name="pagetcmid"
# content="tcm:...">. Both attribute orders, and `value` as well as `content`,
# because that is what the bookmarklet accepts — the two tools must not
# disagree about whether a page has an ID.
_TCM_RES = (
    re.compile(r"""<meta[^>]*?\bname\s*=\s*["']?pagetcmid["']?[^>]*?\b(?:content|value)\s*=\s*["']([^"']+)["']""", re.I),
    re.compile(r"""<meta[^>]*?\b(?:content|value)\s*=\s*["']([^"']+)["'][^>]*?\bname\s*=\s*["']?pagetcmid["']?""", re.I),
)


def extract_tcm_id(document: str) -> Optional[str]:
    """The page's TCM ID, or None when the meta tag is absent — which is what
    the TCM tool reports as an unpublished page."""
    for pattern in _TCM_RES:
        m = pattern.search(document)
        if m and m.group(1).strip():
            return html_mod.unescape(m.group(1).strip())
    return None


# Opening the item straight in the CMS is the point of having the ID: from the
# results you go to the page, edit and exit. The ?tcm= parameter is the item
# type, which is the ID's own last segment (64 for a page), so it is read off
# the ID rather than hardcoded — a non-page item would otherwise open the wrong
# view.
_CMS_ITEM_URL = "https://web-cms.kone.com/WebUI/item.aspx?tcm={type_id}#id={tcm_id}"
_TCM_ID_SHAPE = re.compile(r"^tcm:\d+-\d+(?:-(\d+))?$", re.I)


def cms_url(tcm_id: Optional[str]) -> str:
    """The CMS edit URL for an ID, or "" when it is not a TCM ID we recognise —
    better no link than one that lands on an error page."""
    tcm_id = (tcm_id or "").strip()
    if not tcm_id:
        return ""
    m = _TCM_ID_SHAPE.match(tcm_id)
    if not m:
        return ""
    return _CMS_ITEM_URL.format(type_id=m.group(1) or "64", tcm_id=tcm_id)


def extract_title(document: str) -> Optional[str]:
    """The <title> from <head>.

    Scoped to the head because inline SVG icons carry their own <title> elements
    for accessibility; on a page whose real title is missing, the first one in
    the body would otherwise be reported as the page title.
    """
    head = document
    end = re.search(r"</head\s*>", document, re.I)
    if end:
        head = document[:end.start()]
    m = _TITLE_RE.search(head)
    if not m:
        return None
    # Strip any markup that ended up inside the element before normalising.
    return _normalise(re.sub(r"<[^>]+>", "", m.group(1)))


def _retry_after(resp: httpx.Response) -> float:
    """Wait the server asked for, capped — an hour-long Retry-After would stall
    the whole run."""
    raw = (resp.headers.get("retry-after") or "").strip()
    try:
        return min(float(raw), _MAX_RETRY_WAIT) if raw else 1.0
    except ValueError:
        return 1.0


def fetch_title(client: httpx.Client, url: str, want_body: bool = False) -> dict:
    """One page, with one retry for failures that are about the connection
    rather than the page.

    want_body keeps reading past </head>: H1s and forms are in the body, so the
    audit and form checks cannot use the head-only shortcut the title check
    relies on for speed.
    """
    last = {"url": url, "title": "Failed", "tcm_id": None, "ok": False}
    for attempt in range(_ATTEMPTS):
        last = _fetch_once(client, url, want_body)
        if last["ok"] or not last.get("retryable"):
            break
        if attempt + 1 < _ATTEMPTS:
            time.sleep(last.get("wait", 1.0))
    last.pop("retryable", None)
    last.pop("wait", None)
    return last


def _fetch_once(client: httpx.Client, url: str, want_body: bool = False) -> dict:
    try:
        with client.stream("GET", url, headers=_HEADERS, follow_redirects=True) as resp:
            if resp.status_code >= 400:
                return {"url": url, "title": f"HTTP {resp.status_code}", "tcm_id": None, "ok": False,
                        "retryable": resp.status_code in _RETRY_STATUS,
                        "wait": _retry_after(resp) if resp.status_code in (429, 503) else 1.0}
            ctype = resp.headers.get("content-type", "")
            if ctype and "html" not in ctype.lower() and "xml" not in ctype.lower():
                return {"url": url, "title": f"Not an HTML page ({ctype.split(';')[0]})", "tcm_id": None, "ok": False}
            buf = bytearray()
            for chunk in resp.iter_bytes():
                buf.extend(chunk)
                # Stop as soon as the head is complete — reading the rest of the
                # document would multiply the time for every URL in the sitemap.
                cap = _MAX_BODY_BYTES if want_body else _MAX_HTML_BYTES
                if len(buf) >= cap:
                    break
                if not want_body and b"</head" in buf.lower():
                    break
            document = _decode(bytes(buf), ctype)
    except httpx.TimeoutException:
        return {"url": url, "title": "Timed out", "tcm_id": None, "ok": False, "retryable": True, "wait": 1.0}
    except httpx.HTTPError as exc:
        return {"url": url, "title": type(exc).__name__, "tcm_id": None, "ok": False,
                "retryable": True, "wait": 1.0}
    except Exception as exc:                                   # noqa: BLE001
        return {"url": url, "title": str(exc)[:120] or "Failed", "tcm_id": None, "ok": False}
    # Both come out of the one response — the TCM tool needed the page opened
    # by hand and a bookmarklet clicked; here it costs nothing extra.
    return {"url": url, "title": extract_title(document),
            "tcm_id": extract_tcm_id(document), "ok": True,
            "document": document if want_body else ""}


_shared_client: Optional[httpx.Client] = None
_client_lock = threading.Lock()


def _new_client() -> httpx.Client:
    # HTTP/2 when the dependency is there. Bot protection fingerprints the
    # protocol too, and a browser UA arriving over HTTP/1.1 is another tell.
    try:
        return httpx.Client(
            timeout=httpx.Timeout(_READ_TIMEOUT, connect=_CONNECT_TIMEOUT),
            limits=httpx.Limits(max_connections=_WORKERS + 2, max_keepalive_connections=_WORKERS + 2),
            follow_redirects=True, headers=_HEADERS, http2=True,
        )
    except ImportError:
        return httpx.Client(
            timeout=httpx.Timeout(_READ_TIMEOUT, connect=_CONNECT_TIMEOUT),
            limits=httpx.Limits(max_connections=_WORKERS + 2, max_keepalive_connections=_WORKERS + 2),
            follow_redirects=True, headers=_HEADERS,
        )


class _SharedClient:
    """Hands out one long-lived client instead of a fresh one per batch.

    The old code built a client per request batch and closed it, which threw
    away the cookie jar every twelve URLs. Bot protection hands out a clearance
    cookie on first contact and expects it back; discarding it meant every
    batch arrived as a brand-new unidentified visitor and got challenged again.
    Keeping one client also keeps the TLS connections open instead of
    renegotiating constantly.
    """

    def __enter__(self) -> httpx.Client:
        global _shared_client
        with _client_lock:
            if _shared_client is None or _shared_client.is_closed:
                _shared_client = _new_client()
            return _shared_client

    def __exit__(self, *exc) -> None:
        return None          # deliberately kept open between batches


def _client() -> "_SharedClient":
    return _SharedClient()


# ── Sitemaps ─────────────────────────────────────────────────────────────────

_LOC_RE = re.compile(r"<loc>\s*(.*?)\s*</loc>", re.I | re.S)


def _maybe_gunzip(raw: bytes) -> bytes:
    """Sitemaps are routinely served as .xml.gz. httpx transparently handles
    gzip *transfer* encoding, but a gzipped file served as its own content type
    arrives compressed and would otherwise be parsed as binary noise."""
    if raw[:2] == b"\x1f\x8b":
        try:
            return gzip.decompress(raw)
        except OSError:
            return raw
    return raw


def _read_sitemap(client: httpx.Client, url: str) -> tuple[list[str], bool]:
    """Returns (locations, is_index)."""
    resp = client.get(url, headers=_HEADERS, follow_redirects=True)
    resp.raise_for_status()
    raw = _maybe_gunzip(resp.content[:_MAX_SITEMAP_BYTES])
    text = _decode(raw, resp.headers.get("content-type", ""))
    locs = [html_mod.unescape(m.strip()) for m in _LOC_RE.findall(text)]
    is_index = re.search(r"<sitemapindex", text, re.I) is not None
    return locs, is_index


def collect_sitemap_urls(root: str) -> dict:
    seen: set[str] = set()
    ordered: list[str] = []
    sitemaps_read = 0
    problems: list[str] = []

    with _client() as client:
        queue: list[tuple[str, int]] = [(root, 0)]
        visited_sitemaps: set[str] = set()
        while queue:
            url, depth = queue.pop(0)
            if url in visited_sitemaps:
                continue
            visited_sitemaps.add(url)
            try:
                locs, is_index = _read_sitemap(client, url)
            except Exception as exc:                            # noqa: BLE001
                problems.append(f"{url} — {type(exc).__name__}")
                continue
            sitemaps_read += 1
            if is_index and depth < _MAX_SITEMAP_DEPTH:
                queue.extend((loc, depth + 1) for loc in locs)
                continue
            for loc in locs:
                if loc not in seen:
                    seen.add(loc)
                    ordered.append(loc)
                    if len(ordered) >= _MAX_URLS:
                        break
            if len(ordered) >= _MAX_URLS:
                break

    if not ordered and problems:
        raise HTTPException(502, f"Could not read the sitemap: {problems[0]}")
    return {"urls": ordered, "count": len(ordered),
            "sitemaps_read": sitemaps_read, "problems": problems[:5]}




# ── Links ────────────────────────────────────────────────────────────────────
# A dead link costs crawl budget, strands the reader and wastes the link equity
# pointing at it, so a page carrying one is scored down alongside its title and
# description problems.

_A_HREF_RE = re.compile(r"""<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""", re.I)
_SKIP_HREF = re.compile(r"^\s*(?:mailto:|tel:|javascript:|data:|sms:|#)", re.I)

# Statuses live for half an hour. Nav and footer links repeat on every page of
# a site, so without this a 448-page run would check the same forty links 448
# times; with it they are checked once and every later page is a dict lookup.
_LINK_TTL = 1800.0
_link_cache: dict = {}
_link_lock = threading.Lock()
# Bounded so one page with a thousand links cannot dominate a run.
_MAX_LINKS_PER_PAGE = 80


def extract_links(document: str, base_url: str, internal_only: bool = True) -> list:
    """Absolute http(s) link targets on the page, deduplicated, in order.

    Fragments are dropped: /page and /page#section are the same document, and
    checking both would double the work and report the same break twice.
    """
    base_host = urlparse(base_url).netloc.lower()
    out, seen = [], set()
    for m in _A_HREF_RE.finditer(document):
        raw = next((g for g in m.groups() if g is not None), "")
        raw = html_mod.unescape(raw).strip()
        if not raw or _SKIP_HREF.match(raw):
            continue
        try:
            absolute = urldefrag(urljoin(base_url, raw))[0]
        except ValueError:
            continue
        parts = urlparse(absolute)
        if parts.scheme not in ("http", "https") or not parts.netloc:
            continue
        if internal_only and parts.netloc.lower() != base_host:
            continue
        if absolute not in seen:
            seen.add(absolute)
            out.append(absolute)
        if len(out) >= _MAX_LINKS_PER_PAGE:
            break
    return out


def _probe(client: httpx.Client, url: str):
    """The status of one link: an int, or a short reason it could not be got."""
    # GET, never HEAD. A browser never sends HEAD for a page, so bot protection
    # treats it as a scraper and answers 403; the body is streamed and dropped
    # without being read, so the cost is a header round trip either way.
    try:
        with client.stream("GET", url, headers=_HEADERS, follow_redirects=True) as r:
            return r.status_code
    except httpx.TimeoutException:
        return "Timed out"
    except httpx.HTTPError:
        return "Unreachable"
    except Exception:                                           # noqa: BLE001
        return "Unreachable"


def link_status(client: httpx.Client, url: str):
    now = time.time()
    with _link_lock:
        hit = _link_cache.get(url)
        if hit and now - hit[1] < _LINK_TTL:
            return hit[0]
    status = _probe(client, url)
    with _link_lock:
        _link_cache[url] = (status, time.time())
    return status


# Telling these apart is the difference between a redirect worklist and a
# wild goose chase. A 403 from a CDN's bot protection, or a connection the
# server dropped, says the tool could not see the page — not that the page is
# gone. Reporting those as broken sends someone building redirects for pages
# that work perfectly in a browser.
KIND_OK, KIND_MISSING, KIND_SERVER = "ok", "missing", "server_error"
KIND_CLIENT, KIND_BLOCKED, KIND_UNCHECKED = "client_error", "blocked", "unchecked"

_BLOCKED_STATUS = {401, 403, 407, 429}


def status_kind(status) -> str:
    if not isinstance(status, int):
        return KIND_UNCHECKED
    if status in _BLOCKED_STATUS:
        return KIND_BLOCKED
    if status in (404, 410):
        return KIND_MISSING
    if status >= 500:
        return KIND_SERVER
    if status >= 400:
        return KIND_CLIENT
    return KIND_OK


def is_broken(status) -> bool:
    """Broken means the page is genuinely not there or is erroring — something
    a redirect or a fix can address.

    A redirect is not broken: the client follows it and reports where it
    landed. Nor is a block or a dropped connection, which are reported
    separately as unverified rather than counted here.
    """
    return status_kind(status) in (KIND_MISSING, KIND_SERVER, KIND_CLIENT)


def is_unverified(status) -> bool:
    return status_kind(status) in (KIND_BLOCKED, KIND_UNCHECKED)


def check_links(links: list) -> dict:
    if not links:
        return {}
    with _client() as client:
        with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
            statuses = list(pool.map(lambda u: link_status(client, u), links))
    return dict(zip(links, statuses))

# ── SEO audit ────────────────────────────────────────────────────────────────
# Lengths are in characters, not words: a search result truncates on rendered
# width, so characters are what actually decides whether a title survives.
TITLE_MIN, TITLE_MAX = 30, 60
DESC_MIN, DESC_MAX = 120, 160

# Weighted by impact. A page with no title is far worse off than one with a
# description a few characters long, and the score has to say so.
PENALTY = {
    "title_missing":     30,
    "title_duplicate":   20,
    "title_length":      10,
    "desc_missing":      20,
    "desc_length":       10,
    "keywords_missing":   5,
    "focus_missing":      5,
    "broken_links":      15,
}

# The Modelsite form. Matched on the form element's own id, which is how it
# appears in the markup.
MODELSITE_FORM_ID = "658"

_ATTR = r"""(?:"([^"]*)"|'([^']*)'|([^\s>]+))"""
_FORM_TAG_RE = re.compile(r"<form\b[^>]*>", re.I)
_FORM_ID_RE = re.compile(r"\bid\s*=\s*" + _ATTR, re.I)
_H1_RE = re.compile(r"<h1[^>]*>(.*?)</h1>", re.I | re.S)


def _attr_value(m) -> str:
    return next((g for g in m.groups() if g is not None), "")


def meta_content(document: str, name: str) -> Optional[str]:
    """A named meta tag's content, both attribute orders.

    The quote character is captured and back-referenced rather than excluded by
    a character class, because a description that contains an apostrophe —
    "KONE's lifts" — would otherwise be cut off at the apostrophe and measured
    as far shorter than it is.
    """
    esc = re.escape(name)
    pats = (
        re.compile(r"<meta[^>]*?\bname\s*=\s*[\"']?" + esc + r"[\"']?[^>]*?\bcontent\s*=\s*([\"'])(.*?)\1", re.I | re.S),
        re.compile(r"<meta[^>]*?\bcontent\s*=\s*([\"'])(.*?)\1[^>]*?\bname\s*=\s*[\"']?" + esc + r"[\"']?", re.I | re.S),
    )
    for pat in pats:
        m = pat.search(document)
        if m:
            return _normalise(m.group(2))
    return None


def extract_h1s(document: str) -> list:
    out = []
    for m in _H1_RE.finditer(document):
        text = _normalise(re.sub(r"<[^>]+>", " ", m.group(1)))
        if text:
            out.append(text)
    return out


def extract_form_ids(document: str) -> list:
    """The id of every <form> on the page, in order."""
    ids = []
    for tag in _FORM_TAG_RE.findall(document):
        m = _FORM_ID_RE.search(tag)
        if m:
            value = _attr_value(m).strip()
            if value:
                ids.append(value)
    return ids


def _focus_terms(raw: str) -> list:
    """Focus keywords, split on commas and newlines so a phrase stays whole."""
    return [t.strip().lower() for t in re.split(r"[,\n]", raw or "") if t.strip()]


def audit_page(title: Optional[str], document: str, brand: str, focus: list,
               broken: Optional[list] = None) -> dict:
    """Per-page findings and the score left after their penalties."""
    kind = classify(title, brand)
    title_text = _normalise(title or "")
    desc = meta_content(document, "description")
    keywords = meta_content(document, "keywords")
    h1s = extract_h1s(document)
    issues = []

    if kind == MISSING:
        issues.append(("title_missing", "No page title"))
    else:
        if kind in (DOUBLE, PARTIAL):
            issues.append(("title_duplicate", f"{kind} — the site name repeats"))
        n = len(title_text)
        if n < TITLE_MIN:
            issues.append(("title_length", f"Title is short ({n} characters, aim for {TITLE_MIN}-{TITLE_MAX})"))
        elif n > TITLE_MAX:
            issues.append(("title_length", f"Title is long ({n} characters, aim for {TITLE_MIN}-{TITLE_MAX}) and will be cut off"))

    if not desc:
        issues.append(("desc_missing", "No meta description"))
    else:
        n = len(desc)
        if n < DESC_MIN:
            issues.append(("desc_length", f"Description is short ({n} characters, aim for {DESC_MIN}-{DESC_MAX})"))
        elif n > DESC_MAX:
            issues.append(("desc_length", f"Description is long ({n} characters, aim for {DESC_MIN}-{DESC_MAX}) and will be cut off"))

    if not keywords:
        issues.append(("keywords_missing", "No meta keywords tag"))

    # Only scored when focus keywords were actually supplied — penalising a
    # page for a check the user never configured would make the score depend
    # on an empty input box.
    focus_hit = None
    if focus:
        haystack = " ".join([title_text, desc or "", " ".join(h1s)]).lower()
        hits = [t for t in focus if t in haystack]
        focus_hit = bool(hits)
        if not hits:
            issues.append(("focus_missing", "None of the focus keywords appear in the title, description or H1"))

    broken = broken or []
    if broken:
        shown = ", ".join(broken[:3]) + ("…" if len(broken) > 3 else "")
        issues.append(("broken_links",
                       f"{len(broken)} broken link{'s' if len(broken) != 1 else ''} on the page ({shown})"))

    lost = sum(PENALTY[key] for key, _ in issues)
    return {
        "broken_links": broken,
        "broken_count": len(broken),
        "type": kind,
        "title": title_text,
        "title_chars": len(title_text),
        "title_words": len(title_text.split()) if title_text else 0,
        "description": desc or "",
        "desc_chars": len(desc or ""),
        "keywords": keywords or "",
        "h1": h1s[0] if h1s else "",
        "h1_count": len(h1s),
        "focus_hit": focus_hit,
        "issues": [text for _, text in issues],
        "issue_keys": [key for key, _ in issues],
        "score": max(0, 100 - lost),
    }

# ── API ──────────────────────────────────────────────────────────────────────

class SitemapRequest(BaseModel):
    url: str


class TitleRequest(BaseModel):
    urls: list[str] = Field(default_factory=list)
    brand: str = ""


class ExportRow(BaseModel):
    url: str
    title: str = ""
    type: str = ""
    tcm_id: str = ""


class ExportColumn(BaseModel):
    key: str
    label: str
    width: float = 22
    link: str = ""          # "cms" turns the cell into its CMS item link


class ExportRequest(BaseModel):
    rows: list[ExportRow] = Field(default_factory=list)
    # When columns are given the sheet is built from them and from `data`,
    # which is how the audit and form tabs export their own shapes. Without
    # them the original four-column title sheet is produced unchanged.
    columns: list[ExportColumn] = Field(default_factory=list)
    data: list[dict] = Field(default_factory=list)
    sheet: str = "Page titles"
    filename: str = "page-titles.xlsx"


@router.post("/sitemap")
async def read_sitemap(req: SitemapRequest):
    url = (req.url or "").strip()
    if not url:
        raise HTTPException(400, "Enter a sitemap URL")
    if not url.lower().startswith(("http://", "https://")):
        url = "https://" + url
    return collect_sitemap_urls(url)


@router.post("/titles")
async def verify_titles(req: TitleRequest):
    urls = [u.strip() for u in req.urls if u and u.strip()][:_MAX_BATCH]
    if not urls:
        return {"results": []}
    with _client() as client:
        with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
            fetched = list(pool.map(lambda u: fetch_title(client, u), urls))

    results = []
    for item in fetched:
        tcm = item.get("tcm_id") or ""
        if not item["ok"]:
            results.append({"url": item["url"], "title": item["title"], "type": FAILED,
                            "tcm_id": tcm, "cms_url": cms_url(tcm)})
            continue
        title = item["title"]
        kind = classify(title, req.brand)
        results.append({"url": item["url"], "title": title or "", "type": kind,
                        "tcm_id": tcm, "cms_url": cms_url(tcm)})
    return {"results": results}



class AuditRequest(BaseModel):
    urls: list = Field(default_factory=list)
    brand: str = ""
    focus: str = ""
    check_links: bool = True
    internal_only: bool = True


class LinkRequest(BaseModel):
    urls: list = Field(default_factory=list)
    internal_only: bool = True


def _crawl(urls: list) -> list:
    with _client() as client:
        with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
            return list(pool.map(lambda u: fetch_title(client, u, want_body=True), urls))


@router.post("/audit")
async def audit(req: AuditRequest):
    urls = [u.strip() for u in req.urls if u and u.strip()][:_MAX_BATCH]
    if not urls:
        return {"results": []}
    focus = _focus_terms(req.focus)
    fetched = _crawl(urls)

    # Links are gathered across the whole batch and checked once, so a nav link
    # shared by every page costs one request rather than one per page.
    page_links, statuses = {}, {}
    if req.check_links:
        for item in fetched:
            if item["ok"]:
                page_links[item["url"]] = extract_links(
                    item.get("document") or "", item["url"], req.internal_only)
        statuses = check_links(sorted({l for ls in page_links.values() for l in ls}))

    results = []
    for item in fetched:
        tcm = item.get("tcm_id") or ""
        base = {"url": item["url"], "tcm_id": tcm, "cms_url": cms_url(tcm)}
        if not item["ok"]:
            # Not scored: a page that could not be read has no findings, and
            # folding a zero into the average would make an unreachable page
            # look like a badly optimised one.
            results.append({**base, "type": FAILED, "title": item["title"], "score": None,
                            "description": "", "keywords": "", "h1": "",
                            "title_chars": 0, "desc_chars": 0, "issues": ["Could not be read"],
                            "issue_keys": [], "focus_hit": None,
                            "broken_links": [], "broken_count": 0, "links_checked": 0})
            continue
        links = page_links.get(item["url"], [])
        # Only definitely-broken links are scored. A link the tool was blocked
        # from checking is not evidence of a problem on this page.
        broken = [l for l in links if is_broken(statuses.get(l, 200))]
        results.append({**base, "links_checked": len(links),
                        **audit_page(item["title"], item.get("document") or "",
                                     req.brand, focus, broken)})
    return {"results": results}



@router.post("/links")
async def page_links(req: LinkRequest):
    """Every link on each page. The tab checks the union of them separately, so
    a target linked from two hundred pages is requested once rather than two
    hundred times."""
    urls = [u.strip() for u in req.urls if u and u.strip()][:_MAX_BATCH]
    if not urls:
        return {"results": []}
    results = []
    for item in _crawl(urls):
        if not item["ok"]:
            results.append({"url": item["url"], "links": [], "error": item["title"]})
            continue
        results.append({"url": item["url"],
                        "links": extract_links(item.get("document") or "", item["url"], req.internal_only),
                        "error": ""})
    return {"results": results}


@router.post("/link-status")
async def link_status_batch(req: LinkRequest):
    links = [u.strip() for u in req.urls if u and u.strip()][:_MAX_BATCH * 4]
    if not links:
        return {"results": []}
    statuses = check_links(links)
    return {"results": [
        {"url": u, "status": statuses.get(u), "kind": status_kind(statuses.get(u, 200)),
         "broken": is_broken(statuses.get(u, 200)),
         "unverified": is_unverified(statuses.get(u, 200))}
        for u in links
    ]}

@router.post("/forms")
async def forms(req: TitleRequest):
    """Which pages still carry the Modelsite form."""
    urls = [u.strip() for u in req.urls if u and u.strip()][:_MAX_BATCH]
    if not urls:
        return {"results": []}
    results = []
    for item in _crawl(urls):
        tcm = item.get("tcm_id") or ""
        base = {"url": item["url"], "tcm_id": tcm, "cms_url": cms_url(tcm)}
        if not item["ok"]:
            results.append({**base, "title": item["title"], "form_ids": [], "form_count": 0,
                            "modelsite": False, "status": FAILED})
            continue
        ids = extract_form_ids(item.get("document") or "")
        modelsite = MODELSITE_FORM_ID in ids
        results.append({**base, "title": item["title"] or "", "form_ids": ids, "form_count": len(ids),
                        "modelsite": modelsite,
                        "status": "Modelsite form" if modelsite else ("Other form" if ids else "No form")})
    return {"results": results}

@router.post("/export")
async def export_xlsx(req: ExportRequest):
    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    ws = wb.add_worksheet((req.sheet or "Export")[:31])
    hdr = wb.add_format({"bold": True, "bg_color": "#1450f5", "font_color": "#ffffff", "border": 1})
    cell = wb.add_format({"valign": "top"})
    # The ID itself is the link, rather than a fifth column repeating the URL.
    link = wb.add_format({"valign": "top", "font_color": "#1450f5", "underline": 1})
    # No per-row highlighting: the Title Type column already carries the result,
    # and colour-coding was explicitly not wanted.
    if req.columns:
        ws.write_row(0, 0, [c.label for c in req.columns], hdr)
        for i, row in enumerate(req.data, start=1):
            for j, col in enumerate(req.columns):
                value = row.get(col.key, "")
                text = "" if value is None else str(value)
                target = cms_url(text) if col.link == "cms" else ""
                if target:
                    ws.write_url(i, j, target, link, text)
                elif isinstance(value, (int, float)) and not isinstance(value, bool):
                    ws.write_number(i, j, value, cell)
                else:
                    ws.write_string(i, j, text, cell)
        for j, col in enumerate(req.columns):
            ws.set_column(j, j, col.width)
        ws.freeze_panes(1, 0)
        wb.close()
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{req.filename or "export.xlsx"}"'},
        )

    ws.write_row(0, 0, ["URL", "Current Page Title", "Title Type", "TCM ID"], hdr)
    for i, row in enumerate(req.rows, start=1):
        ws.write_string(i, 0, row.url or "", cell)
        ws.write_string(i, 1, row.title or "", cell)
        ws.write_string(i, 2, row.type or "", cell)
        target = cms_url(row.tcm_id)
        if target:
            ws.write_url(i, 3, target, link, row.tcm_id)
        else:
            ws.write_string(i, 3, row.tcm_id or "", cell)
    ws.set_column(0, 0, 60)
    ws.set_column(1, 1, 70)
    ws.set_column(2, 2, 18)
    ws.set_column(3, 3, 26)
    ws.freeze_panes(1, 0)
    wb.close()
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="page-titles.xlsx"'},
    )
