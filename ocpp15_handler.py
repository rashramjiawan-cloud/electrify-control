"""OCPP 1.5 SOAP Handler — integreert met de bestaande OCPP proxy."""
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import json

logger = logging.getLogger('ocpp15')

NS = {
    'soap': 'http://www.w3.org/2003/05/soap-envelope',
    'cs': 'urn://Ocpp/Cs/2012/06/',
    'wsa': 'http://www.w3.org/2005/08/addressing',
}

# Callback functions (set by proxy)
on_boot = None
on_heartbeat = None
on_authorize = None
on_start_transaction = None
on_stop_transaction = None
on_status_notification = None
on_meter_values = None

_tx_counter = 1000


def _now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _get_text(elem, path, default=''):
    el = elem.find(path, NS)
    return el.text.strip() if el is not None and el.text else default


def _soap_response(action, body_xml, relates_to=''):
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:cs="urn://Ocpp/Cs/2012/06/"
               xmlns:wsa="http://www.w3.org/2005/08/addressing">
  <soap:Header>
    <wsa:Action>/{action}Response</wsa:Action>
    <wsa:MessageID>resp-{relates_to}</wsa:MessageID>
    <wsa:RelatesTo>{relates_to}</wsa:RelatesTo>
  </soap:Header>
  <soap:Body>
    {body_xml}
  </soap:Body>
