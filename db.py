"""Database module voor OCPP EMS."""
import psycopg2
import psycopg2.extras
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from contextlib import contextmanager

# Email config voor storing meldingen
SERVICE_EMAIL = 'service@mijninstallatiepartner.nl'
FROM_EMAIL = 'ems@tec-tronic.nl'
SMTP_HOST = 'localhost'  # lokale mail of externe SMTP
SMTP_PORT = 25


def send_issue_email(cp_id, issue_type, reporter_name, reporter_phone, description):
    """Stuur storing melding per email naar service partner."""
    try:
        issue_labels = {
            'niet_laden': 'Laadpaal laadt niet',
            'kabel_vast': 'Kabel zit vast',
            'display_kapot': 'Display/LED kapot',
            'pas_werkt_niet': 'Pas wordt niet herkend',
            'overig': 'Overig',
        }
        subject = f'[STORING] Laadpaal {cp_id} — {issue_labels.get(issue_type, issue_type)}'
        body = f"""Nieuwe storingsmelding via Tec-Tronic EMS

Laadpaal: {cp_id}
Type storing: {issue_labels.get(issue_type, issue_type)}
Beschrijving: {description or 'Geen beschrijving'}

Gemeld door: {reporter_name or 'Onbekend'}
Telefoon: {reporter_phone or 'Niet opgegeven'}

Tijdstip: {datetime.now(timezone.utc).strftime('%d-%m-%Y %H:%M UTC')}

---
Dashboard: http://46.62.148.12:8080
Laadpaal detail: http://46.62.148.12:8080/charger/{cp_id}
"""
        msg = MIMEMultipart()
        msg['From'] = FROM_EMAIL
        msg['To'] = SERVICE_EMAIL
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.sendmail(FROM_EMAIL, SERVICE_EMAIL, msg.as_string())
        logger.info(f'[EMAIL] Storing melding verstuurd voor {cp_id} naar {SERVICE_EMAIL}')
        return True
    except Exception as e:
        logger.error(f'[EMAIL] Fout bij versturen: {e}')
        return False


DB_CONFIG = {
    'dbname': 'ocpp_ems',
    'user': 'ocpp',
    'password': 'LaadpaalEMS2026!',
    'host': 'localhost',
}

logger = logging.getLogger('ocpp-db')


@contextmanager
def get_conn():
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def save_event(cp_id, event_type, detail=None, source_ip=None):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO events (cp_id, event_type, detail, source_ip) VALUES (%s, %s, %s, %s)',
                (cp_id, event_type, detail, source_ip)
            )
    except Exception as e:
        logger.error(f'DB event error: {e}')


def save_session(cp_id, connector_id, transaction_id, id_tag, start_time, stop_time,
                 duration_min, energy_wh, meter_start=None, meter_stop=None,
                 max_power_w=0, stop_reason=None):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute('''
                INSERT INTO sessions (cp_id, connector_id, transaction_id, id_tag,
                    start_time, stop_time, duration_min, energy_wh,
                    meter_start, meter_stop, max_power_w, stop_reason)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''', (cp_id, connector_id, transaction_id, id_tag,
                  start_time, stop_time, duration_min, energy_wh,
                  meter_start, meter_stop, max_power_w, stop_reason))
    except Exception as e:
        logger.error(f'DB session error: {e}')


def save_meter_value(cp_id, connector_id, timestamp, current_a=None, voltage_v=None,
                     power_w=None, energy_wh=None, phase=None):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute('''
                INSERT INTO meter_values (cp_id, connector_id, timestamp,
                    current_a, voltage_v, power_w, energy_wh, phase)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ''', (cp_id, connector_id, timestamp, current_a, voltage_v, power_w, energy_wh, phase))
    except Exception as e:
        logger.error(f'DB meter error: {e}')


def save_alert(cp_id, alert_type, severity, message):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            # Check of er al een onopgeloste alert is van dit type
            cur.execute(
                'SELECT id FROM alerts WHERE cp_id=%s AND alert_type=%s AND resolved=FALSE',
                (cp_id, alert_type)
            )
            if cur.fetchone():
                return  # al een actieve alert
            cur.execute(
                'INSERT INTO alerts (cp_id, alert_type, severity, message) VALUES (%s, %s, %s, %s)',
                (cp_id, alert_type, severity, message)
            )
    except Exception as e:
        logger.error(f'DB alert error: {e}')


