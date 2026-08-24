// ─── ServiceNow → Digital Marketing Hub ──────────────────────────────────────
// Pulls a ServiceNow list view as CSV using the signed-in user's own session
// and posts it straight to the hub backend.
//
// This deliberately does NOT use the ServiceNow REST API — `?CSV` on a list
// view is the same export the UI's Export menu produces, so it needs no API
// access and no admin rights, only a logged-in session.
//
// It also no longer writes to Google Sheets. That hop needed an OAuth client,
// a Cloud project and the Sheets API, purely to stage data the hub read back
// out again moments later. One POST replaces all of it.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_HUB = 'https://hub-tools-production.up.railway.app';

async function getConfig() {
  const { hubUrl, snUrl } = await chrome.storage.local.get(['hubUrl', 'snUrl']);
  return {
    hubUrl: (hubUrl || DEFAULT_HUB).replace(/\/+$/, ''),
    snUrl: snUrl || '',
  };
}

// ── URL handling ─────────────────────────────────────────────────────────────

/**
 * Turn whatever the user pasted into a real CSV export URL.
 *
 * Copying from the address bar in the classic UI gives a navigation wrapper:
 *   /now/nav/ui/classic/params/target/<double-encoded real target>
 * Appending &CSV to that fetches the navigation shell and returns HTML, so the
 * target has to be unwrapped and decoded first. Newer workspace URLs use the
 * same /params/target/ shape.
 */
function toCsvUrl(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!url) throw new Error('No ServiceNow list URL configured');

  const marker = '/params/target/';
  const at = url.indexOf(marker);
  if (at !== -1) {
    const origin = new URL(url).origin;
    let target = url.slice(at + marker.length);
    // Decode exactly once. The wrapper stores the target double-encoded, so one
    // pass yields `...?sysparm_query=u_category%3DMarketing%20Hub` — still
    // properly escaped. Decoding until stable would strip that second layer too
    // and hand ServiceNow a raw space and a bare `=` inside the query value.
    target = decodeURIComponent(target);
    // Rare instances encode only once; if the query separator is still escaped,
    // one more pass gets there.
    if (!target.includes('?') && target.includes('%3F')) target = decodeURIComponent(target);
    url = `${origin}/${target.replace(/^\/+/, '')}`;
  }

  if (/[?&]CSV(&|=|$)/i.test(url)) return url;
  return url + (url.includes('?') ? '&CSV' : '?CSV');
}

// ── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Run the fetch inside a ServiceNow tab so the request carries that tab's
 * session cookies. Fetching from the service worker is possible but subject to
 * SameSite rules that vary by instance; borrowing the tab is what actually
 * works everywhere.
 */
async function fetchCsv(csvUrl) {
  const tabs = await chrome.tabs.query({ url: 'https://*.service-now.com/*' });
  if (!tabs.length) {
    throw new Error('No ServiceNow tab is open. Open ServiceNow and sign in, then sync again.');
  }
  const [{ result, error }] = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: async (url) => {
      try {
        const res = await fetch(url, {
          credentials: 'include',
          headers: { Accept: 'text/csv,text/plain,*/*' },
        });
        if (!res.ok) return { error: `ServiceNow returned HTTP ${res.status}` };
        const text = await res.text();
        if (!text.trim()) return { error: 'ServiceNow returned an empty export' };
        return { result: text };
      } catch (e) {
        return { error: e.message || 'Fetch failed inside the ServiceNow tab' };
      }
    },
    args: [csvUrl],
  }).then(r => r[0].result);
  if (error) throw new Error(error);
  return result;
}

async function pushToHub(hubUrl, csv) {
  const res = await fetch(`${hubUrl}/api/upload-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv, source_label: 'ServiceNow' }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

// ── Sync ─────────────────────────────────────────────────────────────────────

async function runSync({ snUrl, csvText } = {}) {
  const cfg = await getConfig();
  // The in-page button on a ServiceNow list already holds the export, so use it
  // rather than fetching the same rows a second time.
  const csv = csvText || await fetchCsv(toCsvUrl(snUrl || cfg.snUrl));
  const result = await pushToHub(cfg.hubUrl, csv);
  await chrome.storage.local.set({
    lastSyncedAt: new Date().toISOString(),
    lastRowCount: result.total_rows ?? 0,
    lastSessionId: result.session_id || '',
  });
  return result;
}

// From the popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action !== 'sync') return false;
  runSync({ snUrl: msg.snUrl, csvText: msg.csvText })
    .then(result => sendResponse({ ok: true, ...result }))
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true;   // keep the channel open for the async reply
});

// From the hub pages (the in-page "Sync from SN" button)
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.action !== 'externalSync') return false;
  runSync({ snUrl: msg.snUrl })
    .then(result => sendResponse({ ok: true, rowCount: result.total_rows ?? 0, ...result }))
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
});
