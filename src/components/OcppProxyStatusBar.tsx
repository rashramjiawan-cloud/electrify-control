import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

interface ProxyBackend {
  id: string;
  name: string;
  enabled: boolean;
  connection_status: string;
  last_connected_at: string | null;
  last_error: string | null;
  charge_point_filter: string[];
}

export default function OcppProxyStatusBar() {
  const { data: backends, isLoading } = useQuery({
    queryKey: ['ocpp-proxy-backends-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ocpp_proxy_backends' as any)
        .select('id, name, enabled, connection_status, last_connected_at, last_error, charge_point_filter')
        .eq('enabled', true)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as unknown) as ProxyBackend[];
    },
    refetchInterval: 3000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 mb-4">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Proxy backends laden...</span>
      </div>
    );
  }

  if (!backends || backends.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 mb-4">
      <span className="text-xs font-medium text-muted-foreground mr-1">OCPP Proxy:</span>
      {backends.map((b) => {
        const isConnected = b.connection_status === 'connected';
        const isError = b.connection_status === 'error';
        const lastSeen = b.last_connected_at
          ? new Date(b.last_connected_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : null;

        return (
          <div
            key={b.id}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium border ${
              isConnected
                ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400'
                : isError
                ? 'bg-destructive/10 border-destructive/20 text-destructive'
                : 'bg-muted border-border text-muted-foreground'
            }`}
            title={b.last_error || undefined}
          >
            {isConnected ? (
              <CheckCircle className="h-3 w-3" />
            ) : isError ? (
              <XCircle className="h-3 w-3" />
            ) : (
              <AlertTriangle className="h-3 w-3" />
            )}
            <span>{b.name}</span>
            <span className="text-[10px] opacity-70">
              {isConnected ? 'verbonden' : isError ? 'fout' : 'niet verbonden'}
            </span>
            {lastSeen && (
              <span className="text-[10px] opacity-50">{lastSeen}</span>
            )}
            {isError && b.last_error && (
              <span className="text-[10px] opacity-60 max-w-[200px] truncate" title={b.last_error}>
                {b.last_error}
              </span>
            )}
            <RefreshCw className="h-2.5 w-2.5 opacity-30 animate-spin" style={{ animationDuration: '3s' }} />
          </div>
        );
      })}
    </div>
  );
}
