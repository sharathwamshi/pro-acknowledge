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

## First-run signup

On first launch the agent shows a small popup window asking for name + email,
then never asks again. Because it's a window (not a console prompt), it works
even when packaged with `--noconsole`.

Two ways to set up:
- **Self-service:** the recruiter types their name + email in the popup.
- **Zero-touch (fleet):** pre-fill `name` and `email` in `agent_config.json`
  and the agent registers silently with no popup at all.

## Package into a single .exe (Windows)

```bash
pip install pyinstaller requests
pyinstaller --onefile --noconsole agent.py
```

This produces `dist/agent.exe`. Ship it together with an `agent_config.json`
that already contains your `server_url` (and optionally `name`/`email` for a
silent rollout). `--noconsole` is safe now that signup uses a popup — the old
"lost sys.stdin" error only happened with the console-input version.

## Make it start at login

- **Per machine (quick):** put a shortcut to `agent.exe` in
  `shell:startup` (Win+R → `shell:startup`).
- **Fleet (recommended):** push via Active Directory Group Policy or Intune,
  and run recruiters as standard (non-admin) users so the agent isn't removed.

## Where things are stored

- **You edit:** `agent_config.json` next to the agent — `server_url` and timing.
  The agent only *reads* this, so it works even if the folder is read-only.
- **The agent writes:** `%LOCALAPPDATA%\Acknowledger\` —
  `agent_state.json` (the device token after signup), `agent_buffer.db`
  (offline buffer), and `agent.log` (a running log; check here first if
  something looks wrong). This avoids Program Files / permission issues that
  can stop the token from saving.
- The device token is also shown in a popup right after you register, so you can
  copy it into the Chrome extension.

## Notes

- Heartbeats buffer to `agent_buffer.db` and resend when the network returns.
- URL capture uses the companion Chrome extension (see `../extension`), which
  posts the active tab URL; the desktop agent only sees window titles.
- This is an internal tool: it has no anti-tamper layer by design. If you later
  distribute it outside machines you control, add code signing and a watchdog.
