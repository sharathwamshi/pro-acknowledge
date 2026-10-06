# Acknowledger agent

Background program for each recruiter's machine. First run asks for name +
email once, then reports silently.

## Run (development)

```bash
pip install -r requirements.txt
# point it at your backend first:
cp agent_config.example.json agent_config.json   # edit server_url
python agent.py
```

On Linux, the active-window and idle probes need `xdotool` and `xprintidle`
(`sudo apt install xdotool xprintidle`). Windows and macOS need nothing extra.

## Package into a single .exe (Windows)

```bash
pip install pyinstaller requests
pyinstaller --onefile --noconsole agent.py
```

This produces `dist/agent.exe`. Ship it together with an `agent_config.json`
that already contains your `server_url`, so the recruiter only enters name +
email on first launch.

## Make it start at login

- **Per machine (quick):** put a shortcut to `agent.exe` in
  `shell:startup` (Win+R → `shell:startup`).
- **Fleet (recommended):** push via Active Directory Group Policy or Intune,
  and run recruiters as standard (non-admin) users so the agent isn't removed.

## Notes

- Heartbeats buffer to `agent_buffer.db` and resend when the network returns.
- URL capture uses the companion Chrome extension (see `../extension`), which
  posts the active tab URL; the desktop agent only sees window titles.
- This is an internal tool: it has no anti-tamper layer by design. If you later
  distribute it outside machines you control, add code signing and a watchdog.
