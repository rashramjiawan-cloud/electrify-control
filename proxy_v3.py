import asyncio
import logging
import json
import os
import ssl
from datetime import datetime, timezone
from pathlib import Path
from websockets.asyncio.server import serve
from websockets.asyncio.client import connect
from websockets.http11 import Response
from websockets.datastructures import Headers
from websockets.frames import Frame, Opcode
from ocpp.routing import on
from ocpp.v16 import ChargePoint as cp, call_result
from ocpp.v16.enums import Action, RegistrationStatus, AuthorizationStatus
import db
import ocpp15_handler
import shelly_poller  # Tec-Tronic grid meter module

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger('ocpp-proxy')

STATE_FILE = Path('/opt/ocpp/state.json')
SOCK_PATH = '/opt/ocpp/proxy.sock'

ALL_BACKENDS = {
    'voltcontrol': {
        'url': 'wss://lxdjtwxumzsyowdkahrt.supabase.co/functions/v1/ocpp-ws/{cp_id}',
        'subprotocols': ['ocpp1.6'],
        'ssl': True,
    },
    'evinty': {
        'url': 'ws://portal.evinity.io:80/cpms/websockets/{cp_id}',
        'subprotocols': ['ocpp1.6'],
        'ssl': False,
    },
    'eflux': {
        'url': 'ws://ocpp.e-flux.nl/1.6/e-flux/{cp_id}',
        'subprotocols': ['ocpp1.6'],
        'ssl': False,
    },
    'maxem': {
        'url': 'ws://socket.maxem.energy/{cp_id}',
        'subprotocols': ['ocpp1.6'],
        'ssl': False,
    },
}

CHARGER_BACKENDS = {
    '11772540': ['evinty'],
    '11772556': ['evinty'],
    '11772560': ['evinty'],
    '11727711': ['evinty'],
    'EVB-P2447137-VC': ['eflux'],
    'EVB-P2447139': ['maxem'],
    '1898380': ['evinty'],
    '1895745': ['evinty'],
    '1898502': ['evinty'],
}
DEFAULT_BACKENDS = ['evinty']

PING_FIX_TARGETS = []
STATUS_TRIGGER_TARGETS = []
STATUS_TRIGGER_INTERVAL = 30
FIRMWARE_TARGETS = []
FIRMWARE_URL = 'http://46.62.148.12/firmware.bin'
FIRMWARE_PATH = '/opt/ocpp/firmware.bin'

# Load Balancer — modulair groepen systeem
LB_CONFIG_FILE = Path('/opt/ocpp/lb_config.json')
LB_INTERVAL = 15  # seconds
LB_DEFAULT_MIN_AMPS = 6

# Load or init LB config
def load_lb_config():
    try:
        return json.loads(LB_CONFIG_FILE.read_text())
    except:
        return {'groups': {}}

def save_lb_config(config):
    tmp = LB_CONFIG_FILE.with_suffix('.tmp')
    tmp.write_text(json.dumps(config, indent=2))
    tmp.rename(LB_CONFIG_FILE)

lb_config = load_lb_config()

# VPS Monitor
VPS_MONITOR_ID = 'VPS-PROXY-01'
VPS_MONITOR_URL = ALL_BACKENDS['voltcontrol']['url'].format(cp_id=VPS_MONITOR_ID)
VPS_HEARTBEAT_INTERVAL = 60

# Shared state
backend_connections = {}
charger_websockets = {}
charger_state = {}
last_boot_messages = {}

# Init state from DB chargers (metadata for display) + reset runtime fields
try:
    for ch in db.get_all_chargers():
        cp_id = ch['cp_id']
        charger_state[cp_id] = {
            'connected': False, 'source_ip': None, 'connected_at': None,
            'last_heartbeat': None, 'connectors': {}, 'backends': {},
            'configured_backends': CHARGER_BACKENDS.get(cp_id, DEFAULT_BACKENDS),
            # Metadata from DB (read-only in state, source of truth is DB)
            'vendor': ch.get('vendor'), 'model': ch.get('model'),
            'firmware': ch.get('firmware'),
            'quarantine': {'active': ch.get('quarantine', False), 'reason': ch.get('quarantine_reason', '')},
        }
    logger.info(f'[STATE] Loaded {len(charger_state)} chargers from database')
except Exception as e:
    logger.warning(f'[STATE] Could not load from DB: {e}')
active_transactions = {}  # {cp_id: {connector_id: {transaction_id, start_time, ...}}}
_tx_seq = 0
_cmd_seq = 0


def next_tx_id():
    global _tx_seq
    _tx_seq += 1
    return _tx_seq


def next_cmd_id():
    global _cmd_seq
    _cmd_seq += 1
    return f'CMD{_cmd_seq:04d}'


def write_state():
    try:
        data = {
            'updated_at': datetime.now(timezone.utc).isoformat(),
            'chargers': charger_state,
        }
        tmp = STATE_FILE.with_suffix('.tmp')
        tmp.write_text(json.dumps(data, indent=2))
        tmp.rename(STATE_FILE)
    except Exception as e:
        logger.error(f'[STATE] Write error: {e}')


def update_charger_state(cp_id, **kwargs):
    if cp_id not in charger_state:
        charger_state[cp_id] = {
            'connected': False,
            'source_ip': None,
            'connected_at': None,
            'last_heartbeat': None,
            'connectors': {},
            'backends': {},
            'configured_backends': CHARGER_BACKENDS.get(cp_id, DEFAULT_BACKENDS),
        }
        db.ensure_charger(cp_id)
    charger_state[cp_id].update(kwargs)
    write_state()


# EV-BOX serienummer mapping — E-flux verwacht het korte serienummer
EVBOX_SERIAL_MAP = {
    'EVB-P2447137-VC': 'EVB-P2447137-VC',
    'EVB-P2447139': '2447139',
}


async def connect_backend(name, config, cp_id, resend_boot=False):
    # Gebruik het korte serienummer voor E-flux bij EV-BOX palen
    backend_cp_id = cp_id
    if name == 'eflux' and cp_id in EVBOX_SERIAL_MAP:
        backend_cp_id = EVBOX_SERIAL_MAP[cp_id]
        logger.info(f'[{name}] Using serial {backend_cp_id} instead of {cp_id} for E-flux')
    url = config['url'].format(cp_id=backend_cp_id)
    kwargs = {
        'subprotocols': config['subprotocols'],
        'ping_interval': 30,
        'ping_timeout': 60,
    }
    if config['ssl']:
        ctx = ssl.create_default_context()
        kwargs['ssl'] = ctx
    try:
        ws = await connect(url, **kwargs)
        logger.info(f'[{name}] Connected for {cp_id} -> {url}')
        if cp_id in charger_state:
            charger_state[cp_id].setdefault('backends', {})[name] = {'connected': True, 'connected_at': datetime.now(timezone.utc).isoformat()}
            write_state()
        if resend_boot and cp_id in last_boot_messages:
            try:
                await ws.send(last_boot_messages[cp_id])
                logger.info(f'[{name}] Resent BootNotification for {cp_id}')
            except Exception as e:
                logger.error(f'[{name}] Failed to resend Boot for {cp_id}: {e}')
        return ws
    except Exception as e:
        logger.error(f'[{name}] Failed for {cp_id}: {e}')
        if cp_id in charger_state:
            charger_state[cp_id].setdefault('backends', {})[name] = {'connected': False, 'error': str(e)}
            write_state()
        return None


