import { useState, useEffect, useCallback, useRef } from "react";

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

export function useBitrixFields(
  entity: "lead" | "deal" | "contact" | "spa",
  spaEntityTypeId?: string,
  memberId?: string
) {
  const [fields, setFields] = useState<BitrixFieldInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (memberId) {
        params.member_id = memberId;
      }

      const queryStr = new URLSearchParams(params).toString();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/bitrix24-fields?${queryStr}`,
        {
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
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
  }, [entity, spaEntityTypeId, cacheKey, memberId]);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  return { fields, loading, error, refetch: () => fetchFields(true) };
}
