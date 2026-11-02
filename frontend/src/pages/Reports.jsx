import React, { useEffect, useRef, useState } from "react";
import { api, downloadFile } from "../api";
import { downloadNodePng } from "../chart";
import { Empty, Toast } from "../components/ui";

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const [start, setStart] = useState(isoDaysAgo(29));
  const [end, setEnd] = useState(isoDaysAgo(0));
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  const peopleRef = useRef(null);
  const appsRef = useRef(null);
  const sitesRef = useRef(null);

  const load = () => {
    setErr("");
    api.reportSummary(start, end).then(setData).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function exportExcel() {
    setBusy(true);
    try { await downloadFile(`/reports/export.xlsx?start=${start}&end=${end}`, `acknowledger-report-${start}_to_${end}.xlsx`); flash("Excel downloaded"); }
    catch (e) { flash(e.message); }
    finally { setBusy(false); }
  }
  async function savePng(ref, name) {
    try { await downloadNodePng(ref.current, name); flash("Chart saved"); }
    catch (e) { flash("Couldn't save chart"); }
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
            <Kpi lbl="Avg productivity" val={Math.round(data.avg_score * 100) + "%"} />
            <Kpi lbl="Productive hours" val={data.team_productive_hours + "h"} />
            <Kpi lbl="Present hours" val={data.team_present_hours + "h"} />
          </div>

          <div className="card" style={{ marginBottom: 16 }} ref={peopleRef}>
            <div className="card-head">
              <h3>Productivity by person</h3><div className="spacer" />
              <button className="btn btn-ghost btn-sm" data-noexport onClick={() => savePng(peopleRef, "productivity-by-person.png")}>Download PNG</button>
            </div>
            <div className="card-body">
              {data.people.length ? data.people.map((p) => (
                <div className="bar-row" key={p.id}>
                  <div className="nm" title={p.name}>{p.name}</div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: Math.round(p.score * 100) + "%", background: p.score > 0.7 ? "var(--present)" : p.score > 0.5 ? "var(--late)" : "var(--absent)" }} /></div>
                  <div className="vv tnum">{Math.round(p.score * 100)}%</div>
                </div>
              )) : <Empty title="No data" msg="No activity in this range." />}
            </div>
          </div>

          <div className="grid-2">
            <ChartCard title="Top applications" refEl={appsRef} rows={data.top_apps} onSave={() => savePng(appsRef, "top-applications.png")} />
            <ChartCard title="Top websites" refEl={sitesRef} rows={data.top_websites} onSave={() => savePng(sitesRef, "top-websites.png")} />
          </div>
        </>
      )}
      <Toast msg={toast} />
    </>
  );
}

function ChartCard({ title, refEl, rows, onSave }) {
  const col = { productive: "var(--present)", unproductive: "var(--absent)", neutral: "var(--weekend)" };
  const max = rows.length ? rows[0].hours || 1 : 1;
  return (
    <div className="card" ref={refEl}>
      <div className="card-head">
        <h3>{title}</h3><div className="spacer" />
        <button className="btn btn-ghost btn-sm" data-noexport onClick={onSave}>Download PNG</button>
      </div>
      <div className="card-body">
        {rows.length ? rows.map((r) => (
          <div className="bar-row" key={r.name}>
            <div className="nm" title={r.name}>{r.name}</div>
            <div className="bar-track"><div className="bar-fill" style={{ width: Math.max(2, (r.hours / max) * 100) + "%", background: col[r.category] || "var(--weekend)" }} /></div>
            <div className="vv tnum">{r.hours}h</div>
          </div>
        )) : <Empty title="No data" msg="Nothing recorded in this range." />}
      </div>
    </div>
  );
}

function Kpi({ lbl, val }) {
  return <div className="kpi"><div className="lbl">{lbl}</div><div className="val tnum">{val}</div></div>;
}