async def forward_to_backends(cp_id, raw_message):
    if cp_id not in backend_connections:
        return
    try:
        parsed = json.loads(raw_message)
        if isinstance(parsed, list) and len(parsed) >= 4 and parsed[0] == 2 and parsed[2] == 'BootNotification':
            last_boot_messages[cp_id] = raw_message
            logger.info(f'[PROXY] Saved BootNotification for {cp_id}')
        # Filter: stuur responses op onze eigen commando's NIET naar backends
        if isinstance(parsed, list) and len(parsed) >= 2 and parsed[0] in (3, 4):
            msg_id = str(parsed[1])
            if msg_id.startswith('CMD') or msg_id.startswith('TRIG') or msg_id.startswith('HBI') or msg_id.startswith('PING'):
                logger.info(f'[PROXY] Not forwarding our response {msg_id} to backends')
                return
    except:
        pass
    for name, ws in list(backend_connections[cp_id].items()):
        if ws:
            try:
                await ws.send(raw_message)
                logger.info(f'[{name}] >> {cp_id}: {raw_message[:120]}')
            except Exception as e:
                logger.error(f'[{name}] Send error {cp_id}: {e}')
                backend_connections[cp_id][name] = None


async def listen_backend(name, ws, cp_id, charger_ws=None):
    try:
        async for msg in ws:
            logger.info(f'[{name}] << {cp_id}: {msg[:120]}')
            if charger_ws:
                try:
                    parsed = json.loads(msg)
                    if isinstance(parsed, list) and len(parsed) >= 3:
                        msg_type = parsed[0]
                        msg_id = str(parsed[1]) if len(parsed) > 1 else ''
                        if msg_type == 2:
                            # Call van backend naar paal — doorsturen
                            # MAAR: filter SetChargingProfile van backends (wij doen de load balancing)
                            action = parsed[2] if len(parsed) > 2 else ''
                            if action == 'SetChargingProfile':
                                logger.info(f'[PROXY] Blocked {action} from {name} to {cp_id} (wij doen LB)')
                            else:
                                await charger_ws.send(msg)
                                logger.info(f'[PROXY] Forwarded {action} from {name} to {cp_id}')
                        elif (msg_type == 3 or msg_type == 4) and msg_id.startswith('CMD'):
                            # Response op ons eigen commando — negeren van backend
                            logger.info(f'[PROXY] Ignored {name} response on our {msg_id}')
                        else:
                            # Andere responses (op paal-eigen berichten) — doorsturen
                            pass
                except Exception as e:
                    logger.error(f'[PROXY] Forward error {name} -> {cp_id}: {e}')
    except Exception as e:
        logger.info(f'[{name}] Disconnected {cp_id}: {e}')

    if cp_id in charger_state:
        charger_state[cp_id].setdefault('backends', {})[name] = {'connected': False}
        write_state()

    if cp_id in backend_connections and backend_connections[cp_id].get(name) is not None:
        backend_connections[cp_id][name] = None
        config = ALL_BACKENDS.get(name)
        if config:
            for attempt in range(3):
                wait = 10 * (attempt + 1)
                logger.info(f'[{name}] Reconnecting for {cp_id} in {wait}s (attempt {attempt+1}/3)...')
                await asyncio.sleep(wait)
                if cp_id not in backend_connections:
                    return
                new_ws = await connect_backend(name, config, cp_id, resend_boot=True)
                if new_ws:
                    backend_connections[cp_id][name] = new_ws
                    asyncio.create_task(listen_backend(name, new_ws, cp_id, charger_ws))
                    return
            logger.error(f'[{name}] Could not reconnect for {cp_id} after 3 attempts')


async def setup_backends(cp_id, charger_ws=None):
    backend_connections[cp_id] = {}
    backend_names = CHARGER_BACKENDS.get(cp_id, DEFAULT_BACKENDS)
    logger.info(f'[ROUTING] {cp_id} -> {", ".join(backend_names)}')

    async def connect_one(name):
        config = ALL_BACKENDS.get(name)
        if config:
            ws = await connect_backend(name, config, cp_id)
            backend_connections[cp_id][name] = ws
            if ws:
                asyncio.create_task(listen_backend(name, ws, cp_id, charger_ws))

    await asyncio.gather(*[connect_one(name) for name in backend_names])


async def cleanup_backends(cp_id):
    if cp_id in backend_connections:
        for name, ws in backend_connections[cp_id].items():
            if ws:
                try:
                    await ws.close()
                except:
                    pass
        del backend_connections[cp_id]
        logger.info(f'All backends closed for {cp_id}')
    charger_websockets.pop(cp_id, None)
    if cp_id in charger_state:
        charger_state[cp_id]['connected'] = False
        charger_state[cp_id]['backends'] = {}
        write_state()


