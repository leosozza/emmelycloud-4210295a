import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BookOpen,
  Search,
  LayoutDashboard,
  Bot,
  GitBranch,
  MessageSquare,
  Brain,
  Plug,
  Sparkles,
  Phone,
  ChevronRight,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  ExternalLink,
} from "lucide-react";

interface ManualSection {
  id: string;
  title: string;
  icon: typeof BookOpen;
  description: string;
  route: string;
  features: string[];
  tips: string[];
  badge?: string;
}

const manualSections: ManualSection[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    description: "Visão geral do workspace com métricas, gráficos e atividades recentes.",
    route: "/",
    features: [
      "Estatísticas em tempo real de atendimentos e leads",
      "Gráficos de mensagens e conversas",
      "Ações rápidas para navegação",
    ],
    tips: [
      "Clique nas estatísticas para ver detalhes",
      "Use os atalhos rápidos para aceder funções comuns",
    ],
  },
  {
    id: "agentes",
    title: "Agentes IA",
    icon: Bot,
    description: "Crie e configure assistentes de IA com personalidades únicas e regras de comportamento.",
    route: "/agentes",
    badge: "Novo",
    features: [
      "Prompt de sistema personalizável",
      "Escolha de modelo de IA (GPT, Gemini, Claude, etc.)",
      "Configuração de temperatura (criatividade)",
      "Integração com base de conhecimento",
      "Configuração de voz para áudio",
      "Treinamento por chat com linguagem natural ✨",
      "Histórico de treinamento com possibilidade de reverter",
    ],
    tips: [
      "Clique no ícone ✨ no cartão do agente para treinar com linguagem natural",
      "Temperatura baixa (0.2–0.4) = respostas precisas",
      "Temperatura alta (0.7–0.9) = respostas criativas",
      "Use o Playground para testar o agente antes de ativar",
    ],
  },
  {
    id: "training",
    title: "Treino & Base de Conhecimento",
    icon: Brain,
    description: "Alimente os agentes com documentos, URLs, FAQs e conversas para respostas precisas.",
    route: "/training",
    features: [
      "Upload de ficheiros (TXT, MD, CSV, JSON, XML, PDF, DOCX)",
      "Importação de conteúdo de URLs",
      "Entrada manual de texto",
      "FAQ em formato Pergunta & Resposta",
      "Importação de conversas reais como exemplos",
      "Processamento automático em chunks",
    ],
    tips: [
      "Documentos mais específicos = respostas melhores",
      "Atualize a base regularmente com novos conteúdos",
      "Importe conversas para o agente aprender com interações reais",
    ],
  },
  {
    id: "flows",
    title: "Fluxos de Automação",
    icon: GitBranch,
    description: "Crie fluxos visuais de conversação com condições, ações e integração com IA.",
    route: "/flows",
    features: [
      "Editor visual drag-and-drop",
      "Gatilhos: palavra-chave, primeira mensagem, manual, webhook",
      "Blocos: mensagem, condição, IA, Bitrix24, delay, tag",
      "Templates prontos para uso (FAQ com IA, Coleta de Lead, etc.)",
      "Teste de fluxo sem afetar conversas reais",
      "Disparável a partir de Bitrix24 via robot ExecuteFlow",
    ],
    tips: [
      "Comece com um template e adapte para seu caso de uso",
      "Use condições para personalizar a experiência",
      "Teste sempre antes de ativar em produção",
    ],
  },
  {
    id: "playground",
    title: "Playground IA",
    icon: Sparkles,
    description: "Teste os agentes de IA em tempo real com métricas de desempenho.",
    route: "/playground",
    features: [
      "Chat em tempo real com o agente selecionado",
      "Métricas: tempo de resposta, tokens utilizados",
      "Debug panel para análise técnica",
      "Suporte ao contexto da base de conhecimento (RAG)",
    ],
    tips: [
      "Use para testar o comportamento após treinar o agente",
      "Ative o Debug Panel para ver métricas de tokens",
    ],
  },
  {
    id: "integracoes",
    title: "Integrações",
    icon: Plug,
    description: "Gerencie conectores de CRM, canais de mensagem, chatbot e pagamentos.",
    route: "/integracoes",
    badge: "Novo",
    features: [
      "CRM: Bitrix24 com robots de automação",
      "Omni Channel: WhatsApp e Instagram via Meta API",
      "Chatbot: Ativar/desativar bot por canal e selecionar agente ✨",
      "Pagamentos: Stripe (EUR) e Asaas (BRL)",
      "Robot Bitrix24 ExecuteFlow para disparar fluxos",
    ],
    tips: [
      "Configure o Chatbot na aba dedicada para cada canal",
      "Selecione o agente mais adequado para cada canal",
      "O robot ExecuteFlow permite disparar fluxos a partir do Bitrix24",
    ],
  },
  {
    id: "atendimento",
    title: "Atendimento",
    icon: MessageSquare,
    description: "Visualize e responda conversas de clientes em tempo real.",
    route: "/atendimento",
    features: [
      "Chat em tempo real com clientes",
      "Histórico completo de mensagens",
      "Transferência entre modos IA/humano",
      "Suporte a WhatsApp e Instagram",
    ],
    tips: [
      "Ative o modo humano para intervir numa conversa gerida pela IA",
      "Use o histórico para contextualizar o atendimento",
    ],
  },
  {
    id: "voice",
    title: "Agentes de Voz",
    icon: Phone,
    description: "Configure agentes de voz integrados com ElevenLabs para chamadas inteligentes.",
    route: "/voice-agents",
    features: [
      "Chamadas de voz com IA (ElevenLabs)",
      "Transcrição em tempo real",
      "Configuração de voz por agente",
    ],
    tips: [
      "Configure primeiro a voz no agente antes de usar aqui",
      "Monitore chamadas ativas para intervenção manual",
    ],
  },
];

