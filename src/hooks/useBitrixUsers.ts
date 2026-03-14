import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BitrixUser {
  id: string;
  name: string;
  email: string | null;
  department: number[];
  position: string | null;
  active: boolean;
  avatarUrl: string | null;
}

export function useBitrixUsers() {
  return useQuery({
    queryKey: ["bitrix24-users"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("bitrix24-fetch-users");
      if (error) throw error;
      return (data?.users || []) as BitrixUser[];
    },
    staleTime: 5 * 60 * 1000, // cache 5 min
    retry: 1,
  });
}
