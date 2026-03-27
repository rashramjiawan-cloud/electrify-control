#!/usr/bin/env python3
"""Dagelijkse stabiliteitsanalyse van laadpalen. Draait als standalone of wordt geimporteerd door dashboard."""
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

STATE_FILE = Path('/opt/ocpp/state.json')
CHARGERS_JSON = Path('/opt/ocpp/chargers.json')
ANALYSIS_DIR = Path('/opt/ocpp/analysis')
ANALYSIS_DIR.mkdir(exist_ok=True)


def get_log_lines(since='24 hours ago'):
    result = subprocess.run(
        ['journalctl', '-u', 'ocpp', '--since', since, '--no-pager'],
        capture_output=True, text=True, timeout=30
    )
    return result.stdout.split('\n')


def analyze(since='24 hours ago'):
    lines = get_log_lines(since)

    connects = defaultdict(int)
    connect_times = defaultdict(list)
    disconnects = defaultdict(int)
    disconnect_times = defaultdict(list)
    disconnect_reasons = defaultdict(lambda: defaultdict(int))
    heartbeats = defaultdict(int)
    hw_errors = defaultdict(lambda: defaultdict(int))
    meter_values_count = defaultdict(int)
    boot_count = defaultdict(int)
    first_seen = {}
    last_seen = {}
    backend_connects = defaultdict(lambda: defaultdict(int))
    backend_disconnects = defaultdict(lambda: defaultdict(int))
    backend_reconnects = defaultdict(lambda: defaultdict(int))
    status_changes = defaultdict(lambda: defaultdict(int))

    for line in lines:
        # Connects
        # Extract timestamp
        ts_match = re.search(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})', line)
        ts = ts_match.group(1) if ts_match else None

        m = re.search(r'Charge point connected: (\S+)', line)
        if m:
            cp_id = m.group(1)
            connects[cp_id] += 1
            if ts:
                connect_times[cp_id].append(ts)
                if cp_id not in first_seen:
                    first_seen[cp_id] = ts
                last_seen[cp_id] = ts
            continue

        # Disconnects
        m = re.search(r'Charge point disconnected: (\S+) \((.+?)\)', line)
        if m:
            cp_id = m.group(1)
            reason = m.group(2)
            disconnects[cp_id] += 1
            if ts:
                disconnect_times[cp_id].append(ts)
            if 'internal error' in reason:
                disconnect_reasons[cp_id]['ping_timeout'] += 1
            elif 'protocol error' in reason:
                disconnect_reasons[cp_id]['protocol_error'] += 1
            elif 'no close frame' in reason:
                disconnect_reasons[cp_id]['no_close_frame'] += 1
            else:
                disconnect_reasons[cp_id]['other'] += 1
            continue

        # Backend connects/disconnects
        m = re.search(r'\[(\w+)\] Connected for (\S+)', line)
        if m:
            backend_connects[m.group(2)][m.group(1)] += 1
            continue

        m = re.search(r'\[(\w+)\] Disconnected (\S+)', line)
        if m:
            backend_disconnects[m.group(2)][m.group(1)] += 1
            continue

        m = re.search(r'\[(\w+)\] Reconnecting for (\S+)', line)
        if m:
            backend_reconnects[m.group(2)][m.group(1)] += 1
            continue

        # Heartbeats
        m = re.search(r'Heartbeat from (\S+)', line)
        if m:
            heartbeats[m.group(1)] += 1
            continue

        # MeterValues
        m = re.search(r'MeterValues (\S+) connector=', line)
        if m:
            meter_values_count[m.group(1)] += 1
            continue

        # BootNotification
        m = re.search(r'\[DETAILS\] (\S+) \|', line)
        if m:
            boot_count[m.group(1)] += 1
            continue

        # StatusNotification
        m = re.search(r'StatusNotification (\S+) connector=(\d+) status=(\w+) error=(\w+)', line)
        if m:
            cp_id = m.group(1)
            status = m.group(3)
            error = m.group(4)
            status_changes[cp_id][status] += 1
            if error != 'NoError':
                hw_errors[cp_id][error] += 1

    # Load charger info
    state = {}
    try:
        state = json.loads(STATE_FILE.read_text()).get('chargers', {})
    except:
        pass

    inventory = {}
    try:
        inventory = json.loads(CHARGERS_JSON.read_text()).get('chargers', {})
    except:
        pass

    # Build per-charger analysis
    all_ids = sorted(
        set(list(connects.keys()) + list(disconnects.keys()) +
            list(heartbeats.keys()) + list(state.keys()) + list(inventory.keys()))
        - {'_load_balancer'}
    )

    chargers = []
    for cp_id in all_ids:
        if cp_id.startswith('_') or cp_id.startswith('http'):
            continue
        info = inventory.get(cp_id, {})
        st = state.get(cp_id, {})

        c = connects.get(cp_id, 0)
        d = disconnects.get(cp_id, 0)
        hb = heartbeats.get(cp_id, 0)
        mv = meter_values_count.get(cp_id, 0)
        ratio = round(d / c, 2) if c > 0 else 0
        # Stability score: 0-100, lower ratio = better
        if c == 0:
            score = 0
        elif ratio == 0:
            score = 100
        else:
            score = max(0, round(100 - (ratio * 100)))

        fw = st.get('firmware') or info.get('firmware', '?')
        vendor = st.get('vendor') or info.get('vendor', '?')
        model = st.get('model') or info.get('model', '?')

        # Calculate uptime from connect/disconnect timestamps
        ct = connect_times.get(cp_id, [])
        dt_list = disconnect_times.get(cp_id, [])
        uptime_min = 0
        offline_min = 0
        offline_periods = []
        longest_online = 0
        longest_offline = 0
        avg_session_min = 0

        try:
            from datetime import datetime as _dt
            pairs = []
            for i, conn_ts in enumerate(ct):
                conn_t = _dt.strptime(conn_ts, '%Y-%m-%d %H:%M:%S')
                # Find matching disconnect
                disc_t = None
                for disc_ts in dt_list:
                    disc_t_candidate = _dt.strptime(disc_ts, '%Y-%m-%d %H:%M:%S')
                    if disc_t_candidate > conn_t:
                        disc_t = disc_t_candidate
                        break
                if disc_t:
                    online = (disc_t - conn_t).total_seconds() / 60
                    uptime_min += online
                    longest_online = max(longest_online, online)
                    pairs.append((conn_t, disc_t))
                elif i == len(ct) - 1 and st.get('connected'):
                    # Still connected
                    now = _dt.utcnow()
                    online = (now - conn_t).total_seconds() / 60
                    uptime_min += online
                    longest_online = max(longest_online, online)

            # Calculate offline periods (between disconnect and next connect)
            for i in range(len(dt_list)):
                disc_ts = dt_list[i]
                disc_t = _dt.strptime(disc_ts, '%Y-%m-%d %H:%M:%S')
                # Find next connect after this disconnect
                next_conn = None
                for conn_ts in ct:
                    conn_t = _dt.strptime(conn_ts, '%Y-%m-%d %H:%M:%S')
                    if conn_t > disc_t:
                        next_conn = conn_t
                        break
                if next_conn:
                    off = (next_conn - disc_t).total_seconds() / 60
                    offline_min += off
                    longest_offline = max(longest_offline, off)
                    if off > 5:
                        offline_periods.append({
                            'start': disc_ts,
                            'end': next_conn.strftime('%Y-%m-%d %H:%M:%S'),
                            'duration_min': round(off),
                        })

            total_time = uptime_min + offline_min
            uptime_pct = round(uptime_min / total_time * 100, 1) if total_time > 0 else 0
            avg_session_min = round(uptime_min / c) if c > 0 else 0
        except Exception:
            uptime_pct = 0

        # Backend stability
        be_stats = {}
        cfg_backends = CHARGER_BACKENDS.get(cp_id, DEFAULT_BACKENDS) if 'CHARGER_BACKENDS' in dir() else st.get('configured_backends', [])
        for be_name in set(list(backend_connects.get(cp_id, {}).keys()) + list(backend_disconnects.get(cp_id, {}).keys()) + list(cfg_backends)):
            bc = backend_connects.get(cp_id, {}).get(be_name, 0)
            bd = backend_disconnects.get(cp_id, {}).get(be_name, 0)
            br = backend_reconnects.get(cp_id, {}).get(be_name, 0)
            be_stats[be_name] = {
                'connects': bc,
                'disconnects': bd,
                'reconnects': br,
                'ratio': round(bd / bc, 2) if bc > 0 else 0,
            }

        chargers.append({
            'cp_id': cp_id,
            'vendor': vendor,
            'model': model,
            'firmware': fw,
            'connected': st.get('connected', False),
            'connects': c,
            'disconnects': d,
            'ratio': ratio,
            'score': score,
            'heartbeats': hb,
            'meter_values': mv,
            'boots': boot_count.get(cp_id, 0),
            'disconnect_reasons': dict(disconnect_reasons.get(cp_id, {})),
            'hw_errors': dict(hw_errors.get(cp_id, {})),
            'status_changes': dict(status_changes.get(cp_id, {})),
            'note': info.get('note', ''),
            'uptime_min': round(uptime_min),
            'uptime_pct': uptime_pct,
            'offline_min': round(offline_min),
            'longest_online_min': round(longest_online),
            'longest_offline_min': round(longest_offline),
            'avg_session_min': avg_session_min,
            'offline_periods': offline_periods[-5:],
            'backends': be_stats,
        })

    # Sort by score descending (most stable first)
    chargers.sort(key=lambda x: (-x['score'], x['ratio']))

    # Firmware group analysis — alleen vergelijken binnen zelfde vendor/model
    fw_groups = defaultdict(lambda: {'count': 0, 'total_ratio': 0, 'total_score': 0, 'chargers': [], 'vendor': '', 'model': ''})
    for ch in chargers:
        fw = ch['firmware']
        fw_groups[fw]['count'] += 1
        fw_groups[fw]['total_ratio'] += ch['ratio']
        fw_groups[fw]['total_score'] += ch['score']
        fw_groups[fw]['chargers'].append(ch['cp_id'])
        fw_groups[fw]['vendor'] = ch['vendor']
        fw_groups[fw]['model'] = ch['model']

    firmware_analysis = []
    for fw, data in sorted(fw_groups.items(), key=lambda x: x[1]['total_score'] / max(x[1]['count'], 1), reverse=True):
        firmware_analysis.append({
            'firmware': fw,
            'vendor': data['vendor'],
            'model': data['model'],
            'count': data['count'],
            'avg_ratio': round(data['total_ratio'] / data['count'], 2),
            'avg_score': round(data['total_score'] / data['count']),
            'chargers': data['chargers'],
        })

    # Vergelijkbare groepen: alleen firmwares van dezelfde vendor vergelijken
    vendor_groups = defaultdict(list)
    for fw_data in firmware_analysis:
        v = (fw_data.get('vendor') or '').upper()
        vendor_groups[v].append(fw_data)

    comparable_groups = {}
    for vendor, fws in vendor_groups.items():
        if len(fws) > 1:
            comparable_groups[vendor] = sorted(fws, key=lambda x: -x['avg_score'])

    # Top issues
    all_hw_errors = defaultdict(int)
    for cp_id, errs in hw_errors.items():
        for err, count in errs.items():
            all_hw_errors[err] += count

    all_disc_reasons = defaultdict(int)
    for cp_id, reasons in disconnect_reasons.items():
        for reason, count in reasons.items():
            all_disc_reasons[reason] += count

    # Generate recommendations
    recommendations = []

    # Firmware comparison — alleen binnen dezelfde vendor/type
    for vendor, fws in comparable_groups.items():
        if len(fws) < 2:
            continue
        best_fw = fws[0]  # already sorted by score desc
        worst_fw = fws[-1]
        if best_fw['avg_score'] > worst_fw['avg_score'] + 15:
            factor = round(best_fw['avg_score'] / max(worst_fw['avg_score'], 1), 1)
            recommendations.append({
                'type': 'firmware',
                'severity': 'high',
                'title': f"{vendor}: Firmware {best_fw['firmware']} is {factor}x stabieler dan {worst_fw['firmware']}",
                'detail': f"Score {best_fw['avg_score']} vs {worst_fw['avg_score']} (zelfde type: {vendor} {best_fw['model']}). Update {worst_fw['count']} palen naar {best_fw['firmware']}.",
                'affected': worst_fw['chargers'],
            })

    # Hardware errors
    palen_with_powermeter = [cp for cp in chargers if 'PowerMeterFailure' in cp.get('hw_errors', {})]
    if palen_with_powermeter:
        ids = [cp['cp_id'] for cp in palen_with_powermeter]
        recommendations.append({
            'type': 'hardware',
            'severity': 'high',
            'title': f"{len(ids)} palen met PowerMeterFailure",
            'detail': 'Energiemeter storing — meterwaarden zijn onbetrouwbaar. Monteur nodig voor hardware check.',
            'affected': ids,
        })

    palen_with_reader = [cp for cp in chargers if 'ReaderFailure' in cp.get('hw_errors', {})]
    if palen_with_reader:
        ids = [cp['cp_id'] for cp in palen_with_reader]
        recommendations.append({
            'type': 'hardware',
            'severity': 'medium',
            'title': f"{len(ids)} palen met ReaderFailure",
            'detail': 'RFID kaartlezer storing — laden met pas werkt mogelijk niet. Check kabels en readers.',
            'affected': ids,
        })

    palen_with_lock = [cp for cp in chargers if 'ConnectorLockFailure' in cp.get('hw_errors', {})]
    if palen_with_lock:
        ids = [cp['cp_id'] for cp in palen_with_lock]
        recommendations.append({
            'type': 'hardware',
            'severity': 'high',
            'title': f"{len(ids)} palen met ConnectorLockFailure",
            'detail': 'Connector slot werkt niet — kabel kan losgetrokken worden tijdens laden. Monteur nodig.',
            'affected': ids,
        })

    # Very unstable chargers
    very_unstable = [cp for cp in chargers if cp['score'] < 15 and cp['connects'] > 5]
    if very_unstable:
        ids = [cp['cp_id'] for cp in very_unstable]
        recommendations.append({
            'type': 'stability',
            'severity': 'medium',
            'title': f"{len(ids)} palen met score onder 15",
            'detail': 'Deze palen disconnecten bijna bij elke verbinding. Check SIM-verbinding, firmware, en WebSocket configuratie.',
            'affected': ids,
        })

    # Ping timeout dominant
    total_ping = all_disc_reasons.get('ping_timeout', 0)
    total_disc = sum(all_disc_reasons.values())
    if total_disc > 0 and total_ping / total_disc > 0.5:
        pct = round(total_ping / total_disc * 100)
        recommendations.append({
            'type': 'config',
            'severity': 'medium',
            'title': f"Ping timeout is {pct}% van alle disconnects ({total_ping}x)",
            'detail': 'WebSocket ping timeout is de hoofdoorzaak. Overweeg ping_interval te verhogen of WebSocketPingInterval op de palen aan te passen.',
            'affected': [],
        })

    # Offline chargers
    offline = [cp for cp in chargers if not cp['connected'] and cp['connects'] == 0]
    if offline:
        ids = [cp['cp_id'] for cp in offline]
        recommendations.append({
            'type': 'offline',
            'severity': 'low',
            'title': f"{len(ids)} palen niet verbonden in afgelopen 24u",
            'detail': 'Deze palen hebben geen enkele verbinding gemaakt. Check SIM, stroomvoorziening, en endpoint configuratie.',
            'affected': ids,
        })

    analysis = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'period': since,
        'recommendations': recommendations,
        'summary': {
            'total_chargers': len(chargers),
            'online': sum(1 for ch in chargers if ch['connected']),
            'total_connects': sum(ch['connects'] for ch in chargers),
            'total_disconnects': sum(ch['disconnects'] for ch in chargers),
            'avg_score': round(sum(ch['score'] for ch in chargers) / max(len(chargers), 1)),
            'avg_uptime_pct': round(sum(ch['uptime_pct'] for ch in chargers) / max(len(chargers), 1), 1),
            'total_uptime_min': sum(ch['uptime_min'] for ch in chargers),
            'total_offline_min': sum(ch['offline_min'] for ch in chargers),
            'total_heartbeats': sum(ch['heartbeats'] for ch in chargers),
            'total_meter_values': sum(ch['meter_values'] for ch in chargers),
        },
        'backend_summary': {
            name: {
                'total_connects': sum(backend_connects[cp].get(name, 0) for cp in all_ids),
                'total_disconnects': sum(backend_disconnects[cp].get(name, 0) for cp in all_ids),
                'total_reconnects': sum(backend_reconnects[cp].get(name, 0) for cp in all_ids),
            }
            for name in ['voltcontrol', 'evinty', 'eflux']
        },
        'chargers': chargers,
        'firmware_analysis': firmware_analysis,
        'comparable_groups': {v: g for v, g in comparable_groups.items()},
        'top_disconnect_reasons': dict(sorted(all_disc_reasons.items(), key=lambda x: -x[1])),
        'top_hw_errors': dict(sorted(all_hw_errors.items(), key=lambda x: -x[1])),
    }

    return analysis


