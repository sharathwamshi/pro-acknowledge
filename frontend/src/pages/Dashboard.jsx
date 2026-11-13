import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Avatar, SplitBar, Empty } from "../components/ui";

function band(score) {
  if (score > 0.7) return { c: "var(--present)", bg: "var(--present-bg)", label: "High" };
  if (score > 0.5) return { c: "var(--late)", bg: "var(--late-bg)", label: "Mid" };
  return { c: "var(--absent)", bg: "var(--absent-bg)", label: "Low" };
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  useEffect(() => { api.dashboard().then(setD).catch((e) => setErr(e.message)); }, []);

  if (err) return <div className="card"><Empty title="Couldn't load" msg={err} /></div>;
  if (!d) return <div className="card"><div className="card-body">Loading…</div></div>;

  const maxT = Math.max(1, ...d.trend.map((t) => t.value));
  const pct = d.total ? Math.round((d.present / d.total) * 100) : 0;

  return (
    <>
      <div className="kpis">
        <Kpi lbl="Present today" val={<>{d.present}<small> / {d.total}</small></>} tag={<span className="badge b-present"><span className="dot d-present" />{pct}% attendance</span>} />
        <Kpi lbl="Late arrivals" val={d.late} tag={<span className="badge b-late"><span className="dot d-late" />after policy</span>} />
        <Kpi lbl="Absent" val={d.absent} tag={<span className="badge b-absent"><span className="dot d-absent" />no activity</span>} />
        <Kpi lbl="In office" val={d.in_office} tag={<span className="badge b-office">vs {d.remote} remote</span>} />
        <Kpi lbl="Active now" val={d.active} tag={<span className="badge b-active"><span className="dot d-active" />{d.idle} idle · {d.offline} offline</span>} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Avg productive hours · last 7 days</h3></div>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 160, paddingTop: 8 }}>
              {d.trend.map((t, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)" }} className="tnum">{t.value.toFixed(1)}h</div>
                  <div style={{ width: "60%", maxWidth: 34, background: "linear-gradient(180deg,var(--primary),#3E86C9)", borderRadius: "6px 6px 0 0", height: Math.max(4, (t.value / maxT) * 120) }} />
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{t.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Today · in office vs remote</h3></div>
          <div className="card-body">
            <SplitBar parts={[["office", d.in_office], ["remote", d.remote], ["weekend", Math.max(0, d.total - d.present)]]} />
            <div style={{ marginTop: 16 }}>
              <Def k="In office" v={d.in_office} />
              <Def k="Remote" v={d.remote} />
              <Def k="Not working / absent" v={Math.max(0, d.total - d.present)} />
            </div>
            <div className="hint">Location is read from each machine's connected Wi-Fi and matched against your office networks.</div>
          </div>
        </div>
      </div>

      <WeeklyRanking ranking={d.ranking || []} nav={nav} />
    </>
  );
}

function WeeklyRanking({ ranking, nav }) {
  if (!ranking.length) return null;
  const ranked = ranking.filter((r) => r.productive_hours > 0);
  const top = ranked.slice(0, 3);
  const bottom = ranked.length > 3 ? ranked.slice(-3).reverse() : [];

  return (
    <div style={{ marginTop: 16 }}>
      <div className="grid-2">
        <PerfCard title="Most productive this week" people={top} nav={nav} medal />
        {bottom.length > 0 && <PerfCard title="Needs attention this week" people={bottom} nav={nav} />}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>Weekly productivity ranking</h3><span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>Mon–today</span></div>
        <div className="card-body">
          {ranked.map((r) => {
            const b = band(r.score);
            return (
              <div key={r.id} className="bar-row clickable" style={{ cursor: "pointer" }} onClick={() => nav(`/users/${r.id}`)}>
                <div style={{ width: 26, textAlign: "right", color: "var(--muted)", fontWeight: 600, flex: "none" }} className="tnum">{r.rank}</div>
                <div className="nm" title={r.name}>{r.name}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: Math.round(r.score * 100) + "%", background: b.c }} /></div>
                <div className="vv tnum" style={{ color: b.c, fontWeight: 600 }}>{Math.round(r.score * 100)}%</div>
              </div>
            );
          })}
          {!ranked.length && <Empty title="No data yet" msg="Productivity ranking appears once activity is recorded this week." />}
        </div>
      </div>
    </div>
  );
}

function PerfCard({ title, people, nav, medal }) {
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3></div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {people.map((p, i) => {
          const b = band(p.score);
          return (
            <div key={p.id} onClick={() => nav(`/users/${p.id}`)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 10, cursor: "pointer", background: b.bg }}>
              <div style={{ fontWeight: 700, fontSize: 15, width: 22, textAlign: "center", color: b.c }}>{medal ? ["🥇", "🥈", "🥉"][i] || i + 1 : "▾"}</div>
              <Avatar name={p.name} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.productive_hours}h productive</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, color: b.c }} className="tnum">{Math.round(p.score * 100)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ lbl, val, tag }) {
  return <div className="kpi"><div className="lbl">{lbl}</div><div className="val tnum">{val}</div><div className="tag">{tag}</div></div>;
}
function Def({ k, v }) {
  return <div className="def-row"><span className="k">{k}</span><span className="v tnum">{v}</span></div>;
}
