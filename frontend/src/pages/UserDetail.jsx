import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, helpers } from "../api";
import { Avatar, StatusBadge, SplitBar, Empty } from "../components/ui";

export default function UserDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [dayData, setDayData] = useState(null);
  const [err, setErr] = useState("");
  const todayISO = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    api.user(id).then(setD).catch((e) => setErr(e.message));
    api.day(id, todayISO).then(setDayData).catch(() => {});
  }, [id]);

  if (err) return <div className="card"><Empty title="Not available" msg={err} /></div>;
  if (!d) return <div className="card"><div className="card-body">Loading…</div></div>;

  const s = d.summary;
  const today = d.today;
  const maxApp = d.top_apps.length ? d.top_apps[0].units : 1;
  const appColor = { productive: "var(--present)", unproductive: "var(--absent)", neutral: "var(--weekend)" };

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <span style={{ color: "var(--muted)", cursor: "pointer" }} onClick={() => nav(-1)}>← Back</span>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Avatar name={d.name} lg />
          <div style={{ minWidth: 180 }}>
            <h2 style={{ fontSize: 18 }}>{d.name}</h2>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>{d.email}</div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className={"badge b-" + d.role}>{d.role === "manager" ? "Manager" : "Recruiter"}</span>
              <span className="badge b-recruiter">{d.team}</span>
            </div>
          </div>
          <div className="spacer" />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Today</div>
            <div style={{ marginTop: 4 }}><StatusBadge status={today ? today.status : "absent"} /></div>
          </div>
        </div>
      </div>

      <div className="kpis">
        <Kpi lbl="Days present" val={s.present} />
        <Kpi lbl="Late" val={s.late} />
        <Kpi lbl="Half-days" val={s.half} />
        <Kpi lbl="Absent" val={s.absent} />
        <Kpi lbl="Avg start" val={s.avg_start_min != null ? helpers.minToClock(s.avg_start_min) : "—"} small />
        <Kpi lbl="Avg hours/day" val={s.avg_hours != null ? s.avg_hours + "h" : "—"} small />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Today</h3></div>
          <div className="card-body">
            {!today || today.status === "absent" || today.status === "weekend"
              ? <Empty title="No activity today" msg={today && today.status === "weekend" ? "Weekend." : "No activity recorded yet."} />
              : <>
                  <DayTimeline segments={dayData ? dayData.segments : []} />
                  <Def k="First activity" v={helpers.minToClock(today.first_activity)} />
                  <Def k="Last activity" v={helpers.minToClock(today.last_activity)} />
                  <Def k="Present time" v={helpers.minToHM(today.present_min)} />
                  <Def k="Active / idle" v={`${helpers.minToHM(today.active_min)} · ${helpers.minToHM(today.idle_min)}`} />
                  <Def k="In office / remote" v={`${helpers.minToHM(today.in_office_min)} · ${helpers.minToHM(today.remote_min)}`} />
                </>}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Top applications · last 30 days</h3></div>
          <div className="card-body">
            {d.top_apps.length ? d.top_apps.map((a) => (
              <div className="bar-row" key={a.name}>
                <div className="nm" title={a.name}>{a.name}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(a.units / maxApp) * 100}%`, background: appColor[a.category] }} /></div>
                <div className="vv tnum">{Math.round((a.units * 5) / 60)}h</div>
              </div>
            )) : <Empty title="No app data" msg="No usage recorded yet." />}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>Location mix · last 30 working days</h3></div>
        <div className="card-body">
          <SplitBar parts={[["office", s.office_days], ["remote", s.remote_days]]} />
          <div style={{ marginTop: 14, display: "flex", gap: 20 }}>
            <div><span className="badge b-office">In office</span> <b className="tnum">{s.office_days}</b> days</div>
            <div><span className="badge b-remote">Remote</span> <b className="tnum">{s.remote_days}</b> days</div>
          </div>
        </div>
      </div>
    </>
  );
}

function DayTimeline({ segments }) {
  const WIN0 = 8 * 60, WIN1 = 20 * 60, SPAN = WIN1 - WIN0;   // 8:00–20:00 window
  if (!segments || !segments.length) return null;
  const pos = (m) => Math.max(0, Math.min(100, ((m - WIN0) / SPAN) * 100));
  const ticks = [8, 10, 12, 14, 16, 18, 20];
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ position: "relative", height: 34, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)", background: "var(--surface-2)" }}>
        {/* hour gridlines */}
        {ticks.slice(1, -1).map((h) => (
          <div key={h} style={{ position: "absolute", left: `${pos(h * 60)}%`, top: 0, bottom: 0, width: 1, background: "var(--line)" }} />
        ))}
        {/* work segments coloured by location */}
        {segments.map((sg, i) => {
          const left = pos(sg.start);
          const width = Math.max(0.6, pos(sg.end) - left);
          return (
            <div key={i} title={`${sg.office ? "In office" : "Remote"} · ${sg.ssid} · ${helpers.minToClock(sg.start)}–${helpers.minToClock(sg.end)}`}
              style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 4, bottom: 4, borderRadius: 4,
                       background: sg.office ? "var(--office)" : "var(--remote)" }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--muted)", marginTop: 5 }}>
        {ticks.map((h) => <span key={h}>{String(h).padStart(2, "0")}:00</span>)}
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 14, fontSize: 12, color: "var(--muted)" }}>
        <span className="badge b-office">In office</span>
        <span className="badge b-remote">Remote</span>
        <span>Hover a block for the network and time.</span>
      </div>
    </div>
  );
}

function Kpi({ lbl, val, small }) {
  return <div className="kpi"><div className="lbl">{lbl}</div><div className="val tnum" style={small ? { fontSize: 20 } : undefined}>{val}</div></div>;
}
function Def({ k, v }) {
  return <div className="def-row"><span className="k">{k}</span><span className="v tnum">{v}</span></div>;
}
