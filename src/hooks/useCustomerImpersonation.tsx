import { createContext, useContext, useState, ReactNode } from 'react';

interface ImpersonationContextType {
  impersonatedCustomerId: string | null;
  impersonatedCustomerName: string | null;
  startImpersonation: (customerId: string, customerName: string) => void;
  stopImpersonation: () => void;
  isImpersonating: boolean;
}

const ImpersonationContext = createContext<ImpersonationContextType>({
  impersonatedCustomerId: null,
  impersonatedCustomerName: null,
  startImpersonation: () => {},
  stopImpersonation: () => {},
  isImpersonating: false,
});

export const useCustomerImpersonation = () => useContext(ImpersonationContext);

export const CustomerImpersonationProvider = ({ children }: { children: ReactNode }) => {
  const [impersonatedCustomerId, setCustomerId] = useState<string | null>(null);
  const [impersonatedCustomerName, setCustomerName] = useState<string | null>(null);

  const startImpersonation = (customerId: string, customerName: string) => {
    setCustomerId(customerId);
    setCustomerName(customerName);
  };

  const stopImpersonation = () => {
    setCustomerId(null);
    setCustomerName(null);
  };

  return (
    <ImpersonationContext.Provider
      value={{
        impersonatedCustomerId,
        impersonatedCustomerName,
        startImpersonation,
        stopImpersonation,
        isImpersonating: !!impersonatedCustomerId,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
};
