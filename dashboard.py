import asyncio
import json
import socket
import os
import pty
import select
import struct
import fcntl
import termios
import signal
import hashlib
import secrets
from pathlib import Path
from datetime import datetime, timezone
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import anthropic
import db

app = FastAPI(title='Laadpalen Dashboard')

# Admin auth
ADMIN_USER = os.environ.get('ADMIN_USER', 'admin')
ADMIN_PASS_HASH = os.environ.get('ADMIN_PASS_HASH', hashlib.sha256('Laadpaal2026!'.encode()).hexdigest())
SESSION_SECRET = os.environ.get('SESSION_SECRET', 'aSGDxztLmEWwmiAZmBrDvQJuv71VVuqO')
active_sessions = {}  # token -> {'user': str, 'created': datetime}


def verify_session(request: Request):
    token = request.cookies.get('session')
    if not token or token not in active_sessions:
        raise HTTPException(status_code=401, detail='Not authenticated')
    return active_sessions[token]


LOGIN_HTML = """<!DOCTYPE html>
<html lang="nl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Login - Laadpalen Dashboard</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0f172a; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,sans-serif; display:flex; justify-content:center; align-items:center; min-height:100vh; }
.login-box { background:#1e293b; border-radius:12px; padding:40px; border:1px solid #334155; width:100%; max-width:380px; }
h1 { color:#f1f5f9; margin-bottom:8px; font-size:22px; }
.subtitle { color:#94a3b8; margin-bottom:24px; font-size:14px; }
label { display:block; color:#94a3b8; font-size:13px; margin-bottom:4px; }
input { width:100%; padding:10px 14px; background:#0f172a; border:1px solid #334155; border-radius:6px; color:#e2e8f0; font-size:14px; margin-bottom:16px; }
input:focus { outline:none; border-color:#38bdf8; }
button { width:100%; padding:12px; background:#2563eb; color:white; border:none; border-radius:6px; font-size:14px; font-weight:600; cursor:pointer; }
button:hover { background:#1d4ed8; }
.error { color:#f87171; font-size:13px; margin-bottom:12px; display:none; }
</style></head><body>
<div class="login-box">
<h1>Laadpalen Dashboard</h1>
<div class="subtitle">Log in om verder te gaan</div>
<div class="error" id="error">Onjuiste gebruikersnaam of wachtwoord</div>
<form id="form">
<label>Gebruikersnaam</label>
<input type="text" id="user" autocomplete="username" required>
<label>Wachtwoord</label>
<input type="password" id="pass" autocomplete="current-password" required>
<button type="submit">Inloggen</button>
</form>
</div>
<script>
document.getElementById('form').onsubmit = async (e) => {
    e.preventDefault();
    const resp = await fetch('/auth/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({username: document.getElementById('user').value, password: document.getElementById('pass').value})
    });
    if (resp.ok) { window.location.href = '/'; }
    else { document.getElementById('error').style.display = 'block'; }
};
</script></body></html>"""


class LoginRequest(BaseModel):
    username: str
    password: str


@app.get('/login', response_class=HTMLResponse)
def login_page():
    return LOGIN_HTML


@app.post('/auth/login')
def do_login(req: LoginRequest):
    pass_hash = hashlib.sha256(req.password.encode()).hexdigest()
    if req.username == ADMIN_USER and pass_hash == ADMIN_PASS_HASH:
        token = secrets.token_urlsafe(32)
        active_sessions[token] = {'user': req.username, 'created': datetime.now(timezone.utc).isoformat()}
        response = JSONResponse({'ok': True})
        response.set_cookie('session', token, httponly=True, max_age=86400 * 7, samesite='lax')
        return response
    raise HTTPException(status_code=401, detail='Invalid credentials')


@app.get('/auth/logout')
def do_logout(request: Request):
    token = request.cookies.get('session')
    if token and token in active_sessions:
        del active_sessions[token]
    response = RedirectResponse('/login')
    response.delete_cookie('session')
    return response


@app.middleware('http')
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    # Public routes
    if path in ('/login', '/auth/login', '/auth/logout', '/favicon.ico'):
        return await call_next(request)
    # Client portalen, driver portal, QR codes (geen login nodig)
    if path.startswith('/client/') or path.startswith('/api/client/') or path.startswith('/charge/') or path.startswith('/api/driver/') or path.startswith('/qr'):
        return await call_next(request)
    # External API (uses API key, not session)
    if path.startswith('/v1/'):
        return await call_next(request)
    # WebSocket (has own auth)
    if path.startswith('/ws/'):
        return await call_next(request)
    # Check session
    token = request.cookies.get('session')
    if not token or token not in active_sessions:
        if path.startswith('/api/'):
            return JSONResponse({'error': 'Not authenticated'}, status_code=401)
        return RedirectResponse('/login')
    return await call_next(request)

# Public API key for external access (Voltcontrol etc.)
EXTERNAL_API_KEY = os.environ.get('EXTERNAL_API_KEY', 'ZuSdwOK7sy3PF1qc43kdVyviNG1HVIFJf2MshbdqFQg')

def verify_api_key(request: Request):
    key = request.headers.get('X-API-Key') or request.query_params.get('api_key')
    if key != EXTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail='Invalid API key')
    return key

STATE_FILE = Path('/opt/ocpp/state.json')
SOCK_PATH = '/opt/ocpp/proxy.sock'
API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')

client = anthropic.Anthropic(api_key=API_KEY) if API_KEY else None

# Track external API connections (Voltcontrol etc.)
api_connections = {}  # {'voltcontrol': {'last_poll': iso, 'first_poll': iso, 'poll_count': 0, 'chargers_requested': set()}}

SYSTEM_PROMPT = """Je bent een assistent die helpt met het beheren van OCPP laadpalen. Spreek Nederlands.

Setup:
- VPS: 46.62.148.12 (Debian 11), OCPP proxy op poort 80
- Dashboard op poort 8080
- Proxy stuurt OCPP berichten door naar meerdere backends

Laadpalen:
- 11772540: Ecotap DUO, backends: voltcontrol + evinty. Hardware storing (PowerMeterFailure, RCD Error)
- 11772560: Ecotap DUO, backend: evinty. Had UseTLS probleem, nu wisselend online
- 11727711: Ecotap EVC2.2, backends: voltcontrol + evinty. Soms instabiel
- EVB-P2447137: EV-BOX G3-M7500E, backend: eflux. Stabiel

Backends:
- Voltcontrol: wss://...supabase.co/functions/v1/ocpp-ws/{id}
- Evinty: ws://portal.evinity.io:80/cpms/websockets/{id}
- E-flux: ws://ocpp.e-flux.nl/1.6/e-flux/{id}

VPS-PROXY-01 is een virtuele laadpaal in Voltcontrol die de proxy status monitort.

Huidige laadpaal status:
{state}

Je kunt adviseren over OCPP commando's, debugging, en configuratie. Houd antwoorden kort en praktisch."""


class ChatRequest(BaseModel):
    messages: list
    state: Optional[dict] = None


class CommandRequest(BaseModel):
    cp_id: str
    action: str
    payload: dict = {}


def get_state():
    try:
        return json.loads(STATE_FILE.read_text())
    except:
        return {'chargers': {}, 'updated_at': None}


def send_command(cp_id: str, action: str, payload: dict):
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect(SOCK_PATH)
        cmd = json.dumps({'cp_id': cp_id, 'action': action, 'payload': payload})
        sock.sendall(cmd.encode())
        response = sock.recv(4096)
        sock.close()
        return json.loads(response)
    except Exception as e:
        return {'error': str(e)}


@app.get('/api/state')
def api_state():
    state = get_state()
    state['api_connections'] = api_connections
    return state


@app.get('/api/client/state')
def api_client_state():
    """Public state API voor klant portalen — geen auth nodig."""
    return get_state()


@app.get('/api/client/tectronic')
def api_client_tectronic():
    """Public Tec-Tronic API voor klant portalen."""
    try:
        data = json.loads(STATE_FILE.read_text())
        return data.get('chargers', {}).get('_tectronic', {})
    except:
        return {}


# === Driver Portal ===
from driver_portal import DRIVER_HTML
from pydantic import BaseModel as _BM


class CheckinReq(_BM):
    battery_pct: int
    target_pct: int = 80
    driver_name: str = ''
    phone: str = ''


class ReserveReq(_BM):
    driver_name: str
    driver_phone: str = ''
    battery_pct: int = 20


class IssueReq(_BM):
    reporter_name: str = ''
    reporter_phone: str = ''
    issue_type: str
    description: str = ''


@app.get('/charge/{cp_id}', response_class=HTMLResponse)
def driver_page(cp_id: str):
    return DRIVER_HTML.replace('__CP_ID__', cp_id)


@app.get('/charge/{cp_id}/{connector_id}', response_class=HTMLResponse)
def driver_page_conn(cp_id: str, connector_id: str):
    return DRIVER_HTML.replace('__CP_ID__', cp_id)


@app.post('/api/driver/{cp_id}/checkin')
def api_driver_checkin(cp_id: str, req: CheckinReq):
    result = db.driver_checkin(cp_id, None, req.driver_name, req.battery_pct, req.target_pct, req.phone)
    return result or {'error': 'Check-in mislukt'}


@app.post('/api/driver/{cp_id}/reserve')
def api_driver_reserve(cp_id: str, req: ReserveReq):
    res_id = db.create_reservation(cp_id, None, req.driver_name, req.driver_phone, req.battery_pct)
    if res_id:
        return {'id': res_id, 'expires_at': (datetime.now(timezone.utc) + __import__('datetime').timedelta(minutes=30)).isoformat()}
    return {'error': 'Reservering mislukt'}


@app.post('/api/driver/{cp_id}/report')
def api_driver_report(cp_id: str, req: IssueReq):
    issue_id = db.create_issue_report(cp_id, None, req.reporter_name, req.reporter_phone, req.issue_type, req.description)
    if issue_id:
        return {'id': issue_id}
    return {'error': 'Melding mislukt'}


@app.post('/api/driver/{cp_id}/gps-scan')
def api_gps_scan(cp_id: str, req: dict):
    """Sla GPS positie op bij QR scan. Auto-update paal locatie na genoeg scans."""
    lat = req.get('latitude')
    lon = req.get('longitude')
    accuracy = req.get('accuracy')
    rfid_tag = req.get('rfid_tag')
    if not lat or not lon:
        return {'error': 'Geen GPS'}
    result = db.save_gps_scan(cp_id, lat, lon, accuracy, rfid_tag)
    return result or {'error': 'Opslaan mislukt'}


@app.get('/api/driver/{cp_id}/reservations')
def api_driver_reservations(cp_id: str):
    return db.get_active_reservations(cp_id)


@app.get('/api/driver/{cp_id}/checkins')
def api_driver_checkins(cp_id: str):
    return db.get_active_checkins(cp_id)


@app.get('/qr/{cp_id}.png')
def qr_code(cp_id: str):
    import qrcode, io
    url = f'http://46.62.148.12:8080/charge/{cp_id}'
    qr = qrcode.make(url, box_size=8, border=2)
    buf = io.BytesIO()
    qr.save(buf, format='PNG')
    buf.seek(0)
    from starlette.responses import Response
    return Response(content=buf.read(), media_type='image/png')


@app.get('/qr', response_class=HTMLResponse)
def qr_overview():
    """Overzicht van alle QR codes voor Jumbo Veghel palen."""
    state = get_state()
    chargers = {k: v for k, v in state.get('chargers', {}).items()
                if not k.startswith('_') and (k.startswith('117') or k.startswith('189'))}
    html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR Codes</title>'
    html += '<style>body{background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:20px;}'
    html += '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;}'
    html += '.qr-card{background:#1e293b;border-radius:12px;padding:16px;text-align:center;border:1px solid #334155;}'
    html += '.qr-card img{width:180px;height:180px;border-radius:8px;background:white;padding:8px;}'
    html += '.qr-card h3{margin:8px 0 4px;font-size:14px;color:#38bdf8;}'
    html += '.qr-card p{font-size:11px;color:#94a3b8;}'
    html += '@media print{body{background:white;color:black;}.qr-card{border:1px solid #ccc;break-inside:avoid;}}</style></head><body>'
    html += '<h1 style="color:#38bdf8;margin-bottom:20px;">QR Codes — Jumbo Veghel</h1>'
    html += '<p style="color:#94a3b8;margin-bottom:20px;">Print deze pagina en bevestig de QR codes bij de laadpalen.</p>'
    html += '<div class="grid">'
    for cp_id in sorted(chargers.keys()):
        cp = chargers[cp_id]
        html += f'<div class="qr-card">'
        html += f'<img src="/qr/{cp_id}.png" alt="QR {cp_id}">'
        html += f'<h3>{cp_id}</h3>'
        html += f'<p>{cp.get("vendor", "")} {cp.get("model", "")}</p>'
        html += f'<p>Scan om te laden, reserveren of storing te melden</p>'
        html += '</div>'
    html += '</div></body></html>'
    return html


# === GPS Auto Start/Stop ===

@app.post('/api/driver/gps/update')
def api_gps_update(req: dict):
    """Bestuurder stuurt GPS positie. Detecteert nabije laadpaal en start/stop automatisch."""
    lat = req.get('latitude')
    lon = req.get('longitude')
    driver_id = req.get('driver_id', '')
    session_id = req.get('session_id')

    if not lat or not lon:
        return {'error': 'Geen GPS positie'}

    # Zoek nabije laadpalen
    nearby = db.get_nearby_chargers(lat, lon, max_distance_m=50)

    result = {
        'nearby': [{'cp_id': c['cp_id'], 'distance_m': round(c['distance_m'], 1)} for c in nearby],
        'action': None,
    }

    if nearby and session_id:
        closest = nearby[0]
        if closest['distance_m'] <= closest.get('geofence_radius_m', 30):
            # Binnen geofence — check of bestuurder geverifieerd is
            profile = db.get_driver_profile(driver_id) if driver_id else None
            if not profile or not profile.get('verified'):
                result['action'] = 'need_rfid'
                result['message'] = 'U bent bij de paal. Scan uw laadpas om uw account te activeren.'
                return result

            # Geverifieerd — auto-start met gekoppelde RFID
            gps_sessions = db.get_active_gps_sessions(closest['cp_id'])
            active = [s for s in gps_sessions if str(s['id']) == str(session_id)]
            if active and not active[0].get('transaction_started'):
                rfid_tag = profile.get('rfid_tag', 'GPS_AUTO')
                cmd_result = send_command(closest['cp_id'], 'RemoteStartTransaction', {
                    'connectorId': 1, 'idTag': rfid_tag
                })
                db.update_gps_session(session_id, 'charging', transaction_started=True)
                result['action'] = 'started'
                result['message'] = 'Laden automatisch gestart met pas ' + rfid_tag[-6:]

    return result


@app.post('/api/driver/gps/register')
def api_gps_register(req: dict):
    """Bestuurder registreert zich voor GPS auto start."""
    cp_id = req.get('cp_id')
    driver_name = req.get('driver_name', '')
    phone = req.get('phone', '')
    battery_pct = req.get('battery_pct', 50)
    target_pct = req.get('target_pct', 80)
    lat = req.get('latitude', 0)
    lon = req.get('longitude', 0)
    driver_id = req.get('driver_id', driver_name or 'anon')

    # Maak of update driver profiel
    db.create_driver_profile(driver_id, driver_name, phone)

    # Check of bestuurder al een gekoppelde RFID heeft
    profile = db.get_driver_profile(driver_id)
    has_rfid = profile and profile.get('rfid_tag') and profile.get('verified')

    if has_rfid:
        # Bestuurder is geverifieerd — GPS auto-start kan direct
        session_id = db.create_gps_session(cp_id, driver_id, driver_name, phone, lat, lon, battery_pct, target_pct)
        if session_id:
            return {
                'ok': True, 'session_id': session_id, 'verified': True,
                'rfid_tag': profile['rfid_tag'],
                'message': 'GPS tracking actief. Laden start automatisch bij de paal.'
            }
    else:
        # Eerste keer — wacht op RFID scan
        session_id = db.create_gps_session(cp_id, driver_id, driver_name, phone, lat, lon, battery_pct, target_pct)
        if session_id:
            # Zet sessie op waiting_rfid
            db.update_gps_session(session_id, 'waiting_rfid')
            return {
                'ok': True, 'session_id': session_id, 'verified': False,
                'message': 'Scan uw laadpas bij de paal om uw account te activeren. Daarna werkt GPS laden automatisch.'
            }
    return {'error': 'Registratie mislukt'}


@app.get('/api/driver/profile/{driver_id}')
def api_driver_profile(driver_id: str):
    profile = db.get_driver_profile(driver_id)
    if profile:
        return {'verified': profile.get('verified', False), 'rfid_tag': profile.get('rfid_tag'), 'name': profile.get('driver_name')}
    return {'verified': False}


@app.post('/api/driver/gps/stop')
def api_gps_stop(req: dict):
    """Bestuurder stopt GPS sessie en laden."""
    session_id = req.get('session_id')
    cp_id = req.get('cp_id')
    if session_id:
        db.update_gps_session(session_id, 'completed')
    if cp_id:
        # RemoteStopTransaction
        send_command(cp_id, 'RemoteStopTransaction', {'transactionId': 1})
    return {'ok': True, 'message': 'Laden gestopt.'}


@app.get('/api/client/tariff')
def api_client_tariff():
    """Huidig tarief voor de bestuurders pagina."""
    tariff = db.get_tariff()
    if tariff:
        tariff.pop('identification', None)  # geen interne ID's tonen
        return tariff
    return {'price_per_kwh': 0.29, 'currency': 'EUR', 'name': 'Standaard'}


@app.get('/api/charger/{cp_id}/config')
def api_charger_config(cp_id: str):
    """Haal GetConfiguration response uit de logs voor een laadpaal."""
    import subprocess
    result = subprocess.run(
        ['journalctl', '-u', 'ocpp', '--since', '24 hours ago', '--no-pager'],
        capture_output=True, text=True, timeout=15
    )
    # Zoek de meest recente receive message met configurationKey voor deze paal
    for line in reversed(result.stdout.split('\n')):
        if cp_id not in line or 'configurationKey' not in line or 'receive message' not in line:
            continue
        try:
            # Extract het OCPP bericht: [3,"id",{...}]
            idx = line.index('[3,')
            raw = line[idx:]
            # Soms is de log afgekapt, probeer te parsen
            parsed = json.loads(raw)
            if isinstance(parsed, list) and len(parsed) >= 3:
                cfg = parsed[2].get('configurationKey', [])
                if len(cfg) > 5:  # minimaal 5 keys voor een volledige config
                    return cfg
        except json.JSONDecodeError:
            # Log is mogelijk afgekapt, probeer met } erbij
            try:
                raw2 = raw.rstrip() + ']' if not raw.rstrip().endswith(']') else raw
                parsed = json.loads(raw2)
                if isinstance(parsed, list) and len(parsed) >= 3:
                    cfg = parsed[2].get('configurationKey', [])
                    if cfg:
                        return cfg
            except:
                pass
    return []


@app.post('/api/charger/{cp_id}/alias')
def api_set_alias(cp_id: str, req: dict):
    alias = req.get('alias', '')
    location = req.get('location', '')
    client = req.get('client', '')
    try:
        with db.get_conn() as conn:
            cur = conn.cursor()
            cur.execute('UPDATE chargers SET alias=%s, location=%s, client=%s, updated_at=NOW() WHERE cp_id=%s',
                        (alias, location, client, cp_id))
        # Update runtime state
        if cp_id in get_state().get('chargers', {}):
            send_command('_quarantine', 'set', {'cp_id': cp_id, 'active': False, 'reason': ''})  # trigger state refresh
        return {'ok': True}
    except Exception as e:
        return {'error': str(e)}


@app.get('/api/knowledge')
def api_knowledge():
    try:
        with db.get_conn() as conn:
            cur = conn.cursor(cursor_factory=__import__('psycopg2').extras.RealDictCursor)
            cur.execute('SELECT * FROM knowledge_base ORDER BY category, title')
            return [dict(r) for r in cur.fetchall()]
    except:
        return []


@app.get('/tools/eccmanager', response_class=HTMLResponse)
def ecc_manager():
    """Ecotap ECC Manager — programmeer en debug tool."""
    p = Path('/opt/ocpp/eccmanager.html')
    if p.exists():
        return p.read_text()
    return '<h1>ECC Manager niet gevonden</h1>'


@app.get('/api/client/grid-history')
def api_client_grid_history():
    hours = 24
    return db.get_grid_history('grid_meter', hours)


@app.get('/api/grid-history')
def api_grid_history():
    return db.get_grid_history('grid_meter', 24)


@app.get('/api/tectronic')
def api_tectronic():
    try:
        data = json.loads(STATE_FILE.read_text())
        return data.get('chargers', {}).get('_tectronic', {})
    except:
        return {}


class GTVConfigRequest(BaseModel):
    max_kw: int = 150
    margin_pct: int = 10


@app.post('/api/gtv/config')
def api_gtv_config(req: GTVConfigRequest):
    return send_command('_gtv', 'config', {'max_kw': req.max_kw, 'margin_pct': req.margin_pct})


@app.get('/client/dekoning', response_class=HTMLResponse)
def client_dekoning():
    return _DK_HTML_IMPORT


from dekoning_html import DEKONING_HTML as _DK_HTML_IMPORT

