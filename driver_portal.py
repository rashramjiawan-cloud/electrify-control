"""Driver Portal — bestuurders pagina per laadpaal met QR code."""

DRIVER_HTML = r"""<!DOCTYPE html>
<html lang="nl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Laadpaal __CP_ID__</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0f172a; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,sans-serif; min-height:100vh; }
.top { background:linear-gradient(135deg,#1e3a5f,#065f46); padding:20px; text-align:center; }
.top h1 { font-size:22px; color:#fff; margin-bottom:4px; }
.top .sub { color:#94a3b8; font-size:13px; }
.top .status-big { font-size:16px; margin-top:8px; font-weight:600; }
.status-dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; }
.green { background:#34d399; }
.red { background:#f87171; }
.blue { background:#38bdf8; }
.yellow { background:#fbbf24; }
.content { padding:16px; max-width:500px; margin:0 auto; }
.card { background:#1e293b; border-radius:12px; padding:16px; margin-bottom:12px; border:1px solid #334155; }
.card h3 { font-size:14px; color:#38bdf8; margin-bottom:10px; text-transform:uppercase; letter-spacing:1px; }
.conn-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.conn { background:#0f172a; border-radius:8px; padding:12px; text-align:center; }
.conn .id { font-size:11px; color:#64748b; }
.conn .st { font-size:14px; font-weight:600; margin-top:4px; }
.conn .st.available { color:#34d399; }
.conn .st.charging { color:#38bdf8; }
.conn .st.faulted { color:#fbbf24; }
.conn .st.offline { color:#f87171; }
.meter { display:flex; justify-content:space-around; text-align:center; margin:8px 0; }
.meter .val { font-size:20px; font-weight:700; }
.meter .lbl { font-size:10px; color:#94a3b8; }
.btn { display:block; width:100%; padding:14px; border:none; border-radius:10px; font-size:15px; font-weight:600; cursor:pointer; margin-bottom:8px; transition:transform 0.1s; }
.btn:active { transform:scale(0.98); }
.btn-green { background:#065f46; color:#34d399; }
.btn-blue { background:#1e3a5f; color:#38bdf8; }
.btn-red { background:#7f1d1d; color:#fca5a5; }
.btn-yellow { background:#78350f; color:#fbbf24; }
input, select, textarea { width:100%; background:#0f172a; color:#e2e8f0; border:1px solid #334155; padding:10px 12px; border-radius:8px; font-size:14px; margin-bottom:8px; }
input:focus, select:focus, textarea:focus { outline:none; border-color:#38bdf8; }
.range-wrap { position:relative; margin:8px 0 16px; }
.range-wrap input[type=range] { width:100%; accent-color:#38bdf8; }
.range-val { text-align:center; font-size:28px; font-weight:800; color:#38bdf8; }
.range-labels { display:flex; justify-content:space-between; font-size:11px; color:#64748b; }
.modal { display:none; position:fixed; inset:0; background:#0f172aee; z-index:100; padding:20px; overflow-y:auto; }
.modal.show { display:block; }
.modal-inner { max-width:400px; margin:40px auto; }
.modal h2 { color:#f1f5f9; margin-bottom:16px; font-size:18px; }
.close-btn { position:absolute; top:16px; right:20px; color:#94a3b8; font-size:24px; cursor:pointer; }
.msg { padding:12px; border-radius:8px; margin-bottom:8px; font-size:13px; }
.msg.success { background:#065f4633; color:#34d399; border:1px solid #065f46; }
.msg.error { background:#7f1d1d33; color:#fca5a5; border:1px solid #7f1d1d; }
.msg.info { background:#1e3a5f33; color:#38bdf8; border:1px solid #1e3a5f; }
.powered { text-align:center; padding:20px; font-size:11px; color:#334155; }
</style></head><body>

<div class="top">
    <h1 id="cp-title">Laadpaal __CP_ID__</h1>
    <div class="sub">Jumbo Veghel — Smart Charging</div>
    <div class="status-big" id="cp-status">Laden...</div>
</div>

<div class="content">
    <div id="messages"></div>

    <div class="card">
        <h3>Connectors</h3>
        <div id="connectors" class="conn-grid"></div>
    </div>

    <div class="card">
        <h3>Ik ga laden</h3>
        <label style="font-size:12px;color:#94a3b8;">Mijn batterij is nu op:</label>
        <div class="range-val" id="batt-val">50%</div>
        <div class="range-wrap">
            <input type="range" id="batt-pct" min="5" max="95" value="50" step="5" oninput="document.getElementById('batt-val').textContent=this.value+'%'">
            <div class="range-labels"><span>5%</span><span>50%</span><span>95%</span></div>
        </div>
        <label style="font-size:12px;color:#94a3b8;">Laden tot:</label>
        <div class="range-val" id="target-val" style="font-size:20px;color:#34d399;">80%</div>
        <div class="range-wrap">
            <input type="range" id="target-pct" min="50" max="100" value="80" step="5" oninput="document.getElementById('target-val').textContent=this.value+'%'">
        </div>
        <input type="text" id="driver-name" placeholder="Uw naam (optioneel)">
        <input type="tel" id="driver-phone" placeholder="Telefoonnummer (voor melding)">
        <button class="btn btn-green" onclick="doCheckin()">&#9889; Start check-in</button>
    </div>

    <div class="card" id="gps-card">
        <h3>&#128205; GPS Auto Start/Stop</h3>
        <p style="font-size:12px;color:#94a3b8;margin-bottom:10px;">Activeer GPS tracking. Laden start automatisch als u bij de paal aankomt en stopt als u vertrekt.</p>
        <div id="gps-status" style="display:none;margin-bottom:10px;"></div>
        <button class="btn btn-green" id="gps-start-btn" onclick="startGpsTracking()">&#128205; Activeer GPS laden</button>
        <button class="btn btn-red" id="gps-stop-btn" style="display:none;" onclick="stopGpsTracking()">&#9209; Stop GPS laden</button>
    </div>

    <div class="card">
        <h3>Acties</h3>
        <button class="btn btn-blue" onclick="showModal('reserve')">&#128197; Laadpaal reserveren</button>
        <button class="btn btn-red" onclick="showModal('issue')">&#9888; Storing melden</button>
    </div>

    <div id="active-info"></div>

    <div class="powered">Powered by Tec-Tronic EMS</div>
</div>

<!-- Reserve modal -->
<div class="modal" id="modal-reserve">
    <span class="close-btn" onclick="hideModals()">&times;</span>
    <div class="modal-inner">
        <h2>&#128197; Laadpaal reserveren</h2>
        <p style="color:#94a3b8;font-size:13px;margin-bottom:12px;">Reserveer deze laadpaal voor maximaal 30 minuten.</p>
        <input type="text" id="res-name" placeholder="Uw naam">
        <input type="tel" id="res-phone" placeholder="Telefoonnummer">
        <label style="font-size:12px;color:#94a3b8;">Batterij bij aankomst (%):</label>
        <input type="number" id="res-batt" value="20" min="0" max="100">
        <button class="btn btn-blue" onclick="doReserve()">Reserveren</button>
        <div id="res-msg"></div>
    </div>
</div>

<!-- Issue modal -->
<div class="modal" id="modal-issue">
    <span class="close-btn" onclick="hideModals()">&times;</span>
    <div class="modal-inner">
        <h2>&#9888; Storing melden</h2>
        <input type="text" id="issue-name" placeholder="Uw naam">
        <input type="tel" id="issue-phone" placeholder="Telefoonnummer">
        <select id="issue-type">
            <option value="">Selecteer type storing...</option>
            <option value="niet_laden">Laadpaal laadt niet</option>
            <option value="kabel_vast">Kabel zit vast</option>
            <option value="display_kapot">Display/LED kapot</option>
            <option value="pas_werkt_niet">Pas wordt niet herkend</option>
            <option value="overig">Overig</option>
        </select>
        <textarea id="issue-desc" rows="3" placeholder="Beschrijving van het probleem..."></textarea>
        <button class="btn btn-red" onclick="doReport()">Melding versturen</button>
        <div id="issue-msg"></div>
    </div>
</div>

<script>
const CP_ID = '__CP_ID__';
const BASE = '';

function showModal(id) { document.getElementById('modal-'+id).classList.add('show'); }
function hideModals() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('show')); }

async function load() {
    try {
        const resp = await fetch(BASE + '/api/client/state');
        const state = await resp.json();
        const cp = state.chargers ? state.chargers[CP_ID] : null;

        if (!cp) {
            document.getElementById('cp-status').innerHTML = '<span class="status-dot red"></span>Niet gevonden';
            return;
        }

        // Status
        const statusEl = document.getElementById('cp-status');
        if (cp.connected) {
            statusEl.innerHTML = '<span class="status-dot green"></span>Online';
        } else {
            statusEl.innerHTML = '<span class="status-dot red"></span>Offline';
        }

        // Connectors
        const conns = cp.connectors || {};
        const connEl = document.getElementById('connectors');
        let html = '';
        let i = 0;
        for (const [cid, c] of Object.entries(conns)) {
            if (cid === '0') continue;
            i++;
            const st = c.status || 'Unknown';
            const cls = st.toLowerCase();
            html += '<div class="conn">';
            html += '<div class="id">Punt ' + i + '</div>';
            html += '<div class="st ' + cls + '">' + st + '</div>';
            // Meter values
            const mv = c.meter_values;
            if (mv && mv.length > 0 && mv[0].sampled_value) {
                html += '<div class="meter">';
                for (const v of mv[0].sampled_value) {
                    const m = v.measurand || '';
                    let val = parseFloat(v.value || 0);
                    if (m.includes('Current')) html += '<div><div class="val" style="color:#fbbf24;">' + val.toFixed(1) + '</div><div class="lbl">A</div></div>';
                    else if (m.includes('Power')) html += '<div><div class="val" style="color:#38bdf8;">' + (val/1000).toFixed(1) + '</div><div class="lbl">kW</div></div>';
                }
                html += '</div>';
            }
            html += '</div>';
        }
        if (i === 0) html = '<div style="color:#64748b;grid-column:1/-1;text-align:center;">Geen connector data</div>';
        connEl.innerHTML = html;

        // Active checkins & reservations
        const infoEl = document.getElementById('active-info');
        let infoHtml = '';
        const resResp = await fetch(BASE + '/api/driver/' + CP_ID + '/reservations');
        const reservations = await resResp.json();
        if (reservations.length > 0) {
            infoHtml += '<div class="card"><h3>Actieve reserveringen</h3>';
            for (const r of reservations) {
                const exp = new Date(r.expires_at).toLocaleTimeString('nl', {hour:'2-digit',minute:'2-digit'});
                infoHtml += '<div class="msg info">' + (r.driver_name||'Iemand') + ' — reservering tot ' + exp + '</div>';
            }
            infoHtml += '</div>';
        }

        const checkResp = await fetch(BASE + '/api/driver/' + CP_ID + '/checkins');
        const checkins = await checkResp.json();
        if (checkins.length > 0) {
            infoHtml += '<div class="card"><h3>Actief laden</h3>';
            for (const c of checkins) {
                const since = new Date(c.created_at).toLocaleTimeString('nl', {hour:'2-digit',minute:'2-digit'});
                infoHtml += '<div class="msg info">' + (c.driver_name||'Bestuurder') + ' — ' + c.battery_pct + '% &#8594; ' + c.target_pct + '% | ~' + c.estimated_minutes + ' min | sinds ' + since + '</div>';
            }
            infoHtml += '</div>';
        }
        infoEl.innerHTML = infoHtml;

    } catch(e) {
        console.error(e);
    }
}

async function doCheckin() {
    const battery = parseInt(document.getElementById('batt-pct').value);
    const target = parseInt(document.getElementById('target-pct').value);
    const name = document.getElementById('driver-name').value;
    const phone = document.getElementById('driver-phone').value;

    const resp = await fetch(BASE + '/api/driver/' + CP_ID + '/checkin', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({battery_pct: battery, target_pct: target, driver_name: name, phone: phone})
    });
    const data = await resp.json();
    const msg = document.getElementById('messages');
    if (data.id) {
        msg.innerHTML = '<div class="msg success">&#9989; Check-in gelukt! Geschatte laadtijd: ~' + data.estimated_minutes + ' minuten</div>';
        load();
    } else {
        msg.innerHTML = '<div class="msg error">Fout: ' + (data.error || 'onbekend') + '</div>';
    }
}

async function doReserve() {
    const name = document.getElementById('res-name').value;
    const phone = document.getElementById('res-phone').value;
    const batt = parseInt(document.getElementById('res-batt').value);
    if (!name) { document.getElementById('res-msg').innerHTML = '<div class="msg error">Vul uw naam in</div>'; return; }

    const resp = await fetch(BASE + '/api/driver/' + CP_ID + '/reserve', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({driver_name: name, driver_phone: phone, battery_pct: batt})
    });
    const data = await resp.json();
    if (data.id) {
        document.getElementById('res-msg').innerHTML = '<div class="msg success">&#9989; Gereserveerd! Geldig tot ' + new Date(data.expires_at).toLocaleTimeString('nl', {hour:'2-digit',minute:'2-digit'}) + '</div>';
        setTimeout(hideModals, 2000);
        load();
    } else {
        document.getElementById('res-msg').innerHTML = '<div class="msg error">' + (data.error || 'Fout') + '</div>';
    }
}

async function doReport() {
    const name = document.getElementById('issue-name').value;
    const phone = document.getElementById('issue-phone').value;
    const type = document.getElementById('issue-type').value;
    const desc = document.getElementById('issue-desc').value;
    if (!type) { document.getElementById('issue-msg').innerHTML = '<div class="msg error">Selecteer een type storing</div>'; return; }

    const resp = await fetch(BASE + '/api/driver/' + CP_ID + '/report', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({reporter_name: name, reporter_phone: phone, issue_type: type, description: desc})
    });
    const data = await resp.json();
    if (data.id) {
        document.getElementById('issue-msg').innerHTML = '<div class="msg success">&#9989; Melding #' + data.id + ' verstuurd. Bedankt!</div>';
        setTimeout(hideModals, 2000);
    } else {
        document.getElementById('issue-msg').innerHTML = '<div class="msg error">' + (data.error || 'Fout') + '</div>';
    }
}

// === GPS Auto Start/Stop ===
let gpsSessionId = null;
let gpsWatchId = null;
let driverId = localStorage.getItem('driver_id') || ('d' + Math.random().toString(36).substr(2,8));
localStorage.setItem('driver_id', driverId);

async function startGpsTracking() {
    if (!navigator.geolocation) {
        showGpsStatus('Uw browser ondersteunt geen GPS', 'error');
        return;
    }

    const battery = parseInt(document.getElementById('batt-pct').value);
    const target = parseInt(document.getElementById('target-pct').value);
    const name = document.getElementById('driver-name').value;
    const phone = document.getElementById('driver-phone').value;

    showGpsStatus('GPS activeren...', 'info');

    navigator.geolocation.getCurrentPosition(async (pos) => {
        // Registreer GPS sessie
        const resp = await fetch(BASE + '/api/driver/gps/register', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                cp_id: CP_ID, driver_id: driverId, driver_name: name,
                phone: phone, battery_pct: battery, target_pct: target,
                latitude: pos.coords.latitude, longitude: pos.coords.longitude
            })
        });
        const data = await resp.json();
        if (data.session_id) {
            gpsSessionId = data.session_id;
            document.getElementById('gps-start-btn').style.display = 'none';
            document.getElementById('gps-stop-btn').style.display = 'block';
            if (data.verified) {
                showGpsStatus('GPS actief — laden start automatisch bij aankomst (pas: ...' + (data.rfid_tag || '').slice(-6) + ')', 'success');
            } else {
                showGpsStatus('Scan uw laadpas bij de paal om uw account te activeren. Eenmalig nodig.', 'info');
            }

            // Start continu GPS tracking
            gpsWatchId = navigator.geolocation.watchPosition(onGpsUpdate, onGpsError, {
                enableHighAccuracy: true, maximumAge: 5000, timeout: 10000
            });
        } else {
            showGpsStatus('Registratie mislukt: ' + (data.error || 'onbekend'), 'error');
        }
    }, (err) => {
        showGpsStatus('GPS fout: ' + err.message, 'error');
    }, { enableHighAccuracy: true });
}

async function onGpsUpdate(pos) {
    if (!gpsSessionId) return;
    try {
        const resp = await fetch(BASE + '/api/driver/gps/update', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                latitude: pos.coords.latitude, longitude: pos.coords.longitude,
                driver_id: driverId, session_id: gpsSessionId
            })
        });
        const data = await resp.json();
        const nearby = data.nearby || [];
        if (data.action === 'started') {
            showGpsStatus(data.message || 'Laden automatisch gestart!', 'success');
        } else if (data.action === 'need_rfid') {
            showGpsStatus(data.message || 'Scan uw laadpas bij de paal', 'info');
            // Poll of RFID is gescand
            checkRfidLinked();
        } else if (nearby.length > 0) {
            const dist = nearby[0].distance_m;
            if (dist < 50) {
                showGpsStatus('U bent ' + dist.toFixed(0) + 'm van de laadpaal', 'info');
            }
        } else {
            showGpsStatus('GPS actief — ' + pos.coords.accuracy.toFixed(0) + 'm nauwkeurigheid', 'info');
        }
    } catch(e) {}
}

function onGpsError(err) {
    showGpsStatus('GPS signaal verloren: ' + err.message, 'error');
}

async function stopGpsTracking() {
    if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
    if (gpsSessionId) {
        await fetch(BASE + '/api/driver/gps/stop', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ session_id: gpsSessionId, cp_id: CP_ID })
        });
    }
    gpsSessionId = null;
    gpsWatchId = null;
    document.getElementById('gps-start-btn').style.display = 'block';
    document.getElementById('gps-stop-btn').style.display = 'none';
    showGpsStatus('GPS tracking gestopt', 'info');
}

async function checkRfidLinked() {
    // Poll elke 3 sec of de RFID gekoppeld is
    const check = async () => {
        try {
            const resp = await fetch(BASE + '/api/driver/profile/' + driverId);
            const data = await resp.json();
            if (data.verified) {
                showGpsStatus('Laadpas gekoppeld! (...' + (data.rfid_tag || '').slice(-6) + ') — GPS laden is nu actief.', 'success');
                return true;
            }
        } catch(e) {}
        return false;
    };
    for (let i = 0; i < 60; i++) {
        const linked = await check();
        if (linked) return;
        await new Promise(r => setTimeout(r, 3000));
    }
    showGpsStatus('Timeout — laadpas niet gescand binnen 3 minuten. Probeer opnieuw.', 'error');
}

function showGpsStatus(msg, type) {
    const el = document.getElementById('gps-status');
    el.style.display = 'block';
    el.className = 'msg ' + type;
    el.textContent = msg;
}

// Bij openen pagina: GPS opvragen en koppelen aan deze paal
function captureGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function(pos) {
        fetch(BASE + '/api/driver/' + CP_ID + '/gps-scan', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy
            })
        }).then(function(r) { return r.json(); }).then(function(data) {
            if (data.updated) {
                console.log('Paal locatie bijgewerkt:', data.lat, data.lon, '(' + data.scans + ' scans)');
            }
        }).catch(function() {});
    }, function() {}, {enableHighAccuracy: true, timeout: 10000});
}
captureGps();

load();
setInterval(load, 10000);
</script></body></html>"""
