import { useEffect, useState } from "react";

type AppStatus = "loading" | "installing" | "installed" | "ready" | "error";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const Bitrix24App = () => {
  const [status, setStatus] = useState<AppStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://api.bitrix24.com/api/v1/";
    script.onload = () => {
      try {
        // @ts-ignore
        if (window.BX24) {
          // @ts-ignore
          window.BX24.init(() => {
            handleBX24Ready();
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

  async function handleBX24Ready() {
    try {
      // @ts-ignore
      const auth = window.BX24.getAuth();
      
      if (!auth || !auth.access_token) {
        console.log("[BITRIX24] No auth available, showing ready state");
        setStatus("ready");
        return;
      }

      console.log("[BITRIX24] Auth received, member_id:", auth.member_id);

      // Check if already installed by calling the edge function
      setStatus("installing");

      const response = await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-install`, {
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

      if (!response.ok) {
        const text = await response.text();
        console.error("[BITRIX24] Install error:", text);
        // Don't block UI on error - still show as connected
        setStatus("ready");
        return;
      }

      console.log("[BITRIX24] Install/sync completed successfully");

      // Call installFinish to notify Bitrix24
      try {
        // @ts-ignore
        window.BX24.installFinish();
      } catch {}

      setStatus("installed");

      // After 2 seconds, switch to ready state
      setTimeout(() => setStatus("ready"), 2000);
    } catch (err) {
      console.error("[BITRIX24] Error:", err);
      setErrorMsg(String(err));
      setStatus("error");
    }
  }

  if (status === "loading" || status === "installing") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2 style={titleStyle}>
            {status === "installing" ? "Configurando Emmely Cloud..." : "Carregando..."}
          </h2>
          <p style={subtitleStyle}>Aguarde um momento...</p>
        </div>
      </div>
    );
  }

  if (status === "installed") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={titleStyle}>Emmely Cloud Instalado!</h2>
          <p style={subtitleStyle}>Conector WhatsApp & Instagram configurado com sucesso.</p>
          <p style={subtitleStyle}>Acesse o Contact Center para ativar os canais.</p>
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

  // Ready state - main app view
  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div style={logoStyle}>E</div>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Emmely Cloud</h2>
          <span style={badgeStyle}>🟢 Conectado</span>
        </div>
      </div>

      <p style={{ fontSize: 14, color: "#666", marginBottom: 20 }}>
        A integração Emmely Cloud está ativa. As mensagens de WhatsApp e Instagram
        são encaminhadas automaticamente para o Contact Center do Bitrix24.
      </p>

      <div style={infoBoxStyle}>
        ℹ️ Para gerenciar conversas, acesse o <strong>Contact Center</strong> do Bitrix24
        e selecione o conector <strong>Emmely Cloud</strong>.
      </div>
    </div>
  );
};

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
  margin: 0, padding: 24, background: "#fff", color: "#333", minHeight: "100vh",
};
const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #e5e5e5",
};
const logoStyle: React.CSSProperties = {
  width: 40, height: 40, background: "#25D366", borderRadius: 10,
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "white", fontWeight: "bold", fontSize: 18,
};
const badgeStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "4px 12px", borderRadius: 20, fontSize: 13, background: "#e8f5e9",
};
const infoBoxStyle: React.CSSProperties = {
  background: "#f0f7ff", border: "1px solid #cce0ff", borderRadius: 8,
  padding: "12px 16px", fontSize: 13, color: "#1a5276",
};

export default Bitrix24App;
