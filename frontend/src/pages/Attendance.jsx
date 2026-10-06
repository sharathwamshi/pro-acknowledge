import React, { useEffect, useState } from "react";
import { api, helpers } from "../api";
import { useAuth } from "../App";
import { Avatar, StatusBadge, Empty, Modal, Toast } from "../components/ui";

const LETTER = { present: "P", late: "L", half: "½", absent: "A", weekend: "" };

export default function Attendance() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loc, setLoc] = useState("all");
  const [grid, setGrid] = useState(null);
  const [day, setDay] = useState(null);     // {user_id, date}
  const [toast, setToast] = useState("");

  const reload = () => api.grid(year, month).then(setGrid).catch(() => {});
  useEffect(() => { reload(); }, [year, month]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const prev = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const next = () => {
    const limit = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
    if (limit) { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); }
  };

  function exportCsv() {
    if (!grid) return;
    let csv = "Recruiter," + grid.days.join(",") + "\n";
    grid.rows.forEach((r) => {
      csv += `"${r.name}",` + r.cells.map((c) => c.status ? (LETTER[c.status] || "-") : "").join(",") + "\n";
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `attendance-${year}-${String(month).padStart(2, "0")}.csv`; a.click();
    URL.revokeObjectURL(url); flash("CSV exported");
  }

  if (!grid) return <div className="card"><div className="card-body">Loading…</div></div>;

  return (
    <>
      <div className="toolbar">
        <button className="btn btn-ghost btn-sm" onClick={prev}>‹ Prev</button>
        <div style={{ fontWeight: 600, minWidth: 150, textAlign: "center" }}>{monthName}</div>
        <button className="btn btn-ghost btn-sm" onClick={next}>Next ›</button>
        <select className="inp" value={loc} onChange={(e) => setLoc(e.target.value)}>
          <option value="all">All locations</option>
          <option value="office">In office only</option>
          <option value="remote">Remote only</option>
        </select>
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="card att-scroll">
        {grid.rows.length ? (
          <table className="att">
            <thead>
              <tr>
                <th className="att-name">Recruiter</th>
                {grid.days.map((d, i) => <th key={i} style={{ textAlign: "center", padding: "8px 2px", color: grid.weekend[i] ? "var(--weekend)" : undefined }}>{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((r) => (
                <tr key={r.id}>
                  <td className="att-name"><div className="u-cell"><Avatar name={r.name} /><div><div className="nm" style={{ fontSize: 13 }}>{r.name}</div><div className="em">{r.team}</div></div></div></td>
                  {r.cells.map((c, i) => {
                    if (!c.status) return <td className="cell" key={i} />;
                    if (loc !== "all" && c.status !== "absent" && c.status !== "weekend" && c.loc !== loc) return <td className="cell" key={i} />;
                    return <td className="cell" key={i}><div className={"att-dot " + c.status} onClick={() => setDay({ user_id: r.id, date: c.date })}>{LETTER[c.status]}</div></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty title="No team members" msg="Nothing to show yet." />}
      </div>

      <div className="card" style={{ marginTop: 14 }}><div className="card-body">
        <div className="legend">
          <div className="it"><span className="sw" style={{ background: "var(--present-bg)" }} />P — Present</div>
          <div className="it"><span className="sw" style={{ background: "var(--late-bg)" }} />L — Late</div>
          <div className="it"><span className="sw" style={{ background: "var(--half-bg)" }} />½ — Half-day</div>
          <div className="it"><span className="sw" style={{ background: "var(--absent-bg)" }} />A — Absent</div>
          <div className="it"><span className="sw" style={{ background: "var(--weekend-bg)" }} />Weekend</div>
        </div>
        <div className="hint" style={{ marginTop: 10 }}>Status is computed from first/last activity against your attendance policy. Tap any day to see detail or correct it.</div>
      </div></div>

      {day && <DayModal day={day} canEdit={user.role === "admin" || user.role === "manager"} onClose={() => setDay(null)} onChanged={() => { reload(); flash("Attendance updated"); }} />}
      <Toast msg={toast} />
    </>
  );
}

function DayModal({ day, canEdit, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(false);
  useEffect(() => { api.day(day.user_id, day.date).then(setD); }, [day]);
  if (!d) return <Modal title="Attendance detail" onClose={onClose}>Loading…</Modal>;

  const dt = new Date(d.date);
  const dateStr = dt.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const det = d.detail;

  if (edit) return <OverrideForm d={d} onBack={() => setEdit(false)} onClose={onClose} onChanged={onChanged} />;

  return (
    <Modal title="Attendance detail" onClose={onClose}
      footer={<>{canEdit && <button className="btn btn-ghost" onClick={() => setEdit(true)}>Correct status</button>}<button className="btn btn-primary" onClick={onClose}>Done</button></>}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Avatar name={d.user.name} />
        <div><div style={{ fontWeight: 600 }}>{d.user.name}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{dateStr}</div></div>
        <div className="spacer" /><StatusBadge status={d.status} />
      </div>
      {!det
        ? <Empty title={d.status === "weekend" ? "Weekend" : "Absent"} msg={d.status === "weekend" ? "No work expected." : "No activity recorded."} />
        : <>
            <Def k="First activity" v={helpers.minToClock(det.first_activity)} />
            <Def k="Last activity" v={helpers.minToClock(det.last_activity)} />
            <Def k="Present time" v={helpers.minToHM(det.present_min)} />
            <Def k="Active / idle" v={`${helpers.minToHM(det.active_min)} · ${helpers.minToHM(det.idle_min)}`} />
            <Def k="Break time" v={helpers.minToHM(det.break_min)} />
            <Def k="In office / remote" v={`${helpers.minToHM(det.in_office_min)} · ${helpers.minToHM(det.remote_min)}`} />
            <Def k="Productive / unproductive" v={`${helpers.minToHM(det.prod_min)} · ${helpers.minToHM(det.unprod_min)}`} />
            {d.segments.length > 0 && <>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", margin: "14px 0 8px" }}>Networks used</div>
              {d.segments.map((sg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                  <span>{sg.ssid} <span className={"badge " + (sg.office ? "b-office" : "b-remote")}>{sg.office ? "Office" : "Remote"}</span></span>
                  <span className="tnum" style={{ color: "var(--muted)" }}>{helpers.minToClock(sg.start)}–{helpers.minToClock(sg.end)}</span>
                </div>
              ))}
            </>}
            {det.override_status && <div className="login-hint" style={{ marginTop: 14 }}>Manually set to <b>{det.override_status}</b>. Note: {det.override_note}</div>}
          </>}
    </Modal>
  );
}

function OverrideForm({ d, onBack, onClose, onChanged }) {
  const cur = d.detail?.override_status || d.status;
  const [status, setStatus] = useState(["present", "late", "half", "absent"].includes(cur) ? cur : "present");
  const [note, setNote] = useState(d.detail?.override_note || "");
  const [err, setErr] = useState("");
  async function save() {
    if (!note.trim()) { setErr("A reason is required"); return; }
    try { await api.override({ user_id: d.user.id, date: d.date, status, note }); onChanged(); onClose(); }
    catch (e) { setErr(e.message); }
  }
  async function remove() { await api.clearOverride(d.user.id, d.date); onChanged(); onClose(); }
  return (
    <Modal title="Correct attendance" onClose={onClose}
      footer={<>{d.detail?.override_status && <button className="btn btn-danger" onClick={remove}>Remove correction</button>}<button className="btn btn-ghost" onClick={onBack}>Back</button><button className="btn btn-primary" onClick={save}>Save correction</button></>}>
      {err && <div className="err">{err}</div>}
      <div className="field"><label>Status for this day</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="present">Present</option><option value="late">Late</option>
          <option value="half">Half-day</option><option value="absent">Absent</option>
        </select>
      </div>
      <div className="field"><label>Reason (required)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Agent was down, confirmed present" />
        <div className="hint">Corrections are logged so attendance stays trustworthy for payroll and reviews.</div>
      </div>
    </Modal>
  );
}

function Def({ k, v }) {
  return <div className="def-row"><span className="k">{k}</span><span className="v tnum">{v}</span></div>;
}
