import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, Cpu, AlertTriangle } from 'lucide-react';
import type { ControllerState, ECCliteLogEntry } from '@/pages/ECCliteEmulator';

interface Props {
  controller: ControllerState;
  setController: React.Dispatch<React.SetStateAction<ControllerState>>;
  addLog: (text: string, color?: ECCliteLogEntry['color']) => void;
}

const ECCliteFirmware = ({ controller, setController, addLog }: Props) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [flashing, setFlashing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractVersion = (fileName: string): string => {
    // Try to extract version like V32R16 from filename
    const match = fileName.match(/V\d+R\d+/i);
    if (match) return match[0].toUpperCase();
    // Fallback: try EVC4V32R16 pattern
    const match2 = fileName.match(/V(\d+)R(\d+)/i);
    if (match2) return `V${match2[1]}R${match2[2]}`;
    return fileName.replace('.bin', '');
  };

  const handleFlash = async () => {
    if (!selectedFile || !controller.connected) return;

    const version = extractVersion(selectedFile.name);
    setFlashing(true);
    setProgress(0);

    addLog(`Opening firmware file: ${selectedFile.name}`, 'green');
    addLog(`Detected version: ${version}`, 'green');
    addLog(`File size: ${(selectedFile.size / 1024).toFixed(1)} KB`, 'blue');
    await new Promise(r => setTimeout(r, 500));

    addLog('WARNING: Do not disconnect power or USB during flash!', 'red');
    addLog('Starting firmware flash...', 'green');

    // Simulate progress
    const totalSteps = 20;
    for (let i = 1; i <= totalSteps; i++) {
      await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
      const pct = Math.round((i / totalSteps) * 100);
      setProgress(pct);
      if (i % 5 === 0) {
        addLog(`Flash progress: ${pct}% (block ${i * 32}/${totalSteps * 32})`, 'green');
      }
    }

    addLog('Flash complete. Verifying checksum...', 'green');
    await new Promise(r => setTimeout(r, 600));
    addLog('Checksum OK', 'green');
    
    addLog('copy flash: sector 0...OK', 'red');
    addLog('copy flash: sector 1...OK', 'red');
    addLog('erase old firmware...OK', 'red');
    await new Promise(r => setTimeout(r, 400));

    addLog('Controller rebooting...', 'yellow');
    await new Promise(r => setTimeout(r, 800));

    setController(prev => ({ ...prev, firmwareVersion: version }));

    addLog('=== ECOTAP CONTROLLER BOOT ===', 'green');
    addLog(`Model: ${controller.model}`, 'blue');
    addLog(`Firmware: ${version}`, 'blue');
    addLog(`Serial: ${controller.serialNumber}`, 'blue');
    addLog('Controller ready.', 'green');
    addLog(`Firmware successfully updated to ${version}`, 'green');

    setFlashing(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card mt-4">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Firmware Update</h2>
      </div>
      <div className="p-5 space-y-5">
        <div className="rounded-lg border-2 border-dashed border-border bg-muted/30 p-6 text-center">
          <Cpu className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-3">
            Selecteer een .bin firmware bestand
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".bin"
            className="hidden"
            onChange={e => setSelectedFile(e.target.files?.[0] || null)}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
            <Upload className="h-4 w-4" />
            Open Firmware file
          </Button>
        </div>

        {selectedFile && (
          <div className="rounded-lg bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-mono font-semibold text-foreground">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB · Versie: {extractVersion(selectedFile.name)}
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {extractVersion(selectedFile.name)}
              </Badge>
            </div>

            {flashing && (
              <div className="space-y-2">
                <Progress value={progress} className="h-3" />
                <p className="text-xs text-muted-foreground text-center font-mono">{progress}%</p>
              </div>
            )}

            <div className="flex items-start gap-2 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Onderbreek het flash-proces niet! Het loskoppelen van voeding of USB-kabel kan de controller permanent beschadigen.
              </span>
            </div>

            <Button
              onClick={handleFlash}
              disabled={!controller.connected || flashing}
              className="w-full gap-2 h-11"
            >
              <Cpu className="h-4 w-4" />
              {flashing ? 'Firmware wordt geflasht...' : 'Program firmware'}
            </Button>
          </div>
        )}

        {!controller.connected && (
          <p className="text-xs text-destructive text-center">
            Verbind eerst met de controller via het tabblad "Verbinding"
          </p>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Huidige firmware:</strong> <span className="font-mono">{controller.firmwareVersion}</span></p>
          <p><strong>Controller:</strong> <span className="font-mono">{controller.model}</span></p>
        </div>
      </div>
    </div>
  );
};

export default ECCliteFirmware;
