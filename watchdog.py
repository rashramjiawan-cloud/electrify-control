#!/usr/bin/env python3
"""Slimme watchdog: analyseert laadpalen status en neemt gerichte acties."""
import json
import socket
import subprocess
import logging
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

STATE_FILE = Path('/opt/ocpp/state.json')
LOG_FILE = Path('/opt/ocpp/watchdog.log')
ACTION_LOG = Path('/opt/ocpp/watchdog_actions.json')
LAST_RESTART_FILE = Path('/opt/ocpp/watchdog_last_restart')
COOLDOWN_RESTART_MIN = 20  # niet vaker dan elke 20 min restarten

logging.basicConfig(
    filename=str(LOG_FILE),
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)
log = logging.getLogger('watchdog')


def run_cmd(cmd, timeout=10):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout
    except:
        return ''


def get_state():
    try:
        return json.loads(STATE_FILE.read_text())
    except:
        return {'chargers': {}}


def get_recent_logs(minutes=15):
    since = (datetime.now() - timedelta(minutes=minutes)).strftime('%Y-%m-%d %H:%M:%S')
    return run_cmd(['journalctl', '-u', 'ocpp', '--since', since, '--no-pager'], timeout=15)


def save_action(action):
    actions = []
    try:
        actions = json.loads(ACTION_LOG.read_text())
    except:
        pass
    action['timestamp'] = datetime.now(timezone.utc).isoformat()
    actions.append(action)
    actions = actions[-100:]  # bewaar laatste 100 acties
    ACTION_LOG.write_text(json.dumps(actions, indent=2))


def can_restart():
    try:
        last = datetime.fromisoformat(LAST_RESTART_FILE.read_text().strip())
        elapsed = (datetime.now(timezone.utc) - last).total_seconds() / 60
        return elapsed >= COOLDOWN_RESTART_MIN
    except:
        return True


def do_restart(reason):
    if not can_restart():
        log.info(f'Restart overgeslagen (cooldown): {reason}')
        return False
    log.warning(f'RESTART PROXY: {reason}')
    r = subprocess.run(['systemctl', 'restart', 'ocpp'], capture_output=True, text=True, timeout=15)
    if r.returncode == 0:
        LAST_RESTART_FILE.write_text(datetime.now(timezone.utc).isoformat())
        save_action({'action': 'restart', 'reason': reason, 'result': 'ok'})
        return True
    else:
        log.error(f'Restart mislukt: {r.stderr}')
        save_action({'action': 'restart', 'reason': reason, 'result': 'failed', 'error': r.stderr})
        return False


