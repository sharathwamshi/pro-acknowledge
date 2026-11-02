import React, { createContext, useContext, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, APP_VERSION } from "./api";
import { Avatar } from "./components/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Live from "./pages/Live";
import Users from "./pages/Users";
import UserDetail from "./pages/UserDetail";
import Attendance from "./pages/Attendance";
import Productivity from "./pages/Productivity";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const IC = {
  dash: <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>,
  live: <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0"/></svg>,
  users: <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5.8M17 19a5.5 5.5 0 0 0-2.5-4.6"/></svg>,
  att: <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9h17M8 3v3M16 3v3"/><path d="M8.5 14l2 2 4-4"/></svg>,
  prod: <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>,
  reports: <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5M8 13h8M8 17h5"/></svg>,
  set: <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.9 7.9 0 0 0 0-2l2-1.5-2-3.4-2.3 1a8 8 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a8 8 0 0 0-1.7 1l-2.3-1-2 3.4L4.6 11a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.4 2.3-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.3 1 2-3.4-2-1.5Z"/></svg>,
};

function Shell() {
  const { user, logout } = useAuth();
  const admin = user.role === "admin";
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      {open && <div className="scrim" onClick={close} />}
      <div className="shell">
        <aside className={"sidebar" + (open ? " open" : "")}>
          <div className="side-top">
            <div className="brand"><div className="brand-mark">A</div><div className="brand-name">Acknow<span>ledger</span></div></div>
          </div>
          <nav className="nav" onClick={close}>
            <div className="nav-label">Overview</div>
            <NavLink to="/dashboard">{IC.dash}<span>Dashboard</span></NavLink>
            <NavLink to="/live">{IC.live}<span>Live view</span></NavLink>
            <div className="nav-label">{admin ? "People" : "My team"}</div>
            <NavLink to="/users">{IC.users}<span>{admin ? "Users" : "Team members"}</span></NavLink>
            <NavLink to="/attendance">{IC.att}<span>Attendance</span></NavLink>
            <NavLink to="/productivity">{IC.prod}<span>Productivity</span></NavLink>
            <NavLink to="/reports">{IC.reports}<span>Reports</span></NavLink>
            {admin && <><div className="nav-label">Admin</div><NavLink to="/settings">{IC.set}<span>Settings</span></NavLink></>}
          </nav>
          <div className="side-user">
            <Avatar name={user.name} />
            <div className="meta"><div className="nm">{user.name}</div><div className="rl">{admin ? "Administrator" : "Manager · " + user.team}</div></div>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={logout}>Exit</button>
          </div>
        </aside>
        <div className="main">
          <div className="topbar">
            <button className="menu-toggle" onClick={() => setOpen(true)} aria-label="Menu">
              <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            </button>
            <Routes>
              <Route path="/dashboard" element={<PageTitle title="Dashboard" />} />
              <Route path="/live" element={<PageTitle title="Live view" />} />
              <Route path="/users" element={<PageTitle title={admin ? "Users" : "Team members"} />} />
              <Route path="/users/:id" element={<PageTitle title={admin ? "User" : "Team member"} />} />
              <Route path="/attendance" element={<PageTitle title="Attendance" />} />
              <Route path="/productivity" element={<PageTitle title="Productivity" />} />
              <Route path="/reports" element={<PageTitle title="Reports" />} />
              <Route path="/settings" element={<PageTitle title="Settings" />} />
            </Routes>
            <div className="spacer" />
            <span className="badge b-recruiter" title="Application version">v{APP_VERSION}</span>
            {admin ? <span className="badge b-admin">Admin · all teams</span>
                   : <span className="badge b-manager">Manager · {user.team}</span>}
          </div>
          <div className="content">
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/live" element={<Live />} />
              <Route path="/users" element={<Users />} />
              <Route path="/users/:id" element={<UserDetail />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/productivity" element={<Productivity />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={admin ? <Settings /> : <Navigate to="/dashboard" />} />
              <Route path="*" element={<Navigate to="/dashboard" />} />
            </Routes>
          </div>
          <div className="foot-brand">Powered by <b>Acknowledger</b> · Workforce intelligence · v{APP_VERSION}</div>
        </div>
      </div>
    </>
  );
}

function PageTitle({ title }) {
  return <h1>{title}</h1>;
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ack_user")); } catch { return null; }
  });
  const nav = useNavigate();

  const login = (token, u) => {
    localStorage.setItem("ack_token", token);
    localStorage.setItem("ack_user", JSON.stringify(u));
    setUser(u);
    nav("/dashboard");
  };
  const logout = () => {
    localStorage.removeItem("ack_token");
    localStorage.removeItem("ack_user");
    setUser(null);
    nav("/");
  };

  useEffect(() => {
    if (user) api.me().then(setUser).catch(() => {});
    // eslint-disable-next-line
  }, []);

  return (
    <AuthCtx.Provider value={{ user, login, logout }}>
      {user ? <Shell /> : <Routes><Route path="*" element={<Login />} /></Routes>}
    </AuthCtx.Provider>
  );
}
