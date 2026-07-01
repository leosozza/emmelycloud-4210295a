import { useState, useEffect, useCallback } from "react";

export interface BitrixStage {
  id: string;
  name: string;
  sort?: number;
}

export interface BitrixPipeline {
  id: string;
  name: string;
}

const stageCache: Record<string, { data: BitrixStage[]; ts: number }> = {};
const pipelineCache: Record<string, { data: BitrixPipeline[]; ts: number }> = {};
const CACHE_TTL = 5 * 60 * 1000;

function buildUrl(action: "stages" | "pipelines", params: Record<string, string | undefined>) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const qs = new URLSearchParams();
  qs.set("action", action);
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  return `${supabaseUrl}/functions/v1/bitrix24-fetch-entities?${qs.toString()}`;
}

function authHeaders() {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

export function useBitrixStages(
  entity: "lead" | "deal" | "spa",
  categoryId?: string,
  spaEntityTypeId?: string
) {
  const [stages, setStages] = useState<BitrixStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheKey = `${entity}|${categoryId || "0"}|${spaEntityTypeId || ""}`;

  const fetchStages = useCallback(async (force = false) => {
    if (!force && stageCache[cacheKey] && Date.now() - stageCache[cacheKey].ts < CACHE_TTL) {
      setStages(stageCache[cacheKey].data);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = buildUrl("stages", {
        entity,
        category_id: categoryId,
        spa_entity_type_id: spaEntityTypeId,
      });
      const res = await fetch(url, { headers: authHeaders() });
      const data = await res.json();
      if (data.error) {
        setError(String(data.error));
        setStages([]);
      } else {
        const list: BitrixStage[] = data.stages || [];
        stageCache[cacheKey] = { data: list, ts: Date.now() };
        setStages(list);
      }
    } catch (e) {
      setError(String(e));
      setStages([]);
    } finally {
      setLoading(false);
    }
  }, [entity, categoryId, spaEntityTypeId, cacheKey]);

  useEffect(() => { fetchStages(); }, [fetchStages]);

  return { stages, loading, error, refetch: () => fetchStages(true) };
}

export function useBitrixPipelines(entity: "lead" | "deal" | "spa") {
  const [pipelines, setPipelines] = useState<BitrixPipeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPipelines = useCallback(async (force = false) => {
    const cacheKey = entity;
    if (!force && pipelineCache[cacheKey] && Date.now() - pipelineCache[cacheKey].ts < CACHE_TTL) {
      setPipelines(pipelineCache[cacheKey].data);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = buildUrl("pipelines", { entity });
      const res = await fetch(url, { headers: authHeaders() });
      const data = await res.json();
      if (data.error) {
        setError(String(data.error));
        setPipelines([]);
      } else {
        const list: BitrixPipeline[] = data.pipelines || [];
        pipelineCache[cacheKey] = { data: list, ts: Date.now() };
        setPipelines(list);
      }
    } catch (e) {
      setError(String(e));
      setPipelines([]);
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => { fetchPipelines(); }, [fetchPipelines]);

  return { pipelines, loading, error, refetch: () => fetchPipelines(true) };
}
