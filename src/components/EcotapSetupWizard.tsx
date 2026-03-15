import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Cpu, Download, Copy, Check, ChevronDown, ChevronRight, Zap,
  ArrowRight, Globe, Settings2, Shield, AlertTriangle, Plug, Search
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useChargePoints } from '@/hooks/useChargePoints';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const WS_ENDPOINT = `${SUPABASE_URL?.replace('https://', '') || '<project>.supabase.co'}/functions/v1/ocpp-ws`;

// Ecotap-specific configuration parameters grouped by category
const ECOTAP_CONFIG = [
  // Communication
  { key: 'com_Endpoint', label: 'OCPP Endpoint', category: 'Communicatie', description: 'WebSocket URL van het Central System', defaultValue: `wss://${WS_ENDPOINT}/#OSN#` },
  { key: 'com_OCPPID', label: 'OCPP ID', category: 'Communicatie', description: 'Unieke identifier (bijv. NL*ECO*1000)', defaultValue: 'NL*ECO*1000' },
  { key: 'com_ProtType', label: 'Protocol type', category: 'Communicatie', description: 'OCPP protocol versie', defaultValue: 'OCPP1.6J' },
  { key: 'com_ProtCh', label: 'Protocol kanaal', category: 'Communicatie', description: 'Communicatiekanaal (eth/gsm)', defaultValue: 'eth' },
  { key: 'com_Options', label: 'Communicatie opties', category: 'Communicatie', description: 'Comma-separated opties voor communicatie', defaultValue: 'comMaster=1,Events=1,BlockBeforeBoot=1,Wdt=0,updSendInIdle=0,UseTLS=1,blockLgFull=0' },
  // Charging
  { key: 'chg_RatedCurrent', label: 'Rated Current', category: 'Laden', description: 'Nominale stroom per connector (A)', defaultValue: '16,16' },
  { key: 'chg_StationMaxCurrent', label: 'Station Max Current', category: 'Laden', description: 'Maximale stroom voor het station (A)', defaultValue: '25' },
  { key: 'chg_MinChargingCurrent', label: 'Min Charging Current', category: 'Laden', description: 'Minimale laadstroom (A)', defaultValue: '6' },
  { key: 'chg_Ch1Options', label: 'Connector 1 Opties', category: 'Laden', description: 'Opties voor connector 1', defaultValue: 'PlugAndCharge=0,OvercurrentSens=0,StopOnChargeComplete=0' },
  { key: 'chg_Ch2Options', label: 'Connector 2 Opties', category: 'Laden', description: 'Opties voor connector 2', defaultValue: 'PlugAndCharge=0,OvercurrentSens=0,StopOnChargeComplete=0' },
  // Metering
  { key: 'chg_KWH1', label: 'kWh Meter 1', category: 'Meting', description: 'Energiemeter configuratie CH1', defaultValue: 'EASTR_SDM72D,1,9600,N,1' },
  { key: 'chg_KWH2', label: 'kWh Meter 2', category: 'Meting', description: 'Energiemeter configuratie CH2', defaultValue: 'EASTR_SDM72D,2,9600,N,1' },
  { key: 'chg_KWH3', label: 'kWh Meter 3', category: 'Meting', description: 'Energiemeter configuratie CH3 (grid)', defaultValue: 'EASTR_SDM72D,3,9600,N,1' },
  // RFID
  { key: 'chg_Reader1', label: 'RFID Reader 1', category: 'RFID', description: 'RFID reader type voor CH1', defaultValue: 'sl032,CH1' },
  { key: 'chg_Reader2', label: 'RFID Reader 2', category: 'RFID', description: 'RFID reader type voor CH2', defaultValue: 'sl032,CH2' },
  // Network
  { key: 'eth_cfg', label: 'Ethernet config', category: 'Netwerk', description: 'IP-configuratie (DHCP/static)', defaultValue: 'type=dhcp,ip=0.0.0.0,netmask=0.0.0.0,dns=0.0.0.0,gw=0.0.0.0' },
  { key: 'gsm_APN', label: 'GSM APN', category: 'Netwerk', description: 'Access Point Name voor mobiel netwerk', defaultValue: 'm2mservices,,' },
  { key: 'gsm_Oper', label: 'GSM Operator', category: 'Netwerk', description: 'Operator selectie (0=auto)', defaultValue: '0' },
  { key: 'gsm_Options', label: 'GSM Opties', category: 'Netwerk', description: 'GSM module opties', defaultValue: 'noSmsChk=0,AutoAPN=0,3G4G=0' },
  // Grid
  { key: 'grid_Role', label: 'Grid rol', category: 'Grid', description: 'Rol in load balancing', defaultValue: 'Station_ctrl' },
  { key: 'grid_InstallationMaxcurrent', label: 'Installatie max stroom', category: 'Grid', description: 'Maximale stroom aansluiting (A)', defaultValue: '250' },
  { key: 'grid_InstallationSaveCurrent', label: 'Installatie veilige stroom', category: 'Grid', description: 'Veilige stroom aansluiting (A)', defaultValue: '100' },
  // Debug
  { key: 'chg_Debug', label: 'Debug levels', category: 'Debug', description: 'Logging niveaus per module', defaultValue: 'warn=1,error=1,date=1,syslog=0,gsm=1,events=1,com=0,ocpp=0' },
];

