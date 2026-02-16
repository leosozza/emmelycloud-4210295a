import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
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
import ClientesPage from "./pages/Clientes";
import ServicosPage from "./pages/Servicos";
import SEFPage from "./pages/SEF";
import AtendimentoPage from "./pages/Atendimento";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/triagem" element={<TriagemPage />} />
            <Route path="/casos" element={<CasosPage />} />
            <Route path="/propostas" element={<PropostasPage />} />
            <Route path="/contratos" element={<ContratosPage />} />
            <Route path="/financeiro" element={<FinanceiroPage />} />
            <Route path="/automacoes" element={<AutomacoesPage />} />
            <Route path="/relatorios" element={<RelatoriosPage />} />
            <Route path="/clientes" element={<ClientesPage />} />
            <Route path="/servicos" element={<ServicosPage />} />
            <Route path="/sef" element={<SEFPage />} />
            <Route path="/atendimento" element={<AtendimentoPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
