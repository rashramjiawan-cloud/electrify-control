import { useMemo } from 'react';
import { Users, Shield, Building2, UserCheck, Eye, Wrench } from 'lucide-react';
import type { UserProfile } from '@/hooks/useUsers';

interface UserDashboardStatsProps {
  users: UserProfile[];
}

const ROLE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  admin: { label: 'Admins', icon: Shield, color: 'text-red-500 bg-red-500/10' },
  manager: { label: 'Managers', icon: UserCheck, color: 'text-amber-500 bg-amber-500/10' },
  operator: { label: 'Operators', icon: Wrench, color: 'text-blue-500 bg-blue-500/10' },
  user: { label: 'Gebruikers', icon: Users, color: 'text-emerald-500 bg-emerald-500/10' },
  viewer: { label: 'Viewers', icon: Eye, color: 'text-muted-foreground bg-muted' },
};

const UserDashboardStats = ({ users }: UserDashboardStatsProps) => {
  const stats = useMemo(() => {
    const roleCounts: Record<string, number> = {};
    const customerSet = new Set<string>();

    for (const u of users) {
      roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
      if (u.customer_name) customerSet.add(u.customer_name);
    }

    return { total: users.length, roleCounts, customerCount: customerSet.size };
  }, [users]);

  const cards = [
    {
      label: 'Totaal',
      value: stats.total,
      icon: Users,
      color: 'text-primary bg-primary/10',
    },
    ...Object.entries(ROLE_CONFIG).map(([role, cfg]) => ({
      label: cfg.label,
      value: stats.roleCounts[role] || 0,
      icon: cfg.icon,
      color: cfg.color,
    })),
    {
      label: 'Klanten',
      value: stats.customerCount,
      icon: Building2,
      color: 'text-violet-500 bg-violet-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3"
        >
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${card.color}`}>
            <card.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-foreground leading-none">{card.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default UserDashboardStats;
