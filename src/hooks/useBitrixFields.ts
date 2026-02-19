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
  const fetchedRef = useRef(false);

  const cacheKey = entity === "spa" ? `spa_${spaEntityTypeId || "0"}` : entity;

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
        body: null,
        headers: {},
        method: "GET",
      });

      // supabase.functions.invoke doesn't support query params well, use fetch directly
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const queryStr = new URLSearchParams(params).toString();
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/bitrix24-fields?${queryStr}`,
        {
          headers: {
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchFields();
    }
  }, [fetchFields]);

  // Re-fetch when entity changes
  useEffect(() => {
    fetchedRef.current = false;
  }, [cacheKey]);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchFields();
    }
  }, [fetchFields]);

  return { fields, loading, error, refetch: () => fetchFields(true) };
}
