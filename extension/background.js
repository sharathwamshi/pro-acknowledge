// Reports the active tab's hostname to the backend on a timer.
// The device token is stored once via the options page (shared with the
// desktop agent's token so events attach to the same person).

const DEFAULT_SERVER = "https://1988-106-51-81-13.ngrok-free.app";

async function getCfg() {
  const { server_url, device_token } = await chrome.storage.local.get(["server_url", "device_token"]);
  return { server_url: server_url || DEFAULT_SERVER, device_token };
}

async function activeHost() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.url) return null;
  try { return new URL(tab.url).hostname.replace(/^www\./, ""); }
  catch { return null; }
}

async function report() {
  const cfg = await getCfg();
  if (!cfg.device_token) return;               // not configured yet
  const host = await activeHost();
  if (!host) return;
  const state = await chrome.idle.queryState(300);
  const ev = {
    ts: new Date().toISOString(),
    active_app: host,
    window_title: host,
    url: host,
    idle: state !== "active",
    ssid: null,
    bssid: null
  };
  try {
    await fetch(`${cfg.server_url}/agent/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Token": cfg.device_token },
      body: JSON.stringify({ events: [ev] })
    });
  } catch (_) { /* offline: desktop agent still captures window titles */ }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("report", { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "report") report(); });
