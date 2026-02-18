import { useEffect, useState, useCallback } from "react";

type AppStatus = "loading" | "ready" | "error";
type TabId = "connector" | "conversas" | "pagamentos" | "automacoes";

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

  // --- Loading / Error states ---
  if (status === "loading") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2 style={titleStyle}>Carregando...</h2>
          <p style={subtitleStyle}>Aguarde um momento...</p>
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
    { id: "conversas", label: "Conversas", icon: "💬" },
    { id: "pagamentos", label: "Pagamentos", icon: "💳" },
    { id: "automacoes", label: "Automações", icon: "⚡" },
  ];

  const integration = integrationData?.integration;
  const channels = integrationData?.channels || [];
  const logs = integrationData?.recent_logs || [];

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={logoStyle}>E</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Emmely Cloud</h2>
          <span style={{
            ...badgeStyle,
            background: integration?.connector_active ? "#e8f5e9" : "#ffeaea",
          }}>
            {integration?.connector_active ? "🟢 Ativo" : "🔴 Inativo"}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={tabBarStyle}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...tabStyle,
              ...(activeTab === tab.id ? tabActiveStyle : {}),
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ marginTop: 20 }}>
        {activeTab === "connector" && (
          <ConnectorTab
            integration={integration}
            channels={channels}
            logs={logs}
            loading={loadingData}
            onResync={handleResync}
          />
        )}
        {activeTab === "conversas" && <PlaceholderTab title="Conversas" description="Lista de conversas recentes do Emmely Cloud." icon="💬" />}
        {activeTab === "pagamentos" && <PagamentosTab />}
        {activeTab === "automacoes" && <PlaceholderTab title="Automações" description="Regras de follow-up e alertas automáticos." icon="⚡" />}
      </div>
    </div>
  );
};

