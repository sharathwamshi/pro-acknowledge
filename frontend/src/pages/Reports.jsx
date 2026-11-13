import React, { useEffect, useRef, useState } from "react";
import { api, downloadFile } from "../api";
import { downloadNodePng } from "../chart";
import { Empty, Toast } from "../components/ui";

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function band(score) {
  if (score > 0.7) return "var(--present)";
  if (score > 0.5) return "var(--late)";
  return "var(--absent)";
}
const CAT = { productive: "var(--present)", unproductive: "var(--absent)", neutral: "var(--weekend)" };

export default function Reports() {
  const [start, setStart] = useState(isoDaysAgo(29));
  const [end, setEnd] = useState(isoDaysAgo(0));
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  const splitRef = useRef(null);
  const trendRef = useRef(null);
  const peopleRef = useRef(null);
  const appsRef = useRef(null);
  const sitesRef = useRef(null);

  const load = () => { setErr(""); api.reportSummary(start, end).then(setData).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function exportExcel() {
    setBusy(true);
    try { await downloadFile(`/reports/export.xlsx?start=${start}&end=${end}`, `key2view-report-${start}_to_${end}.xlsx`); flash("Excel downloaded"); }
    catch (e) { flash(e.message); } finally { setBusy(false); }
  }
  async function savePng(ref, name) {
    try { await downloadNodePng(ref.current, name); flash("Chart saved"); }
    catch { flash("Couldn't save chart"); }
  }

  return (
    <>
      <div className="toolbar">
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: 11 }}>From</label>
          <input type="date" className="inp" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: 11 }}>To</label>
          <input type="date" className="inp" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={load}>Run report</button>
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={exportExcel} disabled={busy}>{busy ? "Exporting…" : "Export Excel"}</button>
      </div>

      {err && <div className="card"><Empty title="Couldn't load" msg={err} /></div>}
      {!data && !err && <div className="card"><div className="card-body">Loading…</div></div>}

      {data && (
        <>
          <div className="kpis">
            <Kpi lbl="People" val={data.people_count} />
            <Kpi lbl="Avg productivity" val={Math.round(data.avg_score * 100) + "%"} tone={band(data.avg_score)} />
            <Kpi lbl="Productive hours" val={data.team_productive_hours + "h"} tone="var(--present)" />
            <Kpi lbl="App vs browser" val={data.app_hours + " / " + data.browser_hours + "h"} />
          </div>

          <div className="grid-2">
            <div className="card" ref={splitRef}>
              <div className="card-head"><h3>Time split</h3><div className="spacer" />
                <button className="btn btn-ghost btn-sm" data-noexport onClick={() => savePng(splitRef, "time-split.png")}>PNG</button></div>
              <div className="card-body"><Donut split={data.split} /></div>
            </div>

            <div className="card" ref={trendRef}>
              <div className="card-head"><h3>Productive hours · trend</h3><div className="spacer" />
                <button className="btn btn-ghost btn-sm" data-noexport onClick={() => savePng(trendRef, "productive-trend.png")}>PNG</button></div>
              <div className="card-body"><Trend trend={data.trend} /></div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }} ref={peopleRef}>
            <div className="card-head"><h3>Productivity ranking</h3><div className="spacer" />
              <button className="btn btn-ghost btn-sm" data-noexport onClick={() => savePng(peopleRef, "productivity-ranking.png")}>PNG</button></div>
            <div className="card-body">
              {data.people.length ? data.people.map((p, i) => (
                <div className="bar-row" key={p.id}>
                  <div style={{ width: 24, textAlign: "right", color: "var(--muted)", fontWeight: 600, flex: "none" }} className="tnum">{i + 1}</div>
                  <div className="nm" title={p.name}>{p.name}</div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: Math.round(p.score * 100) + "%", background: band(p.score) }} /></div>
                  <div className="vv tnum" style={{ color: band(p.score), fontWeight: 600 }}>{Math.round(p.score * 100)}%</div>
                </div>
              )) : <Empty title="No data" msg="No activity in this range." />}
            </div>
          </div>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <BarCard title="Top applications" refEl={appsRef} rows={data.top_apps} onSave={() => savePng(appsRef, "top-applications.png")} />
            <BarCard title="Top websites (browser)" refEl={sitesRef} rows={data.top_websites} onSave={() => savePng(sitesRef, "top-websites.png")} />
          </div>
        </>
      )}
      <Toast msg={toast} />
    </>
  );
}