class ChargePoint(cp):
    def __init__(self, cp_id, connection, source_ip):
        super().__init__(cp_id, connection)
        self.source_ip = source_ip

    @on(Action.boot_notification)
    async def on_boot_notification(self, charge_point_vendor, charge_point_model, **kwargs):
        logger.info(f'[DETAILS] {self.id} | IP: {self.source_ip} | Vendor: {charge_point_vendor} | Model: {charge_point_model} | Serial: {kwargs.get("charge_point_serial_number")} | Firmware: {kwargs.get("firmware_version")} | ICCID: {kwargs.get("iccid")} | IMSI: {kwargs.get("imsi")}')
        # Metadata naar DB (bron van waarheid), kopie in state voor dashboard
        update_charger_state(self.id,
            vendor=charge_point_vendor,
            model=charge_point_model,
            firmware=kwargs.get('firmware_version'),
        )
        db.update_charger(self.id, vendor=charge_point_vendor, model=charge_point_model,
            firmware=kwargs.get('firmware_version'), serial=kwargs.get('charge_point_serial_number'),
            iccid=kwargs.get('iccid'), imsi=kwargs.get('imsi'))
        db.save_event(self.id, 'boot', f'{charge_point_vendor} {charge_point_model} FW:{kwargs.get("firmware_version")}')

        return call_result.BootNotification(
            current_time=datetime.now(timezone.utc).isoformat(),
            interval=300,
            status=RegistrationStatus.accepted
        )

    @on(Action.heartbeat)
    async def on_heartbeat(self, **kwargs):
        logger.info(f'Heartbeat from {self.id}')
        now = datetime.now(timezone.utc).isoformat()
        if self.id in charger_state:
            hb_log = charger_state[self.id].setdefault('heartbeat_log', [])
            hb_log.append(now)
            charger_state[self.id]['heartbeat_log'] = hb_log[-20:]
        update_charger_state(self.id, last_heartbeat=now)
        return call_result.Heartbeat(current_time=now)

    @on(Action.authorize)
    async def on_authorize(self, id_tag, **kwargs):
        logger.info(f'Authorize {self.id} tag: {id_tag}')
        # Check of er een GPS sessie wacht op RFID koppeling
        waiting = db.get_waiting_gps_sessions(self.id)
        if waiting:
            session = waiting[0]
            driver_id = session.get('driver_id')
            if driver_id:
                db.link_rfid_to_driver(driver_id, id_tag)
                db.update_gps_session(session['id'], 'rfid_linked')
                logger.info(f'[GPS] RFID {id_tag} gekoppeld aan driver {driver_id} via paal {self.id}')
        return call_result.Authorize(id_tag_info={'status': AuthorizationStatus.accepted})

    @on(Action.start_transaction)
    async def on_start_transaction(self, connector_id, id_tag, meter_start, timestamp, **kwargs):
        tx_id = next_tx_id()
        logger.info(f'StartTransaction {self.id} connector={connector_id} tag={id_tag} tx={tx_id} meter={meter_start}')
        active_transactions.setdefault(self.id, {})[str(connector_id)] = {
            'transaction_id': tx_id,
            'connector_id': connector_id,
            'id_tag': id_tag,
            'start_time': timestamp,
            'meter_start': meter_start,
            'max_power_w': 0,
            'last_current_a': 0,
            'last_voltage_v': 0,
            'phases': set(),
            'meter_samples': [],
        }
        return call_result.StartTransaction(transaction_id=tx_id, id_tag_info={'status': AuthorizationStatus.accepted})

    @on(Action.stop_transaction)
    async def on_stop_transaction(self, meter_stop, timestamp, transaction_id, **kwargs):
        logger.info(f'StopTransaction {self.id} tx={transaction_id} meter={meter_stop}')
        # Find and close the active transaction
        tx = None
        conn_id = None
        for cid, t in active_transactions.get(self.id, {}).items():
            if t.get('transaction_id') == transaction_id:
                tx = t
                conn_id = cid
                break
        if tx:
            energy_wh = (meter_stop - tx['meter_start']) if tx['meter_start'] else 0
            energy_kwh = round(energy_wh / 1000, 2)
            try:
                from datetime import datetime as dt
                start = dt.fromisoformat(tx['start_time'].replace('Z', '+00:00')) if isinstance(tx['start_time'], str) else tx['start_time']
                stop = dt.fromisoformat(timestamp.replace('Z', '+00:00')) if isinstance(timestamp, str) else timestamp
                duration_sec = (stop - start).total_seconds()
                duration_min = round(duration_sec / 60)
            except:
                duration_min = 0
            phases_list = sorted(list(tx.get('phases', set()))) if tx.get('phases') else []
            session = {
                'transaction_id': transaction_id,
                'connector_id': tx['connector_id'],
                'id_tag': tx['id_tag'],
                'start_time': tx['start_time'],
                'stop_time': timestamp,
                'duration_min': duration_min,
                'energy_kwh': energy_kwh,
                'max_power_w': tx.get('max_power_w', 0),
                'last_current_a': tx.get('last_current_a', 0),
                'last_voltage_v': tx.get('last_voltage_v', 0),
                'phases': phases_list,
            }
            logger.info(f'[SESSION] {self.id} C{tx["connector_id"]}: {duration_min}min, {energy_kwh}kWh, max {tx.get("max_power_w",0)}W, phases={phases_list}')
            # Save to database
            energy_wh = int(energy_kwh * 1000)
            db.save_session(self.id, tx['connector_id'], transaction_id, tx['id_tag'],
                tx['start_time'], timestamp, duration_min, energy_wh,
                tx['meter_start'], meter_stop, tx.get('max_power_w', 0),
                kwargs.get('reason'))
            # Bereken kosten
            cost = db.calculate_cost(self.id, energy_wh, duration_min)
            if cost:
                # Update laatste sessie met kosten
                try:
                    with db.get_conn() as conn:
                        cur = conn.cursor()
                        cur.execute('UPDATE sessions SET tariff_id=%s, cost_excl_vat=%s, cost_incl_vat=%s WHERE cp_id=%s AND transaction_id=%s',
                            (cost['tariff_id'], cost['cost_excl_vat'], cost['cost_incl_vat'], self.id, transaction_id))
                except:
                    pass
                logger.info(f'[TARIEF] {self.id}: {cost["energy_kwh"]}kWh x {cost["price_per_kwh"]} = {cost["cost_excl_vat"]} excl BTW / {cost["cost_incl_vat"]} incl BTW')
            # Remove from active
            if conn_id and self.id in active_transactions:
                active_transactions[self.id].pop(conn_id, None)
        return call_result.StopTransaction(id_tag_info={'status': AuthorizationStatus.accepted})

    @on(Action.status_notification)
    async def on_status_notification(self, connector_id, error_code, status, **kwargs):
        logger.info(f'StatusNotification {self.id} connector={connector_id} status={status} error={error_code}')
        db.save_event(self.id, 'status', f'C{connector_id}: {status} ({error_code})')
        if error_code and error_code != 'NoError':
            db.save_alert(self.id, error_code, 'high' if 'Power' in error_code or 'Lock' in error_code else 'medium',
                f'Connector {connector_id}: {error_code} - {kwargs.get("info", "")}')
        elif status == 'Available' and error_code == 'NoError':
            db.resolve_alerts(self.id)
        if self.id in charger_state:
            charger_state[self.id].setdefault('connectors', {})[str(connector_id)] = {
                'status': status,
                'error_code': error_code,
                'info': kwargs.get('info', ''),
                'timestamp': kwargs.get('timestamp', datetime.now(timezone.utc).isoformat()),
            }
            write_state()
        return call_result.StatusNotification()

    @on(Action.meter_values)
    async def on_meter_values(self, connector_id, meter_value, **kwargs):
        logger.info(f'MeterValues {self.id} connector={connector_id}')
        if self.id in charger_state:
            charger_state[self.id].setdefault('connectors', {}). \
                setdefault(str(connector_id), {})['meter_values'] = meter_value
            write_state()
        # Save to database
        if meter_value:
            for mv in meter_value:
                ts = mv.get('timestamp')
                cur_a = vol_v = pow_w = ene_wh = None
                for sv in mv.get('sampled_value', mv.get('sampledValue', [])):
                    m = sv.get('measurand', '')
                    p = sv.get('phase', '')
                    try:
                        v = float(sv.get('value', 0))
                    except:
                        v = 0
                    if 'Current.Import' in m and not p:
                        cur_a = v
                    if 'Voltage' in m and not p:
                        vol_v = v
                    if 'Power.Active.Import' in m:
                        pow_w = v
                    if 'Energy.Active.Import' in m:
                        ene_wh = int(v)
                db.save_meter_value(self.id, connector_id, ts, cur_a, vol_v, pow_w, ene_wh)
        # Update active transaction with power/phase data
        tx = active_transactions.get(self.id, {}).get(str(connector_id))
        if tx and meter_value:
            for mv in meter_value:
                for sv in mv.get('sampled_value', mv.get('sampledValue', [])):
                    measurand = sv.get('measurand', '')
                    phase = sv.get('phase', '')
                    try:
                        val = float(sv.get('value', 0))
                    except:
                        val = 0
                    if 'Power' in measurand and val > tx.get('max_power_w', 0):
                        tx['max_power_w'] = round(val)
                    if 'Current' in measurand and not phase:
                        tx['last_current_a'] = round(val, 1)
                    if 'Voltage' in measurand and not phase:
                        tx['last_voltage_v'] = round(val, 1)
                    if phase and 'Current' in measurand and val > 0.5:
                        if isinstance(tx.get('phases'), set):
                            tx['phases'].add(phase)
        return call_result.MeterValues()

    @on(Action.data_transfer)
    async def on_data_transfer(self, vendor_id, **kwargs):
        logger.info(f'DataTransfer {self.id} vendor={vendor_id}')
        # Vang GPS data op van EV-BOX
        msg_id = kwargs.get('message_id', '')
        data = kwargs.get('data', '')
        if msg_id == 'evbGPSNotification' and data:
            try:
                import re
                m = re.search(r'(\d+).(\d+\.\d+),\s*(\d+).(\d+\.\d+)', data)
                if m:
                    lat = int(m.group(1)) + float(m.group(2)) / 60
                    lon = int(m.group(3)) + float(m.group(4)) / 60
                    db.set_charger_location(self.id, lat, lon)
                    logger.info(f'[GPS] {self.id}: {lat:.6f}, {lon:.6f}')
            except Exception as e:
                logger.error(f'[GPS] Parse error {self.id}: {e}')
        return call_result.DataTransfer(status='Accepted')

    @on(Action.firmware_status_notification)
    async def on_firmware_status_notification(self, status, **kwargs):
        logger.info(f'[FIRMWARE] {self.id} status: {status}')
        return call_result.FirmwareStatusNotification()


