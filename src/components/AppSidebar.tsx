import { NavLink, useLocation } from 'react-router-dom';
import { Zap, LayoutDashboard, BatteryCharging, Cpu, Activity, Play, LogOut, Tag, Euro, Receipt, Settings, Gauge, HardDrive, CalendarClock, AlertTriangle, Sun, X, Network, BookOpen } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/laadpalen', label: 'Laadpalen', icon: Zap },
  { to: '/rfid', label: 'RFID Tags', icon: Tag },
  { to: '/tarieven', label: 'Tarieven', icon: Euro },
  { to: '/transacties', label: 'Transacties', icon: Receipt },
  { to: '/smart-charging', label: 'Smart Charging', icon: Gauge },
  { to: '/firmware', label: 'Firmware', icon: HardDrive },
  { to: '/reserveringen', label: 'Reserveringen', icon: CalendarClock },
  { to: '/batterij', label: 'Batterij', icon: BatteryCharging },
  { to: '/zonne-energie', label: 'Zonne-energie', icon: Sun },
  { to: '/ems', label: 'EMS', icon: Cpu },
  { to: '/virtual-grids', label: 'Virtuele Grids', icon: Network },
  { to: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { to: '/simulator', label: 'Simulator', icon: Play, adminOnly: true },
  { to: '/instellingen', label: 'Instellingen', icon: Settings },
  { to: '/setup-guide', label: 'Setup Guide', icon: BookOpen },
];

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

const AppSidebar = ({ open, onClose }: AppSidebarProps) => {
  const location = useLocation();
  const { user, isAdmin, signOut } = useAuth();

  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-border bg-sidebar transition-transform duration-300 ease-in-out",
        "md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 glow-primary">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-mono text-sm font-bold text-foreground tracking-wider">VOLTCONTROL</h1>
            <p className="font-mono text-[10px] text-muted-foreground tracking-widest">BV</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-primary/10 text-primary glow-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* User + System Status */}
      <div className="border-t border-border px-4 py-4 space-y-3">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="status-dot-online" />
            <span className="font-mono text-xs text-muted-foreground">OCPP 1.6J</span>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            System online
          </p>
        </div>

        {user && (
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground truncate max-w-[140px]" title={user.email}>
              {user.email}
            </span>
            <Button variant="ghost" size="sm" onClick={signOut} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
};

export default AppSidebar;