def analyze_and_act():
    now = datetime.now(timezone.utc)
    state = get_state()
    chargers = state.get('chargers', {})

    # Categoriseer palen
    online = []
    offline = []
    quarantined = []

    for cp_id, cp in chargers.items():
        if cp_id.startswith('_'):
            continue
        if cp.get('quarantine', {}).get('active'):
            quarantined.append(cp_id)
        elif cp.get('connected'):
            online.append(cp_id)
        else:
            offline.append(cp_id)

    total = len(online) + len(offline) + len(quarantined)
    if total == 0:
        log.info('Geen palen in state')
        return

    offline_pct = len(offline) / (len(online) + len(offline)) * 100 if (len(online) + len(offline)) > 0 else 0

    log.info(f'Status: {len(online)} online, {len(offline)} offline ({offline_pct:.0f}%), {len(quarantined)} quarantaine, totaal {total}')

    # Check: proxy zelf gezond?
    proxy_status = run_cmd(['systemctl', 'is-active', 'ocpp']).strip()
    if proxy_status != 'active':
        log.error(f'Proxy service niet actief! Status: {proxy_status}')
        do_restart('Proxy service down')
        return

    # === OFFLINE ANALYSE (alleen als er offline palen zijn) ===
    if offline:
        logs = get_recent_logs(15)

        # Tel disconnect redenen per paal in laatste 15 min
        recent_disconnects = {}
        recent_connects = {}
        for line in logs.split('\n'):
            m = re.search(r'Charge point disconnected: (\S+) \((.+?)\)', line)
            if m:
                cp_id = m.group(1)
                reason = m.group(2)
                recent_disconnects.setdefault(cp_id, []).append(reason)

            m = re.search(r'Charge point connected: (\S+)', line)
            if m:
                recent_connects.setdefault(m.group(1), 0)
                recent_connects[m.group(1)] += 1

        # Scenario 1: Massale uitval (>60% offline)
        if offline_pct > 60:
            log.warning(f'Massale uitval: {len(offline)}/{len(online)+len(offline)} offline ({offline_pct:.0f}%)')
            reconnecting = sum(1 for cp in offline if recent_connects.get(cp, 0) > 0)
            if reconnecting > 0:
                log.info(f'{reconnecting} palen proberen nog te verbinden — wachten')
                save_action({
                    'action': 'wait',
                    'reason': f'Massale uitval maar {reconnecting} palen herverbinden',
                    'offline': offline,
                })
            else:
                log.warning('Geen verbindingspogingen in 15 min → restart')
                if do_restart(f'Massale uitval: {len(offline)} offline, geen pogingen'):
                    log.info('Proxy herstart voor schone slate')

        else:
            # Scenario 2: Enkele palen offline — check per paal
            for cp_id in offline:
                disc_reasons = recent_disconnects.get(cp_id, [])
                conn_attempts = recent_connects.get(cp_id, 0)

                if conn_attempts >= 3:
                    log.warning(f'{cp_id}: {conn_attempts} pogingen in 15 min, steeds disconnect')
                    ping_timeouts = sum(1 for r in disc_reasons if 'internal error' in r)
                    protocol_errors = sum(1 for r in disc_reasons if 'protocol error' in r)
                    if ping_timeouts > 2:
                        log.info(f'{cp_id}: ping timeout probleem — paal reageert te langzaam')
                        save_action({'action': 'flag', 'cp_id': cp_id, 'issue': 'repeated_ping_timeout',
                            'detail': f'{ping_timeouts} ping timeouts in 15 min'})
                    elif protocol_errors > 2:
                        log.info(f'{cp_id}: protocol errors — mogelijke firmware issue')
                        save_action({'action': 'flag', 'cp_id': cp_id, 'issue': 'repeated_protocol_error',
                            'detail': f'{protocol_errors} protocol errors in 15 min'})

                elif conn_attempts == 0 and len(disc_reasons) == 0:
                    cp_data = chargers.get(cp_id, {})
                    conn_log = cp_data.get('connection_log', [])
                    if conn_log:
                        last_disc = conn_log[-1].get('disconnected_at', '')
                        if last_disc:
                            try:
                                disc_time = datetime.fromisoformat(last_disc)
                                offline_min = (now - disc_time).total_seconds() / 60
                                if offline_min > 60:
                                    log.warning(f'{cp_id}: al {offline_min:.0f} min offline, geen pogingen')
                                    save_action({'action': 'flag', 'cp_id': cp_id, 'issue': 'long_offline',
                                        'detail': f'{offline_min:.0f} min offline zonder pogingen'})
                            except:
                                pass

            # Scenario 3: Check backends gezondheid
            for line in logs.split('\n'):
                if 'VPS-MONITOR' in line and 'Error' in line:
                    log.warning('VPS Monitor heeft fouten — Voltcontrol backend mogelijk down')
                    save_action({'action': 'flag', 'issue': 'voltcontrol_down'})
                    break

            # Scenario 4: Middelmatige uitval (30-60%)
            if offline_pct > 30:
                total_recent_activity = sum(recent_connects.values())
                if total_recent_activity == 0:
                    log.warning(f'{offline_pct:.0f}% offline, geen activiteit → restart')
                    do_restart(f'{len(offline)} offline ({offline_pct:.0f}%), geen activiteit in 15 min')

    # === Meter health check ===
    tectronic = chargers.get('_tectronic', {})
    if tectronic:
        for meter_key, meter_name in [('grid_meter', 'Grid Meter'), ('evse_meter', 'EVSE Meter')]:
            meter = tectronic.get(meter_key, {})
            if not meter:
                continue
            online = meter.get('online', False)
            power = meter.get('total_power_w', 0)
            timestamp = meter.get('timestamp', '')

            # Check offline
            if not online:
                log.warning(f'[METER] {meter_name} OFFLINE')
                save_action({'action': 'flag', 'issue': 'meter_offline', 'cp_id': meter_key, 'detail': f'{meter_name} is offline'})

            # Check stale data (>5 min oud)
            if timestamp:
                try:
                    from datetime import datetime as _dt
                    ts = _dt.fromisoformat(timestamp.replace('Z', '+00:00'))
                    age_min = (now - ts).total_seconds() / 60
                    if age_min > 5:
                        log.warning(f'[METER] {meter_name} data is {age_min:.0f} min oud')
                        save_action({'action': 'flag', 'issue': 'meter_stale', 'cp_id': meter_key, 'detail': f'{meter_name} data {age_min:.0f} min oud'})
                except:
                    pass

            # Check: EVSE meter 0W terwijl er geladen wordt
            if meter_key == 'evse_meter' and power < 100:
                # Check of er laadpalen actief zijn
                charging_count = 0
                for cp_id, cp in chargers.items():
                    if cp_id.startswith('_') or cp_id.startswith('EVB'):
                        continue
                    for conn in cp.get('connectors', {}).values():
                        if conn.get('status') == 'Charging':
                            charging_count += 1
                # Check EVB connectors ook
                for cp_id in ['EVB-P2447137', 'EVB-P2447139']:
                    cp = chargers.get(cp_id, {})
                    for conn in cp.get('connectors', {}).values():
                        if conn.get('status') == 'Charging':
                            charging_count += 1

                if charging_count > 0:
                    log.warning(f'[METER] {meter_name} meet {power}W maar {charging_count} connectors laden! Mogelijk losse klem of verkeerde aansluiting.')
                    save_action({
                        'action': 'flag',
                        'issue': 'meter_mismatch',
                        'cp_id': meter_key,
                        'detail': f'{meter_name} meet {power}W maar {charging_count} connectors laden actief',
                    })

    # === Frozen meter check ===
    # Detecteert laadpalen met vastgelopen energiemeters (sessies met 0 Wh)
    try:
        import sys
        sys.path.insert(0, '/opt/ocpp')
        import db as _db
        all_sessions = _db.get_sessions_grouped()
        for cp_id, slist in all_sessions.items():
            cp_data = chargers.get(cp_id, {})
            if cp_data.get('quarantine', {}).get('active'):
                continue
            frozen_sessions = []
            frozen_conns = {}
            for s in slist:
                dur = s.get('duration_min', 0) or 0
                energy = s.get('energy_wh', 0) or 0
                ms = s.get('meter_start')
                me = s.get('meter_stop')
                cid = s.get('connector_id')
                if dur >= 10 and energy == 0 and ms is not None and ms == me:
                    frozen_sessions.append(s)
                    if cid:
                        frozen_conns[cid] = ms
            if len(frozen_sessions) >= 2:
                total_min = sum((s.get('duration_min', 0) or 0) for s in frozen_sessions)
                conns_parts = []
                for c, v in frozen_conns.items():
                    conns_parts.append('C%s vast op %.2f kWh' % (c, v / 1000))
                conns_str = ', '.join(conns_parts) if conns_parts else '?'
                reason = 'Watchdog: energiemeter frozen. %d sessies met 0 Wh (totaal %d min). %s. Contactor of meter defect.' % (
                    len(frozen_sessions), total_min, conns_str)
                log.warning('[FROZEN METER] %s: %s', cp_id, reason)
                try:
                    qs = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                    qs.settimeout(5)
                    qs.connect('/opt/ocpp/proxy.sock')
                    qs.sendall(json.dumps({
                        'cp_id': '_quarantine', 'action': 'set',
                        'payload': {'cp_id': cp_id, 'active': True, 'reason': reason}
                    }).encode())
                    qs.recv(4096)
                    qs.close()
                    log.warning('[FROZEN METER] %s in quarantaine gezet', cp_id)
                    save_action({
                        'action': 'quarantine', 'cp_id': cp_id,
                        'issue': 'frozen_meter', 'detail': reason,
                    })
                except Exception as qe:
                    log.error('[FROZEN METER] quarantaine mislukt voor %s: %s', cp_id, qe)
                    save_action({
                        'action': 'flag', 'cp_id': cp_id,
                        'issue': 'frozen_meter', 'detail': reason,
                    })
    except Exception as fe:
        log.error('[FROZEN METER] check mislukt: %s', fe)

    log.info('Analyse compleet')


if __name__ == '__main__':
    analyze_and_act()