class ForwardingChargePoint(ChargePoint):
    def __init__(self, cp_id, connection, source_ip, push_firmware=False):
        super().__init__(cp_id, connection, source_ip)
        self.push_firmware = push_firmware
        self._first_response_sent = False

    async def start(self):
        original_send = self._connection.send
        original_recv = self._connection.recv
        cp_ref = self

        async def recv_and_forward():
            msg = await original_recv()
            await forward_to_backends(cp_ref.id, msg)
            return msg

        async def send_and_maybe_firmware(msg):
            await original_send(msg)
            if cp_ref.push_firmware and not cp_ref._first_response_sent:
                cp_ref._first_response_sent = True
                await asyncio.sleep(1)
                fw_msg = json.dumps([2, "FW001", "UpdateFirmware", {
                    "location": FIRMWARE_URL,
                    "retrieveDate": datetime.now(timezone.utc).isoformat()
                }])
                logger.info(f'[FIRMWARE] Sending UpdateFirmware to {cp_ref.id}')
                await original_send(fw_msg)
                logger.info(f'[FIRMWARE] Sent: {fw_msg}')

        self._connection.recv = recv_and_forward
        self._connection.send = send_and_maybe_firmware
        await super(ChargePoint, self).start()


def process_request(connection, request):
    # OCPP 1.5 SOAP handler — detect by Content-Type or path
    content_type = ''
    for name, value in request.headers.raw_items():
        if name.lower() == 'content-type':
            content_type = value.lower()
    is_soap = 'text/xml' in content_type or 'application/soap' in content_type
    is_ocpp_path = '/ocpp' in request.path.lower()

    if (is_soap or is_ocpp_path) and hasattr(request, 'body') and request.body:
        try:
            source_ip = connection.remote_address[0] if connection.remote_address else 'unknown'
            cp_id, response_xml = ocpp15_handler.process_soap(request.body, source_ip)
            if response_xml:
                resp_bytes = response_xml.encode('utf-8')
                return Response(200, 'OK', Headers({
                    'Content-Type': 'text/xml; charset=utf-8',
                    'Content-Length': str(len(resp_bytes)),
                }), body=resp_bytes)
        except Exception as e:
            logger.error(f'[OCPP1.5] SOAP error on port 80: {e}')
            return Response(500, 'Error', Headers({}), body=b'SOAP error')

    if 'firmware' in request.path:
        try:
            with open(FIRMWARE_PATH, 'rb') as f:
                data = f.read()
            logger.info(f'[FIRMWARE HTTP] Serving firmware.bin ({len(data)} bytes) to {connection.remote_address}')
            return Response(200, 'OK', Headers({
                'Content-Type': 'application/octet-stream',
                'Content-Length': str(len(data)),
            }), body=data)
        except Exception as e:
            logger.error(f'[FIRMWARE HTTP] Error: {e}')
            return Response(500, 'Error', Headers({}), body=b'error')
    return None


async def handle_command(data):
    """Handle a command from the dashboard via Unix socket."""
    global SITE_MAX_AMPS, MIN_CHARGE_AMPS
    try:
        cmd = json.loads(data)
        cp_id = cmd.get('cp_id')
        action = cmd.get('action')
        payload = cmd.get('payload', {})

        # Load balancer config
        if cp_id == '_lb':
            global lb_config
            if action == 'save_config':
                lb_config = payload
                save_lb_config(lb_config)
                logger.info(f'[LB] Config opgeslagen: {len(lb_config.get("groups", {}))} groepen')
                return json.dumps({'ok': True})
            elif action == 'get_config':
                return json.dumps(lb_config)
            elif action == 'add_group':
                gid = payload.get('id')
                lb_config.setdefault('groups', {})[gid] = {
                    'name': payload.get('name', gid),
                    'max_amps': payload.get('max_amps', 63),
                    'min_amps': payload.get('min_amps', LB_DEFAULT_MIN_AMPS),
                    'chargers': payload.get('chargers', []),
                    'parent': payload.get('parent'),
                    'enabled': True,
                    'dynamic': payload.get('dynamic', False),
                }
                save_lb_config(lb_config)
                logger.info(f'[LB] Groep toegevoegd: {gid}')
                return json.dumps({'ok': True, 'group': gid})
            elif action == 'remove_group':
                gid = payload.get('id')
                lb_config.get('groups', {}).pop(gid, None)
                save_lb_config(lb_config)
                logger.info(f'[LB] Groep verwijderd: {gid}')
                return json.dumps({'ok': True})
            elif action == 'update_group':
                gid = payload.get('id')
                group = lb_config.get('groups', {}).get(gid, {})
                for key in ('name', 'max_amps', 'min_amps', 'chargers', 'parent', 'enabled', 'dynamic'):
                    if key in payload:
                        group[key] = payload[key]
                lb_config.setdefault('groups', {})[gid] = group
                save_lb_config(lb_config)
                logger.info(f'[LB] Groep bijgewerkt: {gid}')
                return json.dumps({'ok': True})
            return json.dumps({'error': 'Onbekende LB actie'})

        # Grid bewaking config command
        if cp_id == '_gtv' and action == 'config':
            shelly_poller.set_grid_config(
                max_kw=payload.get('max_kw'),
                margin_pct=payload.get('margin_pct')
            )
            return json.dumps({'ok': True, 'max_kw': shelly_poller.GRID_MAX_KW, 'margin_pct': shelly_poller.GRID_MARGIN_PCT})

        # Quarantine command
        if cp_id == '_quarantine' and action == 'set':
            q_cp = payload.get('cp_id')
            q_active = payload.get('active', False)
            q_reason = payload.get('reason', '')
            if q_cp in charger_state:
                charger_state[q_cp]['quarantine'] = {'active': q_active, 'reason': q_reason}
                write_state()
            return json.dumps({'ok': True})

        # Charger config management (live, geen restart nodig)
        if cp_id == '_chargers':
            if action == 'list':
                return json.dumps({
                    'charger_backends': CHARGER_BACKENDS,
                    'serial_map': EVBOX_SERIAL_MAP,
                    'default_backends': DEFAULT_BACKENDS,
                })
            elif action == 'add':
                new_id = payload.get('cp_id')
                backends = payload.get('backends', DEFAULT_BACKENDS)
                serial = payload.get('serial')
                if not new_id:
                    return json.dumps({'error': 'cp_id verplicht'})
                CHARGER_BACKENDS[new_id] = backends
                if serial:
                    EVBOX_SERIAL_MAP[new_id] = serial
                # Initialiseer state entry
                if new_id not in charger_state:
                    charger_state[new_id] = {
                        'connected': False, 'source_ip': None,
                        'connected_at': None, 'last_heartbeat': None,
                        'connectors': {}, 'backends': {},
                        'configured_backends': backends,
                        'vendor': payload.get('vendor', ''),
                        'model': payload.get('model', ''),
                        'firmware': '', 'quarantine': {'active': False, 'reason': None},
                        'heartbeat_log': [],
                    }
                else:
                    charger_state[new_id]['configured_backends'] = backends
                write_state()
                logger.info(f'[CONFIG] Laadpaal toegevoegd: {new_id} -> {backends}')
                return json.dumps({'ok': True, 'cp_id': new_id, 'backends': backends})
            elif action == 'remove':
                rm_id = payload.get('cp_id')
                if not rm_id:
                    return json.dumps({'error': 'cp_id verplicht'})
                CHARGER_BACKENDS.pop(rm_id, None)
                EVBOX_SERIAL_MAP.pop(rm_id, None)
                # Sluit actieve websocket als die er is
                ws = charger_websockets.get(rm_id)
                if ws:
                    await ws.close(1000, 'Removed by admin')
                    charger_websockets.pop(rm_id, None)
                # Verwijder uit state
                charger_state.pop(rm_id, None)
                write_state()
                logger.info(f'[CONFIG] Laadpaal verwijderd: {rm_id}')
                return json.dumps({'ok': True, 'removed': rm_id})
            elif action == 'update':
                upd_id = payload.get('cp_id')
                if not upd_id:
                    return json.dumps({'error': 'cp_id verplicht'})
                if 'backends' in payload:
                    CHARGER_BACKENDS[upd_id] = payload['backends']
                    if upd_id in charger_state:
                        charger_state[upd_id]['configured_backends'] = payload['backends']
                if 'serial' in payload:
                    EVBOX_SERIAL_MAP[upd_id] = payload['serial']
                write_state()
                logger.info(f'[CONFIG] Laadpaal bijgewerkt: {upd_id}')
                return json.dumps({'ok': True, 'cp_id': upd_id})
            return json.dumps({'error': 'Onbekende charger actie. Gebruik: list, add, remove, update'})

        # Kick: close websocket server-side to force full reconnect
        if action == 'Kick':
            ws = charger_websockets.get(cp_id)
            if not ws:
                return json.dumps({'error': f'No active connection for {cp_id}'})
            logger.info(f'[CMD] Kicking {cp_id} - closing websocket server-side')
            await ws.close(1000, 'Kicked by admin')
            return json.dumps({'ok': True, 'action': 'kicked', 'cp_id': cp_id})

        ws = charger_websockets.get(cp_id)
        if not ws:
            return json.dumps({'error': f'No active connection for {cp_id}'})

        msg_id = next_cmd_id()
        msg = json.dumps([2, msg_id, action, payload])
        await ws.send(msg)
        logger.info(f'[CMD] Sent {action} to {cp_id}: {msg}')
        return json.dumps({'ok': True, 'message_id': msg_id, 'sent': msg})
    except Exception as e:
        logger.error(f'[CMD] Error: {e}')
        return json.dumps({'error': str(e)})


