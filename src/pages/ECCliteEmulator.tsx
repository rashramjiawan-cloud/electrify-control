import AppLayout from '@/components/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Cpu, Terminal, Wifi } from 'lucide-react';
import ECCliteConnection from '@/components/ecclite/ECCliteConnection';
import ECCliteFirmware from '@/components/ecclite/ECCliteFirmware';
import ECCliteConfig from '@/components/ecclite/ECCliteConfig';
import ECCliteDebugLog from '@/components/ecclite/ECCliteDebugLog';
import { useState, useCallback, useRef } from 'react';

export interface ECCliteLogEntry {
  id: number;
  time: string;
  text: string;
  color: 'blue' | 'green' | 'red' | 'yellow';
}

export interface ControllerState {
  connected: boolean;
  firmwareVersion: string;
  serialNumber: string;
  ocppId: string;
  model: string;
  vendor: string;
  config: Record<string, string>;
}

const DEFAULT_CONFIG: Record<string, string> = {
  'chg_RatedCurrent': '16,16',
  'chg_StationMaxCurrent': '25',
  'chg_MinChargingCurrent': '6',
  'chg_Reader1': 'sl032,CH1',
  'chg_Reader2': 'sl032,CH2',
  'chg_Ch1Options': 'PlugAndCharge=0,OvercurrentSens=0,StopOnChargeComplete=0,OfflineStopOnDisconnect=0,StopOnLowCosphi=0,Rel2OnLowCosphi=0',
  'chg_Ch2Options': 'PlugAndCharge=0,OvercurrentSens=0,StopOnChargeComplete=0,OfflineStopOnDisconnect=0,StopOnLowCosphi=0,Rel2OnLowCosphi=0',
  'chg_Debug': 'warn=1,error=1,date=1,syslog=0,gsm=1,events=1,com=0,ocpp=0,eth=0,grid=0,ctrl=3,general=3,sensors=0,fw=0,modbus=0,canbus=0,sys=0',
  'chg_KWH1': 'EASTR_SDM72D,1,9600,N,1',
  'chg_KWH2': 'EASTR_SDM72D,2,9600,N,1',
  'chg_KWH3': 'EASTR_SDM72D,3,9600,N,1',
  'com_Endpoint': 'wss://devices.ecotap.com/registry/ocpp/#OSN#',
  'com_OCPPID': 'NL*ECO*1000',
  'com_ProtType': 'OCPP1.6J',
  'com_ProtCh': 'eth',
  'com_Options': 'Events=1,BlockBeforeBoot=1,Wdt=0,updSendInIdle=0,blockLgFull=0,useTLS=0,comMaster=0',
  'eth_cfg': 'type=dhcp,ip=0.0.0.0,netmask=0.0.0.0,dns=0.0.0.0,gw=0.0.0.0',
  'grid_Role': 'Station_ctrl',
  'grid_InstallationMaxcurrent': '250',
  'grid_InstallationSaveCurrent': '100',
  'gsm_APN': 'm2mservices,,',
  'gsm_Oper': '0',
  'gsm_Options': 'noSmsChk=0,AutoAPN=0,3G4G=0',
};

const ECCliteEmulator = () => {
  const logCounterRef = useRef(0);
  const [logs, setLogs] = useState<ECCliteLogEntry[]>([]);
  const [controller, setController] = useState<ControllerState>({
    connected: false,
    firmwareVersion: 'V32R16',
    serialNumber: 'G48229*1',
    ocppId: 'NL*ECO*1000',
    model: 'EVC4.31',
    vendor: 'Ecotap',
    config: { ...DEFAULT_CONFIG },
  });

  const addLog = useCallback((text: string, color: ECCliteLogEntry['color'] = 'blue') => {
    const entry: ECCliteLogEntry = {
      id: Date.now() + logCounterRef.current++,
      time: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      text,
      color,
    };
    setLogs(prev => [...prev, entry].slice(-200));
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const updateConfig = useCallback((key: string, value: string) => {
    setController(prev => ({
      ...prev,
      config: { ...prev.config, [key]: value },
    }));
  }, []);

  return (
    <AppLayout title="ECClite Emulator" subtitle="Ecotap Controller Configuration Lite – EVC4.x / EVC5.x / ECC.x (V32Rx)">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="connection">
            <TabsList className="grid w-full grid-cols-4 max-w-lg">
              <TabsTrigger value="connection" className="gap-1.5 text-xs">
                <Wifi className="h-3.5 w-3.5" />
                Verbinding
              </TabsTrigger>
              <TabsTrigger value="firmware" className="gap-1.5 text-xs">
                <Cpu className="h-3.5 w-3.5" />
                Firmware
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-1.5 text-xs">
                <Settings className="h-3.5 w-3.5" />
                Instellingen
              </TabsTrigger>
              <TabsTrigger value="debug" className="gap-1.5 text-xs">
                <Terminal className="h-3.5 w-3.5" />
                Debug
              </TabsTrigger>
            </TabsList>

            <TabsContent value="connection">
              <ECCliteConnection
                controller={controller}
                setController={setController}
                addLog={addLog}
              />
            </TabsContent>
            <TabsContent value="firmware">
              <ECCliteFirmware
                controller={controller}
                setController={setController}
                addLog={addLog}
              />
            </TabsContent>
            <TabsContent value="config">
              <ECCliteConfig
                controller={controller}
                updateConfig={updateConfig}
                addLog={addLog}
              />
            </TabsContent>
            <TabsContent value="debug">
              <ECCliteDebugLog controller={controller} addLog={addLog} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: Serial Log */}
        <div className="rounded-xl border border-border bg-card flex flex-col max-h-[calc(100vh-12rem)]">
          <div className="border-b border-border px-5 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Seriële Log (TTL)</h2>
            <button onClick={clearLogs} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Wissen
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 bg-[#1a1a2e] font-mono text-[11px] leading-relaxed min-h-[400px]">
            {logs.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Controller niet verbonden...</p>
            ) : (
              logs.map(log => (
                <div key={log.id} className={`
                  ${log.color === 'blue' ? 'text-blue-400' : ''}
                  ${log.color === 'green' ? 'text-green-400' : ''}
                  ${log.color === 'red' ? 'text-red-400' : ''}
                  ${log.color === 'yellow' ? 'text-yellow-400' : ''}
                `}>
                  <span className="text-gray-600 mr-2">{log.time}</span>
                  {log.text}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default ECCliteEmulator;
