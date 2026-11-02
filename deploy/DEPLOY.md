# Deploying Acknowledger to https://proafpl.anametaiot.com

One domain serves everything: the web app at `/`, the API at `/api/`. All
clients (browser, desktop agent, Chrome extension) use the base URL
**`https://proafpl.anametaiot.com/api`**.

Paths below assume the project lives at `/opt/acknowledger` and the built
frontend is copied to `/var/www/acknowledger`. Adjust to taste.

## 1. Backend

```bash
sudo mkdir -p /opt/acknowledger
sudo cp -r backend /opt/acknowledger/
cd /opt/acknowledger/backend

python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt        # includes gunicorn
# For PostgreSQL also: pip install "psycopg[binary]"

cp .env.example .env
#   - set JWT_SECRET to a long random string
#   - set DATABASE_URL (SQLite path or PostgreSQL URL)
#   - CORS_ORIGINS=*  is fine (bearer-token auth, no cookies)

# If using the SQLite path from .env.example:
sudo mkdir -p /var/lib/acknowledger && sudo chown www-data:www-data /var/lib/acknowledger

python seed.py                         # OPTIONAL: demo data. Skip for a clean start.
```

Run it as a service:

```bash
sudo cp deploy/acknowledger.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now acknowledger
sudo systemctl status acknowledger     # should be "active (running)"
```

> Starting clean (no seed)? Create your first admin from a one-off shell:
> ```bash
> cd /opt/acknowledger/backend && . .venv/bin/activate
> python -c "from app.database import SessionLocal,Base,engine; from app.models import User; from app.security import hash_password; Base.metadata.create_all(engine); d=SessionLocal(); d.add(User(name='Admin',email='admin@yourco.com',role='admin',team='Management',username='admin',password_hash=hash_password('CHANGE-ME'))); d.commit(); print('admin created')"
> ```

## 2. Frontend

Build on any machine with Node, then copy the static output to the server.

```bash
cd frontend
npm install
npm run build                          # uses .env.production -> /api base URL
# copy the build output to the web root on the server:
sudo mkdir -p /var/www/acknowledger
sudo cp -r dist/* /var/www/acknowledger/
```

## 3. nginx + TLS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/acknowledger
sudo ln -s /etc/nginx/sites-available/acknowledger /etc/nginx/sites-enabled/
sudo certbot --nginx -d proafpl.anametaiot.com   # issues + wires up the cert
sudo nginx -t && sudo systemctl reload nginx
```

Check it:
- `https://proafpl.anametaiot.com/`           → the login page
- `https://proafpl.anametaiot.com/api/health` → `{"status":"ok"}`

## 4. Agent (recruiter machines)

Ship `agent.exe` with an `agent_config.json` next to it containing:

```json
{ "server_url": "https://proafpl.anametaiot.com/api",
  "heartbeat_seconds": 60, "idle_threshold_seconds": 300, "flush_every": 5 }
```

No ngrok header needed on a real domain. Rebuild with
`pyinstaller --onefile --noconsole agent.py`.

## 5. Chrome extension

`manifest.json` and the defaults already point at the domain. Load it, open its
options, confirm the Server URL is `https://proafpl.anametaiot.com/api`, paste
the device token, and click **Test connection** — it should say "Connected".

## If your proxy layout differs

Everything keys off one base URL. If you put the API somewhere else (a different
path or an `api.` subdomain), change it in exactly three places:
- `frontend/.env.production` → `VITE_API_URL` (then rebuild)
- `agent/agent_config.json` → `server_url`
- the extension's Server URL field (and `background.js` `DEFAULT_SERVER`)