async def command_socket_server():
    """Unix domain socket server for receiving commands from dashboard."""
    try:
        os.unlink(SOCK_PATH)
    except OSError:
        pass

    server = await asyncio.start_unix_server(
        _handle_sock_client, path=SOCK_PATH
    )
    os.chmod(SOCK_PATH, 0o666)
    logger.info(f'[CMD] Command socket listening on {SOCK_PATH}')
    async with server:
        await server.serve_forever()


async def _handle_sock_client(reader, writer):
    try:
        data = await asyncio.wait_for(reader.read(4096), timeout=10)
        if data:
            response = await handle_command(data.decode())
            writer.write(response.encode())
            await writer.drain()
    except Exception as e:
        writer.write(json.dumps({'error': str(e)}).encode())
        await writer.drain()
    finally:
        writer.close()


async def on_connect(websocket):
    raw_path = websocket.request.path.strip('/')
    if not raw_path:
        return

    cp_id = raw_path.split('/')[-1]
    remote = websocket.remote_address
    source_ip = remote[0] if remote else 'unknown'
    logger.info(f'Charge point connected: {cp_id} | Source IP: {source_ip} | Path: /{raw_path}')
    db.save_event(cp_id, 'connected', f'IP: {source_ip}', source_ip)

    charger_websockets[cp_id] = websocket
    update_charger_state(cp_id,
        connected=True,
        source_ip=source_ip,
        connected_at=datetime.now(timezone.utc).isoformat(),
        configured_backends=CHARGER_BACKENDS.get(cp_id, DEFAULT_BACKENDS),
    )

    asyncio.create_task(setup_backends(cp_id, websocket))

    if cp_id in PING_FIX_TARGETS:
        async def send_ping_fix():
            await asyncio.sleep(3)
            try:
                msg = json.dumps([2, "PING001", "ChangeConfiguration", {
                    "key": "WebSocketPingInterval",
                    "value": "120"
                }])
                await websocket.send(msg)
                logger.info(f'[PING FIX] Sent WebSocketPingInterval=120 to {cp_id}')
            except Exception as e:
                logger.error(f'[PING FIX] Failed for {cp_id}: {e}')
        asyncio.create_task(send_ping_fix())

    # Auto-discover connectors: trigger StatusNotification na boot
    async def probe_and_configure(ws, cpid):
        await asyncio.sleep(5)
        try:
            # Auto-configure WebSocketPingInterval op Ecotap palen
            if not cpid.startswith('EVB'):
                msg = json.dumps([2, next_cmd_id(), 'ChangeConfiguration', {
                    'key': 'WebSocketPingInterval', 'value': '300'
                }])
                await ws.send(msg)
                logger.info(f'[AUTO-CFG] WebSocketPingInterval=300 voor {cpid}')

            # Probe connectors
            charger_info = db.get_charger(cpid)
            conn_ids_str = charger_info.get('connector_ids', '') if charger_info else ''
            if conn_ids_str:
                conn_ids = [int(c.strip()) for c in conn_ids_str.split(',') if c.strip()]
                logger.info(f'[PROBE] Using stored connector IDs for {cpid}: {conn_ids}')
            else:
                conn_ids = [1, 2]
            # Pre-populate connectors in state so they show in dashboard
            # even if TriggerMessage is rejected (EV-BOX issue)
            if cpid in charger_state:
                existing = charger_state[cpid].get('connectors', {})
                for cid in conn_ids:
                    if str(cid) not in existing:
                        charger_state[cpid].setdefault('connectors', {})[str(cid)] = {
                            'status': 'Available',
                            'error_code': 'NoError',
                            'info': '',
                            'timestamp': datetime.now(timezone.utc).isoformat(),
                        }
                write_state()
                logger.info(f'[PROBE] Pre-populated {len(conn_ids)} connectors for {cpid}')

            for cid in conn_ids:
                msg = json.dumps([2, next_cmd_id(), 'TriggerMessage', {
                    'requestedMessage': 'StatusNotification', 'connectorId': cid
                }])
                await ws.send(msg)
            logger.info(f'[PROBE] Triggered StatusNotification for {cpid}: {len(conn_ids)} connectors')
        except Exception as e:
            logger.error(f'[PROBE] Failed for {cpid}: {e}')
    asyncio.create_task(probe_and_configure(websocket, cp_id))

    push_fw = cp_id in FIRMWARE_TARGETS
    if push_fw:
        logger.info(f'[FIRMWARE] {cp_id} will receive firmware after first OCPP response')

    charge_point = ForwardingChargePoint(cp_id, websocket, source_ip, push_firmware=push_fw)
    try:
        await charge_point.start()
    except Exception as e:
        logger.info(f'Charge point disconnected: {cp_id} ({e})')
        db.save_event(cp_id, 'disconnected', str(e), source_ip)
    finally:
        if cp_id in charger_state:
            charger_state[cp_id]['connected'] = False
            write_state()
        await cleanup_backends(cp_id)


