'use strict';

const syncBtn   = document.getElementById('sync-btn');
const lastSync  = document.getElementById('last-sync');
const rowCount  = document.getElementById('row-count');
const statusMsg = document.getElementById('status-msg');
const warning   = document.getElementById('warning');

// ── Load stored sync state ────────────────────────────────────────────────────

chrome.storage.local.get(['lastSyncedAt', 'lastRowCount'], ({ lastSyncedAt, lastRowCount }) => {
  if (lastSyncedAt) {
    lastSync.textContent = formatDate(lastSyncedAt);
  }
  if (lastRowCount !== undefined) {
    rowCount.textContent = `${lastRowCount - 1} data rows`;
  }
});

// ── Check if the active tab is a list view ────────────────────────────────────

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  const url = tab.url || '';
  const onListView = /_list\.do|list\.do/.test(url) && url.includes('service-now.com');
  if (onListView) {
    syncBtn.disabled = false;
    warning.classList.add('hidden');
  } else {
    warning.classList.remove('hidden');
  }
});

// ── Sync button ───────────────────────────────────────────────────────────────

syncBtn.addEventListener('click', async () => {
  setStatus('', '');
  syncBtn.disabled = true;
  syncBtn.textContent = '⏳ Syncing…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');

    // Ask content script to fetch CSV and relay to background
    const response = await sendMessageToTab(tab.id, { action: 'popupSync' });

    if (response?.ok) {
      const count = response.rowCount - 1;
      rowCount.textContent = `${count} data rows`;
      lastSync.textContent = formatDate(new Date().toISOString());
      setStatus('success', `✓ Synced ${count} rows`);
    } else {
      throw new Error(response?.error || 'Unknown error');
    }
  } catch (err) {
    setStatus('error', `✗ ${err.message}`);
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = 'Sync current list';
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatus(type, text) {
  statusMsg.textContent = text;
  statusMsg.className = 'status-msg' + (type ? ` ${type}` : '');
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// sendMessage to a content script tab, returning a promise
function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}