def resolve_alerts(cp_id, alert_type=None):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            if alert_type:
                cur.execute(
                    'UPDATE alerts SET resolved=TRUE, resolved_at=NOW() WHERE cp_id=%s AND alert_type=%s AND resolved=FALSE',
                    (cp_id, alert_type)
                )
            else:
                cur.execute(
                    'UPDATE alerts SET resolved=TRUE, resolved_at=NOW() WHERE cp_id=%s AND resolved=FALSE',
                    (cp_id,)
                )
    except Exception as e:
        logger.error(f'DB resolve error: {e}')


def update_charger(cp_id, **kwargs):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            fields = []
            values = []
            for key in ('vendor', 'model', 'firmware', 'serial', 'iccid', 'imsi', 'note',
                        'quarantine', 'quarantine_reason', 'quarantine_since'):
                if key in kwargs:
                    fields.append(f'{key}=%s')
                    values.append(kwargs[key])
            if fields:
                fields.append('updated_at=NOW()')
                values.append(cp_id)
                cur.execute(f'UPDATE chargers SET {", ".join(fields)} WHERE cp_id=%s', values)
    except Exception as e:
        logger.error(f'DB charger update error: {e}')


def get_sessions(cp_id=None, limit=50):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            if cp_id:
                cur.execute('SELECT * FROM sessions WHERE cp_id=%s ORDER BY start_time DESC LIMIT %s', (cp_id, limit))
            else:
                cur.execute('SELECT * FROM sessions ORDER BY start_time DESC LIMIT %s', (limit,))
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f'DB get sessions error: {e}')
        return []


def get_active_alerts():
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute('SELECT * FROM alerts WHERE resolved=FALSE ORDER BY created_at DESC')
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f'DB get alerts error: {e}')
        return []


def get_events(cp_id=None, limit=50):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            if cp_id:
                cur.execute('SELECT * FROM events WHERE cp_id=%s ORDER BY created_at DESC LIMIT %s', (cp_id, limit))
            else:
                cur.execute('SELECT * FROM events ORDER BY created_at DESC LIMIT %s', (limit,))
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f'DB get events error: {e}')
        return []


def get_meter_history(cp_id, connector_id=None, hours=24):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            if connector_id:
                cur.execute('''
                    SELECT * FROM meter_values
                    WHERE cp_id=%s AND connector_id=%s AND timestamp > NOW() - INTERVAL '%s hours'
                    ORDER BY timestamp ASC
                ''', (cp_id, connector_id, hours))
            else:
                cur.execute('''
                    SELECT * FROM meter_values
                    WHERE cp_id=%s AND timestamp > NOW() - INTERVAL '%s hours'
                    ORDER BY timestamp ASC
                ''', (cp_id, hours))
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f'DB get meter history error: {e}')
        return []


def get_charger(cp_id):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute('SELECT * FROM chargers WHERE cp_id=%s', (cp_id,))
            r = cur.fetchone()
            return dict(r) if r else None
    except Exception as e:
        logger.error(f'DB get charger error: {e}')
        return None


def get_all_chargers():
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute('SELECT * FROM chargers ORDER BY cp_id')
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f'DB get all chargers error: {e}')
        return []


def ensure_charger(cp_id):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute('INSERT INTO chargers (cp_id) VALUES (%s) ON CONFLICT (cp_id) DO NOTHING', (cp_id,))
    except Exception as e:
        logger.error(f'DB ensure charger error: {e}')


def set_quarantine(cp_id, active, reason=''):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            if active:
                cur.execute(
                    'UPDATE chargers SET quarantine=TRUE, quarantine_reason=%s, quarantine_since=NOW(), updated_at=NOW() WHERE cp_id=%s',
                    (reason, cp_id)
                )
            else:
                cur.execute(
                    'UPDATE chargers SET quarantine=FALSE, quarantine_reason=NULL, quarantine_since=NULL, updated_at=NOW() WHERE cp_id=%s',
                    (cp_id,)
                )
    except Exception as e:
        logger.error(f'DB quarantine error: {e}')


