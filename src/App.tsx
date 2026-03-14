import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { CustomerImpersonationProvider } from "@/hooks/useCustomerImpersonation";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { useMyModulePermissions } from "@/hooks/useMyModulePermissions";
import Index from "./pages/Index";
import Laadpalen from "./pages/Laadpalen";
import Batterij from "./pages/Batterij";
import EMS from "./pages/EMS";
import Simulator from "./pages/Simulator";
import RFIDTags from "./pages/RFIDTags";
import Tarieven from "./pages/Tarieven";
import Transacties from "./pages/Transacties";
import Instellingen from "./pages/Instellingen";
import SmartCharging from "./pages/SmartCharging";
import Firmware from "./pages/Firmware";
import Reserveringen from "./pages/Reserveringen";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AlertHistory from "./pages/AlertHistory";
import ZonneEnergie from "./pages/ZonneEnergie";
import VirtualGrids from "./pages/VirtualGrids";
import SetupGuide from "./pages/SetupGuide";
import PlugAndCharge from "./pages/PlugAndCharge";
import Facturatie from "./pages/Facturatie";
import Gebruikers from "./pages/Gebruikers";
import Klanten from "./pages/Klanten";
import DeviceHealth from "./pages/DeviceHealth";
import Projecten from "./pages/Projecten";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) => {
  const { user, loading, isAdmin } = useAuth();
  const { data: disabledModules } = useMyModulePermissions();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground font-mono text-sm">Laden...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  if (!isAdmin && disabledModules?.has(location.pathname)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
    <Route path="/laadpalen" element={<ProtectedRoute><Laadpalen /></ProtectedRoute>} />
    <Route path="/batterij" element={<ProtectedRoute><Batterij /></ProtectedRoute>} />
    <Route path="/ems" element={<ProtectedRoute><EMS /></ProtectedRoute>} />
    <Route path="/zonne-energie" element={<ProtectedRoute><ZonneEnergie /></ProtectedRoute>} />
    <Route path="/rfid" element={<ProtectedRoute><RFIDTags /></ProtectedRoute>} />
    <Route path="/tarieven" element={<ProtectedRoute><Tarieven /></ProtectedRoute>} />
    <Route path="/transacties" element={<ProtectedRoute><Transacties /></ProtectedRoute>} />
    <Route path="/simulator" element={<ProtectedRoute adminOnly><Simulator /></ProtectedRoute>} />
    <Route path="/instellingen" element={<ProtectedRoute><Instellingen /></ProtectedRoute>} />
    <Route path="/smart-charging" element={<ProtectedRoute><SmartCharging /></ProtectedRoute>} />
    <Route path="/firmware" element={<ProtectedRoute><Firmware /></ProtectedRoute>} />
    <Route path="/reserveringen" element={<ProtectedRoute><Reserveringen /></ProtectedRoute>} />
    <Route path="/alerts" element={<ProtectedRoute><AlertHistory /></ProtectedRoute>} />
    <Route path="/virtual-grids" element={<ProtectedRoute><VirtualGrids /></ProtectedRoute>} />
    <Route path="/setup-guide" element={<ProtectedRoute><SetupGuide /></ProtectedRoute>} />
    <Route path="/plug-and-charge" element={<ProtectedRoute><PlugAndCharge /></ProtectedRoute>} />
    <Route path="/facturatie" element={<ProtectedRoute><Facturatie /></ProtectedRoute>} />
    <Route path="/gebruikers" element={<ProtectedRoute adminOnly><Gebruikers /></ProtectedRoute>} />
    <Route path="/klanten" element={<ProtectedRoute adminOnly><Klanten /></ProtectedRoute>} />
    <Route path="/device-health" element={<ProtectedRoute><DeviceHealth /></ProtectedRoute>} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <CustomerImpersonationProvider>
            <BrowserRouter>
              <ImpersonationBanner />
              <AppRoutes />
            </BrowserRouter>
          </CustomerImpersonationProvider>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
