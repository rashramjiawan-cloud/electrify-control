"""Klantbeheer CLI voor Voltcontrol portal."""
import sys
import bcrypt
import psycopg2
import psycopg2.extras

DB_CONFIG = {
    'dbname': 'ocpp_ems',
    'user': 'ocpp',
    'password': 'LaadpaalEMS2026!',
    'host': 'localhost',
}


def get_conn():
    return psycopg2.connect(**DB_CONFIG)


def add_customer(name, slug, email, password, color='#38bdf8', contact_name=None, contact_phone=None):
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO customers (name, slug, email, password_hash, color, contact_name, contact_phone)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (email) DO UPDATE SET
            name = EXCLUDED.name,
            password_hash = EXCLUDED.password_hash,
            color = EXCLUDED.color,
            updated_at = NOW()
        RETURNING id
    """, (name, slug, email, pw_hash, color, contact_name, contact_phone))
    cid = cur.fetchone()[0]
    conn.commit()
    conn.close()
    print(f"Klant aangemaakt/bijgewerkt: {name} (id={cid}, email={email})")
    return cid


def assign_charger(email, cp_id, display_name=None, location_name=None):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM customers WHERE email = %s", (email,))
    row = cur.fetchone()
    if not row:
        print(f"Klant niet gevonden: {email}")
        conn.close()
        return
    customer_id = row[0]
    cur.execute("""
        INSERT INTO customer_chargers (customer_id, cp_id, display_name, location_name)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (customer_id, cp_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            location_name = EXCLUDED.location_name
    """, (customer_id, cp_id, display_name, location_name))
    conn.commit()
    conn.close()
    print(f"Laadpaal {cp_id} gekoppeld aan {email} ({display_name or cp_id})")


def list_customers():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT c.*, COUNT(cc.id) as charger_count FROM customers c LEFT JOIN customer_chargers cc ON c.id = cc.customer_id GROUP BY c.id ORDER BY c.name")
    for c in cur.fetchall():
        print(f"  {c['name']} ({c['email']}) — {c['charger_count']} palen — slug: {c['slug']}")
    conn.close()


def list_chargers(email):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT cc.cp_id, cc.display_name, cc.location_name
        FROM customer_chargers cc
        JOIN customers c ON c.id = cc.customer_id
        WHERE c.email = %s
        ORDER BY cc.cp_id
    """, (email,))
    for c in cur.fetchall():
        print(f"  {c['cp_id']} — {c['display_name'] or '(geen naam)'} — {c['location_name'] or ''}")
    conn.close()


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Gebruik:")
        print("  add <name> <slug> <email> <password> [color]")
        print("  assign <email> <cp_id> [display_name] [location]")
        print("  list")
        print("  chargers <email>")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == 'add':
        add_customer(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5],
                     sys.argv[6] if len(sys.argv) > 6 else '#38bdf8')
    elif cmd == 'assign':
        assign_charger(sys.argv[2], sys.argv[3],
                       sys.argv[4] if len(sys.argv) > 4 else None,
                       sys.argv[5] if len(sys.argv) > 5 else None)
    elif cmd == 'list':
        list_customers()
    elif cmd == 'chargers':
        list_chargers(sys.argv[2])
    else:
        print(f"Onbekend commando: {cmd}")
