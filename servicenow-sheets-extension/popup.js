const DEFAULT_HUB = 'https://hub-tools-production.up.railway.app';
// Pre-filled so Feedback works the first time without hunting for the export
// URL again — this is the sysparm_query the user already uses today.
const DEFAULT_FEEDBACK_URL =
  'https://koneprod.service-now.com/now/nav/ui/classic/params/target/asmt_metric_result_list.do' +
  '%3Fsysparm_query%3DmetricLIKEQuality%2520Rating%255EORmetricLIKEOverall%2520Rating' +
  '%255EORmetricLIKETimeliness%2520Rating%255EORmetricLIKEInteraction%2520Rating' +
  '%255EORmetricLIKESpecialist%2520Name%255EORmetricLIKEDetailed%2520Feedback%2520comments' +
  '%255EORmetricLIKEService%2520Type%26sysparm_first_row%3D1%26sysparm_view%3D';

const $ = id => document.getElementById(id);
let currentDs = 'tickets';

function setStatus(msg, kind = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status' + (kind ? ' ' + kind : '');
}

function showLast(stamp) {
  if (!stamp?.syncedAt) { $('last').textContent = ''; return; }
  const when = new Date(stamp.syncedAt);
  $('last').textContent = `Last sync: ${stamp.rowCount ?? 0} rows · ${when.toLocaleString()}`;
}

function showAutoLast(stamp) {
  const el = $('autoLast');
  if (!stamp?.at) { el.textContent = ''; el.className = 'last'; return; }
  const when = new Date(stamp.at).toLocaleString();
  el.textContent = stamp.ok
    ? `Last automatic sync: ${stamp.rowCount ?? 0} rows · ${when}`
    : `Last automatic sync: ${stamp.error} · ${when}`;
  el.className = stamp.ok ? 'last' : 'last err';
}

async function saveAuto() {
  await chrome.storage.local.set({
    autoSync: $('autoSync').checked,
    autoSyncMinutes: Number($('autoEvery').value),
  });
  $('autoEvery').disabled = !$('autoSync').checked;
  // The alarm lives in the service worker, so it has to re-read the setting.
  chrome.runtime.sendMessage({ action: 'applyAutoSync' }, () => void chrome.runtime.lastError);
}

function urlFieldFor(ds) { return ds === 'feedback' ? 'feedbackSnUrl' : 'snUrl'; }
function storageKeyFor(ds) { return ds === 'feedback' ? 'feedbackSnUrl' : 'snUrl'; }

async function switchTab(ds) {
  currentDs = ds;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.ds === ds));
  document.querySelectorAll('.ds-panel').forEach(p => { p.hidden = p.dataset.ds !== ds; });
  setStatus('');
  const stamp = (await chrome.storage.local.get(`last_${ds}`))[`last_${ds}`];
  showLast(stamp);
}

document.addEventListener('DOMContentLoaded', async () => {
  const cfg = await chrome.storage.local.get([
    'snUrl', 'feedbackSnUrl', 'hubUrl', 'autoSync', 'autoSyncMinutes', 'autoLast',
  ]);
  $('snUrl').value = cfg.snUrl || '';
  $('feedbackSnUrl').value = cfg.feedbackSnUrl || DEFAULT_FEEDBACK_URL;
  $('hubUrl').value = cfg.hubUrl || DEFAULT_HUB;
  $('autoSync').checked = !!cfg.autoSync;
  $('autoEvery').value = String(cfg.autoSyncMinutes || 60);
  $('autoEvery').disabled = !cfg.autoSync;
  showAutoLast(cfg.autoLast);
  await switchTab('tickets');
  if (!cfg.snUrl) $('cfg').open = true;

  document.querySelectorAll('.tab').forEach(b =>
    b.addEventListener('click', () => switchTab(b.dataset.ds)));

  $('autoSync').addEventListener('change', async () => {
    if ($('autoSync').checked && !$('snUrl').value.trim()) {
      $('autoSync').checked = false;
      $('cfg').open = true;
      setStatus('Add the ServiceNow list URL first', 'err');
      return;
    }
    await saveAuto();
    setStatus($('autoSync').checked ? 'Automatic sync on' : 'Automatic sync off', 'ok');
  });
  $('autoEvery').addEventListener('change', saveAuto);

  $('saveBtn').addEventListener('click', async () => {
    await chrome.storage.local.set({
      snUrl: $('snUrl').value.trim(),
      feedbackSnUrl: $('feedbackSnUrl').value.trim(),
      hubUrl: ($('hubUrl').value.trim() || DEFAULT_HUB).replace(/\/+$/, ''),
    });
    setStatus('Saved', 'ok');
  });

  $('syncBtn').addEventListener('click', async () => {
    const field = urlFieldFor(currentDs);
    const snUrl = $(field).value.trim();
    if (!snUrl) { $('cfg').open = true; setStatus('Add the ServiceNow list URL first', 'err'); return; }
    $('syncBtn').disabled = true;
    setStatus(`Fetching ${currentDs} from ServiceNow…`);
    chrome.runtime.sendMessage({ action: 'sync', snUrl, dataset: currentDs }, (res) => {
      $('syncBtn').disabled = false;
      if (chrome.runtime.lastError) { setStatus(chrome.runtime.lastError.message, 'err'); return; }
      if (!res?.ok) { setStatus(res?.error || 'Sync failed', 'err'); return; }
      const label = currentDs === 'feedback'
        ? `Synced ${res.total_rows} feedback rows (${(res.specialists || []).length} specialists)`
        : `Synced ${res.total_rows} rows`;
      setStatus(label, 'ok');
      chrome.storage.local.get(`last_${currentDs}`).then(o => showLast(o[`last_${currentDs}`]));
    });
  });
});
