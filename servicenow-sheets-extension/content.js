// Injected into every *.service-now.com frame.
// Only activates when the frame URL looks like a list view.

(function () {
  'use strict';

  // ── List-view detection ───────────────────────────────────────────────────

  function isListView() {
    const url = window.location.href;
    // Matches patterns like /incident_list.do, /task_list.do, /u_my_table_list.do
    // Also handles ?uri=...list.do inside nav_to frames
    return (
      /_list\.do/.test(url) ||
      /list\.do/.test(url) ||
      url.includes('sysparm_list') ||
      // Some instances use this older pattern
      /\.do\?.*sysparm_view/.test(url)
    );
  }

  function buildCSVUrl() {
    const url = new URL(window.location.href);
    // Remove any pre-existing CSV param to avoid duplication
    url.searchParams.delete('CSV');
    // ServiceNow CSV export: append CSV to the query string (no value needed)
    return url.toString() + (url.search ? '&CSV' : '?CSV');
  }

  // ── Button injection ──────────────────────────────────────────────────────

  const BUTTON_ID = '__sn_sheets_sync_btn';

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return; // already injected

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.textContent = '⬆ Sync to Sheet';
    Object.assign(btn.style, {
      position:     'fixed',
      top:          '12px',
      right:        '14px',
      zIndex:       '2147483647',
      padding:      '7px 14px',
      background:   '#1a73e8',
      color:        '#fff',
      border:       'none',
      borderRadius: '6px',
      fontSize:     '13px',
      fontWeight:   '600',
      cursor:       'pointer',
      boxShadow:    '0 2px 6px rgba(0,0,0,.35)',
      transition:   'background .15s, opacity .15s',
      lineHeight:   '1.4',
      fontFamily:   'sans-serif',
    });

    btn.addEventListener('mouseenter', () => { btn.style.background = '#1558b0'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = btnCurrentColor(); });
    btn.addEventListener('click', onSyncClick);

    document.body.appendChild(btn);
  }

  function btnCurrentColor() {
    const btn = document.getElementById(BUTTON_ID);
    return btn ? btn.dataset.color || '#1a73e8' : '#1a73e8';
  }

  // ── Sync flow ─────────────────────────────────────────────────────────────

  function setButtonState(state, text) {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;
    const colors = { idle: '#1a73e8', busy: '#888', success: '#188038', error: '#c5221f' };
    const bg = colors[state] || colors.idle;
    btn.dataset.color = bg;
    btn.style.background = bg;
    btn.textContent = text;
    btn.disabled = (state === 'busy');
    btn.style.opacity = (state === 'busy') ? '0.8' : '1';
  }

  async function onSyncClick() {
    setButtonState('busy', '⏳ Fetching CSV…');

    let csvText;
    try {
      csvText = await fetchCSV();
    } catch (err) {
      setButtonState('error', '✗ Fetch failed');
      console.error('[SN→Sheets] CSV fetch error:', err);
      setTimeout(() => setButtonState('idle', '⬆ Sync to Sheet'), 3000);
      return;
    }

    setButtonState('busy', '⏳ Pushing to Sheet…');

    chrome.runtime.sendMessage({ action: 'sync', csvText }, (response) => {
      if (chrome.runtime.lastError) {
        setButtonState('error', '✗ Extension error');
        console.error('[SN→Sheets]', chrome.runtime.lastError.message);
        setTimeout(() => setButtonState('idle', '⬆ Sync to Sheet'), 3000);
        return;
      }
      if (response && response.ok) {
        setButtonState('success', `✓ Synced ${response.rowCount - 1} rows`);
        setTimeout(() => setButtonState('idle', '⬆ Sync to Sheet'), 4000);
      } else {
        setButtonState('error', '✗ Sync failed');
        console.error('[SN→Sheets] Sync error:', response?.error);
        setTimeout(() => setButtonState('idle', '⬆ Sync to Sheet'), 3000);
      }
    });
  }

  async function fetchCSV() {
    const csvUrl = buildCSVUrl();
    const res = await fetch(csvUrl, {
      credentials: 'include', // send ServiceNow session cookie
      headers: { 'Accept': 'text/csv,text/plain,*/*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${csvUrl}`);
    const text = await res.text();
    if (!text.trim()) throw new Error('Empty response from ServiceNow CSV export');
    return text;
  }

  // ── Popup-triggered sync (message from popup.js) ─────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action !== 'popupSync') return false;
    if (!isListView()) {
      sendResponse({ ok: false, error: 'Not on a list view page' });
      return true;
    }
    fetchCSV()
      .then((csvText) =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'sync', csvText }, resolve);
        })
      )
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async
  });

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    if (!isListView()) return;
    // Wait for body if it's not ready yet (rare in document_idle, but safe)
    if (document.body) {
      injectButton();
    } else {
      document.addEventListener('DOMContentLoaded', injectButton);
    }
  }

  init();

  // ServiceNow is a SPA — re-check on URL changes (e.g., navigating between lists)
  let lastHref = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      const btn = document.getElementById(BUTTON_ID);
      if (btn) btn.remove();
      init();
    }
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

})();
