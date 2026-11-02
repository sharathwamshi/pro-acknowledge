"""Acknowledger desktop agent.

Runs in the background on a recruiter's machine. On first run it asks for
name + email once (the one-time signup), stores the returned device token,
and from then on sends a heartbeat every N seconds: active app/window, idle
state, and the connected Wi-Fi name (SSID). Heartbeats are buffered locally
(SQLite) so nothing is lost if the network drops, then flushed in batches.

Primary target is Windows; macOS/Linux have best-effort fallbacks so you can
develop on any machine. Runs with the standard library plus `requests`.

    pip install requests
    python agent.py            # first run prompts for name + email
"""
import datetime as dt
import json
import os
import platform
import sqlite3
import sys
import time
import subprocess

import requests

# On Windows, hide the console window that subprocess probes (netsh, etc.) would
# otherwise flash on every heartbeat.
if platform.system() == "Windows":
    _NO_WINDOW = 0x08000000  # CREATE_NO_WINDOW
    _STARTUPINFO = subprocess.STARTUPINFO()
    _STARTUPINFO.dwFlags |= subprocess.STARTF_USESHOWWINDOW
else:
    _NO_WINDOW = 0
    _STARTUPINFO = None


def _run(cmd, **kw):
    """Run a command and return its stdout as text, with no console flash."""
    return subprocess.check_output(
        cmd, text=True, creationflags=_NO_WINDOW, startupinfo=_STARTUPINFO, **kw)


# ----------------------------------------------------------------------------
SYS = platform.system()   # 'Windows' | 'Darwin' | 'Linux'

# Folder where the script / packaged .exe lives. When frozen by PyInstaller we
# must use sys.executable, NOT __file__ (which points at a temp extract dir).
if getattr(sys, "frozen", False):
    APP_DIR = os.path.dirname(sys.executable)
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))


def _data_dir():
    """A per-user, always-writable folder for state the agent writes itself.
    Avoids Program Files / VirtualStore problems entirely."""
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or os.path.expanduser("~")
    d = os.path.join(base, "Acknowledger")
    try:
        os.makedirs(d, exist_ok=True)
        return d
    except Exception:
        return APP_DIR


DATA_DIR = _data_dir()
CONFIG_PATH = os.path.join(APP_DIR, "agent_config.json")    # you edit this (server_url, etc.) — read only
STATE_PATH = os.path.join(DATA_DIR, "agent_state.json")     # agent writes this (device_token, user_id)
BUFFER_DB = os.path.join(DATA_DIR, "agent_buffer.db")
LOG_PATH = os.path.join(DATA_DIR, "agent.log")

DEFAULTS = {
    # Fallback used only if agent_config.json is missing or unreadable;
    # agent_config.json overrides this.
    "server_url": "https://proafpl.anametaiot.com",
    "heartbeat_seconds": 60,
    "idle_threshold_seconds": 300,
    "flush_every": 5,          # send after this many buffered heartbeats
}


def log(msg):
    """Write to a log file (survives --noconsole) and stdout if present."""
    line = f"{dt.datetime.now().isoformat(timespec='seconds')}  {msg}"
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass
    try:
        print(line)
    except Exception:
        pass


# ---------------- config ----------------
def load_config():
    """Settings come from agent_config.json (next to the exe); the saved token
    comes from agent_state.json (in LOCALAPPDATA). State overlays config."""
    cfg = dict(DEFAULTS)
    for path in (CONFIG_PATH, STATE_PATH):
        try:
            if os.path.exists(path):
                with open(path, encoding="utf-8") as f:
                    cfg.update(json.load(f))
        except Exception as e:
            log(f"Could not read {path}: {e}")
    return cfg


def save_config(cfg):
    """Persist ONLY the runtime state to a writable location. Never tries to
    write next to the exe, which may be read-only."""
    state = {k: cfg[k] for k in ("device_token", "user_id", "name", "email") if k in cfg}
    try:
        with open(STATE_PATH, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
        log(f"Saved device token to {STATE_PATH}")
    except Exception as e:
        log(f"ERROR: could not write state to {STATE_PATH}: {e}")


# ---------------- local buffer ----------------
def buffer_conn():
    con = sqlite3.connect(BUFFER_DB)
    con.execute("""CREATE TABLE IF NOT EXISTS events(
        id INTEGER PRIMARY KEY, ts TEXT, active_app TEXT, window_title TEXT,
        url TEXT, idle INTEGER, ssid TEXT, bssid TEXT, sent INTEGER DEFAULT 0)""")
    return con


# ---------------- OS probes ----------------
def active_window():
    """Return (app_name, window_title). Best-effort per platform."""
    try:
        if SYS == "Windows":
            import ctypes
            from ctypes import wintypes
            user32 = ctypes.windll.user32
            hwnd = user32.GetForegroundWindow()
            length = user32.GetWindowTextLengthW(hwnd)
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            title = buf.value
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            app = _proc_name_windows(pid.value) or title
            return app, title
        if SYS == "Darwin":
            script = 'tell application "System Events" to get name of first application process whose frontmost is true'
            app = _run(["osascript", "-e", script]).strip()
            return app, app
        # Linux (X11)
        title = _run(["xdotool", "getactivewindow", "getwindowname"]).strip()
        return title.split(" - ")[-1], title
    except Exception:
        return None, None


def _proc_name_windows(pid):
    try:
        import ctypes
        from ctypes import wintypes
        PROCESS_QUERY = 0x0400 | 0x0010
        h = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY, False, pid)
        if not h:
            return None
        buf = ctypes.create_unicode_buffer(260)
        size = wintypes.DWORD(260)
        ctypes.windll.kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size))
        ctypes.windll.kernel32.CloseHandle(h)
        return os.path.basename(buf.value).replace(".exe", "")
    except Exception:
        return None


