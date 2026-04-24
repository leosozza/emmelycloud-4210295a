import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  onSynced: (models: string[]) => void;
}

export function SyncOllamaModelsButton({ onSynced }: Props) {
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ollama-test-connection", {
        body: { persist: true },
      });

      if (error) throw error;

      if (!data?.ok) {
        toast({
          title: "Falha ao sincronizar",
          description: data?.error || "Servidor Ollama inacessível.",
          variant: "destructive",
        });
        return;
      }

      const models: string[] = data.models || [];
      onSynced(models);

      toast({
        title: "Modelos sincronizados",
        description:
          models.length > 0
            ? `${models.length} modelo(s) disponível(eis): ${models.join(", ")}` +
              (data.agents_updated ? ` · ${data.agents_updated} agente(s) atualizado(s)` : "")
            : "Nenhum modelo encontrado no servidor.",
      });
    } catch (e: any) {
      toast({
        title: "Erro ao sincronizar",
        description: e?.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={loading}
      className="h-8 text-xs"
    >
      <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
      Sincronizar modelos
    </Button>
  );
}
