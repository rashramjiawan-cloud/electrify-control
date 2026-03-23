"""Setup customer tables for Voltcontrol portal."""
import psycopg2

conn = psycopg2.connect(dbname='ocpp_ems', user='ocpp', password='LaadpaalEMS2026!', host='localhost')
cur = conn.cursor()

cur.execute("""
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(200) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    contact_name VARCHAR(200),
    contact_phone VARCHAR(50),
    color VARCHAR(20) DEFAULT '#38bdf8',
    logo_url VARCHAR(500),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
)
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS customer_chargers (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    cp_id VARCHAR(50) NOT NULL,
    display_name VARCHAR(200),
    location_name VARCHAR(200),
    UNIQUE(customer_id, cp_id)
)
""")

cur.execute("CREATE INDEX IF NOT EXISTS idx_cc_customer ON customer_chargers(customer_id)")
cur.execute("CREATE INDEX IF NOT EXISTS idx_cc_cpid ON customer_chargers(cp_id)")

conn.commit()
print("Klant tabellen aangemaakt")
conn.close()