def get_sessions_grouped(limit_per_cp=10):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute('''
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY cp_id ORDER BY start_time DESC) as rn
                    FROM sessions
                ) sub WHERE rn <= %s ORDER BY cp_id, start_time DESC
            ''', (limit_per_cp,))
            result = {}
            for r in cur.fetchall():
                d = dict(r)
                d.pop('rn', None)
                result.setdefault(d['cp_id'], []).append(d)
            return result
    except Exception as e:
        logger.error(f'DB sessions grouped error: {e}')
        return {}


def get_rfid_tags(days=30):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute('''
                SELECT id_tag, COUNT(*) as session_count,
                    array_agg(DISTINCT cp_id) as chargers,
                    MAX(start_time) as last_used,
                    COALESCE(SUM(energy_wh), 0) as total_energy_wh
                FROM sessions
                WHERE id_tag IS NOT NULL AND start_time > NOW() - INTERVAL '%s days'
                GROUP BY id_tag ORDER BY session_count DESC
            ''', (days,))
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f'DB rfid tags error: {e}')
        return []


def get_charger_detail(cp_id, event_limit=20, session_limit=10):
    """Volledige charger info voor detail pagina: metadata + events + sessions."""
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            # Charger metadata
            cur.execute('SELECT * FROM chargers WHERE cp_id=%s', (cp_id,))
            charger = cur.fetchone()
            if not charger:
                return None
            charger = dict(charger)
            # Recent events
            cur.execute('SELECT * FROM events WHERE cp_id=%s ORDER BY created_at DESC LIMIT %s', (cp_id, event_limit))
            events = [dict(r) for r in cur.fetchall()]
            # Sessions
            cur.execute('SELECT * FROM sessions WHERE cp_id=%s ORDER BY start_time DESC LIMIT %s', (cp_id, session_limit))
            sessions = [dict(r) for r in cur.fetchall()]
            # Active alerts
            cur.execute('SELECT * FROM alerts WHERE cp_id=%s AND resolved=FALSE ORDER BY created_at DESC', (cp_id,))
            alerts = [dict(r) for r in cur.fetchall()]
            # Stats
            cur.execute('SELECT COUNT(*) as total FROM events WHERE cp_id=%s AND event_type=%s', (cp_id, 'connected'))
            total_connects = cur.fetchone()['total']
            cur.execute('SELECT COUNT(*) as total FROM events WHERE cp_id=%s AND event_type=%s', (cp_id, 'disconnected'))
            total_disconnects = cur.fetchone()['total']
            # Error counts
            cur.execute('''
                SELECT alert_type, COUNT(*) as cnt FROM alerts WHERE cp_id=%s GROUP BY alert_type
            ''', (cp_id,))
            errors = {r['alert_type']: r['cnt'] for r in cur.fetchall()}

            return {
                'charger': charger,
                'events': events,
                'sessions': sessions,
                'alerts': alerts,
                'stats': {
                    'total_connects': total_connects,
                    'total_disconnects': total_disconnects,
                    'errors': errors,
                },
            }
    except Exception as e:
        logger.error(f'DB charger detail error: {e}')
        return None


def get_analysis_data(hours=24):
    """Alle data voor stabiliteitsanalyse vanuit DB."""
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            # Events
            cur.execute('''
                SELECT cp_id, event_type, detail, created_at
                FROM events WHERE created_at > NOW() - INTERVAL '%s hours'
                ORDER BY created_at
            ''', (hours,))
            events = [dict(r) for r in cur.fetchall()]
            # Chargers
            cur.execute('SELECT * FROM chargers ORDER BY cp_id')
            chargers = [dict(r) for r in cur.fetchall()]
            # Alerts
            cur.execute('''
                SELECT cp_id, alert_type, COUNT(*) as cnt
                FROM alerts WHERE created_at > NOW() - INTERVAL '%s hours'
                GROUP BY cp_id, alert_type
            ''', (hours,))
            alerts = [dict(r) for r in cur.fetchall()]
            # Session count per charger
            cur.execute('''
                SELECT cp_id, COUNT(*) as cnt, COALESCE(SUM(energy_wh),0) as energy
                FROM sessions WHERE start_time > NOW() - INTERVAL '%s hours'
                GROUP BY cp_id
            ''', (hours,))
            session_stats = {r['cp_id']: dict(r) for r in cur.fetchall()}

            return {
                'events': events,
                'chargers': chargers,
                'alerts': alerts,
                'session_stats': session_stats,
            }
    except Exception as e:
        logger.error(f'DB analysis data error: {e}')
        return {'events': [], 'chargers': [], 'alerts': [], 'session_stats': {}}


