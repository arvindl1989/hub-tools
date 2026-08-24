const DEFAULT_HUB = 'https://hub-tools-production.up.railway.app';
const $ = id => document.getElementById(id);

function setStatus(msg, kind = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status' + (kind ? ' ' + kind : '');
}

function showLast({ lastSyncedAt, lastRowCount }) {
  if (!lastSyncedAt) { $('last').textContent = ''; return; }
  const when = new Date(lastSyncedAt);
  $('last').textContent = `Last sync: ${lastRowCount ?? 0} rows · ${when.toLocaleString()}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const cfg = await chrome.storage.local.get(['snUrl', 'hubUrl', 'lastSyncedAt', 'lastRowCount']);
  $('snUrl').value = cfg.snUrl || '';
  $('hubUrl').value = cfg.hubUrl || DEFAULT_HUB;
  showLast(cfg);
  // Nothing configured yet — open settings rather than failing on first click.
  if (!cfg.snUrl) $('cfg').open = true;

  $('saveBtn').addEventListener('click', async () => {
    await chrome.storage.local.set({
      snUrl: $('snUrl').value.trim(),
      hubUrl: ($('hubUrl').value.trim() || DEFAULT_HUB).replace(/\/+$/, ''),
    });
    setStatus('Saved', 'ok');
  });

  $('syncBtn').addEventListener('click', () => {
    const snUrl = $('snUrl').value.trim();
    if (!snUrl) { $('cfg').open = true; setStatus('Add the ServiceNow list URL first', 'err'); return; }
    $('syncBtn').disabled = true;
    setStatus('Fetching from ServiceNow…');
    chrome.runtime.sendMessage({ action: 'sync', snUrl }, (res) => {
      $('syncBtn').disabled = false;
      if (chrome.runtime.lastError) { setStatus(chrome.runtime.lastError.message, 'err'); return; }
      if (!res?.ok) { setStatus(res?.error || 'Sync failed', 'err'); return; }
      setStatus(`Synced ${res.total_rows} rows`, 'ok');
      chrome.storage.local.get(['lastSyncedAt', 'lastRowCount']).then(showLast);
    });
  });
});