const CATEGORIES = ['Alle', 'Communicatie', 'Laden', 'Meting', 'RFID', 'Netwerk', 'Grid', 'Debug'];

interface FirmwareFile {
  name: string;
  folder: string;
}

const EcotapSetupWizard = () => {
  const [selectedFile, setSelectedFile] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    ECOTAP_CONFIG.forEach(p => { initial[p.key] = p.defaultValue; });
    return initial;
  });
  const [firmwareExtracted, setFirmwareExtracted] = useState<Record<string, string>>({});
  const [categoryFilter, setCategoryFilter] = useState('Alle');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const { data: chargePoints } = useChargePoints();

  // List firmware files
  const { data: firmwareFiles, isLoading: filesLoading } = useQuery({
    queryKey: ['firmware-files-ecotap'],
    queryFn: async () => {
      const { data: rootItems, error: rootErr } = await supabase.storage.from('firmware').list('', {
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (rootErr) throw rootErr;
      const allFiles: FirmwareFile[] = [];
      for (const item of rootItems || []) {
        if (!item.id) {
          const { data: folderFiles } = await supabase.storage.from('firmware').list(item.name, {
            sortBy: { column: 'created_at', order: 'desc' },
          });
          if (folderFiles) {
            for (const f of folderFiles) {
              if (f.id) allFiles.push({ name: `${item.name}/${f.name}`, folder: item.name });
            }
          }
        } else {
          allFiles.push({ name: item.name, folder: '' });
        }
      }
      return allFiles;
    },
  });

  // Extract Ecotap config from firmware binary using AI
  const extractFromFirmware = async () => {
    if (!selectedFile) return;
    setExtracting(true);
    try {
      // Download firmware binary
      const { data: blob, error } = await supabase.storage.from('firmware').download(selectedFile);
      if (error) throw error;

      const bytes = new Uint8Array(await blob.arrayBuffer());

      // Smart extraction: scan for ASCII strings that match Ecotap config keys
      const extracted: Record<string, string> = {};
      const text = new TextDecoder('ascii', { fatal: false }).decode(bytes);

      // Search for known Ecotap config patterns in the binary
      for (const param of ECOTAP_CONFIG) {
        // Look for key=value patterns
        const keyPattern = new RegExp(`${param.key}[=:\\s]+([^\\x00\\n\\r]{1,200})`, 'i');
        const match = text.match(keyPattern);
        if (match) {
          extracted[param.key] = match[1].replace(/\x00+$/, '').trim();
        }
      }

      // Also look for common Ecotap strings
      const endpointMatch = text.match(/(?:wss?:\/\/|ocpp)[^\x00\n\r]{5,150}/i);
      if (endpointMatch && !extracted['com_Endpoint']) {
        extracted['com_Endpoint'] = endpointMatch[0].trim();
      }

      const ocppIdMatch = text.match(/NL\*ECO\*\d+/);
      if (ocppIdMatch && !extracted['com_OCPPID']) {
        extracted['com_OCPPID'] = ocppIdMatch[0];
      }

      // Firmware version from binary
      const fwMatch = text.match(/V\d+R\d+/i) || text.match(/\d+\.\d+x?\.\d+R\.\d+/);
      if (fwMatch) {
        extracted['_firmwareVersion'] = fwMatch[0];
      }

      // Serial number
      const snMatch = text.match(/G\d{4,6}\*\d/);
      if (snMatch) {
        extracted['_serialNumber'] = snMatch[0];
      }

      // Also try AI extraction for deeper analysis
      try {
        // Extract smart hex sample for AI
        const sampleSize = Math.min(bytes.length, 8192);
        const hexSample = Array.from(bytes.slice(0, sampleSize))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' ')
          .substring(0, 4000);

        const { data: aiResult } = await supabase.functions.invoke('analyze-firmware', {
          body: {
            mode: 'extract-config',
            hexDump: hexSample,
            fileName: selectedFile,
            extraContext: `This is an Ecotap EVC charger firmware. Extract ALL Ecotap-specific configuration parameters. 
Known keys: ${ECOTAP_CONFIG.map(p => p.key).join(', ')}.
Look for: com_Endpoint (OCPP WebSocket URL), com_OCPPID, chg_RatedCurrent, chg_StationMaxCurrent, grid_InstallationMaxcurrent, eth_cfg, gsm_APN, etc.
Return each found parameter as name=value.`,
          },
        });

        if (aiResult?.parameters) {
          for (const p of aiResult.parameters) {
            const matchedKey = ECOTAP_CONFIG.find(
              c => c.key.toLowerCase() === p.name.toLowerCase() || c.key.toLowerCase().includes(p.name.toLowerCase())
            );
            if (matchedKey && !extracted[matchedKey.key]) {
              extracted[matchedKey.key] = p.value;
            }
          }
        }
      } catch {
        // AI extraction is optional
      }

      setFirmwareExtracted(extracted);

      // Merge extracted values into config
      setConfig(prev => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(extracted)) {
          if (!key.startsWith('_') && ECOTAP_CONFIG.some(p => p.key === key)) {
            next[key] = value;
          }
        }
        // Always pre-fill VoltControl endpoint
        next['com_Endpoint'] = `wss://${WS_ENDPOINT}/#OSN#`;
        return next;
      });

      const count = Object.keys(extracted).length;
      toast.success(`${count} parameter${count !== 1 ? 's' : ''} uit firmware geëxtraheerd`);
    } catch (err: any) {
      toast.error(`Extractie mislukt: ${err.message}`);
    } finally {
      setExtracting(false);
    }
  };

  // Pre-fill com_Endpoint with VoltControl URL
  useEffect(() => {
    setConfig(prev => ({
      ...prev,
      'com_Endpoint': `wss://${WS_ENDPOINT}/#OSN#`,
    }));
  }, []);

  const filteredParams = useMemo(() => {
    return ECOTAP_CONFIG.filter(p => {
      if (categoryFilter !== 'Alle' && p.category !== categoryFilter) return false;
      if (searchQuery && !p.key.toLowerCase().includes(searchQuery.toLowerCase()) && !p.label.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [categoryFilter, searchQuery]);

  const copyValue = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    toast.success('Gekopieerd');
    setTimeout(() => setCopied(null), 2000);
  };

  const generateOcppCommands = () => {
    const commands = ECOTAP_CONFIG.map(p => ({
      key: p.key,
      value: config[p.key] || p.defaultValue,
    }));
    const json = JSON.stringify(commands, null, 2);
    navigator.clipboard.writeText(json);
    toast.success('OCPP ChangeConfiguration commands gekopieerd');
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Cpu className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">Ecotap Laadpaal Configuratie</h3>
          <p className="text-xs text-muted-foreground">Haal parameters uit firmware en configureer de laadpaal voor VoltControl</p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-border pt-4">
          {/* Architecture */}
          <div className="flex items-center gap-2 flex-wrap text-xs font-mono text-muted-foreground">
            <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 border border-border px-3 py-2">
              <Cpu className="h-3.5 w-3.5 text-primary" />
              <span>Firmware .bin</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5" />
            <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-primary">
              <Settings2 className="h-3.5 w-3.5" />
              <span>Config Extractie</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5" />
            <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 border border-border px-3 py-2">
              <Plug className="h-3.5 w-3.5 text-primary" />
              <span>Ecotap EVC</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5" />
            <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 border border-border px-3 py-2">
              <Globe className="h-3.5 w-3.5 text-primary" />
              <span>VoltControl</span>
            </div>
          </div>

          {/* Step 1: Select firmware */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary text-[10px] font-bold">1</span>
              Firmware selecteren & parameters extraheren
            </h4>
            <div className="flex gap-2">
              <Select value={selectedFile} onValueChange={setSelectedFile}>
                <SelectTrigger className="flex-1 text-xs font-mono">
                  <SelectValue placeholder="Kies een firmware bestand..." />
                </SelectTrigger>
                <SelectContent>
                  {filesLoading ? (
                    <SelectItem value="_loading" disabled>Laden...</SelectItem>
                  ) : (
                    firmwareFiles?.map(f => (
                      <SelectItem key={f.name} value={f.name} className="text-xs font-mono">
                        {f.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={extractFromFirmware}
                disabled={!selectedFile || extracting}
                size="sm"
                className="gap-1.5 shrink-0"
              >
                {extracting ? (
                  <Skeleton className="h-3.5 w-3.5 rounded-full animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Extraheer
              </Button>
            </div>

            {/* Extracted firmware info */}
            {(firmwareExtracted['_firmwareVersion'] || firmwareExtracted['_serialNumber']) && (
              <div className="flex gap-3 flex-wrap">
                {firmwareExtracted['_firmwareVersion'] && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Zap className="h-3 w-3" />
                    Firmware: {firmwareExtracted['_firmwareVersion']}
                  </Badge>
                )}
                {firmwareExtracted['_serialNumber'] && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Cpu className="h-3 w-3" />
                    S/N: {firmwareExtracted['_serialNumber']}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  {Object.keys(firmwareExtracted).filter(k => !k.startsWith('_')).length} parameters gevonden
                </Badge>
              </div>
            )}
          </div>

          {/* Step 2: Edit configuration */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary text-[10px] font-bold">2</span>
              Configuratie aanpassen
            </h4>

            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Zoek parameter..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-9"
                />
              </div>
            </div>

            {/* Config table */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-44">Parameter</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Waarde</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-20">Bron</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParams.map(param => {
                      const isFromFirmware = param.key in firmwareExtracted;
                      const isEndpoint = param.key === 'com_Endpoint';
                      return (
                        <tr key={param.key} className={`border-b border-border last:border-0 ${isEndpoint ? 'bg-primary/5' : 'hover:bg-muted/20'}`}>
                          <td className="px-3 py-2">
                            <div className="font-mono text-xs text-foreground">{param.key}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">{param.description}</div>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              value={config[param.key] || ''}
                              onChange={e => setConfig(prev => ({ ...prev, [param.key]: e.target.value }))}
                              className="text-xs font-mono h-8"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {isFromFirmware ? (
                              <Badge variant="default" className="text-[9px] px-1.5 py-0">FW</Badge>
                            ) : isEndpoint ? (
                              <Badge className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary hover:bg-primary/30">VC</Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">default</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => copyValue(param.key, config[param.key] || '')}
                            >
                              {copied === param.key ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Step 3: Apply */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary text-[10px] font-bold">3</span>
              Toepassen op laadpaal
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Via ECCManager */}
              <div className="rounded-lg border border-border p-4 space-y-2">
                <h5 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5 text-primary" />
                  Via ECCManager / USB
                </h5>
                <p className="text-[11px] text-muted-foreground">
                  Verbind via USB-TTL en stuur de parameters via het Ecotap configuratie-protocol.
                </p>
                <Button variant="outline" size="sm" className="w-full text-xs gap-1.5" onClick={generateOcppCommands}>
                  <Copy className="h-3 w-3" />
                  Kopieer alle parameters
                </Button>
              </div>

              {/* Via OCPP */}
              <div className="rounded-lg border border-border p-4 space-y-2">
                <h5 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-primary" />
                  Via OCPP ChangeConfiguration
                </h5>
                <p className="text-[11px] text-muted-foreground">
                  Als de paal al verbonden is, stuur de parameters via OCPP remote commands.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-1.5"
                  onClick={() => {
                    const cmd = ECOTAP_CONFIG.map(p => `ChangeConfiguration: ${p.key} = ${config[p.key]}`).join('\n');
                    navigator.clipboard.writeText(cmd);
                    toast.success('OCPP commands gekopieerd');
                  }}
                >
                  <Copy className="h-3 w-3" />
                  Kopieer OCPP commands
                </Button>
              </div>
            </div>

            {/* TLS Warning */}
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                <span className="text-xs font-semibold text-foreground">TLS/SSL</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                VoltControl vereist <code className="font-mono text-foreground">wss://</code>. Zorg dat <code className="font-mono text-foreground">com_Options</code> bevat: <code className="font-mono text-foreground">UseTLS=1</code>.
                Als de firmware geen TLS ondersteunt, gebruik de WS→WSS Gateway (zie Setup Guide).
              </p>
            </div>

            {/* Quick reference */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <h5 className="text-xs font-semibold text-foreground flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-primary" />
                Snelle referentie
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-muted-foreground">Endpoint:</span>
                  <code className="font-mono text-foreground ml-1 break-all">{config['com_Endpoint']}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">OCPP ID:</span>
                  <code className="font-mono text-foreground ml-1">{config['com_OCPPID']}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Protocol:</span>
                  <code className="font-mono text-foreground ml-1">{config['com_ProtType']}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Max stroom:</span>
                  <code className="font-mono text-foreground ml-1">{config['chg_StationMaxCurrent']}A</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EcotapSetupWizard;
