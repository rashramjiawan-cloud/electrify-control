import { ReactNode } from 'react';
import AppSidebar from './AppSidebar';

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const AppLayout = ({ children, title, subtitle }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64">
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm px-8 py-5">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </header>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