// --- Connector Tab ---
function ConnectorTab({ integration, channels, logs, loading, onResync }: {
  integration: IntegrationData["integration"];
  channels: IntegrationData["channels"];
  logs: IntegrationData["recent_logs"];
  loading: boolean;
  onResync: () => void;
}) {
  return (
    <div>
      {/* Status Card */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Status da Integração</h3>
        {integration ? (
          <div>
            <div style={rowStyle}>
              <span style={labelStyle}>Portal:</span>
              <span>{integration.domain || integration.member_id}</span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Conector:</span>
              <span>{integration.connector_registered ? "✅ Registado" : "❌ Não registado"}</span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Status:</span>
              <span>{integration.connector_active ? "🟢 Ativo" : "🔴 Inativo"}</span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Última atualização:</span>
              <span>{new Date(integration.updated_at).toLocaleString()}</span>
            </div>
          </div>
        ) : (
          <p style={{ color: "#999", fontSize: 14 }}>Integração não encontrada. Reinstale o aplicativo.</p>
        )}
      </div>

      {/* Channels */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Canais Configurados</h3>
        {channels.length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Canal</th>
                <th style={thStyle}>Open Line</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
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

      {/* Re-sync Button */}
      <button onClick={onResync} disabled={loading} style={btnStyle}>
        {loading ? "⏳ Sincronizando..." : "🔄 Re-sincronizar Conector"}
      </button>

      {/* Recent Logs */}
      {logs.length > 0 && (
        <div style={{ ...sectionStyle, marginTop: 16 }}>
          <h3 style={sectionTitleStyle}>Últimos Eventos</h3>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {logs.map((log, i) => (
              <div key={i} style={{
                padding: "6px 10px", fontSize: 12, borderBottom: "1px solid #f0f0f0",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span>
                  {log.direction === "inbound" ? "📥" : "📤"} {log.event_type}
                  {log.error && <span style={{ color: "#e74c3c", marginLeft: 6 }}>⚠️ {log.error}</span>}
                </span>
                <span style={{ color: "#999" }}>{new Date(log.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={infoBoxStyle}>
        ℹ️ Para gerenciar conversas, acesse o <strong>Contact Center</strong> do Bitrix24
        e selecione o conector <strong>Emmely Cloud</strong>.
      </div>
    </div>
  );
}

// --- Pagamentos Tab ---
function PagamentosTab() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", currency: "EUR", payment_method: "card", customer_name: "", customer_email: "", description: "" });

  useEffect(() => {
    fetchTransactions();
  }, []);

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
    } catch (e) {
      console.error("[PAY] Fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.amount || Number(form.amount) <= 0) return;
    setCreating(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/payment-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(form.amount),
          currency: form.currency,
          payment_method: form.payment_method,
          description: form.description || "Cobrança Emmely Cloud",
          customer_data: { name: form.customer_name, email: form.customer_email, country: form.currency === "BRL" ? "Brasil" : "Portugal" },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowForm(false);
        setForm({ amount: "", currency: "EUR", payment_method: "card", customer_name: "", customer_email: "", description: "" });
        fetchTransactions();
      } else {
        alert("Erro: " + (data.error || "Falha ao criar cobrança"));
      }
    } catch (e: any) {
      alert("Erro: " + e.message);
    } finally {
      setCreating(false);
    }
  };

  const statusMap: Record<string, { label: string; color: string }> = {
    pending: { label: "⏳ Pendente", color: "#f39c12" },
    confirmed: { label: "✅ Confirmado", color: "#27ae60" },
    received: { label: "✅ Recebido", color: "#27ae60" },
    failed: { label: "❌ Falhou", color: "#e74c3c" },
    canceled: { label: "🚫 Cancelado", color: "#999" },
    refunded: { label: "↩️ Reembolsado", color: "#8e44ad" },
    overdue: { label: "⚠️ Vencido", color: "#e74c3c" },
  };

  return (
    <div>
      {/* Create button */}
      <button onClick={() => setShowForm(!showForm)} style={{ ...btnStyle, marginBottom: 16, background: showForm ? "#999" : "#25D366" }}>
        {showForm ? "✕ Cancelar" : "➕ Nova Cobrança"}
      </button>

      {/* Create Form */}
      {showForm && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Nova Cobrança</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={formLabelStyle}>Nome do Cliente</label>
              <input style={inputStyle} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} placeholder="Nome" />
            </div>
            <div>
              <label style={formLabelStyle}>Email</label>
              <input style={inputStyle} value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} placeholder="email@exemplo.com" />
            </div>
            <div>
              <label style={formLabelStyle}>Valor</label>
              <input style={inputStyle} type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="100.00" />
            </div>
            <div>
              <label style={formLabelStyle}>Moeda</label>
              <select style={inputStyle} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value, payment_method: e.target.value === "BRL" ? "pix" : "card" })}>
                <option value="EUR">🇪🇺 EUR (Stripe)</option>
                <option value="BRL">🇧🇷 BRL (Asaas)</option>
              </select>
            </div>
            <div>
              <label style={formLabelStyle}>Método</label>
              <select style={inputStyle} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {form.currency === "BRL" ? (
                  <>
                    <option value="pix">PIX</option>
                    <option value="boleto">Boleto</option>
                    <option value="card">Cartão</option>
                  </>
                ) : (
                  <option value="card">Cartão</option>
                )}
              </select>
            </div>
            <div>
              <label style={formLabelStyle}>Descrição</label>
              <input style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrição (opcional)" />
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating} style={{ ...btnStyle, marginTop: 12 }}>
            {creating ? "⏳ Criando..." : "💳 Criar Cobrança"}
          </button>
        </div>
      )}

      {/* Transactions List */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ ...sectionTitleStyle, margin: 0 }}>Transações Recentes</h3>
          <button onClick={fetchTransactions} disabled={loading} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16 }}>🔄</button>
        </div>
        {loading ? (
          <p style={{ textAlign: "center", color: "#999", fontSize: 13 }}>Carregando...</p>
        ) : transactions.length === 0 ? (
          <p style={{ textAlign: "center", color: "#999", fontSize: 13 }}>Nenhuma transação encontrada.</p>
        ) : (
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {transactions.map((tx: any) => {
              const st = statusMap[tx.status] || { label: tx.status, color: "#666" };
              return (
                <div key={tx.id} style={{ padding: "10px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong>{tx.currency} {Number(tx.amount).toFixed(2)}</strong>
                      <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 12, fontSize: 11, background: st.color + "22", color: st.color }}>{st.label}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "#999", textTransform: "uppercase" }}>{tx.gateway === "stripe" ? "🟣 Stripe" : "🟢 Asaas"}</span>
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

// --- Placeholder Tab ---
function PlaceholderTab({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
      <h3 style={{ color: "#333", marginBottom: 8 }}>{title}</h3>
      <p style={{ color: "#999", fontSize: 14 }}>{description}</p>
      <p style={{ color: "#bbb", fontSize: 13, marginTop: 12 }}>Em breve...</p>
    </div>
  );
}

// --- Inline Styles (no Tailwind in Bitrix24 iframe) ---
const containerStyle: React.CSSProperties = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  display: "flex", alignItems: "center", justifyContent: "center",
  minHeight: "100vh", margin: 0, background: "#f5f5f5",
};
const cardStyle: React.CSSProperties = {
  textAlign: "center", padding: 40, background: "white",
  borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.1)", maxWidth: 400,
};
const titleStyle: React.CSSProperties = { color: "#333", marginBottom: 8, fontSize: 18 };
const subtitleStyle: React.CSSProperties = { color: "#666", fontSize: 14 };
const pageStyle: React.CSSProperties = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  margin: 0, padding: 20, background: "#fff", color: "#333", minHeight: "100vh",
};
const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #e5e5e5",
};
const logoStyle: React.CSSProperties = {
  width: 40, height: 40, background: "#25D366", borderRadius: 10,
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "white", fontWeight: "bold", fontSize: 18,
};
const badgeStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "2px 10px", borderRadius: 20, fontSize: 12, marginTop: 2,
};
const tabBarStyle: React.CSSProperties = {
  display: "flex", gap: 4, borderBottom: "2px solid #e5e5e5", paddingBottom: 0,
};
const tabStyle: React.CSSProperties = {
  padding: "8px 16px", border: "none", background: "transparent", cursor: "pointer",
  fontSize: 13, color: "#666", borderBottom: "2px solid transparent",
  marginBottom: -2, transition: "all 0.2s",
};
const tabActiveStyle: React.CSSProperties = {
  color: "#25D366", borderBottomColor: "#25D366", fontWeight: 600,
};
const sectionStyle: React.CSSProperties = {
  background: "#fafafa", borderRadius: 8, padding: 16, marginBottom: 12,
  border: "1px solid #eee",
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, marginTop: 0, marginBottom: 12, color: "#333",
};
const rowStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13,
};
const labelStyle: React.CSSProperties = { color: "#888", fontWeight: 500 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const thStyle: React.CSSProperties = {
  textAlign: "left", padding: 8, borderBottom: "2px solid #e5e5e5",
  fontSize: 12, color: "#666", textTransform: "uppercase",
};
const tdStyle: React.CSSProperties = { padding: 8, borderBottom: "1px solid #eee" };
const btnStyle: React.CSSProperties = {
  width: "100%", padding: "10px 16px", background: "#25D366", color: "white",
  border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600,
};
const infoBoxStyle: React.CSSProperties = {
  background: "#f0f7ff", border: "1px solid #cce0ff", borderRadius: 8,
  padding: "12px 16px", fontSize: 13, color: "#1a5276", marginTop: 16,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6,
  fontSize: 13, outline: "none", boxSizing: "border-box",
};
const formLabelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, color: "#888", marginBottom: 4, fontWeight: 500,
};

export default Bitrix24App;