def idle_seconds():
    """Seconds since last keyboard/mouse input."""
    try:
        if SYS == "Windows":
            import ctypes

            class LASTINPUTINFO(ctypes.Structure):
                _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]
            info = LASTINPUTINFO()
            info.cbSize = ctypes.sizeof(info)
            ctypes.windll.user32.GetLastInputInfo(ctypes.byref(info))
            millis = ctypes.windll.kernel32.GetTickCount() - info.dwTime
            return millis / 1000.0
        if SYS == "Darwin":
            out = _run("ioreg -c IOHIDSystem | awk '/HIDIdleTime/{print $NF; exit}'", shell=True).strip()
            return int(out) / 1_000_000_000.0
        out = _run(["xprintidle"]).strip()
        return int(out) / 1000.0
    except Exception:
        return 0.0


def current_ssid():
    """Name of the connected Wi-Fi network."""
    try:
        if SYS == "Windows":
            out = _run(["netsh", "wlan", "show", "interfaces"])
            for line in out.splitlines():
                if line.strip().startswith("SSID") and "BSSID" not in line:
                    return line.split(":", 1)[1].strip()
        elif SYS == "Darwin":
            out = _run(["/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport", "-I"])
            for line in out.splitlines():
                if " SSID:" in line:
                    return line.split(":", 1)[1].strip()
        else:
            return _run(["iwgetid", "-r"]).strip() or None
    except Exception:
        return None
    return None


# ---------------- signup ----------------
import re

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _do_signup(cfg, name, email):
    """Call the backend signup endpoint and persist the token. Raises on error."""
    r = requests.post(f"{cfg['server_url']}/agent/signup", json={
        "name": name.strip(), "email": email.strip(),
        "machine_name": platform.node(), "os": f"{SYS} {platform.release()}"
    }, timeout=15)
    r.raise_for_status()
    data = r.json()
    cfg["device_token"] = data["device_token"]
    cfg["user_id"] = data["user_id"]
    save_config(cfg)
    return data


