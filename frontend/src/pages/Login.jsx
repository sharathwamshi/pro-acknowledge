import React, { useState } from "react";
import { api, APP_VERSION } from "../api";
import { useAuth } from "../App";

export default function Login() {
  const { login } = useAuth();
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setErr("");
    try {
      const { token, user } = await api.login(username.trim(), password);
      login(token, user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand"><div className="brand-mark">A</div><div className="brand-name">Acknow<span>ledger</span></div></div>
        <div className="login-sub">Workforce &amp; Attendance Console. Sign in to view your team.</div>
        {err && <div className="err">{err}</div>}
        <div className="field"><label>Username</label>
          <input value={username} autoComplete="username" placeholder="e.g. admin"
            onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <div className="field"><label>Password</label>
          <input type="password" value={password} autoComplete="current-password" placeholder="••••••••"
            onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11.5, color: "var(--muted)" }}>
          Acknowledger · v{APP_VERSION}
        </div>
      </div>
    </div>
  );
}
