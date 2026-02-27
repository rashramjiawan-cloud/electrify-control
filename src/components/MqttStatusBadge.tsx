import { Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useMqttConfigForAsset } from '@/hooks/useMqttConfigurations';

interface MqttStatusBadgeProps {
  assetType: string;
  assetId: string;
  onClick?: () => void;
}

const MqttStatusBadge = ({ assetType, assetId, onClick }: MqttStatusBadgeProps) => {
  const { data: config, isLoading } = useMqttConfigForAsset(assetType, assetId);

  if (isLoading) return null;

  if (!config) {
    return (
      <Badge
        variant="outline"
        className="cursor-pointer gap-1 text-muted-foreground hover:text-foreground"
        onClick={onClick}
      >
        <WifiOff className="h-3 w-3" />
        <span className="text-xs">MQTT</span>
      </Badge>
    );
  }

  const isConnected = config.connection_status === 'connected';

  return (
    <Badge
      variant={config.enabled ? (isConnected ? 'default' : 'secondary') : 'outline'}
      className={`cursor-pointer gap-1 ${isConnected ? 'bg-primary/20 text-primary border-primary/30' : ''}`}
      onClick={onClick}
    >
      {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      <span className="text-xs">MQTT</span>
    </Badge>
  );
};

export default MqttStatusBadge;