function Donut({ split }) {
  const parts = [["productive", split.productive], ["unproductive", split.unproductive], ["neutral", split.neutral]];
  const total = parts.reduce((s, p) => s + p[1], 0) || 1;
  const R = 54, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ flex: "none" }}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="20" />
        {parts.map(([k, v], i) => {
          const len = (v / total) * C;
          const el = <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={CAT[k]} strokeWidth="20"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />;
          off += len; return el;
        })}
        <text x="70" y="66" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--ink)">{Math.round((split.productive / total) * 100)}%</text>
        <text x="70" y="84" textAnchor="middle" fontSize="10" fill="var(--muted)">productive</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 140 }}>
        {parts.map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: CAT[k], flex: "none" }} />
            <span style={{ flex: 1, textTransform: "capitalize" }}>{k}</span>
            <b className="tnum">{v}h</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function Trend({ trend }) {
  if (!trend || !trend.length) return <Empty title="No data" msg="Nothing in this range." />;
  const W = 520, H = 150, pad = 26;
  const max = Math.max(1, ...trend.map((t) => t.hours));
  const step = trend.length > 1 ? (W - pad * 2) / (trend.length - 1) : 0;
  const x = (i) => pad + i * step;
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  const line = trend.map((t, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(t.hours).toFixed(1)}`).join(" ");
  const area = `${line} L${x(trend.length - 1).toFixed(1)} ${H - pad} L${x(0).toFixed(1)} ${H - pad} Z`;
  const ticks = trend.filter((_, i) => i % Math.ceil(trend.length / 6) === 0);
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 320 }}>
        <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--present)" stopOpacity="0.35" /><stop offset="1" stopColor="var(--present)" stopOpacity="0" />
        </linearGradient></defs>
        {[0, 0.5, 1].map((f, i) => (
          <line key={i} x1={pad} x2={W - pad} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#tg)" />
        <path d={line} fill="none" stroke="var(--present)" strokeWidth="2.5" strokeLinejoin="round" />
        {trend.map((t, i) => <circle key={i} cx={x(i)} cy={y(t.hours)} r="2.6" fill="var(--present)" />)}
        {ticks.map((t) => {
          const i = trend.indexOf(t);
          return <text key={t.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--muted)">{t.label}</text>;
        })}
        <text x={pad} y={y(max) - 5} fontSize="9" fill="var(--muted)">{max}h</text>
      </svg>
    </div>
  );
}

function BarCard({ title, refEl, rows, onSave }) {
  const max = rows.length ? rows[0].hours || 1 : 1;
  return (
    <div className="card" ref={refEl}>
      <div className="card-head"><h3>{title}</h3><div className="spacer" />
        <button className="btn btn-ghost btn-sm" data-noexport onClick={onSave}>PNG</button></div>
      <div className="card-body">
        {rows.length ? rows.map((r) => (
          <div className="bar-row" key={r.name}>
            <div className="nm" title={r.name}>{r.name}</div>
            <div className="bar-track"><div className="bar-fill" style={{ width: Math.max(2, (r.hours / max) * 100) + "%", background: CAT[r.category] || "var(--weekend)" }} /></div>
            <div className="vv tnum">{r.hours}h</div>
          </div>
        )) : <Empty title="No data" msg="Nothing recorded in this range." />}
      </div>
    </div>
  );
}

function Kpi({ lbl, val, tone }) {
  return <div className="kpi"><div className="lbl">{lbl}</div><div className="val tnum" style={tone ? { color: tone } : undefined}>{val}</div></div>;
}
