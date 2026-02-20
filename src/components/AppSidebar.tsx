import { NavLink, useLocation } from 'react-router-dom';
import { Zap, LayoutDashboard, BatteryCharging, Cpu, Activity } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/laadpalen', label: 'Laadpalen', icon: Zap },
  { to: '/batterij', label: 'Batterij', icon: BatteryCharging },
  { to: '/ems', label: 'EMS', icon: Cpu },
];

const AppSidebar = () => {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 glow-primary">
          <Activity className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-mono text-sm font-bold text-foreground tracking-wider">ENERGY</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-widest">BACKOFFICE</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
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

      {/* System Status */}
      <div className="border-t border-border px-4 py-4">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="status-dot-online" />
            <span className="font-mono text-xs text-muted-foreground">OCPP 1.6J</span>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            5 charge points verbonden
          </p>
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
