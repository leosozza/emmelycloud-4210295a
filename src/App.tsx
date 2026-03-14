import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { AuthProvider } from "@/contexts/AuthContext";
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
import CarteiraPage from "./pages/Carteira";
import AtendimentoPage from "./pages/Atendimento";
import RoadmapPage from "./pages/Roadmap";
import IntegracoesPage from "./pages/Integracoes";
import AgentesPage from "./pages/Agentes";
import TrainingPage from "./pages/Training";
import FlowsPage from "./pages/Flows";
import PlaygroundIAPage from "./pages/PlaygroundIA";
import VoiceAgentsPage from "./pages/VoiceAgents";
import ApiDocsPage from "./pages/ApiDocs";
import ManualPage from "./pages/Manual";
import ChatIAPage from "./pages/ChatIA";
import ObservabilidadeIAPage from "./pages/ObservabilidadeIA";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import DataDeletion from "./pages/DataDeletion";
import Bitrix24App from "./pages/Bitrix24App";
import PropostaPublica from "./pages/PropostaPublica";
import SignContract from "./pages/SignContract";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <LocaleProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/data-deletion" element={<DataDeletion />} />
          <Route path="/bitrix24" element={<Bitrix24App />} />
          <Route path="/proposta/:token" element={<PropostaPublica />} />
          <Route path="/sign/:token" element={<SignContract />} />
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
            <Route path="/carteira" element={<CarteiraPage />} />
            <Route path="/atendimento" element={<AtendimentoPage />} />
            <Route path="/roadmap" element={<RoadmapPage />} />
            <Route path="/integracoes" element={<IntegracoesPage />} />
            <Route path="/agentes" element={<AgentesPage />} />
            <Route path="/training" element={<TrainingPage />} />
            <Route path="/flows" element={<FlowsPage />} />
            <Route path="/playground" element={<PlaygroundIAPage />} />
            <Route path="/voice-agents" element={<VoiceAgentsPage />} />
            <Route path="/api-docs" element={<ApiDocsPage />} />
            <Route path="/manual" element={<ManualPage />} />
            <Route path="/chat" element={<ChatIAPage />} />
            <Route path="/observabilidade-ia" element={<ObservabilidadeIAPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </LocaleProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
