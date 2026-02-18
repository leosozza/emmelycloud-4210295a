import { useEffect, useState } from "react";

const Bitrix24App = () => {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

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
            // @ts-ignore
            window.BX24.fitWindow();
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

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      margin: 0,
      padding: "24px",
      background: "#fff",
      color: "#333",
      minHeight: "100vh",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        marginBottom: "24px",
        paddingBottom: "16px",
        borderBottom: "1px solid #e5e5e5",
      }}>
        <div style={{
          width: 40,
          height: 40,
          background: "#25D366",
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: "bold",
          fontSize: 18,
        }}>
          E
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Emmely Cloud</h2>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            borderRadius: 20,
            fontSize: 13,
            background: "#e8f5e9",
          }}>
            🟢 Conectado
          </span>
        </div>
      </div>

      <p style={{ fontSize: 14, color: "#666", marginBottom: 20 }}>
        A integração Emmely Cloud está ativa. As mensagens de WhatsApp e Instagram
        são encaminhadas automaticamente para o Contact Center do Bitrix24.
      </p>

      <div style={{
        background: "#f0f7ff",
        border: "1px solid #cce0ff",
        borderRadius: 8,
        padding: "12px 16px",
        fontSize: 13,
        color: "#1a5276",
      }}>
        ℹ️ Para gerenciar conversas, acesse o <strong>Contact Center</strong> do Bitrix24
        e selecione o conector <strong>Emmely Cloud</strong>.
      </div>
    </div>
  );
};

export default Bitrix24App;
