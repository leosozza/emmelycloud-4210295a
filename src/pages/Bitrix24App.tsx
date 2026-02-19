import { useEffect, useState, useCallback } from "react";

type AppStatus = "loading" | "ready" | "error";
type TabId = "connector" | "agentes" | "training" | "flows" | "playground" | "pagamentos";

interface IntegrationData {
  integration: {
    id: string;
    member_id: string;
    domain: string;
    connector_registered: boolean;
    connector_active: boolean;
    updated_at: string;
  } | null;
  channels: Array<{
    channel: string;
    line_id: number;
    line_name: string;
    is_active: boolean;
  }>;
  recent_logs: Array<{
    event_type: string;
    direction: string;
    created_at: string;
    error: string | null;
  }>;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ==================== DESIGN TOKENS ====================
const colors = {
  gradient: "linear-gradient(135deg, #2583d8 0%, #7b5ea7 50%, #d4728b 100%)",
  gradientBtn: "linear-gradient(135deg, #2583d8 0%, #7b5ea7 100%)",
  primary: "#2583d8",
  primaryDark: "#1d6bb5",
  accent: "#7b5ea7",
  surface: "#f5f7fa",
  surfaceCard: "#ffffff",
  border: "#e2e8f0",
  borderLight: "#f1f5f9",
  text: "#1e293b",
  textSecondary: "#64748b",
  textMuted: "#94a3b8",
  success: "#10b981",
  successBg: "#ecfdf5",
  successBorder: "#a7f3d0",
  error: "#ef4444",
  errorBg: "#fef2f2",
  errorBorder: "#fecaca",
  warning: "#f59e0b",
  warningBg: "#fffbeb",
  infoBg: "#eff6ff",
  infoBorder: "#bfdbfe",
  infoText: "#1e40af",
  chatUser: "linear-gradient(135deg, #2583d8, #7b5ea7)",
  chatBot: "#f1f5f9",
  shadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  shadowMd: "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)",
};

const font = "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const Bitrix24App = () => {
  const [status, setStatus] = useState<AppStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("connector");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [integrationData, setIntegrationData] = useState<IntegrationData | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://api.bitrix24.com/api/v1/";
    script.onload = () => {
      try {
        // @ts-ignore
        if (window.BX24) {
          // @ts-ignore
          window.BX24.init(() => {
            // @ts-ignore
            const auth = window.BX24.getAuth();
            if (auth?.member_id) {
              setMemberId(auth.member_id);
              fetchIntegrationData(auth.member_id);
            }
            setStatus("ready");
          });
        } else {
          setStatus("ready");
        }
      } catch {
        setStatus("ready");
      }
    };
    script.onerror = () => setStatus("ready");
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  const fetchIntegrationData = useCallback(async (mid: string) => {
    setLoadingData(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/bitrix24-connector-settings?member_id=${mid}&format=json`
      );
      if (res.ok) {
        const data = await res.json();
        setIntegrationData(data);
      }
    } catch (e) {
      console.error("[BITRIX24] Fetch status error:", e);
    } finally {
      setLoadingData(false);
    }
  }, []);

  const handleResync = async () => {
    if (!memberId) return;
    // @ts-ignore
    const auth = window.BX24?.getAuth?.();
    if (!auth) return;
    setLoadingData(true);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth: {
            access_token: auth.access_token,
            refresh_token: auth.refresh_token,
            member_id: auth.member_id,
            domain: auth.domain,
            expires_in: String(auth.expires || 3600),
          },
          member_id: auth.member_id,
        }),
      });
      await fetchIntegrationData(memberId);
    } catch (e) {
      console.error("[BITRIX24] Resync error:", e);
    } finally {
      setLoadingData(false);
    }
  };

  if (status === "loading") {
    return (
      <div style={s.page}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ ...s.loadingDot, margin: "0 auto 16px" }} />
            <p style={{ color: colors.textSecondary, fontSize: 14 }}>Carregando...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={s.page}>
        <div style={{ ...s.card, maxWidth: 400, margin: "40px auto", textAlign: "center", padding: 32 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: colors.errorBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>⚠️</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 18, color: colors.text }}>Erro na configuração</h2>
          <p style={{ color: colors.textSecondary, fontSize: 14, margin: 0 }}>{errorMsg || "Tente reinstalar o aplicativo."}</p>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "connector", label: "Conector", icon: "⚡" },
    { id: "agentes", label: "Agentes", icon: "🤖" },
    { id: "training", label: "Training", icon: "📚" },
    { id: "flows", label: "Flows", icon: "🔀" },
    { id: "playground", label: "Playground", icon: "💬" },
    { id: "pagamentos", label: "Pagamentos", icon: "💳" },
  ];

  const integration = integrationData?.integration;
  const channels = integrationData?.channels || [];
  const logs = integrationData?.recent_logs || [];

  return (
    <div style={s.page}>
      {/* Header with gradient */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <div style={s.logo}>E</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff" }}>Emmely Cloud</h2>
            <div style={{ marginTop: 4 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: integration?.connector_active ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                color: "#fff",
                backdropFilter: "blur(4px)",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: integration?.connector_active ? "#34d399" : "#fca5a5" }} />
                {integration?.connector_active ? "Ativo" : "Inativo"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={s.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...s.tab,
              ...(activeTab === tab.id ? s.tabActive : {}),
            }}
          >
            <span style={{ fontSize: 13 }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ marginTop: 20 }}>
        {activeTab === "connector" && (
          <ConnectorTab integration={integration} channels={channels} logs={logs} loading={loadingData} onResync={handleResync} />
        )}
        {activeTab === "agentes" && <AgentesTab />}
        {activeTab === "training" && <TrainingTab />}
        {activeTab === "flows" && <FlowsTab />}
        {activeTab === "playground" && <PlaygroundTab />}
        {activeTab === "pagamentos" && <PagamentosTab />}
      </div>
    </div>
  );
};

// ==================== CONNECTOR TAB ====================
function ConnectorTab({ integration, channels, logs, loading, onResync }: {
  integration: IntegrationData["integration"];
  channels: IntegrationData["channels"];
  logs: IntegrationData["recent_logs"];
  loading: boolean;
  onResync: () => void;
}) {
  return (
    <div>
      <div style={s.card}>
        <h3 style={s.cardTitle}>Status da Integração</h3>
        {integration ? (
          <div style={{ display: "grid", gap: 8 }}>
            <InfoRow label="Portal" value={integration.domain || integration.member_id} />
            <InfoRow label="Conector" value={integration.connector_registered ? "✅ Registado" : "❌ Não registado"} />
            <InfoRow label="Status" value={integration.connector_active ? "🟢 Ativo" : "🔴 Inativo"} />
            <InfoRow label="Última atualização" value={new Date(integration.updated_at).toLocaleString()} />
          </div>
        ) : (
          <p style={{ color: colors.textMuted, fontSize: 13, margin: 0 }}>Integração não encontrada. Reinstale o aplicativo.</p>
        )}
      </div>

      <div style={s.card}>
        <h3 style={s.cardTitle}>Canais Configurados</h3>
        {channels.length > 0 ? (
          <div style={{ display: "grid", gap: 6 }}>
            {channels.map((ch, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: colors.surface, borderRadius: 8, fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{ch.channel === "whatsapp" ? "📱" : "📸"}</span>
                  <span style={{ fontWeight: 500, color: colors.text }}>{ch.channel === "whatsapp" ? "WhatsApp" : "Instagram"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: colors.textSecondary }}>{ch.line_name || `Line ${ch.line_id}`}</span>
                  <StatusDot active={ch.is_active} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: colors.textMuted, fontSize: 13, margin: 0 }}>Nenhum canal mapeado ainda.</p>
        )}
      </div>

      <button onClick={onResync} disabled={loading} style={s.btnPrimary}>
        {loading ? "⏳ Sincronizando..." : "🔄 Re-sincronizar Conector"}
      </button>

      {logs.length > 0 && (
        <div style={{ ...s.card, marginTop: 12 }}>
          <h3 style={s.cardTitle}>Últimos Eventos</h3>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {logs.map((log, i) => (
              <div key={i} style={{ padding: "6px 0", fontSize: 12, borderBottom: i < logs.length - 1 ? `1px solid ${colors.borderLight}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: log.direction === "inbound" ? colors.infoBg : colors.surface, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>
                    {log.direction === "inbound" ? "📥" : "📤"}
                  </span>
                  <span style={{ color: colors.text }}>{log.event_type}</span>
                  {log.error && <span style={{ color: colors.error, fontSize: 10 }}>⚠️</span>}
                </span>
                <span style={{ color: colors.textMuted, fontSize: 11 }}>{new Date(log.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={s.infoBox}>
        ℹ️ Para gerenciar conversas, acesse o <strong>Contact Center</strong> do Bitrix24 e selecione o conector <strong>Emmely Messages</strong>.
      </div>
    </div>
  );
}

// ==================== AGENTES TAB ====================
function AgentesTab() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", system_prompt: "", ai_model: "google/gemini-3-flash-preview", temperature: "0.7", welcome_message: "", fallback_message: "Desculpe, não consegui processar a sua mensagem." });
  const [saving, setSaving] = useState(false);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ai_agents?select=*&order=created_at.desc`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
      });
      if (res.ok) setAgents(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        system_prompt: form.system_prompt,
        ai_model: form.ai_model,
        temperature: parseFloat(form.temperature) || 0.7,
        welcome_message: form.welcome_message,
        fallback_message: form.fallback_message,
        ai_provider: "lovable",
        agent_type: "text",
      };

      const url = editing?.id
        ? `${SUPABASE_URL}/rest/v1/ai_agents?id=eq.${editing.id}`
        : `${SUPABASE_URL}/rest/v1/ai_agents`;

      await fetch(url, {
        method: editing?.id ? "PATCH" : "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify(body),
      });

      setEditing(null);
      setForm({ name: "", system_prompt: "", ai_model: "google/gemini-3-flash-preview", temperature: "0.7", welcome_message: "", fallback_message: "Desculpe, não consegui processar a sua mensagem." });
      fetchAgents();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleSetDefault = async (id: string) => {
    await fetch(`${SUPABASE_URL}/rest/v1/ai_agents?is_default=eq.true`, {
      method: "PATCH",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({ is_default: false }),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/ai_agents?id=eq.${id}`, {
      method: "PATCH",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({ is_default: true }),
    });
    fetchAgents();
  };

  const startEdit = (agent: any) => {
    setEditing(agent);
    setForm({
      name: agent.name || "",
      system_prompt: agent.system_prompt || "",
      ai_model: agent.ai_model || "google/gemini-3-flash-preview",
      temperature: String(agent.temperature || 0.7),
      welcome_message: agent.welcome_message || "",
      fallback_message: agent.fallback_message || "",
    });
  };

  return (
    <div>
      <button onClick={() => { setEditing({}); setForm({ name: "", system_prompt: "", ai_model: "google/gemini-3-flash-preview", temperature: "0.7", welcome_message: "", fallback_message: "Desculpe, não consegui processar a sua mensagem." }); }} style={{ ...s.btnPrimary, marginBottom: 16 }}>
        ➕ Novo Agente
      </button>

      {editing && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>{editing.id ? "✏️ Editar Agente" : "✨ Novo Agente"}</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <FormField label="Nome">
              <input style={s.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do agente" />
            </FormField>
            <FormField label="Modelo IA">
              <select style={s.input} value={form.ai_model} onChange={(e) => setForm({ ...form, ai_model: e.target.value })}>
                <option value="google/gemini-3-flash-preview">Gemini 3 Flash</option>
                <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
                <option value="openai/gpt-5-mini">GPT-5 Mini</option>
                <option value="openai/gpt-5">GPT-5</option>
              </select>
            </FormField>
            <FormField label={`Temperatura (${form.temperature})`}>
              <input style={{ ...s.input, padding: "4px 8px" }} type="range" min="0" max="1" step="0.1" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
            </FormField>
            <FormField label="System Prompt">
              <textarea style={{ ...s.input, minHeight: 120, resize: "vertical" }} value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} placeholder="Instruções para o agente..." />
            </FormField>
            <FormField label="Mensagem de Boas-Vindas">
              <input style={s.input} value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} />
            </FormField>
            <FormField label="Mensagem de Fallback">
              <input style={s.input} value={form.fallback_message} onChange={(e) => setForm({ ...form, fallback_message: e.target.value })} />
            </FormField>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving || !form.name} style={{ ...s.btnPrimary, flex: 1 }}>{saving ? "⏳ Salvando..." : "💾 Salvar"}</button>
            <button onClick={() => setEditing(null)} style={{ ...s.btnSecondary, flex: 1 }}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={s.card}>
        <h3 style={s.cardTitle}>Agentes Configurados</h3>
        {loading ? <LoadingText /> : agents.length === 0 ? (
          <EmptyText text="Nenhum agente criado." />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {agents.map((a) => (
              <div key={a.id} style={s.agentCard}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                  <div style={s.avatar}>{a.name?.charAt(0)?.toUpperCase() || "A"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 14, color: colors.text }}>{a.name}</strong>
                      {a.is_default && <span style={s.badgeSuccess}>⭐ Default</span>}
                      {!a.is_active && <span style={s.badgeError}>Inativo</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      <span style={s.badgeOutline}>{a.ai_model?.split("/").pop()}</span>
                      <span style={s.badgeOutline}>T={a.temperature}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {!a.is_default && <button onClick={() => handleSetDefault(a.id)} style={s.iconBtn} title="Definir como default">⭐</button>}
                  <button onClick={() => startEdit(a)} style={s.iconBtn} title="Editar">✏️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== TRAINING TAB ====================
function TrainingTab() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", source_type: "text", source_url: "" });
  const [saving, setSaving] = useState(false);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents?select=*&order=created_at.desc&limit=50`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
      });
      if (res.ok) setDocs(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleSave = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      const body: any = {
        title: form.title,
        source_type: form.source_type,
        status: "ready",
      };
      if (form.source_type === "text") body.content = form.content;
      if (form.source_type === "url") body.source_url = form.source_url;

      await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
        body: JSON.stringify(body),
      });

      if (form.source_type === "text" && form.content) {
        const docRes = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents?select=id&order=created_at.desc&limit=1`, {
          headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
        });
        const newDocs = await docRes.json();
        if (newDocs[0]) {
          await fetch(`${SUPABASE_URL}/rest/v1/knowledge_chunks`, {
            method: "POST",
            headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
            body: JSON.stringify({ document_id: newDocs[0].id, content: form.content, chunk_index: 0, tokens_count: Math.ceil(form.content.length / 4) }),
          });
        }
      }

      setShowForm(false);
      setForm({ title: "", content: "", source_type: "text", source_url: "" });
      fetchDocs();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div>
      <button onClick={() => setShowForm(!showForm)} style={{ ...s.btnPrimary, marginBottom: 16, ...(showForm ? { background: colors.textMuted } : {}) }}>
        {showForm ? "✕ Cancelar" : "➕ Novo Documento"}
      </button>

      {showForm && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>📝 Adicionar Conhecimento</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <FormField label="Título">
              <input style={s.input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Título do documento" />
            </FormField>
            <FormField label="Tipo">
              <select style={s.input} value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })}>
                <option value="text">Texto</option>
                <option value="url">URL</option>
              </select>
            </FormField>
            {form.source_type === "text" && (
              <FormField label="Conteúdo">
                <textarea style={{ ...s.input, minHeight: 150, resize: "vertical" }} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Cole aqui o conteúdo de treino..." />
              </FormField>
            )}
            {form.source_type === "url" && (
              <FormField label="URL">
                <input style={s.input} value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="https://..." />
              </FormField>
            )}
          </div>
          <button onClick={handleSave} disabled={saving || !form.title} style={{ ...s.btnPrimary, marginTop: 12 }}>
            {saving ? "⏳ Salvando..." : "💾 Salvar Documento"}
          </button>
        </div>
      )}

      <div style={s.card}>
        <h3 style={s.cardTitle}>📚 Documentos de Conhecimento</h3>
        {loading ? <LoadingText /> : docs.length === 0 ? (
          <EmptyText text="Nenhum documento adicionado." />
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {docs.map((d) => (
              <div key={d.id} style={{ padding: "10px 12px", background: colors.surface, borderRadius: 8, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ color: colors.text }}>{d.title}</strong>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={s.badgeOutline}>{d.source_type === "url" ? "🔗 URL" : "📝 Texto"}</span>
                    <span style={{ ...s.badgeOutline, ...(d.status === "ready" ? { background: colors.successBg, color: colors.success, borderColor: colors.successBorder } : {}) }}>
                      {d.status}
                    </span>
                  </div>
                </div>
                {d.chunks_count > 0 && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{d.chunks_count} chunks</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== FLOWS TAB ====================
function FlowsTab() {
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFlows = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/flows?select=id,name,is_active,trigger_type,trigger_value,keywords,flow_type,created_at&order=created_at.desc`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
      });
      if (res.ok) setFlows(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchFlows(); }, []);

  const toggleActive = async (id: string, current: boolean) => {
    await fetch(`${SUPABASE_URL}/rest/v1/flows?id=eq.${id}`, {
      method: "PATCH",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({ is_active: !current }),
    });
    fetchFlows();
  };

  return (
    <div>
      <div style={s.infoBox}>
        ℹ️ Para criar e editar fluxos completos, utilize o <strong>editor visual</strong> na aplicação principal Emmely Cloud.
      </div>

      <div style={{ ...s.card, marginTop: 12 }}>
        <h3 style={s.cardTitle}>🔀 Fluxos de Automação</h3>
        {loading ? <LoadingText /> : flows.length === 0 ? (
          <EmptyText text="Nenhum fluxo criado." />
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {flows.map((f) => (
              <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: colors.surface, borderRadius: 8 }}>
                <div>
                  <strong style={{ fontSize: 14, color: colors.text }}>{f.name}</strong>
                  <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, display: "flex", gap: 6 }}>
                    <span style={s.badgeOutline}>{f.trigger_type}</span>
                    <span style={s.badgeOutline}>{f.flow_type}</span>
                    {f.keywords?.length > 0 && <span style={{ ...s.badgeOutline, fontSize: 10 }}>🏷️ {f.keywords.join(", ")}</span>}
                  </div>
                </div>
                <button onClick={() => toggleActive(f.id, f.is_active)} style={{
                  ...s.iconBtn,
                  background: f.is_active ? colors.successBg : colors.errorBg,
                  color: f.is_active ? colors.success : colors.error,
                  border: `1px solid ${f.is_active ? colors.successBorder : colors.errorBorder}`,
                  fontSize: 11, padding: "4px 10px", fontWeight: 600,
                }}>
                  {f.is_active ? "✅ Ativo" : "❌ Inativo"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== PLAYGROUND TAB ====================
function PlaygroundTab() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/ai_agents?select=id,name,is_default,is_active&is_active=eq.true&order=is_default.desc`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setAgents(data || []);
        if (data?.length > 0) setSelectedAgent(data[0].id);
      })
      .catch(console.error);
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || !selectedAgent || loading) return;
    const userMsg = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-playground`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ agent_id: selectedAgent, messages: newMessages }),
      });
      const data = await res.json();
      if (data.content) {
        setMessages([...newMessages, { role: "assistant", content: data.content }]);
      } else {
        setMessages([...newMessages, { role: "assistant", content: data.error || "Erro ao processar." }]);
      }
    } catch (e) {
      setMessages([...newMessages, { role: "assistant", content: "Erro de conexão." }]);
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <FormField label="Agente">
          <select style={s.input} value={selectedAgent} onChange={(e) => { setSelectedAgent(e.target.value); setMessages([]); }}>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name} {a.is_default ? "⭐" : ""}</option>)}
          </select>
        </FormField>
      </div>

      <div style={s.chatContainer}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>💬</div>
            <p style={{ color: colors.textMuted, fontSize: 13, margin: 0 }}>Envie uma mensagem para testar o agente...</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            marginBottom: 8,
          }}>
            <div style={{
              background: m.role === "user" ? colors.chatUser : colors.chatBot,
              color: m.role === "user" ? "#fff" : colors.text,
              padding: "10px 14px",
              borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              maxWidth: "80%",
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              boxShadow: m.role === "user" ? "none" : colors.shadow,
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
            <div style={{ background: colors.chatBot, padding: "10px 18px", borderRadius: "18px 18px 18px 4px", boxShadow: colors.shadow }}>
              <div style={s.typingDots}>
                <span style={{ ...s.dot, animationDelay: "0s" }} />
                <span style={{ ...s.dot, animationDelay: "0.2s" }} />
                <span style={{ ...s.dot, animationDelay: "0.4s" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          style={{ ...s.input, flex: 1 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Digite uma mensagem..."
          disabled={loading}
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ ...s.btnPrimary, width: "auto", padding: "8px 20px" }}>
          ➤
        </button>
      </div>

      {messages.length > 0 && (
        <button onClick={() => setMessages([])} style={{ ...s.btnSecondary, marginTop: 8, fontSize: 12 }}>
          🗑️ Limpar conversa
        </button>
      )}

      {/* CSS animation for typing dots */}
      <style>{`
        @keyframes emmelyDotPulse {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// ==================== PAGAMENTOS TAB ====================
function PagamentosTab() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", currency: "EUR", payment_method: "card", customer_name: "", customer_email: "", description: "" });

  useEffect(() => { fetchTransactions(); }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/payment-status?list=true`, {
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.amount || Number(form.amount) <= 0) return;
    setCreating(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/payment-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(form.amount), currency: form.currency, payment_method: form.payment_method,
          description: form.description || "Cobrança Emmely Cloud",
          customer_data: { name: form.customer_name, email: form.customer_email, country: form.currency === "BRL" ? "Brasil" : "Portugal" },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowForm(false);
        setForm({ amount: "", currency: "EUR", payment_method: "card", customer_name: "", customer_email: "", description: "" });
        fetchTransactions();
      } else { alert("Erro: " + (data.error || "Falha")); }
    } catch (e: any) { alert("Erro: " + e.message); }
    setCreating(false);
  };

  const statusMap: Record<string, { label: string; bg: string; color: string }> = {
    pending: { label: "Pendente", bg: colors.warningBg, color: colors.warning },
    confirmed: { label: "Confirmado", bg: colors.successBg, color: colors.success },
    received: { label: "Recebido", bg: colors.successBg, color: colors.success },
    failed: { label: "Falhou", bg: colors.errorBg, color: colors.error },
    canceled: { label: "Cancelado", bg: colors.surface, color: colors.textMuted },
    refunded: { label: "Reembolsado", bg: "#f5f3ff", color: "#7c3aed" },
    overdue: { label: "Vencido", bg: colors.errorBg, color: colors.error },
  };

  return (
    <div>
      <button onClick={() => setShowForm(!showForm)} style={{ ...s.btnPrimary, marginBottom: 16, ...(showForm ? { background: colors.textMuted } : {}) }}>
        {showForm ? "✕ Cancelar" : "➕ Nova Cobrança"}
      </button>

      {showForm && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>💳 Nova Cobrança</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Nome"><input style={s.input} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></FormField>
            <FormField label="Email"><input style={s.input} value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} /></FormField>
            <FormField label="Valor"><input style={s.input} type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></FormField>
            <FormField label="Moeda">
              <select style={s.input} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value, payment_method: e.target.value === "BRL" ? "pix" : "card" })}>
                <option value="EUR">🇪🇺 EUR</option><option value="BRL">🇧🇷 BRL</option>
              </select>
            </FormField>
            <FormField label="Método">
              <select style={s.input} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {form.currency === "BRL" ? <><option value="pix">PIX</option><option value="boleto">Boleto</option><option value="card">Cartão</option></> : <option value="card">Cartão</option>}
              </select>
            </FormField>
            <FormField label="Descrição"><input style={s.input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField>
          </div>
          <button onClick={handleCreate} disabled={creating} style={{ ...s.btnPrimary, marginTop: 12 }}>{creating ? "⏳ Criando..." : "💳 Criar Cobrança"}</button>
        </div>
      )}

      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ ...s.cardTitle, margin: 0 }}>💰 Transações Recentes</h3>
          <button onClick={fetchTransactions} disabled={loading} style={s.iconBtn}>🔄</button>
        </div>
        {loading ? <LoadingText /> : transactions.length === 0 ? (
          <EmptyText text="Nenhuma transação." />
        ) : (
          <div style={{ maxHeight: 300, overflowY: "auto", display: "grid", gap: 6 }}>
            {transactions.map((tx: any) => {
              const st = statusMap[tx.status] || { label: tx.status, bg: colors.surface, color: colors.textMuted };
              return (
                <div key={tx.id} style={{ padding: "10px 12px", background: colors.surface, borderRadius: 8, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ color: colors.text }}>{tx.currency} {Number(tx.amount).toFixed(2)}</strong>
                      <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span>
                    </div>
                    <span style={{ fontSize: 11, color: colors.textSecondary }}>{tx.gateway === "stripe" ? "🟣 Stripe" : "🟢 Asaas"}</span>
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 4, display: "flex", gap: 8 }}>
                    <span>{tx.payment_method}</span>
                    <span>{new Date(tx.created_at).toLocaleString()}</span>
                    {tx.payment_url && <a href={tx.payment_url} target="_blank" rel="noopener noreferrer" style={{ color: colors.primary, textDecoration: "none" }}>🔗 Link</a>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== HELPER COMPONENTS ====================
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: `1px solid ${colors.borderLight}` }}>
      <span style={{ color: colors.textSecondary, fontWeight: 500 }}>{label}</span>
      <span style={{ color: colors.text }}>{value}</span>
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: active ? colors.success : colors.error, display: "inline-block" }} />;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={s.formLabel}>{label}</label>
      {children}
    </div>
  );
}

function LoadingText() {
  return <p style={{ color: colors.textMuted, fontSize: 13, margin: 0, textAlign: "center", padding: "12px 0" }}>Carregando...</p>;
}

function EmptyText({ text }: { text: string }) {
  return <p style={{ color: colors.textMuted, fontSize: 13, margin: 0, textAlign: "center", padding: "12px 0" }}>{text}</p>;
}

// ==================== INLINE STYLES ====================
const s: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: font,
    margin: 0,
    padding: 0,
    background: colors.surface,
    color: colors.text,
    minHeight: "100vh",
  },
  header: {
    background: colors.gradient,
    padding: "16px 20px",
    borderRadius: "0 0 16px 16px",
    marginBottom: 0,
  },
  headerInner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 40,
    height: 40,
    background: "rgba(255,255,255,0.2)",
    backdropFilter: "blur(8px)",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    fontWeight: 800,
    fontSize: 20,
    letterSpacing: "-0.5px",
  },
  tabBar: {
    display: "flex",
    gap: 4,
    padding: "8px 12px",
    overflowX: "auto",
    background: colors.surfaceCard,
    borderBottom: `1px solid ${colors.border}`,
    position: "sticky" as const,
    top: 0,
    zIndex: 10,
  },
  tab: {
    padding: "6px 12px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 12,
    color: colors.textSecondary,
    borderRadius: 20,
    transition: "all 0.2s",
    whiteSpace: "nowrap" as const,
    fontFamily: font,
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  tabActive: {
    background: colors.primary,
    color: "#fff",
    fontWeight: 600,
  },
  card: {
    background: colors.surfaceCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    border: `1px solid ${colors.border}`,
    boxShadow: colors.shadow,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginTop: 0,
    marginBottom: 12,
    color: colors.text,
    letterSpacing: "-0.2px",
  },
  btnPrimary: {
    width: "100%",
    padding: "10px 16px",
    background: colors.gradientBtn,
    color: "white",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: font,
    transition: "opacity 0.2s",
    letterSpacing: "-0.1px",
  },
  btnSecondary: {
    width: "100%",
    padding: "10px 16px",
    background: "transparent",
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: font,
    transition: "all 0.2s",
  },
  iconBtn: {
    padding: "6px 10px",
    border: `1px solid ${colors.border}`,
    background: colors.surfaceCard,
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    transition: "all 0.15s",
    fontFamily: font,
  },
  input: {
    width: "100%",
    padding: "9px 12px",
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box" as const,
    fontFamily: font,
    color: colors.text,
    background: colors.surfaceCard,
    transition: "border-color 0.2s",
  },
  formLabel: {
    display: "block",
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  infoBox: {
    background: colors.infoBg,
    border: `1px solid ${colors.infoBorder}`,
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 13,
    color: colors.infoText,
    marginTop: 16,
    lineHeight: 1.5,
  },
  agentCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px",
    background: colors.surface,
    borderRadius: 10,
    border: `1px solid ${colors.borderLight}`,
    transition: "border-color 0.2s",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: colors.gradientBtn,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 700,
    fontSize: 15,
    flexShrink: 0,
  },
  badgeSuccess: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "1px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: colors.successBg,
    color: colors.success,
    border: `1px solid ${colors.successBorder}`,
  },
  badgeError: {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: colors.errorBg,
    color: colors.error,
    border: `1px solid ${colors.errorBorder}`,
  },
  badgeOutline: {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 8px",
    borderRadius: 20,
    fontSize: 10,
    fontWeight: 500,
    background: "transparent",
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
  },
  chatContainer: {
    background: colors.surfaceCard,
    borderRadius: 12,
    border: `1px solid ${colors.border}`,
    padding: 16,
    minHeight: 300,
    maxHeight: 400,
    overflowY: "auto" as const,
    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.03)",
  },
  loadingDot: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: `3px solid ${colors.border}`,
    borderTopColor: colors.primary,
    animation: "spin 0.8s linear infinite",
  },
  typingDots: {
    display: "flex",
    gap: 4,
    alignItems: "center",
    height: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: colors.textMuted,
    animation: "emmelyDotPulse 1.2s ease-in-out infinite",
    display: "inline-block",
  },
};

export default Bitrix24App;
