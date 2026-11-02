import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Avatar, Empty, Modal, Toast } from "../components/ui";

export default function Settings() {
  const [tab, setTab] = useState("policy");
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  return (
    <>
      <div className="pill-tabs">
        {[["policy", "Attendance policy"], ["networks", "Office networks"], ["apps", "Apps & Websites"], ["roles", "Managers & roles"], ["agent", "Agent & data"]]
          .map(([k, label]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === "policy" && <PolicyTab flash={flash} />}
      {tab === "networks" && <NetworksTab flash={flash} />}
      {tab === "apps" && <AppsTab flash={flash} />}
      {tab === "roles" && <RolesTab flash={flash} />}
      {tab === "agent" && <AgentTab flash={flash} />}
      <Toast msg={toast} />
    </>
  );
}

function PolicyTab({ flash }) {
  const [p, setP] = useState(null);
  useEffect(() => { api.getPolicy().then(setP); }, []);
  if (!p) return null;
  const set = (k, v) => setP({ ...p, [k]: v });
  async function save() { await api.putPolicy(p); flash("Policy saved — attendance recomputed"); }
  return (
    <div className="card"><div className="card-head"><h3>Attendance policy</h3></div><div className="card-body">
      <div className="fieldset-grid">
        <Field label="Work start"><input type="time" value={p.work_start} onChange={(e) => set("work_start", e.target.value)} /></Field>
        <Field label="Mark late after"><input type="time" value={p.late_after} onChange={(e) => set("late_after", e.target.value)} /></Field>
        <Field label="Half-day if under (hours)"><input type="number" value={p.half_day_under_hours} onChange={(e) => set("half_day_under_hours", +e.target.value)} /></Field>
        <Field label="Full day target (hours)"><input type="number" value={p.full_day_hours} onChange={(e) => set("full_day_hours", +e.target.value)} /></Field>
        <Field label="Max break (minutes)"><input type="number" value={p.max_break_minutes} onChange={(e) => set("max_break_minutes", +e.target.value)} /></Field>
        <Field label="Timezone"><input value={p.timezone} onChange={(e) => set("timezone", e.target.value)} /></Field>
      </div>
      <div className="hint" style={{ marginBottom: 14 }}>Saving re-computes the attendance grid instantly — these rules aren't hard-coded.</div>
      <button className="btn btn-primary" onClick={save}>Save policy</button>
    </div></div>
  );
}

function NetworksTab({ flash }) {
  const [nets, setNets] = useState(null);
  const [add, setAdd] = useState(false);
  const reload = () => api.networks().then(setNets);
  useEffect(() => { reload(); }, []);
  if (!nets) return null;
  async function del(id) { await api.delNetwork(id); reload(); flash("Network removed"); }
  return (
    <div className="card">
      <div className="card-head"><h3>Office networks</h3><div className="spacer" /><button className="btn btn-primary btn-sm" onClick={() => setAdd(true)}>+ Add network</button></div>
      <div className="card-body">
        <div className="hint" style={{ marginBottom: 14 }}>A machine on any of these Wi-Fi networks counts as <b>In office</b>; anything else is <b>Remote</b>. SSID is used by default; add BSSID or IP range for a spoof-resistant match.</div>
        {nets.length ? (
          <table><thead><tr><th>Label</th><th>SSID</th><th>BSSID</th><th>IP range</th><th></th></tr></thead><tbody>
            {nets.map((n) => (
              <tr key={n.id}><td>{n.label}</td><td className="tnum">{n.ssid}</td>
                <td className="tnum" style={{ color: "var(--muted)" }}>{n.bssid || "—"}</td>
                <td className="tnum" style={{ color: "var(--muted)" }}>{n.ip_range || "—"}</td>
                <td style={{ textAlign: "right" }}><button className="btn btn-danger btn-sm" onClick={() => del(n.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody></table>
        ) : <Empty title="No office networks" msg="Add your office Wi-Fi so location detection works." />}
      </div>
      {add && <AddNetwork onClose={() => setAdd(false)} onDone={() => { setAdd(false); reload(); flash("Network added"); }} />}
    </div>
  );
}

function AddNetwork({ onClose, onDone }) {
  const [f, setF] = useState({ label: "", ssid: "", bssid: "", ip_range: "" });
  const set = (k, v) => setF({ ...f, [k]: v });
  const [err, setErr] = useState("");
  async function save() {
    if (!f.label || !f.ssid) { setErr("Label and SSID are required"); return; }
    try { await api.addNetwork(f); onDone(); } catch (e) { setErr(e.message); }
  }
  return (
    <Modal title="Add office network" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Add network</button></>}>
      {err && <div className="err">{err}</div>}
      <Field label="Label"><input value={f.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. HQ — Main Floor" /></Field>
      <Field label="Wi-Fi name (SSID)"><input value={f.ssid} onChange={(e) => set("ssid", e.target.value)} placeholder="e.g. ACK-Office" /></Field>
      <div className="fieldset-grid">
        <Field label="BSSID (optional)"><input value={f.bssid} onChange={(e) => set("bssid", e.target.value)} placeholder="router MAC" /></Field>
        <Field label="IP range (optional)"><input value={f.ip_range} onChange={(e) => set("ip_range", e.target.value)} placeholder="103.21.44.0/24" /></Field>
      </div>
    </Modal>
  );
}

const CAT_CLS = { productive: "b-present", unproductive: "b-absent", neutral: "b-weekend" };
const CAT_LBL = { productive: "Productive", unproductive: "Unproductive", neutral: "Neutral" };

function AppsTab({ flash }) {
  const [kind, setKind] = useState("app");   // app | website
  const [apps, setApps] = useState(null);
  const [disc, setDisc] = useState(null);
  const [add, setAdd] = useState(false);
  const [del, setDel] = useState(null);

  const reload = () => {
    api.apps().then(setApps);
    api.uncategorized().then(setDisc).catch(() => setDisc({ apps: [], websites: [] }));
  };
  useEffect(() => { reload(); }, []);
  if (!apps) return null;

  const items = apps.filter((a) => (a.kind || "app") === kind);
  const groups = { productive: [], unproductive: [], neutral: [] };
  items.forEach((a) => groups[a.category].push(a));
  const discovered = disc ? (kind === "app" ? disc.apps : disc.websites) : [];
  const noun = kind === "app" ? "application" : "website";

  async function recat(a, cat) { await api.recatApp(a.id, { name: a.name, category: cat }); flash("Moved " + a.name + " to " + CAT_LBL[cat]); reload(); }
  async function quickAdd(name, cat) {
    try { await api.addApp({ name, category: cat, kind }); flash("Added " + name + " as " + CAT_LBL[cat]); reload(); }
    catch (e) { flash(e.message); }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>{kind === "app" ? "Applications" : "Websites"}</h3>
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setAdd(true)}>+ Add {noun}</button>
      </div>
      <div className="card-body">
        <div className="pill-tabs" style={{ marginBottom: 16 }}>
          <button className={kind === "app" ? "active" : ""} onClick={() => setKind("app")}>Applications</button>
          <button className={kind === "website" ? "active" : ""} onClick={() => setKind("website")}>Websites</button>
        </div>
        <div className="hint" style={{ marginBottom: 16 }}>
          Every productivity number depends on these labels. {kind === "website" ? "Websites are matched by domain (e.g. youtube.com covers all its pages)." : "Desktop apps are matched by name."}
        </div>

        {discovered.length > 0 && (
          <div style={{ border: "1px dashed var(--line-strong)", borderRadius: 8, padding: 14, marginBottom: 18, background: "var(--surface-2)" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Seen recently, not categorized ({discovered.length})</div>
            <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>Tag these from real usage — pick a category for each.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {discovered.slice(0, 12).map((d) => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name} <span style={{ color: "var(--muted)" }}>· {d.hits} hits</span></span>
                  <button className="btn btn-ghost btn-sm" onClick={() => quickAdd(d.name, "productive")}>Productive</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => quickAdd(d.name, "unproductive")}>Unproductive</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => quickAdd(d.name, "neutral")}>Neutral</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {["productive", "unproductive", "neutral"].map((cat) => (
          <div key={cat} style={{ marginBottom: 18 }}>
            <div style={{ marginBottom: 10 }}><span className={"badge " + CAT_CLS[cat]}>{CAT_LBL[cat]}</span></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {groups[cat].length ? groups[cat].map((a) => (
                <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid var(--line)", borderRadius: 999, padding: "5px 6px 5px 12px", fontSize: 13 }}>
                  {a.name}
                  <select className="inp" style={{ padding: "3px 6px", fontSize: 12 }} value={a.category} onChange={(e) => recat(a, e.target.value)}>
                    <option value="productive">P</option><option value="unproductive">U</option><option value="neutral">N</option>
                  </select>
                  <button className="x-btn" style={{ fontSize: 16, padding: "0 4px" }} onClick={() => setDel(a)}>×</button>
                </span>
              )) : <span style={{ color: "var(--muted)", fontSize: 13 }}>None</span>}
            </div>
          </div>
        ))}
      </div>

      {add && <AddApp kind={kind} onClose={() => setAdd(false)} onDone={(name) => { setAdd(false); reload(); flash("Added " + name); }} />}
      {del && (
        <Modal title={"Remove " + noun} onClose={() => setDel(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setDel(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={async () => { const n = del.name; await api.delApp(del.id); setDel(null); reload(); flash("Removed " + n); }}>Remove</button></>}>
          <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>Remove <b>{del.name}</b> from categories? Past data keeps its existing label; new activity for it becomes uncategorized until you add it again.</div>
        </Modal>
      )}
    </div>
  );
}

function AddApp({ kind, onClose, onDone }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState("productive");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const isWeb = kind === "website";

  // live preview of how a website domain will be stored
  const preview = isWeb ? name.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase() : name.trim();

  async function save() {
    if (!name.trim()) { setErr(isWeb ? "Enter a website domain" : "Enter an application name"); return; }
    setBusy(true); setErr("");
    try { await api.addApp({ name, category: cat, kind }); onDone(preview || name.trim()); }
    catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title={isWeb ? "Add website" : "Add application"} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Adding…" : "Add"}</button></>}>
      {err && <div className="err">{err}</div>}
      <Field label={isWeb ? "Website domain" : "Application name"}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isWeb ? "e.g. youtube.com" : "e.g. Visual Studio Code"} autoFocus />
      </Field>
      {isWeb && preview && <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>Will be saved as <b>{preview}</b> and match all its pages.</div>}
      <Field label="Category">
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="productive">Productive</option>
          <option value="unproductive">Unproductive</option>
          <option value="neutral">Neutral</option>
        </select>
      </Field>
    </Modal>
  );
}

function RolesTab({ flash }) {
  const [users, setUsers] = useState(null);
  const [pw, setPw] = useState(false);
  useEffect(() => { api.users().then(setUsers); }, []);
  if (!users) return null;
  const managers = users.filter((u) => u.role === "manager");
  return (
    <div className="card"><div className="card-head"><h3>Managers &amp; team assignments</h3></div><div className="card-body">
      <div className="hint" style={{ marginBottom: 14 }}>Promote a recruiter to manager from the Users screen. Managers sign in to see their assigned team only — never their own data.</div>
      {managers.length ? (
        <table><thead><tr><th>Manager</th><th>Team</th><th></th></tr></thead><tbody>
          {managers.map((m) => (
            <tr key={m.id}>
              <td><div className="u-cell"><Avatar name={m.name} /><div><div className="nm">{m.name}</div><div className="em">{m.email}</div></div></div></td>
              <td>{m.team}</td>
              <td style={{ textAlign: "right" }}><button className="btn btn-danger btn-sm" onClick={async () => { await api.demote(m.id); api.users().then(setUsers); flash("Demoted"); }}>Demote</button></td>
            </tr>
          ))}
        </tbody></table>
      ) : <Empty title="No managers yet" msg="Promote a recruiter from the Users screen." />}
      <div style={{ marginTop: 20, borderTop: "1px solid var(--line)", paddingTop: 18 }}>
        <h4 style={{ fontSize: 14, marginBottom: 10 }}>Admin login</h4>
        <button className="btn btn-ghost btn-sm" onClick={() => setPw(true)}>Change admin password</button>
      </div>
      {pw && <ChangePw onClose={() => setPw(false)} onDone={() => { setPw(false); flash("Admin password updated"); }} />}
    </div></div>
  );
}

function ChangePw({ onClose, onDone }) {
  const [p, setP] = useState(""); const [err, setErr] = useState("");
  async function save() { if (!p) { setErr("Enter a password"); return; } await api.changeAdminPassword(p); onDone(); }
  return (
    <Modal title="Change admin password" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Update</button></>}>
      {err && <div className="err">{err}</div>}
      <Field label="New admin password"><input type="password" value={p} onChange={(e) => setP(e.target.value)} /></Field>
    </Modal>
  );
}

function AgentTab({ flash }) {
  const [a, setA] = useState(null);
  useEffect(() => { api.getAgent().then(setA); }, []);
  if (!a) return null;
  const set = (k, v) => setA({ ...a, [k]: v });
  async function save() { await api.putAgent(a); flash("Agent settings saved"); }
  return (
    <div className="card"><div className="card-head"><h3>Agent settings</h3></div><div className="card-body">
      <div className="fieldset-grid">
        <Field label="Heartbeat (seconds)"><input type="number" value={a.heartbeat} onChange={(e) => set("heartbeat", +e.target.value)} /></Field>
        <Field label="Idle threshold (minutes)"><input type="number" value={a.idle_threshold} onChange={(e) => set("idle_threshold", +e.target.value)} /></Field>
        <Field label="Screenshot interval (minutes)"><input type="number" value={a.screenshot_interval} onChange={(e) => set("screenshot_interval", +e.target.value)} /></Field>
        <Field label="Screenshots"><select value={a.screenshots_enabled ? "1" : "0"} onChange={(e) => set("screenshots_enabled", e.target.value === "1")}><option value="0">Off</option><option value="1">On (with consent notice)</option></select></Field>
      </div>
      <button className="btn btn-primary" onClick={save}>Save agent settings</button>
      <div className="hint" style={{ marginTop: 16 }}>Agents read these settings on their next check-in. Re-run <code>python seed.py</code> on the backend to reset demo data.</div>
    </div></div>
  );
}

function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}
