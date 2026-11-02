const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const APP_VERSION = "01.00.01";

function token() {
  return localStorage.getItem("ack_token");
}

// Download a file (xlsx, etc.) from an authenticated endpoint.
export async function downloadFile(path, filename) {
  const headers = {};
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(BASE + path, { headers });
  if (!res.ok) throw new Error("Export failed (" + res.status + ")");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function req(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem("ack_token");
    localStorage.removeItem("ack_user");
    if (!location.hash.includes("login")) location.reload();
  }
  if (!res.ok) {
    let msg = "Request failed";
    try { msg = (await res.json()).detail || msg; } catch (_) {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (username, password) => req("/auth/login", { method: "POST", body: { username, password } }),
  me: () => req("/auth/me"),

  dashboard: () => req("/analytics/dashboard"),
  live: () => req("/analytics/live"),
  productivity: (days) => req(`/analytics/productivity?days=${days}`),

  users: () => req("/users"),
  user: (id) => req(`/users/${id}`),
  addRecruiter: (body) => req("/users", { method: "POST", body }),
  makeManager: (id, body) => req(`/users/${id}/make-manager`, { method: "POST", body }),
  setTeam: (id, ids) => req(`/users/${id}/team`, { method: "POST", body: { recruiter_ids: ids } }),
  demote: (id) => req(`/users/${id}/demote`, { method: "POST" }),
  deleteUser: (id) => req(`/users/${id}`, { method: "DELETE" }),

  grid: (y, m) => req(`/attendance/grid?year=${y}&month=${m}`),
  day: (uid, date) => req(`/attendance/day?user_id=${uid}&date=${date}`),
  override: (body) => req("/attendance/override", { method: "POST", body }),
  clearOverride: (uid, date) => req(`/attendance/override?user_id=${uid}&date=${date}`, { method: "DELETE" }),

  getPolicy: () => req("/settings/policy"),
  putPolicy: (body) => req("/settings/policy", { method: "PUT", body }),
  networks: () => req("/settings/networks"),
  addNetwork: (body) => req("/settings/networks", { method: "POST", body }),
  delNetwork: (id) => req(`/settings/networks/${id}`, { method: "DELETE" }),
  apps: () => req("/settings/apps"),
  addApp: (body) => req("/settings/apps", { method: "POST", body }),
  recatApp: (id, body) => req(`/settings/apps/${id}`, { method: "PUT", body }),
  delApp: (id) => req(`/settings/apps/${id}`, { method: "DELETE" }),
  uncategorized: (days = 14) => req(`/settings/uncategorized?days=${days}`),

  reportSummary: (start, end) => req(`/reports/summary?start=${start}&end=${end}`),
  getAgent: () => req("/settings/agent"),
  putAgent: (body) => req("/settings/agent", { method: "PUT", body }),
  changeAdminPassword: (password) => req("/settings/admin-password", { method: "PUT", body: { password } }),
};

export const helpers = {
  minToHM(m) { if (m == null) return "—"; const h = Math.floor(m / 60), mm = m % 60; return (h ? h + "h " : "") + mm + "m"; },
  minToClock(m) { if (m == null) return "—"; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); },
  initials(n) { return n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase(); },
};
