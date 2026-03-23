"""Voltcontrol.io — Klantportaal voor laadpalen beheer."""
import json
import os
import secrets
import bcrypt
import psycopg2
import psycopg2.extras
from pathlib import Path
from datetime import datetime, timezone
from contextlib import contextmanager
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title='Voltcontrol')

STATE_FILE = Path('/opt/ocpp/state.json')
DB_CONFIG = {
    'dbname': 'ocpp_ems',
    'user': 'ocpp',
    'password': 'LaadpaalEMS2026!',
    'host': 'localhost',
}

# Sessions
customer_sessions = {}  # token -> {customer_id, name, slug, email, charger_ids}


@contextmanager
def get_conn():
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_state():
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {'chargers': {}}


def get_customer_by_email(email):
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM customers WHERE email = %s AND active = TRUE", (email,))
        return cur.fetchone()


def get_customer_charger_ids(customer_id):
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT cp_id, display_name, location_name FROM customer_chargers WHERE customer_id = %s", (customer_id,))
        return cur.fetchall()


def get_customer_sessions(cp_ids, limit=50):
    if not cp_ids:
        return []
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT * FROM sessions
            WHERE cp_id = ANY(%s)
            ORDER BY start_time DESC
            LIMIT %s
        """, (cp_ids, limit))
        return cur.fetchall()


def verify_customer(request: Request):
    token = request.cookies.get('vc_session')
    if not token or token not in customer_sessions:
        raise HTTPException(status_code=401, detail='Niet ingelogd')
    session = customer_sessions[token]
    # Refresh charger list
    chargers = get_customer_charger_ids(session['customer_id'])
    session['charger_ids'] = [c['cp_id'] for c in chargers]
    session['charger_map'] = {c['cp_id']: c for c in chargers}
    return session


# === Auth middleware ===
@app.middleware('http')
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if path in ('/login', '/auth/login', '/auth/logout', '/favicon.ico'):
        return await call_next(request)
    if path.startswith('/assets/'):
        return await call_next(request)
    token = request.cookies.get('vc_session')
    if not token or token not in customer_sessions:
        if path.startswith('/api/'):
            return JSONResponse({'error': 'Niet ingelogd'}, status_code=401)
        return RedirectResponse('/login')
    return await call_next(request)


# === Auth endpoints ===
class LoginRequest(BaseModel):
    email: str
    password: str


@app.get('/login', response_class=HTMLResponse)
def login_page():
    return LOGIN_HTML


@app.post('/auth/login')
def do_login(req: LoginRequest):
    customer = get_customer_by_email(req.email)
    if not customer:
        raise HTTPException(status_code=401, detail='Onbekend account')
    if not bcrypt.checkpw(req.password.encode(), customer['password_hash'].encode()):
        raise HTTPException(status_code=401, detail='Onjuist wachtwoord')
    token = secrets.token_urlsafe(32)
    customer_sessions[token] = {
        'customer_id': customer['id'],
        'name': customer['name'],
        'slug': customer['slug'],
        'email': customer['email'],
        'color': customer.get('color', '#38bdf8'),
    }
    response = JSONResponse({'ok': True, 'name': customer['name']})
    response.set_cookie('vc_session', token, httponly=True, max_age=86400 * 30, samesite='lax')
    return response


@app.get('/auth/logout')
def do_logout(request: Request):
    token = request.cookies.get('vc_session')
    if token:
        customer_sessions.pop(token, None)
    response = RedirectResponse('/login')
    response.delete_cookie('vc_session')
    return response


# === API endpoints ===
@app.get('/api/me')
def api_me(session=Depends(verify_customer)):
    return {
        'name': session['name'],
        'email': session['email'],
        'color': session.get('color', '#38bdf8'),
        'charger_count': len(session['charger_ids']),
    }


@app.get('/api/dashboard')
def api_dashboard(session=Depends(verify_customer)):
    state = get_state()
    chargers = state.get('chargers', {})
    cp_ids = session['charger_ids']
    charger_map = session.get('charger_map', {})

    online = 0
    offline = 0
    charging = 0
    total_power = 0
    total_connectors = 0
    available_connectors = 0
    charger_list = []

    for cp_id in cp_ids:
        cp = chargers.get(cp_id, {})
        info = charger_map.get(cp_id, {})
        is_connected = cp.get('connected', False)
        if is_connected:
            online += 1
        else:
            offline += 1

        cp_charging = False
        cp_power = 0
        conns = []
        for cid, conn in cp.get('connectors', {}).items():
            if cid == '0':
                continue
            total_connectors += 1
            status = conn.get('status', 'Unknown')
            if status == 'Available':
                available_connectors += 1
            if status == 'Charging':
                charging += 1
                cp_charging = True
            # Power from meter values
            mv = conn.get('meter_values')
            power = 0
            if mv and mv[0].get('sampled_value'):
                for v in mv[0]['sampled_value']:
                    if 'Power.Active.Import' in (v.get('measurand') or ''):
                        power = float(v.get('value', 0))
                        cp_power += power
            conns.append({
                'id': cid,
                'status': status,
                'error_code': conn.get('error_code', ''),
                'power_w': power,
            })

        total_power += cp_power
        charger_list.append({
            'cp_id': cp_id,
            'display_name': info.get('display_name') or cp_id,
            'location': info.get('location_name') or '',
            'vendor': cp.get('vendor', ''),
            'model': cp.get('model', ''),
            'connected': is_connected,
            'charging': cp_charging,
            'power_w': cp_power,
            'connectors': conns,
            'last_heartbeat': cp.get('last_heartbeat'),
        })

    return {
        'online': online,
        'offline': offline,
        'charging': charging,
        'total_power_w': total_power,
        'total_connectors': total_connectors,
        'available_connectors': available_connectors,
        'chargers': charger_list,
    }


@app.get('/api/sessions')
def api_sessions(session=Depends(verify_customer), limit: int = 50):
    cp_ids = session['charger_ids']
    sessions = get_customer_sessions(cp_ids, limit)
    result = []
    for s in sessions:
        result.append({
            'cp_id': s['cp_id'],
            'connector_id': s.get('connector_id'),
            'start_time': s['start_time'].isoformat() if s.get('start_time') else None,
            'stop_time': s['stop_time'].isoformat() if s.get('stop_time') else None,
            'duration_min': s.get('duration_min', 0),
            'energy_wh': s.get('energy_wh', 0),
            'cost_incl_vat': float(s['cost_incl_vat']) if s.get('cost_incl_vat') else None,
            'id_tag': s.get('id_tag'),
            'max_power_w': s.get('max_power_w', 0),
        })
    return result


# === Pages ===
@app.get('/', response_class=HTMLResponse)
def index(session=Depends(verify_customer)):
    return PORTAL_HTML.replace('__CUSTOMER_NAME__', session['name']).replace('__CUSTOMER_COLOR__', session.get('color', '#38bdf8'))


# === HTML Templates ===

LOGIN_HTML = """<!DOCTYPE html>
<html lang="nl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Inloggen — Voltcontrol</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0a0a0f; color:#e2e8f0; font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; display:flex; justify-content:center; align-items:center; min-height:100vh; }
.login-box { background:#111118; border-radius:16px; padding:48px; border:1px solid #1e1e2e; width:100%; max-width:400px; box-shadow:0 20px 60px rgba(0,0,0,0.5); }
.logo { text-align:center; margin-bottom:32px; }
.logo h1 { font-size:28px; font-weight:700; background:linear-gradient(135deg,#38bdf8,#818cf8); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.logo p { color:#64748b; font-size:13px; margin-top:4px; }
label { display:block; color:#94a3b8; font-size:12px; font-weight:500; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px; }
input { width:100%; padding:12px 16px; background:#0a0a0f; border:1px solid #1e1e2e; border-radius:8px; color:#e2e8f0; font-size:14px; margin-bottom:20px; transition:border-color 0.2s; }
input:focus { outline:none; border-color:#38bdf8; }
button { width:100%; padding:14px; background:linear-gradient(135deg,#2563eb,#7c3aed); color:white; border:none; border-radius:8px; font-size:15px; font-weight:600; cursor:pointer; transition:transform 0.1s; }
button:hover { transform:translateY(-1px); }
button:active { transform:translateY(0); }
.error { color:#f87171; font-size:13px; margin-bottom:16px; display:none; text-align:center; }
.footer { text-align:center; margin-top:24px; color:#475569; font-size:11px; }
</style></head><body>
<div class="login-box">
<div class="logo">
    <h1>Voltcontrol</h1>
    <p>Energy Management Platform</p>
</div>
<div class="error" id="error">Onjuist e-mailadres of wachtwoord</div>
<form id="form">
<label>E-mailadres</label>
<input type="email" id="email" autocomplete="email" required placeholder="uw@email.nl">
<label>Wachtwoord</label>
<input type="password" id="pass" autocomplete="current-password" required placeholder="Uw wachtwoord">
<button type="submit">Inloggen</button>
</form>
<div class="footer">Voltcontrol BV &mdash; Energy Management</div>
</div>
<script>
document.getElementById('form').onsubmit = async (e) => {
    e.preventDefault();
    document.getElementById('error').style.display = 'none';
    const resp = await fetch('/auth/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email: document.getElementById('email').value, password: document.getElementById('pass').value})
    });
    if (resp.ok) { window.location.href = '/'; }
    else { document.getElementById('error').style.display = 'block'; }
};
</script></body></html>"""


PORTAL_HTML = r"""<!DOCTYPE html>
<html lang="nl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__CUSTOMER_NAME__ — Voltcontrol</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0a0a0f; color:#e2e8f0; font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; }

/* Navigation */
.topbar { background:#111118; padding:14px 24px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e1e2e; }
.topbar .brand { font-size:18px; font-weight:700; background:linear-gradient(135deg,#38bdf8,#818cf8); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.topbar .customer { color:#94a3b8; font-size:13px; }
.topbar .nav { display:flex; gap:8px; }
.topbar .nav a { color:#94a3b8; text-decoration:none; font-size:13px; padding:6px 14px; border-radius:6px; transition:all 0.2s; }
.topbar .nav a:hover, .topbar .nav a.active { color:#e2e8f0; background:#1e1e2e; }
.topbar .logout { color:#64748b; text-decoration:none; font-size:12px; }

/* Content */
.content { max-width:1200px; margin:0 auto; padding:24px; }

/* Stats */
.stats { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-bottom:24px; }
.stat { background:#111118; border-radius:12px; padding:20px; border:1px solid #1e1e2e; }
.stat .label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; }
.stat .value { font-size:28px; font-weight:700; }
.stat .value.green { color:#34d399; }
.stat .value.red { color:#f87171; }
.stat .value.blue { color:#38bdf8; }
.stat .value.yellow { color:#fbbf24; }
.stat .unit { font-size:14px; font-weight:400; color:#64748b; margin-left:4px; }

/* Charger cards */
.chargers { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:12px; margin-bottom:24px; }
.charger { background:#111118; border-radius:12px; padding:16px 20px; border:1px solid #1e1e2e; transition:border-color 0.2s; }
.charger:hover { border-color:#2e2e3e; }
.charger .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.charger .name { font-size:15px; font-weight:600; color:#f1f5f9; }
.charger .id { font-size:11px; color:#64748b; font-family:monospace; }
.charger .location { font-size:12px; color:#64748b; margin-top:2px; }
.badge { display:inline-block; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; }
.badge.online { background:#065f4620; color:#34d399; }
.badge.offline { background:#7f1d1d20; color:#f87171; }
.badge.charging { background:#065f4640; color:#34d399; animation:pulse-charge 2s ease-in-out infinite; }
@keyframes pulse-charge { 0%,100% { opacity:1; } 50% { opacity:0.7; } }

/* Connectors */
.connectors { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
.conn { background:#0a0a0f; border-radius:8px; padding:10px 14px; flex:1; min-width:120px; border:1px solid #1e1e2e; }
.conn .conn-id { font-size:11px; color:#64748b; margin-bottom:4px; }
.conn .conn-status { font-size:13px; font-weight:600; }
.conn .conn-power { font-size:18px; font-weight:700; color:#34d399; margin-top:4px; }

/* Sessions table */
h2 { color:#f1f5f9; font-size:18px; margin-bottom:16px; }
.sessions-panel { background:#111118; border-radius:12px; border:1px solid #1e1e2e; overflow:hidden; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th { text-align:left; color:#64748b; padding:12px 16px; border-bottom:1px solid #1e1e2e; font-weight:500; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }
td { padding:10px 16px; border-bottom:1px solid #0a0a0f; }
tr:hover td { background:#1e1e2e20; }
.energy { color:#34d399; font-weight:600; }
.cost { color:#fbbf24; font-weight:600; }
.tag { font-family:monospace; font-size:11px; color:#64748b; }
.no-data { color:#475569; padding:24px; text-align:center; }

/* Tabs */
.tabs { display:flex; gap:4px; margin-bottom:20px; }
.tab { padding:8px 18px; border-radius:8px; cursor:pointer; color:#64748b; font-size:13px; font-weight:500; transition:all 0.2s; }
.tab:hover { color:#e2e8f0; }
.tab.active { background:#1e1e2e; color:#e2e8f0; }
.tab-content { display:none; }
.tab-content.active { display:block; }

/* Responsive */
@media(max-width:640px) {
    .stats { grid-template-columns:repeat(2, 1fr); }
    .chargers { grid-template-columns:1fr; }
    .topbar { flex-direction:column; gap:8px; }
}

/* Loading */
.loading { color:#475569; padding:40px; text-align:center; }
</style></head><body>

<div class="topbar">
    <div>
        <span class="brand">Voltcontrol</span>
        <span class="customer">&nbsp;&mdash;&nbsp;__CUSTOMER_NAME__</span>
    </div>
    <div class="nav">
        <a href="#" class="active" onclick="showTab('overview')">Overzicht</a>
        <a href="#" onclick="showTab('sessions')">Sessies</a>
    </div>
    <a href="/auth/logout" class="logout">Uitloggen</a>
</div>

<div class="content">
    <div id="tab-overview" class="tab-content active">
        <div class="stats" id="stats"><div class="loading">Laden...</div></div>
        <div class="chargers" id="chargers"></div>
    </div>
    <div id="tab-sessions" class="tab-content">
        <h2>Laatste laadsessies</h2>
        <div class="sessions-panel" id="sessions-panel"><div class="loading">Laden...</div></div>
    </div>
</div>

<script>
let currentData = {};

function showTab(name) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    document.querySelectorAll('.nav a').forEach(a => {
        a.classList.toggle('active', a.textContent.toLowerCase().includes(name.substring(0, 4)));
    });
    if (name === 'sessions') loadSessions();
}

async function loadDashboard() {
    try {
        const resp = await fetch('/api/dashboard');
        if (resp.status === 401) { window.location.href = '/login'; return; }
        currentData = await resp.json();
        renderStats(currentData);
        renderChargers(currentData);
    } catch(e) {
        console.error('Dashboard load error:', e);
    }
}

function renderStats(d) {
    const el = document.getElementById('stats');
    let html = '';
    html += '<div class="stat"><div class="label">Online</div><div class="value green">' + d.online + '<span class="unit">/ ' + (d.online + d.offline) + '</span></div></div>';
    html += '<div class="stat"><div class="label">Aan het laden</div><div class="value blue">' + d.charging + '</div></div>';
    html += '<div class="stat"><div class="label">Totaal vermogen</div><div class="value green">' + (d.total_power_w / 1000).toFixed(1) + '<span class="unit">kW</span></div></div>';
    html += '<div class="stat"><div class="label">Connectors vrij</div><div class="value">' + d.available_connectors + '<span class="unit">/ ' + d.total_connectors + '</span></div></div>';
    if (d.offline > 0) {
        html += '<div class="stat"><div class="label">Offline</div><div class="value red">' + d.offline + '</div></div>';
    }
    el.innerHTML = html;
}

function renderChargers(d) {
    const el = document.getElementById('chargers');
    if (!d.chargers || d.chargers.length === 0) {
        el.innerHTML = '<div class="no-data">Geen laadpalen gekoppeld aan uw account</div>';
        return;
    }
    let html = '';
    for (const cp of d.chargers.sort((a, b) => a.display_name.localeCompare(b.display_name))) {
        const statusCls = cp.charging ? 'charging' : cp.connected ? 'online' : 'offline';
        const statusText = cp.charging ? 'Laden' : cp.connected ? 'Online' : 'Offline';

        html += '<div class="charger">';
        html += '<div class="header">';
        html += '<div><div class="name">' + escapeHtml(cp.display_name) + '</div>';
        if (cp.location) html += '<div class="location">' + escapeHtml(cp.location) + '</div>';
        html += '<div class="id">' + cp.cp_id + ' &middot; ' + (cp.vendor || '') + ' ' + (cp.model || '') + '</div></div>';
        html += '<span class="badge ' + statusCls + '">' + statusText + '</span>';
        html += '</div>';

        // Connectors
        if (cp.connectors && cp.connectors.length > 0) {
            html += '<div class="connectors">';
            for (const conn of cp.connectors) {
                const cStatus = conn.status || 'Unknown';
                const cColor = cStatus === 'Charging' ? '#34d399' : cStatus === 'Available' ? '#38bdf8' : '#f87171';
                const label = conn.id.length > 3 ? 'C' + conn.id.slice(-4) : 'C' + conn.id;
                html += '<div class="conn">';
                html += '<div class="conn-id">' + label + '</div>';
                html += '<div class="conn-status" style="color:' + cColor + ';">' + cStatus + '</div>';
                if (conn.power_w > 0) {
                    html += '<div class="conn-power">' + (conn.power_w / 1000).toFixed(1) + ' kW</div>';
                }
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
    }
    el.innerHTML = html;
}

async function loadSessions() {
    const el = document.getElementById('sessions-panel');
    try {
        const resp = await fetch('/api/sessions?limit=50');
        if (resp.status === 401) { window.location.href = '/login'; return; }
        const sessions = await resp.json();
        if (!sessions.length) {
            el.innerHTML = '<div class="no-data">Nog geen laadsessies geregistreerd</div>';
            return;
        }
        let html = '<table><thead><tr><th>Laadpaal</th><th>Connector</th><th>Start</th><th>Duur</th><th>Energie</th><th>Kosten</th><th>RFID</th></tr></thead><tbody>';
        for (const s of sessions) {
            const start = s.start_time ? new Date(s.start_time).toLocaleString('nl-NL', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : '-';
            const dur = s.duration_min >= 60 ? Math.floor(s.duration_min / 60) + 'u ' + (s.duration_min % 60) + 'm' : (s.duration_min || 0) + ' min';
            const energy = s.energy_wh ? (s.energy_wh / 1000).toFixed(1) + ' kWh' : '-';
            const cost = s.cost_incl_vat !== null ? '\u20ac' + s.cost_incl_vat.toFixed(2) : '-';
            html += '<tr>';
            html += '<td>' + s.cp_id + '</td>';
            html += '<td>C' + (s.connector_id || '?') + '</td>';
            html += '<td>' + start + '</td>';
            html += '<td>' + dur + '</td>';
            html += '<td class="energy">' + energy + '</td>';
            html += '<td class="cost">' + cost + '</td>';
            html += '<td class="tag">' + (s.id_tag || '-') + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
        el.innerHTML = html;
    } catch(e) {
        el.innerHTML = '<div class="no-data">Fout bij laden: ' + e.message + '</div>';
    }
}

function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Init
loadDashboard();
setInterval(loadDashboard, 10000);
</script>
</body></html>"""


if __name__ == '__main__':
    port = int(os.environ.get('PORTAL_PORT', 3000))
    uvicorn.run(app, host='0.0.0.0', port=port)
