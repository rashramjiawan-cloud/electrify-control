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


async def sync_via_edge_function(session):
    """Trigger de sync-external-chargepoints Edge Function.

    Deze functie draait met service_role rechten in Supabase en bypassed RLS.
    Hij haalt zelf data op en schrijft naar charge_points, connectors, etc.
    """
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


async def sync_loop():
    """Hoofdloop: trigger Supabase sync-external-chargepoints elke SYNC_INTERVAL seconden."""
    if aiohttp is None:
        logger.error('[SYNC] aiohttp niet geïnstalleerd — pip install aiohttp')
        return

    logger.info(f'[SYNC] Voltcontrol sync gestart — interval {SYNC_INTERVAL}s via Edge Function')

    errors_in_row = 0
    last_synced = 0

    async with aiohttp.ClientSession() as session:
        while True:
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
                    logger.warning(f'[SYNC] Mislukt ({errors_in_row}x): {errors}')

            await asyncio.sleep(SYNC_INTERVAL)
