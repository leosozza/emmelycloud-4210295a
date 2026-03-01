import { useState, useEffect } from "react";

/**
 * useBitrix24Theme
 *
 * Sincroniza o tema claro/escuro do iframe com o Bitrix24 em tempo real.
 *
 * Camada 1: postMessage do parent Bitrix24 (prioridade máxima — override em tempo real)
 * Camada 2: prefers-color-scheme do sistema operativo (fallback)
 * Camada 3: BX24 SDK bind (quando disponível — legado)
 */
export function useBitrix24Theme() {
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    // Camada 1: prefers-color-scheme — base de fallback
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMQ = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handleMQ);

    // Camada 2: postMessage do parent Bitrix24
    // O Bitrix24 envia { action: "ChangeColorScheme", scheme: "dark" | "light" }
    // O novo SDK b24jssdk envia { type: "B24Frame:theme", payload: { type: "dark" | "light" } }
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;

      const data = e.data;

      // Formato legacy BX24 SDK
      if (data.action === "ChangeColorScheme" || data.action === "themeChange") {
        const scheme = data.scheme || data.colorScheme || data.theme;
        if (scheme) setIsDark(scheme === "dark");
        return;
      }

      // Formato novo b24jssdk (B24Frame ThemeManager)
      if (data.type === "B24Frame:theme" && data.payload?.type) {
        setIsDark(data.payload.type === "dark");
        return;
      }

      // Formato alternativo que alguns portais enviam
      if (data.colorScheme) {
        setIsDark(data.colorScheme === "dark");
        return;
      }

      // Formato simples com campo "theme"
      if (data.theme === "dark" || data.theme === "light") {
        setIsDark(data.theme === "dark");
        return;
      }
    };
    window.addEventListener("message", handleMessage);

    // Camada 3: BX24 SDK bind (quando disponível — legado)
    const BX24 = (window as any).BX24;
    if (BX24?.bind) {
      try {
        BX24.bind("themeChange", (data: any) => {
          if (data?.scheme) setIsDark(data.scheme === "dark");
          else if (data?.theme) setIsDark(data.theme === "dark");
        });
      } catch {
        // SDK legado pode não suportar este evento — ignorar silenciosamente
      }
    }

    return () => {
      mq.removeEventListener("change", handleMQ);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return { isDark, scheme: isDark ? "dark" : "light" } as const;
}
