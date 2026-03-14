import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CommissionRule {
  id: string;
  role: string;
  legal_area: string | null;
  percentage: number;
  min_value: number;
  max_value: number | null;
  is_active: boolean;
  created_at: string;
}

export interface CommissionEntry {
  id: string;
  profile_id: string;
  transaction_id: string | null;
  proposal_id: string | null;
  rule_id: string | null;
  base_amount: number;
  percentage: number;
  commission_amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  profiles?: { full_name: string | null };
}

export function useCommissionRules() {
  return useQuery({
    queryKey: ["commission-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CommissionRule[];
    },
  });
}

export function useCommissionEntries(startDate: string, endDate: string, profileFilter?: string) {
  return useQuery({
    queryKey: ["commission-entries", startDate, endDate, profileFilter],
    queryFn: async () => {
      let query = supabase
        .from("commission_entries")
        .select("*, profiles(full_name)")
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .order("created_at", { ascending: false });

      if (profileFilter && profileFilter !== "all") {
        query = query.eq("profile_id", profileFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CommissionEntry[];
    },
  });
}

export function useSaveCommissionRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<CommissionRule> & { id?: string }) => {
      if (rule.id) {
        const { error } = await supabase.from("commission_rules").update({
          role: rule.role as any,
          legal_area: rule.legal_area as any,
          percentage: rule.percentage,
          min_value: rule.min_value,
          max_value: rule.max_value,
          is_active: rule.is_active,
          updated_at: new Date().toISOString(),
        }).eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("commission_rules").insert({
          role: rule.role as any,
          legal_area: rule.legal_area as any,
          percentage: rule.percentage!,
          min_value: rule.min_value || 0,
          max_value: rule.max_value,
          is_active: rule.is_active ?? true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commission-rules"] });
      toast.success("Regra de comissão guardada");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateCommissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, paid_at }: { id: string; status: string; paid_at?: string }) => {
      const update: Record<string, any> = { status };
      if (paid_at) update.paid_at = paid_at;
      const { error } = await supabase.from("commission_entries").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commission-entries"] });
      toast.success("Comissão atualizada");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