def save_grid_meter(device_id, role, data):
    try:
        phases = data.get('phases', {})
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute('''
                INSERT INTO grid_meter_log (device_id, role, total_power_w, total_current_a,
                    l1_power_w, l1_current_a, l1_voltage_v,
                    l2_power_w, l2_current_a, l2_voltage_v,
                    l3_power_w, l3_current_a, l3_voltage_v,
                    total_energy_wh)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''', (
                device_id, role,
                data.get('total_power_w', 0), data.get('total_current_a', 0),
                phases.get('L1', {}).get('power_w', 0), phases.get('L1', {}).get('current_a', 0), phases.get('L1', {}).get('voltage_v', 0),
                phases.get('L2', {}).get('power_w', 0), phases.get('L2', {}).get('current_a', 0), phases.get('L2', {}).get('voltage_v', 0),
                phases.get('L3', {}).get('power_w', 0), phases.get('L3', {}).get('current_a', 0), phases.get('L3', {}).get('voltage_v', 0),
                data.get('total_energy_wh', 0),
            ))
    except Exception as e:
        logger.error(f'DB grid meter error: {e}')


def get_grid_history(role='grid_meter', hours=24):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute('''
                SELECT * FROM grid_meter_log
                WHERE role=%s AND created_at > NOW() - INTERVAL '%s hours'
                ORDER BY created_at ASC
            ''', (role, hours))
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f'DB grid history error: {e}')
        return []


# === Driver Portal ===

def create_reservation(cp_id, connector_id, driver_name, driver_phone, battery_pct):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            # Max 30 min reservering
            cur.execute('''
                INSERT INTO reservations (cp_id, connector_id, driver_name, driver_phone, battery_pct, expires_at)
                VALUES (%s, %s, %s, %s, %s, NOW() + INTERVAL '30 minutes')
                RETURNING id
            ''', (cp_id, connector_id, driver_name, driver_phone, battery_pct))
            return cur.fetchone()[0]
    except Exception as e:
        logger.error(f'DB reservation error: {e}')
        return None


def get_active_reservations(cp_id=None):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            if cp_id:
                cur.execute('''
                    SELECT * FROM reservations
                    WHERE cp_id=%s AND status='active' AND expires_at > NOW()
                    ORDER BY created_at
                ''', (cp_id,))
            else:
                cur.execute('''
                    SELECT * FROM reservations
                    WHERE status='active' AND expires_at > NOW()
                    ORDER BY created_at
                ''')
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f'DB get reservations error: {e}')
        return []


def cancel_reservation(res_id):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("UPDATE reservations SET status='cancelled', cancelled_at=NOW() WHERE id=%s", (res_id,))
    except Exception as e:
        logger.error(f'DB cancel reservation error: {e}')


def create_issue_report(cp_id, connector_id, reporter_name, reporter_phone, issue_type, description):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute('''
                INSERT INTO issue_reports (cp_id, connector_id, reporter_name, reporter_phone, issue_type, description)
                VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
            ''', (cp_id, connector_id, reporter_name, reporter_phone, issue_type, description))
            issue_id = cur.fetchone()[0]
        # Forward naar service partner
        send_issue_email(cp_id, issue_type, reporter_name, reporter_phone, description)
        return issue_id
    except Exception as e:
        logger.error(f'DB issue report error: {e}')
        return None