def get_connector_current(cp_id, cid, conn):
    """Haal huidige stroom op uit meter_values."""
    current_a = 0.0
    mv = conn.get('meter_values')
    if mv and len(mv) > 0:
        for sv in mv[0].get('sampled_value', []):
            if sv.get('measurand', '').startswith('Current.Import') and not sv.get('phase'):
                current_a = float(sv.get('value', 0))
                break
            elif sv.get('measurand', '').startswith('Current.Import') and sv.get('phase') == 'L1':
                current_a = float(sv.get('value', 0))
    return current_a


def get_active_connectors_for_group(charger_ids):
    """Verzamel actieve connectors voor een lijst van laadpalen."""
    active = []
    for cp_id in charger_ids:
        if cp_id not in charger_state or not charger_state[cp_id].get('connected'):
            continue
        # Skip quarantaine
        if charger_state[cp_id].get('quarantine', {}).get('active'):
            continue
        connectors = charger_state[cp_id].get('connectors', {})
        for cid, conn in connectors.items():
            if cid == '0':
                continue
            current_a = get_connector_current(cp_id, cid, conn)
            status = conn.get('status', '').lower()
            is_charging = status in ('charging', 'preparing', 'suspendedev', 'suspendedevse')
            has_current = current_a > 0.5
            if is_charging or has_current:
                active.append((cp_id, int(cid), current_a))
    return active


async def send_charging_profile(cp_id, cid, limit, group_id):
    """Stuur SetChargingProfile naar een connector."""
    ws = charger_websockets.get(cp_id)
    if not ws:
        return False
    profile_id = 100 + abs(hash(f'{group_id}_{cp_id}_{cid}')) % 900
    msg = json.dumps([2, next_cmd_id(), 'SetChargingProfile', {
        'connectorId': cid,
        'csChargingProfiles': {
            'chargingProfileId': profile_id,
            'stackLevel': 5,
            'chargingProfilePurpose': 'TxProfile',
            'chargingProfileKind': 'Absolute',
            'chargingSchedule': {
                'chargingRateUnit': 'A',
                'chargingSchedulePeriod': [
                    {'startPeriod': 0, 'limit': float(limit)}
                ]
            }
        }
    }])
    try:
        await ws.send(msg)
        return True
    except Exception as e:
        logger.error(f'[LB:{group_id}] Fout bij {cp_id} connector {cid}: {e}')
        return False


async def balance_group(group_id, group_cfg, parent_limit=None):
    """Balanceer een enkele groep. Returnt het totale verbruik."""
    max_amps = group_cfg.get('max_amps', 63)
    min_amps = group_cfg.get('min_amps', LB_DEFAULT_MIN_AMPS)
    charger_ids = group_cfg.get('chargers', [])
    enabled = group_cfg.get('enabled', True)

    if not enabled:
        return 0.0

    # Parent limiet overschrijft groep limiet als die lager is
    effective_max = min(max_amps, parent_limit) if parent_limit else max_amps

    active = get_active_connectors_for_group(charger_ids)
    if not active:
        return 0.0

    total_current = sum(a[2] for a in active)
    n = len(active)

    # Verdeel beschikbare capaciteit
    available_per = effective_max / n
    if available_per < min_amps:
        max_n = int(effective_max / min_amps)
        available_per = effective_max / max(max_n, 1)
        logger.warning(f'[LB:{group_id}] Te veel connectors ({n}), max {max_n} passen')

    limit = max(int(available_per), min_amps)

    logger.info(f'[LB:{group_id}] {n} actief, totaal {total_current:.1f}A, limiet {limit}A (max: {effective_max}A)')

    connectors_state = []
    for cp_id, cid, current_a in active:
        await send_charging_profile(cp_id, cid, limit, group_id)
        logger.info(f'[LB:{group_id}] {cp_id} C{cid}: {current_a:.1f}A -> limiet {limit}A')
        connectors_state.append({
            'cp_id': cp_id,
            'connector_id': cid,
            'current_amps': round(current_a, 1),
            'limit_amps': limit,
        })

    # Update group state
    group_cfg['_state'] = {
        'active_connectors': n,
        'total_current': round(total_current, 1),
        'effective_max': effective_max,
        'limit_per_connector': limit,
        'last_update': datetime.now(timezone.utc).isoformat(),
        'connectors': connectors_state,
    }

    return total_current


async def load_balancer():
    """Modulaire load balancer — verdeelt per groep en hierarchisch."""
    global lb_config
    logger.info(f'[LB] Modulaire load balancer gestart')

    while True:
        await asyncio.sleep(LB_INTERVAL)

        try:
            # Herlaad config (kan via API gewijzigd zijn)
            lb_config = load_lb_config()
            groups = lb_config.get('groups', {})

            if not groups:
                continue

            # Tec-Tronic dynamische limiet: pas root groep max_amps aan op basis van grid meter
            grid = shelly_poller.get_grid_meter()
            if grid:
                grid_available = shelly_poller.get_available_capacity()
                # Laagste fase bepaalt de limiet (voorkomen van scheefbelasting)
                min_available = min(grid_available.get('L1', 999), grid_available.get('L2', 999), grid_available.get('L3', 999))
                # Pas alle root groepen aan
                for gid, gcfg in groups.items():
                    if not gcfg.get('parent') and gcfg.get('dynamic', False):
                        old_max = gcfg.get('max_amps', 63)
                        # Beperk tot beschikbare grid capaciteit minus marge
                        margin = shelly_poller.GRID_MARGIN_PCT / 100
                        dynamic_max = int(min_available * (1 - margin))
                        dynamic_max = max(dynamic_max, LB_DEFAULT_MIN_AMPS)
                        if abs(dynamic_max - old_max) >= 2:  # alleen bijwerken bij verschil > 2A
                            gcfg['max_amps'] = dynamic_max
                            logger.info(f'[LB] Groep {gid} dynamisch aangepast: {old_max}A -> {dynamic_max}A (grid: {min_available:.0f}A beschikbaar)')
                        gcfg['_grid_available'] = round(min_available, 1)
                        gcfg['_grid_power_w'] = grid.get('total_power_w', 0)

            # Eerst child groepen (zonder children), dan parents
            # Bepaal hierarchie
            children_of = {}  # parent_id -> [child_ids]
            root_groups = []
            for gid, gcfg in groups.items():
                parent = gcfg.get('parent')
                if parent and parent in groups:
                    children_of.setdefault(parent, []).append(gid)
                else:
                    root_groups.append(gid)

            # Balanceer van leaf naar root
            async def process_group(gid, parent_limit=None):
                gcfg = groups[gid]
                children = children_of.get(gid, [])

                if children:
                    # Dit is een parent — eerst children balanceren
                    max_amps = gcfg.get('max_amps', 63)
                    effective_max = min(max_amps, parent_limit) if parent_limit else max_amps
                    child_total = 0.0
                    for child_id in children:
                        child_usage = await process_group(child_id, effective_max - child_total)
                        child_total += child_usage

                    # Eigen palen van parent ook balanceren met resterende capaciteit
                    own_chargers = gcfg.get('chargers', [])
                    if own_chargers:
                        remaining = effective_max - child_total
                        gcfg_own = dict(gcfg)
                        gcfg_own['max_amps'] = max(remaining, 0)
                        own_usage = await balance_group(gid, gcfg_own)
                        child_total += own_usage

                    gcfg['_state'] = gcfg.get('_state', {})
                    gcfg['_state']['children_total'] = round(child_total, 1)
                    gcfg['_state']['effective_max'] = effective_max
                    gcfg['_state']['last_update'] = datetime.now(timezone.utc).isoformat()
                    return child_total
                else:
                    # Leaf groep
                    return await balance_group(gid, gcfg, parent_limit)

            for gid in root_groups:
                await process_group(gid)

            # Sla LB state op
            # Grid meter info voor dashboard
            grid_info = {}
            if grid:
                grid_info = {
                    'total_power_w': grid.get('total_power_w', 0),
                    'total_current_a': grid.get('total_current_a', 0),
                    'available_per_phase': shelly_poller.get_available_capacity(),
                    'grid_status': shelly_poller.get_grid_status().get('status', 'unknown'),
                }

            charger_state['_load_balancer'] = {
                'enabled': True,
                'grid': grid_info,
                'groups': {gid: {
                    'name': gcfg.get('name', gid),
                    'max_amps': gcfg.get('max_amps', 0),
                    'min_amps': gcfg.get('min_amps', LB_DEFAULT_MIN_AMPS),
                    'enabled': gcfg.get('enabled', True),
                    'dynamic': gcfg.get('dynamic', False),
                    'parent': gcfg.get('parent'),
                    'chargers': gcfg.get('chargers', []),
                    'state': gcfg.get('_state', {}),
                    'grid_available': gcfg.get('_grid_available'),
                    'grid_power_w': gcfg.get('_grid_power_w'),
                } for gid, gcfg in groups.items()},
                'last_update': datetime.now(timezone.utc).isoformat(),
            }
            write_state()

            # Save config back (with updated _state)
            save_lb_config(lb_config)

        except Exception as e:
            logger.error(f'[LB] Error: {e}')