DEKONING_HTML_OLD = r"""<!DOCTYPE html>
<html lang="nl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>De Koning - Smart Charging</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0f172a; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,sans-serif; padding:20px; }
a { color:#38bdf8; text-decoration:none; }
h1 { color:#f1f5f9; margin-bottom:4px; }
h2 { color:#38bdf8; margin:20px 0 10px; font-size:17px; }
.subtitle { color:#94a3b8; margin-bottom:20px; font-size:14px; }
.back { display:inline-block; margin-bottom:16px; color:#94a3b8; font-size:13px; }
.grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
@media(max-width:900px) { .grid3,.grid2 { grid-template-columns:1fr; } }
.panel { background:#1e293b; border-radius:10px; padding:16px; border:1px solid #334155; }
.stat { text-align:center; padding:16px; }
.stat .label { font-size:12px; color:#94a3b8; margin-bottom:4px; }
.stat .value { font-size:28px; font-weight:700; }
.stat .unit { font-size:14px; color:#94a3b8; margin-left:2px; }
.green { color:#34d399; } .red { color:#f87171; } .blue { color:#38bdf8; } .yellow { color:#fbbf24; }
.meter-bar { background:#0f172a; border-radius:6px; height:28px; position:relative; overflow:hidden; margin:6px 0; }
.meter-fill { height:100%; border-radius:6px; transition:width 0.5s; display:flex; align-items:center; padding-left:8px; font-size:12px; font-weight:600; }
.phase-row { display:flex; gap:10px; margin:4px 0; align-items:center; }
.phase-label { width:24px; font-weight:600; font-size:13px; }
.phase-vals { font-size:13px; color:#94a3b8; }
.phase-vals b { color:#e2e8f0; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th { text-align:left; color:#94a3b8; padding:8px; border-bottom:1px solid #334155; }
td { padding:8px; border-bottom:1px solid #1e293b33; }
.badge { padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; }
.badge.online { background:#065f4620; color:#34d399; }
.badge.offline { background:#7f1d1d20; color:#f87171; }
.badge.charging { background:#1e3a5f20; color:#38bdf8; }
.pulse { display:inline-block; width:8px; height:8px; border-radius:50%; background:#34d399; margin-right:6px; animation:pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(52,211,153,0.7)} 50%{opacity:0.6;box-shadow:0 0 0 6px rgba(52,211,153,0)} }
.loading { color:#64748b; padding:40px; text-align:center; }
</style></head><body>
<a class="back" href="/">&larr; Dashboard</a>
<h1>De Koning - Smart Charging</h1>
<div class="subtitle">Van Dorp Energie | 10 laadpunten | 150 kW aansluiting</div>
<div id="content"><div class="loading">Laden...</div></div>
<script>
const MAX_AMPS = 217; // 150kW / 230V / 3 fasen ≈ 217A per fase

async function load() {
    const [stateResp, ttResp] = await Promise.all([
        fetch('/api/state'),
        fetch('/api/tectronic')
    ]);
    const state = await stateResp.json();
    const tt= await ttResp.json();

    const grid = tt.grid_meter;
    const evse = tt.evse_meter;
    const avail = tt.available_capacity || {};

    let html = '';

    // Meters overview
    html += '<div class="grid2">';

    // Grid meter
    html += '<div class="panel"><h2><span class="pulse"></span>Inkomende voeding (150 kW)</h2>';
    if (grid) {
        const pct = Math.min(100, Math.round((grid.total_power_w / 150000) * 100));
        const color = pct > 80 ? '#f87171' : pct > 60 ? '#fbbf24' : '#34d399';
        html += '<div class="stat"><div class="value" style="color:' + color + '">' + (grid.total_power_w/1000).toFixed(1) + '<span class="unit">kW</span></div><div class="label">van 150 kW</div></div>';
        html += '<div class="meter-bar"><div class="meter-fill" style="width:' + pct + '%;background:' + color + '">' + pct + '%</div></div>';
        for (const [phase, data] of Object.entries(grid.phases || {})) {
            const phasePct = Math.round((data.current_a / MAX_AMPS) * 100);
            html += '<div class="phase-row"><span class="phase-label">' + phase + '</span><div class="meter-bar" style="flex:1"><div class="meter-fill" style="width:' + phasePct + '%;background:' + color + '">' + data.current_a + 'A</div></div><span class="phase-vals"><b>' + data.power_w + '</b>W ' + data.voltage_v + 'V</span></div>';
        }
        html += '<div style="font-size:11px;color:#64748b;margin-top:8px;">Totaal energie: ' + (grid.total_energy_wh/1000).toFixed(0) + ' kWh | Laatste update: ' + new Date(grid.timestamp).toLocaleTimeString('nl') + '</div>';
    } else {
        html += '<div style="color:#64748b;">Geen data</div>';
    }
    html += '</div>';

    // EVBox meter
    html += '<div class="panel"><h2><span class="pulse"></span>Verdeler EVBox</h2>';
    if (evse) {
        html += '<div class="stat"><div class="value blue">' + (evse.total_power_w/1000).toFixed(1) + '<span class="unit">kW</span></div><div class="label">laadverbruik</div></div>';
        for (const [phase, data] of Object.entries(evse.phases || {})) {
            html += '<div class="phase-row"><span class="phase-label">' + phase + '</span><span class="phase-vals"><b>' + data.current_a + '</b>A | <b>' + data.power_w + '</b>W | ' + data.voltage_v + 'V</span></div>';
        }
        html += '<div style="font-size:11px;color:#64748b;margin-top:8px;">Totaal energie: ' + (evse.total_energy_wh/1000).toFixed(0) + ' kWh</div>';
    } else {
        html += '<div style="color:#64748b;">Geen data</div>';
    }
    html += '</div>';
    html += '</div>';

    // Overbelasting bewaking
    const gs = tt.grid_status || {};
    html += '<h2>Netbelasting bewaking</h2>';
    html += '<div class="panel">';
    if (gs.status) {
        const statusColors = {ok:'#34d399', normal:'#38bdf8', warning:'#fbbf24', alarm:'#f87171', phase_alarm:'#f87171', unknown:'#94a3b8'};
        const statusLabels = {ok:'LAAG', normal:'NORMAAL', warning:'WAARSCHUWING', alarm:'OVERBELASTING', phase_alarm:'FASE OVERBELAST', unknown:'ONBEKEND'};
        const color = statusColors[gs.status] || '#94a3b8';
        const label = statusLabels[gs.status] || gs.status;
        const isAlarm = gs.status === 'alarm' || gs.status === 'phase_alarm';

        // Header met status
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
        html += '<div><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:' + color + ';margin-right:8px;' + (isAlarm ? 'animation:pulse 0.5s infinite;' : '') + '"></span>';
        html += '<span style="font-size:20px;font-weight:700;color:' + color + '">' + label + '</span></div>';
        html += '<div style="font-size:13px;color:#94a3b8;">' + gs.message + '</div></div>';

        // Hoofdcijfers
        html += '<div style="display:flex;gap:16px;margin:16px 0;">';
        html += '<div class="stat" style="flex:1"><div class="label">Verbruik</div><div class="value ' + (gs.load_pct > 90 ? 'red' : gs.load_pct > 70 ? 'yellow' : 'green') + '">' + gs.consumption_kw + '<span class="unit">kW</span></div></div>';
        html += '<div class="stat" style="flex:1"><div class="label">Beschikbaar</div><div class="value ' + (gs.available_kw < 20 ? 'red' : gs.available_kw < 50 ? 'yellow' : 'green') + '">' + gs.available_kw + '<span class="unit">kW</span></div></div>';
        html += '<div class="stat" style="flex:1"><div class="label">Belasting</div><div class="value ' + (gs.load_pct > 90 ? 'red' : gs.load_pct > 70 ? 'yellow' : 'blue') + '">' + gs.load_pct + '<span class="unit">%</span></div></div>';
        html += '<div class="stat" style="flex:1"><div class="label">Maximum</div><div class="value blue">' + gs.max_kw + '<span class="unit">kW</span></div></div>';
        html += '</div>';

        // Totaal vermogen bar
        const barPct = Math.min(100, gs.load_pct);
        const barColor = barPct > 90 ? '#f87171' : barPct > (100-gs.margin_pct) ? '#fbbf24' : '#34d399';
        html += '<div style="margin:4px 0 16px;">';
        html += '<div class="meter-bar" style="height:36px;position:relative;">';
        html += '<div class="meter-fill" style="width:' + barPct + '%;background:' + barColor + ';font-size:14px;">' + gs.consumption_kw + ' kW</div>';
        // Waarschuwingsgrens
        const warnPos = gs.warning_at_pct;
        html += '<div style="position:absolute;left:' + warnPos + '%;top:0;bottom:0;width:2px;background:#fbbf24;z-index:1;" title="Waarschuwing ' + warnPos + '%"></div>';
        html += '<div style="position:absolute;right:0;top:0;bottom:0;width:2px;background:#f87171;z-index:1;" title="Maximum 100%"></div>';
        html += '</div>';
        html += '<div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-top:2px;"><span>0 kW</span><span style="color:#fbbf24;">' + Math.round(gs.max_kw * warnPos/100) + ' kW (' + warnPos + '%)</span><span style="color:#f87171;">' + gs.max_kw + ' kW</span></div>';
        html += '</div>';

        // Per fase
        html += '<div style="margin:12px 0;">';
        html += '<div style="font-size:13px;color:#94a3b8;margin-bottom:8px;">Per fase (max ' + gs.max_amps_per_phase + 'A per fase)</div>';
        const pl = gs.phase_loads || {};
        for (const phase of ['L1', 'L2', 'L3']) {
            const p = pl[phase] || {};
            const pPct = Math.min(100, p.load_pct || 0);
            const pColor = pPct > 90 ? '#f87171' : pPct > 70 ? '#fbbf24' : '#34d399';
            html += '<div class="phase-row">';
            html += '<span class="phase-label">' + phase + '</span>';
            html += '<div class="meter-bar" style="flex:1"><div class="meter-fill" style="width:' + pPct + '%;background:' + pColor + '">' + p.current_a + 'A (' + pPct + '%)</div></div>';
            html += '<span class="phase-vals" style="min-width:120px;text-align:right;"><b>' + (p.power_w/1000).toFixed(1) + '</b> kW | ' + p.voltage_v + 'V</span>';
            html += '</div>';
        }
        html += '</div>';

        // Trend grafiek (laatste uur)
        const hist = gs.history || [];
        if (hist.length > 1) {
            html += '<div style="margin-top:16px;"><div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">Vermogen trend (laatste ' + Math.round(hist.length*10/60) + ' min, ' + hist.length + ' metingen)</div>';
            const maxVal = Math.max(gs.max_kw * 1000, ...hist.map(h => h.power_w || 0));
            const svgW = 800;
            const svgH = 100;
            let path = '';
            for (let i = 0; i < hist.length; i++) {
                const x = (i / (hist.length - 1)) * svgW;
                const y = svgH - ((hist[i].power_w || 0) / maxVal) * svgH;
                path += (i === 0 ? 'M' : 'L') + x.toFixed(0) + ',' + y.toFixed(0);
            }
            // Waarschuwingslijn
            const warnY = svgH - (gs.warning_at_pct / 100) * svgH;
            const maxY = 0;
            html += '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" style="width:100%;height:100px;background:#0f172a;border-radius:6px;">';
            html += '<line x1="0" y1="' + warnY + '" x2="' + svgW + '" y2="' + warnY + '" stroke="#fbbf24" stroke-width="1" stroke-dasharray="4"/>';
            html += '<line x1="0" y1="' + maxY + '" x2="' + svgW + '" y2="' + maxY + '" stroke="#f87171" stroke-width="1" stroke-dasharray="4"/>';
            html += '<path d="' + path + '" fill="none" stroke="#38bdf8" stroke-width="2"/>';
            html += '</svg>';
            html += '<div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;"><span>oud</span><span>nu</span></div>';
            html += '</div>';
        }

        // Config
        html += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid #334155;">';
        html += '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">';
        html += '<label style="font-size:13px;color:#94a3b8;">Aansluiting (kW):</label>';
        html += '<input type="number" id="gtv-max" value="' + gs.max_kw + '" min="1" max="500" style="width:80px;padding:6px;background:#0f172a;border:1px solid #334155;border-radius:4px;color:#e2e8f0;">';
        html += '<label style="font-size:13px;color:#94a3b8;">Marge (%):</label>';
        html += '<input type="number" id="gtv-margin" value="' + gs.margin_pct + '" min="1" max="50" style="width:60px;padding:6px;background:#0f172a;border:1px solid #334155;border-radius:4px;color:#e2e8f0;">';
        html += '<button onclick="updateGTV()" style="padding:6px 16px;background:#2563eb;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;">Opslaan</button>';
        html += '<span style="font-size:12px;color:#64748b;">Waarschuwing bij ' + gs.warning_at_pct + '% (' + Math.round(gs.max_kw * gs.warning_at_pct/100) + ' kW)</span>';
        html += '</div></div>';
    } else {
        html += '<div style="color:#64748b;">Geen grid meter data beschikbaar</div>';
    }
    html += '</div>';

    // Beschikbare capaciteit
    html += '<h2>Beschikbare capaciteit</h2><div class="grid3">';
    for (const phase of ['L1', 'L2', 'L3']) {
        const a = avail[phase] || 0;
        const pct = Math.round((a / MAX_AMPS) * 100);
        const color = a > 150 ? 'green' : a > 80 ? 'blue' : a > 30 ? 'yellow' : 'red';
        html += '<div class="panel stat"><div class="label">' + phase + ' beschikbaar</div><div class="value ' + color + '">' + a + '<span class="unit">A</span></div><div class="label">' + pct + '% van ' + MAX_AMPS + 'A</div></div>';
    }
    html += '</div>';

    // Laadpunten (EVBoxen die bij De Koning horen - TODO: configureerbaar)
    const chargers = state.chargers || {};
    // updateGTV functie
    window.updateGTV = async function() {
        const maxKw = parseInt(document.getElementById('gtv-max').value);
        const margin = parseInt(document.getElementById('gtv-margin').value);
        const resp = await fetch('/api/gtv/config', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({max_kw: maxKw, margin_pct: margin})
        });
        const result = await resp.json();
        if (result.ok) { alert('GTV config opgeslagen: ' + maxKw + 'kW, marge ' + margin + '%'); load(); }
        else { alert('Fout: ' + JSON.stringify(result)); }
    };

    const dekoningIds = ['EVB-P2447139'];
    const evboxIds = dekoningIds.filter(id => id in chargers);
    if (evboxIds.length > 0 || true) {
        html += '<h2>Laadpunten (' + evboxIds.length + ')</h2>';
        html += '<div class="panel"><table><thead><tr><th>ID</th><th>Status</th><th>Connectors</th><th>Backend</th></tr></thead><tbody>';
        for (const id of evboxIds.sort()) {
            const c = chargers[id];
            const online = c.connected ? '<span class="badge online">ONLINE</span>' : '<span class="badge offline">OFFLINE</span>';
            const conns = c.connectors || {};
            const connKeys = Object.keys(conns).filter(k => k !== '0').sort();
            let connHtml = '';
            if (connKeys.length === 0) {
                connHtml = '<span style="color:#64748b;">-</span>';
            } else {
                connHtml = connKeys.map(k => {
                    const st = conns[k].status || '?';
                    const badge = st === 'Charging' ? 'charging' : st === 'Available' ? 'online' : 'offline';
                    const label = k.length > 3 ? k.slice(-4) : k;
                    return '<span class="badge ' + badge + '" title="Connector ' + k + '">C' + label + ': ' + st + '</span>';
                }).join(' ');
            }
            const backends = Object.entries(c.backends || {}).map(([k,v]) => '<span class="badge ' + (v.connected ? 'online' : 'offline') + '">' + k + '</span>').join(' ');
            html += '<tr><td><a href="/charger/' + id + '">' + id + '</a></td><td>' + online + '</td><td>' + connHtml + '</td><td>' + backends + '</td></tr>';
        }
        html += '</tbody></table></div>';
    }

    document.getElementById('content').innerHTML = html;
}

load();
setInterval(load, 10000);
</script></body></html>"""


# ============================================================
# External API (met API key authenticatie voor Voltcontrol etc.)
# ============================================================

@app.get('/v1/chargers', dependencies=[Depends(verify_api_key)])
def ext_chargers(request: Request):
    """Alle laadpalen met huidige status."""
    client_name = request.headers.get('X-Client-Name', 'voltcontrol')
    now = datetime.now(timezone.utc).isoformat()
    if client_name not in api_connections:
        api_connections[client_name] = {'first_poll': now, 'last_poll': now, 'poll_count': 0}
    api_connections[client_name]['last_poll'] = now
    api_connections[client_name]['poll_count'] = api_connections[client_name].get('poll_count', 0) + 1
    state = get_state()
    result = []
    for cp_id, cp in state.get('chargers', {}).items():
        if cp_id.startswith('_'):
            continue
        connectors = []
        for cid, conn in cp.get('connectors', {}).items():
            if cid == '0':
                continue
            mv_data = {}
            mv = conn.get('meter_values')
            if mv and len(mv) > 0:
                for sv in mv[0].get('sampled_value', []):
                    m = sv.get('measurand', '')
                    try:
                        val = float(sv.get('value', 0))
                    except:
                        val = 0
                    if 'Current.Import' in m and not sv.get('phase'):
                        mv_data['current_a'] = round(val, 1)
                    if 'Voltage' in m and not sv.get('phase'):
                        mv_data['voltage_v'] = round(val, 1)
                    if 'Power.Active.Import' in m:
                        mv_data['power_w'] = round(val)
                    if 'Energy.Active.Import' in m:
                        mv_data['energy_wh'] = round(val)
            connectors.append({
                'id': int(cid),
                'status': conn.get('status'),
                'error_code': conn.get('error_code'),
                **mv_data,
            })
        result.append({
            'cp_id': cp_id,
            'online': cp.get('connected', False),
            'source_ip': cp.get('source_ip'),
            'connected_at': cp.get('connected_at'),
            'last_heartbeat': cp.get('last_heartbeat'),
            'vendor': cp.get('vendor'),
            'model': cp.get('model'),
            'firmware': cp.get('firmware'),
            'connectors': connectors,
        })
    return result


@app.get('/v1/chargers/{cp_id}', dependencies=[Depends(verify_api_key)])
def ext_charger(cp_id: str, request: Request):
    """Detail van een specifieke laadpaal."""
    client_name = request.headers.get('X-Client-Name', 'voltcontrol')
    now = datetime.now(timezone.utc).isoformat()
    if client_name not in api_connections:
        api_connections[client_name] = {'first_poll': now, 'last_poll': now, 'poll_count': 0}
    api_connections[client_name]['last_poll'] = now
    api_connections[client_name]['poll_count'] = api_connections[client_name].get('poll_count', 0) + 1
    state = get_state()
    cp = state.get('chargers', {}).get(cp_id)
    if not cp:
        raise HTTPException(status_code=404, detail='Charger not found')
    return {
        'cp_id': cp_id,
        'online': cp.get('connected', False),
        'source_ip': cp.get('source_ip'),
        'connected_at': cp.get('connected_at'),
        'last_heartbeat': cp.get('last_heartbeat'),
        'vendor': cp.get('vendor'),
        'model': cp.get('model'),
        'firmware': cp.get('firmware'),
        'connectors': cp.get('connectors', {}),
        'backends': {k: v.get('connected', False) for k, v in cp.get('backends', {}).items()},
    }


@app.get('/v1/chargers/{cp_id}/sessions', dependencies=[Depends(verify_api_key)])
def ext_sessions(cp_id: str):
    """Laadsessies van een laadpaal."""
    sessions = db.get_sessions(cp_id) if hasattr(db, 'get_sessions') else []
    if not sessions:
        state = get_state()
        cp = state.get('chargers', {}).get(cp_id, {})
        sessions = cp.get('sessions', [])
    return sessions


@app.get('/v1/chargers/{cp_id}/meter_values', dependencies=[Depends(verify_api_key)])
def ext_meter_values(cp_id: str):
    """Laatste meter values van een laadpaal."""
    state = get_state()
    cp = state.get('chargers', {}).get(cp_id)
    if not cp:
        raise HTTPException(status_code=404, detail='Charger not found')
    result = {}
    for cid, conn in cp.get('connectors', {}).items():
        if conn.get('meter_values'):
            result[cid] = conn['meter_values']
    return result


@app.get('/v1/status', dependencies=[Depends(verify_api_key)])
def ext_status():
    """Snel overzicht: hoeveel online/offline, totaal sessies."""
    state = get_state()
    online = offline = total_sessions = 0
    for cp_id, cp in state.get('chargers', {}).items():
        if cp_id.startswith('_'):
            continue
        if cp.get('connected'):
            online += 1
        else:
            offline += 1
        total_sessions += len(cp.get('sessions', []))
    return {
        'online': online,
        'offline': offline,
        'total_chargers': online + offline,
        'total_sessions': total_sessions,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }


@app.post('/api/command')
def api_command(req: CommandRequest):
    return send_command(req.cp_id, req.action, req.payload)


@app.get('/firmware/{filename}')
def firmware_download(filename: str):
    """Serve firmware files for charger OTA updates."""
    p = Path('/opt/ocpp/firmware') / filename
    if p.exists() and p.suffix == '.bin':
        return FileResponse(p, media_type='application/octet-stream', filename=filename)
    return {'error': 'Not found'}


@app.get('/api/analysis')
def api_analysis():
    from analyze import analyze
    return analyze('24 hours ago')


@app.get('/api/analysis/history')
def api_analysis_history():
    from analyze import get_history
    return get_history()


@app.get('/api/analysis/{date}')
def api_analysis_date(date: str):
    p = Path(f'/opt/ocpp/analysis/analysis_{date}.json')
    if p.exists():
        return json.loads(p.read_text())
    return {'error': 'Niet gevonden'}


@app.post('/api/analysis/save')
def api_analysis_save():
    from analyze import analyze, save_daily_log
    analysis = analyze('24 hours ago')
    path = save_daily_log(analysis)
    return {'ok': True, 'path': path, 'date': datetime.now(timezone.utc).strftime('%Y-%m-%d')}


@app.get('/api/eflux/chargers')
def api_eflux_chargers(session=Depends(verify_session)):
    import urllib.request as urlreq
    try:
        # Login
        login_data = json.dumps({
            'email': 'rash@mijninstallatiepartner.nl',
            'password': 'Welkom1234!'
        }).encode()
        login_req = urlreq.Request(
            'https://api.e-flux.nl/1/auth/login',
            data=login_data,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Provider': 'e-flux',
            }
        )
        login_resp = urlreq.urlopen(login_req, timeout=10)
        token = json.loads(login_resp.read()).get('data', {}).get('token', '')
        if not token:
            return {'error': 'E-Flux login mislukt'}

        # Fetch chargers via maintenance endpoint
        search_data = json.dumps({'limit': 300}).encode()
        search_req = urlreq.Request(
            'https://api.e-flux.nl/1/evse-controllers/maintenance/search',
            data=search_data,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': f'Bearer {token}',
                'Provider': 'e-flux',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            }
        )
        search_resp = urlreq.urlopen(search_req, timeout=30)
        result = json.loads(search_resp.read())
        return result
    except Exception as e:
        return {'error': str(e)}


class EfluxCommandRequest(BaseModel):
    cp_id: str
    method: str
    params: dict = {}


@app.post('/api/eflux/command')
def api_eflux_command(req: EfluxCommandRequest, session=Depends(verify_session)):
    import urllib.request as urlreq
    try:
        # Login
        login_data = json.dumps({
            'email': 'rash@mijninstallatiepartner.nl',
            'password': 'Welkom1234!'
        }).encode()
        login_req = urlreq.Request(
            'https://api.e-flux.nl/1/auth/login',
            data=login_data,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Provider': 'e-flux',
            }
        )
        login_resp = urlreq.urlopen(login_req, timeout=10)
        token = json.loads(login_resp.read()).get('data', {}).get('token', '')
        if not token:
            return {'error': 'E-Flux login mislukt'}

        # Send command
        cmd_data = json.dumps({
            'method': req.method,
            'params': req.params,
        }).encode()
        cmd_req = urlreq.Request(
            f'https://api.e-flux.nl/1/evse-controllers/{req.cp_id}/commands',
            data=cmd_data,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': f'Bearer {token}',
                'Provider': 'e-flux',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            }
        )
        cmd_resp = urlreq.urlopen(cmd_req, timeout=30)
        result = json.loads(cmd_resp.read())
        return result
    except Exception as e:
        return {'error': str(e)}


@app.get('/api/evinty/chargers')
def api_evinty_chargers(session=Depends(verify_session)):
    try:
        from pycognito import Cognito
        import urllib.request as urlreq
        u = Cognito(
            'eu-central-1_m6Aj49PLq',
            '7g92843rt2mtv50hkf67hb2l2o',
            username='rash@mijninstallatiepartner.nl'
        )
        u.authenticate(password='Welkom1234!')
        req = urlreq.Request(
            'https://cpms.portal.evinity.io/cpms/rest/operator-api/charging-stations?size=500',
            headers={
                'Authorization': f'Bearer {u.access_token}',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            }
        )
        resp = urlreq.urlopen(req, timeout=30)
        result = json.loads(resp.read())
        return result
    except Exception as e:
        return {'error': str(e)}


class EvintyCommandRequest(BaseModel):
    cp_id: str
    command: str
    params: dict = {}


