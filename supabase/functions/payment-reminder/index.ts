import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

async function processRecord(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  record: FinancialRecord
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

  if (caseId) {
    const { data: caseData } = await supabase
      .from("cases")
      .select("lead_id")
      .eq("id", caseId)
      .maybeSingle();

    if (caseData?.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("conversation_id, client_id, name")
        .eq("id", caseData.lead_id)
        .maybeSingle();

      conversationId = lead?.conversation_id || null;
      clientId = lead?.client_id || null;
      if (!clientName || clientName === "Cliente") clientName = lead?.name || clientName;
    }
  }

  if (!conversationId) {
    return { ok: false, reason: "no_conversation_found" };
  }

  // 3. Generate payment link if no existing pending tx
  let paymentUrl = lastTx?.payment_url || null;
  let transactionId = lastTx?.id || null;

  if (!paymentUrl || lastTx?.status === "expired") {
    // Call payment-create to generate a new payment link
    const amount = record.installment_value || record.total_value;
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
        amount,
        currency: "EUR",
        payment_method: "card",
        description: `Parcela ${record.installment_number || 1}/${record.total_installments || 1}`,
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

  // 4. Build personalized message
  const amount = record.installment_value || record.total_value;
  const currency = "EUR";
  const dueStr = record.due_date ? formatDate(record.due_date) : "—";
  const installmentInfo = record.installment_number
    ? ` (parcela ${record.installment_number}/${record.total_installments})`
    : "";

  let message = `Olá ${clientName}! 👋\n\n`;
  message += `Gostaríamos de lembrar sobre o pagamento pendente${installmentInfo}:\n\n`;
  message += `💰 Valor: ${formatCurrency(amount, currency)}\n`;
  message += `📅 Vencimento: ${dueStr}\n`;

  if (paymentUrl) {
    message += `\n🔗 Pague aqui: ${paymentUrl}\n`;
  }

  message += `\nQualquer dúvida, estamos à disposição! 😊`;

  // 5. Send message via message-send
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

  // 6. Update transaction metadata with reminder_sent_at
  if (transactionId) {
    await fetch(`${supabaseUrl}/functions/v1/payment-create`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        transaction_id: transactionId,
        metadata_update: { reminder_sent_at: new Date().toISOString() },
      }),
    });
  }

  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { mode, financial_record_id } = body;

    if (mode === "manual" && financial_record_id) {
      // Manual mode: process a single record
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

      const result = await processRecord(supabase, supabaseUrl, serviceKey, record);
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
        const result = await processRecord(supabase, supabaseUrl, serviceKey, record);
        results.push({ id: record.id, ...result });
      } catch (err) {
        console.error(`[PAYMENT-REMINDER] Error processing ${record.id}:`, err);
        results.push({ id: record.id, ok: false, reason: err.message });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const skipped = results.filter((r) => !r.ok).length;

    return new Response(
      JSON.stringify({ ok: true, total: records?.length || 0, sent, skipped, details: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[PAYMENT-REMINDER] Fatal error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