def get_open_issues(cp_id=None):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            if cp_id:
                cur.execute("SELECT * FROM issue_reports WHERE cp_id=%s AND status='open' ORDER BY created_at DESC", (cp_id,))
            else:
                cur.execute("SELECT * FROM issue_reports WHERE status='open' ORDER BY created_at DESC")
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f'DB get issues error: {e}')
        return []


def driver_checkin(cp_id, connector_id, driver_name, battery_pct, target_pct, phone=None):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            # Schat laadtijd: ~7kW per uur voor Ecotap, batterij ~60kWh gemiddeld
            kwh_needed = (target_pct - battery_pct) / 100 * 60  # 60 kWh batterij
            est_minutes = max(10, int(kwh_needed / 7 * 60))
            cur.execute('''
                INSERT INTO driver_checkins (cp_id, connector_id, driver_name, battery_pct, target_pct, estimated_minutes, phone, notify_when_done)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
            ''', (cp_id, connector_id, driver_name, battery_pct, target_pct, est_minutes, phone, bool(phone)))
            return {'id': cur.fetchone()[0], 'estimated_minutes': est_minutes}
    except Exception as e:
        logger.error(f'DB checkin error: {e}')
        return None


def get_active_checkins(cp_id=None):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            if cp_id:
                cur.execute("SELECT * FROM driver_checkins WHERE cp_id=%s AND status='charging' ORDER BY created_at DESC", (cp_id,))
            else:
                cur.execute("SELECT * FROM driver_checkins WHERE status='charging' ORDER BY created_at DESC")
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f'DB get checkins error: {e}')
        return []


# === GPS Auto Start/Stop ===

def set_charger_location(cp_id, lat, lon, radius_m=30):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute('UPDATE chargers SET latitude=%s, longitude=%s, geofence_radius_m=%s, updated_at=NOW() WHERE cp_id=%s',
                        (lat, lon, radius_m, cp_id))
    except Exception as e:
        logger.error(f'DB set location error: {e}')


def get_nearby_chargers(lat, lon, max_distance_m=100):
    """Vind laadpalen binnen max_distance_m van GPS positie."""
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            # Haversine approximation voor korte afstanden
            cur.execute('''
                SELECT cp_id, latitude, longitude, geofence_radius_m,
                    (6371000 * acos(
                        cos(radians(%s)) * cos(radians(latitude)) *
                        cos(radians(longitude) - radians(%s)) +
                        sin(radians(%s)) * sin(radians(latitude))
                    )) as distance_m
                FROM chargers
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                HAVING distance_m < %s
                ORDER BY distance_m
            ''', (lat, lon, lat, max_distance_m))
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f'DB nearby chargers error: {e}')
        # Fallback: simpele query zonder having
        try:
            with get_conn() as conn:
                cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                cur.execute('SELECT cp_id, latitude, longitude, geofence_radius_m FROM chargers WHERE latitude IS NOT NULL')
                results = []
                import math
                for r in cur.fetchall():
                    d = dict(r)
                    dlat = math.radians(d['latitude'] - lat)
                    dlon = math.radians(d['longitude'] - lon)
                    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat)) * math.cos(math.radians(d['latitude'])) * math.sin(dlon/2)**2
                    d['distance_m'] = 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
                    if d['distance_m'] <= max_distance_m:
                        results.append(d)
                return sorted(results, key=lambda x: x['distance_m'])
        except:
            return []


def create_gps_session(cp_id, driver_id, driver_name, phone, lat, lon, battery_pct, target_pct):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute('''
                INSERT INTO gps_sessions (cp_id, driver_id, driver_name, phone, latitude, longitude, battery_pct, target_pct)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
            ''', (cp_id, driver_id, driver_name, phone, lat, lon, battery_pct, target_pct))
            return cur.fetchone()[0]
    except Exception as e:
        logger.error(f'DB gps session error: {e}')
        return None


def get_active_gps_sessions(cp_id=None):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            if cp_id:
                cur.execute("SELECT * FROM gps_sessions WHERE cp_id=%s AND status IN ('approaching','charging') ORDER BY created_at DESC", (cp_id,))
            else:
                cur.execute("SELECT * FROM gps_sessions WHERE status IN ('approaching','charging') ORDER BY created_at DESC")
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f'DB gps sessions error: {e}')
        return []