async def vps_monitor():
    ctx = ssl.create_default_context()
    while True:
        try:
            async with connect(
                VPS_MONITOR_URL,
                subprotocols=['ocpp1.6'],
                ssl=ctx,
                ping_interval=30,
                ping_timeout=60,
            ) as ws:
                logger.info(f'[VPS-MONITOR] Connected to Voltcontrol as {VPS_MONITOR_ID}')
                boot = json.dumps([2, 'BOOT001', 'BootNotification', {
                    'chargePointVendor': 'OCPP-Proxy',
                    'chargePointModel': 'VPS-Monitor',
                    'chargePointSerialNumber': VPS_MONITOR_ID,
                    'firmwareVersion': 'proxy-v3',
                }])
                await ws.send(boot)
                resp = await asyncio.wait_for(ws.recv(), timeout=10)
                logger.info(f'[VPS-MONITOR] Boot response: {resp}')

                connected = list(backend_connections.keys())
                status_msg = json.dumps([2, 'STATUS001', 'StatusNotification', {
                    'connectorId': 0,
                    'status': 'Available',
                    'errorCode': 'NoError',
                    'info': 'Proxy online. Connected: ' + (','.join(connected) if connected else 'none'),
                }])
                await ws.send(status_msg)
                await asyncio.wait_for(ws.recv(), timeout=10)

                seq = 0
                while True:
                    await asyncio.sleep(VPS_HEARTBEAT_INTERVAL)
                    seq += 1
                    hb = json.dumps([2, f'HB{seq:04d}', 'Heartbeat', {}])
                    await ws.send(hb)
                    resp = await asyncio.wait_for(ws.recv(), timeout=10)
                    logger.info(f'[VPS-MONITOR] Heartbeat #{seq} OK')

                    if seq % 1 == 0:
                        connected = list(backend_connections.keys())
                        status_msg = json.dumps([2, f'ST{seq:04d}', 'StatusNotification', {
                            'connectorId': 0,
                            'status': 'Available',
                            'errorCode': 'NoError',
                            'info': 'Connected: ' + (','.join(connected) if connected else 'none'),
                        }])
                        await ws.send(status_msg)
                        await asyncio.wait_for(ws.recv(), timeout=10)

        except Exception as e:
            logger.error(f'[VPS-MONITOR] Error: {e}, reconnecting in 30s...')
            await asyncio.sleep(30)


# === EV-BOX Grid Manager ===
# Preventief + nood-reset bij overbelasting
EVBOX_GRID_CONFIG = {
    'EVB-P2447139': {
        # evb_MaximumStationCurrent = totaal A over alle 10 connectors
        # Max hardware: 10 x 16A relay = 160A totaal
        'schedule': {  # uren UTC -> max station current (totaal)
            7: 800,    # 08:00 NL — werkdag start, 80A = 8A per punt
            9: 800,    # 10:00 NL — piek kantoor, 80A = 8A per punt (min 8A)
            12: 800,   # 13:00 NL — middagdip, 80A
            17: 800,   # 18:00 NL — avondpiek gebouw, 80A = 8A per punt (min 8A)
            20: 1200,  # 21:00 NL — avond, 120A = 12A per punt
            0: 1600,   # nacht — vol vermogen, 160A = 16A per punt
        },
        'emergency_threshold_pct': 90,  # nood-reset bij >90% grid
        'emergency_current': 800,       # nood: 80A totaal = 8A per punt (min 8A)
        'last_set': None,
        'last_hour': None,
        'emergency_active': False,
    }
}


async def evbox_grid_manager():
    """Beheert EV-BOX grid limieten: preventief schema + nood bij overbelasting."""
    logger.info('[EVBOX-GM] EV-BOX Grid Manager gestart')
    await asyncio.sleep(30)  # wacht op eerste data

    while True:
        await asyncio.sleep(60)  # check elke minuut
        try:
            from datetime import datetime
            now = datetime.now(timezone.utc)
            hour = now.hour

            for cp_id, cfg in EVBOX_GRID_CONFIG.items():
                ws = charger_websockets.get(cp_id)
                if not ws:
                    continue

                # === NOOD CHECK: grid overbelasting ===
                grid = shelly_poller.get_grid_meter()
                if grid:
                    grid_status = shelly_poller.get_grid_status()
                    load_pct = grid_status.get('load_pct', 0)

                    grid_power_w = grid.get('total_power_w', 0)
                    grid_max_w = shelly_poller.GRID_MAX_KW * 1000  # 150000W
                    available_w = grid_max_w - grid_power_w
                    available_a = max(0, available_w / 230 / 3)  # 3-fase
                    min_station = 800  # 80A = 8A per punt minimum

                    if load_pct >= cfg['emergency_threshold_pct'] and not cfg['emergency_active']:
                        # NOOD: grid bijna vol — bereken hoeveel de EV-BOX mag
                        # Beschikbaar vermogen omrekenen naar station current
                        emergency_val = max(min_station, int(available_a * 10))  # x10 want waarde is in deciAmpere
                        msg = json.dumps([2, next_cmd_id(), 'ChangeConfiguration', {
                            'key': 'evb_MaximumStationCurrent', 'value': str(emergency_val)
                        }])
                        await ws.send(msg)
                        logger.warning(f'[EVBOX-GM] NOOD {cp_id}: grid {grid_power_w/1000:.0f}kW/{grid_max_w/1000:.0f}kW ({load_pct:.0f}%) -> beschikbaar {available_a:.0f}A -> MaxCurrent={emergency_val}')
                        cfg['emergency_active'] = True
                        cfg['last_set'] = emergency_val
                        db.save_event(cp_id, 'grid_emergency', f'Grid {load_pct:.0f}% ({grid_power_w/1000:.0f}kW) -> MaxCurrent={emergency_val} (beschikbaar {available_a:.0f}A)')
                        # Soft reset om te activeren
                        await asyncio.sleep(2)
                        reset_msg = json.dumps([2, next_cmd_id(), 'Reset', {'type': 'Soft'}])
                        await ws.send(reset_msg)
                        logger.warning(f'[EVBOX-GM] NOOD RESET {cp_id}')
                        continue

                    elif load_pct < cfg['emergency_threshold_pct'] - 10 and cfg['emergency_active']:
                        # Grid terug normaal — herstel naar schema
                        cfg['emergency_active'] = False
                        logger.info(f'[EVBOX-GM] Grid normaal ({load_pct:.0f}%, {grid_power_w/1000:.0f}kW), noodmodus opgeheven voor {cp_id}')

                # === PREVENTIEF SCHEMA ===
                if cfg['emergency_active']:
                    continue  # niet wijzigen tijdens nood

                # Zoek de juiste limiet voor dit uur
                schedule = cfg['schedule']
                target_current = None
                for h in sorted(schedule.keys(), reverse=True):
                    if hour >= h:
                        target_current = schedule[h]
                        break
                if target_current is None:
                    target_current = schedule.get(0, 320)

                # Alleen wijzigen als het uur veranderd is
                if cfg['last_hour'] == hour:
                    continue
                cfg['last_hour'] = hour

                if cfg['last_set'] == target_current:
                    continue

                # Stel nieuwe limiet in
                msg = json.dumps([2, next_cmd_id(), 'ChangeConfiguration', {
                    'key': 'evb_MaximumStationCurrent', 'value': str(target_current)
                }])
                await ws.send(msg)
                logger.info(f'[EVBOX-GM] {cp_id}: schema {hour}:00 UTC -> MaxCurrent={target_current} (was {cfg.get("last_set")})')
                cfg['last_set'] = target_current
                db.save_event(cp_id, 'grid_schedule', f'Schema {hour}:00 -> MaxCurrent={target_current}')

                # GEEN reboot bij schema — wordt actief bij volgende boot/reconnect
                # Alleen bij nood doen we een soft reset

        except Exception as e:
            logger.error(f'[EVBOX-GM] Error: {e}')