export default function ManualPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const navigate = useNavigate();

  const filteredSections = manualSections.filter(
    (s) =>
      s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.features.some((f) => f.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div>
      <PageHeader
        title="Manual da Aplicação"
        description="Guia completo de todas as funcionalidades do Emmely Cloud"
      />

      {/* Search */}
      <div className="relative max-w-sm mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar no manual..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Quick Start */}
      <Card className="border-primary/20 bg-primary/5 mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="h-5 w-5 text-primary" />
            Início Rápido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: "Criar Agente IA", route: "/agentes", icon: Bot },
              { label: "Treinar Base de Conhecimento", route: "/training", icon: Brain },
              { label: "Criar Fluxo", route: "/flows", icon: GitBranch },
              { label: "Testar no Playground", route: "/playground", icon: Sparkles },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.route}
                  variant="outline"
                  className="justify-start gap-2 h-auto py-3"
                  onClick={() => navigate(item.route)}
                >
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-left text-sm">{item.label}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Sections Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
        {filteredSections.map((section) => {
          const Icon = section.icon;
          const isSelected = selectedSection === section.id;
          return (
            <Card
              key={section.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedSection(isSelected ? null : section.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {section.title}
                        {section.badge && (
                          <Badge variant="default" className="text-[10px] h-4">{section.badge}</Badge>
                        )}
                      </CardTitle>
                    </div>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? "rotate-90" : ""}`}
                  />
                </div>
                <CardDescription className="mt-2">{section.description}</CardDescription>
              </CardHeader>

              {isSelected && (
                <CardContent className="pt-0 space-y-4">
                  <Separator />

                  <div>
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Funcionalidades
                    </h4>
                    <ul className="space-y-1">
                      {section.features.map((feature, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-1">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      Dicas
                    </h4>
                    <ul className="space-y-1">
                      {section.tips.map((tip, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-yellow-500 mt-1">•</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(section.route);
                    }}
                  >
                    Ir para a página
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Perguntas Frequentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="q1">
              <AccordionTrigger>Como treinar o agente com linguagem natural?</AccordionTrigger>
              <AccordionContent>
                Vá a Agentes IA, clique no ícone ✨ (brilhante) no cartão do agente para abrir o chat de treinamento.
                Escreva uma instrução em linguagem natural (ex: "Quando perguntarem sobre preços, ofereça 10% de desconto").
                O sistema irá gerar uma regra e pedir confirmação. Digite "confirmar" para aplicar.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2">
              <AccordionTrigger>Como ativar o chatbot num canal?</AccordionTrigger>
              <AccordionContent>
                Vá a Integrações, clique na aba "Chatbot". Ative o toggle do canal desejado (WhatsApp ou Instagram)
                e selecione o agente de IA que irá responder. As configurações são guardadas automaticamente.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q3">
              <AccordionTrigger>Como disparar um fluxo a partir do Bitrix24?</AccordionTrigger>
              <AccordionContent>
                No Bitrix24, use o robot "Emmely – Executar Fluxo" nos seus processos de negócio.
                Configure o ID do fluxo e o telefone do contacto. O fluxo será iniciado automaticamente.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q4">
              <AccordionTrigger>Qual a diferença entre os modelos de IA?</AccordionTrigger>
              <AccordionContent>
                GPT-4 é ótimo para conversas complexas e análise jurídica. Gemini é eficiente e rápido para 
                grande volume de atendimentos. Claude é excelente para respostas naturais e empáticas. 
                Teste diferentes modelos no Playground para escolher o melhor para o seu caso.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q5">
              <AccordionTrigger>Como reverter um treinamento aplicado?</AccordionTrigger>
              <AccordionContent>
                Abra o chat de treinamento do agente (ícone ✨) e clique em "Histórico". 
                Verá todos os treinamentos aplicados. Clique em "Reverter" para remover uma regra específica.
                O prompt do sistema será atualizado automaticamente.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Help */}
      <Card className="border-primary/20 mt-4">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <AlertCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Precisa de mais ajuda?</p>
              <p className="text-sm text-muted-foreground">
                Entre em contato com o suporte técnico
              </p>
            </div>
          </div>
          <Button variant="outline">Falar com Suporte</Button>
        </CardContent>
      </Card>
    </div>
  );
}
