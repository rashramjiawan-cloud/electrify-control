import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, X } from 'lucide-react';

interface Exceedance {
  id: number;
  power_kw: number;
  limit_kw: number;
  direction: string;
  created_at: string;
}

const GtvExceedanceBanner = () => {
  const [exceedance, setExceedance] = useState<Exceedance | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('gtv-exceedance-banner')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gtv_exceedances' },
        (payload) => {
          const row = payload.new as Exceedance;
          setExceedance(row);
          setVisible(true);
          // Auto-hide after 15 seconds
          setTimeout(() => setVisible(false), 15000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!visible || !exceedance) return null;

  const overBy = (exceedance.power_kw - exceedance.limit_kw).toFixed(1);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-lg animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 backdrop-blur-xl px-4 py-3 shadow-lg">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/20">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-destructive">GTV Overschrijding!</p>
          <p className="text-xs text-muted-foreground truncate">
            {exceedance.power_kw.toFixed(1)} kW — limiet {exceedance.limit_kw.toFixed(0)} kW (+{overBy} kW)
          </p>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default GtvExceedanceBanner;