async def tectronic_poll_loop():
    """Poll Tec-Tronic grid meters elke 10 seconden, log naar DB elke minuut."""
    logger.info('[TT] Tec-Tronic meter poller gestart (10s poll, 60s DB log)')
    db_log_counter = 0
    while True:
        try:
            shelly_poller.poll_all()
            charger_state['_tectronic'] = shelly_poller.get_all_data()
            write_state()

            # Log naar DB elke 6e poll (= elke minuut)
            db_log_counter += 1
            if db_log_counter >= 6:
                db_log_counter = 0
                for dev_data in shelly_poller.meter_data.values():
                    db.save_grid_meter(dev_data.get('device_id'), dev_data.get('role'), dev_data)
        except Exception as e:
            logger.error(f'[TT] Error: {e}')
        await asyncio.sleep(10)


async def main():
    ws_port = int(os.environ.get('OCPP_WS_PORT', 8081))
    async with serve(
        on_connect,
        '0.0.0.0',
        ws_port,
        subprotocols=['ocpp1.6'],
        ping_interval=300,
        ping_timeout=600,
        process_request=process_request,
    ) as server:
        # Start OCPP 1.5 SOAP handler
        _setup_ocpp15()
        logger.info(f'OCPP Proxy v3: ws://0.0.0.0:{ws_port} + SOAP://0.0.0.0:8180')
        logger.info(f'Firmware targets: {FIRMWARE_TARGETS}')
        logger.info(f'Firmware URL: {FIRMWARE_URL}')
        logger.info(f'Backends available: {", ".join(ALL_BACKENDS.keys())}')
        # Start Supabase sync (voltcontrol.io)
        from supabase_sync import sync_loop as _supabase_sync
        logger.info('Supabase sync module loaded')

        await asyncio.gather(
            server.serve_forever(),
            # vps_monitor(),
            command_socket_server(),
            load_balancer(),
            tectronic_poll_loop(),
            evbox_grid_manager(),
            _supabase_sync(),
        )


def _setup_ocpp15():
    def soap_boot(cp_id, vendor, model, serial, firmware, iccid, imsi):
        update_charger_state(cp_id, connected=True, source_ip='SOAP',
            connected_at=datetime.now(timezone.utc).isoformat(),
            vendor=vendor, model=model, firmware=firmware,
            configured_backends=CHARGER_BACKENDS.get(cp_id, DEFAULT_BACKENDS))
        try:
            db.update_charger(cp_id, vendor=vendor, model=model, firmware=firmware,
                serial=serial, iccid=iccid, imsi=imsi)
            db.save_event(cp_id, 'boot', f'OCPP1.5 SOAP: {vendor} {model} FW:{firmware}')
        except: pass

    def soap_heartbeat(cp_id):
        if cp_id in charger_state:
            charger_state[cp_id]['last_heartbeat'] = datetime.now(timezone.utc).isoformat()
            charger_state[cp_id]['connected'] = True
            write_state()

    def soap_status(cp_id, connector_id, status, error_code, timestamp):
        if cp_id not in charger_state:
            update_charger_state(cp_id, connected=True, source_ip='SOAP',
                connected_at=datetime.now(timezone.utc).isoformat(),
                configured_backends=CHARGER_BACKENDS.get(cp_id, DEFAULT_BACKENDS))
        charger_state[cp_id].setdefault('connectors', {})[str(connector_id)] = {
            'status': status, 'error_code': error_code, 'info': '', 'timestamp': timestamp}
        write_state()
        try:
            db.save_event(cp_id, 'status', f'SOAP C{connector_id}: {status} ({error_code})')
        except: pass

    def soap_start_tx(cp_id, connector_id, id_tag, meter_start, timestamp, tx_id):
        active_transactions.setdefault(cp_id, {})[str(connector_id)] = {
            'transaction_id': tx_id, 'connector_id': connector_id,
            'id_tag': id_tag, 'start_time': timestamp, 'meter_start': meter_start, 'max_power_w': 0}

    def soap_stop_tx(cp_id, tx_id, meter_stop, timestamp, id_tag):
        for cid, tx in list(active_transactions.get(cp_id, {}).items()):
            if tx.get('transaction_id') == tx_id:
                energy_wh = meter_stop - tx['meter_start']
                try:
                    start = datetime.fromisoformat(str(tx['start_time']).replace('Z', '+00:00'))
                    stop = datetime.fromisoformat(str(timestamp).replace('Z', '+00:00'))
                    duration_min = round((stop - start).total_seconds() / 60)
                except: duration_min = 0
                try:
                    db.save_session(cp_id, tx['connector_id'], tx_id, tx['id_tag'],
                        tx['start_time'], timestamp, duration_min, energy_wh,
                        tx['meter_start'], meter_stop, 0, None)
                except: pass
                active_transactions[cp_id].pop(cid, None)
                break

    def soap_meter(cp_id, connector_id, values):
        try:
            for v in values:
                db.save_meter_value(cp_id, connector_id, v.get('timestamp'), None, None, None,
                    int(float(v.get('value', 0))) if 'Energy' in v.get('measurand', '') else None)
        except: pass

    ocpp15_handler.on_boot = soap_boot
    ocpp15_handler.on_heartbeat = soap_heartbeat
    ocpp15_handler.on_authorize = lambda cp, tag: None
    ocpp15_handler.on_start_transaction = soap_start_tx
    ocpp15_handler.on_stop_transaction = soap_stop_tx
    ocpp15_handler.on_status_notification = soap_status
    ocpp15_handler.on_meter_values = soap_meter
    ocpp15_handler.start_soap_server(port=8180)


if __name__ == '__main__':
    asyncio.run(main())
