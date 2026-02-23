import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Copy, Check, ChevronDown, ChevronRight, Server, Globe, Terminal,
  Shield, CheckCircle2, ExternalLink, Zap, ArrowRight, FileCode, Settings2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const INGEST_URL = `${SUPABASE_URL}/functions/v1/ocpp-ingest`;

// ── Reusable components ──────────────────────────────────────

const CopyBlock = ({ code, lang = 'bash' }: { code: string; lang?: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Gekopieerd');
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="text-[12px] font-mono bg-background border border-border rounded-lg p-4 overflow-x-auto text-foreground leading-relaxed whitespace-pre-wrap">
        {code}
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={copy}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
};

const StepCard = ({
  step,
  title,
  children,
  defaultOpen = false,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-mono text-sm font-bold">
          {step}
        </div>
        <h3 className="text-sm font-semibold text-foreground flex-1">{title}</h3>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">{children}</div>}
    </div>
  );
};

const CheckItem = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2 text-sm text-muted-foreground">
    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
    <span>{children}</span>
  </li>
);

// ── Page ─────────────────────────────────────────────────────

const SetupGuide = () => {
  const [apiKey, setApiKey] = useState<string>('<YOUR_API_KEY>');

  useEffect(() => {
    supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'ingest_api_key')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) setApiKey(data.value);
      });
  }, []);

  const nodeServerCode = `const { RPCServer } = require('ocpp-rpc');
const http = require('http');

const INGEST_URL = '${INGEST_URL}';
const API_KEY = '${apiKey}';

// Forward OCPP event naar je dashboard
async function forward(event, chargePointId, data = {}, connectorId) {
  try {
    await fetch(INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        event,
        chargePointId,
        connectorId,
        timestamp: new Date().toISOString(),
        data,
      }),
    });
    console.log(\`✅ \${event} forwarded for \${chargePointId}\`);
  } catch (err) {
    console.error(\`❌ Forward \${event} failed:\`, err.message);
  }
}

const server = new RPCServer({
  protocols: ['ocpp1.6'],
  strictMode: true,
});

server.auth((accept, reject, handshake) => {
  console.log(\`🔌 Nieuwe verbinding: \${handshake.identity}\`);
  accept();
});

server.on('client', async (client) => {
  const cpId = client.identity;

  client.handle('BootNotification', async ({ params }) => {
    await forward('BootNotification', cpId, {
      model: params.chargePointModel,
      vendor: params.chargePointVendor,
      serialNumber: params.chargePointSerialNumber,
      firmwareVersion: params.firmwareVersion,
    });
    return {
      status: 'Accepted',
      interval: 300,
      currentTime: new Date().toISOString(),
    };
  });

  client.handle('Heartbeat', async () => {
    await forward('Heartbeat', cpId);
    return { currentTime: new Date().toISOString() };
  });

  client.handle('StatusNotification', async ({ params }) => {
    await forward('StatusNotification', cpId, {
      status: params.status,
      errorCode: params.errorCode,
      info: params.info,
    }, params.connectorId);
    return {};
  });

  client.handle('StartTransaction', async ({ params }) => {
    const res = await fetch(INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        event: 'StartTransaction',
        chargePointId: cpId,
        connectorId: params.connectorId,
        timestamp: params.timestamp,
        data: { idTag: params.idTag, meterStart: params.meterStart },
      }),
    });
    const result = await res.json();
    return {
      transactionId: result.transactionId || 0,
      idTagInfo: { status: 'Accepted' },
    };
  });

  client.handle('StopTransaction', async ({ params }) => {
    await forward('StopTransaction', cpId, {
      transactionId: params.transactionId,
      meterStop: params.meterStop,
    });
    return { idTagInfo: { status: 'Accepted' } };
  });

  client.handle('MeterValues', async ({ params }) => {
    const values = [];
    for (const mv of params.meterValue || []) {
      for (const sv of mv.sampledValue || []) {
        values.push({
          measurand: sv.measurand || 'Energy.Active.Import.Register',
          value: parseFloat(sv.value),
          unit: sv.unit || 'Wh',
        });
      }
    }
    await forward('MeterValues', cpId, {
      transactionId: params.transactionId,
      values,
    }, params.connectorId);
    return {};
  });

  client.handle('Authorize', async () => {
    return { idTagInfo: { status: 'Accepted' } };
  });
});

const httpServer = http.createServer();
httpServer.on('upgrade', server.handleUpgrade);
httpServer.listen(9000, () => {
  console.log('⚡ OCPP Server draait op ws://0.0.0.0:9000');
});`;

  const nginxConfig = `server {
    listen 443 ssl;
    server_name ocpp.jouwdomein.nl;

    ssl_certificate /etc/letsencrypt/live/ocpp.jouwdomein.nl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ocpp.jouwdomein.nl/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}`;

  const testCurl = `curl -X POST ${INGEST_URL} \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey}" \\
  -d '{
    "event": "BootNotification",
    "chargePointId": "TEST-CP-001",
    "data": {
      "model": "Test Charger",
      "vendor": "Test Vendor"
    }
  }'`;

  return (
    <AppLayout
      title="Setup Guide"
      subtitle="Stap-voor-stap: externe OCPP server koppelen aan je dashboard"
    >
      <div className="max-w-3xl space-y-6">
        {/* Architecture overview */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Architectuur overzicht
          </h2>
          <div className="flex items-center gap-3 flex-wrap text-xs font-mono text-muted-foreground">
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border px-3 py-2">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span>Laadpaal</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5" />
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border px-3 py-2">
              <Server className="h-3.5 w-3.5 text-primary" />
              <span>OCPP Server (VPS)</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5" />
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-primary">
              <Globe className="h-3.5 w-3.5" />
              <span>Ingest API</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5" />
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border px-3 py-2">
              <Settings2 className="h-3.5 w-3.5 text-primary" />
              <span>Dashboard</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Je laadpaal verbindt via <strong className="text-foreground">OCPP 1.6J WebSocket</strong> met je eigen server.
            Die server forwardt events via <strong className="text-foreground">REST POST</strong> naar de Ingest API van je dashboard.
          </p>
        </div>

        {/* Step 1: Choose server */}
        <StepCard step={1} title="Kies een OCPP server" defaultOpen>
          <p className="text-sm text-muted-foreground">Er zijn drie populaire opties:</p>
          <div className="grid gap-3">
            <div className="rounded-lg border border-border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-primary" />
                  Node.js + ocpp-rpc
                </h4>
                <span className="text-[10px] font-mono uppercase tracking-wider bg-primary/10 text-primary rounded-md px-2 py-0.5">
                  Aanbevolen
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Lichtgewicht, volledig aanpasbaar, en perfect geïntegreerd met de Ingest API. Ideaal als je snel wilt starten.
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <CheckItem>Eenvoudig op te zetten (1 bestand)</CheckItem>
                <CheckItem>Directe integratie met Ingest API</CheckItem>
                <CheckItem>Node.js 18+ vereist</CheckItem>
              </ul>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-2">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" />
                CitrineOS
              </h4>
              <p className="text-xs text-muted-foreground">
                Open-source CSMS in TypeScript. Volledig OCPP 2.0.1 compliant met uitbreidbare module-architectuur.
              </p>
              <a href="https://github.com/citrineos/citrineos-core" target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                GitHub <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-2">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" />
                SteVe
              </h4>
              <p className="text-xs text-muted-foreground">
                Volwassen open-source OCPP server in Java. Heeft een eigen web-interface en database. Vereist Java 17+ en MariaDB.
              </p>
              <a href="https://github.com/steve-community/steve" target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                GitHub <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </StepCard>

        {/* Step 2: Get a VPS */}
        <StepCard step={2} title="Huur een VPS (Virtual Private Server)">
          <p className="text-sm text-muted-foreground">
            Je hebt een server nodig die 24/7 draait voor permanente WebSocket-verbindingen. Aanbevolen providers:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { name: 'Hetzner', price: '€4/mo', url: 'https://hetzner.com/cloud' },
              { name: 'DigitalOcean', price: '$6/mo', url: 'https://digitalocean.com' },
              { name: 'AWS Lightsail', price: '$5/mo', url: 'https://aws.amazon.com/lightsail' },
            ].map(p => (
              <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                className="rounded-lg border border-border p-3 hover:border-primary/50 transition-colors text-center">
                <p className="text-sm font-semibold text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground">Vanaf {p.price}</p>
              </a>
            ))}
          </div>
          <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Minimale specs:</strong> 1 vCPU, 1 GB RAM, Ubuntu 22.04 LTS
          </div>
        </StepCard>

        {/* Step 3: Install Node.js server */}
        <StepCard step={3} title="Installeer de Node.js OCPP server">
          <p className="text-sm text-muted-foreground mb-2">
            SSH naar je VPS en voer de volgende commando's uit:
          </p>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">1. Project aanmaken</h4>
          <CopyBlock code={`mkdir ocpp-server && cd ocpp-server
npm init -y
npm install ocpp-rpc`} />

          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">2. server.js aanmaken</h4>
          <p className="text-xs text-muted-foreground mb-2">
            Dit bestand is al voorgevuld met jouw Ingest API URL en API key:
          </p>
          <CopyBlock code={nodeServerCode} lang="javascript" />

          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">3. Starten</h4>
          <CopyBlock code={`# Test run
node server.js

# Productie met pm2 (auto-restart)
npm install -g pm2
pm2 start server.js --name ocpp-server
pm2 save
pm2 startup`} />


          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                🐳 Alternatief: Docker Compose
              </h4>
              <span className="text-[10px] font-mono uppercase tracking-wider bg-primary/10 text-primary rounded-md px-2 py-0.5">
                Optioneel
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Gebruik Docker voor een reproduceerbare setup met automatische restarts en SSL via Caddy:
            </p>

            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">1. Projectstructuur</h4>
            <CopyBlock code={`mkdir ocpp-docker && cd ocpp-docker
mkdir app
# Kopieer server.js (hierboven) naar app/server.js`} />

            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">2. Dockerfile</h4>
            <CopyBlock code={`FROM node:20-alpine
WORKDIR /app
COPY app/package*.json ./
RUN npm ci --omit=dev
COPY app/ .
EXPOSE 9000
CMD ["node", "server.js"]`} lang="dockerfile" />

            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">3. app/package.json</h4>
            <CopyBlock code={`{
  "name": "ocpp-server",
  "version": "1.0.0",
  "dependencies": {
    "ocpp-rpc": "^1.2.0"
  }
}`} lang="json" />

            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">4. docker-compose.yml</h4>
            <CopyBlock code={`version: "3.8"

services:
  ocpp-server:
    build: .
    restart: always
    ports:
      - "9000:9000"
    environment:
      - NODE_ENV=production

  caddy:
    image: caddy:2-alpine
    restart: always
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:`} lang="yaml" />

            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">5. Caddyfile (automatisch SSL)</h4>
            <CopyBlock code={`ocpp.jouwdomein.nl {
    reverse_proxy ocpp-server:9000
}`} />

            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">6. Starten</h4>
            <CopyBlock code={`docker compose up -d --build

# Logs bekijken
docker compose logs -f ocpp-server

# Herstarten na update
docker compose up -d --build`} />

            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Voordeel:</strong> Caddy regelt automatisch SSL-certificaten (Let's Encrypt), geen nginx/certbot configuratie nodig. 
              Als je Docker gebruikt kun je <strong className="text-foreground">stap 4 (SSL/TLS)</strong> overslaan.
            </p>
          </div>
        </StepCard>

        {/* Step 4: SSL/TLS */}
        <StepCard step={4} title="SSL/TLS instellen (verplicht voor productie)">
          <p className="text-sm text-muted-foreground">
            Laadpalen vereisen <code className="font-mono text-foreground">wss://</code> (beveiligde WebSocket). Gebruik nginx als reverse proxy met Let's Encrypt:
          </p>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">1. Nginx + Certbot installeren</h4>
          <CopyBlock code={`sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d ocpp.jouwdomein.nl`} />

          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">2. Nginx configuratie</h4>
          <CopyBlock code={nginxConfig} lang="nginx" />

          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">3. Herstart</h4>
          <CopyBlock code={`sudo nginx -t && sudo systemctl reload nginx`} />
        </StepCard>

        {/* Step 5: Configure charger */}
        <StepCard step={5} title="Laadpaal configureren">
          <p className="text-sm text-muted-foreground mb-3">
            Stel de volgende parameters in op je laadpaal:
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {[
                  ['Protocol', 'OCPP 1.6J (WebSocket / JSON)'],
                  ['URL', 'wss://ocpp.jouwdomein.nl/<CHARGE_POINT_ID>'],
                  ['Subprotocol', 'ocpp1.6'],
                  ['Charge Point ID', 'Een uniek ID (bijv. CP-001)'],
                ].map(([key, value]) => (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">{key}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Na de eerste <code className="font-mono text-foreground">BootNotification</code> verschijnt de laadpaal automatisch in je dashboard.
          </p>
        </StepCard>

        {/* Step 6: Test */}
        <StepCard step={6} title="Testen">
          <p className="text-sm text-muted-foreground">
            Test de Ingest API direct met een cURL commando:
          </p>
          <CopyBlock code={testCurl} />
          <p className="text-xs text-muted-foreground">
            Als je <code className="font-mono text-foreground">{`{"ok": true, "status": "Accepted"}`}</code> terugkrijgt, werkt alles correct.
            Controleer vervolgens je <strong className="text-foreground">Dashboard</strong> of de laadpaal zichtbaar is.
          </p>
        </StepCard>

        {/* Checklist */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">Productie checklist</h2>
          </div>
          <div className="p-5">
            <ul className="space-y-2">
              <CheckItem>SSL/TLS certificaat geïnstalleerd (wss://)</CheckItem>
              <CheckItem>Firewall: alleen poort 443 (WSS) en 22 (SSH) open</CheckItem>
              <CheckItem>pm2 of systemd voor automatisch herstarten</CheckItem>
              <CheckItem>API key gekopieerd uit Instellingen → Ingest API</CheckItem>
              <CheckItem>Test-event gestuurd via cURL en geverifieerd in dashboard</CheckItem>
              <CheckItem>Logrotate geconfigureerd voor pm2 logs</CheckItem>
              <CheckItem>Monitoring ingesteld (bijv. UptimeRobot)</CheckItem>
            </ul>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default SetupGuide;