def update_gps_session(session_id, status, transaction_started=None):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            if status == 'charging' and transaction_started:
                cur.execute("UPDATE gps_sessions SET status=%s, transaction_started=TRUE, started_at=NOW() WHERE id=%s", (status, session_id))
            elif status == 'completed':
                cur.execute("UPDATE gps_sessions SET status=%s, stopped_at=NOW() WHERE id=%s", (status, session_id))
            else:
                cur.execute("UPDATE gps_sessions SET status=%s WHERE id=%s", (status, session_id))
    except Exception as e:
        logger.error(f'DB update gps session error: {e}')


# === GPS Scans & Auto-locatie ===

def save_gps_scan(cp_id, lat, lon, accuracy=None, rfid_tag=None):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute('INSERT INTO gps_scans (cp_id, latitude, longitude, accuracy, rfid_tag) VALUES (%s,%s,%s,%s,%s)',
                        (cp_id, lat, lon, accuracy, rfid_tag))
            # Check of we genoeg scans hebben om locatie te bepalen
            cur.execute('''
                SELECT AVG(latitude) as avg_lat, AVG(longitude) as avg_lon,
                    STDDEV(latitude) as std_lat, STDDEV(longitude) as std_lon,
                    COUNT(*) as cnt
                FROM gps_scans WHERE cp_id=%s AND accuracy < 50
            ''', (cp_id,))
            r = cur.fetchone()
            if r and r[4] >= 3:  # minimaal 3 scans
                avg_lat, avg_lon = r[0], r[1]
                std_lat, std_lon = r[2] or 0, r[3] or 0
                # Als standaarddeviatie klein genoeg is (< ~50m), update locatie
                if std_lat < 0.0005 and std_lon < 0.0005:
                    cur.execute('UPDATE chargers SET latitude=%s, longitude=%s, updated_at=NOW() WHERE cp_id=%s',
                                (round(avg_lat, 6), round(avg_lon, 6), cp_id))
                    logger.info(f'[GPS] Auto-locatie {cp_id}: {avg_lat:.6f}, {avg_lon:.6f} (uit {r[4]} scans, std={std_lat:.6f}/{std_lon:.6f})')
                    return {'updated': True, 'lat': round(avg_lat, 6), 'lon': round(avg_lon, 6), 'scans': r[4]}
            return {'updated': False, 'scans': r[4] if r else 0}
    except Exception as e:
        logger.error(f'DB gps scan error: {e}')
        return None


def get_gps_scans(cp_id, limit=20):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute('SELECT * FROM gps_scans WHERE cp_id=%s ORDER BY created_at DESC LIMIT %s', (cp_id, limit))
            return [dict(r) for r in cur.fetchall()]
    except:
        return []


# === Driver Profiles ===

def get_driver_profile(driver_id):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute('SELECT * FROM driver_profiles WHERE driver_id=%s', (driver_id,))
            r = cur.fetchone()
            return dict(r) if r else None
    except Exception as e:
        logger.error(f'DB get driver profile error: {e}')
        return None


def get_driver_by_rfid(rfid_tag):
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute('SELECT * FROM driver_profiles WHERE rfid_tag=%s', (rfid_tag,))
            r = cur.fetchone()
            return dict(r) if r else None
    except Exception as e:
        logger.error(f'DB get driver by rfid error: {e}')
        return None


def create_driver_profile(driver_id, driver_name='', phone=''):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute('''
                INSERT INTO driver_profiles (driver_id, driver_name, phone)
                VALUES (%s, %s, %s)
                ON CONFLICT (driver_id) DO UPDATE SET driver_name=EXCLUDED.driver_name, phone=EXCLUDED.phone, last_seen=NOW()
                RETURNING id
            ''', (driver_id, driver_name, phone))
            return cur.fetchone()[0]
    except Exception as e:
        logger.error(f'DB create driver profile error: {e}')
        return None


def link_rfid_to_driver(driver_id, rfid_tag):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute('UPDATE driver_profiles SET rfid_tag=%s, verified=TRUE, last_seen=NOW() WHERE driver_id=%s',
                        (rfid_tag, driver_id))
            logger.info(f'[DRIVER] Gekoppeld: {driver_id} -> RFID {rfid_tag}')
    except Exception as e:
        logger.error(f'DB link rfid error: {e}')


