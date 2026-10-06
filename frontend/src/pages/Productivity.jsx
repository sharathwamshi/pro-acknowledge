import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Empty } from "../components/ui";

export default function Productivity() {
  const [days, setDays] = useState(7);
  const [d, setD] = useState(null);

  useEffect(() => { api.productivity(days).then(setD).catch(() => {}); }, [days]);

  if (!d) return <div className="card"><div className="card-body">Loading…</div></div>;

  const maxApp = d.top_apps.length ? d.top_apps[0].units : 1;
  const appColor = { productive: "var(--present)", unproductive: "var(--absent)", neutral: "var(--weekend)" };

  return (
    <>
      <div className="pill-tabs">
        {[7, 14, 30].map((r) => <button key={r} className={days === r ? "active" : ""} onClick={() => setDays(r)}>{r} days</button>)}
      </div>

      <div className="kpis">
        <div className="kpi"><div className="lbl">Team productivity</div><div className="val tnum">{Math.round(d.team_score * 100)}<small>%</small></div></div>
        <div className="kpi"><div className="lbl">Productive hours</div><div className="val tnum">{d.team_prod_hours}<small>h</small></div></div>
        <div className="kpi"><div className="lbl">People tracked</div><div className="val tnum">{d.people}</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Productivity by person</h3></div>
          <div className="card-body">
            {d.per_user.length ? d.per_user.map((x) => (
              <div className="bar-row" key={x.id}>
                <div className="nm" title={x.name}>{x.name}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round(x.score * 100)}%`, background: x.score > 0.7 ? "var(--present)" : x.score > 0.5 ? "var(--late)" : "var(--absent)" }} /></div>
                <div className="vv tnum">{Math.round(x.score * 100)}%</div>
              </div>
            )) : <Empty title="No data" msg="No activity in range." />}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Top tools across the team</h3></div>
          <div className="card-body">
            {d.top_apps.length ? d.top_apps.map((a) => (
              <div className="bar-row" key={a.name}>
                <div className="nm" title={a.name}>{a.name}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(a.units / maxApp) * 100}%`, background: appColor[a.category] }} /></div>
                <div className="vv tnum">{Math.round((a.units * 5) / 60)}h</div>
              </div>
            )) : <Empty title="No data" msg="No usage in range." />}
            <div className="hint" style={{ marginTop: 12 }}><span className="badge b-present">Productive</span> <span className="badge b-absent">Unproductive</span> <span className="badge b-weekend">Neutral</span> — change labels in Settings.</div>
          </div>
        </div>
      </div>
    </>
  );
}
