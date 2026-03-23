DEKONING_HTML = r"""<!DOCTYPE html>
<html lang="nl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>De Koning - Energy Management</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#1a1a2e; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,sans-serif; }
a { color:#38bdf8; text-decoration:none; }
.topbar { background:#16213e; padding:12px 24px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #0f3460; }
.topbar h1 { font-size:18px; color:#f1f5f9; }
.topbar .subtitle { color:#94a3b8; font-size:13px; }
.topbar .back { color:#64748b; font-size:13px; }
.content { padding:20px 24px; max-width:1400px; margin:0 auto; }
.row { display:flex; gap:16px; margin-bottom:16px; flex-wrap:wrap; }
.card { background:#16213e; border-radius:12px; padding:20px; border:1px solid #0f3460; flex:1; min-width:280px; }
.card h3 { color:#94a3b8; font-size:13px; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; }
.card .device-tag { float:right; font-size:11px; color:#64748b; background:#0f172a; padding:2px 8px; border-radius:4px; }

/* Gauge */
.gauge-wrap { display:flex; flex-direction:column; align-items:center; }
.gauge-svg { width:220px; height:130px; }
.gauge-value { font-size:42px; font-weight:700; margin-top:-20px; }
.gauge-unit { font-size:16px; color:#94a3b8; }
.gauge-label { font-size:12px; color:#64748b; margin-top:4px; }
.gauge-status { display:inline-block; padding:4px 12px; border-radius:12px; font-size:12px; font-weight:600; margin-top:8px; }

/* Phase bars */
.phase { margin:8px 0; }
.phase-header { display:flex; justify-content:space-between; font-size:12px; color:#94a3b8; margin-bottom:3px; }
.phase-bar { background:#0f172a; border-radius:4px; height:22px; overflow:hidden; position:relative; }
.phase-fill { height:100%; border-radius:4px; transition:width 0.8s ease; display:flex; align-items:center; padding-left:8px; font-size:11px; font-weight:600; color:white; }

/* Stats */
.stat-row { display:flex; gap:12px; margin:12px 0; flex-wrap:wrap; }
.stat-item { background:#0f172a; border-radius:8px; padding:12px 16px; flex:1; min-width:100px; text-align:center; }
.stat-item .val { font-size:20px; font-weight:700; }
.stat-item .lbl { font-size:11px; color:#64748b; margin-top:2px; }

/* Device cards */
.device-card { background:#0f172a; border-radius:8px; padding:14px; margin:8px 0; display:flex; justify-content:space-between; align-items:center; }
.device-card .name { font-size:14px; font-weight:600; }
.device-card .power { font-size:18px; font-weight:700; }
.device-card .meta { font-size:11px; color:#64748b; }
.device-icon { width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:18px; margin-right:12px; }

/* Chart */
.chart-wrap { margin-top:12px; }
.chart-wrap svg { width:100%; height:100px; }

/* Config */
.config-row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding-top:12px; border-top:1px solid #0f3460; margin-top:12px; }
.config-row label { font-size:12px; color:#94a3b8; }
.config-row input { width:70px; padding:5px 8px; background:#0f172a; border:1px solid #334155; border-radius:4px; color:#e2e8f0; font-size:13px; }
.config-row button { padding:6px 16px; background:#2563eb; color:white; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:600; }
.config-row button:hover { background:#1d4ed8; }

.online-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
.dot-green { background:#34d399; }
.dot-red { background:#f87171; }
.dot-yellow { background:#fbbf24; }

@keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,0.7)} 50%{box-shadow:0 0 0 8px rgba(248,113,113,0)} }
.alarm-pulse { animation: pulse 1s infinite; }
</style></head><body>
<div class="topbar">
    <div>
        <h1>De Koning - Energy Management</h1>
        <div class="subtitle">Van Dorp Energie | 150 kW aansluiting | Real Time</div>
    </div>
    <a class="back" href="/">&larr; Dashboard</a>
</div>
<div class="content" id="content"><div style="color:#64748b;padding:40px;text-align:center;">Laden...</div></div>
<script>
const MAX_KW = 150;

function drawGauge(kw, maxKw) {
    const pct = Math.min(1, kw / maxKw);
    const startAngle = -210;
    const endAngle = 30;
    const range = endAngle - startAngle;
    const angle = startAngle + pct * range;

    const r = 90;
    const cx = 110;
    const cy = 110;

    function polarToXY(angleDeg, radius) {
        const rad = (angleDeg * Math.PI) / 180;
        return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
    }

    // Background arc
    const [bx1, by1] = polarToXY(startAngle, r);
    const [bx2, by2] = polarToXY(endAngle, r);

    // Value arc
    const [vx2, vy2] = polarToXY(angle, r);
    const largeArc = (angle - startAngle) > 180 ? 1 : 0;

    // Color gradient stops
    let color;
    if (pct < 0.6) color = '#34d399';
    else if (pct < 0.8) color = '#fbbf24';
    else color = '#f87171';

    // Needle
    const [nx, ny] = polarToXY(angle, r - 15);

    return `<svg viewBox="0 0 220 130" class="gauge-svg">
        <defs>
            <linearGradient id="gg" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:#34d399"/>
                <stop offset="60%" style="stop-color:#fbbf24"/>
                <stop offset="100%" style="stop-color:#f87171"/>
            </linearGradient>
        </defs>
        <path d="M${bx1},${by1} A${r},${r} 0 1,1 ${bx2},${by2}" fill="none" stroke="#1e293b" stroke-width="14" stroke-linecap="round"/>
        <path d="M${bx1},${by1} A${r},${r} 0 ${largeArc},1 ${vx2},${vy2}" fill="none" stroke="url(#gg)" stroke-width="14" stroke-linecap="round"/>
        <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy}" r="6" fill="${color}"/>
        <text x="20" y="125" font-size="11" fill="#64748b">0</text>
        <text x="190" y="125" font-size="11" fill="#64748b">${maxKw}</text>
    </svg>`;
}

async function load() {
    const [stateResp, ttResp] = await Promise.all([
        fetch('/api/client/state'), fetch('/api/client/tectronic')
    ]);
    const state = await stateResp.json();
    const tt = await ttResp.json();
    const grid = tt.grid_meter || {};
    const evse = tt.evse_meter || {};
    const gs = tt.grid_status || {};
    const chargers = state.chargers || {};

    const gridKw = (grid.total_power_w || 0) / 1000;
    const evseKw = (evse.total_power_w || 0) / 1000;
    const loadPct = gs.load_pct || 0;
    const statusColors = {ok:'#34d399', normal:'#38bdf8', warning:'#fbbf24', alarm:'#f87171', phase_alarm:'#f87171'};
    const statusLabels = {ok:'Laag verbruik', normal:'Normaal', warning:'Waarschuwing', alarm:'OVERBELASTING', phase_alarm:'Fase overbelast'};
    const color = statusColors[gs.status] || '#94a3b8';
    const isAlarm = gs.status === 'alarm' || gs.status === 'phase_alarm';

    let html = '<div class="row">';

    // === Gauge card ===
    html += '<div class="card" style="flex:0 0 300px;text-align:center;">';
    html += '<h3>Total Real Time Energy <span class="device-tag">' + (grid.online ? '<span class="online-dot dot-green"></span>Live' : '<span class="online-dot dot-red"></span>Offline') + '</span></h3>';
    html += '<div style="font-size:12px;color:' + color + ';margin-bottom:4px;">' + (isAlarm ? '<span class="online-dot dot-red alarm-pulse"></span>' : '<span class="online-dot dot-green"></span>') + (statusLabels[gs.status] || 'Laden...') + '</div>';
    html += '<div class="gauge-wrap">';
    html += drawGauge(gridKw, gs.max_kw || MAX_KW);
    html += '<div class="gauge-value" style="color:' + color + '">' + gridKw.toFixed(1) + '</div>';
    html += '<div class="gauge-unit">kW</div>';
    html += '<div class="gauge-label">Last Updated: ' + (grid.timestamp ? new Date(grid.timestamp).toLocaleTimeString('nl') : 'now') + '</div>';
    html += '</div></div>';

    // === Devices card ===
    html += '<div class="card" style="flex:1;">';
    html += '<h3>Energie per meter</h3>';
    // Grid meter
    html += '<div class="device-card">';
    html += '<div style="display:flex;align-items:center;"><div class="device-icon" style="background:#0f3460;">&#9889;</div><div>';
    html += '<div class="name">Tec-Tronic GM-400</div>';
    html += '<div class="meta">Inkomende voeding | ' + (grid.ip || '') + ' | ' + (grid.temperature_c || '?') + '&deg;C</div>';
    html += '</div></div>';
    html += '<div class="power" style="color:#f87171;">' + gridKw.toFixed(1) + ' kW</div>';
    html += '</div>';
    // EVSE meter
    html += '<div class="device-card">';
    html += '<div style="display:flex;align-items:center;"><div class="device-icon" style="background:#065f46;">&#9889;</div><div>';
    html += '<div class="name">Tec-Tronic GM-3EM Pro</div>';
    html += '<div class="meta">Verdeler EVBox | ' + (evse.ip || '') + ' | ' + (evse.temperature_c || '?') + '&deg;C</div>';
    html += '</div></div>';
    html += '<div class="power" style="color:#34d399;">' + evseKw.toFixed(1) + ' kW</div>';
    html += '</div>';
    // Overig verbruik
    const overigKw = Math.max(0, gridKw - evseKw);
    html += '<div class="device-card">';
    html += '<div style="display:flex;align-items:center;"><div class="device-icon" style="background:#1e3a5f;">&#127970;</div><div>';
    html += '<div class="name">Overig verbruik</div>';
    html += '<div class="meta">Pand (totaal - EVBox)</div>';
    html += '</div></div>';
    html += '<div class="power" style="color:#38bdf8;">' + overigKw.toFixed(1) + ' kW</div>';
    html += '</div>';
    html += '</div>';

    // === Beschikbaar card ===
    html += '<div class="card" style="flex:0 0 200px;text-align:center;">';
    html += '<h3>Beschikbaar</h3>';
    const availKw = gs.available_kw || 0;
    const availColor = availKw < 20 ? '#f87171' : availKw < 50 ? '#fbbf24' : '#34d399';
    html += '<div style="font-size:48px;font-weight:700;color:' + availColor + ';margin:20px 0;">' + availKw + '</div>';
    html += '<div style="font-size:14px;color:#94a3b8;">kW beschikbaar</div>';
    html += '<div style="margin-top:16px;font-size:13px;color:#64748b;">' + loadPct + '% belast</div>';
    html += '<div style="background:#0f172a;border-radius:4px;height:8px;margin-top:8px;"><div style="width:' + Math.min(100, loadPct) + '%;height:100%;border-radius:4px;background:' + color + ';"></div></div>';
    html += '</div>';

    html += '</div>'; // row

    // === Fase details ===
    html += '<div class="row">';

    // Grid fases
    html += '<div class="card">';
    html += '<h3>Inkomende voeding per fase <span class="device-tag">max ' + (gs.max_amps_per_phase || 217) + 'A per fase</span></h3>';
    const pl = gs.phase_loads || {};
    const gp = grid.phases || {};
    for (const phase of ['L1', 'L2', 'L3']) {
        const p = pl[phase] || {};
        const gph = gp[phase] || {};
        const pPct = Math.min(100, p.load_pct || 0);
        const pColor = pPct > 90 ? '#f87171' : pPct > 70 ? '#fbbf24' : '#34d399';
        html += '<div class="phase">';
        html += '<div class="phase-header"><span>' + phase + ' &mdash; ' + (p.current_a || 0) + 'A / ' + (p.power_w/1000 || 0).toFixed(1) + 'kW</span><span>' + (gph.voltage_v || 0) + 'V | PF: ' + (gph.pf || 0) + ' | ' + (gph.apparent_power_va || 0) + 'VA</span></div>';
        html += '<div class="phase-bar"><div class="phase-fill" style="width:' + pPct + '%;background:' + pColor + '">' + pPct + '%</div></div>';
        html += '</div>';
    }
    html += '<div class="stat-row">';
    html += '<div class="stat-item"><div class="val" style="color:#38bdf8;">' + (grid.frequency_hz || 50) + '</div><div class="lbl">Hz</div></div>';
    html += '<div class="stat-item"><div class="val" style="color:#fbbf24;">' + (grid.temperature_c || '?') + '&deg;</div><div class="lbl">Temp</div></div>';
    html += '<div class="stat-item"><div class="val" style="color:#34d399;">' + (grid.total_current_a || 0) + '</div><div class="lbl">A totaal</div></div>';
    html += '<div class="stat-item"><div class="val" style="color:#94a3b8;">' + Math.round((grid.total_energy_wh || 0)/1000) + '</div><div class="lbl">kWh totaal</div></div>';
    html += '</div>';
    html += '</div>';

    // EVBox fases
    html += '<div class="card">';
    html += '<h3>Verdeler EVBox per fase</h3>';
    const ep = evse.phases || {};
    for (const phase of ['L1', 'L2', 'L3']) {
        const p = ep[phase] || {};
        html += '<div class="phase">';
        html += '<div class="phase-header"><span>' + phase + ' &mdash; ' + (p.current_a || 0) + 'A / ' + ((p.power_w || 0)/1000).toFixed(2) + 'kW</span><span>' + (p.voltage_v || 0) + 'V | PF: ' + (p.pf || 0) + '</span></div>';
        html += '<div class="phase-bar"><div class="phase-fill" style="width:' + Math.min(100, (p.current_a || 0) / 32 * 100) + '%;background:#38bdf8">' + (p.current_a || 0) + 'A</div></div>';
        html += '</div>';
    }
    html += '<div class="stat-row">';
    html += '<div class="stat-item"><div class="val" style="color:#fbbf24;">' + (evse.temperature_c || '?') + '&deg;</div><div class="lbl">Temp</div></div>';
    html += '<div class="stat-item"><div class="val" style="color:#34d399;">' + (evse.total_current_a || 0) + '</div><div class="lbl">A totaal</div></div>';
    html += '<div class="stat-item"><div class="val" style="color:#94a3b8;">' + Math.round((evse.total_energy_wh || 0)/1000) + '</div><div class="lbl">kWh totaal</div></div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // row

    // === Trend ===
    const hist = gs.history || [];
    if (hist.length > 1) {
        html += '<div class="card">';
        html += '<h3>Vermogen trend <span class="device-tag">laatste ' + Math.round(hist.length * 10 / 60) + ' min</span></h3>';
        const maxVal = Math.max((gs.max_kw || 150) * 1000, ...hist.map(h => h.power_w || 0));
        const svgW = 1200;
        const svgH = 120;
        let path = '';
        let area = '';
        for (let i = 0; i < hist.length; i++) {
            const x = (i / (hist.length - 1)) * svgW;
            const y = svgH - ((hist[i].power_w || 0) / maxVal) * (svgH - 10);
            path += (i === 0 ? 'M' : 'L') + x.toFixed(0) + ',' + y.toFixed(0);
            area += (i === 0 ? 'M' : 'L') + x.toFixed(0) + ',' + y.toFixed(0);
        }
        area += ' L' + svgW + ',' + svgH + ' L0,' + svgH + ' Z';
        const warnY = svgH - (gs.warning_at_pct / 100) * (svgH - 10);
        html += '<div class="chart-wrap"><svg viewBox="0 0 ' + svgW + ' ' + svgH + '">';
        html += '<defs><linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color:#38bdf8;stop-opacity:0.3"/><stop offset="100%" style="stop-color:#38bdf8;stop-opacity:0.02"/></linearGradient></defs>';
        html += '<rect width="' + svgW + '" height="' + svgH + '" fill="#0f172a" rx="6"/>';
        html += '<line x1="0" y1="' + warnY + '" x2="' + svgW + '" y2="' + warnY + '" stroke="#fbbf24" stroke-width="1" stroke-dasharray="6,4" opacity="0.5"/>';
        html += '<text x="' + svgW + '" y="' + (warnY - 3) + '" font-size="10" fill="#fbbf24" text-anchor="end">' + (gs.warning_at_pct || 90) + '%</text>';
        html += '<path d="' + area + '" fill="url(#areaG)"/>';
        html += '<path d="' + path + '" fill="none" stroke="#38bdf8" stroke-width="2"/>';
        html += '</svg></div>';
        html += '</div>';
    }

    // === Laadpunten ===
    const dekoningIds = ['EVB-P2447139'];
    const evboxIds = dekoningIds.filter(id => id in chargers);
    html += '<div class="card">';
    html += '<h3>Laadpunten <span class="device-tag">' + dekoningIds.length + ' geconfigureerd</span></h3>';
    if (evboxIds.length > 0) {
        for (const id of evboxIds) {
            const c = chargers[id];
            const online = c.connected;
            html += '<div class="device-card">';
            html += '<div style="display:flex;align-items:center;"><div class="device-icon" style="background:' + (online ? '#065f46' : '#7f1d1d') + ';">&#128268;</div><div>';
            html += '<div class="name"><a href="/charger/' + id + '">' + id + '</a></div>';
            html += '<div class="meta">' + (online ? '<span class="online-dot dot-green"></span>Online' : '<span class="online-dot dot-red"></span>Offline') + '</div>';
            html += '</div></div>';
            const conns = c.connectors || {};
            let connHtml = '';
            for (const [cid, conn] of Object.entries(conns)) {
                if (cid === '0') continue;
                connHtml += '<span style="margin-left:8px;font-size:12px;">C' + cid + ': <b>' + (conn.status || '?') + '</b></span>';
            }
            html += '<div>' + connHtml + '</div>';
            html += '</div>';
        }
    } else {
        html += '<div style="color:#64748b;padding:12px;">Geen laadpunten verbonden. Stel endpoint in op ws://46.62.148.12/EVB-P2447139</div>';
    }
    html += '</div>';

    // === Config ===
    html += '<div class="card">';
    html += '<h3>Instellingen</h3>';
    html += '<div class="config-row">';
    html += '<label>Aansluiting:</label><input type="number" id="gtv-max" value="' + (gs.max_kw || 150) + '" min="1" max="500"> <label>kW</label>';
    html += '<label style="margin-left:16px;">Marge:</label><input type="number" id="gtv-margin" value="' + (gs.margin_pct || 10) + '" min="1" max="50"> <label>%</label>';
    html += '<button onclick="updateCfg()">Opslaan</button>';
    html += '<span style="font-size:12px;color:#64748b;margin-left:8px;">Waarschuwing bij ' + (gs.warning_at_pct || 90) + '% (' + Math.round((gs.max_kw || 150) * (gs.warning_at_pct || 90) / 100) + ' kW)</span>';
    html += '</div></div>';

    // === Energie grafiek ===
    html += '<div class="card" style="margin-top:16px;">';
    html += '<h3>Verbruik vandaag <span class="device-tag">Tec-Tronic GM-400</span></h3>';
    html += '<canvas id="grid-chart" style="width:100%;height:200px;"></canvas>';
    html += '</div>';

    document.getElementById('content').innerHTML = html;
    loadGridChart();
}

let gridChartData = null;

async function loadGridChart() {
    try {
        const resp = await fetch('/api/client/grid-history');
        gridChartData = await resp.json();
        drawGridChart();
    } catch(e) {}
}

function drawGridChart() {
    const canvas = document.getElementById('grid-chart');
    if (!canvas || !gridChartData || gridChartData.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    const pad = {top:20, right:20, bottom:30, left:50};
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    // Data
    const points = gridChartData.map(d => ({
        t: new Date(d.created_at).getTime(),
        power: d.total_power_w || 0,
        l1: d.l1_power_w || 0,
        l2: d.l2_power_w || 0,
        l3: d.l3_power_w || 0,
    }));

    const tMin = points[0].t;
    const tMax = points[points.length - 1].t;
    const tRange = tMax - tMin || 1;
    const maxPower = Math.max(MAX_KW * 1000, ...points.map(p => p.power)) * 1.1;

    // Grid lines
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (ch / 4) * i;
        const val = maxPower - (maxPower / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + cw, y);
        ctx.stroke();
        ctx.fillText(Math.round(val / 1000) + ' kW', pad.left - 6, y + 3);
    }

    // Time labels
    ctx.textAlign = 'center';
    const hourMs = 3600000;
    const firstHour = Math.ceil(tMin / hourMs) * hourMs;
    for (let t = firstHour; t <= tMax; t += hourMs * 2) {
        const x = pad.left + ((t - tMin) / tRange) * cw;
        const d = new Date(t);
        ctx.fillText(d.getHours().toString().padStart(2, '0') + ':00', x, h - 8);
    }

    // Warning line
    const warningY = pad.top + ch - (MAX_KW * 1000 * 0.9 / maxPower) * ch;
    ctx.strokeStyle = '#fbbf2444';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, warningY);
    ctx.lineTo(pad.left + cw, warningY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw area fill (total power)
    function drawLine(data, key, color, fill) {
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
            const x = pad.left + ((data[i].t - tMin) / tRange) * cw;
            const y = pad.top + ch - (data[i][key] / maxPower) * ch;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        if (fill) {
            ctx.lineTo(pad.left + cw, pad.top + ch);
            ctx.lineTo(pad.left, pad.top + ch);
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // Stacked area: L3, L2, L1
    drawLine(points, 'power', '#38bdf800', '#38bdf815');
    drawLine(points, 'power', '#38bdf8', null);

    // Per-fase lijnen
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    drawLine(points, 'l1', '#f87171', null);
    drawLine(points, 'l2', '#fbbf24', null);
    drawLine(points, 'l3', '#34d399', null);
    ctx.globalAlpha = 1;

    // Legend
    const legends = [['Totaal', '#38bdf8'], ['L1', '#f87171'], ['L2', '#fbbf24'], ['L3', '#34d399']];
    let lx = pad.left;
    ctx.font = '11px -apple-system, sans-serif';
    for (const [label, color] of legends) {
        ctx.fillStyle = color;
        ctx.fillRect(lx, 4, 12, 3);
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'left';
        ctx.fillText(label, lx + 16, 10);
        lx += 60;
    }

    // Current value marker
    if (points.length > 0) {
        const last = points[points.length - 1];
        const x = pad.left + cw;
        const y = pad.top + ch - (last.power / maxPower) * ch;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText((last.power / 1000).toFixed(1) + ' kW', x - 10, y - 8);
    }
}

async function updateCfg() {
    const maxKw = parseInt(document.getElementById('gtv-max').value);
    const margin = parseInt(document.getElementById('gtv-margin').value);
    const resp = await fetch('/api/gtv/config', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({max_kw: maxKw, margin_pct: margin})
    });
    const result = await resp.json();
    if (result.ok) load();
    else alert('Fout: ' + JSON.stringify(result));
}

load().catch(e => { document.getElementById('content').innerHTML = '<div style="color:#f87171;padding:20px;">Error: ' + e.message + '</div>'; console.error(e); });
setInterval(() => load().catch(e => console.error(e)), 5000);
</script></body></html>"""
