"""Supabase sync module — pusht proxy state naar Voltcontrol.io database.

Draait als asyncio task in de proxy. Elke SYNC_INTERVAL seconden
worden charger status, connectors, heartbeats en sessies gesynchroniseerd.

Dit vervangt de instabiele Supabase Edge Function websockets.
De voltcontrol.io frontend leest uit dezelfde tabellen en toont live data.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
try:
    import aiohttp
except ImportError:
    aiohttp = None

logger = logging.getLogger('supabase-sync')

# Config
SUPABASE_URL = 'https://lxdjtwxumzsyowdkahrt.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4ZGp0d3h1bXpzeW93ZGthaHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjY4MTcsImV4cCI6MjA4NzIwMjgxN30.al6Ip2-z5mVDsHtxhyzgJYlA10nwmtfRAV7SnFO-LrA'
STATE_FILE = Path('/opt/ocpp/state.json')
SYNC_INTERVAL = 10  # seconden
HEADERS = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
}


def get_state():
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {'chargers': {}}


async def upsert(session, table, data):
    """Upsert rows into Supabase table. Returns True on success."""
    if not data:
        return True
    url = f'{SUPABASE_URL}/rest/v1/{table}'
    try:
        async with session.post(url, json=data, headers=HEADERS) as resp:
            if resp.status in (200, 201, 204):
                return True
            else:
                body = await resp.text()
                logger.warning(f'[SYNC] {table} upsert failed: {resp.status} {body[:200]}')
                return False
    except Exception as e:
        logger.warning(f'[SYNC] {table} request failed: {e}')
        return False


async def sync_charge_points(session, state):
    """Sync charger status naar charge_points tabel."""
    chargers = state.get('chargers', {})
    rows = []
    for cp_id, cp in chargers.items():
        if cp_id.startswith('_'):
            continue
        # Map status van eerste connector
        conns = cp.get('connectors', {})
        status = 'Unavailable'
        if cp.get('connected'):
            status = 'Available'
            for cid, conn in conns.items():
                if cid == '0':
                    continue
                cs = conn.get('status', '')
                if cs == 'Charging':
                    status = 'Charging'
                    break
                elif cs == 'Faulted':
                    status = 'Faulted'
                elif cs == 'SuspendedEV':
                    status = 'SuspendedEV'
        elif not cp.get('connected'):
            status = 'Unavailable'

        rows.append({
            'id': cp_id,
            'name': cp_id,
            'model': cp.get('model', ''),
            'vendor': cp.get('vendor', ''),
            'serial_number': cp_id,
            'status': status,
            'firmware_version': cp.get('firmware', ''),
            'last_heartbeat': cp.get('last_heartbeat'),
            'updated_at': datetime.now(timezone.utc).isoformat(),
        })

    return await upsert(session, 'charge_points', rows)


async def sync_connectors(session, state):
    """Sync connector status naar connectors tabel."""
    chargers = state.get('chargers', {})
    rows = []
    for cp_id, cp in chargers.items():
        if cp_id.startswith('_'):
            continue
        for cid, conn in cp.get('connectors', {}).items():
            if cid == '0':
                continue
            # Bereken vermogen uit meter values
            power = 0
            mv = conn.get('meter_values')
            meter_val = 0
            if mv and isinstance(mv, list) and len(mv) > 0:
                sv = mv[0].get('sampled_value', [])
                for v in sv:
                    m = v.get('measurand', '')
                    if 'Power.Active.Import' in m:
                        power = float(v.get('value', 0))
                    if 'Energy.Active.Import' in m:
                        meter_val = float(v.get('value', 0))

            rows.append({
                'charge_point_id': cp_id,
                'connector_id': int(cid) if cid.isdigit() else cid,
                'status': conn.get('status', 'Unknown'),
                'current_power': power,
                'meter_value': meter_val,
                'updated_at': datetime.now(timezone.utc).isoformat(),
            })

    return await upsert(session, 'connectors', rows)


async def sync_heartbeats(session, state, last_heartbeats):
    """Sync nieuwe heartbeats."""
    chargers = state.get('chargers', {})
    rows = []
    for cp_id, cp in chargers.items():
        if cp_id.startswith('_'):
            continue
        hb = cp.get('last_heartbeat')
        if hb and hb != last_heartbeats.get(cp_id):
            rows.append({
                'charge_point_id': cp_id,
                'received_at': hb,
            })
            last_heartbeats[cp_id] = hb

    if rows:
        # Heartbeats zijn INSERT only, geen upsert
        url = f'{SUPABASE_URL}/rest/v1/heartbeats'
        headers = {**HEADERS}
        headers.pop('Prefer', None)
        try:
            async with session.post(url, json=rows, headers=headers) as resp:
                if resp.status not in (200, 201, 204):
                    body = await resp.text()
                    logger.warning(f'[SYNC] heartbeats insert failed: {resp.status} {body[:200]}')
        except Exception as e:
            logger.warning(f'[SYNC] heartbeats request failed: {e}')


SYNC_FUNCTION_URL = f'{SUPABASE_URL}/functions/v1/sync-external-chargepoints'
BACKUP_API_KEY = '723665a1c7585853ee055159df0cdf44a91e8fca5abfef97'

# Voltcontrol energy_meter IDs (from Supabase DB)
GRID_METER_ID = '702638d1-238b-4676-abfa-aaaec0d8db71'  # TecTronic Pro 3EM (evse_meter)
# GM-400 grid meter — UUID v5 gebaseerd op MAC adres
GM400_METER_ID = '08f9e0e8-eb98-4000-a000-000000000001'

# Meter reading interval (niet elke 10s, maar elke 30s om DB niet te overbelasten)
METER_SYNC_INTERVAL = 30
_meter_sync_counter = 0


async def sync_via_edge_function(session):
    """Trigger de sync-external-chargepoints Edge Function."""
    try:
        headers = {'x-api-key': BACKUP_API_KEY}
        async with session.get(SYNC_FUNCTION_URL, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status == 200:
                result = await resp.json()
                return result.get('synced', 0), result.get('errors', [])
            else:
                body = await resp.text()
                logger.warning(f'[SYNC] Edge Function failed: {resp.status} {body[:200]}')
                return 0, [f'HTTP {resp.status}']
    except Exception as e:
        logger.warning(f'[SYNC] Edge Function request failed: {e}')
        return 0, [str(e)]


async def ensure_gm400_meter(session):
    """Zorg dat de GM-400 grid meter als energy_meter in Voltcontrol bestaat."""
    row = {
        'id': GM400_METER_ID,
        'name': 'Inkomende voeding 150kW',
        'device_type': 'tec_tronic_gm400',
        'connection_type': 'proxy_sync',
        'host': '192.168.3.228',
        'port': 80,
        'modbus_address': 1,
        'poll_interval_sec': 10,
        'enabled': True,
        'meter_type': 'grid',
    }
    return await upsert(session, 'energy_meters', [row])


async def sync_meter_readings(session, state):
    """Push Tec-Tronic GM-400 + EVSE meter readings naar Voltcontrol."""
    tt = state.get('chargers', {}).get('_tectronic', {})
    if not tt:
        return True

    now = datetime.now(timezone.utc).isoformat()
    rows = []

    for meter_key, meter_vc_id in [('grid_meter', GM400_METER_ID), ('evse_meter', GRID_METER_ID)]:
        meter = tt.get(meter_key, {})
        if not meter or not meter.get('online'):
            continue

        phases = meter.get('phases', {})
        for idx, phase_name in enumerate(['L1', 'L2', 'L3']):
            ph = phases.get(phase_name, {})
            if not ph:
                continue
            rows.append({
                'meter_id': meter_vc_id,
                'channel': idx,
                'voltage': ph.get('voltage_v', 0),
                'current': ph.get('current_a', 0),
                'active_power': ph.get('power_w', 0),
                'apparent_power': ph.get('apparent_power_va', 0),
                'power_factor': ph.get('pf', 0),
                'frequency': ph.get('freq_hz', 50),
                'total_energy': (meter.get('energy_per_phase', {}).get(phase_name, {}).get('import_wh', 0) or 0) / 1000.0,
                'timestamp': meter.get('timestamp', now),
                'return_energy': (meter.get('energy_per_phase', {}).get(phase_name, {}).get('export_wh', 0) or 0) / 1000.0,
            })

    if rows:
        # INSERT (niet upsert — meter_readings is append-only)
        url = f'{SUPABASE_URL}/rest/v1/meter_readings'
        headers = {**HEADERS}
        headers.pop('Prefer', None)
        try:
            async with session.post(url, json=rows, headers=headers) as resp:
                if resp.status in (200, 201, 204):
                    return True
                body = await resp.text()
                logger.warning(f'[SYNC] meter_readings insert failed: {resp.status} {body[:200]}')
                return False
        except Exception as e:
            logger.warning(f'[SYNC] meter_readings request failed: {e}')
            return False
    return True


async def sync_meter_health(session, state):
    """Push Tec-Tronic device health naar Voltcontrol."""
    tt = state.get('chargers', {}).get('_tectronic', {})
    if not tt:
        return True

    rows = []
    for meter_key, meter_vc_id in [('grid_meter', GM400_METER_ID), ('evse_meter', GRID_METER_ID)]:
        meter = tt.get(meter_key, {})
        if not meter or not meter.get('online'):
            continue
        rows.append({
            'meter_id': meter_vc_id,
            'temperature': meter.get('temperature_c'),
            'wifi_rssi': None,
            'wifi_ssid': None,
            'wifi_ip': meter.get('ip'),
            'uptime': meter.get('uptime_s'),
            'firmware_version': None,
            'mac': meter.get('mac'),
            'phase_faults': None,
            'recorded_at': datetime.now(timezone.utc).isoformat(),
        })

    if rows:
        url = f'{SUPABASE_URL}/rest/v1/meter_device_health'
        headers = {**HEADERS}
        headers.pop('Prefer', None)
        try:
            async with session.post(url, json=rows, headers=headers) as resp:
                if resp.status not in (200, 201, 204):
                    body = await resp.text()
                    logger.warning(f'[SYNC] meter_device_health insert failed: {resp.status} {body[:200]}')
        except Exception as e:
            logger.warning(f'[SYNC] meter_device_health request failed: {e}')
    return True


async def sync_energy_meter_last_reading(session, state):
    """Update energy_meters.last_reading met huidige data."""
    tt = state.get('chargers', {}).get('_tectronic', {})
    if not tt:
        return True

    for meter_key, meter_vc_id in [('grid_meter', GM400_METER_ID), ('evse_meter', GRID_METER_ID)]:
        meter = tt.get(meter_key, {})
        if not meter or not meter.get('online'):
            continue

        phases = meter.get('phases', {})
        channels = []
        for idx, phase_name in enumerate(['L1', 'L2', 'L3']):
            ph = phases.get(phase_name, {})
            channels.append({
                'channel': idx,
                'current': ph.get('current_a', 0),
                'voltage': ph.get('voltage_v', 0),
                'frequency': ph.get('freq_hz', 50),
                'active_power': ph.get('power_w', 0),
                'power_factor': ph.get('pf', 0),
                'apparent_power': ph.get('apparent_power_va', 0),
                'total_energy': (meter.get('energy_per_phase', {}).get(phase_name, {}).get('import_wh', 0) or 0) / 1000.0,
            })

        last_reading = {
            'raw': {},
            'channels': channels,
            'total_power': meter.get('total_power_w', 0),
            'total_current': meter.get('total_current_a', 0),
            'temperature': meter.get('temperature_c'),
        }

        # PATCH energy_meters with last_reading + last_poll_at
        url = f'{SUPABASE_URL}/rest/v1/energy_meters?id=eq.{meter_vc_id}'
        patch_data = {
            'last_reading': last_reading,
            'last_poll_at': datetime.now(timezone.utc).isoformat(),
            'enabled': True,
        }
        try:
            async with session.patch(url, json=patch_data, headers=HEADERS) as resp:
                if resp.status not in (200, 204):
                    body = await resp.text()
                    logger.warning(f'[SYNC] energy_meters patch failed for {meter_vc_id}: {resp.status} {body[:200]}')
        except Exception as e:
            logger.warning(f'[SYNC] energy_meters patch failed: {e}')

    return True


DEKONING_GRID_ID = 'b0e1f2a3-4567-4890-abcd-ef0123456789'


async def ensure_virtual_grid(session):
    """Zorg dat de virtual grid voor De Koning EVBox bestaat."""
    grid = {
        'id': DEKONING_GRID_ID,
        'name': 'De Koning - EVBox 10 punten',
        'description': 'Dynamische load balancing voor EVB-P2447139 (10 connectors)',
        'location': 'De Koning',
        'gtv_limit_kw': 35.42,  # 154A * 230V = ~35.42 kW (3-fase)
        'balancing_strategy': 'dynamic',
        'enabled': True,
        'config': json.dumps({
            'max_amps': 154,
            'min_amps': 6,
            'grid_meter_id': GM400_METER_ID,
        }),
    }
    ok = await upsert(session, 'virtual_grids', [grid])
    if ok:
        # Voeg EVB-P2447139 toe als member
        member = {
            'id': 'c1d2e3f4-5678-4901-bcde-f01234567890',
            'grid_id': DEKONING_GRID_ID,
            'member_type': 'charge_point',
            'member_id': 'EVB-P2447139',
            'member_name': 'EVBox G3 - 10 punten',
            'priority': 1,
            'max_power_kw': 35.42,
            'enabled': True,
            'config': json.dumps({'connector_count': 10}),
        }
        await upsert(session, 'virtual_grid_members', [member])
    return ok


async def sync_load_balance(session, state):
    """Push load balancer status naar Voltcontrol."""
    import socket as _socket
    try:
        s = _socket.socket(_socket.AF_UNIX, _socket.SOCK_STREAM)
        s.settimeout(3)
        s.connect('/opt/ocpp/proxy.sock')
        s.sendall(json.dumps({'cp_id': '_lb', 'action': 'get_config', 'payload': {}}).encode())
        lb_data = json.loads(s.recv(8192).decode())
        s.close()
    except Exception:
        return True

    groups = lb_data.get('groups', {})
    rows = []

    for gid, group in groups.items():
        lb_state = group.get('_state', {})
        grid_available_kw = (group.get('_grid_available', 0) * 230) / 1000  # amps naar kW
        grid_power_kw = group.get('_grid_power_w', 0) / 1000
        gtv_limit_kw = (group.get('max_amps', 0) * 230) / 1000
        total_allocated = (lb_state.get('total_current', 0) * 230) / 1000

        allocations = []
        for conn in lb_state.get('connectors', []):
            allocations.append({
                'charge_point_id': conn.get('cp_id'),
                'connector_id': conn.get('connector_id'),
                'current_amps': conn.get('current_amps', 0),
                'limit_amps': conn.get('limit_amps', 0),
                'allocated_kw': (conn.get('limit_amps', 0) * 230) / 1000,
            })

        rows.append({
            'grid_id': DEKONING_GRID_ID,
            'grid_name': group.get('name', gid),
            'strategy': 'dynamic' if group.get('dynamic') else 'static',
            'total_available_kw': round(grid_available_kw, 2),
            'gtv_limit_kw': round(gtv_limit_kw, 2),
            'total_allocated_kw': round(total_allocated, 2),
            'allocations': json.dumps(allocations),
        })

    if rows:
        url = f'{SUPABASE_URL}/rest/v1/load_balance_logs'
        headers = {**HEADERS}
        headers.pop('Prefer', None)
        try:
            async with session.post(url, json=rows, headers=headers) as resp:
                if resp.status not in (200, 201, 204):
                    body = await resp.text()
                    logger.warning(f'[SYNC] load_balance_logs insert failed: {resp.status} {body[:200]}')
        except Exception as e:
            logger.warning(f'[SYNC] load_balance_logs request failed: {e}')

    return True


async def sync_loop():
    """Hoofdloop: sync alle data naar Voltcontrol.io."""
    global _meter_sync_counter
    if aiohttp is None:
        logger.error('[SYNC] aiohttp niet geïnstalleerd — pip install aiohttp')
        return

    logger.info(f'[SYNC] Voltcontrol sync gestart — chargers elke {SYNC_INTERVAL}s, meters elke {METER_SYNC_INTERVAL}s')

    errors_in_row = 0
    last_synced = 0
    gm400_created = False

    async with aiohttp.ClientSession() as session:
        while True:
            state = get_state()

            # 1. Charger sync via Edge Function (bypassed RLS)
            synced, errors = await sync_via_edge_function(session)

            if not errors:
                if errors_in_row > 0:
                    logger.info(f'[SYNC] Weer online na {errors_in_row} fouten — {synced} palen gesynct')
                errors_in_row = 0
                if synced != last_synced:
                    logger.info(f'[SYNC] {synced} palen gesynct naar Voltcontrol')
                    last_synced = synced
            else:
                errors_in_row += 1
                if errors_in_row == 1 or errors_in_row % 30 == 0:
                    logger.warning(f'[SYNC] Charger sync mislukt ({errors_in_row}x): {errors}')

            # 2. Ensure GM-400 meter + virtual grid exists in Voltcontrol
            if not gm400_created:
                ok1 = await ensure_gm400_meter(session)
                ok2 = await ensure_virtual_grid(session)
                if ok1 and ok2:
                    gm400_created = True
                    logger.info('[SYNC] GM-400 grid meter + De Koning virtual grid aangemaakt in Voltcontrol')

            # 3. Meter readings + health (elke METER_SYNC_INTERVAL seconden)
            _meter_sync_counter += SYNC_INTERVAL
            if _meter_sync_counter >= METER_SYNC_INTERVAL:
                _meter_sync_counter = 0
                await sync_meter_readings(session, state)
                await sync_meter_health(session, state)
                await sync_energy_meter_last_reading(session, state)
                await sync_load_balance(session, state)

            await asyncio.sleep(SYNC_INTERVAL)
