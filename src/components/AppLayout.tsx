import { ReactNode, useState } from 'react';
import AppSidebar from './AppSidebar';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const AppLayout = ({ children, title, subtitle }: AppLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background relative">
      {/* Zen animated background */}
      <div className="zen-bg">
        <div className="zen-orb zen-orb-1" />
        <div className="zen-orb zen-orb-2" />
        <div className="zen-orb zen-orb-3" />
        <div className="zen-orb zen-orb-4" />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="md:ml-64 relative z-10">
        <header className="sticky top-0 z-30 border-b border-border bg-background/60 backdrop-blur-xl px-4 md:px-8 py-4 md:py-5 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-foreground">{title}</h1>
            {subtitle && <p className="text-xs md:text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </header>
        <div className="p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
