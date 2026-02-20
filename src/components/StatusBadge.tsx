import { ChargePointStatus } from '@/types/energy';

interface StatusBadgeProps {
  status: ChargePointStatus | string;
}

const statusConfig: Record<string, { dotClass: string; label: string; bgClass: string }> = {
  Available: { dotClass: 'status-dot-online', label: 'Beschikbaar', bgClass: 'bg-primary/10 text-primary' },
  Charging: { dotClass: 'status-dot-charging', label: 'Laden', bgClass: 'bg-primary/10 text-primary' },
  Preparing: { dotClass: 'status-dot-warning', label: 'Voorbereiden', bgClass: 'bg-warning/10 text-warning' },
  Faulted: { dotClass: 'status-dot-error', label: 'Storing', bgClass: 'bg-destructive/10 text-destructive' },
  Unavailable: { dotClass: 'status-dot-offline', label: 'Niet beschikbaar', bgClass: 'bg-muted text-muted-foreground' },
  SuspendedEV: { dotClass: 'status-dot-warning', label: 'Gepauzeerd', bgClass: 'bg-warning/10 text-warning' },
  Finishing: { dotClass: 'status-dot-warning', label: 'Afronden', bgClass: 'bg-warning/10 text-warning' },
  // Transaction/Battery statuses
  Active: { dotClass: 'status-dot-charging', label: 'Actief', bgClass: 'bg-primary/10 text-primary' },
  Completed: { dotClass: 'status-dot-online', label: 'Voltooid', bgClass: 'bg-primary/10 text-primary' },
  Failed: { dotClass: 'status-dot-error', label: 'Mislukt', bgClass: 'bg-destructive/10 text-destructive' },
  Idle: { dotClass: 'status-dot-offline', label: 'Standby', bgClass: 'bg-muted text-muted-foreground' },
  Discharging: { dotClass: 'status-dot-warning', label: 'Ontladen', bgClass: 'bg-warning/10 text-warning' },
  Fault: { dotClass: 'status-dot-error', label: 'Storing', bgClass: 'bg-destructive/10 text-destructive' },
};

const StatusBadge = ({ status }: StatusBadgeProps) => {
  const config = statusConfig[status] || { dotClass: 'status-dot-offline', label: status, bgClass: 'bg-muted text-muted-foreground' };

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${config.bgClass}`}>
      <span className={config.dotClass} />
      {config.label}
    </span>
  );
};

export default StatusBadge;
