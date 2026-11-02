// Reports the active tab's hostname to the backend on a timer.
// The device token is stored once via the options page (shared with the
// desktop agent's token so events attach to the same person).

const DEFAULT_SERVER = "https://proafpl.anametaiot.com";

async function getCfg() {
  const { server_url, device_token } = await chrome.storage.local.get(["server_url", "device_token"]);
  return { server_url: (server_url || DEFAULT_SERVER).replace(/\/+$/, ""), device_token };
}

async function activeHost() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.url) return null;
  try { return new URL(tab.url).hostname.replace(/^www\./, ""); }
  catch { return null; }
}

async function postEvents(cfg, events) {
  const res = await fetch(`${cfg.server_url}/agent/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Token": cfg.device_token,
      // ngrok-free shows a browser interstitial without this header; harmless elsewhere.
      "ngrok-skip-browser-warning": "true"
    },
    body: JSON.stringify({ events })
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function report() {
  const cfg = await getCfg();
  if (!cfg.device_token) return;               // not configured yet
  const host = await activeHost();
  if (!host) return;
  const state = await chrome.idle.queryState(300);
  const ev = {
    ts: new Date().toISOString(),
    active_app: host, window_title: host, url: host,
    idle: state !== "active", ssid: null, bssid: null
  };
  try { await postEvents(cfg, [ev]); }
  catch (e) { console.warn("Acknowledger: report failed —", e.message); }
}

function ensureAlarm() {
  chrome.alarms.create("report", { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); report(); });
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "report") report(); });

// Send one immediately when the token or server URL is saved, so the user
// doesn't wait up to a minute to see data land.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.device_token || changes.server_url)) report();
});

// Let the options page run a connection test and report the result.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "test") {
    (async () => {
      try {
        const cfg = await getCfg();
        if (!cfg.device_token) { sendResponse({ ok: false, error: "No device token set" }); return; }
        const r = await postEvents(cfg, [{
          ts: new Date().toISOString(),
          active_app: "extension-test", window_title: "extension-test", url: "extension-test",
          idle: false, ssid: null, bssid: null
        }]);
        sendResponse({ ok: true, result: r });
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
    })();
    return true;   // keep the message channel open for the async response
  }
});
