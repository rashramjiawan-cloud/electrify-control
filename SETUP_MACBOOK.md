# Setup op MacBook Air

Deze handleiding zet `electrify-control` lokaal draaiend op een MacBook Air
(Apple Silicon of Intel). Het project bestaat uit twee delen:

- **Frontend** — een Vite + React + TypeScript app (`src/`, `index.html`)
- **Backend** — Python (FastAPI / OCPP proxy / portals), o.a. `proxy_v3.py`,
  `customer_portal.py`, `dashboard.py`

---

## 1. Vereisten installeren

Installeer eerst [Homebrew](https://brew.sh) als je dat nog niet hebt:

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Installeer daarna de runtimes:

```sh
# Node.js (voor de frontend) en Python (voor de backend)
brew install node python@3.12 git

# Optioneel: Bun — het project bevat een bun.lock, dus Bun werkt ook
brew install oven-sh/bun/bun
```

---

## 2. Repository klonen

```sh
git clone https://github.com/rashramjiawan-cloud/electrify-control.git
cd electrify-control
```

---

## 3. Frontend opzetten

Met npm:

```sh
npm install
npm run dev
```

Of met Bun (sneller, gebruikt `bun.lock`):

```sh
bun install
bun run dev
```

De dev-server draait standaard op http://localhost:8080 (zie `vite.config.ts`).

Andere scripts:

```sh
npm run build      # productie-build naar dist/
npm run lint       # eslint
npm test           # vitest
```

---

## 4. Backend opzetten

Maak een virtuele omgeving en installeer de Python-dependencies:

```sh
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

> `psycopg2-binary` werkt out-of-the-box op macOS. Wil je liever de
> niet-binary `psycopg2`, installeer dan eerst `brew install postgresql`.

Backend-onderdelen starten (elk in een eigen terminal, met venv actief):

```sh
python proxy_v3.py          # OCPP proxy (WebSocket op poort OCPP_WS_PORT, default 8081)
python customer_portal.py   # Customer portal (HTTP op PORTAL_PORT, default 3000)
```

---

## 5. Environment-variabelen

### Frontend (`.env`, prefix `VITE_`)

```
VITE_SUPABASE_PROJECT_ID=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_URL=...
```

### Backend

De Python-onderdelen lezen deze variabelen uit de omgeving (zet ze in je shell
of een `.env` die je inlaadt — commit ze **niet**):

| Variabele           | Doel                                         |
| ------------------- | -------------------------------------------- |
| `ADMIN_USER`        | Admin-gebruikersnaam                         |
| `ADMIN_PASS_HASH`   | Bcrypt-hash van het admin-wachtwoord         |
| `SESSION_SECRET`    | Secret voor sessies                          |
| `EXTERNAL_API_KEY`  | API-sleutel voor externe integraties         |
| `ANTHROPIC_API_KEY` | Voor de AI-functionaliteit (`anthropic`)     |
| `PORTAL_PORT`       | Poort customer portal (default `3000`)       |
| `OCPP_WS_PORT`      | WebSocket-poort OCPP proxy (default `8081`)  |

> `.env` staat in `.gitignore`, dus secrets blijven lokaal.

---

## 6. Snelle checklist

```sh
brew install node python@3.12 git
git clone https://github.com/rashramjiawan-cloud/electrify-control.git
cd electrify-control
npm install && npm run dev          # frontend
python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
python proxy_v3.py                  # backend
```
