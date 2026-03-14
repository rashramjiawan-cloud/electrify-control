import { useCustomerImpersonation } from '@/hooks/useCustomerImpersonation';
import { Building2, X, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ImpersonationBanner = () => {
  const { isImpersonating, impersonatedCustomerName, stopImpersonation } = useCustomerImpersonation();

  if (!isImpersonating) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-primary px-4 py-2 text-primary-foreground shadow-md">
      <Eye className="h-4 w-4 shrink-0" />
      <span className="text-sm font-medium">
        Klantenweergave: <strong>{impersonatedCustomerName}</strong>
      </span>
      <span className="text-xs opacity-75">— Je ziet het portaal als deze klant</span>
      <Button
        variant="secondary"
        size="sm"
        className="ml-2 h-7 gap-1.5 text-xs"
        onClick={stopImpersonation}
      >
        <X className="h-3 w-3" />
        Stoppen
      </Button>
    </div>
  );
};

export default ImpersonationBanner;