def get_waiting_gps_sessions(cp_id):
    """Vind GPS sessies die wachten op RFID scan."""
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute("""
                SELECT gs.*, dp.rfid_tag as profile_rfid
                FROM gps_sessions gs
                LEFT JOIN driver_profiles dp ON gs.driver_id = dp.driver_id
                WHERE gs.cp_id=%s AND gs.status='waiting_rfid'
                ORDER BY gs.created_at DESC
            """, (cp_id,))
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f'DB waiting gps sessions error: {e}')
        return []


# === Tarieven ===

def get_tariff(cp_id=None):
    """Haal actief tarief op. Jumbo palen krijgen Jumbo tarief."""
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            if cp_id and (cp_id.startswith('117') or cp_id.startswith('189')):
                cur.execute("SELECT * FROM tariffs WHERE applies_to='jumbo_veghel' AND active=TRUE LIMIT 1")
            else:
                cur.execute("SELECT * FROM tariffs WHERE active=TRUE ORDER BY id LIMIT 1")
            r = cur.fetchone()
            return dict(r) if r else None
    except Exception as e:
        logger.error(f'DB get tariff error: {e}')
        return None


def calculate_cost(cp_id, energy_wh, duration_min):
    """Bereken kosten voor een laadsessie."""
    tariff = get_tariff(cp_id)
    if not tariff:
        return None
    energy_kwh = energy_wh / 1000
    cost_excl = round(
        tariff.get('start_fee', 0) +
        energy_kwh * tariff.get('price_per_kwh', 0) +
        (duration_min / 60) * tariff.get('price_per_hour', 0),
        2
    )
    vat_pct = tariff.get('vat_pct', 21.0)
    cost_incl = round(cost_excl * (1 + vat_pct / 100), 2)
    return {
        'tariff_id': tariff['id'],
        'tariff_name': tariff['name'],
        'energy_kwh': round(energy_kwh, 2),
        'price_per_kwh': tariff['price_per_kwh'],
        'cost_excl_vat': cost_excl,
        'vat_pct': vat_pct,
        'cost_incl_vat': cost_incl,
        'currency': tariff.get('currency', 'EUR'),
    }


def save_session_cost(session_id, tariff_id, cost_excl, cost_incl):
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute('UPDATE sessions SET tariff_id=%s, cost_excl_vat=%s, cost_incl_vat=%s WHERE id=%s',
                        (tariff_id, cost_excl, cost_incl, session_id))
    except Exception as e:
        logger.error(f'DB save cost error: {e}')


def get_stats():
    """Dashboard stats vanuit de database."""
    try:
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            stats = {}
            cur.execute('SELECT COUNT(*) as total FROM chargers')
            stats['total_chargers'] = cur.fetchone()['total']
            cur.execute('SELECT COUNT(*) as total FROM sessions')
            stats['total_sessions'] = cur.fetchone()['total']
            cur.execute('SELECT COUNT(*) as total FROM sessions WHERE start_time > NOW() - INTERVAL \'24 hours\'')
            stats['sessions_24h'] = cur.fetchone()['total']
            cur.execute('SELECT COALESCE(SUM(energy_wh), 0) as total FROM sessions')
            stats['total_energy_wh'] = cur.fetchone()['total']
            cur.execute('SELECT COALESCE(SUM(energy_wh), 0) as total FROM sessions WHERE start_time > NOW() - INTERVAL \'24 hours\'')
            stats['energy_24h_wh'] = cur.fetchone()['total']
            cur.execute('SELECT COUNT(*) as total FROM alerts WHERE resolved=FALSE')
            stats['active_alerts'] = cur.fetchone()['total']
            cur.execute('SELECT COUNT(*) as total FROM events WHERE created_at > NOW() - INTERVAL \'24 hours\'')
            stats['events_24h'] = cur.fetchone()['total']
            return stats
    except Exception as e:
        logger.error(f'DB stats error: {e}')
        return {}
