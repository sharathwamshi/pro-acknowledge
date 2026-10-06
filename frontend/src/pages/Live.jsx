import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Avatar, Empty } from "../components/ui";

export default function Live() {
  const [people, setPeople] = useState(null);
  const [q, setQ] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    const load = () => api.live().then(setPeople).catch(() => {});
    load();
    const t = setInterval(load, 15000);  // refresh every 15s
    return () => clearInterval(t);
  }, []);

  if (!people) return <div className="card"><div className="card-body">Loading…</div></div>;
  const shown = people.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
          <input placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="spacer" />
        <div className="legend">
          <div className="it"><span className="dot d-active" />Active</div>
          <div className="it"><span className="dot d-idle" />Idle</div>
          <div className="it"><span className="dot d-offline" />Offline</div>
        </div>
      </div>

      {shown.length ? (
        <div className="live-grid">
          {shown.map((u) => (
            <div className="live-card" key={u.id}>
              <div className="top">
                <Avatar name={u.name} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{u.team}</div>
                </div>
              </div>
              <span className={"badge b-" + u.status}><span className={"dot d-" + u.status} />{u.status[0].toUpperCase() + u.status.slice(1)}</span>
              <div className="app" style={{ marginTop: 10 }}>
                {u.app ? u.app : <span style={{ color: "var(--muted)" }}>No active window</span>}
              </div>
              <div className="foot">
                {u.ssid ? <span className={"badge " + (u.in_office ? "b-office" : "b-remote")}>{u.in_office ? "In office" : "Remote"}</span>
                        : <span className="badge b-offline">—</span>}
                <button className="btn btn-ghost btn-sm" onClick={() => nav(`/users/${u.id}`)}>Details</button>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="card"><Empty title="No one matches" msg="Try a different name." /></div>}
    </>
  );
}
