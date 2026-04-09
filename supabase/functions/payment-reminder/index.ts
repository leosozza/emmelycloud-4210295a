import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Late Fee Calculation (mirrors src/lib/lateFeeCalc.ts) ───────────────────

interface LateFeeConfig {
  penalty_pct: number;
  interest_monthly_pct: number;
  max_interest_days: number;
  grace_days: number;
}

const DEFAULT_LATE_FEE_CONFIG: LateFeeConfig = {
  penalty_pct: 10,
  interest_monthly_pct: 1,
  max_interest_days: 365,
  grace_days: 0,
};

function calculateLateFees(amount: number, daysLate: number, config: LateFeeConfig) {
  const effectiveDays = Math.max(0, daysLate - config.grace_days);
  const cappedDays = Math.min(effectiveDays, config.max_interest_days);
  if (cappedDays <= 0) {
    return { daysLate: 0, penalty: 0, interest: 0, charges: 0, total: amount };
  }
  const penalty = Math.round(amount * (config.penalty_pct / 100) * 100) / 100;
  const interest = Math.round(amount * (config.interest_monthly_pct / 100) * (cappedDays / 30) * 100) / 100;
  const charges = penalty + interest;
  return {
    daysLate: cappedDays,
    penalty,
    interest,
    charges,
    total: Math.round((amount + charges) * 100) / 100,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "pt-PT", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function detectCurrency(clientCountry?: string | null): string {
  if (!clientCountry) return "EUR";
  const lower = (clientCountry || "").toLowerCase().trim();
  if (lower === "brasil" || lower === "brazil" || lower === "br") return "BRL";
  return "EUR";
}

// ─── Fetch late fees config ──────────────────────────────────────────────────

async function getLateFeeConfig(supabase: any): Promise<LateFeeConfig> {
  try {
    const { data } = await supabase
      .from("payment_gateway_config")
      .select("config")
      .eq("gateway", "late_fees")
      .eq("is_active", true)
      .maybeSingle();
    if (data?.config) {
      const c = data.config as any;
      return {
        penalty_pct: c.penalty_pct ?? DEFAULT_LATE_FEE_CONFIG.penalty_pct,
        interest_monthly_pct: c.interest_monthly_pct ?? DEFAULT_LATE_FEE_CONFIG.interest_monthly_pct,
        max_interest_days: c.max_interest_days ?? DEFAULT_LATE_FEE_CONFIG.max_interest_days,
        grace_days: c.grace_days ?? DEFAULT_LATE_FEE_CONFIG.grace_days,
      };
    }
  } catch (e) {
    console.error("[PAYMENT-REMINDER] Failed to load late fee config:", e);
  }
  return DEFAULT_LATE_FEE_CONFIG;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface FinancialRecord {
  id: string;
  contract_id: string;
  total_value: number;
  installment_value: number | null;
  installment_number: number | null;
  total_installments: number | null;
  due_date: string | null;
  status: string;
  description: string;
}

// ─── Process a single record ─────────────────────────────────────────────────

async function processRecord(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  record: FinancialRecord,
  lateFeeConfig: LateFeeConfig
): Promise<{ ok: boolean; reason?: string }> {
  // 1. Check if reminder already sent today for this record
  const { data: existingTx } = await supabase
    .from("payment_transactions")
    .select("id, metadata, payment_url")
    .eq("financial_record_id", record.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const lastTx = existingTx?.[0];
  const meta = (lastTx?.metadata || {}) as Record<string, any>;
  const today = new Date().toISOString().split("T")[0];

  if (meta.reminder_sent_at?.startsWith(today)) {
    return { ok: false, reason: "reminder_already_sent_today" };
  }

  // 2. Traverse: contract → proposal → case → lead → conversation
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, proposal_id, case_id")
    .eq("id", record.contract_id)
    .maybeSingle();

  if (!contract) return { ok: false, reason: "contract_not_found" };

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, case_id, client_name, client_email, client_phone, value")
    .eq("id", contract.proposal_id)
    .maybeSingle();

  const caseId = contract.case_id || proposal?.case_id;
  let conversationId: string | null = null;
  let clientName = proposal?.client_name || "Cliente";
  let clientId: string | null = null;
  let clientCountry: string | null = null;

  if (caseId) {
    const { data: caseData } = await supabase
      .from("cases")
      .select("lead_id")
      .eq("id", caseId)
      .maybeSingle();

    if (caseData?.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("conversation_id, client_id, name, country")
        .eq("id", caseData.lead_id)
        .maybeSingle();

      conversationId = lead?.conversation_id || null;
      clientId = lead?.client_id || null;
      clientCountry = lead?.country || null;
      if (!clientName || clientName === "Cliente") clientName = lead?.name || clientName;
    }
  }

  if (!conversationId) {
    return { ok: false, reason: "no_conversation_found" };
  }

  // 3. Determine currency from client country
  const currency = detectCurrency(clientCountry);

  // 4. Calculate late fees if overdue
  const baseAmount = record.installment_value || record.total_value;
  let finalAmount = baseAmount;
  let feeResult: ReturnType<typeof calculateLateFees> | null = null;

  if (record.due_date) {
    const dueDate = new Date(record.due_date + "T00:00:00Z");
    const now = new Date();
    const diffMs = now.getTime() - dueDate.getTime();
    const daysLate = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (daysLate > 0) {
      feeResult = calculateLateFees(baseAmount, daysLate, lateFeeConfig);
      finalAmount = feeResult.total;
    }
  }

  // 5. Generate payment link if no existing pending tx
  let paymentUrl = lastTx?.payment_url || null;
  let transactionId = lastTx?.id || null;

  if (!paymentUrl || lastTx?.status === "expired") {
    const paymentRes = await fetch(`${supabaseUrl}/functions/v1/payment-create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        contract_id: record.contract_id,
        client_id: clientId,
        financial_record_id: record.id,
        amount: finalAmount,
        currency,
        payment_method: "card",
        description: `Parcela ${record.installment_number || 1}/${record.total_installments || 1}${feeResult && feeResult.charges > 0 ? ` (inclui encargos)` : ""}`,
        customer_data: {
          name: clientName,
          email: proposal?.client_email || "",
        },
        due_date: record.due_date,
        installment_number: record.installment_number,
        total_installments: record.total_installments,
      }),
    });

    const paymentResult = await paymentRes.json();
    if (!paymentResult.ok) {
      console.error("[PAYMENT-REMINDER] Failed to create payment:", paymentResult.error);
      return { ok: false, reason: `payment_create_failed: ${paymentResult.error}` };
    }

    paymentUrl = paymentResult.transaction?.payment_url || null;
    transactionId = paymentResult.transaction?.id || null;
  }

  // 6. Build personalized message
  const dueStr = record.due_date ? formatDate(record.due_date) : "—";
  const installmentInfo = record.installment_number
    ? ` (parcela ${record.installment_number}/${record.total_installments})`
    : "";

  let message = `Olá ${clientName}! 👋\n\n`;
  message += `Gostaríamos de lembrar sobre o pagamento pendente${installmentInfo}:\n\n`;
  message += `💰 Valor: ${formatCurrency(baseAmount, currency)}\n`;

  // Add late fee breakdown if applicable
  if (feeResult && feeResult.charges > 0) {
    message += `⚠️ Multa: ${formatCurrency(feeResult.penalty, currency)}\n`;
    message += `📈 Juros (${feeResult.daysLate} dias): ${formatCurrency(feeResult.interest, currency)}\n`;
    message += `💵 Total com encargos: ${formatCurrency(feeResult.total, currency)}\n`;
  }

  message += `📅 Vencimento: ${dueStr}\n`;

  if (paymentUrl) {
    message += `\n🔗 Pague aqui: ${paymentUrl}\n`;
  }

  message += `\nQualquer dúvida, estamos à disposição! 😊`;

  // 7. Send message via message-send
  const sendRes = await fetch(`${supabaseUrl}/functions/v1/message-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      content: message,
    }),
  });

  const sendResult = await sendRes.json();
  if (!sendRes.ok) {
    console.error("[PAYMENT-REMINDER] Failed to send message:", sendResult);
    return { ok: false, reason: `message_send_failed: ${sendResult.error}` };
  }

  // 8. Update transaction metadata with reminder_sent_at and fee details
  if (transactionId) {
    const metaUpdate: Record<string, any> = { reminder_sent_at: new Date().toISOString() };
    if (feeResult && feeResult.charges > 0) {
      metaUpdate.late_fee = {
        penalty: feeResult.penalty,
        interest: feeResult.interest,
        charges: feeResult.charges,
        days_late: feeResult.daysLate,
        base_amount: baseAmount,
      };
    }

    await fetch(`${supabaseUrl}/functions/v1/payment-create`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        transaction_id: transactionId,
        metadata_update: metaUpdate,
      }),
    });
  }

  return { ok: true };
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Load late fee config once
    const lateFeeConfig = await getLateFeeConfig(supabase);

    const body = await req.json();
    const { mode, financial_record_id } = body;

    if (mode === "manual" && financial_record_id) {
      const { data: record, error } = await supabase
        .from("financial_records")
        .select("*")
        .eq("id", financial_record_id)
        .eq("status", "pendente")
        .maybeSingle();

      if (error || !record) {
        return new Response(
          JSON.stringify({ error: "Parcela não encontrada ou já paga" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await processRecord(supabase, supabaseUrl, serviceKey, record, lateFeeConfig);
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CRON mode: process all pending records due within 3 days or overdue
    const today = new Date();
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);

    const { data: records, error: recordsError } = await supabase
      .from("financial_records")
      .select("*")
      .eq("status", "pendente")
      .not("due_date", "is", null)
      .lte("due_date", threeDaysFromNow.toISOString().split("T")[0])
      .order("due_date", { ascending: true });

    if (recordsError) {
      console.error("[PAYMENT-REMINDER] Error fetching records:", recordsError);
      return new Response(JSON.stringify({ error: recordsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[PAYMENT-REMINDER] Found ${records?.length || 0} pending records to process`);

    const results: { id: string; ok: boolean; reason?: string }[] = [];

    for (const record of records || []) {
      try {
        const result = await processRecord(supabase, supabaseUrl, serviceKey, record, lateFeeConfig);
        results.push({ id: record.id, ...result });
      } catch (err: unknown) {
        console.error(`[PAYMENT-REMINDER] Error processing ${record.id}:`, err);
        results.push({ id: record.id, ok: false, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const skipped = results.filter((r) => !r.ok).length;

    return new Response(
      JSON.stringify({ ok: true, total: records?.length || 0, sent, skipped, details: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[PAYMENT-REMINDER] Fatal error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
