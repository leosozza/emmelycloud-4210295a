import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

const Bitrix24App = () => {
  const [searchParams] = useSearchParams();
  const isInstall = searchParams.get("installed") === "true";
  const [status, setStatus] = useState<"loading" | "installed" | "ready">("loading");

  useEffect(() => {
    // Load BX24 JS SDK
    const script = document.createElement("script");
    script.src = "https://api.bitrix24.com/api/v1/";
    script.onload = () => {
      try {
        // @ts-ignore
        if (window.BX24) {
          // @ts-ignore
          window.BX24.init(() => {
            if (isInstall) {
              // @ts-ignore
              window.BX24.installFinish();
              setStatus("installed");
            } else {
              // @ts-ignore
              window.BX24.fitWindow();
              setStatus("ready");
            }
          });
        } else {
          setStatus(isInstall ? "installed" : "ready");
        }
      } catch {
        setStatus(isInstall ? "installed" : "ready");
      }
    };
    script.onerror = () => setStatus(isInstall ? "installed" : "ready");
    document.head.appendChild(script);

    return () => {
      try { document.head.removeChild(script); } catch {}
    };
  }, [isInstall]);

  if (status === "loading") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2 style={{ margin: 0, fontSize: 18, color: "#333" }}>
            {isInstall ? "Instalando Emmely Cloud..." : "Carregando..."}
          </h2>
        </div>
      </div>
    );
  }

  if (status === "installed") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ margin: 0, fontSize: 18, color: "#333" }}>Emmely Cloud Instalado!</h2>
          <p style={{ color: "#666", fontSize: 14, marginTop: 8 }}>
            O conector WhatsApp & Instagram foi configurado com sucesso.
          </p>
          <p style={{ color: "#666", fontSize: 14 }}>
            Acesse o Contact Center para ativar os canais.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      margin: 0,
      padding: 24,
      background: "#fff",
      color: "#333",
      minHeight: "100vh",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 24,
        paddingBottom: 16,
        borderBottom: "1px solid #e5e5e5",
      }}>
        <div style={{
          width: 40, height: 40, background: "#25D366", borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white", fontWeight: "bold", fontSize: 18,
        }}>E</div>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Emmely Cloud</h2>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: 20, fontSize: 13, background: "#e8f5e9",
          }}>🟢 Conectado</span>
        </div>
      </div>

      <p style={{ fontSize: 14, color: "#666", marginBottom: 20 }}>
        A integração Emmely Cloud está ativa. As mensagens de WhatsApp e Instagram
        são encaminhadas automaticamente para o Contact Center do Bitrix24.
      </p>

      <div style={{
        background: "#f0f7ff", border: "1px solid #cce0ff", borderRadius: 8,
        padding: "12px 16px", fontSize: 13, color: "#1a5276",
      }}>
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
  textAlign: "center" as const, padding: 40, background: "white",
  borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.1)", maxWidth: 400,
};

export default Bitrix24App;
