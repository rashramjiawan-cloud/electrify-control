import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Send, Download, CheckSquare, Search } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  updateConfig: (key: string, value: string) => void;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
}

const CONFIG_DESCRIPTIONS: Record<string, { rw: string; description: string; category: string }> = {
  'chg_RatedCurrent': { rw: 'RW', description: 'Rated current per channel (amps)', category: 'Charging' },
  'chg_StationMaxCurrent': { rw: 'RW', description: 'Max current per phase (amps)', category: 'Charging' },
  'chg_MinChargingCurrent': { rw: 'RW', description: 'Min charging current (amps)', category: 'Charging' },
  'chg_Reader1': { rw: 'RW', description: 'Token reader type CH1', category: 'Charging' },
  'chg_Reader2': { rw: 'RW', description: 'Token reader type CH2', category: 'Charging' },
  'chg_Ch1Options': { rw: 'RW', description: 'Channel 1 options (CSL)', category: 'Charging' },
  'chg_Ch2Options': { rw: 'RW', description: 'Channel 2 options (CSL)', category: 'Charging' },
  'chg_Debug': { rw: 'RW', description: 'Debug logging options (CSL)', category: 'Debug' },
  'chg_KWH1': { rw: 'RW', description: 'Energy meter config CH1', category: 'Metering' },
  'chg_KWH2': { rw: 'RW', description: 'Energy meter config CH2', category: 'Metering' },
  'chg_KWH3': { rw: 'RW', description: 'Utility energy meter config', category: 'Metering' },
  'com_Endpoint': { rw: 'RW', description: 'OCPP Central System endpoint', category: 'Communication' },
  'com_OCPPID': { rw: 'RW', description: 'OCPP Identification ID (max 25 chars)', category: 'Communication' },
  'com_ProtType': { rw: 'RW', description: 'Communication protocol', category: 'Communication' },
  'com_ProtCh': { rw: 'RW', description: 'Communication channel', category: 'Communication' },
  'com_Options': { rw: 'RW', description: 'Communication options (CSL)', category: 'Communication' },
  'eth_cfg': { rw: 'RW', description: 'Ethernet interface config', category: 'Network' },
  'grid_Role': { rw: 'RW', description: 'Grid role (No_ctrl/Station_ctrl/Slave/Master)', category: 'Grid' },
  'grid_InstallationMaxcurrent': { rw: 'RW', description: 'Max grid current (amps)', category: 'Grid' },
  'grid_InstallationSaveCurrent': { rw: 'RW', description: 'Safe mode grid current (amps)', category: 'Grid' },
  'gsm_APN': { rw: 'RW', description: 'GSM APN info', category: 'GSM' },
  'gsm_Oper': { rw: 'RW', description: 'Preferred GSM operator', category: 'GSM' },
  'gsm_Options': { rw: 'RW', description: 'GSM options', category: 'GSM' },
};

const ECCliteConfig = ({ controller, updateConfig, addLog }: Props) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);

  const configKeys = useMemo(() => {
    const keys = Object.keys(controller.config);
    if (!search) return keys;
    const q = search.toLowerCase();
    return keys.filter(k =>
      k.toLowerCase().includes(q) ||
      (CONFIG_DESCRIPTIONS[k]?.description || '').toLowerCase().includes(q) ||
      (CONFIG_DESCRIPTIONS[k]?.category || '').toLowerCase().includes(q)
    );
  }, [controller.config, search]);

  const toggleAll = () => {
    if (selected.size === configKeys.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(configKeys));
    }
  };

  const sendSelected = async () => {
    if (!controller.connected || selected.size === 0) return;
    setSending(true);

    addLog(`Sending ${selected.size} configuration items...`, 'green');
    let idx = 0;
    for (const key of selected) {
      idx++;
      await new Promise(r => setTimeout(r, 100 + Math.random() * 150));
      addLog(`Snd uid[${idx}] cmd[JSON_COMMAND_REQ[31]]seq[${100 + idx}]len[${controller.config[key]?.length || 0}]`, 'blue');
      addLog(`JSON Data received OK [${idx}]`, 'blue');
      addLog(`{"status":"Accepted"}`, 'blue');
      addLog(`cmd_JSON_COMMAND [ChangeConfiguration][${idx}]`, 'blue');
    }

    addLog(`Send ${selected.size} cfg items OK`, 'green');
    await new Promise(r => setTimeout(r, 1500));
    
    const checksum = Math.random().toString(16).slice(2, 10).toUpperCase();
    addLog(`SV CFG():${checksum}`, 'green');
    addLog('Configuration saved successfully', 'green');

    setSending(false);
  };

  const receiveConfig = async () => {
    if (!controller.connected) return;
    setSending(true);
    addLog('Receiving configuration from controller...', 'blue');
    await new Promise(r => setTimeout(r, 800));

    for (const key of Object.keys(controller.config)) {
      addLog(`${key} = ${controller.config[key]}`, 'blue');
    }
    addLog(`Received ${Object.keys(controller.config).length} configuration items`, 'green');
    setSending(false);
  };

  const categories = useMemo(() => {
    const cats: Record<string, string[]> = {};
    for (const key of configKeys) {
      const cat = CONFIG_DESCRIPTIONS[key]?.category || 'Overig';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(key);
    }
    return cats;
  }, [configKeys]);

  return (
    <div className="rounded-xl border border-border bg-card mt-4">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">JSON Configuratie</h2>
      </div>
      <div className="p-5 space-y-4">
        {/* Search & actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Zoek parameter..."
              className="pl-9 text-xs font-mono h-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={toggleAll} className="gap-1.5 text-xs h-9">
            <CheckSquare className="h-3.5 w-3.5" />
            {selected.size === configKeys.length ? 'Deselecteer alles' : 'Selecteer alles'}
          </Button>
          <Button variant="outline" size="sm" onClick={receiveConfig} disabled={!controller.connected || sending} className="gap-1.5 text-xs h-9">
            <Download className="h-3.5 w-3.5" />
            Receive config
          </Button>
          <Button size="sm" onClick={sendSelected} disabled={!controller.connected || sending || selected.size === 0} className="gap-1.5 text-xs h-9">
            <Send className="h-3.5 w-3.5" />
            Send selected ({selected.size})
          </Button>
        </div>

        {!controller.connected && (
          <p className="text-xs text-destructive text-center py-2">
            Verbind eerst met de controller
          </p>
        )}

        {/* Config items by category */}
        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
          {Object.entries(categories).map(([cat, keys]) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{cat}</h3>
              <div className="space-y-2">
                {keys.map(key => (
                  <div key={key} className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
                    <Checkbox
                      checked={selected.has(key)}
                      onCheckedChange={(v) => {
                        setSelected(prev => {
                          const next = new Set(prev);
                          v ? next.add(key) : next.delete(key);
                          return next;
                        });
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold text-foreground">{key}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {CONFIG_DESCRIPTIONS[key]?.rw || 'RW'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {CONFIG_DESCRIPTIONS[key]?.description || ''}
                      </p>
                      <Input
                        value={controller.config[key] || ''}
                        onChange={e => updateConfig(key, e.target.value)}
                        className="font-mono text-xs h-8 mt-1"
                        disabled={!controller.connected}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ECCliteConfig;
