import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Settings2, Trash2 } from 'lucide-react';
import { useMqttConfigurations, MqttConfiguration } from '@/hooks/useMqttConfigurations';
import MqttConfigDialog from './MqttConfigDialog';

const MqttSettingsPanel = () => {
  const { data: configs = [], isLoading, remove } = useMqttConfigurations();
  const [editConfig, setEditConfig] = useState<MqttConfiguration | null>(null);

  const assetTypeLabels: Record<string, string> = {
    charge_point: 'Laadpaal',
    energy_meter: 'Energiemeter',
    battery: 'Batterij',
    pv_inverter: 'Zonne-energie',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wifi className="h-5 w-5 text-primary" />
          MQTT Verbindingen
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : configs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen MQTT configuraties. Configureer MQTT per asset via de laadpalen, meters of andere asset pagina's.
          </p>
        ) : (
          <div className="space-y-2">
            {configs.map(c => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-3">
                  {c.connection_status === 'connected' ? (
                    <Wifi className="h-4 w-4 text-primary" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{c.asset_name || c.asset_id}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {assetTypeLabels[c.asset_type] || c.asset_type} · {c.broker_host}:{c.broker_port}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.enabled ? 'default' : 'outline'} className="text-xs">
                    {c.enabled ? 'Actief' : 'Uit'}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditConfig(c)}>
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove.mutate(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {editConfig && (
          <MqttConfigDialog
            open={!!editConfig}
            onOpenChange={() => setEditConfig(null)}
            assetType={editConfig.asset_type}
            assetId={editConfig.asset_id}
            assetName={editConfig.asset_name || editConfig.asset_id}
            existing={editConfig}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default MqttSettingsPanel;
