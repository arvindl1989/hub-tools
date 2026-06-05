// ─── CONFIG — fill these in ──────────────────────────────────────────────────
const SHEET_ID  = 'YOUR_GOOGLE_SHEET_ID';   // from the sheet URL
const SHEET_TAB = 'Sheet1';                 // exact tab name (case-sensitive)
// ─────────────────────────────────────────────────────────────────────────────

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// ── OAuth token ───────────────────────────────────────────────────────────────

async function getToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'Auth failed'));
      } else {
        resolve(token);
      }
    });
  });
}

// Revoke the cached token and get a fresh one (used after 401s).
async function refreshToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (staleToken) => {
      if (staleToken) {
        chrome.identity.removeCachedAuthToken({ token: staleToken }, async () => {
          try { resolve(await getToken(true)); }
          catch (e) { reject(e); }
        });
      } else {
        resolve(getToken(true));
      }
    });
  });
}

// ── Sheets API helpers ────────────────────────────────────────────────────────

async function sheetsRequest(url, options, retried = false) {
  const token = retried ? await refreshToken() : await getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 && !retried) {
    return sheetsRequest(url, options, true);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API ${res.status}: ${body}`);
  }
  return res.json();
}

async function clearSheet() {
  const url = `${SHEETS_BASE}/${SHEET_ID}/values/${encodeURIComponent(SHEET_TAB)}:clear`;
  return sheetsRequest(url, { method: 'POST', body: '{}' });
}

async function writeRows(rows) {
  const url = `${SHEETS_BASE}/${SHEET_ID}/values/${encodeURIComponent(SHEET_TAB)}?valueInputOption=RAW`;
  return sheetsRequest(url, {
    method: 'PUT',
    body: JSON.stringify({
      range: SHEET_TAB,
      majorDimension: 'ROWS',
      values: rows,
    }),
  });
}

// ── CSV → 2-D array ───────────────────────────────────────────────────────────

function parseCSV(text) {
  const rows = [];
  // Simple but robust RFC 4180 parser
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        row.push(field);
        field = '';
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }
  // last field / last row (no trailing newline)
  row.push(field);
  if (row.some(c => c !== '')) rows.push(row);

  return rows;
}

// ── Main sync logic ───────────────────────────────────────────────────────────

async function syncToSheets(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length === 0) throw new Error('CSV is empty — nothing to sync');

  await clearSheet();
  await writeRows(rows);
  return rows.length;
}

// ── Message handler ───────────────────────────────────────────────────────────

// ── External sync (triggered from the Email Tracker web app) ─────────────────

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'externalSync') return false;

  const snUrl = message.snUrl;
  if (!snUrl) {
    sendResponse({ ok: false, error: 'No ServiceNow URL provided' });
    return false;
  }

  syncViaServiceNowTab(snUrl)
    .then((rowCount) => {
      const syncedAt = new Date().toISOString();
      chrome.storage.local.set({ lastSyncedAt: syncedAt, lastRowCount: rowCount });
      sendResponse({ ok: true, rowCount });
    })
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true;
});

async function syncViaServiceNowTab(listUrl) {
  // Build the CSV export URL
  const csvUrl = listUrl.includes('?') ? listUrl + '&CSV' : listUrl + '?CSV';

  // Find an open ServiceNow tab to borrow its authenticated session for the fetch
  const tabs = await chrome.tabs.query({ url: 'https://*.service-now.com/*' });
  if (tabs.length === 0) {
    throw new Error('No ServiceNow tab is open. Open ServiceNow in a tab first.');
  }

  // Run fetch inside the ServiceNow tab so session cookies are included
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: async (url) => {
      const res = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'text/csv,text/plain,*/*' },
      });
      if (!res.ok) throw new Error(`ServiceNow returned HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trim()) throw new Error('ServiceNow returned empty CSV');
      return text;
    },
    args: [csvUrl],
  });

  const csvText = results[0].result;
  if (!csvText) throw new Error('Failed to retrieve CSV from ServiceNow tab');
  return syncToSheets(csvText);
}

// ── Internal sync (from content script or popup) ──────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'sync') return false;

  syncToSheets(message.csvText)
    .then((rowCount) => {
      const syncedAt = new Date().toISOString();
      chrome.storage.local.set({ lastSyncedAt: syncedAt, lastRowCount: rowCount });
      sendResponse({ ok: true, rowCount });
    })
    .catch((err) => {
      sendResponse({ ok: false, error: err.message });
    });

  return true; // keep message channel open for async response
});