def save_daily_log(analysis=None):
    if analysis is None:
        analysis = analyze('24 hours ago')
    date_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    path = ANALYSIS_DIR / f'analysis_{date_str}.json'
    path.write_text(json.dumps(analysis, indent=2))
    # Keep symlink to latest
    latest = ANALYSIS_DIR / 'latest.json'
    try:
        latest.unlink()
    except:
        pass
    latest.symlink_to(path.name)
    return str(path)


def get_history():
    """Get list of available daily analysis files."""
    files = sorted(ANALYSIS_DIR.glob('analysis_*.json'), reverse=True)
    return [{'date': f.stem.replace('analysis_', ''), 'path': str(f)} for f in files[:30]]


if __name__ == '__main__':
    analysis = analyze('24 hours ago')
    path = save_daily_log(analysis)
    s = analysis['summary']
    print(f"Analyse opgeslagen: {path}")
    print(f"Palen: {s['total_chargers']} | Online: {s['online']} | Score: {s['avg_score']}/100")
    print(f"Connects: {s['total_connects']} | Disconnects: {s['total_disconnects']}")
    print()
    print("Firmware ranking:")
    for fw in analysis['firmware_analysis']:
        print(f"  {fw['firmware']}: score={fw['avg_score']}, ratio={fw['avg_ratio']}, palen={fw['count']}")
    print()
    print("Top 5 meest stabiel:")
    for ch in analysis['chargers'][:5]:
        print(f"  {ch['cp_id']}: score={ch['score']}, ratio={ch['ratio']}, fw={ch['firmware']}")
    print()
    print("Top 5 minst stabiel:")
    for ch in analysis['chargers'][-5:]:
        print(f"  {ch['cp_id']}: score={ch['score']}, ratio={ch['ratio']}, fw={ch['firmware']}")
