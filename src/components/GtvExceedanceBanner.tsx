import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, X, Volume2, VolumeX } from 'lucide-react';

interface Exceedance {
  id: number;
  power_kw: number;
  limit_kw: number;
  direction: string;
  created_at: string;
}

/** Play a warning beep using Web Audio API */
const playAlertSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const playBeep = (time: number, freq: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
      osc.start(time);
      osc.stop(time + duration);
    };
    // Three ascending warning beeps
    playBeep(ctx.currentTime, 880, 0.15);
    playBeep(ctx.currentTime + 0.2, 1100, 0.15);
    playBeep(ctx.currentTime + 0.4, 1320, 0.25);
  } catch {
    // Audio not available — silently ignore
  }
};

const GtvExceedanceBanner = () => {
  const [exceedance, setExceedance] = useState<Exceedance | null>(null);
  const [visible, setVisible] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem('gtv-alert-sound');
    return stored !== 'false';
  });

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('gtv-alert-sound', String(next));
      return next;
    });
  }, []);

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
          // Play alert sound if enabled
          if (localStorage.getItem('gtv-alert-sound') !== 'false') {
            playAlertSound();
          }
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
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={toggleSound}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
            title={soundEnabled ? 'Geluid uitschakelen' : 'Geluid inschakelen'}
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setVisible(false)}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default GtvExceedanceBanner;
