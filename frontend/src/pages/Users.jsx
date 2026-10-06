import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../App";
import { Avatar, StatusBadge, Empty, Modal, Toast } from "../components/ui";

export default function Users() {
  const { user } = useAuth();
  const admin = user.role === "admin";
  const nav = useNavigate();
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);   // {type, user}
  const [toast, setToast] = useState("");

  const reload = () => api.users().then(setUsers).catch(() => {});
  useEffect(() => { reload(); }, []);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  if (!users) return <div className="card"><div className="card-body">Loading…</div></div>;

  const list = users.filter((u) => {
    const okq = !q || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase());
    const okf = filter === "all" || (filter === "managers" && u.role === "manager") ||
      (filter === "recruiters" && u.role === "recruiter");
    return okq && okf;
  });

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
          <input placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="inp" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All roles</option>
          <option value="managers">Managers</option>
          <option value="recruiters">Recruiters</option>
        </select>
        <div className="spacer" />
        {admin && <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: "add" })}>+ Add recruiter</button>}
      </div>

      <div className="card">
        {list.length ? (
          <table>
            <thead><tr><th>Name</th><th>Team</th><th>Role</th><th>Today</th><th>Location</th>{admin && <th>Device</th>}{admin && <th></th>}</tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="clickable" onClick={() => nav(`/users/${u.id}`)}>
                  <td><div className="u-cell"><Avatar name={u.name} /><div><div className="nm">{u.name}</div><div className="em">{u.email}</div></div></div></td>
                  <td>{u.team}</td>
                  <td><span className={"badge b-" + u.role}>{u.role === "manager" ? "Manager" : "Recruiter"}</span></td>
                  <td><StatusBadge status={u.status} /></td>
                  <td>{u.location ? <span className={"badge " + (u.location === "office" ? "b-office" : "b-remote")}>{u.location === "office" ? "In office" : "Remote"}</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  {admin && <td style={{ fontSize: 12, color: "var(--muted)" }} className="tnum">{u.device || "—"}</td>}
                  {admin && (
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      {u.role === "recruiter"
                        ? <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: "make", user: u })}>Make manager</button>
                        : <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: "team", user: u })}>Edit team</button>}
                      <button className="btn btn-danger btn-sm" style={{ marginLeft: 8 }} onClick={() => setModal({ type: "delete", user: u })}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty title="No people match" msg="Try a different search or filter." />}
      </div>

      {modal?.type === "add" && <AddModal onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); flash("Recruiter added"); }} managers={users.filter((u) => u.role === "manager")} />}
      {modal?.type === "make" && <MakeManagerModal target={modal.user} recruiters={users.filter((u) => u.role === "recruiter")} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); flash("Manager created"); }} />}
      {modal?.type === "team" && <TeamModal manager={modal.user} recruiters={users.filter((u) => u.role === "recruiter")} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); flash("Team updated"); }} />}
      {modal?.type === "delete" && <DeleteModal target={modal.user} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); flash("User deleted"); }} />}
      <Toast msg={toast} />
    </>
  );
}

function AddModal({ onClose, onDone, managers }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [mgr, setMgr] = useState("");
  const [err, setErr] = useState("");
  async function save() {
    try { await api.addRecruiter({ name, email, manager_id: mgr ? +mgr : null }); onDone(); }
    catch (e) { setErr(e.message); }
  }
  return (
    <Modal title="Add recruiter" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Add recruiter</button></>}>
      {err && <div className="err">{err}</div>}
      <div className="field"><label>Full name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aisha Rahman" /></div>
      <div className="field"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@acknowledger.in" /></div>
      <div className="field"><label>Assign to manager</label>
        <select value={mgr} onChange={(e) => setMgr(e.target.value)}>
          <option value="">— Unassigned —</option>
          {managers.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.team}</option>)}
        </select>
      </div>
      <div className="hint">In production, recruiters add themselves via the agent's one-time signup. Add here for quick setup.</div>
    </Modal>
  );
}

function MakeManagerModal({ target, recruiters, onClose, onDone }) {
  const [username, setU] = useState((target.name.split(" ")[0] || "").toLowerCase());
  const [password, setP] = useState("");
  const [ids, setIds] = useState([]);
  const [err, setErr] = useState("");
  const toggle = (id) => setIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  async function save() {
    if (!username || !password) { setErr("Set a username and password"); return; }
    try { await api.makeManager(target.id, { username, password, recruiter_ids: ids }); onDone(); }
    catch (e) { setErr(e.message); }
  }
  return (
    <Modal title="Make manager" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Create manager</button></>}>
      {err && <div className="err">{err}</div>}
      <div style={{ marginBottom: 16, fontSize: 13.5, color: "var(--ink-soft)" }}>Promote <b>{target.name}</b> to manager. You set their login directly.</div>
      <div className="fieldset-grid">
        <div className="field"><label>Username</label><input value={username} onChange={(e) => setU(e.target.value)} /></div>
        <div className="field"><label>Password</label><input value={password} onChange={(e) => setP(e.target.value)} placeholder="Set a password" /></div>
      </div>
      <div className="field"><label>Assign recruiters</label>
        <div className="check-list">
          {recruiters.filter((r) => r.id !== target.id).map((r) => (
            <label className="check-item" key={r.id}><input type="checkbox" checked={ids.includes(r.id)} onChange={() => toggle(r.id)} /><span>{r.name} <span style={{ color: "var(--muted)", fontSize: 12 }}>· {r.team}</span></span></label>
          ))}
        </div>
        <div className="hint">The manager sees only these people, and can change their own password after signing in.</div>
      </div>
    </Modal>
  );
}

function DeleteModal({ target, onClose, onDone }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function del() {
    setBusy(true); setErr("");
    try { await api.deleteUser(target.id); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title="Delete user" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-danger" onClick={del} disabled={busy}>{busy ? "Deleting…" : "Delete permanently"}</button></>}>
      {err && <div className="err">{err}</div>}
      <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
        Permanently delete <b>{target.name}</b> ({target.email}) and all of their
        activity and attendance records? This can't be undone.
        {target.role === "manager" && <div className="hint" style={{ marginTop: 8 }}>This person is a manager — their recruiters will be left unassigned.</div>}
      </div>
    </Modal>
  );
}

function TeamModal({ manager, recruiters, onClose, onDone }) {
  const [ids, setIds] = useState(recruiters.filter((r) => r.team === manager.team).map((r) => r.id));
  const toggle = (id) => setIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  async function save() { await api.setTeam(manager.id, ids); onDone(); }
  async function demote() { await api.demote(manager.id); onDone(); }
  return (
    <Modal title="Edit team" onClose={onClose}
      footer={<><button className="btn btn-danger" onClick={demote}>Demote to recruiter</button><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save team</button></>}>
      <div style={{ marginBottom: 14, fontSize: 13.5, color: "var(--ink-soft)" }}>Recruiters reporting to <b>{manager.name}</b></div>
      <div className="check-list">
        {recruiters.map((r) => (
          <label className="check-item" key={r.id}><input type="checkbox" checked={ids.includes(r.id)} onChange={() => toggle(r.id)} /><span>{r.name} <span style={{ color: "var(--muted)", fontSize: 12 }}>· {r.team}</span></span></label>
        ))}
      </div>
    </Modal>
  );
}
