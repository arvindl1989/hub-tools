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
from concurrent.futures import ThreadPoolExecutor
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
_HEADERS = {"User-Agent": _UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}

_CONNECT_TIMEOUT = 8.0
_READ_TIMEOUT = 15.0
_WORKERS = 10
# The title lives in <head>, so the rest of the document is never read. Pages
# that somehow have no </head> stop at this cap instead of streaming megabytes.
_MAX_HTML_BYTES = 250_000
_MAX_SITEMAP_BYTES = 30_000_000
_MAX_URLS = 50_000
_MAX_SITEMAP_DEPTH = 3
_MAX_BATCH = 50

SINGLE, DOUBLE, MISSING, FAILED = "Single Title", "Double Title", "Missing Title", "Unable to Verify"

# The separators a CMS puts between the page name and the site name.
_SEPARATORS = "-|–—"


# ── Title classification ─────────────────────────────────────────────────────

def _normalise(text: str) -> str:
    """Decode entities and flatten whitespace, so a title split across lines in
    the source compares the same as one written inline."""
    return re.sub(r"\s+", " ", html_mod.unescape(text)).strip()


def count_trailing_brand(title: str, brand: str) -> int:
    """How many times the brand is repeated at the end of the title.

    Stripping one trailing "<separator> <brand>" at a time rather than splitting
    the whole title on separators, because a brand may itself contain one —
    "KONE – Dedicated to People Flow" would be torn in half by a split and then
    never match.
    """
    brand = brand.strip()
    if not brand:
        return 0
    pattern = re.compile(r"(?:[" + _SEPARATORS + r"]\s*)?" + re.escape(brand) + r"\s*$", re.I)
    rest, seen = title.strip(), 0
    while True:
        m = pattern.search(rest)
        if not m:
            return seen
        rest = rest[:m.start()].rstrip()
        seen += 1
        if not rest:
            return seen


def classify(title: Optional[str], brand: str) -> str:
    if title is None:
        return MISSING
    title = _normalise(title)
    if not title:
        return MISSING
    if not brand.strip():
        return SINGLE
    if count_trailing_brand(title, brand) >= 2:
        return DOUBLE
    # A brand that repeats without sitting flush at the end — "KONE Australia |
    # Lifts | KONE Australia" — is the same duplication and is still worth
    # flagging.
    if len(re.findall(re.escape(brand.strip()), title, re.I)) >= 2:
        return DOUBLE
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


def fetch_title(client: httpx.Client, url: str) -> dict:
    """One page. Returns the title, or why it could not be read."""
    try:
        with client.stream("GET", url, headers=_HEADERS, follow_redirects=True) as resp:
            if resp.status_code >= 400:
                return {"url": url, "title": f"HTTP {resp.status_code}", "tcm_id": None, "ok": False}
            ctype = resp.headers.get("content-type", "")
            if ctype and "html" not in ctype.lower() and "xml" not in ctype.lower():
                return {"url": url, "title": f"Not an HTML page ({ctype.split(';')[0]})", "tcm_id": None, "ok": False}
            buf = bytearray()
            for chunk in resp.iter_bytes():
                buf.extend(chunk)
                # Stop as soon as the head is complete — reading the rest of the
                # document would multiply the time for every URL in the sitemap.
                if b"</head" in buf.lower() or len(buf) >= _MAX_HTML_BYTES:
                    break
            document = _decode(bytes(buf), ctype)
    except httpx.TimeoutException:
        return {"url": url, "title": "Timed out", "tcm_id": None, "ok": False}
    except httpx.HTTPError as exc:
        return {"url": url, "title": type(exc).__name__, "tcm_id": None, "ok": False}
    except Exception as exc:                                   # noqa: BLE001
        return {"url": url, "title": str(exc)[:120] or "Failed", "tcm_id": None, "ok": False}
    # Both come out of the one response — the TCM tool needed the page opened
    # by hand and a bookmarklet clicked; here it costs nothing extra.
    return {"url": url, "title": extract_title(document),
            "tcm_id": extract_tcm_id(document), "ok": True}


def _client() -> httpx.Client:
    return httpx.Client(
        timeout=httpx.Timeout(_READ_TIMEOUT, connect=_CONNECT_TIMEOUT),
        limits=httpx.Limits(max_connections=_WORKERS + 2),
        follow_redirects=True,
    )


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


class ExportRequest(BaseModel):
    rows: list[ExportRow] = Field(default_factory=list)


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


@router.post("/export")
async def export_xlsx(req: ExportRequest):
    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    ws = wb.add_worksheet("Page titles")
    hdr = wb.add_format({"bold": True, "bg_color": "#1450f5", "font_color": "#ffffff", "border": 1})
    cell = wb.add_format({"valign": "top"})
    # The ID itself is the link, rather than a fifth column repeating the URL.
    link = wb.add_format({"valign": "top", "font_color": "#1450f5", "underline": 1})
    # No per-row highlighting: the Title Type column already carries the result,
    # and colour-coding was explicitly not wanted.
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
