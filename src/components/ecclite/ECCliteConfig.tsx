import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Send, Download, ToggleLeft, CheckSquare, Square } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  updateConfig: (key: string, value: string) => void;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
}

const ECCliteConfig = ({ controller, updateConfig, addLog }: Props) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const configKeys = useMemo(() => Object.keys(controller.config), [controller.config]);

  const toggleAll = () => {
    if (selected.size === configKeys.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(configKeys));
    }
  };

  const toggleSelection = () => {
    const next = new Set<string>();
    for (const key of configKeys) {
      if (!selected.has(key)) next.add(key);
    }
    setSelected(next);
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

  return (
    <div className="rounded-xl border border-border bg-card mt-4">
      {/* Toolbar – matches ECCManager style */}
      <div className="border-b border-border px-3 py-2 flex items-center gap-2 flex-wrap bg-muted/30">
        <Button variant="outline" size="sm" onClick={receiveConfig} disabled={!controller.connected || sending} className="gap-1.5 text-xs h-8 font-semibold">
          <Download className="h-3.5 w-3.5" />
          Receive config
        </Button>
        <Button size="sm" onClick={sendSelected} disabled={!controller.connected || sending || selected.size === 0} className="gap-1.5 text-xs h-8 font-semibold">
          <Send className="h-3.5 w-3.5" />
          Send selected ({selected.size})
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button variant="outline" size="sm" onClick={() => setSelected(new Set())} className="gap-1.5 text-xs h-8">
          <Square className="h-3.5 w-3.5" />
          Unselect all
        </Button>
        <Button variant="outline" size="sm" onClick={toggleSelection} className="gap-1.5 text-xs h-8">
          <ToggleLeft className="h-3.5 w-3.5" />
          Toggle selection
        </Button>
        <Button variant="outline" size="sm" onClick={toggleAll} className="gap-1.5 text-xs h-8">
          <CheckSquare className="h-3.5 w-3.5" />
          {selected.size === configKeys.length ? 'Deselecteer alles' : 'Selecteer alles'}
        </Button>
      </div>

      {!controller.connected && (
        <p className="text-xs text-destructive text-center py-2 bg-destructive/5">
          Verbind eerst met de controller
        </p>
      )}

      {/* Flat config list – ECCManager style */}
      <div className="max-h-[520px] overflow-y-auto">
        <table className="w-full text-xs font-mono">
          <tbody>
            {configKeys.map((key, i) => (
              <tr
                key={key}
                className={`
                  border-b border-border/50 hover:bg-accent/40 transition-colors
                  ${i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                  ${selected.has(key) ? 'bg-primary/10 hover:bg-primary/15' : ''}
                `}
              >
                <td className="w-8 px-2 py-1.5 text-center">
                  <Checkbox
                    checked={selected.has(key)}
                    onCheckedChange={(v) => {
                      setSelected(prev => {
                        const next = new Set(prev);
                        v ? next.add(key) : next.delete(key);
                        return next;
                      });
                    }}
                  />
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap font-semibold text-foreground min-w-[220px]">
                  {key}
                </td>
                <td className="px-2 py-1.5 w-full">
                  <Input
                    value={controller.config[key] || ''}
                    onChange={e => updateConfig(key, e.target.value)}
                    className="font-mono text-xs h-7 bg-background border-input"
                    disabled={!controller.connected}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ECCliteConfig;
