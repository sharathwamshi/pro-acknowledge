// Options page logic. Must be an external file — Chrome MV3 forbids inline
// <script> in extension pages (CSP script-src 'self').

const DEFAULT_SERVER = "https://proafpl.anametaiot.com";
const msg = document.getElementById("msg");

function show(text, ok) {
  msg.textContent = text;
  msg.className = "msg " + (ok ? "ok" : "err");
}

chrome.storage.local.get(["server_url", "device_token"], (c) => {
  document.getElementById("server").value = c.server_url || DEFAULT_SERVER;
  document.getElementById("token").value = c.device_token || "";
});

document.getElementById("save").addEventListener("click", () => {
  const server_url = document.getElementById("server").value.trim();
  const device_token = document.getElementById("token").value.trim();
  if (!device_token) { show("Enter a device token first.", false); return; }
  chrome.storage.local.set({ server_url, device_token }, () => show("Saved.", true));
});

document.getElementById("test").addEventListener("click", () => {
  // Save current values first so the test uses them.
  const server_url = document.getElementById("server").value.trim();
  const device_token = document.getElementById("token").value.trim();
  if (!device_token) { show("Enter a device token first.", false); return; }
  chrome.storage.local.set({ server_url, device_token }, () => {
    show("Testing…", true);
    chrome.runtime.sendMessage({ type: "test" }, (resp) => {
      if (chrome.runtime.lastError) { show("Error: " + chrome.runtime.lastError.message, false); return; }
      if (resp && resp.ok) show("Connected — the server accepted a test event.", true);
      else show("Failed: " + (resp ? resp.error : "no response"), false);
    });
  });
});
