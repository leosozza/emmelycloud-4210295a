import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import LeadsPage from "./pages/Leads";
import TriagemPage from "./pages/Triagem";
import CasosPage from "./pages/Casos";
import PropostasPage from "./pages/Propostas";
import ContratosPage from "./pages/Contratos";
import FinanceiroPage from "./pages/Financeiro";
import AutomacoesPage from "./pages/Automacoes";
import RelatoriosPage from "./pages/Relatorios";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">A carregar...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return <AppLayout />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route element={<ProtectedRoutes />}>
            <Route path="/" element={<Index />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/triagem" element={<TriagemPage />} />
            <Route path="/casos" element={<CasosPage />} />
            <Route path="/propostas" element={<PropostasPage />} />
            <Route path="/contratos" element={<ContratosPage />} />
            <Route path="/financeiro" element={<FinanceiroPage />} />
            <Route path="/automacoes" element={<AutomacoesPage />} />
            <Route path="/relatorios" element={<RelatoriosPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
