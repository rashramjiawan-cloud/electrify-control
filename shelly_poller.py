"""Tec-Tronic Grid Meter poller — haalt real-time data op van grid meters."""
import logging
import json
import urllib.request
from datetime import datetime, timezone

logger = logging.getLogger('tectronic')

SHELLY_SERVER = 'https://shelly-247-eu.shelly.cloud'
SHELLY_AUTH_KEY = 'M2YxODcwdWlk3967C9875BB6F74C290C04EA256AF4268B526249231EC5FA288729DE67117D6C74EB66596A911188'

# Device mapping
DEVICES = {
    '08f9e0e8eb98': {
        'name': 'Inkomende voeding 150kW',
        'type': 'Tec-Tronic GM-400',
        'role': 'grid_meter',  # meet totale aansluiting
    },
    'a4f00fcfa140': {
        'name': 'Verdeler EVBox',
        'type': 'Tec-Tronic GM-3EM Pro',
        'role': 'evse_meter',  # meet EVBox verdeler
    },
}

# Cached meter data
meter_data = {}


def poll_all():
    """Haal alle meter data op van Shelly Cloud. Returns dict met device_id -> data."""
    try:
        data = json.dumps({'auth_key': SHELLY_AUTH_KEY}).encode()
        url = f'{SHELLY_SERVER}/device/all_status'
        req = urllib.request.Request(url, data=f'auth_key={SHELLY_AUTH_KEY}'.encode(),
            headers={'Content-Type': 'application/x-www-form-urlencoded'})
        resp = urllib.request.urlopen(req, timeout=10)
        result = json.loads(resp.read())

        if not result.get('isok'):
            logger.error(f'[TT] API error: {result}')
            return meter_data

        devices_status = result.get('data', {}).get('devices_status', {})
        now = datetime.now(timezone.utc).isoformat()

        for dev_id, status in devices_status.items():
            device_info = DEVICES.get(dev_id, {'name': dev_id, 'type': 'unknown', 'role': 'unknown'})
            parsed = {
                'device_id': dev_id,
                'name': device_info['name'],
                'type': device_info['type'],
                'role': device_info['role'],
                'timestamp': now,
                'online': status.get('cloud', {}).get('connected', False) if 'cloud' in status else True,
                'phases': {},
                'total_power_w': 0,
                'total_current_a': 0,
                'total_energy_wh': 0,
            }

            # Gen2 devices (em:0)
            if 'em:0' in status:
                em = status['em:0']
                for prefix, phase in [('a', 'L1'), ('b', 'L2'), ('c', 'L3')]:
                    parsed['phases'][phase] = {
                        'power_w': round(em.get(f'{prefix}_act_power', 0)),
                        'apparent_power_va': round(em.get(f'{prefix}_aprt_power', 0)),
                        'current_a': round(em.get(f'{prefix}_current', 0), 2),
                        'voltage_v': round(em.get(f'{prefix}_voltage', 0), 1),
                        'pf': round(em.get(f'{prefix}_pf', 0), 2),
                        'freq_hz': em.get(f'{prefix}_freq', 50),
                    }
                parsed['total_power_w'] = round(em.get('total_act_power', 0))
                parsed['total_apparent_power_va'] = round(em.get('total_aprt_power', 0))
                parsed['total_current_a'] = round(em.get('total_current', 0), 2)
                parsed['n_current_a'] = em.get('n_current')
                parsed['frequency_hz'] = em.get('a_freq', 50)

            # Gen2 energy data (per fase)
            if 'emdata:0' in status:
                emd = status['emdata:0']
                parsed['total_energy_wh'] = round(emd.get('total_act', 0) * 1000)
                parsed['total_energy_ret_wh'] = round(emd.get('total_act_ret', 0) * 1000)
                parsed['energy_per_phase'] = {
                    'L1': {'import_wh': round(emd.get('a_total_act_energy', 0) * 1000), 'export_wh': round(emd.get('a_total_act_ret_energy', 0) * 1000)},
                    'L2': {'import_wh': round(emd.get('b_total_act_energy', 0) * 1000), 'export_wh': round(emd.get('b_total_act_ret_energy', 0) * 1000)},
                    'L3': {'import_wh': round(emd.get('c_total_act_energy', 0) * 1000), 'export_wh': round(emd.get('c_total_act_ret_energy', 0) * 1000)},
                }

            # Temperatuur
            if 'temperature:0' in status:
                parsed['temperature_c'] = status['temperature:0'].get('tC')

            # Systeem info
            if 'sys' in status:
                parsed['uptime_s'] = status['sys'].get('uptime', 0)
                parsed['mac'] = status['sys'].get('mac', '')

            # Netwerk
            if 'eth' in status:
                parsed['ip'] = status['eth'].get('ip', '')
            elif 'wifi' in status:
                parsed['ip'] = status['wifi'].get('sta_ip', '')

            # Cloud status
            if 'cloud' in status:
                parsed['online'] = status['cloud'].get('connected', False)

            # Gen1 devices (emeters)
            if 'emeters' in status:
                emeters = status['emeters']
                phase_names = ['L1', 'L2', 'L3']
                for i, em in enumerate(emeters):
                    if i < 3:
                        parsed['phases'][phase_names[i]] = {
                            'power_w': round(em.get('power', 0)),
                            'current_a': round(em.get('current', 0), 2),
                            'voltage_v': round(em.get('voltage', 0), 1),
                            'pf': round(em.get('pf', 0), 2),
                            'apparent_power_va': round(em.get('current', 0) * em.get('voltage', 0)),
                            'freq_hz': 50,
                        }
                parsed['total_power_w'] = round(sum(em.get('power', 0) for em in emeters))
                parsed['total_current_a'] = round(sum(em.get('current', 0) for em in emeters), 2)
                parsed['total_energy_wh'] = round(sum(em.get('total', 0) for em in emeters))

            meter_data[dev_id] = parsed

        logger.info(f'[TT] Polled {len(devices_status)} devices: ' +
            ', '.join(f'{meter_data[d]["name"]}={meter_data[d]["total_power_w"]}W' for d in devices_status if d in meter_data))

    except Exception as e:
        logger.error(f'[TT] Poll error: {e}')

    return meter_data


