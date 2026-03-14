async function load() {
  const keys = [
    'auto_test_enabled', 'interval_minutes',
    'notify_slow', 'slow_threshold', 'notify_outage',
    'ist_client_id',
  ];
  const s = await chrome.storage.local.get(keys);

  document.getElementById('autoEnabled').checked     = s.auto_test_enabled ?? false;
  document.getElementById('intervalRange').value     = s.interval_minutes  ?? 30;
  document.getElementById('intervalVal').textContent = s.interval_minutes  ?? 30;
  document.getElementById('notifySlow').checked      = s.notify_slow       ?? false;
  document.getElementById('slowThreshold').value     = s.slow_threshold    ?? 10;
  document.getElementById('notifyOutage').checked    = s.notify_outage     ?? true;
  document.getElementById('clientId').textContent    = s.ist_client_id     ?? 'Not assigned yet — open popup first.';
}

document.getElementById('intervalRange').addEventListener('input', e => {
  document.getElementById('intervalVal').textContent = e.target.value;
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  await chrome.storage.local.set({
    auto_test_enabled: document.getElementById('autoEnabled').checked,
    interval_minutes:  parseInt(document.getElementById('intervalRange').value, 10),
    notify_slow:       document.getElementById('notifySlow').checked,
    slow_threshold:    parseFloat(document.getElementById('slowThreshold').value),
    notify_outage:     document.getElementById('notifyOutage').checked,
  });

  chrome.runtime.sendMessage({ action: 'refresh_alarm' });

  const msg = document.getElementById('savedMsg');
  msg.style.display = 'inline';
  setTimeout(() => { msg.style.display = 'none'; }, 2500);
});

load();