</soap:Envelope>'''


def handle_boot_notification(cp_id, body):
    vendor = _get_text(body, './/cs:chargePointVendor')
    model = _get_text(body, './/cs:chargePointModel')
    serial = _get_text(body, './/cs:chargePointSerialNumber')
    firmware = _get_text(body, './/cs:firmwareVersion')
    iccid = _get_text(body, './/cs:iccid')
    imsi = _get_text(body, './/cs:imsi')
    logger.info(f'[OCPP1.5] BootNotification {cp_id} | {vendor} {model} | FW:{firmware}')
    if on_boot:
        on_boot(cp_id, vendor, model, serial, firmware, iccid, imsi)
    return f'''<cs:bootNotificationResponse>
      <cs:status>Accepted</cs:status>
      <cs:currentTime>{_now()}</cs:currentTime>
      <cs:heartbeatInterval>300</cs:heartbeatInterval>
    </cs:bootNotificationResponse>'''


def handle_heartbeat(cp_id, body):
    logger.info(f'[OCPP1.5] Heartbeat {cp_id}')
    if on_heartbeat:
        on_heartbeat(cp_id)
    return f'''<cs:heartbeatResponse>
      <cs:currentTime>{_now()}</cs:currentTime>
    </cs:heartbeatResponse>'''


def handle_authorize(cp_id, body):
    id_tag = _get_text(body, './/cs:idTag')
    logger.info(f'[OCPP1.5] Authorize {cp_id} tag:{id_tag}')
    if on_authorize:
        on_authorize(cp_id, id_tag)
    return f'''<cs:authorizeResponse>
      <cs:idTagInfo>
        <cs:status>Accepted</cs:status>
      </cs:idTagInfo>
    </cs:authorizeResponse>'''


def handle_start_transaction(cp_id, body):
    global _tx_counter
    _tx_counter += 1
    connector_id = _get_text(body, './/cs:connectorId', '0')
    id_tag = _get_text(body, './/cs:idTag')
    meter_start = _get_text(body, './/cs:meterStart', '0')
    timestamp = _get_text(body, './/cs:timestamp', _now())
    logger.info(f'[OCPP1.5] StartTransaction {cp_id} C{connector_id} tag:{id_tag} meter:{meter_start}')
    if on_start_transaction:
        on_start_transaction(cp_id, int(connector_id), id_tag, int(meter_start), timestamp, _tx_counter)
    return f'''<cs:startTransactionResponse>
      <cs:transactionId>{_tx_counter}</cs:transactionId>
      <cs:idTagInfo>
        <cs:status>Accepted</cs:status>
      </cs:idTagInfo>
    </cs:startTransactionResponse>'''


def handle_stop_transaction(cp_id, body):
    tx_id = _get_text(body, './/cs:transactionId', '0')
    meter_stop = _get_text(body, './/cs:meterStop', '0')
    timestamp = _get_text(body, './/cs:timestamp', _now())
    id_tag = _get_text(body, './/cs:idTag')
    logger.info(f'[OCPP1.5] StopTransaction {cp_id} tx:{tx_id} meter:{meter_stop}')
    if on_stop_transaction:
        on_stop_transaction(cp_id, int(tx_id), int(meter_stop), timestamp, id_tag)
    return f'''<cs:stopTransactionResponse>
      <cs:idTagInfo>
        <cs:status>Accepted</cs:status>
      </cs:idTagInfo>
    </cs:stopTransactionResponse>'''


def handle_status_notification(cp_id, body):
    connector_id = _get_text(body, './/cs:connectorId', '0')
    error_code = _get_text(body, './/cs:errorCode', 'NoError')
    status = _get_text(body, './/cs:status', 'Available')
    timestamp = _get_text(body, './/cs:timestamp', _now())
    logger.info(f'[OCPP1.5] StatusNotification {cp_id} C{connector_id} status:{status} error:{error_code}')
    if on_status_notification:
        on_status_notification(cp_id, int(connector_id), status, error_code, timestamp)
    return '<cs:statusNotificationResponse/>'


def handle_meter_values(cp_id, body):
    connector_id = _get_text(body, './/cs:connectorId', '0')
    # Parse meter values
    values = []
    for mv in body.findall('.//cs:values', NS):
        timestamp = _get_text(mv, 'cs:timestamp', _now())
        for v in mv.findall('cs:value', NS):
            values.append({
                'timestamp': timestamp,
                'value': v.text.strip() if v.text else '0',
                'measurand': v.get('measurand', 'Energy.Active.Import.Register'),
                'unit': v.get('unit', 'Wh'),
            })
    logger.info(f'[OCPP1.5] MeterValues {cp_id} C{connector_id} ({len(values)} values)')
    if on_meter_values:
        on_meter_values(cp_id, int(connector_id), values)
    return '<cs:meterValuesResponse/>'


def handle_firmware_status(cp_id, body):
    status = _get_text(body, './/cs:status', 'Idle')
    logger.info(f'[OCPP1.5] FirmwareStatus {cp_id}: {status}')
    return '<cs:firmwareStatusNotificationResponse/>'


def handle_diagnostics_status(cp_id, body):
    status = _get_text(body, './/cs:status', 'Idle')
    logger.info(f'[OCPP1.5] DiagnosticsStatus {cp_id}: {status}')
    return '<cs:diagnosticsStatusNotificationResponse/>'


def handle_data_transfer(cp_id, body):
    vendor_id = _get_text(body, './/cs:vendorId')
    logger.info(f'[OCPP1.5] DataTransfer {cp_id} vendor:{vendor_id}')
    return '''<cs:dataTransferResponse>
      <cs:status>Accepted</cs:status>
    </cs:dataTransferResponse>'''


HANDLERS = {
    'BootNotification': handle_boot_notification,
    'Heartbeat': handle_heartbeat,
    'Authorize': handle_authorize,
    'StartTransaction': handle_start_transaction,
    'StopTransaction': handle_stop_transaction,
    'StatusNotification': handle_status_notification,
    'MeterValues': handle_meter_values,
    'FirmwareStatusNotification': handle_firmware_status,
    'DiagnosticsStatusNotification': handle_diagnostics_status,
    'DataTransfer': handle_data_transfer,
}


def process_soap(xml_bytes, source_ip=''):
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        logger.error(f'[OCPP1.5] XML parse error: {e}')
        return None, None

    # Extract chargeBoxIdentity
    cp_id = _get_text(root, './/cs:chargeBoxIdentity', '')
    if not cp_id:
        # Try from path or other sources
        cp_id = 'unknown'

    # Extract action
    action_el = root.find('.//wsa:Action', NS)
    action = action_el.text.strip().lstrip('/') if action_el is not None and action_el.text else ''

    # Extract message ID
    msg_id_el = root.find('.//wsa:MessageID', NS)
    msg_id = msg_id_el.text.strip() if msg_id_el is not None and msg_id_el.text else '0'

    body = root.find('.//soap:Body', NS)
    if body is None:
        logger.error(f'[OCPP1.5] No SOAP Body found')
        return None, None

    handler = HANDLERS.get(action)
    if not handler:
        logger.warning(f'[OCPP1.5] Unknown action: {action} from {cp_id}')
        return cp_id, None

    response_body = handler(cp_id, body)
    response_xml = _soap_response(action, response_body, msg_id)
    return cp_id, response_xml


class OCPP15Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        xml_bytes = self.rfile.read(content_length)
        source_ip = self.client_address[0]

        cp_id, response_xml = process_soap(xml_bytes, source_ip)

        if response_xml:
            response_bytes = response_xml.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/xml; charset=utf-8')
            self.send_header('Content-Length', str(len(response_bytes)))
            self.end_headers()
            self.wfile.write(response_bytes)
        else:
            self.send_response(400)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress HTTP access logs


def start_soap_server(port=8180):
    server = HTTPServer(('0.0.0.0', port), OCPP15Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info(f'[OCPP1.5] SOAP server running on http://0.0.0.0:{port}')
    return server