def get_grid_meter():
    """Haal grid meter data op (inkomende voeding)."""
    for dev_id, data in meter_data.items():
        if data.get('role') == 'grid_meter':
            return data
    return None


def get_evse_meter():
    """Haal EVBox verdeler meter data op."""
    for dev_id, data in meter_data.items():
        if data.get('role') == 'evse_meter':
            return data
    return None


def get_available_capacity(max_amps_per_phase=217):
    """Bereken beschikbare capaciteit per fase (150kW = ~217A per fase bij 230V)."""
    grid = get_grid_meter()
    if not grid:
        return {'L1': max_amps_per_phase, 'L2': max_amps_per_phase, 'L3': max_amps_per_phase}

    available = {}
    for phase in ['L1', 'L2', 'L3']:
        used = grid['phases'].get(phase, {}).get('current_a', 0)
        available[phase] = round(max_amps_per_phase - used, 1)

    return available


# Overbelasting bewaking
GRID_MAX_KW = 150
GRID_MARGIN_PCT = 10  # instelbaar — waarschuwing bij (100 - marge)%
grid_history = []  # laatste 60 metingen voor trend


def get_grid_status():
    """Bereken overbelasting status op basis van grid meter."""
    grid = get_grid_meter()
    if not grid:
        return {'status': 'unknown', 'message': 'Geen grid meter data'}

    max_w = GRID_MAX_KW * 1000
    total_power = max(grid.get('total_power_w', 0), 0)
    phases = grid.get('phases', {})

    load_pct = (total_power / max_w) * 100 if max_w > 0 else 0
    warning_pct = 100 - GRID_MARGIN_PCT  # bijv. 90%

    # Per fase check
    max_amps_per_phase = max_w / 3 / 230  # ~217A bij 150kW
    phase_loads = {}
    highest_phase_pct = 0
    for phase, data in phases.items():
        current = data.get('current_a', 0)
        phase_pct = (current / max_amps_per_phase) * 100 if max_amps_per_phase > 0 else 0
        phase_loads[phase] = {
            'current_a': current,
            'power_w': data.get('power_w', 0),
            'voltage_v': data.get('voltage_v', 0),
            'load_pct': round(phase_pct, 1),
        }
        if phase_pct > highest_phase_pct:
            highest_phase_pct = phase_pct

    # Status bepalen
    if load_pct >= 100:
        status = 'alarm'
        message = f'OVERBELASTING: {total_power/1000:.1f} kW ({load_pct:.0f}% van {GRID_MAX_KW} kW)'
    elif load_pct >= warning_pct:
        status = 'warning'
        message = f'Hoog verbruik: {total_power/1000:.1f} kW ({load_pct:.0f}% — marge bereikt)'
    elif highest_phase_pct >= 100:
        status = 'phase_alarm'
        message = f'Fase overbelasting: een fase boven {max_amps_per_phase:.0f}A'
    elif load_pct >= 50:
        status = 'normal'
        message = f'Verbruik: {total_power/1000:.1f} kW ({load_pct:.0f}%)'
    else:
        status = 'ok'
        message = f'Laag verbruik: {total_power/1000:.1f} kW ({load_pct:.0f}%)'

    result = {
        'status': status,
        'message': message,
        'max_kw': GRID_MAX_KW,
        'margin_pct': GRID_MARGIN_PCT,
        'warning_at_pct': warning_pct,
        'total_power_w': total_power,
        'consumption_kw': round(total_power / 1000, 1),
        'load_pct': round(load_pct, 1),
        'max_amps_per_phase': round(max_amps_per_phase, 0),
        'phase_loads': phase_loads,
        'highest_phase_pct': round(highest_phase_pct, 1),
        'available_kw': round((max_w - total_power) / 1000, 1),
        'timestamp': grid.get('timestamp', ''),
    }

    # Bewaar historie (max 360 = 1 uur bij 10s interval)
    grid_history.append({
        'ts': grid.get('timestamp', ''),
        'power_w': total_power,
        'load_pct': round(load_pct, 1),
    })
    if len(grid_history) > 360:
        grid_history.pop(0)

    result['history'] = grid_history[-360:]
    return result


def set_grid_config(max_kw=None, margin_pct=None):
    global GRID_MAX_KW, GRID_MARGIN_PCT
    if max_kw is not None:
        GRID_MAX_KW = max_kw
    if margin_pct is not None:
        GRID_MARGIN_PCT = margin_pct
    logger.info(f'[GRID] Config: max={GRID_MAX_KW}kW, marge={GRID_MARGIN_PCT}%')


def get_all_data():
    """Return alle meter data voor dashboard."""
    grid = get_grid_meter()
    evse = get_evse_meter()
    return {
        'grid_meter': grid,
        'evse_meter': evse,
        'available_capacity': get_available_capacity(),
        'grid_status': get_grid_status(),
        'devices': list(meter_data.values()),
    }
