import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  variant?: 'default' | 'primary' | 'warning' | 'destructive';
}

const variantStyles = {
  default: 'border-border',
  primary: 'border-primary/30',
  warning: 'border-warning/30',
  destructive: 'border-destructive/30',
};

const iconVariantStyles = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
};

const StatCard = ({ title, value, unit, icon: Icon, trend, variant = 'default' }: StatCardProps) => {
  return (
    <div className={`rounded-xl border bg-card p-5 ${variantStyles[variant]}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconVariantStyles[variant]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-bold text-foreground">{value}</span>
        {unit && <span className="font-mono text-sm text-muted-foreground">{unit}</span>}
      </div>
      {trend && (
        <p className={`mt-2 font-mono text-xs ${trend.value >= 0 ? 'text-primary' : 'text-destructive'}`}>
          {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
        </p>
      )}
    </div>
  );
};

export default StatCard;