@app.post('/api/evinty/command')
def api_evinty_command(req: EvintyCommandRequest, session=Depends(verify_session)):
    try:
        from pycognito import Cognito
        import urllib.request as urlreq
        u = Cognito(
            'eu-central-1_m6Aj49PLq',
            '7g92843rt2mtv50hkf67hb2l2o',
            username='rash@mijninstallatiepartner.nl'
        )
        u.authenticate(password='Welkom1234!')
        base = f'https://cpms.portal.evinity.io/cpms/rest/operator-api/charging-stations/{req.cp_id}'
        cmd_map = {
            'Reset': '/reset',
            'TriggerMessage': '/trigger-message',
            'UnlockConnector': '/unlock-connector',
        }
        path = cmd_map.get(req.command, '/' + req.command.lower())
        url = base + path
        data = json.dumps(req.params).encode()
        api_req = urlreq.Request(url, data=data, headers={
            'Authorization': f'Bearer {u.access_token}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        })
        resp = urlreq.urlopen(api_req, timeout=30)
        return json.loads(resp.read())
    except Exception as e:
        error_msg = str(e)
        if hasattr(e, 'read'):
            try:
                error_msg = e.read().decode()
            except:
                pass
        return {'error': error_msg}


class QuarantineRequest(BaseModel):
    cp_id: str
    active: bool
    reason: str = ''


@app.post('/api/quarantine')
def api_quarantine(req: QuarantineRequest):
    db.set_quarantine(req.cp_id, req.active, req.reason)
    # Update runtime state via proxy command socket
    send_command('_quarantine', 'set', {
        'cp_id': req.cp_id, 'active': req.active, 'reason': req.reason
    })
    return {'ok': True, 'cp_id': req.cp_id, 'quarantine': req.active}


@app.get('/api/lb/config')
def api_lb_get_config():
    return send_command('_lb', 'get_config', {})


@app.post('/api/lb/group')
def api_lb_add_group(req: dict):
    return send_command('_lb', 'add_group', req)


@app.put('/api/lb/group')
def api_lb_update_group(req: dict):
    return send_command('_lb', 'update_group', req)


@app.delete('/api/lb/group/{group_id}')
def api_lb_delete_group(group_id: str):
    return send_command('_lb', 'remove_group', {'id': group_id})


@app.get('/api/chargers/config')
def api_chargers_config():
    return send_command('_chargers', 'list', {})


@app.post('/api/chargers/add')
def api_chargers_add(req: dict):
    return send_command('_chargers', 'add', req)


@app.delete('/api/chargers/{cp_id}')
def api_chargers_remove(cp_id: str):
    return send_command('_chargers', 'remove', {'cp_id': cp_id})


@app.put('/api/chargers/update')
def api_chargers_update(req: dict):
    return send_command('_chargers', 'update', req)


@app.get('/api/watchdog')
def api_watchdog():
    try:
        actions = json.loads(Path('/opt/ocpp/watchdog_actions.json').read_text())
        log_lines = Path('/opt/ocpp/watchdog.log').read_text().strip().split('\n')[-30:]
        return {'actions': actions[-30:], 'log': log_lines}
    except:
        return {'actions': [], 'log': []}


@app.get('/api/sessions')
def api_sessions():
    return db.get_sessions_grouped()


@app.get('/api/sessions/{cp_id}')
def api_sessions_cp(cp_id: str):
    sessions = db.get_sessions(cp_id)
    # Enrich sessions with meter data where max_power_w is missing
    for s in sessions:
        if s.get('start_time') and s.get('stop_time') and not s.get('last_current_a'):
            _enrich_session(s, cp_id)
    return sessions


def _enrich_session(s, cp_id):
    try:
        meters = db.get_meter_history(cp_id, hours=168)
        start = s['start_time']
        stop = s['stop_time']
        cid = s.get('connector_id')
        max_p = max_c = max_v = 0.0
        phases = set()
        for m in meters:
            mt = m.get('timestamp')
            if mt and start <= mt <= stop and (not cid or m.get('connector_id') == cid):
                if m.get('power_w') and m['power_w'] > max_p:
                    max_p = m['power_w']
                if m.get('current_a') and m['current_a'] > max_c:
                    max_c = m['current_a']
                if m.get('voltage_v') and m['voltage_v'] > max_v:
                    max_v = m['voltage_v']
                if m.get('phase'):
                    phases.add(m['phase'])
        s['max_power_w'] = round(max_p)
        s['last_current_a'] = round(max_c, 1)
        s['last_voltage_v'] = round(max_v, 1)
        s['phases'] = sorted(list(phases))
    except:
        pass


@app.get('/api/rfid-tags')
def api_rfid_tags():
    return db.get_rfid_tags()


@app.get('/api/db/stats')
def api_db_stats():
    return db.get_stats()


@app.get('/api/db/alerts')
def api_db_alerts():
    return db.get_active_alerts()


@app.get('/api/db/events')
def api_db_events():
    return db.get_events(limit=100)


@app.get('/api/db/events/{cp_id}')
def api_db_events_cp(cp_id: str):
    return db.get_events(cp_id, limit=50)


@app.post('/api/chat')
def api_chat(req: ChatRequest):
    if not client:
        return {'response': 'Geen API key geconfigureerd'}
    state = req.state or get_state()
    try:
        # Ensure messages are clean dicts with only role and content
        clean_messages = [{'role': m['role'], 'content': m['content']} for m in req.messages]
        resp = client.messages.create(
            model='claude-sonnet-4-20250514',
            max_tokens=1024,
            system=SYSTEM_PROMPT.replace('{state}', json.dumps(state, indent=2, default=str)),
            messages=clean_messages,
        )
        return {'response': resp.content[0].text}
    except Exception as e:
        import traceback
        return {'response': f'API error: {traceback.format_exc()}'}


@app.get('/api/charger/{cp_id}')
def api_charger_detail(cp_id: str):
    detail = db.get_charger_detail(cp_id)
    if not detail:
        return {'error': 'Charger not found'}
    # Merge met real-time state
    state = get_state()
    rt = state.get('chargers', {}).get(cp_id, {})
    sessions = detail['sessions']
    for s in sessions:
        if s.get('start_time') and s.get('stop_time') and not s.get('last_current_a'):
            _enrich_session(s, cp_id)
    # Diagnose: frozen meter / 0 energy sessions
    diagnostics = []
    frozen_connectors = {}
    zero_energy_sessions = []
    for s in sessions:
        dur = s.get('duration_min', 0) or 0
        energy = s.get('energy_wh', 0) or 0
        ms = s.get('meter_start')
        me = s.get('meter_stop')
        cid = s.get('connector_id')
        if dur >= 10 and energy == 0:
            reason = 'frozen_meter' if (ms is not None and ms == me) else 'no_meter' if ms is None else 'unknown'
            zero_energy_sessions.append({
                'session_id': s.get('id'),
                'connector_id': cid,
                'duration_min': dur,
                'id_tag': s.get('id_tag'),
                'start_time': str(s.get('start_time', ''))[:16],
                'stop_time': str(s.get('stop_time', ''))[:16],
                'meter_start': ms,
                'meter_stop': me,
                'reason': reason,
            })
            if reason == 'frozen_meter' and cid:
                frozen_connectors[cid] = ms

    if zero_energy_sessions:
        frozen_count = sum(1 for z in zero_energy_sessions if z['reason'] == 'frozen_meter')
        if frozen_count > 0:
            conns_desc = ', '.join(f"C{c} vast op {v/1000:.2f} kWh" for c, v in frozen_connectors.items()) if frozen_connectors else '?'
            diagnostics.append({
                'severity': 'critical',
                'title': 'Energiemeter frozen — Monteur actie vereist',
                'description': f'Energiemeter staat stil: {conns_desc}. {frozen_count} sessie(s) met 0 Wh ondanks langdurig laden. Contactor sluit mogelijk niet of meter is defect.',
                'sessions': zero_energy_sessions,
                'actions': [
                    'Controleer of de contactor fysiek schakelt bij het starten van een sessie (klik hoorbaar)',
                    'Meet spanning en stroom op de uitgaande kabels tijdens een actieve sessie',
                    'Controleer de interne energiemeter — vervang indien nodig',
                    'Check of de meter-PCB goed is aangesloten op de moederbord',
                    'Test met een andere auto om voertuig-probleem uit te sluiten',
                ],
            })
        else:
            diagnostics.append({
                'severity': 'warning',
                'title': 'Sessies zonder energiedata',
                'description': f'{len(zero_energy_sessions)} sessie(s) >= 10 min zonder geregistreerde energie. Meter start/stop ontbreekt in OCPP berichten.',
                'sessions': zero_energy_sessions,
                'actions': [
                    'Controleer MeterValues configuratie: ChangeConfiguration MeterValuesSampledData "Energy.Active.Import.Register,Current.Import,Voltage,Power.Active.Import"',
                    'Controleer of StopTransaction meterStop waarde bevat',
                ],
            })

    # Quarantine info
    quarantine = rt.get('quarantine', {})

    return {
        'cp_id': cp_id,
        'charger': detail['charger'],
        'state': rt,
        'stats': detail['stats'],
        'sessions': sessions,
        'events': detail['events'],
        'alerts': detail['alerts'],
        'diagnostics': diagnostics,
        'quarantine': quarantine,
    }


CHARGER_DETAIL_HTML = """<!DOCTYPE html>
<html lang="nl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Laadpaal __CP_ID__</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0f172a; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,sans-serif; padding:20px; }
a { color:#38bdf8; text-decoration:none; }
h1 { color:#f1f5f9; margin-bottom:8px; }
h2 { color:#38bdf8; margin:24px 0 12px; font-size:18px; }
.back { display:inline-block; margin-bottom:16px; color:#94a3b8; font-size:14px; }
.back:hover { color:#38bdf8; }
.status-bar { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:20px; }
.stat { background:#1e293b; border-radius:8px; padding:14px 20px; border:1px solid #334155; min-width:140px; }
.stat .label { font-size:12px; color:#94a3b8; margin-bottom:4px; }
.stat .value { font-size:22px; font-weight:700; }
.stat .value.green { color:#34d399; }
.stat .value.red { color:#f87171; }
.stat .value.yellow { color:#fbbf24; }
.stat .value.blue { color:#38bdf8; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media(max-width:700px) { .grid2 { grid-template-columns:1fr; } }
.panel { background:#1e293b; border-radius:8px; padding:16px; border:1px solid #334155; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th { text-align:left; color:#94a3b8; padding:8px; border-bottom:1px solid #334155; font-weight:500; }
td { padding:8px; border-bottom:1px solid #1e293b33; }
tr:hover td { background:#334155; }
.badge { padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; }
.badge.online { background:#065f4620; color:#34d399; }
.badge.offline { background:#7f1d1d20; color:#f87171; }
.badge.error { background:#713f1220; color:#fbbf24; }
.connector-box { background:#0f172a; border-radius:6px; padding:10px; margin:6px 0; }
.loading { color:#64748b; padding:40px; text-align:center; }
</style>
</head><body>
<a class="back" href="/">&larr; Terug naar dashboard</a>
<div id="content"><div class="loading">Laden...</div></div>
<script>
const CP_ID = '__CP_ID__';

async function load() {
    const [detailResp, stateResp] = await Promise.all([
        fetch('/api/charger/' + CP_ID),
        fetch('/api/state')
    ]);
    const detail = await detailResp.json();
    const fullState = await stateResp.json();
    const cp = fullState.chargers ? fullState.chargers[CP_ID] || {} : {};

    if (detail.error) {
        document.getElementById('content').innerHTML = '<h1>Laadpaal niet gevonden</h1>';
        return;
    }

    const stats = detail.stats || {};
    const sessions = stats.sessions || [];
    const errors = stats.errors || {};
    const disconnects = detail.last_disconnects || [];
    const connectors = cp.connectors || {};
    const backends = cp.backends || {};
    const cfgBackends = cp.configured_backends || [];

    let statusText = cp.connected ? '<span class="badge online">ONLINE</span>' : '<span class="badge offline">OFFLINE</span>';

    let html = '<h1>' + CP_ID + ' ' + statusText + '</h1>';
    if (cp.vendor) html += '<div style="color:#94a3b8;margin-bottom:16px;">' + (cp.vendor||'') + ' ' + (cp.model||'') + ' | FW: ' + (cp.firmware||'?') + ' | IP: ' + (cp.source_ip||'?') + '</div>';

    // Stats bar
    html += '<div class="status-bar">';
    html += '<div class="stat"><div class="label">Verbindingen</div><div class="value blue">' + stats.total_connects + '</div></div>';
    html += '<div class="stat"><div class="label">Disconnects</div><div class="value ' + (stats.total_disconnects > 10 ? 'red' : 'yellow') + '">' + stats.total_disconnects + '</div></div>';
    html += '<div class="stat"><div class="label">Totaal offline</div><div class="value ' + (stats.total_offline_min > 60 ? 'red' : 'green') + '">' + (stats.total_offline_min >= 60 ? Math.floor(stats.total_offline_min/60) + 'u ' + (stats.total_offline_min%60) + 'm' : stats.total_offline_min + ' min') + '</div></div>';
    html += '<div class="stat"><div class="label">Errors</div><div class="value ' + (Object.keys(errors).length > 0 ? 'red' : 'green') + '">' + Object.keys(errors).length + '</div></div>';
    html += '<div class="stat"><div class="label">Sessies</div><div class="value blue">' + sessions.length + '</div></div>';

    // Uptime since connected
    let uptimeStr = '-';
    if (cp.connected && cp.connected_at) {
        const mins = Math.round((Date.now() - new Date(cp.connected_at).getTime()) / 60000);
        if (mins >= 1440) uptimeStr = Math.floor(mins/1440) + 'd ' + Math.floor((mins%1440)/60) + 'u';
        else if (mins >= 60) uptimeStr = Math.floor(mins/60) + 'u ' + (mins%60) + 'm';
        else uptimeStr = mins + ' min';
    }
    html += '<div class="stat"><div class="label">Verbonden sinds</div><div class="value green">' + uptimeStr + '</div></div>';
    html += '</div>';

    // Quarantine banner
    const quarantine = detail.quarantine || {};
    if (quarantine.active) {
        html += '<div style="background:#7f1d1d;border:2px solid #f87171;border-radius:8px;padding:16px;margin-bottom:16px;">';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="font-size:20px;">&#9888;</span><b style="color:#f87171;font-size:16px;">QUARANTAINE</b></div>';
        html += '<div style="color:#fca5a5;">' + (quarantine.reason || 'Geen reden opgegeven') + '</div>';
        html += '</div>';
    }

    // Diagnostics — Monteur Actie Vereist
    const diagnostics = detail.diagnostics || [];
    for (const diag of diagnostics) {
        const borderColor = diag.severity === 'critical' ? '#f87171' : '#fbbf24';
        const bgColor = diag.severity === 'critical' ? '#450a0a' : '#451a03';
        const iconColor = diag.severity === 'critical' ? '#f87171' : '#fbbf24';
        const icon = diag.severity === 'critical' ? '&#128295;' : '&#9888;';

        html += '<div style="background:' + bgColor + ';border:2px solid ' + borderColor + ';border-radius:8px;padding:16px;margin-bottom:16px;">';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><span style="font-size:18px;">' + icon + '</span><b style="color:' + iconColor + ';font-size:15px;">' + diag.title + '</b></div>';
        html += '<div style="color:#e2e8f0;margin-bottom:12px;font-size:13px;">' + diag.description + '</div>';

        // Checklist acties
        if (diag.actions && diag.actions.length > 0) {
            html += '<div style="margin-bottom:12px;"><b style="color:#94a3b8;font-size:12px;">MONTEUR CHECKLIST:</b>';
            html += '<div style="margin-top:6px;">';
            for (let i = 0; i < diag.actions.length; i++) {
                html += '<div style="display:flex;gap:8px;margin:4px 0;font-size:13px;color:#cbd5e1;">';
                html += '<input type="checkbox" style="accent-color:' + borderColor + ';margin-top:2px;">';
                html += '<span>' + (i+1) + '. ' + diag.actions[i] + '</span></div>';
            }
            html += '</div></div>';
        }

        // Getroffen sessies
        if (diag.sessions && diag.sessions.length > 0) {
            html += '<details style="margin-top:8px;"><summary style="cursor:pointer;color:#94a3b8;font-size:12px;font-weight:600;">Getroffen sessies (' + diag.sessions.length + ')</summary>';
            html += '<table style="margin-top:8px;font-size:12px;width:100%;"><thead><tr>';
            html += '<th style="text-align:left;padding:4px;color:#94a3b8;">Connector</th>';
            html += '<th style="text-align:left;padding:4px;color:#94a3b8;">Start</th>';
            html += '<th style="text-align:left;padding:4px;color:#94a3b8;">Duur</th>';
            html += '<th style="text-align:left;padding:4px;color:#94a3b8;">Meter start</th>';
            html += '<th style="text-align:left;padding:4px;color:#94a3b8;">Meter stop</th>';
            html += '<th style="text-align:left;padding:4px;color:#94a3b8;">Diagnose</th>';
            html += '<th style="text-align:left;padding:4px;color:#94a3b8;">Tag</th>';
            html += '</tr></thead><tbody>';
            for (const s of diag.sessions) {
                const durStr = s.duration_min >= 60 ? Math.floor(s.duration_min/60)+'u '+s.duration_min%60+'m' : s.duration_min+' min';
                const reasonLabel = s.reason === 'frozen_meter' ? '<span style="color:#f87171;">FROZEN</span>' : s.reason === 'no_meter' ? '<span style="color:#fbbf24;">GEEN DATA</span>' : '<span style="color:#94a3b8;">?</span>';
                const meterMatch = s.meter_start !== null && s.meter_start === s.meter_stop;
                const meterColor = meterMatch ? '#f87171' : '#94a3b8';
                html += '<tr>';
                html += '<td style="padding:4px;">C' + s.connector_id + '</td>';
                html += '<td style="padding:4px;">' + (s.start_time||'-') + '</td>';
                html += '<td style="padding:4px;">' + durStr + '</td>';
                html += '<td style="padding:4px;color:' + meterColor + ';">' + (s.meter_start !== null ? s.meter_start : '-') + '</td>';
                html += '<td style="padding:4px;color:' + meterColor + ';">' + (s.meter_stop !== null ? s.meter_stop : '-') + '</td>';
                html += '<td style="padding:4px;">' + reasonLabel + '</td>';
                html += '<td style="padding:4px;font-family:monospace;">' + (s.id_tag||'-') + '</td>';
                html += '</tr>';
            }
            html += '</tbody></table></details>';
        }
        html += '</div>';
    }

    html += '<div class="grid2">';

    // Connectors panel
    html += '<div class="panel"><h2>Connectors</h2>';
    if (Object.keys(connectors).length === 0) {
        html += '<div style="color:#64748b">Geen connector data</div>';
    } else {
        for (const [cid, conn] of Object.entries(connectors)) {
            if (cid === '0') continue;
            const sColor = conn.status === 'Available' ? 'online' : conn.status === 'Charging' ? 'online' : conn.status === 'Faulted' ? 'error' : 'offline';
            html += '<div class="connector-box">';
            html += '<b>Connector ' + cid + '</b> <span class="badge ' + sColor + '">' + conn.status + '</span>';
            if (conn.error_code && conn.error_code !== 'NoError') html += ' <span class="badge error">' + conn.error_code + '</span>';
            if (conn.info) html += '<div style="font-size:11px;color:#94a3b8;margin-top:4px;">' + conn.info + '</div>';
            // Meter values
            const mv = conn.meter_values;
            if (mv && mv.length > 0 && mv[0].sampled_value) {
                html += '<div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;">';
                for (const v of mv[0].sampled_value) {
                    const m = v.measurand || '';
                    let label = m.replace('Energy.Active.Import.Register','Energie').replace('Current.Import','Stroom').replace('Voltage','Spanning').replace('Power.Active.Import','Vermogen');
                    let val = parseFloat(v.value);
                    let unit = v.unit || '';
                    if (m.includes('Energy')) { val = (val/1000).toFixed(0); unit = 'kWh'; }
                    else if (m.includes('Power')) { val = (val/1000).toFixed(1); unit = 'kW'; }
                    else { val = val.toFixed(1); }
                    if (v.phase) label += ' ' + v.phase;
                    html += '<div style="font-size:12px;"><span style="color:#94a3b8;">' + label + '</span><br><b>' + val + '</b> ' + unit + '</div>';
                }
                html += '</div>';
            }
            html += '</div>';
        }
    }
    html += '</div>';

    // Backends panel
    html += '<div class="panel"><h2>Backends</h2>';
    for (const name of cfgBackends) {
        const b = backends[name] || {};
        const cls = b.connected ? 'online' : 'offline';
        html += '<div style="margin:8px 0;"><span class="badge ' + cls + '">' + name + ' - ' + (b.connected ? 'VERBONDEN' : 'NIET VERBONDEN') + '</span>';
        if (b.connected_at) html += ' <span style="font-size:11px;color:#94a3b8;">sinds ' + new Date(b.connected_at).toLocaleTimeString('nl') + '</span>';
        html += '</div>';
    }
    html += '</div>';

    html += '</div>'; // grid2

    // Errors panel
    if (Object.keys(errors).length > 0) {
        html += '<h2>Errors</h2><div class="panel"><table><thead><tr><th>Error type</th><th>Aantal keer</th></tr></thead><tbody>';
        for (const [err, count] of Object.entries(errors)) {
            html += '<tr><td><span class="badge error">' + err + '</span></td><td>' + count + '</td></tr>';
        }
        html += '</tbody></table></div>';
    }

    // Sessions panel
    html += '<h2>Laadsessies (' + sessions.length + ')</h2>';
    if (sessions.length === 0) {
        html += '<div class="panel" style="color:#64748b;">Geen sessies geregistreerd</div>';
    } else {
        html += '<div class="panel"><table><thead><tr><th>Connector</th><th>Start</th><th>Stop</th><th>Duur</th><th>Energie</th><th>Max Power</th><th>Tag</th></tr></thead><tbody>';
        for (const s of sessions.slice().reverse()) {
            const start = s.start_time ? new Date(s.start_time).toLocaleString('nl-NL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
            const stop = s.stop_time ? new Date(s.stop_time).toLocaleString('nl-NL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
            const dur = s.duration_min >= 60 ? Math.floor(s.duration_min/60)+'u '+s.duration_min%60+'m' : (s.duration_min||0)+' min';
            const energy = s.energy_kwh ? s.energy_kwh + ' kWh' : '-';
            const power = s.max_power_w ? (s.max_power_w >= 1000 ? (s.max_power_w/1000).toFixed(1)+' kW' : s.max_power_w+' W') : '-';
            html += '<tr><td>C' + s.connector_id + '</td><td>' + start + '</td><td>' + stop + '</td><td>' + dur + '</td><td><b>' + energy + '</b></td><td>' + power + '</td><td style="font-family:monospace;font-size:11px;">' + (s.id_tag||'-') + '</td></tr>';
        }
        html += '</tbody></table></div>';
    }

    // Disconnects panel
    if (disconnects.length > 0) {
        html += '<h2>Laatste disconnects</h2><div class="panel"><table><thead><tr><th>Tijd</th><th>Reden</th></tr></thead><tbody>';
        for (const d of disconnects.slice().reverse()) {
            const t = d.time ? d.time.substring(0,19).replace('T',' ') : '-';
            html += '<tr><td>' + t + '</td><td style="font-size:12px;">' + (d.reason||'-') + '</td></tr>';
        }
        html += '</tbody></table></div>';
    }

    // Connection log timeline
    const connLog = cp.connection_log || [];
    if (connLog.length > 0) {
        html += '<h2>Verbindingsoverzicht (laatste 24u)</h2><div class="panel">';
        html += '<table><thead><tr><th>Verbonden om</th><th>Offline om</th><th>Online duur</th></tr></thead><tbody>';
        for (const entry of connLog.slice().reverse()) {
            const ca = entry.connected_at ? new Date(entry.connected_at).toLocaleString('nl-NL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
            const da = entry.disconnected_at ? new Date(entry.disconnected_at).toLocaleString('nl-NL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
            const dur = entry.duration_min;
            let durStr;
            if (dur >= 1440) durStr = Math.floor(dur/1440) + 'd ' + Math.floor((dur%1440)/60) + 'u';
            else if (dur >= 60) durStr = Math.floor(dur/60) + 'u ' + (dur%60) + 'm';
            else durStr = dur + ' min';
            const color = dur >= 30 ? 'green' : dur >= 5 ? 'yellow' : 'red';
            html += '<tr><td>' + ca + '</td><td>' + da + '</td><td><span class="badge ' + (color === 'green' ? 'online' : color === 'red' ? 'offline' : 'error') + '">' + durStr + '</span></td></tr>';
        }
        html += '</tbody></table></div>';
    }

    // OCPP Berichten
    html += '<h2>OCPP Berichten</h2>';
    html += '<div class="panel" style="max-height:400px;overflow-y:auto;" id="ocpp-log">';
    html += '<div style="color:#64748b;">Laden...</div>';
    html += '</div>';

    document.getElementById('content').innerHTML = html;
    loadOcppLog();
}

async function loadOcppLog() {
    try {
        const resp = await fetch('/api/db/events/' + CP_ID);
        const events = await resp.json();
        const el = document.getElementById('ocpp-log');
        if (!el) return;
        if (!events.length) { el.innerHTML = '<div style="color:#64748b;">Geen berichten</div>'; return; }
        let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;font-family:monospace;">';
        html += '<thead><tr><th style="text-align:left;padding:6px;color:#94a3b8;border-bottom:1px solid #334155;">Tijd</th><th style="text-align:left;padding:6px;color:#94a3b8;border-bottom:1px solid #334155;">Type</th><th style="text-align:left;padding:6px;color:#94a3b8;border-bottom:1px solid #334155;">Detail</th></tr></thead><tbody>';
        const typeColors = {connected:'#34d399', disconnected:'#f87171', boot:'#38bdf8', status:'#fbbf24', grid_emergency:'#f87171', grid_schedule:'#38bdf8'};
        for (const e of events) {
            const t = e.created_at ? new Date(e.created_at).toLocaleString('nl-NL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '?';
            const c = typeColors[e.event_type] || '#94a3b8';
            html += '<tr style="border-bottom:1px solid #1e293b33;"><td style="padding:4px 6px;color:#64748b;white-space:nowrap;">' + t + '</td>';
            html += '<td style="padding:4px 6px;color:' + c + ';font-weight:600;">' + (e.event_type||'?') + '</td>';
            html += '<td style="padding:4px 6px;color:#e2e8f0;">' + (e.detail||'') + '</td></tr>';
        }
        html += '</tbody></table>';
        el.innerHTML = html;
    } catch(err) {}
}

load();
setInterval(load, 10000);
</script></body></html>"""


@app.get('/charger/{cp_id}', response_class=HTMLResponse)
def charger_page(cp_id: str):
    return CHARGER_DETAIL_HTML.replace('__CP_ID__', cp_id)


@app.websocket('/ws/logs')
async def log_stream(websocket: WebSocket):
    await websocket.accept()
    proc = await asyncio.create_subprocess_exec(
        'journalctl', '-u', 'ocpp', '-f', '--no-pager', '-n', '50',
        stdout=asyncio.subprocess.PIPE,
    )
    try:
        async for line in proc.stdout:
            await websocket.send_text(line.decode().strip())
    except WebSocketDisconnect:
        pass
    finally:
        proc.terminate()


@app.websocket('/ws/terminal')
async def terminal_ws(websocket: WebSocket):
    """Web-based PuTTY terminal — full bash PTY over WebSocket."""
    # Check auth via cookie
    token = websocket.cookies.get('session')
    if not token or token not in active_sessions:
        await websocket.close(code=4001, reason='Not authenticated')
        return

    await websocket.accept()

    # Create PTY with fork
    child_pid, fd = pty.fork()
    if child_pid == 0:
        # Child process — exec bash
        os.chdir('/opt/ocpp')
        env = {
            'TERM': 'xterm-256color',
            'HOME': '/root',
            'USER': 'root',
            'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
            'LANG': 'en_US.UTF-8',
            'PS1': '\\[\\033[32m\\]root@laadpalen\\[\\033[0m\\]:\\[\\033[34m\\]\\w\\[\\033[0m\\]$ ',
        }
        os.execvpe('/bin/bash', ['/bin/bash', '--norc', '--noprofile'], env)
    else:
        # Parent process — bridge PTY <-> WebSocket
        # Set initial terminal size
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 80, 0, 0))

        # Make fd non-blocking
        flags = fcntl.fcntl(fd, fcntl.F_GETFL)
        fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

        async def read_pty():
            """Read from PTY and send to WebSocket."""
            try:
                while True:
                    await asyncio.sleep(0.02)
                    try:
                        data = os.read(fd, 4096)
                        if not data:
                            break
                        await websocket.send_bytes(data)
                    except BlockingIOError:
                        continue
                    except OSError:
                        break
            except Exception:
                pass

        async def write_pty():
            """Read from WebSocket and write to PTY."""
            try:
                while True:
                    msg = await websocket.receive()
                    if msg.get('type') == 'websocket.disconnect':
                        break
                    data = msg.get('bytes') or (msg.get('text', '').encode() if msg.get('text') else None)
                    if data:
                        # Handle resize messages (JSON with type=resize)
                        if data[:1] == b'{':
                            try:
                                j = json.loads(data)
                                if j.get('type') == 'resize':
                                    fcntl.ioctl(fd, termios.TIOCSWINSZ,
                                        struct.pack('HHHH', j.get('rows', 24), j.get('cols', 80), 0, 0))
                                    # Signal the process about the resize
                                    os.kill(child_pid, signal.SIGWINCH)
                                    continue
                            except (json.JSONDecodeError, KeyError):
                                pass
                        os.write(fd, data)
            except WebSocketDisconnect:
                pass
            except Exception:
                pass

        try:
            await asyncio.gather(read_pty(), write_pty())
        finally:
            os.close(fd)
            try:
                os.kill(child_pid, signal.SIGTERM)
                os.waitpid(child_pid, os.WNOHANG)
            except Exception:
                pass


@app.get('/', response_class=HTMLResponse)
def index():
    from starlette.responses import Response
    resp = Response(content=DASHBOARD_HTML, media_type='text/html')
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return resp


DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Laadpalen Dashboard</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/lib/addon-web-links.min.js"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; }
.header { background: #1e293b; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; }
.header h1 { font-size: 20px; color: #38bdf8; }
.header .status { font-size: 13px; color: #94a3b8; }
.tabs { display: flex; background: #1e293b; border-bottom: 1px solid #334155; }
.tab { padding: 10px 20px; cursor: pointer; color: #94a3b8; border-bottom: 2px solid transparent; font-size: 14px; }
.tab.active { color: #38bdf8; border-bottom-color: #38bdf8; }
.tab:hover { color: #e2e8f0; }
.content { display: none; padding: 20px; }
.content.active { display: block; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
.card { background: #1e293b; border-radius: 8px; padding: 16px; border: 1px solid #334155; }
.clickable-card { cursor: pointer; transition: border-color 0.2s; }
.clickable-card:hover { border-color: #38bdf8; }
.card h3 { font-size: 15px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
.card .id { color: #f1f5f9; }
.badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.badge.online { background: #065f46; color: #34d399; }
.badge.offline { background: #7f1d1d; color: #fca5a5; }
.badge.faulted { background: #78350f; color: #fbbf24; }
.badge.available { background: #065f46; color: #34d399; }
.badge.charging { background: #1e3a5f; color: #60a5fa; }
.search-bar { margin-bottom:16px; }
.search-bar input { width:100%; background:#1e293b; color:#e2e8f0; border:1px solid #334155; padding:10px 14px; border-radius:8px; font-size:14px; margin-bottom:10px; }
.search-bar input:focus { outline:none; border-color:#38bdf8; }
.filter-chips { display:flex; gap:6px; flex-wrap:wrap; }
.chip { padding:4px 12px; border-radius:16px; font-size:12px; cursor:pointer; background:#1e293b; color:#94a3b8; border:1px solid #334155; user-select:none; transition:all 0.2s; }
.chip:hover { border-color:#38bdf8; color:#e2e8f0; }
.chip.active { background:#2563eb; color:white; border-color:#2563eb; }
.ecg-canvas { width:100%; height:40px; display:block; margin-top:8px; border-radius:6px; background:#0f172a; }
.alert-bell { position:relative; cursor:pointer; padding:4px; }
.alert-bell:hover svg { stroke:#38bdf8; }
.alert-count { position:absolute; top:-4px; right:-6px; background:#ef4444; color:white; font-size:10px; font-weight:700; min-width:16px; height:16px; border-radius:8px; display:flex; align-items:center; justify-content:center; padding:0 4px; }
@keyframes bell-shake { 0%,100%{transform:rotate(0)} 20%{transform:rotate(15deg)} 40%{transform:rotate(-15deg)} 60%{transform:rotate(10deg)} 80%{transform:rotate(-5deg)} }
.alert-bell.has-alerts svg { stroke:#fbbf24; animation:bell-shake 0.5s ease-in-out; }
.alert-panel { position:fixed; top:56px; right:16px; width:380px; max-height:70vh; background:#1e293b; border:1px solid #334155; border-radius:8px; box-shadow:0 8px 32px rgba(0,0,0,0.5); z-index:100; overflow:hidden; display:flex; flex-direction:column; }
.alert-panel-header { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid #334155; font-weight:600; color:#f1f5f9; }
.alert-close { cursor:pointer; color:#94a3b8; font-size:20px; }
.alert-close:hover { color:#f1f5f9; }
#alert-list { overflow-y:auto; max-height:calc(70vh - 50px); }
.alert-item { padding:12px 16px; border-bottom:1px solid #334155; }
.alert-item:last-child { border-bottom:none; }
.alert-item:hover { background:#33415533; }
.alert-item .alert-title { font-size:13px; font-weight:600; margin-bottom:4px; }
.alert-item .alert-detail { font-size:12px; color:#94a3b8; }
.alert-item .alert-time { font-size:10px; color:#64748b; margin-top:4px; }
.alert-item.high .alert-title { color:#f87171; }
.alert-item.medium .alert-title { color:#fbbf24; }
.alert-item.low .alert-title { color:#38bdf8; }
.alert-empty { padding:24px; text-align:center; color:#64748b; font-size:13px; }
.info { font-size: 12px; color: #94a3b8; margin: 4px 0; }
.info span { color: #cbd5e1; }
.backends { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.backend { padding: 2px 8px; border-radius: 4px; font-size: 11px; }
.backend.connected { background: #064e3b; color: #6ee7b7; }
.pulse { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #34d399; margin-right: 4px; animation: pulse-anim 1.5s ease-in-out infinite; }
@keyframes pulse-anim { 0%,100% { opacity: 1; box-shadow: 0 0 0 0 rgba(52,211,153,0.7); } 50% { opacity: 0.6; box-shadow: 0 0 0 6px rgba(52,211,153,0); } }
.backend small { opacity: 0.7; font-size: 10px; margin-left: 2px; }
.backend.disconnected { background: #450a0a; color: #fca5a5; }
.connectors { margin-top: 8px; }
.connector { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; border-top: 1px solid #334155; }
/* Load Balancer */
.lb-panel { max-width: 700px; }
.lb-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.lb-header h3 { color: #f1f5f9; font-size: 18px; }
.lb-status { font-size: 13px; padding: 4px 12px; border-radius: 4px; }
.lb-status.active { background: #065f46; color: #34d399; }
.lb-status.inactive { background: #7f1d1d; color: #fca5a5; }
.lb-bar-container { background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 16px; border: 1px solid #334155; }
.lb-bar-label { font-size: 12px; color: #94a3b8; margin-bottom: 8px; }
.lb-bar-track { height: 32px; background: #0f172a; border-radius: 6px; overflow: hidden; position: relative; }
.lb-bar-fill { height: 100%; border-radius: 6px; transition: width 0.5s, background 0.5s; }
.lb-bar-text { font-size: 14px; color: #e2e8f0; margin-top: 8px; text-align: center; font-weight: 600; }
.lb-connectors { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-bottom: 16px; }
.lb-conn { background: #1e293b; border-radius: 8px; padding: 14px; border: 1px solid #334155; }
.lb-conn-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.lb-conn-id { font-weight: 600; color: #f1f5f9; font-size: 13px; }
.lb-conn-bar { height: 8px; background: #0f172a; border-radius: 4px; overflow: hidden; margin: 8px 0; }
.lb-conn-bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s; background: #38bdf8; }
.lb-conn-vals { display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; }
.lb-conn-vals span { color: #e2e8f0; font-weight: 600; }
.lb-config { background: #1e293b; border-radius: 8px; padding: 16px; border: 1px solid #334155; }
.lb-config h4 { color: #f1f5f9; margin-bottom: 12px; font-size: 14px; }
.lb-config label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px; }
.lb-config input { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; padding: 8px 12px; border-radius: 6px; font-size: 14px; width: 100%; margin-bottom: 10px; }
.lb-config button { background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%; }
.lb-config button:hover { background: #1d4ed8; }
.lb-slider-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.lb-slider-row input[type=range] { flex: 1; accent-color: #38bdf8; height: 6px; }
.lb-slider-row input[type=number] { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; padding: 6px 8px; border-radius: 6px; font-size: 14px; text-align: center; }
.lb-amp-display { font-size: 20px; font-weight: 700; color: #38bdf8; min-width: 60px; text-align: right; }
.lb-config-info { margin-top: 10px; font-size: 12px; color: #34d399; min-height: 20px; }
.meter-values { background: #0f172a; border-radius: 6px; padding: 8px 10px; margin: 4px 0 2px 0; }
.mv-row { display: flex; gap: 12px; flex-wrap: wrap; }
.mv-item { display: flex; align-items: baseline; gap: 2px; }
.mv-val { font-size: 18px; font-weight: 700; }
.mv-unit { font-size: 11px; color: #94a3b8; }
.mv-current .mv-val { color: #fbbf24; }
.mv-voltage .mv-val { color: #94a3b8; }
.mv-power .mv-val { color: #38bdf8; }
.mv-energy .mv-val { color: #34d399; }
.mv-time { font-size: 10px; color: #64748b; margin-top: 2px; }
.charger-logs { margin-top: 10px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 8px; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 10px; line-height: 1.5; }
.charger-logs .cl { padding: 1px 0; color: #94a3b8; }
.charger-logs .cl.send { color: #34d399; }
.charger-logs .cl.recv { color: #60a5fa; }
.charger-logs .cl.backend { color: #a78bfa; }
.charger-logs .cl.error { color: #f87171; }
.charger-log-toggle { margin-top: 8px; font-size: 11px; color: #38bdf8; cursor: pointer; user-select: none; }
.badge.quarantine { background: #7f1d1d; color: #fca5a5; }
/* Commands */
.cmd-panel { max-width: 600px; }
.cmd-panel select, .cmd-panel input, .cmd-panel button { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; padding: 8px 12px; border-radius: 6px; font-size: 14px; width: 100%; margin-bottom: 10px; }
.cmd-panel button { background: #2563eb; border: none; cursor: pointer; font-weight: 600; }
.cmd-panel button:hover { background: #1d4ed8; }
.session-card { background: #1e293b; border-radius: 10px; padding: 16px; margin-bottom: 16px; border: 1px solid #334155; }
.session-card h4 { color: #38bdf8; margin-bottom: 10px; }
.session-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.session-table th { text-align: left; color: #94a3b8; padding: 6px 8px; border-bottom: 1px solid #334155; font-weight: 500; }
.session-table td { padding: 6px 8px; border-bottom: 1px solid #1e293b; color: #e2e8f0; }
.session-table tr:hover td { background: #334155; }
.session-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.session-tag.green { background: #065f4620; color: #34d399; }
.session-tag.blue { background: #1e3a5f20; color: #38bdf8; }
.session-tag.yellow { background: #713f1220; color: #fbbf24; }
.cmd-result { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 12px; white-space: pre-wrap; margin-top: 10px; min-height: 60px; }
/* E-Flux command modal */
.eflux-modal-overlay { position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:200;display:flex;align-items:center;justify-content:center; }
.eflux-modal { background:#1e293b;border:1px solid #334155;border-radius:12px;width:560px;max-width:95vw;max-height:85vh;overflow-y:auto;padding:24px;box-shadow:0 16px 64px rgba(0,0,0,0.5); }
.eflux-modal h3 { color:#f1f5f9;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center; }
.eflux-modal .close-btn { cursor:pointer;color:#94a3b8;font-size:24px;background:none;border:none;padding:0; }
.eflux-modal .close-btn:hover { color:#f1f5f9; }
.eflux-modal select,.eflux-modal input,.eflux-modal textarea { width:100%;background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:8px 12px;border-radius:6px;font-size:13px;margin-bottom:10px; }
.eflux-modal button.send-cmd { background:#2563eb;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;width:100%; }
.eflux-modal button.send-cmd:hover { background:#1d4ed8; }
.eflux-modal .cmd-output { background:#0f172a;border:1px solid #334155;border-radius:6px;padding:12px;font-family:monospace;font-size:12px;white-space:pre-wrap;min-height:60px;margin-top:10px;color:#e2e8f0; }
/* Logs */
#log-container { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 11px; height: calc(100vh - 200px); overflow-y: auto; line-height: 1.6; }
#log-container .log-line { padding: 1px 0; }
.log-error { color: #f87171; }
.log-warn { color: #fbbf24; }
.log-info { color: #94a3b8; }
.log-connect { color: #34d399; }
.log-backend { color: #60a5fa; }
/* Chat */
.chat-container { display: flex; flex-direction: column; height: calc(100vh - 200px); max-width: 800px; }
#chat-messages { flex: 1; overflow-y: auto; padding: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 6px 6px 0 0; }
.chat-msg { margin: 8px 0; padding: 8px 12px; border-radius: 6px; font-size: 13px; line-height: 1.5; }
.chat-msg.user { background: #1e3a5f; margin-left: 40px; }
.chat-msg.assistant { background: #1e293b; margin-right: 40px; }
.chat-input { display: flex; gap: 8px; }
.chat-input input { flex: 1; background: #1e293b; color: #e2e8f0; border: 1px solid #334155; padding: 10px 14px; border-radius: 0 0 0 6px; font-size: 14px; }
.chat-input button { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 0 0 6px 0; cursor: pointer; font-weight: 600; }
.chat-input button:hover { background: #1d4ed8; }
.chat-input button:disabled { background: #475569; cursor: not-allowed; }
</style>
</head>
<body>
<div class="header">
    <h1>Laadpalen Dashboard</h1>
    <div style="display:flex;align-items:center;gap:12px;">
        <div class="status" id="header-status">Laden...</div>
        <div class="alert-bell" onclick="toggleAlertPanel()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span class="alert-count" id="alert-count" style="display:none;">0</span>
        </div>
        <a href="/auth/logout" style="color:#94a3b8;font-size:12px;text-decoration:none;padding:4px 10px;border:1px solid #334155;border-radius:4px;">Uitloggen</a>
    </div>
    <div class="alert-panel" id="alert-panel" style="display:none;">
        <div class="alert-panel-header">
            <span>Meldingen</span>
            <span class="alert-close" onclick="toggleAlertPanel()">&times;</span>
        </div>
        <div id="alert-list"></div>
    </div>
</div>
<div class="tabs">
    <div class="tab active" onclick="showTab('chargers')">Laadpalen</div>
    <div class="tab" onclick="showTab('loadbalancer')">Load Balancer</div>
    <div class="tab" onclick="showTab('sessions')">Sessies</div>
    <div class="tab" onclick="showTab('commands')">Commando's</div>
    <div class="tab" onclick="showTab('medewerkers')">Medewerkers</div>
    <div class="tab" onclick="showTab('logs')">Logs</div>
    <div class="tab" onclick="showTab('watchdog')">Watchdog</div>
    <div class="tab" onclick="showTab('analyse')">Analyse</div>
    <div class="tab" onclick="showTab('knowledge')">Knowledge Base</div>
    <div class="tab" onclick="showTab('software')">Software</div>
    <div class="tab" onclick="showTab('eflux')">E-Flux Commando's</div>
    <div class="tab" onclick="showTab('chat')">AI Chat</div>
</div>

<div class="content active" id="tab-chargers">
    <div class="search-bar">
        <input type="text" id="search-input" placeholder="Zoek op ID, type, firmware..." oninput="applyFilters()">
        <div class="filter-chips">
            <span class="chip active" onclick="toggleFilter('all',this)">Alle</span>
            <span class="chip" onclick="toggleFilter('online',this)">Online</span>
            <span class="chip" onclick="toggleFilter('offline',this)">Offline</span>
            <span class="chip" onclick="toggleFilter('charging',this)">Laden</span>
            <span class="chip" onclick="toggleFilter('faulted',this)">Faulted</span>
            <span class="chip" onclick="toggleFilter('quarantine',this)">Quarantaine</span>
        </div>
    </div>
    <div class="grid" id="charger-grid"></div>
</div>

<div class="content" id="tab-loadbalancer">
    <div style="max-width:900px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="color:#f1f5f9;">Load Balancer Groepen</h3>
            <button onclick="showAddGroupForm()" style="background:#2563eb;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;">+ Nieuwe groep</button>
        </div>
        <div id="lb-add-form" style="display:none;background:#1e293b;border-radius:8px;padding:16px;border:1px solid #334155;margin-bottom:16px;">
            <h4 style="color:#f1f5f9;margin-bottom:12px;">Nieuwe groep</h4>
            <input id="lb-new-id" placeholder="Groep ID (bijv. parking_a)" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:8px;border-radius:6px;width:100%;margin-bottom:8px;font-size:13px;">
            <input id="lb-new-name" placeholder="Naam (bijv. Parking A)" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:8px;border-radius:6px;width:100%;margin-bottom:8px;font-size:13px;">
            <div style="display:flex;gap:8px;margin-bottom:8px;">
                <input id="lb-new-max" type="number" value="63" min="6" max="500" placeholder="Max A" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:8px;border-radius:6px;width:100px;font-size:13px;">
                <span style="color:#94a3b8;align-self:center;font-size:13px;">A per fase</span>
                <select id="lb-new-parent" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:8px;border-radius:6px;flex:1;font-size:13px;"><option value="">Geen parent (root)</option></select>
            </div>
            <div style="display:flex;gap:8px;">
                <button onclick="addLBGroup()" style="background:#2563eb;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;">Aanmaken</button>
                <button onclick="document.getElementById('lb-add-form').style.display='none'" style="background:#334155;color:#e2e8f0;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;">Annuleer</button>
            </div>
        </div>
        <div id="lb-groups">Laden...</div>
    </div>
</div>

<div class="content" id="tab-sessions">
    <div style="max-width:900px;">
        <h3 style="margin-bottom:12px;color:#f1f5f9;">Laatste laadsessies per laadpaal</h3>
        <div id="sessions-grid"></div>
        <div style="color:#64748b;margin-top:12px;font-size:12px;">Sessies worden bijgewerkt bij elke StartTransaction/StopTransaction. Maximaal 5 per laadpaal.</div>
    </div>
</div>

<div class="content" id="tab-watchdog">
    <div style="max-width:900px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="color:#f1f5f9;">Watchdog Monitor</h3>
            <span style="font-size:12px;color:#94a3b8;">Draait elke 2 min automatisch</span>
        </div>
        <div id="watchdog-content"><div style="color:#64748b;">Laden...</div></div>
    </div>
</div>

<div class="content" id="tab-knowledge">
    <div style="max-width:900px;">
        <h3 style="color:#f1f5f9;margin-bottom:16px;">Knowledge Base</h3>
        <div id="kb-content">Laden...</div>
    </div>
</div>

<div class="content" id="tab-software" style="padding:0;">
    <div style="display:flex;gap:8px;padding:12px 16px;background:#1e293b;border-bottom:1px solid #334155;align-items:center;">
        <span style="color:#94a3b8;font-size:13px;">Laadpaal:</span>
        <select id="sw-charger" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:6px 10px;border-radius:6px;font-size:13px;" onchange="swToolChanged()"></select>
        <div style="display:flex;gap:4px;margin-left:12px;">
            <button id="sw-btn-ecc" onclick="swShowPanel('ecc')" style="background:#2563eb;color:white;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">ECC Manager</button>
            <button id="sw-btn-ps" onclick="swShowPanel('ps')" style="background:#334155;color:#94a3b8;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">PowerShell</button>
            <button id="sw-btn-putty" onclick="swShowPanel('putty')" style="background:#334155;color:#94a3b8;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">PuTTY</button>
        </div>
        <a href="/tools/eccmanager" target="_blank" style="margin-left:auto;font-size:11px;color:#38bdf8;">Volledig scherm</a>
    </div>
    <!-- ECC Manager panel -->
    <div id="sw-panel-ecc">
        <iframe id="ecc-frame" src="" style="width:100%;height:calc(100vh - 160px);border:none;background:#080d12;"></iframe>
    </div>
    <!-- PowerShell terminal panel -->
    <div id="sw-panel-ps" style="display:none;height:calc(100vh - 160px);background:#012456;font-family:'Cascadia Code','Consolas','Courier New',monospace;display:none;flex-direction:column;">
        <div style="background:#012456;padding:6px 16px;border-bottom:1px solid #1b3a6b;display:flex;align-items:center;gap:12px;">
            <span style="color:#ffff00;font-size:13px;font-weight:bold;">PS</span>
            <span id="ps-charger-label" style="color:#5599ff;font-size:12px;">Geen laadpaal geselecteerd</span>
            <span style="color:#808080;font-size:11px;margin-left:auto;">OCPP 1.6 Terminal</span>
            <button onclick="psClear()" style="background:#1b3a6b;color:#cccccc;border:1px solid #2a4a7b;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Clear</button>
        </div>
        <div id="ps-output" style="flex:1;overflow-y:auto;padding:12px 16px;font-size:13px;line-height:1.6;color:#cccccc;"></div>
        <div style="display:flex;align-items:center;padding:4px 16px 12px;background:#012456;">
            <span style="color:#ffff00;font-size:13px;white-space:pre;">PS OCPP:\\<span id="ps-prompt-cp">?</span>&gt; </span>
            <input id="ps-input" type="text" autocomplete="off" spellcheck="false"
                style="flex:1;background:transparent;border:none;outline:none;color:#cccccc;font-family:inherit;font-size:13px;caret-color:#cccccc;"
                onkeydown="psKeyDown(event)">
        </div>
    </div>
    <!-- PuTTY terminal panel -->
    <div id="sw-panel-putty" style="display:none;height:calc(100vh - 160px);background:#000000;flex-direction:column;">
        <div style="background:#000000;padding:6px 16px;border-bottom:1px solid #333333;display:flex;align-items:center;gap:12px;">
            <span style="color:#00ff00;font-size:13px;font-weight:bold;font-family:'Courier New',monospace;">PuTTY</span>
            <span style="color:#888888;font-size:12px;">root@46.62.148.12 — VPS Terminal</span>
            <span style="color:#555555;font-size:11px;margin-left:auto;">SSH Session</span>
            <button onclick="puttyReconnect()" style="background:#333333;color:#cccccc;border:1px solid #555555;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Reconnect</button>
        </div>
        <div id="putty-terminal" style="flex:1;"></div>
    </div>
</div>

<div class="content" id="tab-analyse">
    <div style="max-width:900px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="color:#f1f5f9;">Stabiliteitsanalyse</h3>
            <div style="display:flex;gap:8px;align-items:center;">
                <select id="analysis-date" onchange="loadAnalysis(this.value)" style="background:#1e293b;color:#e2e8f0;border:1px solid #334155;padding:6px 12px;border-radius:6px;font-size:13px;"></select>
                <button onclick="saveAnalysis()" id="btn-save-analysis" style="padding:6px 14px;font-size:13px;">Opslaan</button>
                <button onclick="downloadAnalysis()" style="padding:6px 14px;font-size:13px;">Download PDF</button>
            </div>
        </div>
        <div id="analysis-content"><div style="color:#64748b;padding:20px;">Laden...</div></div>
    </div>
</div>

<div class="content" id="tab-commands">
    <div class="cmd-panel">
        <h3 style="margin-bottom:12px;color:#f1f5f9;">OCPP Commando</h3>
        <select id="cmd-charger"></select>
        <select id="cmd-action" onchange="updatePayload()">
            <option value="Reset">Reset</option>
            <option value="ChangeConfiguration">ChangeConfiguration</option>
            <option value="TriggerMessage">TriggerMessage</option>
            <option value="GetConfiguration">GetConfiguration</option>
            <option value="UpdateFirmware">UpdateFirmware</option>
            <option value="UnlockConnector">UnlockConnector</option>
        </select>
        <textarea id="cmd-payload" rows="3" style="background:#1e293b;color:#e2e8f0;border:1px solid #334155;padding:8px 12px;border-radius:6px;font-size:13px;width:100%;margin-bottom:10px;font-family:monospace;resize:vertical;"></textarea>
        <button onclick="sendCommand()">Verstuur</button>
        <div class="cmd-result" id="cmd-result">Wacht op commando...</div>
    </div>
</div>

<div class="content" id="tab-medewerkers">
    <div style="max-width:1000px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
                <h3 style="margin-bottom:12px;color:#f1f5f9;">Bekende RFID Tags</h3>
                <div class="card" id="rfid-tags-table" style="overflow-x:auto;">
                    <div style="color:#64748b;">Laden...</div>
                </div>
            </div>
            <div>
                <h3 style="margin-bottom:12px;color:#f1f5f9;">Autorisatie Info</h3>
                <div class="card">
                    <h4 style="color:#38bdf8;margin-bottom:10px;font-size:14px;">RFID / NFC Opties</h4>
                    <div style="font-size:13px;line-height:1.8;color:#cbd5e1;">
                        <p style="margin-bottom:10px;">De Ecotap/EV-BOX readers gebruiken <b style="color:#fbbf24;">MIFARE Classic/DESFire</b> (13.56 MHz). Telefoon wallets (Apple/Google Pay) werken <b style="color:#f87171;">niet</b> — ander protocol.</p>
                        <div style="background:#0f172a;border-radius:6px;padding:12px;margin-bottom:12px;">
                            <div style="color:#34d399;font-weight:600;margin-bottom:6px;">Werkende opties:</div>
                            <div style="margin-left:8px;">
                                <div style="margin:4px 0;">1. <b>NFC keyfob/sticker</b> — MIFARE Classic, registreer UID bij E-flux/Voltcontrol</div>
                                <div style="margin:4px 0;">2. <b>NFC sticker op telefoon</b> — plak op hoesje, zelfde werking als pas</div>
                                <div style="margin:4px 0;">3. <b>Remote Start via app</b> — E-flux app, of via Commando's tab</div>
                                <div style="margin:4px 0;">4. <b>Local Auth List</b> — whitelist op de paal zelf</div>
                            </div>
                        </div>
                        <div style="background:#0f172a;border-radius:6px;padding:12px;margin-bottom:12px;">
                            <div style="color:#f87171;font-weight:600;margin-bottom:6px;">Werkt NIET:</div>
                            <div style="margin-left:8px;">
                                <div style="margin:4px 0;">Apple Wallet / Google Wallet — ander NFC protocol (Apple VAS / Google SmartTap)</div>
                                <div style="margin:4px 0;">ISO 15118 Plug &amp; Charge — hardware niet ondersteund door Ecotap/EV-BOX</div>
                            </div>
                        </div>
                        <div style="background:#0f172a;border-radius:6px;padding:12px;">
                            <div style="color:#38bdf8;font-weight:600;margin-bottom:6px;">ISO 15118 (toekomstig)</div>
                            <div style="margin-left:8px;font-size:12px;">
                                <div style="margin:4px 0;">Vereist: OCPP 2.1 laadpaal + auto met PLC-chip + fabrikant OTA-update</div>
                                <div style="margin:4px 0;">Ondersteund door: Tesla, BMW iX/i4, Mercedes EQ, Hyundai Ioniq 5/6, Kia EV6/9, Porsche Taycan</div>
                                <div style="margin:4px 0;">Biedt: MAC-adres, voertuig-ID, batterij SoC%, gevraagd vermogen</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="content" id="tab-logs">
    <div id="log-container"></div>
</div>

<div class="content" id="tab-eflux">
    <div style="max-width:1200px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="color:#a78bfa;">E-Flux Maintenance — Commando Paneel</h3>
            <div style="display:flex;gap:8px;align-items:center;">
                <button onclick="refreshEfluxTab()" style="padding:6px 14px;font-size:13px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;">Vernieuwen</button>
            </div>
        </div>
        <div id="eflux-stats" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;"></div>
        <div style="display:grid;grid-template-columns:300px 1fr;gap:16px;">
            <div>
                <div style="margin-bottom:8px;">
                    <input type="text" id="eflux-search" placeholder="Zoek laadpaal..." oninput="filterEfluxTab()" style="background:#1e293b;color:#e2e8f0;border:1px solid #334155;padding:6px 12px;border-radius:6px;font-size:13px;width:100%;">
                </div>
                <div id="eflux-charger-list" style="max-height:calc(100vh - 280px);overflow-y:auto;"></div>
            </div>
            <div>
                <div id="eflux-cmd-panel" style="background:#1e293b;border-radius:8px;padding:16px;border:1px solid #334155;">
                    <div style="color:#64748b;padding:20px;text-align:center;">Selecteer een laadpaal om commando's te versturen</div>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="content" id="tab-chat">
    <div class="chat-container">
        <div id="chat-messages"></div>
        <div class="chat-input">
            <input type="text" id="chat-input" placeholder="Stel een vraag over je laadpalen..." onkeydown="if(event.key==='Enter')sendChat()">
            <button id="chat-btn" onclick="sendChat()">Stuur</button>
        </div>
    </div>
</div>

<script>
let currentState = {};
let clientExpanded = {};
function toggleClient(key) { clientExpanded[key] = !clientExpanded[key]; renderChargers(currentState); }
let chatHistory = [];
let logWs = null;
let chargerLogs = {};  // per charger log buffer
let chargerLogOpen = {};  // toggle state
const MAX_CHARGER_LOGS = 50;

function showTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    document.querySelectorAll('.tab').forEach(t => { if(t.textContent.toLowerCase().includes(name.substring(0,4))) t.classList.add('active'); });
    if (name === 'logs' && !logWs) connectLogs();
    if (name === 'sessions') loadSessions();
    if (name === 'watchdog') loadWatchdog();
    if (name === 'knowledge') loadKnowledge();
    if (name === 'software') initSoftwareTab();
    if (name === 'analyse') { loadAnalysisHistory(); loadAnalysis('live'); }
    if (name === 'eflux') { renderEfluxStats(); filterEfluxTab(); if (efluxData.length === 0) loadEfluxChargers(); }
    if (name === 'medewerkers') loadRfidTags();
}

async function loadRfidTags() {
    try {
        const resp = await fetch('/api/rfid-tags');
        const data = await resp.json();
        const container = document.getElementById('rfid-tags-table');
        if (data.length === 0) {
            container.innerHTML = '<div style="color:#64748b;padding:10px;">Nog geen RFID tags gevonden in logs.</div>';
            return;
        }
        // Sort by last_seen desc
        data.sort((a,b) => (b[1].last_seen || '').localeCompare(a[1].last_seen || ''));
        let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
        html += '<thead><tr><th style="text-align:left;color:#94a3b8;padding:8px;border-bottom:1px solid #334155;">RFID Tag</th>';
        html += '<th style="text-align:left;color:#94a3b8;padding:8px;border-bottom:1px solid #334155;">Sessies</th>';
        html += '<th style="text-align:left;color:#94a3b8;padding:8px;border-bottom:1px solid #334155;">Laadpalen</th>';
        html += '<th style="text-align:left;color:#94a3b8;padding:8px;border-bottom:1px solid #334155;">Laatst gezien</th></tr></thead><tbody>';
        for (const [tag, info] of data) {
            html += '<tr style="border-bottom:1px solid #1e293b;">';
            html += '<td style="padding:8px;font-family:monospace;color:#fbbf24;font-weight:600;">' + tag + '</td>';
            html += '<td style="padding:8px;"><span class="badge online">' + info.sessions + '</span></td>';
            html += '<td style="padding:8px;font-size:11px;">' + info.chargers.join(', ') + '</td>';
            html += '<td style="padding:8px;font-size:11px;color:#94a3b8;">' + (info.last_seen || '-') + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch(e) {
        document.getElementById('rfid-tags-table').innerHTML = '<div style="color:#ef4444;padding:10px;">Fout bij laden: ' + e + '</div>';
    }
}

async function loadSessions() {
    try {
        const resp = await fetch('/api/sessions');
        const data = await resp.json();
        const grid = document.getElementById('sessions-grid');
        if (Object.keys(data).length === 0) {
            grid.innerHTML = '<div style="color:#64748b;padding:20px;">Nog geen laadsessies geregistreerd. Sessies verschijnen na een StartTransaction/StopTransaction.</div>';
            return;
        }
        let html = '';
        for (const [cpId, sessions] of Object.entries(data).sort()) {
            html += '<div class="session-card"><h4>' + cpId + ' (' + sessions.length + ' sessies)</h4>';
            html += '<table class="session-table"><thead><tr><th>Connector</th><th>Start</th><th>Stop</th><th>Duur</th><th>Energie</th><th>Kosten</th><th>Max Power</th><th>Tag</th></tr></thead><tbody>';
            for (const s of sessions.slice().reverse()) {
                const start = s.start_time ? new Date(s.start_time).toLocaleString('nl-NL', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
                const stop = s.stop_time ? new Date(s.stop_time).toLocaleString('nl-NL', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
                const dur = s.duration_min ? (s.duration_min >= 60 ? Math.floor(s.duration_min/60) + 'u ' + (s.duration_min%60) + 'm' : s.duration_min + ' min') : '-';
                const energy_kwh = s.energy_wh ? (s.energy_wh / 1000).toFixed(1) : (s.energy_kwh || '-');
                const power = s.max_power_w ? (s.max_power_w >= 1000 ? (s.max_power_w/1000).toFixed(1) + ' kW' : s.max_power_w + ' W') : '-';
                const tag = s.id_tag || '-';
                const cost = s.cost_incl_vat ? '\u20ac ' + s.cost_incl_vat.toFixed(2) : (s.cost_excl_vat ? '\u20ac ' + s.cost_excl_vat.toFixed(2) + ' excl' : '-');
                html += '<tr><td><span class="session-tag blue">C' + s.connector_id + '</span></td><td>' + start + '</td><td>' + stop + '</td><td><span class="session-tag green">' + dur + '</span></td><td><b>' + energy_kwh + ' kWh</b></td><td style="color:#34d399;font-weight:600;">' + cost + '</td><td>' + power + '</td><td style="font-family:monospace;font-size:11px;">' + tag + '</td></tr>';
            }
            html += '</tbody></table></div>';
        }
        grid.innerHTML = html;
    } catch(e) {
        document.getElementById('sessions-grid').innerHTML = '<div style="color:#ef4444;">Fout bij laden sessies: ' + e + '</div>';
    }
}

let activeFilter = 'all';
let searchQuery = '';

function toggleFilter(filter, el) {
    activeFilter = filter;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    applyFilters();
}

function applyFilters() {
    const el = document.getElementById('search-input');
    searchQuery = el ? el.value.toLowerCase() : '';
    renderChargers(currentState);
}

function chargerMatchesFilter(id, c) {
    // Search
    if (searchQuery) {
        const haystack = [
            id, c.vendor, c.model, c.firmware, c.source_ip,
            c.connected ? 'online' : 'offline',
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(searchQuery)) return false;
    }
    // Filter
    if (activeFilter === 'all') return true;
    if (activeFilter === 'online') return c.connected;
    if (activeFilter === 'offline') return !c.connected;
    if (activeFilter === 'quarantine') return c.quarantine && c.quarantine.active;
    const conns = c.connectors || {};
    if (activeFilter === 'charging') return Object.values(conns).some(cn => cn.status === 'Charging');
    if (activeFilter === 'faulted') return Object.values(conns).some(cn => cn.status === 'Faulted' || (cn.error_code && cn.error_code !== 'NoError'));
    return true;
}

function statusBadge(status, connected) {
    if (!connected) return '<span class="badge offline">OFFLINE</span>';
    if (!status) return '<span class="badge online">ONLINE</span>';
    const s = status.toLowerCase();
    if (s === 'faulted') return '<span class="badge faulted">FAULTED</span>';
    if (s === 'charging') return '<span class="badge charging">CHARGING</span>';
    if (s === 'available') return '<span class="badge available">AVAILABLE</span>';
    return '<span class="badge online">' + status + '</span>';
}

function getEcgColor(charger) {
    if (!charger.connected) return '#f87171';
    if (charger.quarantine && charger.quarantine.active) return '#f87171';
    const conns = charger.connectors || {};
    for (const c of Object.values(conns)) {
        if (c.status === 'Charging') return '#38bdf8';
        if (c.status === 'Faulted') return '#fbbf24';
    }
    return '#34d399';
}

// ECG rendering engine
const ecgCanvases = {};

function drawEcg(canvasId, color, heartbeats, connected) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const cw = w/2, ch = h/2;
    const mid = ch / 2;

    ctx.clearRect(0, 0, cw, ch);

    if (!connected) {
        // Flatline
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1.5;
        ctx.moveTo(0, mid);
        ctx.lineTo(cw, mid);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
    }

    const now = Date.now();
    const windowMs = 120000; // 2 min window

    // QRS complex shape (hartslag puls)
    function drawQRS(ctx, x, mid, amplitude) {
        const a = amplitude;
        ctx.lineTo(x - 6, mid);          // baseline
        ctx.lineTo(x - 4, mid - 2);      // P golf
        ctx.lineTo(x - 2, mid);          // terug
        ctx.lineTo(x - 1, mid + 1);      // Q
        ctx.lineTo(x, mid - a);           // R piek omhoog
        ctx.lineTo(x + 1, mid + a*0.4);  // S omlaag
        ctx.lineTo(x + 3, mid);          // terug baseline
        ctx.lineTo(x + 6, mid - 2);      // T golf
        ctx.lineTo(x + 9, mid);          // terug baseline
    }

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.moveTo(0, mid);

    // Teken baseline met QRS bij elke heartbeat
    const hbTimes = (heartbeats || []).map(t => new Date(t).getTime()).filter(t => t > now - windowMs);
    let lastX = 0;

    for (let i = 0; i < hbTimes.length; i++) {
        const age = now - hbTimes[i];
        const x = cw - (age / windowMs) * cw;
        if (x < 0 || x > cw) continue;

        // Baseline tot dit punt
        ctx.lineTo(x - 9, mid);
        // QRS complex
        const freshness = Math.max(0.4, 1 - (age / windowMs));
        drawQRS(ctx, x, mid, 8 * freshness);
    }

    // Baseline naar eind
    ctx.lineTo(cw, mid);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Sweeper lijn (groene cursor)
    if (connected && hbTimes.length > 0) {
        const sweepX = cw - ((now % windowMs) / windowMs) * cw;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 12;
        ctx.moveTo(sweepX, 0);
        ctx.lineTo(sweepX, ch);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}

function updateAllEcg() {
    const chargers = (currentState.chargers || {});
    for (const [id, c] of Object.entries(chargers)) {
        if (id.startsWith('_')) continue;
        const canvasId = 'ecg-' + id;
        const color = getEcgColor(c);
        drawEcg(canvasId, color, c.heartbeat_log || [], c.connected);
    }
    requestAnimationFrame(updateAllEcg);
}

function renderChargers(state) {
    const grid = document.getElementById('charger-grid');
    if (!grid) return;
    try { _renderChargersInner(state, grid); } catch(e) { grid.textContent = 'Render error: ' + e.message; grid.style.color='#f87171'; grid.style.padding='20px'; console.error('renderChargers error:', e); }
}
function _renderChargersInner(state, grid) {
    const chargers = state.chargers || {};
    if (Object.keys(chargers).length === 0) {
        grid.innerHTML = '<div class="card"><p class="info">Geen laadpalen verbonden</p></div>';
        return;
    }

    // Groepeer per klant — dynamisch op basis van client field uit DB
    const clientMeta = {
        'Jumbo Veghel': {icon: 'JV', color: '#fbbf24', link: null},
        'Van Dorp / De Koning': {icon: 'DK', color: '#38bdf8', link: '/client/dekoning'},
    };
    const clients = {};
    for (const id of Object.keys(chargers)) {
        if (id.startsWith('_')) continue;
        const c = chargers[id];
        const clientName = c.client || 'Overig';
        if (!clients[clientName]) {
            const meta = clientMeta[clientName] || {icon: '?', color: '#94a3b8', link: null};
            clients[clientName] = {icon: meta.icon, color: meta.color, link: meta.link, ids: []};
        }
        clients[clientName].ids.push(id);
    }

    let html = '';
    for (const [clientName, client] of Object.entries(clients)) {
        if (client.ids.length === 0) continue;
        const onlineCount = client.ids.filter(id => chargers[id] && chargers[id].connected).length;
        const offlineCount = client.ids.filter(id => chargers[id] && !chargers[id].connected).length;
        const quarantineCount = client.ids.filter(id => chargers[id] && chargers[id].quarantine && chargers[id].quarantine.active).length;
        const chargingCount = client.ids.filter(id => {
            const c = chargers[id]; if (!c) return false;
            return Object.values(c.connectors || {}).some(cn => cn.status === 'Charging');
        }).length;
        const matchCount = client.ids.filter(id => chargers[id] && chargerMatchesFilter(id, chargers[id])).length;
        const hasFilter = searchQuery || activeFilter !== 'all';

        // Totaal vermogen per klant
        let totalPowerW = 0;
        for (const id of client.ids) {
            const c = chargers[id]; if (!c) continue;
            for (const conn of Object.values(c.connectors || {})) {
                const mv = conn.meter_values;
                if (mv && mv[0] && mv[0].sampled_value) {
                    for (const v of mv[0].sampled_value) {
                        if ((v.measurand || '').includes('Power.Active.Import')) totalPowerW += parseFloat(v.value || 0);
                    }
                }
            }
        }

        const clientKey = clientName.replace(/[^a-zA-Z0-9]/g, '_');
        const isExpanded = hasFilter || (clientExpanded[clientKey] === true);

        // Klant samenvattingskaart
        html += '<div style="grid-column:1/-1;margin:12px 0 4px;">';
        html += '<div onclick="toggleClient(' + "'" + clientKey + "'" + ')" style="cursor:pointer;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px 20px;transition:all 0.2s;' + (isExpanded ? 'border-color:' + client.color + '44;' : '') + '">';

        // Header rij
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<div style="display:flex;align-items:center;gap:12px;">';
        html += '<span style="font-size:24px;">' + client.icon + '</span>';
        html += '<div>';
        html += '<div style="font-size:17px;font-weight:700;color:' + client.color + ';">' + clientName + '</div>';
        html += '<div style="font-size:12px;color:#64748b;margin-top:2px;">' + client.ids.length + ' laadpalen';
        if (hasFilter) html += ' | ' + matchCount + ' gevonden';
        html += '</div></div></div>';

        // Status badges rechts
        html += '<div style="display:flex;gap:8px;align-items:center;">';
        if (chargingCount > 0) html += '<span class="badge" style="background:#065f4620;color:#34d399;">' + chargingCount + ' laden</span>';
        html += '<span class="badge online">' + onlineCount + ' online</span>';
        if (offlineCount > 0) html += '<span class="badge offline">' + offlineCount + ' offline</span>';
        if (quarantineCount > 0) html += '<span class="badge" style="background:#7f1d1d20;color:#fca5a5;">' + quarantineCount + ' quarantaine</span>';
        html += '<span style="color:#64748b;font-size:18px;transition:transform 0.2s;display:inline-block;transform:rotate(' + (isExpanded ? '90' : '0') + 'deg);">&#9654;</span>';
        html += '</div></div>';

        // Stats rij
        html += '<div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap;">';
        html += '<div style="font-size:12px;color:#94a3b8;">Vermogen: <b style="color:' + (totalPowerW > 0 ? '#34d399' : '#64748b') + ';">' + (totalPowerW/1000).toFixed(1) + ' kW</b></div>';
        // Connector teller
        let totalConns = 0, availConns = 0, chargingConns = 0;
        for (const id of client.ids) {
            const c = chargers[id]; if (!c) continue;
            for (const [cid, cn] of Object.entries(c.connectors || {})) {
                if (cid === '0') continue;
                totalConns++;
                if (cn.status === 'Available') availConns++;
                if (cn.status === 'Charging') chargingConns++;
            }
        }
        html += '<div style="font-size:12px;color:#94a3b8;">Connectors: <b style="color:#e2e8f0;">' + availConns + '/' + totalConns + ' vrij</b></div>';
        if (chargingConns > 0) html += '<div style="font-size:12px;color:#94a3b8;">Actief: <b style="color:#34d399;">' + chargingConns + ' laden</b></div>';
        if (client.link) html += '<a href="' + client.link + '" onclick="event.stopPropagation()" style="font-size:12px;color:#38bdf8;margin-left:auto;">Klant dashboard &#8599;</a>';
        html += '</div>';

        html += '</div></div>';

        // Individuele palen (in-/uitklapbaar)
        if (!isExpanded) {
            // Toon niks — collapsed
        } else {

        for (const id of client.ids.sort()) {
            const c = chargers[id];
            if (!c) continue;
            if (!chargerMatchesFilter(id, c)) continue;
        const _connKeys = c.connectors ? Object.keys(c.connectors).filter(k => k !== '0').sort() : [];
        const mainStatus = c.connectors && c.connectors['0'] ? c.connectors['0'].status :
                          _connKeys.length > 0 ? c.connectors[_connKeys[0]].status : null;
        const isQuarantine = c.quarantine && c.quarantine.active;
        html += '<div class="card clickable-card" data-cpid="' + id + '" style="' + (isQuarantine ? 'border-color:#f87171;border-width:2px;' : '') + '">';
        html += '<h3><span class="id">' + id + '</span>';
        if (c.alias) html += ' <span style="color:#38bdf8;font-size:12px;font-weight:400;">' + c.alias + '</span>';
        html += statusBadge(mainStatus, c.connected);
        if (isQuarantine) html += ' <span class="badge" style="background:#7f1d1d;color:#fca5a5;">QUARANTAINE</span>';
        html += ' <span style="float:right;font-size:11px;color:#64748b;">details &#8599;</span></h3>';
        if (c.location) html += '<div class="info" style="color:#64748b;font-size:11px;">' + c.location + '</div>';
        if (isQuarantine) html += '<div style="background:#7f1d1d22;border:1px solid #7f1d1d;border-radius:4px;padding:6px 10px;margin:6px 0;font-size:11px;color:#fca5a5;">' + escapeHtml(c.quarantine.reason) + '</div>';
        if (c.vendor) html += '<div class="info">Type: <span>' + c.vendor + ' ' + (c.model||'') + '</span></div>';
        if (c.firmware) html += '<div class="info">Firmware: <span>' + c.firmware + '</span></div>';
        if (c.source_ip) html += '<div class="info">IP: <span>' + c.source_ip + '</span></div>';
        html += '<div style="margin:8px 0;display:flex;align-items:center;gap:8px;"><img src="/qr/' + id + '.png" style="width:48px;height:48px;border-radius:4px;background:white;padding:2px;"><a href="/charge/' + id + '" target="_blank" onclick="event.stopPropagation()" style="font-size:11px;color:#38bdf8;">Bestuurders portaal</a></div>';
        if (c.last_heartbeat) {
            const ago = Math.round((Date.now() - new Date(c.last_heartbeat).getTime()) / 1000);
            html += '<div class="info">Laatste heartbeat: <span>' + ago + 's geleden</span></div>';
        }
        if (c.connected_at) html += '<div class="info">Verbonden sinds: <span>' + new Date(c.connected_at).toLocaleTimeString('nl') + '</span></div>';

        // Backends
        const backends = c.backends || {};
        const cfgBackends = c.configured_backends || [];
        if (cfgBackends.length > 0 || Object.keys(backends).length > 0) {
            html += '<div class="backends">';
            for (const name of cfgBackends) {
                const b = backends[name] || {};
                const cls = b.connected ? 'connected' : 'disconnected';
                html += '<span class="backend ' + cls + '">' + name + '</span>';
            }
            // API connections (Voltcontrol etc.)
            const apiConns = state.api_connections || {};
            for (const [apiName, info] of Object.entries(apiConns)) {
                const lastPoll = new Date(info.last_poll);
                const ago = Math.round((Date.now() - lastPoll.getTime()) / 1000);
                const alive = ago < 120;
                const firstPoll = new Date(info.first_poll);
                const uptimeMin = Math.round((Date.now() - firstPoll.getTime()) / 60000);
                let uptimeStr;
                if (uptimeMin >= 1440) uptimeStr = Math.floor(uptimeMin/1440) + 'd' + Math.floor((uptimeMin%1440)/60) + 'u';
                else if (uptimeMin >= 60) uptimeStr = Math.floor(uptimeMin/60) + 'u' + (uptimeMin%60) + 'm';
                else uptimeStr = uptimeMin + 'm';
                html += '<span class="backend ' + (alive ? 'connected' : 'disconnected') + '">' + (alive ? '<span class="pulse"></span>' : '') + apiName + ' API <small>(' + info.poll_count + 'x, ' + uptimeStr + ')</small></span>';
            }
            html += '</div>';
        }

        // ECG hartslag canvas
        html += '<canvas class="ecg-canvas" id="ecg-' + id + '"></canvas>';

        // Connectors with meter values
        const conns = c.connectors || {};
        if (Object.keys(conns).length > 0) {
            html += '<div class="connectors">';
            for (const [cid, conn] of Object.entries(conns)) {
                if (cid === '0') continue;
                html += '<div class="connector"><span>Connector ' + cid + '</span>';
                html += statusBadge(conn.status, true);
                if (conn.error_code && conn.error_code !== 'NoError') html += ' <span style="color:#fbbf24;font-size:11px">' + conn.error_code + '</span>';
                html += '</div>';
                // Meter values
                const mv = conn.meter_values;
                if (mv && mv.length > 0 && mv[0].sampled_value) {
                    html += '<div class="meter-values">';
                    const vals = mv[0].sampled_value;
                    let currentTotal = null, voltage = null, power = null, energy = null;
                    const phaseCurrents = {};
                    for (const v of vals) {
                        const m = v.measurand || '';
                        const phase = v.phase || '';
                        if (m.includes('Current.Import')) {
                            if (phase) {
                                phaseCurrents[phase] = parseFloat(v.value || 0);
                            } else {
                                currentTotal = parseFloat(v.value || 0);
                            }
                        }
                        if (m.includes('Voltage')) voltage = v;
                        if (m.includes('Power.Active.Import')) power = v;
                        if (m.includes('Energy.Active.Import')) energy = v;
                    }
                    // Bereken per fase als we phase data hebben
                    const phases = Object.keys(phaseCurrents);
                    let perPhase = 0;
                    if (phases.length >= 3) {
                        perPhase = (phaseCurrents['L1']||0) + (phaseCurrents['L2']||0) + (phaseCurrents['L3']||0);
                    } else if (currentTotal && !phases.length) {
                        // Totaal stroom zonder fase data — schat per fase uit vermogen
                        if (power && voltage) {
                            const v = parseFloat(voltage.value||230);
                            const p = parseFloat(power.value||0);
                            const nPhases = p > 0 ? Math.round(currentTotal * v / p) : 1;
                            if (nPhases >= 3) perPhase = currentTotal / 3;
                        }
                    }
                    html += '<div class="mv-row">';
                    // Stroom per fase
                    if (phases.length >= 3) {
                        html += '<span class="mv-item mv-current" style="flex-direction:column;align-items:flex-start;">';
                        html += '<span style="display:flex;gap:6px;">';
                        for (const p of ['L1','L2','L3']) {
                            const a = (phaseCurrents[p]||0).toFixed(1);
                            html += '<span style="font-size:11px;"><span style="color:#64748b;">' + p + '</span> <span class="mv-val" style="font-size:14px;">' + a + '</span></span>';
                        }
                        html += '</span>';
                        const total = ((phaseCurrents['L1']||0)+(phaseCurrents['L2']||0)+(phaseCurrents['L3']||0)).toFixed(1);
                        html += '<span style="font-size:10px;color:#94a3b8;">\u03a3 ' + total + ' A</span>';
                        html += '</span>';
                    } else if (currentTotal !== null) {
                        // Totaal stroom — toon met schatting per fase
                        html += '<span class="mv-item mv-current"><span class="mv-val">' + currentTotal.toFixed(1) + '</span><span class="mv-unit">A';
                        if (perPhase > 0) html += ' <span style="font-size:10px;color:#64748b;">(\u2248' + perPhase.toFixed(1) + '/fase)</span>';
                        html += '</span></span>';
                    }
                    if (voltage) html += '<span class="mv-item mv-voltage"><span class="mv-val">' + parseFloat(voltage.value).toFixed(0) + '</span><span class="mv-unit">V</span></span>';
                    let powerKw = power ? parseFloat(power.value) / 1000 : 0;
                    // Als vermogen 0 maar stroom en spanning beschikbaar: bereken
                    if (powerKw < 0.01 && currentTotal > 0.5 && voltage) {
                        powerKw = currentTotal * parseFloat(voltage.value) / 1000;
                    }
                    if (powerKw > 0.01) html += '<span class="mv-item mv-power"><span class="mv-val">' + powerKw.toFixed(1) + '</span><span class="mv-unit">kW</span></span>';
                    if (energy) html += '<span class="mv-item mv-energy"><span class="mv-val">' + (parseFloat(energy.value)/1000).toFixed(0) + '</span><span class="mv-unit">kWh</span></span>';
                    html += '</div>';
                    const ts = mv[0].timestamp;
                    if (ts) { const ago = Math.round((Date.now() - new Date(ts).getTime())/1000); html += '<div class="mv-time">' + ago + 's geleden</div>'; }
                    html += '</div>';
                }
            }
            html += '</div>';
        }
        // Log toggle + container
        const isOpen = chargerLogOpen[id];
        html += '<div class="charger-log-toggle" onclick="toggleChargerLog(' + "'" + id + "'" + ')">' + (isOpen ? '\u25bc' : '\u25b6') + ' OCPP Berichten</div>';
        if (isOpen) {
            html += '<div class="charger-logs" id="clog-' + id + '">';
            const logs = chargerLogs[id] || [];
            for (const l of logs) {
                html += '<div class="cl ' + l.cls + '">' + escapeHtml(l.text) + '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
    } // end charger loop
    } // end expanded check
    } // end client loop

    // === E-Flux Maintenance chargers ===
    if (efluxData.length > 0) {
        // Filter E-Flux chargers
        const efluxFiltered = efluxData.filter(cp => {
            const isOnline = cp.connectivityState === 'connected';
            // Search filter
            if (searchQuery) {
                const haystack = [
                    cp.ocppIdentity, cp.evseId,
                    (cp.location||{}).name, (cp.location||{}).address, (cp.location||{}).city,
                    isOnline ? 'online' : 'offline', 'e-flux', 'eflux', 'maintenance'
                ].filter(Boolean).join(' ').toLowerCase();
                if (!haystack.includes(searchQuery)) return false;
            }
            // Status filter
            if (activeFilter === 'online') return isOnline;
            if (activeFilter === 'offline') return !isOnline;
            if (activeFilter === 'charging') {
                const cs = cp.connectorStatus || {};
                return Object.values(cs).some(c => c.status === 'Charging' || c.status === 'Occupied');
            }
            if (activeFilter === 'faulted') {
                const cs = cp.connectorStatus || {};
                return Object.values(cs).some(c => c.status === 'Faulted' || c.status === 'UNKNOWN');
            }
            if (activeFilter === 'quarantine') return false;
            return true;
        });

        const efluxOnline = efluxData.filter(c => c.connectivityState === 'connected').length;
        const efluxOffline = efluxData.length - efluxOnline;
        const efluxCharging = efluxData.filter(c => {
            const cs = c.connectorStatus || {};
            return Object.values(cs).some(cn => cn.status === 'Charging' || cn.status === 'Occupied');
        }).length;
        const hasFilter = searchQuery || activeFilter !== 'all';
        const clientKey = 'E_Flux_Maintenance';
        const isExpanded = hasFilter || (clientExpanded[clientKey] === true);

        // E-Flux group header
        html += '<div style="grid-column:1/-1;margin:12px 0 4px;">';
        html += '<div onclick="toggleClient(' + "'" + clientKey + "'" + ')" style="cursor:pointer;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px 20px;transition:all 0.2s;' + (isExpanded ? 'border-color:#a78bfa44;' : '') + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<div style="display:flex;align-items:center;gap:12px;">';
        html += '<span style="font-size:24px;background:linear-gradient(135deg,#a78bfa,#6366f1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:800;">EF</span>';
        html += '<div>';
        html += '<div style="font-size:17px;font-weight:700;color:#a78bfa;">E-Flux Maintenance</div>';
        html += '<div style="font-size:12px;color:#64748b;margin-top:2px;">' + efluxData.length + ' laadpalen (extern)';
        if (hasFilter) html += ' | ' + efluxFiltered.length + ' gevonden';
        html += '</div></div></div>';
        html += '<div style="display:flex;gap:8px;align-items:center;">';
        if (efluxCharging > 0) html += '<span class="badge" style="background:#065f4620;color:#34d399;">' + efluxCharging + ' laden</span>';
        html += '<span class="badge online">' + efluxOnline + ' online</span>';
        if (efluxOffline > 0) html += '<span class="badge offline">' + efluxOffline + ' offline</span>';
        html += '<span style="color:#64748b;font-size:18px;transition:transform 0.2s;display:inline-block;transform:rotate(' + (isExpanded ? '90' : '0') + 'deg);">&#9654;</span>';
        html += '</div></div>';
        html += '</div></div>';

        if (isExpanded) {
            for (const cp of efluxFiltered) {
                const ocpp = cp.ocppIdentity || '?';
                const evseId = cp.evseId || '';
                const loc = cp.location || {};
                const isOnline = cp.connectivityState === 'connected';
                const statusBadgeHtml = isOnline ? '<span class="badge online">ONLINE</span>' : '<span class="badge offline">OFFLINE</span>';
                const hb = cp.heartbeatReceivedAt ? new Date(cp.heartbeatReceivedAt).toLocaleString('nl-NL') : '-';
                const cpId = cp.id || cp._id || '';

                html += '<div class="card clickable-card" data-eflux-id="' + cpId + '" data-eflux-ocpp="' + escapeHtml(ocpp) + '" onclick="openEfluxCommand(this)" style="border-left:3px solid ' + (isOnline ? '#a78bfa' : '#64748b') + ';">';
                html += '<h3><span class="id" style="font-family:monospace;">' + escapeHtml(ocpp) + '</span> ' + statusBadgeHtml;
                html += ' <span style="float:right;font-size:11px;color:#a78bfa;cursor:pointer;">commando &#9881;</span></h3>';
                if (evseId) html += '<div class="info">EVSE: <span>' + escapeHtml(evseId) + '</span></div>';
                if (loc.name) html += '<div class="info" style="color:#e2e8f0;font-size:13px;">' + escapeHtml(loc.name) + '</div>';
                if (loc.address || loc.city) html += '<div class="info" style="color:#64748b;font-size:11px;">' + escapeHtml([loc.address, loc.city].filter(Boolean).join(', ')) + '</div>';
                html += '<div class="info">Heartbeat: <span>' + hb + '</span></div>';

                // Connectors
                const cs = cp.connectorStatus || {};
                const connKeys = Object.keys(cs);
                if (connKeys.length > 0) {
                    html += '<div class="connectors" style="margin-top:6px;">';
                    for (const key of connKeys) {
                        const c = cs[key];
                        const cStatus = c.status || '?';
                        const cColor = cStatus === 'Available' ? 'online' : cStatus === 'Charging' || cStatus === 'Occupied' ? 'charging' : cStatus === 'Faulted' || cStatus === 'UNKNOWN' ? 'faulted' : 'offline';
                        const cLabel = key.length > 4 ? 'C' + key.slice(-4) : 'C' + key;
                        html += '<div class="connector"><span>' + cLabel + '</span>';
                        html += '<span class="badge ' + cColor + '">' + cStatus + '</span></div>';
                    }
                    html += '</div>';
                }
                html += '</div>';
            }
        }
    }

    // === Evinty CPO chargers ===
    if (evintyData.length > 0) {
        const evFiltered = evintyData.filter(cp => {
            const isOnline = cp.status === 'AVAILABLE' || cp.status === 'CHARGING' || cp.status === 'OCCUPIED';
            if (searchQuery) {
                const haystack = [
                    cp.chargingStationId, cp.locationName, cp.vendor, cp.model,
                    isOnline ? 'online' : 'offline', 'evinty'
                ].filter(Boolean).join(' ').toLowerCase();
                if (!haystack.includes(searchQuery)) return false;
            }
            if (activeFilter === 'online') return isOnline;
            if (activeFilter === 'offline') return !isOnline;
            if (activeFilter === 'charging') return cp.status === 'CHARGING';
            if (activeFilter === 'faulted') return cp.status === 'FAULTED';
            if (activeFilter === 'quarantine') return false;
            return true;
        });

        const evOnline = evintyData.filter(c => c.status === 'AVAILABLE' || c.status === 'CHARGING' || c.status === 'OCCUPIED').length;
        const evOffline = evintyData.filter(c => c.status === 'OFFLINE' || c.status === 'UNAVAILABLE').length;
        const evCharging = evintyData.filter(c => c.status === 'CHARGING').length;
        const hasFilter = searchQuery || activeFilter !== 'all';
        const evKey = 'Evinty_CPO';
        const evExpanded = hasFilter || (clientExpanded[evKey] === true);

        html += '<div style="grid-column:1/-1;margin:12px 0 4px;">';
        html += '<div onclick="toggleClient(' + "'" + evKey + "'" + ')" style="cursor:pointer;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px 20px;transition:all 0.2s;' + (evExpanded ? 'border-color:#f5920044;' : '') + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<div style="display:flex;align-items:center;gap:12px;">';
        html += '<span style="font-size:24px;background:linear-gradient(135deg,#f59e0b,#d97706);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:800;">EV</span>';
        html += '<div>';
        html += '<div style="font-size:17px;font-weight:700;color:#f59e0b;">Evinty CPO</div>';
        html += '<div style="font-size:12px;color:#64748b;margin-top:2px;">' + evintyData.length + ' laadpalen (extern)';
        if (hasFilter) html += ' | ' + evFiltered.length + ' gevonden';
        html += '</div></div></div>';
        html += '<div style="display:flex;gap:8px;align-items:center;">';
        if (evCharging > 0) html += '<span class="badge" style="background:#065f4620;color:#34d399;">' + evCharging + ' laden</span>';
        html += '<span class="badge online">' + evOnline + ' online</span>';
        if (evOffline > 0) html += '<span class="badge offline">' + evOffline + ' offline</span>';
        html += '<span style="color:#64748b;font-size:18px;transition:transform 0.2s;display:inline-block;transform:rotate(' + (evExpanded ? '90' : '0') + 'deg);">&#9654;</span>';
        html += '</div></div>';
        html += '</div></div>';

        if (evExpanded) {
            for (const cp of evFiltered) {
                const csId = cp.chargingStationId || '?';
                const status = cp.status || '?';
                const loc = cp.locationName || '';
                const vendor = cp.vendor || '';
                const model = cp.model || '';
                const isOnline = status === 'AVAILABLE' || status === 'CHARGING' || status === 'OCCUPIED';
                const statusCls = status === 'AVAILABLE' ? 'available' : status === 'CHARGING' ? 'charging' : status === 'FAULTED' ? 'faulted' : 'offline';

                html += '<div class="card" onclick="openEvintyCommand(' + "'" + escapeHtml(csId) + "'" + ')" style="border-left:3px solid ' + (isOnline ? '#f59e0b' : '#64748b') + ';cursor:pointer;">';
                html += '<h3><span class="id" style="font-family:monospace;">' + escapeHtml(csId) + '</span> ';
                html += '<span class="badge ' + statusCls + '">' + status + '</span>';
                html += ' <span style="float:right;font-size:11px;color:#f59e0b;cursor:pointer;">commando &#9881;</span></h3>';
                if (loc) html += '<div class="info" style="color:#e2e8f0;font-size:13px;">' + escapeHtml(loc) + '</div>';
                if (vendor || model) html += '<div class="info">Type: <span>' + escapeHtml(vendor) + ' ' + escapeHtml(model) + '</span></div>';
                html += '</div>';
            }
        }
    }

    grid.innerHTML = html;
    // Scroll log containers to bottom
    for (const id of Object.keys(chargerLogOpen)) {
        if (chargerLogOpen[id]) {
            const el = document.getElementById('clog-' + id);
            if (el) el.scrollTop = el.scrollHeight;
        }
    }
}

function updatePayload() {
    const action = document.getElementById('cmd-action').value;
    const payloads = {
        'Reset': '{"type": "Soft"}',
        'ChangeConfiguration': '{"key": "HeartbeatInterval", "value": "300"}',
        'TriggerMessage': '{"requestedMessage": "StatusNotification"}',
        'GetConfiguration': '{}',
        'UpdateFirmware': '{"location": "http://46.62.148.12/firmware.bin", "retrieveDate": "' + new Date().toISOString() + '"}',
        'UnlockConnector': '{"connectorId": 1}',
    };
    document.getElementById('cmd-payload').value = payloads[action] || '{}';
}

async function sendCommand() {
    const cp_id = document.getElementById('cmd-charger').value;
    const action = document.getElementById('cmd-action').value;
    let payload;
    try { payload = JSON.parse(document.getElementById('cmd-payload').value); }
    catch(e) { document.getElementById('cmd-result').textContent = 'Ongeldige JSON: ' + e; return; }

    document.getElementById('cmd-result').textContent = 'Versturen...';
    try {
        const resp = await fetch('/api/command', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({cp_id, action, payload}),
        });
        const data = await resp.json();
        document.getElementById('cmd-result').textContent = JSON.stringify(data, null, 2);
    } catch(e) {
        document.getElementById('cmd-result').textContent = 'Error: ' + e;
    }
}

function toggleChargerLog(id) {
    chargerLogOpen[id] = !chargerLogOpen[id];
    renderChargers(currentState);
}

function parseLogForCharger(line) {
    // Match charger IDs in log lines
    const chargerIds = Object.keys(currentState.chargers || {});
    for (const id of chargerIds) {
        if (line.includes(id)) {
            let cls = 'recv';
            let text = line;
            // Extract timestamp and message
            const m = line.match(/\d{2}:\d{2}:\d{2},\d+ INFO (.+)/);
            if (m) text = m[1];
            if (text.includes('send') || text.includes('>>')) cls = 'send';
            else if (text.includes('[voltcontrol]') || text.includes('[evinty]') || text.includes('[eflux]')) cls = 'backend';
            else if (text.includes('ERROR') || text.includes('error') || text.includes('Faulted')) cls = 'error';
            // Extract time
            const tm = line.match(/(\d{2}:\d{2}:\d{2})/);
            const time = tm ? tm[1] : '';
            if (!chargerLogs[id]) chargerLogs[id] = [];
            chargerLogs[id].push({cls, text: time + ' ' + text});
            if (chargerLogs[id].length > MAX_CHARGER_LOGS) chargerLogs[id].shift();
            // Live update if log panel is open
            if (chargerLogOpen[id]) {
                const el = document.getElementById('clog-' + id);
                if (el) {
                    const div = document.createElement('div');
                    div.className = 'cl ' + cls;
                    div.textContent = time + ' ' + text;
                    el.appendChild(div);
                    if (el.children.length > MAX_CHARGER_LOGS) el.removeChild(el.firstChild);
                    el.scrollTop = el.scrollHeight;
                }
            }
            return;
        }
    }
}

let chargerLogWs = null;
function connectChargerLogs() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    chargerLogWs = new WebSocket(proto + '//' + location.host + '/ws/logs');
    chargerLogWs.onmessage = function(e) { parseLogForCharger(e.data); };
    chargerLogWs.onclose = function() { setTimeout(connectChargerLogs, 3000); chargerLogWs = null; };
}

function connectLogs() {
    const container = document.getElementById('log-container');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    logWs = new WebSocket(proto + '//' + location.host + '/ws/logs');
    logWs.onmessage = function(e) {
        const line = e.data;
        const div = document.createElement('div');
        div.className = 'log-line';
        if (line.includes('ERROR') || line.includes('error')) div.className += ' log-error';
        else if (line.includes('WARNING') || line.includes('Faulted')) div.className += ' log-warn';
        else if (line.includes('connected') || line.includes('Connected')) div.className += ' log-connect';
        else if (line.includes('[voltcontrol]') || line.includes('[evinty]') || line.includes('[eflux]')) div.className += ' log-backend';
        else div.className += ' log-info';
        div.textContent = line;
        container.appendChild(div);
        if (container.children.length > 1000) container.removeChild(container.firstChild);
        container.scrollTop = container.scrollHeight;
    };
    logWs.onclose = function() { setTimeout(connectLogs, 3000); logWs = null; };
}

async function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    chatHistory.push({role: 'user', content: msg});
    renderChat();

    document.getElementById('chat-btn').disabled = true;
    try {
        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({messages: chatHistory, state: currentState}),
        });
        const data = await resp.json();
        chatHistory.push({role: 'assistant', content: data.response});
    } catch(e) {
        chatHistory.push({role: 'assistant', content: 'Error: ' + e});
    }
    document.getElementById('chat-btn').disabled = false;
    renderChat();
}

function renderChat() {
    const container = document.getElementById('chat-messages');
    let html = '';
    for (const msg of chatHistory) {
        html += '<div class="chat-msg ' + msg.role + '">' + escapeHtml(msg.content) + '</div>';
    }
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(new RegExp(String.fromCharCode(10),'g'),'<br>');
}

// === E-Flux Command Modal ===
function openEvintyCommand(csId) {
    const overlay = document.createElement('div');
    overlay.className = 'eflux-modal-overlay';
    overlay.innerHTML = '<div class="eflux-modal">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h3 style="color:#f59e0b;margin:0;">Evinty: ' + escapeHtml(csId) + '</h3>' +
        '<span style="cursor:pointer;color:#94a3b8;font-size:24px;" onclick="this.closest(&quot;.eflux-modal-overlay&quot;).remove()">&times;</span></div>' +
        '<select id="evinty-cmd-method" onchange="updateEvintyParams()" style="width:100%;background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:8px;border-radius:6px;margin-bottom:8px;">' +
        '<option value="Reset">Reset</option>' +
        '<option value="TriggerMessage">TriggerMessage</option>' +
        '<option value="UnlockConnector">UnlockConnector</option>' +
        '</select>' +
        '<textarea id="evinty-cmd-params" rows="4" style="width:100%;background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:8px;border-radius:6px;font-family:monospace;font-size:12px;margin-bottom:8px;resize:vertical;">{"type": "Soft"}</textarea>' +
        '<button onclick="sendEvintyCmd(' + "'" + escapeHtml(csId) + "'" + ')" style="background:#f59e0b;color:#000;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-weight:600;">Verstuur</button>' +
        '<div id="evinty-cmd-result" style="margin-top:10px;font-size:12px;color:#94a3b8;"></div>' +
        '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

function updateEvintyParams() {
    const method = document.getElementById('evinty-cmd-method').value;
    const params = document.getElementById('evinty-cmd-params');
    if (method === 'Reset') params.value = '{"type": "Soft"}';
    else if (method === 'TriggerMessage') params.value = '{"messageTrigger": "STATUS_NOTIFICATION"}';
    else if (method === 'UnlockConnector') params.value = '{"evseId": "", "connectorId": ""}';
}

async function sendEvintyCmd(csId) {
    const method = document.getElementById('evinty-cmd-method').value;
    const paramsText = document.getElementById('evinty-cmd-params').value;
    const resultEl = document.getElementById('evinty-cmd-result');
    resultEl.textContent = 'Versturen...';
    resultEl.style.color = '#94a3b8';
    try {
        const params = JSON.parse(paramsText);
        const resp = await fetch('/api/evinty/command', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({cp_id: csId, command: method, params: params})
        });
        const result = await resp.json();
        if (result.error) {
            resultEl.textContent = 'Fout: ' + result.error;
            resultEl.style.color = '#f87171';
        } else {
            resultEl.textContent = 'OK: ' + JSON.stringify(result);
            resultEl.style.color = '#34d399';
        }
    } catch(e) {
        resultEl.textContent = 'Fout: ' + e;
        resultEl.style.color = '#f87171';
    }
}

function openEfluxCommand(cardEl) {
    event.stopPropagation();
    const cpId = cardEl.dataset.efluxId;
    const ocpp = cardEl.dataset.efluxOcpp;
    if (!cpId) { alert('Geen E-Flux ID gevonden'); return; }

    // Create modal
    const overlay = document.createElement('div');
    overlay.className = 'eflux-modal-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = '<div class="eflux-modal">' +
        '<h3><span style="color:#a78bfa;">OCPP Commando — ' + escapeHtml(ocpp) + '</span><button class="close-btn" onclick="this.closest(&quot;.eflux-modal-overlay&quot;).remove()">&times;</button></h3>' +
        '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">E-Flux ID: ' + escapeHtml(cpId) + '</div>' +
        '<label style="font-size:12px;color:#94a3b8;margin-bottom:4px;display:block;">Methode</label>' +
        '<select id="eflux-cmd-method" onchange="efluxUpdateParams()">' +
            '<option value="Reset">Reset</option>' +
            '<option value="ChangeConfiguration">ChangeConfiguration</option>' +
            '<option value="GetConfiguration">GetConfiguration</option>' +
            '<option value="RemoteStartTransaction">RemoteStartTransaction</option>' +
            '<option value="TriggerMessage">TriggerMessage</option>' +
            '<option value="UnlockConnector">UnlockConnector</option>' +
        '</select>' +
        '<label style="font-size:12px;color:#94a3b8;margin-bottom:4px;display:block;">Parameters (JSON)</label>' +
        '<textarea id="eflux-cmd-params" rows="3" style="font-family:monospace;resize:vertical;">{"type": "Soft"}</textarea>' +
        '<button class="send-cmd" onclick="efluxSendCommand(' + "'" + cpId + "'" + ')">Verstuur commando</button>' +
        '<div class="cmd-output" id="eflux-cmd-output">Wacht op commando...</div>' +
    '</div>';

    document.body.appendChild(overlay);
}

function efluxUpdateParams() {
    const method = document.getElementById('eflux-cmd-method').value;
    const defaults = {
        'Reset': '{"type": "Soft"}',
        'ChangeConfiguration': '{"key": "HeartbeatInterval", "value": "300"}',
        'GetConfiguration': '{}',
        'RemoteStartTransaction': '{"connectorId": 1, "idTag": "REMOTE"}',
        'TriggerMessage': '{"requestedMessage": "StatusNotification"}',
        'UnlockConnector': '{"connectorId": 1}',
    };
    document.getElementById('eflux-cmd-params').value = defaults[method] || '{}';
}

async function efluxSendCommand(cpId) {
    const method = document.getElementById('eflux-cmd-method').value;
    const output = document.getElementById('eflux-cmd-output');
    let params;
    try { params = JSON.parse(document.getElementById('eflux-cmd-params').value); }
    catch(e) { output.textContent = 'Ongeldige JSON: ' + e; output.style.color = '#f87171'; return; }

    output.textContent = 'Versturen...';
    output.style.color = '#94a3b8';
    try {
        const resp = await fetch('/api/eflux/command', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({cp_id: cpId, method: method, params: params}),
        });
        const data = await resp.json();
        if (data.error) {
            output.textContent = 'Error: ' + data.error;
            output.style.color = '#f87171';
        } else {
            output.textContent = JSON.stringify(data, null, 2);
            output.style.color = '#34d399';
        }
    } catch(e) {
        output.textContent = 'Error: ' + e;
        output.style.color = '#f87171';
    }
}

async function pollState() {
    try {
        const [stateResp, efluxResp, evintyResp] = await Promise.all([
            fetch('/api/state'),
            efluxData.length === 0 ? fetch('/api/eflux/chargers') : Promise.resolve(null),
            evintyData.length === 0 ? fetch('/api/evinty/chargers') : Promise.resolve(null)
        ]);
        currentState = await stateResp.json();
        if (efluxResp) {
            try {
                const efluxResult = await efluxResp.json();
                if (!efluxResult.error) efluxData = efluxResult.data || [];
            } catch(e2) {}
        }
        if (evintyResp) {
            try {
                const evintyResult = await evintyResp.json();
                if (!evintyResult.error) evintyData = evintyResult.content || evintyResult.data || [];
            } catch(e2) {}
        }
        renderChargers(currentState);
        renderLoadBalancer(currentState);
        const chargers = Object.entries(currentState.chargers || {}).filter(([k,v]) => k !== '_load_balancer');
        const n = chargers.filter(([k,v]) => v.connected).length;
        const total = chargers.length;
        const efluxOnline = efluxData.filter(c => c.connectivityState === 'connected').length;
        const evintyOnline = evintyData.filter(c => c.status === 'AVAILABLE' || c.status === 'CHARGING' || c.status === 'OCCUPIED').length;
        document.getElementById('header-status').textContent = n + '/' + total + ' proxy + ' + efluxOnline + '/' + efluxData.length + ' e-flux + ' + evintyOnline + '/' + evintyData.length + ' evinty | ' + new Date().toLocaleTimeString('nl');

        // Update command charger dropdown
        const sel = document.getElementById('cmd-charger');
        const prev = sel.value;
        sel.innerHTML = '';
        for (const id of Object.keys(currentState.chargers || {})) {
            sel.innerHTML += '<option value="' + id + '"' + (id===prev?' selected':'') + '>' + id + '</option>';
        }
    } catch(e) {}
}

// Refresh E-Flux + Evinty data periodically (every 60s)
setInterval(async function() {
    try {
        const [ef, ev] = await Promise.all([fetch('/api/eflux/chargers'), fetch('/api/evinty/chargers')]);
        const efr = await ef.json(); if (!efr.error) efluxData = efr.data || [];
        const evr = await ev.json(); if (!evr.error) evintyData = evr.content || evr.data || [];
        renderChargers(currentState);
    } catch(e) {}
}, 60000);

async function loadWatchdog() {
    const el = document.getElementById('watchdog-content');
    try {
        const resp = await fetch('/api/watchdog');
        const data = await resp.json();
        renderWatchdog(data);
    } catch(e) { el.innerHTML = '<div style="color:#f87171;">Fout: ' + e + '</div>'; }
}

function renderWatchdog(data) {
    const el = document.getElementById('watchdog-content');
    const actions = data.actions || [];
    const logLines = data.log || [];
    let html = '';

    // Actions timeline
    html += '<h4 style="color:#38bdf8;margin-bottom:12px;">Acties</h4>';
    if (actions.length === 0) {
        html += '<div style="background:#1e293b;border-radius:8px;padding:16px;border:1px solid #334155;color:#64748b;">Nog geen acties uitgevoerd</div>';
    } else {
        html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">';
        for (const a of actions.slice().reverse()) {
            const ts = a.timestamp ? new Date(a.timestamp).toLocaleString('nl-NL', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '?';
            let icon = '', color = '', bg = '';
            if (a.action === 'restart') { icon = '\u26a1'; color = '#f87171'; bg = '#7f1d1d22'; }
            else if (a.action === 'flag') { icon = '\u26a0'; color = '#fbbf24'; bg = '#78350f22'; }
            else if (a.action === 'wait') { icon = '\u23f3'; color = '#38bdf8'; bg = '#1e3a5f22'; }
            else { icon = '\u2139'; color = '#94a3b8'; bg = '#33415522'; }

            html += '<div style="background:' + bg + ';border:1px solid ' + color + '33;border-left:3px solid ' + color + ';border-radius:6px;padding:10px 14px;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
            html += '<span style="color:' + color + ';font-weight:600;font-size:13px;">' + icon + ' ' + a.action.toUpperCase();
            if (a.cp_id) html += ' — ' + a.cp_id;
            html += '</span>';
            html += '<span style="color:#64748b;font-size:11px;">' + ts + '</span></div>';

            if (a.reason) html += '<div style="color:#94a3b8;font-size:12px;margin-top:4px;">' + escapeHtml(a.reason) + '</div>';
            if (a.issue) html += '<div style="color:#fbbf24;font-size:12px;margin-top:2px;">Issue: ' + a.issue + '</div>';
            if (a.detail) html += '<div style="color:#94a3b8;font-size:11px;margin-top:2px;">' + escapeHtml(a.detail) + '</div>';
            if (a.result) html += '<div style="color:' + (a.result === 'ok' ? '#34d399' : '#f87171') + ';font-size:11px;margin-top:2px;">Resultaat: ' + a.result + '</div>';
            if (a.offline && a.offline.length > 0) {
                html += '<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">';
                for (const id of a.offline) html += '<span style="background:#1e293b;padding:1px 6px;border-radius:3px;font-size:10px;color:#e2e8f0;font-family:monospace;">' + id + '</span>';
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
    }

    // Log output
    html += '<h4 style="color:#38bdf8;margin:20px 0 12px;">Watchdog Log</h4>';
    html += '<div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:12px;font-family:monospace;font-size:11px;max-height:400px;overflow-y:auto;line-height:1.6;">';
    for (const line of logLines) {
        let cls = 'color:#94a3b8;';
        if (line.includes('WARNING')) cls = 'color:#fbbf24;';
        else if (line.includes('ERROR')) cls = 'color:#f87171;';
        else if (line.includes('Restart') || line.includes('restart')) cls = 'color:#f87171;font-weight:600;';
        else if (line.includes('online')) cls = 'color:#34d399;';
        html += '<div style="' + cls + '">' + escapeHtml(line) + '</div>';
    }
    html += '</div>';

    el.innerHTML = html;
}

function renderLoadBalancer(state) {
    const lb = (state.chargers || {})['_load_balancer'];
    const el = document.getElementById('lb-groups');
    if (!lb || !lb.groups || Object.keys(lb.groups).length === 0) {
        el.innerHTML = '<div style="color:#64748b;padding:20px;text-align:center;">Geen load balancer groepen geconfigureerd. Maak een groep aan om te beginnen.</div>';
        return;
    }

    // Get all charger IDs for the "add charger" dropdowns
    const allChargers = Object.keys(state.chargers || {}).filter(k => !k.startsWith('_'));

    let html = '';
    for (const [gid, g] of Object.entries(lb.groups)) {
        const s = g.state || {};
        const totalCur = s.total_current || 0;
        const effMax = s.effective_max || g.max_amps || 0;
        const pct = effMax > 0 ? Math.min(100, (totalCur / effMax) * 100) : 0;
        const barColor = pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#22c55e';
        const parentLabel = g.parent ? ' (onder: ' + g.parent + ')' : ' (root)';

        html += '<div style="background:#1e293b;border-radius:8px;padding:16px;border:1px solid #334155;margin-bottom:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
        html += '<div><span style="font-size:16px;font-weight:700;color:#f1f5f9;">' + (g.name || gid) + '</span>';
        html += '<span style="font-size:11px;color:#64748b;margin-left:8px;">' + gid + parentLabel + '</span></div>';
        html += '<div style="display:flex;gap:6px;align-items:center;">';
        html += '<span style="font-size:20px;font-weight:800;color:#38bdf8;">' + g.max_amps + 'A</span>';
        html += '<button onclick="deleteLBGroup(' + "'" + gid + "'" + ')" style="background:#7f1d1d;color:#fca5a5;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Verwijder</button>';
        html += '</div></div>';

        // Capacity bar
        html += '<div style="height:24px;background:#0f172a;border-radius:6px;overflow:hidden;margin-bottom:6px;">';
        html += '<div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:6px;transition:width 0.5s;"></div></div>';
        html += '<div style="font-size:12px;color:#94a3b8;margin-bottom:10px;">' + totalCur + 'A / ' + effMax + 'A (' + Math.round(pct) + '%) | ' + (s.active_connectors||0) + ' actief | limiet: ' + (s.limit_per_connector||'-') + 'A</div>';

        // Connectors in this group
        const conns = s.connectors || [];
        if (conns.length > 0) {
            html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">';
            for (const c of conns) {
                const cp = Math.min(100, c.limit_amps > 0 ? (c.current_amps / c.limit_amps * 100) : 0);
                html += '<div style="background:#0f172a;border-radius:6px;padding:8px 12px;min-width:140px;">';
                html += '<div style="font-size:12px;font-weight:600;color:#e2e8f0;">' + c.cp_id + ' C' + c.connector_id + '</div>';
                html += '<div style="font-size:18px;font-weight:700;color:#fbbf24;">' + c.current_amps + 'A</div>';
                html += '<div style="height:4px;background:#334155;border-radius:2px;margin:4px 0;"><div style="width:' + cp + '%;height:100%;background:#38bdf8;border-radius:2px;"></div></div>';
                html += '<div style="font-size:10px;color:#64748b;">limiet: ' + c.limit_amps + 'A</div></div>';
            }
            html += '</div>';
        }

        // Charger list + inline edit
        html += '<div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">Laadpalen in groep:</div>';
        html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">';
        for (const cp of (g.chargers || [])) {
            html += '<span style="background:#064e3b;color:#6ee7b7;padding:2px 8px;border-radius:4px;font-size:11px;cursor:pointer;" onclick="removeFromGroup(' + "'" + gid + "','" + cp + "'" + ')">' + cp + ' \u00d7</span>';
        }
        html += '<select onchange="addToGroup(' + "'" + gid + "'" + ',this.value);this.value=' + "''" + ';" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:2px 6px;border-radius:4px;font-size:11px;">';
        html += '<option value="">+ toevoegen</option>';
        for (const cp of allChargers) {
            if (!(g.chargers || []).includes(cp)) html += '<option value="' + cp + '">' + cp + '</option>';
        }
        html += '</select></div>';

        // Inline config
        html += '<div style="display:flex;gap:8px;align-items:center;font-size:12px;">';
        html += '<label style="color:#94a3b8;">Max:</label><input type="number" value="' + g.max_amps + '" min="6" max="500" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:4px 8px;border-radius:4px;width:70px;font-size:12px;" onchange="updateGroupAmps(' + "'" + gid + "'" + ',parseInt(this.value))">';
        html += '<span style="color:#94a3b8;">A</span>';
        html += '<label style="color:#94a3b8;margin-left:12px;">Parent:</label>';
        html += '<select onchange="updateGroupParent(' + "'" + gid + "'" + ',this.value)" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:4px 8px;border-radius:4px;font-size:12px;">';
        html += '<option value="">Geen (root)</option>';
        for (const [oid] of Object.entries(lb.groups)) {
            if (oid !== gid) html += '<option value="' + oid + '"' + (g.parent === oid ? ' selected' : '') + '>' + (lb.groups[oid].name || oid) + '</option>';
        }
        html += '</select>';
        // Dynamic toggle (Tec-Tronic grid meter)
        const dynChecked = g.dynamic ? 'checked' : '';
        html += '<label style="color:#94a3b8;margin-left:12px;cursor:pointer;"><input type="checkbox" ' + dynChecked + ' onchange="updateGroupDynamic(' + "'" + gid + "'" + ',this.checked)" style="margin-right:4px;accent-color:#38bdf8;"> Dynamisch (Tec-Tronic)</label>';
        html += '</div>';

        // Grid meter info als dynamisch
        if (g.dynamic && g.grid_available) {
            html += '<div style="display:flex;gap:12px;margin-top:6px;font-size:11px;color:#64748b;">';
            html += '<span>Grid: <span style="color:#38bdf8;font-weight:600;">' + g.grid_available + 'A</span> beschikbaar</span>';
            if (g.grid_power_w) html += '<span>Verbruik: <span style="color:#fbbf24;">' + (g.grid_power_w/1000).toFixed(1) + ' kW</span></span>';
            html += '</div>';
        }

        html += '</div>';
    }

    // Grid meter overzicht
    const gridInfo = lb.grid || {};
    if (gridInfo.total_power_w !== undefined) {
        html += '<div style="background:#1e293b;border-radius:8px;padding:14px;border:1px solid #334155;margin-top:12px;">';
        html += '<div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:8px;">Tec-Tronic Grid Meter</div>';
        const gp = gridInfo.available_per_phase || {};
        html += '<div style="display:flex;gap:16px;flex-wrap:wrap;">';
        html += '<div><span style="color:#94a3b8;font-size:12px;">Totaal verbruik</span><div style="font-size:20px;font-weight:700;color:#38bdf8;">' + (gridInfo.total_power_w/1000).toFixed(1) + ' kW</div></div>';
        html += '<div><span style="color:#94a3b8;font-size:12px;">Stroom</span><div style="font-size:20px;font-weight:700;color:#fbbf24;">' + (gridInfo.total_current_a||0).toFixed(1) + ' A</div></div>';
        for (const [phase, amps] of Object.entries(gp)) {
            const c = amps < 20 ? '#f87171' : amps < 50 ? '#fbbf24' : '#34d399';
            html += '<div><span style="color:#94a3b8;font-size:12px;">' + phase + ' beschikbaar</span><div style="font-size:16px;font-weight:700;color:' + c + ';">' + amps + ' A</div></div>';
        }
        html += '</div>';
        html += '<canvas id="admin-grid-chart" style="width:100%;height:160px;margin-top:12px;"></canvas>';
        html += '</div>';
    }

    el.innerHTML = html;
    loadAdminGridChart();
}

async function loadAdminGridChart() {
    try {
        const resp = await fetch('/api/grid-history');
        const data = await resp.json();
        drawAdminGridChart(data);
    } catch(e) {}
}

function drawAdminGridChart(data) {
    const canvas = document.getElementById('admin-grid-chart');
    if (!canvas || !data || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    const pad = {top:15, right:10, bottom:25, left:45};
    const cw = w-pad.left-pad.right, ch = h-pad.top-pad.bottom;
    ctx.clearRect(0,0,w,h);
    const pts = data.map(d => ({t:new Date(d.created_at).getTime(), p:d.total_power_w||0}));
    const tMin=pts[0].t, tMax=pts[pts.length-1].t, tR=tMax-tMin||1;
    const maxP = Math.max(150000, ...pts.map(p=>p.p))*1.1;
    // Grid
    ctx.strokeStyle='#334155'; ctx.lineWidth=0.5; ctx.font='10px sans-serif'; ctx.fillStyle='#64748b'; ctx.textAlign='right';
    for(let i=0;i<=3;i++){const y=pad.top+(ch/3)*i;const v=maxP-(maxP/3)*i;ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(pad.left+cw,y);ctx.stroke();ctx.fillText(Math.round(v/1000)+'kW',pad.left-4,y+3);}
    // Time
    ctx.textAlign='center'; const hMs=3600000; const fh=Math.ceil(tMin/hMs)*hMs;
    for(let t=fh;t<=tMax;t+=hMs*3){const x=pad.left+((t-tMin)/tR)*cw;ctx.fillText(new Date(t).getHours()+':00',x,h-6);}
    // Line + fill
    ctx.beginPath();
    for(let i=0;i<pts.length;i++){const x=pad.left+((pts[i].t-tMin)/tR)*cw;const y=pad.top+ch-(pts[i].p/maxP)*ch;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
    ctx.strokeStyle='#38bdf8';ctx.lineWidth=1.5;ctx.stroke();
    ctx.lineTo(pad.left+cw,pad.top+ch);ctx.lineTo(pad.left,pad.top+ch);ctx.closePath();ctx.fillStyle='#38bdf810';ctx.fill();
    // Dot
    if(pts.length>0){const l=pts[pts.length-1];const x=pad.left+cw;const y=pad.top+ch-(l.p/maxP)*ch;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fillStyle='#38bdf8';ctx.fill();}
}

function showAddGroupForm() {
    document.getElementById('lb-add-form').style.display = 'block';
    // Populate parent dropdown
    const sel = document.getElementById('lb-new-parent');
    sel.innerHTML = '<option value="">Geen parent (root)</option>';
    const lb = (currentState.chargers || {})['_load_balancer'];
    if (lb && lb.groups) {
        for (const [gid, g] of Object.entries(lb.groups)) {
            sel.innerHTML += '<option value="' + gid + '">' + (g.name || gid) + '</option>';
        }
    }
}

async function addLBGroup() {
    const id = document.getElementById('lb-new-id').value.trim();
    const name = document.getElementById('lb-new-name').value.trim();
    const maxAmps = parseInt(document.getElementById('lb-new-max').value);
    const parent = document.getElementById('lb-new-parent').value;
    if (!id) { alert('Vul een groep ID in'); return; }
    await fetch('/api/lb/group', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, name: name||id, max_amps: maxAmps, parent: parent||null, chargers:[]}) });
    document.getElementById('lb-add-form').style.display = 'none';
    document.getElementById('lb-new-id').value = '';
    document.getElementById('lb-new-name').value = '';
}

async function deleteLBGroup(gid) {
    if (!confirm('Groep ' + gid + ' verwijderen?')) return;
    await fetch('/api/lb/group/' + gid, { method:'DELETE' });
}

async function addToGroup(gid, cpId) {
    if (!cpId) return;
    const lb = (currentState.chargers || {})['_load_balancer'];
    const chargers = (lb && lb.groups && lb.groups[gid]) ? [...(lb.groups[gid].chargers || [])] : [];
    if (!chargers.includes(cpId)) chargers.push(cpId);
    await fetch('/api/lb/group', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id: gid, chargers}) });
}

async function removeFromGroup(gid, cpId) {
    const lb = (currentState.chargers || {})['_load_balancer'];
    const chargers = (lb && lb.groups && lb.groups[gid]) ? (lb.groups[gid].chargers || []).filter(c => c !== cpId) : [];
    await fetch('/api/lb/group', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id: gid, chargers}) });
}

async function updateGroupAmps(gid, amps) {
    await fetch('/api/lb/group', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id: gid, max_amps: amps}) });
}

async function updateGroupDynamic(gid, dynamic) {
    await fetch('/api/lb/group', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id: gid, dynamic}) });
}

async function updateGroupParent(gid, parent) {
    await fetch('/api/lb/group', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id: gid, parent: parent||null}) });
}

let lastAnalysisData = null;

async function loadAnalysis(date) {
    const el = document.getElementById('analysis-content');
    el.innerHTML = '<div style="color:#64748b;padding:20px;">Laden...</div>';
    try {
        const url = date === 'live' ? '/api/analysis' : '/api/analysis/' + date;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.error) { el.innerHTML = '<div style="color:#f87171;">' + data.error + '</div>'; return; }
        lastAnalysisData = data;
        renderAnalysis(data);
    } catch(e) { el.innerHTML = '<div style="color:#f87171;">Fout: ' + e + '</div>'; }
}

async function saveAnalysis() {
    const btn = document.getElementById('btn-save-analysis');
    btn.textContent = 'Opslaan...';
    btn.disabled = true;
    try {
        const resp = await fetch('/api/analysis/save', {method: 'POST'});
        const result = await resp.json();
        if (result.ok) {
            btn.textContent = 'Opgeslagen!';
            setTimeout(() => { btn.textContent = 'Opslaan'; btn.disabled = false; }, 2000);
            loadAnalysisHistory();
        } else {
            btn.textContent = 'Fout!';
            setTimeout(() => { btn.textContent = 'Opslaan'; btn.disabled = false; }, 2000);
        }
    } catch(e) {
        btn.textContent = 'Fout!';
        setTimeout(() => { btn.textContent = 'Opslaan'; btn.disabled = false; }, 2000);
    }
}

function downloadAnalysis() {
    if (!lastAnalysisData) return;
    const d = lastAnalysisData;
    const s = d.summary || {};
    const date = s.period || new Date().toISOString().split('T')[0];

    let text = 'STABILITEITSANALYSE LAADPALEN\\n';
    text += '='.repeat(50) + '\\n';
    text += 'Datum: ' + date + '\\n';
    text += 'Palen: ' + s.total_chargers + ' | Online: ' + s.online + '\\n';
    text += 'Gem. score: ' + s.avg_score + '/100 | Uptime: ' + (s.avg_uptime_pct||0) + '%\\n';
    text += 'Connects: ' + s.total_connects + ' | Disconnects: ' + s.total_disconnects + '\\n';
    text += 'Totaal offline: ' + Math.floor((s.total_offline_min||0)/60) + ' uur\\n\\n';

    // Per charger
    text += 'PER LAADPAAL\\n';
    text += '-'.repeat(50) + '\\n';
    for (const cp of (d.chargers || [])) {
        const sc = scoreColor(cp.score);
        text += cp.cp_id + ' (' + (cp.vendor||'') + ' ' + (cp.model||'') + ')\\n';
        text += '  Score: ' + cp.score + '/100 | Uptime: ' + (cp.uptime_pct||0) + '%\\n';
        text += '  Connects: ' + cp.connects + ' | Disconnects: ' + cp.disconnects + '\\n';
        text += '  Heartbeats: ' + cp.heartbeats + ' | Status: ' + (cp.current_status||'?') + '\\n';
        if (cp.offline_minutes > 0) text += '  Offline: ' + cp.offline_minutes + ' min\\n';
        text += '\\n';
    }

    // Recommendations
    const recs = d.recommendations || [];
    if (recs.length > 0) {
        text += 'AANBEVELINGEN\\n';
        text += '-'.repeat(50) + '\\n';
        for (const r of recs) {
            text += '[' + r.severity.toUpperCase() + '] ' + r.title + '\\n';
            text += '  ' + r.detail + '\\n';
            if (r.affected) text += '  Betreft: ' + r.affected.join(', ') + '\\n';
            text += '\\n';
        }
    }

    // Backend stability
    const bs = d.backend_summary || {};
    if (Object.keys(bs).length > 0) {
        text += 'BACKEND STABILITEIT\\n';
        text += '-'.repeat(50) + '\\n';
        for (const [name, b] of Object.entries(bs)) {
            text += name + ': connects=' + b.total_connects + ' disconnects=' + b.total_disconnects + ' reconnects=' + b.total_reconnects + '\\n';
        }
        text += '\\n';
    }

    const blob = new Blob([text], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stabiliteitsanalyse_' + date + '.txt';
    a.click();
    URL.revokeObjectURL(url);
}

async function loadAnalysisHistory() {
    const sel = document.getElementById('analysis-date');
    sel.innerHTML = '<option value="live">Live (24u)</option>';
    try {
        const resp = await fetch('/api/analysis/history');
        const history = await resp.json();
        for (const h of history) { sel.innerHTML += '<option value="' + h.date + '">' + h.date + '</option>'; }
    } catch(e) {}
}

// E-Flux Maintenance
let efluxData = [];
let evintyData = [];
let efluxSelectedCp = null;

async function loadEfluxChargers() {
    try {
        const resp = await fetch('/api/eflux/chargers');
        const result = await resp.json();
        if (!result.error) efluxData = result.data || [];
        renderEfluxStats();
        filterEfluxTab();
        renderChargers(currentState);
    } catch(e) {}
}

async function refreshEfluxTab() {
    const el = document.getElementById('eflux-charger-list');
    if (el) el.innerHTML = '<div style="color:#64748b;padding:10px;">Laden...</div>';
    await loadEfluxChargers();
}

function renderEfluxStats() {
    const el = document.getElementById('eflux-stats');
    if (!el) return;
    const total = efluxData.length;
    let online = 0, offline = 0, charging = 0;
    for (const cp of efluxData) {
        const isOnline = cp.connectivityState === 'connected';
        if (isOnline) online++; else offline++;
        const cs = cp.connectorStatus || {};
        if (Object.values(cs).some(c => c.status === 'Charging' || c.status === 'Occupied')) charging++;
    }
    el.innerHTML = '<div class="stat"><div class="label">Totaal</div><div class="value blue">' + total + '</div></div>' +
        '<div class="stat"><div class="label">Online</div><div class="value green">' + online + '</div></div>' +
        '<div class="stat"><div class="label">Offline</div><div class="value red">' + offline + '</div></div>' +
        '<div class="stat"><div class="label">Laden</div><div class="value blue">' + charging + '</div></div>';
}

function filterEfluxTab() {
    const searchEl = document.getElementById('eflux-search');
    const search = searchEl ? searchEl.value.toLowerCase() : '';
    let filtered = efluxData;
    if (search) {
        filtered = filtered.filter(cp => {
            const ocpp = (cp.ocppIdentity || '').toLowerCase();
            const evseId = (cp.evseId || '').toLowerCase();
            const loc = ((cp.location || {}).name || '').toLowerCase();
            const addr = ((cp.location || {}).address || '').toLowerCase();
            return ocpp.includes(search) || evseId.includes(search) || loc.includes(search) || addr.includes(search);
        });
    }
    renderEfluxTabList(filtered);
}

function renderEfluxTabList(chargers) {
    const el = document.getElementById('eflux-charger-list');
    if (!el) return;
    if (!chargers || chargers.length === 0) { el.innerHTML = '<div style="color:#64748b;padding:10px;">Geen laadpalen gevonden</div>'; return; }
    let html = '';
    for (const cp of chargers) {
        const ocpp = cp.ocppIdentity || '?';
        const cpId = cp.id || cp._id || '';
        const isOnline = cp.connectivityState === 'connected';
        const isSelected = efluxSelectedCp === cpId;
        const bg = isSelected ? '#334155' : '#1e293b';
        const border = isSelected ? '#a78bfa' : '#334155';
        html += '<div onclick="selectEfluxCp(' + "'" + cpId + "'" + ')" style="cursor:pointer;background:' + bg + ';border:1px solid ' + border + ';border-left:3px solid ' + (isOnline ? '#a78bfa' : '#64748b') + ';border-radius:6px;padding:10px;margin-bottom:6px;transition:all 0.15s;">';
        html += '<div style="font-size:13px;font-weight:600;color:#f1f5f9;font-family:monospace;">' + escapeHtml(ocpp) + '</div>';
        html += '<div style="font-size:11px;color:' + (isOnline ? '#34d399' : '#64748b') + ';">' + (isOnline ? 'Online' : 'Offline') + '</div>';
        if ((cp.location||{}).name) html += '<div style="font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(cp.location.name) + '</div>';
        html += '</div>';
    }
    html += '<div style="color:#64748b;font-size:11px;margin-top:8px;">' + chargers.length + ' van ' + efluxData.length + '</div>';
    el.innerHTML = html;
}

function selectEfluxCp(cpId) {
    efluxSelectedCp = cpId;
    filterEfluxTab();
    const cp = efluxData.find(c => (c.id || c._id) === cpId);
    if (!cp) return;
    const panel = document.getElementById('eflux-cmd-panel');
    const ocpp = cp.ocppIdentity || '?';
    const loc = cp.location || {};
    const hb = cp.heartbeatReceivedAt ? new Date(cp.heartbeatReceivedAt).toLocaleString('nl-NL') : '-';
    const isOnline = cp.connectivityState === 'connected';

    let html = '<div style="margin-bottom:16px;">';
    html += '<div style="font-size:16px;font-weight:700;color:#f1f5f9;font-family:monospace;margin-bottom:4px;">' + escapeHtml(ocpp) + ' ';
    html += isOnline ? '<span class="badge online">ONLINE</span>' : '<span class="badge offline">OFFLINE</span>';
    html += '</div>';
    if (cp.evseId) html += '<div style="font-size:12px;color:#94a3b8;">EVSE: ' + escapeHtml(cp.evseId) + '</div>';
    if (loc.name) html += '<div style="font-size:13px;color:#e2e8f0;margin-top:4px;">' + escapeHtml(loc.name) + '</div>';
    if (loc.address || loc.city) html += '<div style="font-size:12px;color:#64748b;">' + escapeHtml([loc.address, loc.city].filter(Boolean).join(', ')) + '</div>';
    html += '<div style="font-size:11px;color:#64748b;margin-top:4px;">Heartbeat: ' + hb + '</div>';

    // Connectors
    const cs = cp.connectorStatus || {};
    if (Object.keys(cs).length > 0) {
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">';
        for (const [key, c] of Object.entries(cs)) {
            const cStatus = c.status || '?';
            const cColor = cStatus === 'Available' ? '#34d399' : cStatus === 'Charging' || cStatus === 'Occupied' ? '#38bdf8' : cStatus === 'Faulted' ? '#f87171' : '#64748b';
            html += '<span style="font-size:11px;padding:3px 8px;border-radius:4px;background:' + cColor + '15;border:1px solid ' + cColor + '33;color:' + cColor + ';">C' + (key.length > 4 ? key.slice(-4) : key) + ': ' + cStatus + '</span>';
        }
        html += '</div>';
    }
    html += '</div>';

    // Command form
    html += '<div style="border-top:1px solid #334155;padding-top:16px;">';
    html += '<h4 style="color:#a78bfa;margin-bottom:12px;">OCPP Commando</h4>';
    html += '<select id="eflux-tab-method" onchange="efluxTabUpdateParams()" style="width:100%;background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:8px 12px;border-radius:6px;font-size:13px;margin-bottom:10px;">';
    html += '<option value="Reset">Reset</option><option value="ChangeConfiguration">ChangeConfiguration</option><option value="GetConfiguration">GetConfiguration</option>';
    html += '<option value="RemoteStartTransaction">RemoteStartTransaction</option><option value="TriggerMessage">TriggerMessage</option><option value="UnlockConnector">UnlockConnector</option></select>';
    html += '<textarea id="eflux-tab-params" rows="3" style="width:100%;background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:8px 12px;border-radius:6px;font-size:13px;margin-bottom:10px;font-family:monospace;resize:vertical;">{"type": "Soft"}</textarea>';
    html += '<button onclick="efluxTabSendCommand(' + "'" + cpId + "'" + ')" style="width:100%;background:#2563eb;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;">Verstuur</button>';
    html += '<div id="eflux-tab-output" style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:12px;font-family:monospace;font-size:12px;white-space:pre-wrap;min-height:60px;margin-top:10px;color:#94a3b8;">Wacht op commando...</div>';
    html += '</div>';

    panel.innerHTML = html;
}

function efluxTabUpdateParams() {
    const method = document.getElementById('eflux-tab-method').value;
    const defaults = {
        'Reset': '{"type": "Soft"}',
        'ChangeConfiguration': '{"key": "HeartbeatInterval", "value": "300"}',
        'GetConfiguration': '{}',
        'RemoteStartTransaction': '{"connectorId": 1, "idTag": "REMOTE"}',
        'TriggerMessage': '{"requestedMessage": "StatusNotification"}',
        'UnlockConnector': '{"connectorId": 1}',
    };
    document.getElementById('eflux-tab-params').value = defaults[method] || '{}';
}

async function efluxTabSendCommand(cpId) {
    const method = document.getElementById('eflux-tab-method').value;
    const output = document.getElementById('eflux-tab-output');
    let params;
    try { params = JSON.parse(document.getElementById('eflux-tab-params').value); }
    catch(e) { output.textContent = 'Ongeldige JSON: ' + e; output.style.color = '#f87171'; return; }
    output.textContent = 'Versturen...';
    output.style.color = '#94a3b8';
    try {
        const resp = await fetch('/api/eflux/command', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({cp_id: cpId, method: method, params: params}),
        });
        const data = await resp.json();
        if (data.error) { output.textContent = 'Error: ' + data.error; output.style.color = '#f87171'; }
        else { output.textContent = JSON.stringify(data, null, 2); output.style.color = '#34d399'; }
    } catch(e) { output.textContent = 'Error: ' + e; output.style.color = '#f87171'; }
}

// Legacy filterEflux removed — E-Flux chargers now shown in Laadpalen tab

function scoreColor(score) {
    if (score >= 70) return '#34d399';
    if (score >= 40) return '#fbbf24';
    return '#f87171';
}

function scoreBar(score) {
    const color = scoreColor(score);
    return '<div style="display:flex;align-items:center;gap:8px;"><div style="width:60px;height:8px;background:#0f172a;border-radius:4px;overflow:hidden;"><div style="width:' + score + '%;height:100%;background:' + color + ';border-radius:4px;"></div></div><span style="color:' + color + ';font-weight:700;font-size:13px;">' + score + '</span></div>';
}

function renderAnalysis(data) {
    const el = document.getElementById('analysis-content');
    const s = data.summary || {};
    let html = '';

    // Summary cards
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">';
    html += '<div class="stat"><div class="label">Palen</div><div class="value blue">' + s.total_chargers + '</div></div>';
    html += '<div class="stat"><div class="label">Online nu</div><div class="value green">' + s.online + '</div></div>';
    html += '<div class="stat"><div class="label">Gem. score</div><div class="value" style="color:' + scoreColor(s.avg_score) + '">' + s.avg_score + '/100</div></div>';
    html += '<div class="stat"><div class="label">Gem. uptime</div><div class="value" style="color:' + (s.avg_uptime_pct >= 80 ? '#34d399' : s.avg_uptime_pct >= 50 ? '#fbbf24' : '#f87171') + '">' + (s.avg_uptime_pct||0) + '%</div></div>';
    html += '<div class="stat"><div class="label">Connects</div><div class="value blue">' + s.total_connects + '</div></div>';
    html += '<div class="stat"><div class="label">Disconnects</div><div class="value red">' + s.total_disconnects + '</div></div>';
    const totalOffH = Math.floor((s.total_offline_min||0)/60);
    html += '<div class="stat"><div class="label">Totaal offline</div><div class="value red">' + totalOffH + 'u</div></div>';
    html += '<div class="stat"><div class="label">Heartbeats</div><div class="value green">' + s.total_heartbeats + '</div></div>';
    html += '</div>';

    // Backend stability
    const bs = data.backend_summary || {};
    if (Object.keys(bs).length > 0) {
        html += '<h3 style="color:#38bdf8;margin:20px 0 12px;">Backend stabiliteit</h3>';
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:20px;">';
        for (const [name, b] of Object.entries(bs)) {
            if (b.total_connects === 0 && b.total_disconnects === 0) continue;
            const bRatio = b.total_connects > 0 ? (b.total_disconnects / b.total_connects).toFixed(2) : 0;
            const bColor = bRatio < 0.3 ? '#34d399' : bRatio < 0.7 ? '#fbbf24' : '#f87171';
            html += '<div style="background:#1e293b;border-radius:8px;padding:14px;border:1px solid #334155;">';
            html += '<div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:8px;">' + name + '</div>';
            html += '<div style="font-size:12px;color:#94a3b8;">Connects: <span style="color:#34d399;font-weight:600;">' + b.total_connects + '</span></div>';
            html += '<div style="font-size:12px;color:#94a3b8;">Disconnects: <span style="color:#f87171;font-weight:600;">' + b.total_disconnects + '</span></div>';
            html += '<div style="font-size:12px;color:#94a3b8;">Reconnects: <span style="color:#fbbf24;font-weight:600;">' + b.total_reconnects + '</span></div>';
            html += '<div style="font-size:12px;color:#94a3b8;margin-top:4px;">Ratio: <span style="color:' + bColor + ';font-weight:700;">' + bRatio + '</span></div>';
            html += '</div>';
        }
        html += '</div>';
    }

    // Recommendations
    const recs = data.recommendations || [];
    if (recs.length > 0) {
        html += '<h3 style="color:#38bdf8;margin:20px 0 12px;">Aanbevelingen</h3>';
        for (const r of recs) {
            const sevColor = r.severity === 'high' ? '#f87171' : r.severity === 'medium' ? '#fbbf24' : '#94a3b8';
            const sevBg = r.severity === 'high' ? '#7f1d1d20' : r.severity === 'medium' ? '#78350f20' : '#33415520';
            const icon = r.type === 'firmware' ? '\u2b06' : r.type === 'hardware' ? '\u26a0' : r.type === 'stability' ? '\u26a1' : r.type === 'config' ? '\u2699' : '\u26ab';
            html += '<div style="background:' + sevBg + ';border:1px solid ' + sevColor + '33;border-left:3px solid ' + sevColor + ';border-radius:6px;padding:12px 16px;margin-bottom:10px;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
            html += '<div style="font-weight:700;color:' + sevColor + ';font-size:14px;">' + icon + ' ' + escapeHtml(r.title) + '</div>';
            html += '<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:' + sevColor + '22;color:' + sevColor + ';font-weight:600;">' + r.severity.toUpperCase() + '</span>';
            html += '</div>';
            html += '<div style="color:#94a3b8;font-size:13px;margin-top:6px;">' + escapeHtml(r.detail) + '</div>';
            if (r.affected && r.affected.length > 0) {
                html += '<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">';
                for (const id of r.affected) {
                    html += '<span style="background:#1e293b;padding:2px 8px;border-radius:4px;font-size:11px;color:#e2e8f0;font-family:monospace;">' + id + '</span>';
                }
                html += '</div>';
            }
            html += '</div>';
        }
    }

    // Firmware analysis per vendor
    html += '<h3 style="color:#38bdf8;margin:20px 0 12px;">Firmware per type</h3>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:20px;">';
    for (const fw of (data.firmware_analysis || [])) {
        const c = scoreColor(fw.avg_score);
        html += '<div style="background:#1e293b;border-radius:8px;padding:14px;border:1px solid #334155;">';
        html += '<div style="font-size:11px;color:#64748b;">' + (fw.vendor||'?') + ' ' + (fw.model||'') + '</div>';
        html += '<div style="font-size:13px;font-weight:700;color:#f1f5f9;margin:4px 0;">' + fw.firmware + '</div>';
        html += '<div style="font-size:28px;font-weight:800;color:' + c + ';">' + fw.avg_score + '<span style="font-size:14px;color:#64748b;">/100</span></div>';
        html += '<div style="font-size:12px;color:#94a3b8;margin-top:4px;">' + fw.count + ' palen | ratio ' + fw.avg_ratio + '</div>';
        html += '</div>';
    }
    html += '</div>';

    // Comparable firmware groups (only same vendor)
    const cg = data.comparable_groups || {};
    if (Object.keys(cg).length > 0) {
        html += '<h3 style="color:#38bdf8;margin:20px 0 12px;">Firmware vergelijking (zelfde type)</h3>';
        for (const [vendor, fws] of Object.entries(cg)) {
            html += '<div style="background:#1e293b;border-radius:8px;padding:16px;border:1px solid #334155;margin-bottom:12px;">';
            html += '<div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:12px;">' + vendor + ' — ' + fws.length + ' firmware versies</div>';
            html += '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">';
            for (let i = 0; i < fws.length; i++) {
                const fw = fws[i];
                const c = scoreColor(fw.avg_score);
                const best = i === 0;
                html += '<div style="text-align:center;min-width:120px;' + (best ? 'border:2px solid #34d399;border-radius:8px;padding:10px;' : 'padding:10px;') + '">';
                if (best) html += '<div style="font-size:10px;color:#34d399;font-weight:600;margin-bottom:4px;">BESTE</div>';
                html += '<div style="font-size:12px;color:#94a3b8;">' + fw.firmware + '</div>';
                html += '<div style="font-size:32px;font-weight:800;color:' + c + ';">' + fw.avg_score + '</div>';
                html += '<div style="font-size:11px;color:#64748b;">' + fw.count + ' palen | ' + fw.avg_ratio + ' ratio</div>';
                html += '</div>';
                if (i < fws.length - 1) html += '<div style="font-size:20px;color:#64748b;align-self:center;">vs</div>';
            }
            html += '</div></div>';
        }
    }

    // Disconnect reasons
    const reasons = data.top_disconnect_reasons || {};
    const hwErrors = data.top_hw_errors || {};
    if (Object.keys(reasons).length > 0 || Object.keys(hwErrors).length > 0) {
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">';
        html += '<div style="background:#1e293b;border-radius:8px;padding:14px;border:1px solid #334155;">';
        html += '<div style="font-size:14px;font-weight:600;color:#f1f5f9;margin-bottom:10px;">Disconnect redenen</div>';
        for (const [reason, count] of Object.entries(reasons)) {
            const label = reason === 'ping_timeout' ? 'Ping timeout' : reason === 'protocol_error' ? 'Protocol error' : reason === 'no_close_frame' ? 'Geen close frame' : reason;
            html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span style="color:#94a3b8;">' + label + '</span><span style="color:#f87171;font-weight:600;">' + count + 'x</span></div>';
        }
        html += '</div>';
        html += '<div style="background:#1e293b;border-radius:8px;padding:14px;border:1px solid #334155;">';
        html += '<div style="font-size:14px;font-weight:600;color:#f1f5f9;margin-bottom:10px;">Hardware errors</div>';
        for (const [err, count] of Object.entries(hwErrors)) {
            html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span style="color:#94a3b8;">' + err + '</span><span style="color:#fbbf24;font-weight:600;">' + count + 'x</span></div>';
        }
        html += '</div></div>';
    }

    // Charger ranking table
    html += '<h3 style="color:#38bdf8;margin:20px 0 12px;">Ranking per laadpaal</h3>';
    html += '<div style="background:#1e293b;border-radius:8px;padding:4px;border:1px solid #334155;overflow-x:auto;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr style="border-bottom:1px solid #334155;"><th style="text-align:left;padding:10px;color:#94a3b8;">#</th><th style="text-align:left;padding:10px;color:#94a3b8;">Laadpaal</th><th style="text-align:left;padding:10px;color:#94a3b8;">Firmware</th><th style="text-align:left;padding:10px;color:#94a3b8;">Score</th><th style="text-align:right;padding:10px;color:#94a3b8;">Uptime</th><th style="text-align:center;padding:10px;color:#94a3b8;">Status</th><th style="text-align:right;padding:10px;color:#94a3b8;">Conn</th><th style="text-align:right;padding:10px;color:#94a3b8;">Disc</th><th style="text-align:right;padding:10px;color:#94a3b8;">Gem. sessie</th><th style="text-align:right;padding:10px;color:#94a3b8;">Offline</th><th style="text-align:left;padding:10px;color:#94a3b8;">Backends</th><th style="text-align:left;padding:10px;color:#94a3b8;">Problemen</th></tr></thead><tbody>';
    let rank = 0;
    for (const ch of (data.chargers || [])) {
        rank++;
        const online = ch.connected ? '<span class="badge online">ON</span>' : '<span class="badge offline">OFF</span>';
        let problems = [];
        for (const [err, count] of Object.entries(ch.hw_errors || {})) { problems.push(err + '(' + count + ')'); }
        const fw_color = ch.firmware.includes('R18') ? '#34d399' : ch.firmware.includes('P0140') ? '#60a5fa' : '#e2e8f0';
        const uptimeColor = ch.uptime_pct >= 80 ? '#34d399' : ch.uptime_pct >= 50 ? '#fbbf24' : '#f87171';
        const avgSess = ch.avg_session_min >= 60 ? Math.floor(ch.avg_session_min/60) + 'u' + (ch.avg_session_min%60) + 'm' : (ch.avg_session_min||0) + 'm';
        const offlineStr = ch.offline_min >= 60 ? Math.floor(ch.offline_min/60) + 'u' + (ch.offline_min%60) + 'm' : (ch.offline_min||0) + 'm';
        // Backend badges
        let beBadges = '';
        for (const [bName, bData] of Object.entries(ch.backends || {})) {
            const bColor = bData.ratio < 0.3 ? '#065f46' : bData.ratio < 0.7 ? '#78350f' : '#7f1d1d';
            const bText = bData.ratio < 0.3 ? '#34d399' : bData.ratio < 0.7 ? '#fbbf24' : '#f87171';
            beBadges += '<span style="background:' + bColor + ';color:' + bText + ';padding:1px 6px;border-radius:3px;font-size:10px;margin-right:3px;">' + bName.substring(0,4) + ' ' + bData.ratio + '</span>';
        }
        html += '<tr style="border-bottom:1px solid #1e293b44;"><td style="padding:8px;color:#64748b;">' + rank + '</td>';
        html += '<td style="padding:8px;font-weight:600;">' + ch.cp_id + '</td>';
        html += '<td style="padding:8px;color:' + fw_color + ';font-size:12px;">' + ch.firmware + '</td>';
        html += '<td style="padding:8px;">' + scoreBar(ch.score) + '</td>';
        html += '<td style="padding:8px;text-align:right;color:' + uptimeColor + ';font-weight:600;">' + (ch.uptime_pct||0) + '%</td>';
        html += '<td style="padding:8px;text-align:center;">' + online + '</td>';
        html += '<td style="padding:8px;text-align:right;">' + ch.connects + '</td>';
        html += '<td style="padding:8px;text-align:right;color:#f87171;">' + ch.disconnects + '</td>';
        html += '<td style="padding:8px;text-align:right;color:#94a3b8;">' + avgSess + '</td>';
        html += '<td style="padding:8px;text-align:right;color:#fbbf24;">' + offlineStr + '</td>';
        html += '<td style="padding:8px;">' + (beBadges || '-') + '</td>';
        html += '<td style="padding:8px;font-size:11px;color:#fbbf24;">' + (problems.join(', ') || '-') + '</td></tr>';
    }
    html += '</tbody></table></div>';

    // Timestamp
    html += '<div style="margin-top:16px;font-size:11px;color:#64748b;">Analyse: ' + (data.timestamp || '?') + ' | Periode: ' + (data.period || '?') + '</div>';

    el.innerHTML = html;
}

let alertPanelOpen = false;
let lastAlertCount = 0;

function toggleAlertPanel() {
    alertPanelOpen = !alertPanelOpen;
    document.getElementById('alert-panel').style.display = alertPanelOpen ? 'flex' : 'none';
}

async function pollAlerts() {
    try {
        // Get DB alerts
        const resp = await fetch('/api/db/alerts');
        const dbAlerts = await resp.json();

        // Generate local alerts from current state
        const localAlerts = [];
        const chargers = currentState.chargers || {};
        const now = Date.now();

        for (const [id, c] of Object.entries(chargers)) {
            if (id.startsWith('_')) continue;

            // Offline > 30 min
            if (!c.connected && c.last_heartbeat) {
                const offMs = now - new Date(c.last_heartbeat).getTime();
                if (offMs > 30 * 60000) {
                    const mins = Math.round(offMs / 60000);
                    localAlerts.push({severity:'medium', cp_id:id, alert_type:'offline',
                        message: id + ' offline sinds ' + mins + ' min', created_at: c.last_heartbeat});
                }
            }

            // Quarantine
            if (c.quarantine && c.quarantine.active) {
                localAlerts.push({severity:'high', cp_id:id, alert_type:'quarantine',
                    message: id + ': ' + (c.quarantine.reason || 'In quarantaine'), created_at: null});
            }

            // Hardware errors from connectors
            const conns = c.connectors || {};
            for (const [cid, conn] of Object.entries(conns)) {
                if (conn.error_code && conn.error_code !== 'NoError') {
                    localAlerts.push({severity:'high', cp_id:id, alert_type:conn.error_code,
                        message: id + ' C' + cid + ': ' + conn.error_code, created_at: conn.timestamp});
                }
            }
        }

        // Massale uitval
        const online = Object.entries(chargers).filter(([k,v]) => !k.startsWith('_') && v.connected).length;
        const total = Object.entries(chargers).filter(([k,v]) => !k.startsWith('_')).length;
        if (total > 0 && online / total < 0.5) {
            localAlerts.unshift({severity:'high', cp_id:null, alert_type:'mass_offline',
                message: 'Massale uitval: ' + online + '/' + total + ' online (' + Math.round(online/total*100) + '%)', created_at: new Date().toISOString()});
        }

        const allAlerts = [...localAlerts, ...dbAlerts.map(a => ({...a, fromDb: true}))];

        // Update bell
        const count = allAlerts.length;
        const countEl = document.getElementById('alert-count');
        const bellEl = document.querySelector('.alert-bell');
        if (count > 0) {
            countEl.style.display = 'flex';
            countEl.textContent = count;
            bellEl.classList.add('has-alerts');
            if (count > lastAlertCount) {
                bellEl.querySelector('svg').style.animation = 'none';
                setTimeout(() => bellEl.querySelector('svg').style.animation = '', 10);
            }
        } else {
            countEl.style.display = 'none';
            bellEl.classList.remove('has-alerts');
        }
        lastAlertCount = count;

        // Render alert list
        const list = document.getElementById('alert-list');
        if (allAlerts.length === 0) {
            list.innerHTML = '<div class="alert-empty">Geen meldingen</div>';
            return;
        }
        let html = '';
        for (const a of allAlerts) {
            const ts = a.created_at ? new Date(a.created_at).toLocaleString('nl-NL', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
            const icon = a.alert_type === 'offline' ? '\u26ab' : a.alert_type === 'quarantine' ? '\u26d4' : a.alert_type === 'mass_offline' ? '\u26a0' : '\u26a1';
            html += '<div class="alert-item ' + (a.severity || 'medium') + '">';
            html += '<div class="alert-title">' + icon + ' ' + escapeHtml(a.message) + '</div>';
            if (a.alert_type && a.alert_type !== 'offline') html += '<div class="alert-detail">' + a.alert_type + '</div>';
            if (ts) html += '<div class="alert-time">' + ts + '</div>';
            html += '</div>';
        }
        list.innerHTML = html;
    } catch(e) {}
}

// Knowledge Base
async function loadKnowledge() {
    const el = document.getElementById('kb-content');
    try {
        const resp = await fetch('/api/knowledge');
        const items = await resp.json();
        const cats = {};
        for (const item of items) {
            const cat = item.category || 'overig';
            if (!cats[cat]) cats[cat] = [];
            cats[cat].push(item);
        }
        const catIcons = {verbinding: 'V', loadbalance: 'LB', hardware: 'HW', overig: '?'};
        const catColors = {verbinding: '#38bdf8', loadbalance: '#fbbf24', hardware: '#f87171', overig: '#94a3b8'};
        let html = '';
        for (const [cat, items2] of Object.entries(cats)) {
            html += '<div style="margin-bottom:24px;">';
            html += '<h4 style="color:' + (catColors[cat]||'#94a3b8') + ';margin-bottom:12px;text-transform:uppercase;letter-spacing:1px;font-size:13px;">' + (catIcons[cat]||'') + ' ' + cat + ' (' + items2.length + ')</h4>';
            for (const item of items2) {
                html += '<div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:8px;border:1px solid #334155;">';
                html += '<div style="font-weight:600;color:#f1f5f9;font-size:14px;margin-bottom:6px;">' + escapeHtml(item.title) + '</div>';
                html += '<div style="color:#94a3b8;font-size:12px;margin-bottom:8px;">' + escapeHtml(item.description) + '</div>';
                html += '<div style="background:#0f172a;border-radius:6px;padding:10px;font-size:12px;color:#34d399;margin-bottom:6px;"><strong style="color:#22c55e;">Oplossing:</strong> ' + escapeHtml(item.solution) + '</div>';
                if (item.affected_models) html += '<div style="font-size:11px;color:#64748b;">Betreft: ' + escapeHtml(item.affected_models) + '</div>';
                html += '</div>';
            }
            html += '</div>';
        }
        el.innerHTML = html;
    } catch(e) {
        el.innerHTML = '<div style="color:#f87171;">Fout: ' + e + '</div>';
    }
}

// Software tab
let swActivePanel = 'ecc';
let psHistory = [];
let psHistoryIdx = -1;

function initSoftwareTab() {
    const sel = document.getElementById('sw-charger');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '';
    const chargers = currentState.chargers || {};
    for (const [id, c] of Object.entries(chargers)) {
        if (id.startsWith('_')) continue;
        if (!c.connected) continue;
        const label = id + ' (' + (c.vendor || '?') + ' ' + (c.model || '') + ')';
        sel.innerHTML += '<option value="' + id + '"' + (id === prev ? ' selected' : '') + '>' + label + '</option>';
    }
    swToolChanged();
    if (swActivePanel === 'ecc' && !document.getElementById('ecc-frame').src.includes('eccmanager')) {
        loadEccManager();
    }
}

function loadEccManager() {
    const sel = document.getElementById('sw-charger');
    const cpId = sel ? sel.value : '';
    const frame = document.getElementById('ecc-frame');
    if (frame) frame.src = '/tools/eccmanager?cp=' + cpId;
}

function swShowPanel(panel) {
    swActivePanel = panel;
    const panels = ['ecc', 'ps', 'putty'];
    for (const p of panels) {
        const el = document.getElementById('sw-panel-' + p);
        const btn = document.getElementById('sw-btn-' + p);
        if (el) el.style.display = p === panel ? (p === 'ecc' ? 'block' : 'flex') : 'none';
        if (btn) { btn.style.background = p === panel ? '#2563eb' : '#334155'; btn.style.color = p === panel ? 'white' : '#94a3b8'; }
    }
    if (panel === 'ecc') loadEccManager();
    if (panel === 'ps') {
        swToolChanged();
        const inp = document.getElementById('ps-input');
        if (inp) setTimeout(() => inp.focus(), 100);
        if (!document.getElementById('ps-output').innerHTML) psWelcome();
    }
    if (panel === 'putty') puttyConnect();
}

function swToolChanged() {
    const sel = document.getElementById('sw-charger');
    const cpId = sel ? sel.value : '';
    document.getElementById('ps-prompt-cp').textContent = cpId || '?';
    document.getElementById('ps-charger-label').textContent = cpId ? ('Verbonden met ' + cpId) : 'Geen laadpaal geselecteerd';
    if (swActivePanel === 'ecc') loadEccManager();
}

function psWrite(html) {
    const out = document.getElementById('ps-output');
    out.innerHTML += html;
    out.scrollTop = out.scrollHeight;
}

function psClear() {
    document.getElementById('ps-output').innerHTML = '';
    psWelcome();
}

function psWelcome() {
    const cpId = document.getElementById('sw-charger')?.value || '?';
    psWrite('<span style="color:#3b82f6;">OCPP PowerShell Terminal v1.0</span>\\n');
    psWrite('<span style="color:#808080;">Verbonden met laadpaal: </span><span style="color:#22c55e;">' + cpId + '</span>\\n');
    psWrite('<span style="color:#808080;">Type </span><span style="color:#ffff00;">help</span><span style="color:#808080;"> voor beschikbare commando\\'s.</span>\\n\\n');
}

const PS_COMMANDS = {
    'help': {desc: 'Toon beschikbare commando\\'s', usage: 'help'},
    'status': {desc: 'Toon connector status', usage: 'status'},
    'config': {desc: 'Haal configuratie op', usage: 'config [key]'},
    'set': {desc: 'Wijzig configuratie', usage: 'set <key> <value>'},
    'reset': {desc: 'Reset laadpaal', usage: 'reset [soft|hard]'},
    'trigger': {desc: 'Trigger een bericht', usage: 'trigger <StatusNotification|MeterValues|Heartbeat|BootNotification|DiagnosticsStatusNotification|FirmwareStatusNotification>'},
    'unlock': {desc: 'Ontgrendel connector', usage: 'unlock <connector_id>'},
    'start': {desc: 'Start laadsessie', usage: 'start <connector_id> <idTag>'},
    'stop': {desc: 'Stop laadsessie', usage: 'stop <transaction_id>'},
    'firmware': {desc: 'Update firmware', usage: 'firmware <url>'},
    'info': {desc: 'Toon laadpaal info uit state', usage: 'info'},
    'clear': {desc: 'Wis terminal', usage: 'clear'},
};

function psKeyDown(e) {
    if (e.key === 'Enter') {
        const inp = document.getElementById('ps-input');
        const cmd = inp.value.trim();
        inp.value = '';
        if (cmd) {
            psHistory.unshift(cmd);
            psHistoryIdx = -1;
            psExec(cmd);
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (psHistoryIdx < psHistory.length - 1) {
            psHistoryIdx++;
            document.getElementById('ps-input').value = psHistory[psHistoryIdx];
        }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (psHistoryIdx > 0) {
            psHistoryIdx--;
            document.getElementById('ps-input').value = psHistory[psHistoryIdx];
        } else {
            psHistoryIdx = -1;
            document.getElementById('ps-input').value = '';
        }
    } else if (e.key === 'Tab') {
        e.preventDefault();
        const inp = document.getElementById('ps-input');
        const partial = inp.value.trim().toLowerCase();
        if (partial) {
            const matches = Object.keys(PS_COMMANDS).filter(c => c.startsWith(partial));
            if (matches.length === 1) inp.value = matches[0] + ' ';
            else if (matches.length > 1) psWrite('<span style="color:#808080;">' + matches.join('  ') + '</span>\\n');
        }
    }
}

async function psExec(cmdLine) {
    const cpId = document.getElementById('sw-charger')?.value;
    const prompt = 'PS OCPP:\\\\' + (cpId || '?') + '&gt; ';
    psWrite('<span style="color:#ffff00;">' + prompt + '</span><span style="color:#cccccc;">' + cmdLine.replace(/</g,'&lt;') + '</span>\\n');

    const parts = cmdLine.split(/\\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (!cpId) {
        psWrite('<span style="color:#f87171;">Fout: Geen laadpaal geselecteerd. Kies een laadpaal bovenaan.</span>\\n\\n');
        return;
    }

    try {
        switch(cmd) {
            case 'help':
                psWrite('<span style="color:#3b82f6;">Beschikbare commando\\'s:</span>\\n');
                for (const [name, info] of Object.entries(PS_COMMANDS)) {
                    psWrite('  <span style="color:#22c55e;">' + name.padEnd(12) + '</span><span style="color:#808080;">' + info.desc + '</span>\\n');
                    psWrite('  <span style="color:#94a3b8;">            ' + info.usage + '</span>\\n');
                }
                psWrite('\\n');
                break;

            case 'clear':
                psClear();
                return;

            case 'info': {
                const state = currentState.chargers?.[cpId];
                if (!state) { psWrite('<span style="color:#f87171;">Laadpaal niet gevonden in state.</span>\\n\\n'); break; }
                psWrite('<span style="color:#3b82f6;">Laadpaal Info:</span>\\n');
                psWrite('  Vendor:      <span style="color:#22c55e;">' + (state.vendor||'?') + '</span>\\n');
                psWrite('  Model:       <span style="color:#22c55e;">' + (state.model||'?') + '</span>\\n');
                psWrite('  Firmware:    <span style="color:#22c55e;">' + (state.firmware||'?') + '</span>\\n');
                psWrite('  Connected:   <span style="color:#22c55e;">' + (state.connected?'Ja':'Nee') + '</span>\\n');
                psWrite('  Source IP:   <span style="color:#22c55e;">' + (state.source_ip||'?') + '</span>\\n');
                psWrite('  Last HB:     <span style="color:#22c55e;">' + (state.last_heartbeat||'?') + '</span>\\n');
                psWrite('  Backends:    <span style="color:#22c55e;">' + (state.configured_backends||[]).join(', ') + '</span>\\n');
                const conns = state.connectors || {};
                for (const [cid, c] of Object.entries(conns)) {
                    psWrite('  Connector ' + cid + ': <span style="color:' + (c.status==='Available'?'#22c55e':'#fbbf24') + ';">' + c.status + '</span> (' + (c.error_code||'') + ')\\n');
                }
                psWrite('\\n');
                break;
            }

            case 'status': {
                psWrite('<span style="color:#808080;">StatusNotification opvragen...</span>\\n');
                const r = await fetch('/api/command', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({cp_id:cpId, action:'TriggerMessage', payload:{requestedMessage:'StatusNotification'}})});
                const d = await r.json();
                psFormatResponse(d);
                break;
            }

            case 'config': {
                const key = args[0] || null;
                psWrite('<span style="color:#808080;">GetConfiguration' + (key ? ' [' + key + ']' : '') + '...</span>\\n');
                const payload = key ? {key: [key]} : {};
                const r = await fetch('/api/command', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({cp_id:cpId, action:'GetConfiguration', payload:payload})});
                const d = await r.json();
                if (d.configurationKey || d.result?.configurationKey) {
                    const keys = d.configurationKey || d.result?.configurationKey || [];
                    psWrite('<span style="color:#3b82f6;">Configuratie (' + keys.length + ' keys):</span>\\n');
                    for (const k of keys) {
                        const ro = k.readonly ? ' <span style="color:#f87171;">[readonly]</span>' : '';
                        psWrite('  <span style="color:#22c55e;">' + (k.key||'').padEnd(35) + '</span> = <span style="color:#fbbf24;">' + (k.value??'') + '</span>' + ro + '\\n');
                    }
                } else {
                    psFormatResponse(d);
                }
                psWrite('\\n');
                break;
            }

            case 'set': {
                if (args.length < 2) { psWrite('<span style="color:#f87171;">Gebruik: set &lt;key&gt; &lt;value&gt;</span>\\n\\n'); break; }
                const key = args[0];
                const value = args.slice(1).join(' ');
                psWrite('<span style="color:#808080;">ChangeConfiguration ' + key + ' = ' + value + '...</span>\\n');
                const r = await fetch('/api/command', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({cp_id:cpId, action:'ChangeConfiguration', payload:{key:key, value:value}})});
                const d = await r.json();
                psFormatResponse(d);
                break;
            }

            case 'reset': {
                const type = (args[0] || 'soft').charAt(0).toUpperCase() + (args[0] || 'soft').slice(1).toLowerCase();
                psWrite('<span style="color:#fbbf24;">Reset (' + type + ')...</span>\\n');
                const r = await fetch('/api/command', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({cp_id:cpId, action:'Reset', payload:{type:type}})});
                const d = await r.json();
                psFormatResponse(d);
                break;
            }

            case 'trigger': {
                if (!args[0]) { psWrite('<span style="color:#f87171;">Gebruik: trigger &lt;message&gt;</span>\\n\\n'); break; }
                psWrite('<span style="color:#808080;">TriggerMessage ' + args[0] + '...</span>\\n');
                const r = await fetch('/api/command', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({cp_id:cpId, action:'TriggerMessage', payload:{requestedMessage:args[0]}})});
                const d = await r.json();
                psFormatResponse(d);
                break;
            }

            case 'unlock': {
                const cid = parseInt(args[0]);
                if (!cid) { psWrite('<span style="color:#f87171;">Gebruik: unlock &lt;connector_id&gt;</span>\\n\\n'); break; }
                psWrite('<span style="color:#808080;">UnlockConnector ' + cid + '...</span>\\n');
                const r = await fetch('/api/command', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({cp_id:cpId, action:'UnlockConnector', payload:{connectorId:cid}})});
                const d = await r.json();
                psFormatResponse(d);
                break;
            }

            case 'start': {
                const cid = parseInt(args[0]);
                const tag = args[1];
                if (!cid || !tag) { psWrite('<span style="color:#f87171;">Gebruik: start &lt;connector_id&gt; &lt;idTag&gt;</span>\\n\\n'); break; }
                psWrite('<span style="color:#808080;">RemoteStartTransaction connector=' + cid + ' idTag=' + tag + '...</span>\\n');
                const r = await fetch('/api/command', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({cp_id:cpId, action:'RemoteStartTransaction', payload:{connectorId:cid, idTag:tag}})});
                const d = await r.json();
                psFormatResponse(d);
                break;
            }

            case 'stop': {
                const txId = parseInt(args[0]);
                if (!txId) { psWrite('<span style="color:#f87171;">Gebruik: stop &lt;transaction_id&gt;</span>\\n\\n'); break; }
                psWrite('<span style="color:#808080;">RemoteStopTransaction txId=' + txId + '...</span>\\n');
                const r = await fetch('/api/command', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({cp_id:cpId, action:'RemoteStopTransaction', payload:{transactionId:txId}})});
                const d = await r.json();
                psFormatResponse(d);
                break;
            }

            case 'firmware': {
                if (!args[0]) { psWrite('<span style="color:#f87171;">Gebruik: firmware &lt;url&gt;</span>\\n\\n'); break; }
                psWrite('<span style="color:#fbbf24;">UpdateFirmware ' + args[0] + '...</span>\\n');
                const r = await fetch('/api/command', {method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({cp_id:cpId, action:'UpdateFirmware', payload:{location:args[0], retrieveDate:new Date().toISOString()}})});
                const d = await r.json();
                psFormatResponse(d);
                break;
            }

            default:
                psWrite('<span style="color:#f87171;">\\''+cmd+'\\' wordt niet herkend als commando. Type </span><span style="color:#ffff00;">help</span><span style="color:#f87171;"> voor opties.</span>\\n\\n');
        }
    } catch(err) {
        psWrite('<span style="color:#f87171;">Error: ' + err.message + '</span>\\n\\n');
    }
}

function psFormatResponse(d) {
    if (d.error) {
        psWrite('<span style="color:#f87171;">Error: ' + d.error + '</span>\\n\\n');
    } else if (d.status) {
        const color = d.status === 'Accepted' ? '#22c55e' : d.status === 'Rejected' ? '#f87171' : '#fbbf24';
        psWrite('<span style="color:' + color + ';">' + d.status + '</span>\\n\\n');
    } else if (d.result) {
        const status = d.result.status;
        if (status) {
            const color = status === 'Accepted' ? '#22c55e' : status === 'Rejected' ? '#f87171' : '#fbbf24';
            psWrite('<span style="color:' + color + ';">' + status + '</span>\\n');
        }
        const rest = Object.entries(d.result).filter(([k]) => k !== 'status');
        if (rest.length > 0) {
            for (const [k,v] of rest) {
                if (Array.isArray(v)) {
                    psWrite('  <span style="color:#94a3b8;">' + k + ':</span>\\n');
                    for (const item of v) {
                        if (typeof item === 'object') {
                            for (const [ik,iv] of Object.entries(item)) {
                                psWrite('    <span style="color:#22c55e;">' + String(ik).padEnd(30) + '</span> = <span style="color:#fbbf24;">' + iv + '</span>\\n');
                            }
                            psWrite('\\n');
                        } else {
                            psWrite('    <span style="color:#fbbf24;">' + item + '</span>\\n');
                        }
                    }
                } else {
                    psWrite('  <span style="color:#94a3b8;">' + k + ':</span> <span style="color:#fbbf24;">' + JSON.stringify(v) + '</span>\\n');
                }
            }
        }
        psWrite('\\n');
    } else {
        psWrite('<span style="color:#94a3b8;">' + JSON.stringify(d, null, 2).replace(/</g,'&lt;') + '</span>\\n\\n');
    }
}

// PuTTY terminal (xterm.js)
let puttyTerm = null;
let puttyWs = null;
let puttyFit = null;
let puttyConnected = false;

function puttyConnect() {
    if (puttyConnected && puttyWs && puttyWs.readyState === WebSocket.OPEN) {
        // Already connected, just fit
        if (puttyFit) puttyFit.fit();
        puttyTerm.focus();
        return;
    }

    const container = document.getElementById('putty-terminal');
    container.innerHTML = '';

    // Create xterm.js terminal with PuTTY styling
    puttyTerm = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 14,
        fontFamily: "'Courier New', 'Lucida Console', monospace",
        theme: {
            background: '#000000',
            foreground: '#bbbbbb',
            cursor: '#00ff00',
            cursorAccent: '#000000',
            selectionBackground: '#44aa44',
            black: '#000000',
            red: '#bb0000',
            green: '#00bb00',
            yellow: '#bbbb00',
            blue: '#5555ff',
            magenta: '#bb00bb',
            cyan: '#00bbbb',
            white: '#bbbbbb',
            brightBlack: '#555555',
            brightRed: '#ff5555',
            brightGreen: '#55ff55',
            brightYellow: '#ffff55',
            brightBlue: '#5555ff',
            brightMagenta: '#ff55ff',
            brightCyan: '#55ffff',
            brightWhite: '#ffffff',
        },
        scrollback: 5000,
        convertEol: true,
    });

    puttyFit = new FitAddon.FitAddon();
    puttyTerm.loadAddon(puttyFit);
    puttyTerm.loadAddon(new WebLinksAddon.WebLinksAddon());

    puttyTerm.open(container);
    puttyFit.fit();

    // Connect WebSocket
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    puttyWs = new WebSocket(proto + '//' + location.host + '/ws/terminal');
    puttyWs.binaryType = 'arraybuffer';

    puttyWs.onopen = () => {
        puttyConnected = true;
        // Send initial size
        const dims = puttyFit.proposeDimensions();
        if (dims) {
            puttyWs.send(JSON.stringify({type: 'resize', rows: dims.rows, cols: dims.cols}));
        }
        puttyTerm.focus();
    };

    puttyWs.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) {
            puttyTerm.write(new Uint8Array(e.data));
        } else {
            puttyTerm.write(e.data);
        }
    };

    puttyWs.onclose = () => {
        puttyConnected = false;
        puttyTerm.write('\\r\\n\\x1b[31m--- Verbinding verbroken ---\\x1b[0m\\r\\n');
    };

    puttyWs.onerror = () => {
        puttyConnected = false;
        puttyTerm.write('\\r\\n\\x1b[31m--- Verbindingsfout ---\\x1b[0m\\r\\n');
    };

    // Send terminal input to server
    puttyTerm.onData((data) => {
        if (puttyWs && puttyWs.readyState === WebSocket.OPEN) {
            puttyWs.send(new TextEncoder().encode(data));
        }
    });

    // Handle resize
    puttyTerm.onResize(({cols, rows}) => {
        if (puttyWs && puttyWs.readyState === WebSocket.OPEN) {
            puttyWs.send(JSON.stringify({type: 'resize', rows, cols}));
        }
    });

    // Resize on window resize
    window.addEventListener('resize', () => {
        if (swActivePanel === 'putty' && puttyFit) {
            puttyFit.fit();
        }
    });
}

function puttyReconnect() {
    if (puttyWs) {
        puttyWs.close();
        puttyWs = null;
    }
    puttyConnected = false;
    puttyConnect();
}

// Global error handler
window.onerror = function(msg, url, line, col, err) {
    var el = document.getElementById('charger-grid') || document.body;
    el.textContent = 'JS Error: ' + msg + ' (line ' + line + ')';
    el.style.color = '#f87171';
    el.style.padding = '20px';
};

// Init
updatePayload();
pollState();
setInterval(pollState, 3000);

document.addEventListener('click', function(e) {
    const card = e.target.closest('.clickable-card');
    if (card && !e.target.closest('.charger-log-toggle') && !e.target.closest('.charger-logs')) {
        // E-Flux cards have their own onclick handler
        if (card.dataset.efluxId) return;
        if (card.dataset.cpid) window.open('/charger/' + card.dataset.cpid, '_blank');
    }
});
connectChargerLogs();
requestAnimationFrame(updateAllEcg);
pollAlerts();
setInterval(pollAlerts, 15000);
</script>
</body>
</html>"""