def _signup_dialog(cfg):
    """Small popup for first-run name + email. No console needed, so it works
    under --noconsole. On success it reveals the User ID and device token in
    read-only textboxes you can select and copy. Returns True if registered."""
    import tkinter as tk
    from tkinter import ttk

    done = {"ok": False}
    root = tk.Tk()
    root.title("Acknowledger — Setup")
    root.resizable(False, False)
    root.configure(padx=22, pady=18)
    try:
        root.eval("tk::PlaceWindow . center")
    except Exception:
        pass

    # --- form widgets ---
    ttk.Label(root, text="Welcome to Acknowledger", font=("Segoe UI", 12, "bold")).grid(row=0, column=0, columnspan=2, sticky="w")
    ttk.Label(root, text="Enter your details once to get started.", foreground="#687E97").grid(row=1, column=0, columnspan=2, sticky="w", pady=(2, 12))

    ttk.Label(root, text="Full name").grid(row=2, column=0, columnspan=2, sticky="w")
    name_var = tk.StringVar()
    name_entry = ttk.Entry(root, textvariable=name_var, width=40)
    name_entry.grid(row=3, column=0, columnspan=2, sticky="we", pady=(2, 10))

    ttk.Label(root, text="Work email").grid(row=4, column=0, columnspan=2, sticky="w")
    email_var = tk.StringVar()
    email_entry = ttk.Entry(root, textvariable=email_var, width=40)
    email_entry.grid(row=5, column=0, columnspan=2, sticky="we", pady=(2, 6))

    msg = ttk.Label(root, text="", foreground="#CB4154", wraplength=320)
    msg.grid(row=6, column=0, columnspan=2, sticky="w")

    btn = ttk.Button(root, text="Register")
    btn.grid(row=7, column=0, columnspan=2, sticky="we", pady=(12, 0))

    def show_result(data):
        # hide the form, reveal copyable result fields
        for w in (name_entry, email_entry, btn):
            w.grid_remove()
        msg.config(text=f"Registered as {data['name']}.", foreground="#2E9E5B")

        ttk.Label(root, text="User ID").grid(row=8, column=0, columnspan=2, sticky="w", pady=(10, 0))
        id_entry = ttk.Entry(root, width=40)
        id_entry.insert(0, str(data["user_id"]))
        id_entry.configure(state="readonly")
        id_entry.grid(row=9, column=0, columnspan=2, sticky="we", pady=(2, 10))

        ttk.Label(root, text="Device token (for the Chrome extension)").grid(row=10, column=0, columnspan=2, sticky="w")
        tok_entry = ttk.Entry(root, width=40)
        tok_entry.insert(0, str(data["device_token"]))
        tok_entry.configure(state="readonly")
        tok_entry.grid(row=11, column=0, columnspan=2, sticky="we", pady=(2, 8))

        def copy_token():
            root.clipboard_clear()
            root.clipboard_append(str(data["device_token"]))

        ttk.Button(root, text="Copy token", command=copy_token).grid(row=12, column=0, sticky="w", pady=(6, 0))
        ttk.Button(root, text="Done", command=root.destroy).grid(row=12, column=1, sticky="e", pady=(6, 0))

    def submit():
        name, email = name_var.get().strip(), email_var.get().strip()
        if not name:
            msg.config(text="Please enter your name.", foreground="#CB4154"); return
        if not EMAIL_RE.match(email):
            msg.config(text="Please enter a valid email address.", foreground="#CB4154"); return
        btn.config(state="disabled", text="Registering…")
        root.update_idletasks()
        try:
            data = _do_signup(cfg, name, email)
            done["ok"] = True
            show_result(data)
        except Exception as e:
            msg.config(text=f"Couldn't register: {e}", foreground="#CB4154")
            btn.config(state="normal", text="Register")

    btn.config(command=submit)
    root.bind("<Return>", lambda _e: submit())
    name_entry.focus()
    root.mainloop()
    return done["ok"]


def ensure_registered(cfg):
    if cfg.get("device_token"):
        return cfg

    # If name + email were pre-filled in the config (fleet rollout), register
    # silently with no prompt at all.
    if cfg.get("name") and cfg.get("email"):
        data = _do_signup(cfg, cfg["name"], cfg["email"])
        log(f"Registered silently as {data['name']}. Device token: {data['device_token']}")
        return cfg

    # Otherwise show the popup. Fall back to console input only if there's no
    # display (e.g. a headless server) and a console is available.
    try:
        if not _signup_dialog(cfg):
            raise SystemExit("Setup cancelled.")
    except ImportError:
        print("Acknowledger — first-time setup")
        _do_signup(cfg, input("  Your full name: ").strip(), input("  Work email: ").strip())
    return cfg


# ---------------- main loop ----------------
def flush(cfg, con):
    rows = con.execute(
        "SELECT id, ts, active_app, window_title, url, idle, ssid, bssid "
        "FROM events WHERE sent=0 ORDER BY id LIMIT 200").fetchall()
    if not rows:
        return
    events = [{"ts": r[1], "active_app": r[2], "window_title": r[3], "url": r[4],
               "idle": bool(r[5]), "ssid": r[6], "bssid": r[7]} for r in rows]
    try:
        resp = requests.post(f"{cfg['server_url']}/agent/ingest",
                             headers={"X-Device-Token": cfg["device_token"]},
                             json={"events": events}, timeout=20)
        resp.raise_for_status()
        ids = tuple(r[0] for r in rows)
        con.execute(f"DELETE FROM events WHERE id IN ({','.join('?' * len(ids))})", ids)
        con.commit()
        log(f"Sent {len(events)} events.")
    except Exception as e:
        log(f"Offline, buffered {len(events)} events: {e}")


def main():
    cfg = load_config()
    cfg = ensure_registered(cfg)
    con = buffer_conn()
    hb = cfg["heartbeat_seconds"]
    count = 0
    log(f"Agent running. Heartbeat every {hb}s. Server: {cfg['server_url']}")
    while True:
        app, title = active_window()
        idle = idle_seconds() >= cfg["idle_threshold_seconds"]
        ssid = current_ssid()
        con.execute(
            "INSERT INTO events(ts, active_app, window_title, url, idle, ssid, bssid) "
            "VALUES(?,?,?,?,?,?,?)",
            (dt.datetime.now().astimezone().isoformat(), app, title, None, int(idle), ssid, None))
        con.commit()
        count += 1
        if count % cfg["flush_every"] == 0:
            flush(cfg, con)
        time.sleep(hb)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAgent stopped.")
        sys.exit(0)
    except SystemExit:
        raise
    except Exception:
        import traceback
        log("FATAL: " + traceback.format_exc())
        raise
