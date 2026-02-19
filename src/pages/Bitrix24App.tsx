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
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2 style={titleStyle}>Carregando...</h2>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={titleStyle}>Erro na configuração</h2>
          <p style={subtitleStyle}>{errorMsg || "Tente reinstalar o aplicativo."}</p>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "connector", label: "Conector", icon: "🔗" },
    { id: "agentes", label: "Agentes", icon: "🤖" },
    { id: "training", label: "Training", icon: "📚" },
    { id: "flows", label: "Flows", icon: "⚡" },
    { id: "playground", label: "Playground", icon: "🧪" },
    { id: "pagamentos", label: "Pagamentos", icon: "💳" },
  ];

  const integration = integrationData?.integration;
  const channels = integrationData?.channels || [];
  const logs = integrationData?.recent_logs || [];

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div style={logoStyle}>E</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Emmely Cloud</h2>
          <span style={{ ...badgeStyle, background: integration?.connector_active ? "#e8f5e9" : "#ffeaea" }}>
            {integration?.connector_active ? "🟢 Ativo" : "🔴 Inativo"}
          </span>
        </div>
      </div>

      <div style={tabBarStyle}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{ ...tabStyle, ...(activeTab === tab.id ? tabActiveStyle : {}) }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

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
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Status da Integração</h3>
        {integration ? (
          <div>
            <div style={rowStyle}><span style={labelStyle}>Portal:</span><span>{integration.domain || integration.member_id}</span></div>
            <div style={rowStyle}><span style={labelStyle}>Conector:</span><span>{integration.connector_registered ? "✅ Registado" : "❌ Não registado"}</span></div>
            <div style={rowStyle}><span style={labelStyle}>Status:</span><span>{integration.connector_active ? "🟢 Ativo" : "🔴 Inativo"}</span></div>
            <div style={rowStyle}><span style={labelStyle}>Última atualização:</span><span>{new Date(integration.updated_at).toLocaleString()}</span></div>
          </div>
        ) : (
          <p style={{ color: "#999", fontSize: 14 }}>Integração não encontrada. Reinstale o aplicativo.</p>
        )}
      </div>

      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Canais Configurados</h3>
        {channels.length > 0 ? (
          <table style={tableStyle}>
            <thead><tr><th style={thStyle}>Canal</th><th style={thStyle}>Open Line</th><th style={thStyle}>Status</th></tr></thead>
            <tbody>
              {channels.map((ch, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{ch.channel === "whatsapp" ? "📱 WhatsApp" : "📸 Instagram"}</td>
                  <td style={tdStyle}>{ch.line_name || `Line ${ch.line_id}`}</td>
                  <td style={tdStyle}>{ch.is_active ? "✅" : "❌"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "#999", fontSize: 14 }}>Nenhum canal mapeado ainda.</p>
        )}
      </div>

      <button onClick={onResync} disabled={loading} style={btnStyle}>
        {loading ? "⏳ Sincronizando..." : "🔄 Re-sincronizar Conector"}
      </button>

      {logs.length > 0 && (
        <div style={{ ...sectionStyle, marginTop: 16 }}>
          <h3 style={sectionTitleStyle}>Últimos Eventos</h3>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {logs.map((log, i) => (
              <div key={i} style={{ padding: "6px 10px", fontSize: 12, borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between" }}>
                <span>{log.direction === "inbound" ? "📥" : "📤"} {log.event_type}{log.error && <span style={{ color: "#e74c3c", marginLeft: 6 }}>⚠️</span>}</span>
                <span style={{ color: "#999" }}>{new Date(log.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={infoBoxStyle}>
        ℹ️ Para gerenciar conversas, acesse o <strong>Contact Center</strong> do Bitrix24 e selecione o conector <strong>Emmely Cloud</strong>.
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
    // Unset all defaults, then set the one
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
      <button onClick={() => { setEditing({}); setForm({ name: "", system_prompt: "", ai_model: "google/gemini-3-flash-preview", temperature: "0.7", welcome_message: "", fallback_message: "Desculpe, não consegui processar a sua mensagem." }); }} style={{ ...btnStyle, marginBottom: 16 }}>
        ➕ Novo Agente
      </button>

      {editing && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>{editing.id ? "Editar Agente" : "Novo Agente"}</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <div><label style={formLabelStyle}>Nome</label><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do agente" /></div>
            <div><label style={formLabelStyle}>Modelo IA</label>
              <select style={inputStyle} value={form.ai_model} onChange={(e) => setForm({ ...form, ai_model: e.target.value })}>
                <option value="google/gemini-3-flash-preview">Gemini 3 Flash</option>
                <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
                <option value="openai/gpt-5-mini">GPT-5 Mini</option>
                <option value="openai/gpt-5">GPT-5</option>
              </select>
            </div>
            <div><label style={formLabelStyle}>Temperatura ({form.temperature})</label><input style={inputStyle} type="range" min="0" max="1" step="0.1" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} /></div>
            <div><label style={formLabelStyle}>System Prompt</label><textarea style={{ ...inputStyle, minHeight: 120, resize: "vertical" }} value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} placeholder="Instruções para o agente..." /></div>
            <div><label style={formLabelStyle}>Mensagem de Boas-Vindas</label><input style={inputStyle} value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} /></div>
            <div><label style={formLabelStyle}>Mensagem de Fallback</label><input style={inputStyle} value={form.fallback_message} onChange={(e) => setForm({ ...form, fallback_message: e.target.value })} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={handleSave} disabled={saving || !form.name} style={{ ...btnStyle, flex: 1 }}>{saving ? "⏳ Salvando..." : "💾 Salvar"}</button>
            <button onClick={() => setEditing(null)} style={{ ...btnStyle, flex: 1, background: "#999" }}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Agentes Configurados</h3>
        {loading ? <p style={{ color: "#999", fontSize: 13 }}>Carregando...</p> : agents.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13 }}>Nenhum agente criado.</p>
        ) : (
          agents.map((a) => (
            <div key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: 14 }}>{a.name}</strong>
                {a.is_default && <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 12, fontSize: 11, background: "#e8f5e9", color: "#2e7d32" }}>⭐ Default</span>}
                {!a.is_active && <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 12, fontSize: 11, background: "#ffeaea", color: "#c62828" }}>Inativo</span>}
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{a.ai_model} · T={a.temperature}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {!a.is_default && <button onClick={() => handleSetDefault(a.id)} style={smallBtnStyle} title="Definir como default">⭐</button>}
                <button onClick={() => startEdit(a)} style={smallBtnStyle} title="Editar">✏️</button>
              </div>
            </div>
          ))
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

      // Also create a chunk for text content
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
      <button onClick={() => setShowForm(!showForm)} style={{ ...btnStyle, marginBottom: 16, background: showForm ? "#999" : "#25D366" }}>
        {showForm ? "✕ Cancelar" : "➕ Novo Documento"}
      </button>

      {showForm && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Adicionar Conhecimento</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <div><label style={formLabelStyle}>Título</label><input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Título do documento" /></div>
            <div><label style={formLabelStyle}>Tipo</label>
              <select style={inputStyle} value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })}>
                <option value="text">Texto</option>
                <option value="url">URL</option>
              </select>
            </div>
            {form.source_type === "text" && (
              <div><label style={formLabelStyle}>Conteúdo</label><textarea style={{ ...inputStyle, minHeight: 150, resize: "vertical" }} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Cole aqui o conteúdo de treino..." /></div>
            )}
            {form.source_type === "url" && (
              <div><label style={formLabelStyle}>URL</label><input style={inputStyle} value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="https://..." /></div>
            )}
          </div>
          <button onClick={handleSave} disabled={saving || !form.title} style={{ ...btnStyle, marginTop: 12 }}>
            {saving ? "⏳ Salvando..." : "💾 Salvar Documento"}
          </button>
        </div>
      )}

      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Documentos de Conhecimento</h3>
        {loading ? <p style={{ color: "#999", fontSize: 13 }}>Carregando...</p> : docs.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13 }}>Nenhum documento adicionado.</p>
        ) : (
          docs.map((d) => (
            <div key={d.id} style={{ padding: "8px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{d.title}</strong>
                <span style={{ fontSize: 11, color: "#888" }}>{d.source_type === "url" ? "🔗" : "📝"} {d.status}</span>
              </div>
              {d.chunks_count > 0 && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{d.chunks_count} chunks</div>}
            </div>
          ))
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
      <div style={infoBoxStyle}>
        ℹ️ Para criar e editar fluxos completos, utilize o <strong>editor visual</strong> na aplicação principal Emmely Cloud.
      </div>

      <div style={{ ...sectionStyle, marginTop: 16 }}>
        <h3 style={sectionTitleStyle}>Fluxos de Automação</h3>
        {loading ? <p style={{ color: "#999", fontSize: 13 }}>Carregando...</p> : flows.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13 }}>Nenhum fluxo criado.</p>
        ) : (
          flows.map((f) => (
            <div key={f.id} style={{ padding: "10px 0", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: 14 }}>{f.name}</strong>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {f.trigger_type} · {f.flow_type}
                  {f.keywords?.length > 0 && ` · Keywords: ${f.keywords.join(", ")}`}
                </div>
              </div>
              <button onClick={() => toggleActive(f.id, f.is_active)} style={{ ...smallBtnStyle, background: f.is_active ? "#e8f5e9" : "#ffeaea", color: f.is_active ? "#2e7d32" : "#c62828" }}>
                {f.is_active ? "✅ Ativo" : "❌ Inativo"}
              </button>
            </div>
          ))
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
        <label style={formLabelStyle}>Agente</label>
        <select style={inputStyle} value={selectedAgent} onChange={(e) => { setSelectedAgent(e.target.value); setMessages([]); }}>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name} {a.is_default ? "⭐" : ""}</option>)}
        </select>
      </div>

      <div style={{ ...sectionStyle, minHeight: 300, maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.length === 0 && <p style={{ color: "#bbb", textAlign: "center", marginTop: 60, fontSize: 13 }}>Envie uma mensagem para testar o agente...</p>}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            background: m.role === "user" ? "#25D366" : "#f0f0f0",
            color: m.role === "user" ? "white" : "#333",
            padding: "8px 14px", borderRadius: 16, maxWidth: "80%", fontSize: 13, whiteSpace: "pre-wrap",
          }}>
            {m.content}
          </div>
        ))}
        {loading && <div style={{ alignSelf: "flex-start", background: "#f0f0f0", padding: "8px 14px", borderRadius: 16, fontSize: 13 }}>⏳ Pensando...</div>}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Digite uma mensagem..."
          disabled={loading}
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ ...btnStyle, width: "auto", padding: "8px 20px" }}>
          Enviar
        </button>
      </div>

      {messages.length > 0 && (
        <button onClick={() => setMessages([])} style={{ ...btnStyle, marginTop: 8, background: "#999", fontSize: 12 }}>
          🗑️ Limpar conversa
        </button>
      )}
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

  const statusMap: Record<string, { label: string; color: string }> = {
    pending: { label: "⏳ Pendente", color: "#f39c12" }, confirmed: { label: "✅ Confirmado", color: "#27ae60" },
    received: { label: "✅ Recebido", color: "#27ae60" }, failed: { label: "❌ Falhou", color: "#e74c3c" },
    canceled: { label: "🚫 Cancelado", color: "#999" }, refunded: { label: "↩️ Reembolsado", color: "#8e44ad" },
    overdue: { label: "⚠️ Vencido", color: "#e74c3c" },
  };

  return (
    <div>
      <button onClick={() => setShowForm(!showForm)} style={{ ...btnStyle, marginBottom: 16, background: showForm ? "#999" : "#25D366" }}>
        {showForm ? "✕ Cancelar" : "➕ Nova Cobrança"}
      </button>

      {showForm && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Nova Cobrança</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={formLabelStyle}>Nome</label><input style={inputStyle} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div><label style={formLabelStyle}>Email</label><input style={inputStyle} value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} /></div>
            <div><label style={formLabelStyle}>Valor</label><input style={inputStyle} type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><label style={formLabelStyle}>Moeda</label>
              <select style={inputStyle} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value, payment_method: e.target.value === "BRL" ? "pix" : "card" })}>
                <option value="EUR">🇪🇺 EUR</option><option value="BRL">🇧🇷 BRL</option>
              </select>
            </div>
            <div><label style={formLabelStyle}>Método</label>
              <select style={inputStyle} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {form.currency === "BRL" ? <><option value="pix">PIX</option><option value="boleto">Boleto</option><option value="card">Cartão</option></> : <option value="card">Cartão</option>}
              </select>
            </div>
            <div><label style={formLabelStyle}>Descrição</label><input style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <button onClick={handleCreate} disabled={creating} style={{ ...btnStyle, marginTop: 12 }}>{creating ? "⏳ Criando..." : "💳 Criar"}</button>
        </div>
      )}

      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ ...sectionTitleStyle, margin: 0 }}>Transações Recentes</h3>
          <button onClick={fetchTransactions} disabled={loading} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16 }}>🔄</button>
        </div>
        {loading ? <p style={{ textAlign: "center", color: "#999", fontSize: 13 }}>Carregando...</p> : transactions.length === 0 ? (
          <p style={{ textAlign: "center", color: "#999", fontSize: 13 }}>Nenhuma transação.</p>
        ) : (
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {transactions.map((tx: any) => {
              const st = statusMap[tx.status] || { label: tx.status, color: "#666" };
              return (
                <div key={tx.id} style={{ padding: "10px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div><strong>{tx.currency} {Number(tx.amount).toFixed(2)}</strong><span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 12, fontSize: 11, background: st.color + "22", color: st.color }}>{st.label}</span></div>
                    <span style={{ fontSize: 11, color: "#999" }}>{tx.gateway === "stripe" ? "🟣 Stripe" : "🟢 Asaas"}</span>
                  </div>
                  <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>
                    {tx.payment_method} · {new Date(tx.created_at).toLocaleString()}
                    {tx.payment_url && <a href={tx.payment_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: "#2980b9" }}>🔗 Link</a>}
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

// ==================== INLINE STYLES ====================
const containerStyle: React.CSSProperties = { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", margin: 0, background: "#f5f5f5" };
const cardStyle: React.CSSProperties = { textAlign: "center", padding: 40, background: "white", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.1)", maxWidth: 400 };
const titleStyle: React.CSSProperties = { color: "#333", marginBottom: 8, fontSize: 18 };
const subtitleStyle: React.CSSProperties = { color: "#666", fontSize: 14 };
const pageStyle: React.CSSProperties = { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", margin: 0, padding: 20, background: "#fff", color: "#333", minHeight: "100vh" };
const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #e5e5e5" };
const logoStyle: React.CSSProperties = { width: 40, height: 40, background: "#25D366", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold", fontSize: 18 };
const badgeStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 10px", borderRadius: 20, fontSize: 12, marginTop: 2 };
const tabBarStyle: React.CSSProperties = { display: "flex", gap: 2, borderBottom: "2px solid #e5e5e5", paddingBottom: 0, overflowX: "auto" };
const tabStyle: React.CSSProperties = { padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#666", borderBottom: "2px solid transparent", marginBottom: -2, transition: "all 0.2s", whiteSpace: "nowrap" };
const tabActiveStyle: React.CSSProperties = { color: "#25D366", borderBottomColor: "#25D366", fontWeight: 600 };
const sectionStyle: React.CSSProperties = { background: "#fafafa", borderRadius: 8, padding: 16, marginBottom: 12, border: "1px solid #eee" };
const sectionTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 600, marginTop: 0, marginBottom: 12, color: "#333" };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 };
const labelStyle: React.CSSProperties = { color: "#888", fontWeight: 500 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thStyle: React.CSSProperties = { textAlign: "left", padding: 8, borderBottom: "2px solid #e5e5e5", fontSize: 12, color: "#666", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: 8, borderBottom: "1px solid #eee" };
const btnStyle: React.CSSProperties = { width: "100%", padding: "10px 16px", background: "#25D366", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 };
const smallBtnStyle: React.CSSProperties = { padding: "4px 10px", border: "1px solid #ddd", background: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 14 };
const infoBoxStyle: React.CSSProperties = { background: "#f0f7ff", border: "1px solid #cce0ff", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#1a5276", marginTop: 16 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" };
const formLabelStyle: React.CSSProperties = { display: "block", fontSize: 11, color: "#888", marginBottom: 4, fontWeight: 500 };

export default Bitrix24App;
