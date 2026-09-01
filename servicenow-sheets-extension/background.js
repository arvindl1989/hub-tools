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
  // executeScript resolves to one InjectionResult per frame; the injected
  // function's return value is on .result. The previous version unwrapped that
  // and then destructured it as an array, which threw "(intermediate value) is
  // not iterable" before any request was ever made.
  const frames = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: async (url) => {
      try {
        const res = await fetch(url, {
          credentials: 'include',
          headers: { Accept: 'text/csv,text/plain,*/*' },
        });
        if (!res.ok) return { error: `ServiceNow returned HTTP ${res.status}` };
        // res.text() always decodes as UTF-8 regardless of the export's actual
        // charset, and this instance's CSV export is Windows-1252 — confirmed
        // against a real export where an en dash (0x96) is not valid UTF-8.
        // A UTF-8 decode does not fail on that byte, it silently replaces it
        // with U+FFFD, destroying the character with no way to recover it
        // afterward, which is what put "Content Production � Graphic
        // Design" in front of a user. Try strict UTF-8 first — most exports
        // are plain ASCII, identical in both encodings — and only fall back to
        // Windows-1252 when the bytes are not valid UTF-8, rather than
        // assuming one encoding for every ServiceNow instance.
        const buf = await res.arrayBuffer();
        let text;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
        } catch {
          text = new TextDecoder('windows-1252').decode(buf);
        }
        if (!text.trim()) return { error: 'ServiceNow returned an empty export' };
        // An expired session does not 401 — ServiceNow answers 200 with the
        // login page, so without this the HTML is posted to the hub as if it
        // were an export. The backend rejects it on its columns, but the error
        // it raises describes missing columns rather than the real cause.
        if (/^\s*<(!doctype|html|\?xml)/i.test(text.slice(0, 200))) {
          return { error: 'ServiceNow returned a page, not an export — your session has probably expired. Open ServiceNow, sign in, then sync again.' };
        }
        return { result: text };
      } catch (e) {
        return { error: e.message || 'Fetch failed inside the ServiceNow tab' };
      }
    },
    args: [csvUrl],
  });

  const outcome = frames && frames[0] && frames[0].result;
  if (!outcome) throw new Error('No response from the ServiceNow tab — try reloading it.');
  if (outcome.error) throw new Error(outcome.error);
  return outcome.result;
}

async function pushToHub(hubUrl, csv, dataset, synced_by) {
  const res = await fetch(`${hubUrl}/api/upload-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv, source_label: 'ServiceNow', dataset, synced_by }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

// ── Sync ─────────────────────────────────────────────────────────────────────

async function runSync({ snUrl, csvText, dataset = 'tickets', synced_by } = {}) {
  const cfg = await getConfig();
  const urlKey = dataset === 'feedback' ? 'feedbackSnUrl' : 'snUrl';
  const targetUrl = snUrl || (await chrome.storage.local.get(urlKey))[urlKey] || cfg.snUrl;
  // The in-page button on a ServiceNow list already holds the export, so use it
  // rather than fetching the same rows a second time.
  const csv = csvText || await fetchCsv(toCsvUrl(targetUrl));
  const result = await pushToHub(cfg.hubUrl, csv, dataset, synced_by);
  try { await chrome.action.setBadgeText({ text: '' }); } catch {}
  const stamp = { syncedAt: new Date().toISOString(), rowCount: result.total_rows ?? 0 };
  await chrome.storage.local.set({
    [`last_${dataset}`]: stamp,
    // Kept for the tickets path specifically — older popup builds and the
    // in-page button read these unprefixed keys.
    ...(dataset === 'tickets' ? { lastSyncedAt: stamp.syncedAt, lastRowCount: stamp.rowCount } : {}),
  });
  return result;
}

// ── Scheduled sync ───────────────────────────────────────────────────────────
// chrome.alarms rather than setInterval: an MV3 service worker is torn down
// when idle, which would kill any timer it held. An alarm is registered with
// the browser and wakes the worker back up to run this.
//
// The export still needs the user's ServiceNow session, so this can only run
// while Chrome is open, and it reads the session from an open ServiceNow tab
// exactly as the button does. No tab, no sync — it records why and waits for
// the next hour rather than opening tabs on its own.

const AUTO_ALARM = 'autoSync';
const AUTO_DEFAULT_MINUTES = 60;

async function applyAutoSync() {
  const { autoSync, autoSyncMinutes } = await chrome.storage.local.get(['autoSync', 'autoSyncMinutes']);
  await chrome.alarms.clear(AUTO_ALARM);
  if (!autoSync) return;
  const period = Number(autoSyncMinutes) || AUTO_DEFAULT_MINUTES;
  // delayInMinutes so enabling it does not fire an immediate sync on top of
  // whatever the user is already doing.
  chrome.alarms.create(AUTO_ALARM, { delayInMinutes: period, periodInMinutes: period });
}

async function noteAuto(stamp) {
  await chrome.storage.local.set({ autoLast: { at: new Date().toISOString(), ...stamp } });
  // The icon is the only surface visible without opening the popup, so a
  // failure is worth a badge — silence would look identical to success.
  try {
    await chrome.action.setBadgeText({ text: stamp.ok ? '' : '!' });
    if (!stamp.ok) await chrome.action.setBadgeBackgroundColor({ color: '#b3261e' });
  } catch {}
}

async function runAutoSync() {
  const { autoSync, snUrl } = await chrome.storage.local.get(['autoSync', 'snUrl']);
  if (!autoSync) return;
  if (!snUrl) return noteAuto({ ok: false, error: 'No ServiceNow tickets URL is configured' });
  const tabs = await chrome.tabs.query({ url: 'https://*.service-now.com/*' });
  if (!tabs.length) {
    return noteAuto({ ok: false, error: 'Skipped — no ServiceNow tab was open' });
  }
  try {
    const result = await runSync({ snUrl, dataset: 'tickets', synced_by: 'Scheduled sync' });
    await noteAuto({ ok: true, rowCount: result.total_rows ?? 0 });
  } catch (err) {
    await noteAuto({ ok: false, error: err.message });
  }
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === AUTO_ALARM) runAutoSync();
});

// Re-register on both, since alarms do not survive an update and onStartup
// does not fire when the extension is merely reloaded.
chrome.runtime.onInstalled.addListener(applyAutoSync);
chrome.runtime.onStartup.addListener(applyAutoSync);

// From the popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === 'applyAutoSync') {
    applyAutoSync().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.action !== 'sync') return false;
  runSync({ snUrl: msg.snUrl, csvText: msg.csvText, dataset: msg.dataset, synced_by: msg.synced_by })
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
