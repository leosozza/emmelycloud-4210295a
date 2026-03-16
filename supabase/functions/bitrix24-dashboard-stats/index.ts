import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const startISO = url.searchParams.get("start") || new Date(Date.now() - 30 * 86400000).toISOString();
    const endISO = url.searchParams.get("end") || new Date().toISOString();
    const startDateOnly = startISO.split("T")[0];
    const endDateOnly = endISO.split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // All queries in parallel using service_role (bypasses RLS)
    const [
      convRes,
      msgTodayRes,
      recentConvRes,
      paidRes,
      pendingRes,
      overdueRes,
      recentFinRes,
      proposalsRes,
      profilesRes,
    ] = await Promise.all([
      // Active conversations count
      sb.from("conversations").select("id", { count: "exact", head: true }).in("status", ["aberta", "em_atendimento"]),
      // Messages today count
      sb.from("messages").select("id", { count: "exact", head: true }).gte("created_at", `${today}T00:00:00`),
      // Recent conversations
      sb.from("conversations").select("id, contact_name, channel, status, last_message_preview, last_message_at").order("last_message_at", { ascending: false, nullsFirst: false }).limit(5),
      // Paid financial records in period
      sb.from("financial_records").select("installment_value").eq("status", "paga").gte("paid_at", startISO).lte("paid_at", endISO),
      // Pending financial records in period
      sb.from("financial_records").select("installment_value").eq("status", "pendente").gte("due_date", startDateOnly).lte("due_date", endDateOnly),
      // Overdue financial records
      sb.from("financial_records").select("installment_value").eq("status", "atrasada").lte("due_date", endDateOnly),
      // Recent financial records
      sb.from("financial_records").select("id, installment_value, status, payment_method, due_date, paid_at, created_at").order("paid_at", { ascending: false, nullsFirst: true }).limit(5),
      // Proposals accepted in period
      sb.from("proposals").select("id, value, created_by, accepted_at").eq("status", "aceita" as any).gte("accepted_at", startISO).lte("accepted_at", endISO),
      // All profiles for name resolution
      sb.from("profiles").select("id, full_name"),
    ]);

    // Messages per day (last 7 days) — sequential but lightweight counts
    const messagesChart: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split("T")[0];
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);
      const nextStr = nextD.toISOString().split("T")[0];
      const { count } = await sb.from("messages").select("id", { count: "exact", head: true }).gte("created_at", `${dayStr}T00:00:00`).lt("created_at", `${nextStr}T00:00:00`);
      messagesChart.push({ day: dayStr.slice(5), count: count || 0 });
    }

    // Aggregate financials
    const paid = paidRes.data || [];
    const pending = pendingRes.data || [];
    const overdue = overdueRes.data || [];
    const ptReceived = paid.reduce((s: number, t: any) => s + Number(t.installment_value || 0), 0);
    const ptPending = pending.reduce((s: number, t: any) => s + Number(t.installment_value || 0), 0);
    const ptOverdue = overdue.reduce((s: number, t: any) => s + Number(t.installment_value || 0), 0);

    // Build ranking
    const proposals = proposalsRes.data || [];
    const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.full_name || "Sem nome"]));
    const byPerson: Record<string, { count: number; total: number }> = {};
    proposals.forEach((p: any) => {
      const key = p.created_by || "unknown";
      if (!byPerson[key]) byPerson[key] = { count: 0, total: 0 };
      byPerson[key].count++;
      byPerson[key].total += Number(p.value);
    });
    const ranking = Object.entries(byPerson)
      .map(([id, data]) => ({ name: profileMap.get(id) || "Desconhecido", ...data }))
      .sort((a, b) => b.total - a.total);

    return new Response(JSON.stringify({
      conversations: convRes.count || 0,
      messagesToday: msgTodayRes.count || 0,
      revenueReceived: ptReceived,
      revenuePending: ptPending,
      revenueOverdue: ptOverdue,
      recentConversations: recentConvRes.data || [],
      recentPayments: recentFinRes.data || [],
      messagesChart,
      paymentChart: [
        { status: "Pago", amount: ptReceived },
        { status: "Pendente", amount: ptPending },
        { status: "Atrasado", amount: ptOverdue },
      ],
      ranking,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[bitrix24-dashboard-stats] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
