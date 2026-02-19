import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BitrixFieldInfo {
  key: string;
  title: string;
  type: string;
  isRequired: boolean;
  isReadOnly: boolean;
  isMultiple: boolean;
  items?: { ID: string; VALUE: string }[];
}

// In-memory cache per entity
const fieldCache: Record<string, { fields: BitrixFieldInfo[]; ts: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useBitrixFields(entity: "lead" | "deal" | "spa", spaEntityTypeId?: string) {
  const [fields, setFields] = useState<BitrixFieldInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = entity === "spa" ? `spa_${spaEntityTypeId || "0"}` : entity;
  const cacheKeyRef = useRef(cacheKey);

  const fetchFields = useCallback(async (force = false) => {
    // Check cache
    if (!force && fieldCache[cacheKey] && Date.now() - fieldCache[cacheKey].ts < CACHE_TTL) {
      setFields(fieldCache[cacheKey].fields);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params: Record<string, string> = { entity };
      if (entity === "spa" && spaEntityTypeId) {
        params.spaEntityTypeId = spaEntityTypeId;
      }

      const { data, error: fnError } = await supabase.functions.invoke("bitrix24-fields", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        body: null,
      });

      // supabase.functions.invoke doesn't pass query params, so use the response
      // and if it fails, fall back to direct fetch
      if (fnError) {
        throw new Error(fnError.message || String(fnError));
      }

      // The invoke without query params returns default (lead) entity
      // For specific entity, do a direct fetch with query params
      const queryStr = new URLSearchParams(params).toString();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const session = (await supabase.auth.getSession()).data.session;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/bitrix24-fields?${queryStr}`,
        {
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${session?.access_token || supabaseKey}`,
          },
        }
      );

      const result = await response.json();

      if (result.error && result.fields?.length === 0) {
        setError(result.error);
        setFields([]);
      } else {
        const f = result.fields || [];
        fieldCache[cacheKey] = { fields: f, ts: Date.now() };
        setFields(f);
      }
    } catch (e) {
      setError(String(e));
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, [entity, spaEntityTypeId, cacheKey]);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  return { fields, loading, error, refetch: () => fetchFields(true) };
}
