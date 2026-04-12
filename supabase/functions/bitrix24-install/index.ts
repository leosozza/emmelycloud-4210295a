import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const cspValue = [
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "script-src * 'unsafe-inline' 'unsafe-eval'",
  "style-src * 'unsafe-inline'",
  "img-src * data: blob:",
  "connect-src *",
  "frame-ancestors *",
  "font-src * data:",
].join("; ");

const htmlHeaders = {
  ...corsHeaders,
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": cspValue,
  "X-Frame-Options": "ALLOWALL",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const CONNECTOR_ID = "emmely_connector";

// --- Helpers ---

function parseBody(bodyText: string, contentType: string): Record<string, any> {
  if (!bodyText) return {};
  if (contentType.includes("application/json")) {
    return JSON.parse(bodyText);
  }
  // Parse form-urlencoded with PHP notation: auth[access_token]
  const params = new URLSearchParams(bodyText);
  const data: Record<string, any> = {};
  for (const [key, value] of params.entries()) {
    const match = key.match(/^(\w+)\[(\w+)\]$/);
    if (match) {
      if (!data[match[1]]) data[match[1]] = {};
      data[match[1]][match[2]] = value;
    } else {
      data[key] = value;
    }
  }
  return data;
}

function cleanDomain(domain: string): string {
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .toLowerCase();
}

function extractDomain(data: any, req: Request): string | null {
  // 1. client_endpoint
  if (data.auth?.client_endpoint) {
    const match = data.auth.client_endpoint.match(/https?:\/\/([^\/]+)/);
    if (match) return match[1];
  }
  // 2. auth.domain
  if (data.auth?.domain) return cleanDomain(data.auth.domain);
  // 3. DOMAIN / domain
  if (data.DOMAIN) return cleanDomain(data.DOMAIN);
  if (data.domain) return cleanDomain(data.domain);
  // 4. Referer (broader match - any domain)
  const referer = req.headers.get("referer");
  if (referer) {
    const match = referer.match(/https?:\/\/([^\/]+)/);
    if (match && !match[1].includes("supabase")) return match[1];
  }
  // 5. Origin
  const origin = req.headers.get("origin");
  if (origin && !origin.includes("supabase")) return cleanDomain(origin);
  return null;
}

async function callBitrix(
  clientEndpoint: string,
  accessToken: string,
  method: string,
  params: Record<string, any> = {}
): Promise<any> {
  const url = `${clientEndpoint}${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, auth: accessToken }),
  });
  const data = await response.json();
  if (data.error && data.error !== "CONNECTOR_ALREADY_EXISTS") {
    console.error(`[BITRIX API] ${method} error:`, data.error, data.error_description);
  }
  return data;
}

async function debugLog(
  supabase: any,
  integrationId: string | null,
  eventType: string,
  direction: string,
  payload: any,
  error?: string
) {
  try {
    await supabase.from("bitrix24_debug_logs").insert({
      integration_id: integrationId,
      event_type: eventType,
      direction,
      payload,
      error: error || null,
    });
  } catch (e) {
    console.error("[DEBUG LOG] Failed to write:", e);
  }
}

// --- Main Handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- repair_fields action: delete and recreate all UF_CRM_EMMELY_* fields ---
  const reqUrl = new URL(req.url);
  if (reqUrl.searchParams.get("action") === "repair_fields") {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    try {
      // Get integration
      const { data: integration } = await supabase
        .from("bitrix24_integrations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!integration?.client_endpoint || !integration?.access_token) {
        return new Response(JSON.stringify({ error: "No integration found" }), { status: 400, headers: jsonHeaders });
      }

      const ep = integration.client_endpoint.endsWith("/") ? integration.client_endpoint : integration.client_endpoint + "/";
      const token = integration.access_token;
      const report: any = { deleted_deal: [], deleted_lead: [], created_deal: [], created_lead: [], errors: [] };

      // 1. List and delete existing EMMELY fields for Deal
      const dealFieldsList = await callBitrix(ep, token, "crm.deal.userfield.list", { filter: {} });
      const dealFields = Array.isArray(dealFieldsList.result) ? dealFieldsList.result : [];
      for (const f of dealFields) {
        if (f.FIELD_NAME && f.FIELD_NAME.startsWith("UF_CRM_EMMELY_")) {
          const delRes = await callBitrix(ep, token, "crm.deal.userfield.delete", { id: f.ID });
          if (delRes.result) { report.deleted_deal.push(f.FIELD_NAME); }
          else { report.errors.push(`delete deal ${f.FIELD_NAME}: ${delRes.error || 'unknown'}`); }
        }
      }

      // 2. List and delete existing EMMELY fields for Lead
      const leadFieldsList = await callBitrix(ep, token, "crm.lead.userfield.list", { filter: {} });
      const leadFields = Array.isArray(leadFieldsList.result) ? leadFieldsList.result : [];
      for (const f of leadFields) {
        if (f.FIELD_NAME && f.FIELD_NAME.startsWith("UF_CRM_EMMELY_")) {
          const delRes = await callBitrix(ep, token, "crm.lead.userfield.delete", { id: f.ID });
          if (delRes.result) { report.deleted_lead.push(f.FIELD_NAME); }
          else { report.errors.push(`delete lead ${f.FIELD_NAME}: ${delRes.error || 'unknown'}`); }
        }
      }

      // 3. Recreate all fields
      const emmelyUserFields = [
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_STATUS",
          USER_TYPE_ID: "enumeration",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "STATUS DE PAGAMENTO", en: "PAYMENT STATUS" },
          LIST_COLUMN_LABEL: { br: "STATUS PAGAMENTO", en: "PAYMENT STATUS" },
          LIST_FILTER_LABEL: { br: "STATUS PAGAMENTO", en: "PAYMENT STATUS" },
          LIST: [
            { VALUE: "Pendente", SORT: 100, DEF: "Y" },
            { VALUE: "Parcial", SORT: 200 },
            { VALUE: "Pago", SORT: 300 },
            { VALUE: "Cancelado", SORT: 400 },
          ],
          SETTINGS: { DISPLAY: "LIST" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_INSTALLMENT_GROUP",
          USER_TYPE_ID: "string",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "GRUPO DE PARCELAS", en: "INSTALLMENT GROUP" },
          LIST_COLUMN_LABEL: { br: "GRUPO PARCELAS", en: "INSTALLMENT GROUP" },
          LIST_FILTER_LABEL: { br: "GRUPO PARCELAS", en: "INSTALLMENT GROUP" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_GATEWAY",
          USER_TYPE_ID: "enumeration",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "GATEWAY DE PAGAMENTO", en: "PAYMENT GATEWAY" },
          LIST_COLUMN_LABEL: { br: "GATEWAY", en: "GATEWAY" },
          LIST_FILTER_LABEL: { br: "GATEWAY", en: "GATEWAY" },
          LIST: [
            { VALUE: "Stripe Portugal", SORT: 100, DEF: "Y" },
            { VALUE: "Stripe Brasil", SORT: 200 },
            { VALUE: "Asaas", SORT: 300 },
            { VALUE: "Direto", SORT: 400 },
          ],
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_TOTAL_PAID",
          USER_TYPE_ID: "double",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "TOTAL PAGO", en: "TOTAL PAID" },
          LIST_COLUMN_LABEL: { br: "TOTAL PAGO", en: "TOTAL PAID" },
          LIST_FILTER_LABEL: { br: "TOTAL PAGO", en: "TOTAL PAID" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_URL",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "LINK DE PAGAMENTO", en: "PAYMENT LINK" },
          LIST_COLUMN_LABEL: { br: "LINK PAGAMENTO", en: "PAYMENT LINK" },
          LIST_FILTER_LABEL: { br: "LINK PAGAMENTO", en: "PAYMENT LINK" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_TOTAL_INSTALLMENTS",
          USER_TYPE_ID: "enumeration",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "Nº DE PARCELAS", en: "INSTALLMENTS" },
          LIST_COLUMN_LABEL: { br: "Nº PARCELAS", en: "INSTALLMENTS" },
          LIST_FILTER_LABEL: { br: "Nº PARCELAS", en: "INSTALLMENTS" },
          LIST: [
            { VALUE: "1 Parcela", SORT: 100, DEF: "Y" },
            { VALUE: "2 Parcelas", SORT: 200 },
            { VALUE: "3 Parcelas", SORT: 300 },
            { VALUE: "4 Parcelas", SORT: 400 },
            { VALUE: "5 Parcelas", SORT: 500 },
            { VALUE: "6 Parcelas", SORT: 600 },
            { VALUE: "7 Parcelas", SORT: 700 },
            { VALUE: "8 Parcelas", SORT: 800 },
            { VALUE: "9 Parcelas", SORT: 900 },
            { VALUE: "10 Parcelas", SORT: 1000 },
            { VALUE: "11 Parcelas", SORT: 1100 },
            { VALUE: "12 Parcelas", SORT: 1200 },
          ],
          SETTINGS: { DISPLAY: "LIST" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAID_INSTALLMENTS",
          USER_TYPE_ID: "integer",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "PARCELAS PAGAS", en: "PAID INSTALLMENTS" },
          LIST_COLUMN_LABEL: { br: "PARCELAS PAGAS", en: "PAID INSTALLMENTS" },
          LIST_FILTER_LABEL: { br: "PARCELAS PAGAS", en: "PAID INSTALLMENTS" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_INSTALLMENT_VALUE",
          USER_TYPE_ID: "double",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "VALOR DA PARCELA", en: "INSTALLMENT VALUE" },
          LIST_COLUMN_LABEL: { br: "VALOR PARCELA", en: "INSTALLMENT VALUE" },
          LIST_FILTER_LABEL: { br: "VALOR PARCELA", en: "INSTALLMENT VALUE" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_NEXT_DUE_DATE",
          USER_TYPE_ID: "date",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "PRÓXIMO VENCIMENTO", en: "NEXT DUE DATE" },
          LIST_COLUMN_LABEL: { br: "PRÓX. VENCIMENTO", en: "NEXT DUE DATE" },
          LIST_FILTER_LABEL: { br: "PRÓX. VENCIMENTO", en: "NEXT DUE DATE" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_METHOD",
          USER_TYPE_ID: "enumeration",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "MÉTODO DE PAGAMENTO", en: "PAYMENT METHOD" },
          LIST_COLUMN_LABEL: { br: "MÉTODO PAGAMENTO", en: "PAYMENT METHOD" },
          LIST_FILTER_LABEL: { br: "MÉTODO PAGAMENTO", en: "PAYMENT METHOD" },
          LIST: [
            { VALUE: "Cartão", SORT: 100, DEF: "Y" },
            { VALUE: "PIX", SORT: 200 },
            { VALUE: "Boleto", SORT: 300 },
            { VALUE: "MB Way", SORT: 400 },
            { VALUE: "Multibanco", SORT: 500 },
            { VALUE: "Débito SEPA", SORT: 600 },
            { VALUE: "Direto", SORT: 700 },
          ],
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_NOTES",
          USER_TYPE_ID: "string",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "NOTAS DE PAGAMENTO", en: "PAYMENT NOTES" },
          LIST_COLUMN_LABEL: { br: "NOTAS PAGAMENTO", en: "PAYMENT NOTES" },
          LIST_FILTER_LABEL: { br: "NOTAS PAGAMENTO", en: "PAYMENT NOTES" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_RECEIPT_URL",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "COMPROVANTE (LINK)", en: "RECEIPT LINK" },
          LIST_COLUMN_LABEL: { br: "COMPROVANTE", en: "RECEIPT" },
          LIST_FILTER_LABEL: { br: "COMPROVANTE", en: "RECEIPT" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_RECEIPT_PDF",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "COMPROVANTE (PDF)", en: "RECEIPT PDF" },
          LIST_COLUMN_LABEL: { br: "PDF COMPROVANTE", en: "RECEIPT PDF" },
          LIST_FILTER_LABEL: { br: "PDF COMPROVANTE", en: "RECEIPT PDF" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PROPOSAL_URL",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "LINK DA PROPOSTA", en: "PROPOSAL LINK" },
          LIST_COLUMN_LABEL: { br: "LINK PROPOSTA", en: "PROPOSAL LINK" },
          LIST_FILTER_LABEL: { br: "LINK PROPOSTA", en: "PROPOSAL LINK" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PROPOSAL_PDF",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "PDF DA PROPOSTA", en: "PROPOSAL PDF" },
          LIST_COLUMN_LABEL: { br: "PDF PROPOSTA", en: "PROPOSAL PDF" },
          LIST_FILTER_LABEL: { br: "PDF PROPOSTA", en: "PROPOSAL PDF" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_CONTRACT_URL",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "LINK DO CONTRATO", en: "CONTRACT LINK" },
          LIST_COLUMN_LABEL: { br: "LINK CONTRATO", en: "CONTRACT LINK" },
          LIST_FILTER_LABEL: { br: "LINK CONTRATO", en: "CONTRACT LINK" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_CONTRACT_PDF",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "PDF DO CONTRATO", en: "CONTRACT PDF" },
          LIST_COLUMN_LABEL: { br: "PDF CONTRATO", en: "CONTRACT PDF" },
          LIST_FILTER_LABEL: { br: "PDF CONTRATO", en: "CONTRACT PDF" },
        },
      ];

      const entityApis = [
        { name: "Deal", add: "crm.deal.userfield.add" },
        { name: "Lead", add: "crm.lead.userfield.add" },
      ];

      for (const entity of entityApis) {
        for (const field of emmelyUserFields) {
          const result = await callBitrix(ep, token, entity.add, { fields: field });
          const errStr = String(result.error || "") + " " + String(result.error_description || "");
          if (result.error && !errStr.includes("ALREADY") && !errStr.includes("DUPLICATE") && !errStr.includes("FIELD_NAME_DUPLICATED")) {
            report.errors.push(`create ${entity.name} ${field.FIELD_NAME}: ${result.error}`);
          } else {
            (entity.name === "Deal" ? report.created_deal : report.created_lead).push(field.FIELD_NAME);
          }
        }
      }

      // --- Re-register robots with updated template options ---
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const robotHandlerUrl = `${supabaseUrl}/functions/v1/bitrix24-robot-handler`;
      report.robots_registered = [];

      // Load proposal templates for dynamic select
      const { data: proposalTemplates } = await supabase
        .from("proposal_templates")
        .select("id, name")
        .eq("template_type", "proposta");

      const templateOptions: Record<string, string> = {};
      (proposalTemplates || []).forEach((t: any) => { templateOptions[t.id] = t.name; });
      if (Object.keys(templateOptions).length === 0) { templateOptions[""] = "(Nenhum template encontrado)"; }

      // Load contract templates for dynamic select
      const { data: contractTemplates } = await supabase
        .from("proposal_templates")
        .select("id, name")
        .eq("template_type", "contrato");

      const contractTemplateOptions: Record<string, string> = {};
      (contractTemplates || []).forEach((t: any) => { contractTemplateOptions[t.id] = t.name; });
      if (Object.keys(contractTemplateOptions).length === 0) { contractTemplateOptions[""] = "(Nenhum template de contrato encontrado)"; }

      // Load active flows for dynamic select
      const { data: activeFlows } = await supabase.from("flows").select("id, name").eq("is_active", true).order("name");
      const flowOptions: Record<string, string> = { "": "(Não executar flow)" };
      (activeFlows || []).forEach((f: any) => { flowOptions[f.id] = f.name; });

      const repairRobots = [
        {
          CODE: "emmely_send_whatsapp",
          NAME: "Emmely: Enviar WhatsApp",
          PROPERTIES: {
            phone: { Name: "Telefone", Type: "string", Required: "Y", Description: "Número de telefone com código do país" },
            message: { Name: "Mensagem", Type: "text", Required: "Y", Description: "Texto da mensagem" },
          },
          RETURN_PROPERTIES: {
            message_id: { Name: "ID da Mensagem", Type: "string" },
            status: { Name: "Status", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_send_instagram",
          NAME: "Emmely: Enviar Instagram",
          PROPERTIES: {
            instagram_user: { Name: "Utilizador Instagram", Type: "string", Required: "Y", Description: "Username ou ID do Instagram" },
            message: { Name: "Mensagem", Type: "text", Required: "Y", Description: "Texto da mensagem" },
          },
          RETURN_PROPERTIES: {
            message_id: { Name: "ID da Mensagem", Type: "string" },
            status: { Name: "Status", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_create_charge",
          NAME: "Emmely: Criar Cobrança",
          PROPERTIES: {
            amount: { Name: "Valor Total", Type: "double", Required: "Y", Description: "Valor total da cobrança" },
            currency: { Name: "Moeda", Type: "select", Required: "Y", Options: { EUR: "EUR", BRL: "BRL" }, Default: "EUR" },
            gateway: { Name: "Gateway", Type: "select", Options: { auto: "Automático", stripe_pt: "Stripe Portugal (EUR)", stripe_br: "Stripe Brasil (BRL)", asaas: "Asaas (Brasil)", direto: "Crediário Próprio" }, Default: "auto", Description: "Automático: EUR→Stripe PT, BRL→Stripe BR ou Asaas" },
            payment_method: { Name: "Método de Pagamento", Type: "select", Options: { card: "Cartão", multibanco: "Multibanco (PT)", mb_way: "MB WAY (PT)", sepa_debit: "Débito SEPA (PT)", pix: "PIX (BR)", boleto: "Boleto (BR)", link: "Link de Pagamento", direto: "Recebimento Direto" }, Default: "card" },
            customer_name: { Name: "Nome do Cliente", Type: "string" },
            customer_email: { Name: "Email do Cliente", Type: "string" },
            customer_cpf: { Name: "CPF/CNPJ", Type: "string", Description: "Obrigatório para Asaas" },
            description: { Name: "Descrição", Type: "string" },
            installments: { Name: "Número de Parcelas", Type: "int", Default: "1", Description: "Quantidade de parcelas mensais" },
            down_payment: { Name: "Valor de Entrada", Type: "double", Default: "0", Description: "Valor de entrada (opcional)" },
            first_due_date: { Name: "Data 1º Vencimento", Type: "date", Description: "Data da primeira parcela (YYYY-MM-DD)" },
            deal_id: { Name: "ID do Negócio", Type: "string", Description: "ID do Deal para vincular faturas" },
            contact_id: { Name: "ID do Contacto", Type: "string", Description: "ID do Contacto para vincular faturas" },
            company_id: { Name: "ID da Empresa", Type: "string", Description: "UUID da empresa/filial em Emmely" },
            paid_flow_id: { Name: "Flow ao Confirmar Pagamento", Type: "select", Options: flowOptions, Description: "Flow executado automaticamente quando o pagamento é confirmado." },
            overdue_flow_id: { Name: "Flow ao Atrasar Pagamento", Type: "select", Options: flowOptions, Description: "Flow executado automaticamente quando o pagamento atrasa X dias." },
            overdue_days: { Name: "Dias de Atraso para Flow", Type: "int", Default: "3", Description: "Número de dias em atraso para disparar o flow de cobrança (default: 3)." },
          },
          RETURN_PROPERTIES: {
            charge_id: { Name: "ID da Cobrança", Type: "string" },
            charge_status: { Name: "Status", Type: "string" },
            payment_url: { Name: "URL de Pagamento", Type: "string" },
            pix_code: { Name: "Código PIX", Type: "string" },
            gateway_used: { Name: "Gateway Utilizado", Type: "string" },
            invoices_created: { Name: "Faturas Criadas", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_check_payment",
          NAME: "Emmely: Verificar Pagamento",
          PROPERTIES: {
            charge_id: { Name: "ID da Cobrança", Type: "string", Required: "Y", Description: "ID retornado ao criar a cobrança" },
          },
          RETURN_PROPERTIES: {
            status: { Name: "Status", Type: "string" },
            paid_at: { Name: "Data de Pagamento", Type: "string" },
            paid_value: { Name: "Valor Pago", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_execute_flow",
          NAME: "Emmely: Executar Flow",
          PROPERTIES: {
            flow_id: { Name: "ID do Flow", Type: "string", Required: "Y", Description: "UUID do flow a executar" },
            phone: { Name: "Telefone", Type: "string", Required: "Y", Description: "Número de telefone com código do país" },
            trigger_message: { Name: "Mensagem Trigger", Type: "string", Description: "Mensagem para iniciar o flow", Default: "iniciar" },
          },
          RETURN_PROPERTIES: {
            status: { Name: "Status", Type: "string" },
            conversation_id: { Name: "ID da Conversa", Type: "string" },
            flow_name: { Name: "Nome do Flow", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_generate_proposal",
          NAME: "Emmely: Gerar Proposta",
          PROPERTIES: {
            deal_id: { Name: "ID do Negócio", Type: "string", Description: "Use {{ID}} para preencher automaticamente" },
            lead_id: { Name: "ID do Lead", Type: "string", Description: "Use {{ID}} para preencher automaticamente" },
            entity_type: { Name: "Tipo de Entidade", Type: "select", Options: { deal: "Negócio", lead: "Lead" }, Default: "deal" },
            template_name: { Name: "Modelo de Proposta", Type: "select", Options: templateOptions, Description: "Selecione o modelo de proposta." },
            product_ids: { Name: "Produtos/Serviços", Type: "string", Description: "UUIDs separados por vírgula. Se vazio, carrega do negócio." },
            title: { Name: "Título da Proposta", Type: "string" },
            service_name: { Name: "Nome do Serviço", Type: "string" },
            payment_type: { Name: "Tipo de Pagamento", Type: "select", Options: { fixo: "Fixo", exito: "Êxito", hibrido: "Híbrido", parcelado: "Parcelado" }, Default: "fixo" },
            installments: { Name: "Parcelas", Type: "int", Default: "1" },
            value: { Name: "Valor", Type: "double" },
            description: { Name: "Descrição", Type: "text" },
            conditions: { Name: "Condições", Type: "text" },
            valid_days: { Name: "Dias de Validade", Type: "int", Default: "30" },
            send_method: { Name: "Método de Envio", Type: "select", Options: { none: "Não enviar", link: "Enviar Link", pdf: "Enviar PDF", both: "Link + PDF" }, Default: "none" },
            send_to_phone: { Name: "Telefone para Envio", Type: "string" },
            accept_stage_id: { Name: "Etapa ao Aceitar", Type: "string", Description: "ID da etapa do funil para onde o deal move quando o cliente aceita a proposta (ex: C5:WON). Se vazio, não altera a etapa." },
            accept_flow_id: { Name: "Flow ao Aceitar", Type: "select", Options: flowOptions, Description: "O flow que será iniciado automaticamente quando o cliente aceitar a proposta." },
          },
          RETURN_PROPERTIES: {
            proposal_url: { Name: "URL da Proposta", Type: "string" },
            pdf_url: { Name: "URL do PDF", Type: "string" },
            proposal_id: { Name: "ID da Proposta", Type: "string" },
            template_used: { Name: "Template Utilizado", Type: "string" },
            products_used: { Name: "Produtos Utilizados", Type: "string" },
            send_status: { Name: "Status de Envio", Type: "string" },
            status: { Name: "Status", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_send_proposal",
          NAME: "Emmely: Enviar Orçamento",
          PROPERTIES: {
            proposal_id: { Name: "ID da Proposta", Type: "string", Required: "Y" },
            send_method: { Name: "Método de Envio", Type: "select", Required: "Y", Options: { link: "Link com Aceite", pdf: "PDF", both: "Link + PDF" }, Default: "link" },
            phone: { Name: "Telefone", Type: "string" },
            custom_message: { Name: "Mensagem Personalizada", Type: "text" },
          },
          RETURN_PROPERTIES: {
            send_status: { Name: "Status de Envio", Type: "string" },
            proposal_url: { Name: "URL da Proposta", Type: "string" },
            pdf_url: { Name: "URL do PDF", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_convert_currency",
          NAME: "Emmely: Converter Moeda",
          PROPERTIES: {
            source_value: { Name: "Valor Original", Type: "double", Required: "Y" },
            source_currency: { Name: "Moeda Origem", Type: "select", Required: "Y", Options: { EUR: "EUR", BRL: "BRL", USD: "USD", GBP: "GBP", CHF: "CHF", CAD: "CAD" }, Default: "EUR" },
            target_currency: { Name: "Moeda Destino", Type: "select", Required: "Y", Options: { BRL: "BRL", EUR: "EUR", USD: "USD", GBP: "GBP", CHF: "CHF", CAD: "CAD" }, Default: "BRL" },
            spread_percent: { Name: "Spread (%)", Type: "double", Default: "0" },
          },
          RETURN_PROPERTIES: {
            converted_value: { Name: "Valor Convertido", Type: "double" },
            exchange_rate: { Name: "Taxa de Câmbio", Type: "double" },
            rate_date: { Name: "Data da Cotação", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_create_badge",
          NAME: "Emmely: Criar Badge",
          PROPERTIES: {
            badge_code: { Name: "Código da Badge", Type: "string", Required: "Y" },
            header_title: { Name: "Título", Type: "string", Required: "Y" },
            message_preview: { Name: "Preview", Type: "string" },
            entity_type: { Name: "Tipo de Entidade", Type: "select", Options: { deal: "Negócio", lead: "Lead", contact: "Contacto" }, Default: "deal" },
            entity_id: { Name: "ID da Entidade", Type: "string", Required: "Y" },
            badge_type: { Name: "Tipo Visual", Type: "select", Options: { success: "Sucesso (verde)", primary: "Primário (azul)", warning: "Alerta (amarelo)", failure: "Erro (vermelho)", secondary: "Secundário (cinza)" }, Default: "success" },
          },
          RETURN_PROPERTIES: {
            badge_status: { Name: "Status", Type: "string" },
            activity_id: { Name: "ID da Atividade", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_generate_contract",
          NAME: "Emmely: Gerar Contrato",
          PROPERTIES: {
            proposal_id: { Name: "ID da Proposta", Type: "string", Description: "Use o retorno {{proposal_id}} do robot 'Gerar Proposta'. Se vazio, cria contrato novo." },
            deal_id: { Name: "ID do Negócio", Type: "string", Description: "Use {{ID}} para vincular ao negócio" },
            entity_type: { Name: "Tipo de Entidade", Type: "select", Options: { deal: "Negócio", lead: "Lead" }, Default: "deal" },
            template_name: { Name: "Modelo de Contrato", Type: "select", Options: contractTemplateOptions, Description: "Selecione o modelo de contrato." },
            title: { Name: "Título do Contrato", Type: "string" },
            value: { Name: "Valor", Type: "double" },
            conditions: { Name: "Condições", Type: "text" },
            starts_at: { Name: "Data de Início", Type: "date" },
            duration_months: { Name: "Duração (meses)", Type: "int", Default: "12" },
            send_method: { Name: "Método de Envio", Type: "select", Options: { none: "Não enviar", link: "Enviar Link de Assinatura", pdf: "Enviar PDF", both: "Link + PDF" }, Default: "none" },
            send_to_phone: { Name: "Telefone para Envio", Type: "string" },
            accept_flow_id: { Name: "Flow ao Aceitar", Type: "select", Options: flowOptions, Description: "O flow que será iniciado automaticamente quando o cliente aceitar/assinar o contrato." },
            signed_flow_id: { Name: "Flow ao Assinar", Type: "select", Options: flowOptions, Description: "Flow executado automaticamente quando o cliente assina o contrato digitalmente." },
            send_payment_after_sign: { Name: "Enviar Cobrança Após Assinatura", Type: "select", Options: { "Y": "Sim — enviar link de pagamento automaticamente", "N": "Não" }, Default: "N", Description: "Se 'Sim', o link de pagamento será enviado automaticamente via WhatsApp após o cliente assinar o contrato." },
            payment_method: { Name: "Método de Pagamento (cobrança automática)", Type: "select", Options: { card: "Cartão", multibanco: "Multibanco", mb_way: "MB Way", pix: "Pix", boleto: "Boleto" }, Default: "card" },
            payment_installments: { Name: "Número de Parcelas", Type: "int", Default: "1" },
          },
          RETURN_PROPERTIES: {
            contract_url: { Name: "URL de Assinatura", Type: "string" },
            contract_pdf: { Name: "URL do PDF", Type: "string" },
            contract_id: { Name: "ID do Contrato", Type: "string" },
            status: { Name: "Status", Type: "string" },
            send_status: { Name: "Status de Envio", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
      ];

      for (const robot of repairRobots) {
        await callBitrix(ep, token, "bizproc.robot.delete", { CODE: robot.CODE });
        const addResult = await callBitrix(ep, token, "bizproc.robot.add", {
          CODE: robot.CODE,
          HANDLER: robotHandlerUrl,
          AUTH_USER_ID: 1,
          NAME: robot.NAME,
          USE_SUBSCRIPTION: "Y",
          PROPERTIES: robot.PROPERTIES,
          RETURN_PROPERTIES: robot.RETURN_PROPERTIES,
        });
        const errStr = String(addResult.error || "");
        if (addResult.error && !errStr.includes("ALREADY")) {
          report.errors.push(`robot ${robot.CODE}: ${addResult.error}`);
        } else {
          report.robots_registered.push(robot.CODE);
        }
      }

      await debugLog(supabase, integration.id, "repair_fields_and_robots", "outbound", report);
      return new Response(JSON.stringify({ ok: true, report }), { headers: jsonHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: jsonHeaders });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  try {
    const contentType = req.headers.get("content-type") || "";
    const bodyText = await req.text();
    const data = parseBody(bodyText, contentType);

    console.log("[INSTALL] Received payload:", JSON.stringify(data).substring(0, 500));
    console.log("[INSTALL] Referer:", req.headers.get("referer"), "Origin:", req.headers.get("origin"));
    const auth = data.auth || {};
    // Bitrix24 sends flat uppercase keys (AUTH_ID, REFRESH_ID) or nested auth object
    const memberId = auth.member_id || data.member_id;
    const accessToken = auth.access_token || data.AUTH_ID;
    const refreshToken = auth.refresh_token || data.REFRESH_ID;
    const applicationToken = auth.application_token || data.application_token || data.APP_TOKEN;
    const domain = extractDomain(data, req);
    const expiresIn = parseInt(auth.expires_in || data.AUTH_EXPIRES || "3600");

    // For flat keys, build client_endpoint from SERVER_ENDPOINT or domain
    // Bitrix24 local apps use SERVER_ENDPOINT for REST calls
    const serverEndpoint = data.SERVER_ENDPOINT;

    if (!memberId || !accessToken) {
      await debugLog(supabase, null, "install_error", "inbound", data, "Missing member_id or access_token");
      return new Response(
        JSON.stringify({ error: "Missing member_id or access_token" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Build client_endpoint - priority: auth.client_endpoint > domain-based
    // NOTE: SERVER_ENDPOINT (oauth.bitrix.info) is the OAuth server, NOT the portal REST API
    let clientEndpoint = auth.client_endpoint;
    if (!clientEndpoint && domain) {
      clientEndpoint = `https://${domain}/rest/`;
    }
    if (!clientEndpoint) {
      await debugLog(supabase, null, "install_error", "inbound", data, "Cannot determine client_endpoint");
      return new Response(
        JSON.stringify({ error: "Cannot determine client_endpoint" }),
        { status: 400, headers: jsonHeaders }
      );
    }
    // Ensure trailing slash
    if (!clientEndpoint.endsWith("/")) clientEndpoint += "/";

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Upsert integration
    const { data: integration, error: upsertError } = await supabase
      .from("bitrix24_integrations")
      .upsert(
        {
          member_id: memberId,
          domain: domain || "",
          client_endpoint: clientEndpoint,
          access_token: accessToken,
          refresh_token: refreshToken || "",
          expires_at: expiresAt,
          application_token: applicationToken || "",
          config: {
            installed_at: new Date().toISOString(),
            auth_payload: auth,
          },
        },
        { onConflict: "member_id" }
      )
      .select("id")
      .single();

    if (upsertError) {
      console.error("[INSTALL] Upsert error:", upsertError);
      await debugLog(supabase, null, "install_upsert_error", "inbound", data, upsertError.message);
      return new Response(JSON.stringify({ error: "DB error" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const integrationId = integration.id;
    await debugLog(supabase, integrationId, "install_success", "inbound", { memberId, domain });

    // --- Install summary tracker ---
    const installSummary: any = {
      connector_registered: false,
      bot_id: null,
      robots_registered: [],
      placements_registered: [],
      badges_registered: [],
      userfields_registered: [],
      paysystem_handler_registered: false,
      installed_modules: [],
      available_scopes: [],
      missing_scopes: [],
    };

    // --- Verify scopes via app.info ---
    try {
      const appInfo = await callBitrix(clientEndpoint, accessToken, "app.info", {});
      const scopeList = appInfo.result?.SCOPE || appInfo.result?.scope || [];
      installSummary.available_scopes = scopeList;
      const requiredScopes = ["crm", "imopenlines", "imconnector", "im", "imbot", "event", "user", "bizproc", "pay_system", "placement"];
      installSummary.missing_scopes = requiredScopes.filter(function(s) { return scopeList.indexOf(s) === -1; });
      if (installSummary.missing_scopes.length > 0) {
        console.warn("[INSTALL] Missing scopes:", installSummary.missing_scopes.join(", "));
      } else {
        console.log("[INSTALL] All required scopes available");
      }
      await debugLog(supabase, integrationId, "scope_check", "outbound", {
        available: scopeList,
        missing: installSummary.missing_scopes,
      });
    } catch (scopeErr) {
      console.error("[INSTALL] Scope check failed (continuing):", scopeErr);
    }

    // --- Register Connector ---
    try {
      // 1. Register connector
      const regResult = await callBitrix(clientEndpoint, accessToken, "imconnector.register", {
        ID: CONNECTOR_ID,
        NAME: "Emmely Messages",
        ICON: {
          DATA_IMAGE: "data:image/svg+xml;base64," + btoa('<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#2067b0"/><text x="24" y="31" font-size="22" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial">E</text></svg>'),
          COLOR: { BACKGROUND: "#2067b0", BORDER: "#1a5690" },
          SIZE: { WIDTH: 48, HEIGHT: 48 },
          POSITION: { TOP: 0, LEFT: 0 },
        },
        ICON_DISABLED: {
          DATA_IMAGE: "data:image/svg+xml;base64," + btoa('<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#999"/><text x="24" y="31" font-size="22" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial">E</text></svg>'),
          COLOR: { BACKGROUND: "#999", BORDER: "#666" },
          SIZE: { WIDTH: 48, HEIGHT: 48 },
          POSITION: { TOP: 0, LEFT: 0 },
        },
        PLACEMENT_HANDLER: `${supabaseUrl}/functions/v1/bitrix24-connector-settings`,
      });

      console.log("[INSTALL] Register connector result:", JSON.stringify(regResult));

      const connectorRegistered = !regResult.error || regResult.error === "CONNECTOR_ALREADY_EXISTS";
      installSummary.connector_registered = connectorRegistered;
      if (connectorRegistered) installSummary.installed_modules.push("connector");

      // 2. Do NOT auto-activate on lines — user must manually enable in Contact Center
      const connectorActive = false;

      // 3. Bind events (connector + bot + uninstall)
      const eventsUrl = `${supabaseUrl}/functions/v1/bitrix24-events`;
      const events = [
        "OnImConnectorMessageAdd",
        "OnImConnectorDialogStart",
        "OnImConnectorDialogFinish",
        "OnImConnectorStatusDelete",
        "OnImbotMessageAdd",       // eventos do IM Bot
        "OnImbotWelcomeMessage",   // boas-vindas do IM Bot
        "OnImbotJoinOpen",         // bot adicionado a open line
        "OnImbotJoinChat",         // bot adicionado via Open Lines (Contact Center)
        "OnAppUninstall",          // limpeza de campos na desinstalação
      ];

      for (const event of events) {
        const bindResult = await callBitrix(clientEndpoint, accessToken, "event.bind", {
          event,
          handler: eventsUrl,
        });
        // "Handler already binded" is NOT an error - check both error and error_description
        const errStr = String(bindResult.error || "") + " " + String(bindResult.error_description || "");
        if (bindResult.error && !errStr.toLowerCase().includes("already")) {
          console.error(`[INSTALL] Bind ${event} failed:`, bindResult.error, bindResult.error_description);
        } else {
          console.log(`[INSTALL] Bind ${event}: OK (or already bound)`);
        }
      }

      // Update integration status
      await supabase
        .from("bitrix24_integrations")
        .update({
          connector_registered: connectorRegistered,
          connector_active: connectorActive,
        })
        .eq("id", integrationId);

      await debugLog(supabase, integrationId, "connector_setup", "outbound", {
        registered: connectorRegistered,
        active: connectorActive,
        eventsBound: events.length,
      });

      // Register IM Bot for Contact Center chatbot
      try {
        const eventsUrl = `${supabaseUrl}/functions/v1/bitrix24-events`;

        // 1. List existing bots and unregister old ones
        // NOTE: imbot.bot.list returns an OBJECT with numeric keys, NOT an array
        const botListResult = await callBitrix(clientEndpoint, accessToken, "imbot.bot.list", {});
        console.log("[INSTALL] imbot.bot.list result:", JSON.stringify(botListResult).substring(0, 500));

        // Convert object ({"3": {...}, "10265": {...}}) or array to array of bots
        const botsRaw = botListResult.result || {};
        const botsArray: any[] = Array.isArray(botsRaw)
          ? botsRaw
          : Object.values(botsRaw);

        for (const bot of botsArray) {
          if (bot.CODE === "emmely_ai_bot" || (bot.NAME && bot.NAME.toLowerCase().includes("emmely"))) {
            console.log(`[INSTALL] Unregistering existing bot ID ${bot.ID} (${bot.NAME})`);
            const unregRes = await callBitrix(clientEndpoint, accessToken, "imbot.unregister", { BOT_ID: bot.ID });
            console.log(`[INSTALL] Unregister bot ${bot.ID} result:`, JSON.stringify(unregRes).substring(0, 200));
          }
        }

        // 2. Register fresh bot
        // TYPE: "B" + OPENLINE: "Y" (root level) = hybrid mode — appears in Contact Center Open Lines chatbot selector
        const botResult = await callBitrix(clientEndpoint, accessToken, "imbot.register", {
          CODE: "emmely_ai_bot",
          TYPE: "B",
          OPENLINE: "Y",              // RAIZ — obrigatório para aparecer no selector de chatbot das Open Lines
          EVENT_MESSAGE_ADD: eventsUrl,
          EVENT_WELCOME_MESSAGE: eventsUrl,
          EVENT_JOIN_CHAT: eventsUrl,  // OBRIGATÓRIO para Open Lines chatbot selector
          EVENT_BOT_DELETE: eventsUrl,
          PROPERTIES: {
            NAME: "Emmely AI",
            WORK_POSITION: "Assistente Virtual IA",
            COLOR: "GREEN",           // Nome de cor válido (não hex)
          },
        });

        const botErr = String(botResult.error || "") + " " + String(botResult.error_description || "");
        let finalBotId: string | null = null;

        if (botResult.result) {
          finalBotId = String(botResult.result);
          console.log("[INSTALL] Bot Emmely AI registered OK, ID:", finalBotId);
        } else if (botErr.includes("ALREADY")) {
          // Already registered — try to get its ID from list
          // NOTE: imbot.bot.list returns an OBJECT with numeric keys, NOT an array
          const listAgain = await callBitrix(clientEndpoint, accessToken, "imbot.bot.list", {});
          const listRaw = listAgain.result || {};
          const listArray: any[] = Array.isArray(listRaw) ? listRaw : Object.values(listRaw);
          const existing = listArray.find((b: any) => b.CODE === "emmely_ai_bot");
          if (existing) finalBotId = String(existing.ID);
          console.log("[INSTALL] Bot already exists, ID:", finalBotId);
        } else {
          console.error("[INSTALL] Bot registration failed:", botResult.error, botResult.error_description);
          // Fallback: register without EVENT_WELCOME_MESSAGE
          const botResult2 = await callBitrix(clientEndpoint, accessToken, "imbot.register", {
            CODE: "emmely_ai_bot",
            TYPE: "B",
            OPENLINE: "Y",            // RAIZ — obrigatório para Open Lines
            EVENT_MESSAGE_ADD: eventsUrl,
            EVENT_WELCOME_MESSAGE: eventsUrl,
            EVENT_JOIN_CHAT: eventsUrl,
            EVENT_BOT_DELETE: eventsUrl,
            PROPERTIES: {
              NAME: "Emmely AI",
              WORK_POSITION: "Assistente Virtual IA",
              COLOR: "GREEN",
            },
          });
          if (botResult2.result) {
            finalBotId = String(botResult2.result);
            console.log("[INSTALL] Bot registered (fallback, no welcome event), ID:", finalBotId);
          } else {
            console.error("[INSTALL] Fallback bot registration also failed:", botResult2.error);
          }
        }

        if (finalBotId) {
          // IMPORTANTE: bitrix_agent_id é UUID — NÃO podemos guardar o bot_id numérico lá.
          // Guardamos o bot_id APENAS no campo config (JSONB aceita qualquer valor).
          // Fazemos merge com o config existente para não perder auth_payload, etc.
          const { data: currentIntData } = await supabase
            .from("bitrix24_integrations")
            .select("config")
            .eq("id", integrationId)
            .single();

          const existingConfig = (currentIntData?.config as any) || {};

          await supabase
            .from("bitrix24_integrations")
            .update({
              config: {
                ...existingConfig,            // preservar installed_at, auth_payload, etc.
                bot_id: finalBotId,           // string numérica ex: "10265"
                bot_registered_at: new Date().toISOString(),
              },
            })
            .eq("id", integrationId);

          console.log("[INSTALL] bot_id saved in config:", finalBotId);
          installSummary.bot_id = finalBotId;
          installSummary.installed_modules.push("bot");
        }

        await debugLog(supabase, integrationId, "bot_registered", "outbound", { botResult, finalBotId });
      } catch (botError) {
        console.error("[INSTALL] Bot registration error:", botError);
        await debugLog(supabase, integrationId, "bot_register_error", "outbound", null, String(botError));
      }

      // --- Create default AI agent if none exists ---
      try {
        const { count } = await supabase
          .from("ai_agents")
          .select("id", { count: "exact", head: true });

        if (count === 0) {
          const { error: agentErr } = await supabase.from("ai_agents").insert({
            name: "Emmely AI",
            description: "Assistente virtual padrão criado automaticamente na instalação.",
            is_default: true,
            is_active: true,
            ai_provider: "lovable",
            ai_model: "google/gemini-3-flash-preview",
            agent_type: "text",
            temperature: 0.7,
            system_prompt: "Você é a Emmely, uma assistente virtual inteligente e simpática. Responda de forma clara, objetiva e profissional. Ajude os utilizadores com as suas questões da melhor forma possível.",
            fallback_message: "Desculpe, não consegui processar a sua mensagem. Tente novamente.",
            welcome_message: "Olá! Sou a Emmely, a sua assistente virtual. Como posso ajudar?",
          });

          if (agentErr) {
            console.error("[INSTALL] Default agent creation error:", agentErr);
          } else {
            console.log("[INSTALL] Default agent 'Emmely AI' created successfully");
          }
          await debugLog(supabase, integrationId, "default_agent_created", "outbound", { error: agentErr?.message || null });
        } else {
          console.log("[INSTALL] Agents already exist, skipping default creation");
        }
      } catch (agentSetupError) {
        console.error("[INSTALL] Agent setup error:", agentSetupError);
      }
    } catch (connectorError) {
      console.error("[INSTALL] Connector setup error:", connectorError);
      await debugLog(supabase, integrationId, "connector_setup_error", "outbound", null, String(connectorError));
    }

    // --- Register Configurable Activity Badges ---
    try {
      const badges = [
        { code: "emmely_bot_replied", title: "Emmely AI", value: "Bot respondeu", type: "success" },
        { code: "emmely_msg_sent", title: "Mensagem Enviada", value: "Enviada", type: "primary" },
        { code: "emmely_msg_delivered", title: "Entregue", value: "Entregue", type: "success" },
        { code: "emmely_msg_failed", title: "Erro de Envio", value: "Falhou", type: "failure" },
        { code: "emmely_human_takeover", title: "Atendimento Humano", value: "Humano", type: "warning" },
        { code: "emmely_payment_created", title: "Cobrança Criada", value: "Cobrança", type: "primary" },
        { code: "emmely_payment_confirmed", title: "Pagamento Confirmado", value: "Pago", type: "success" },
        { code: "emmely_contract_signed", title: "Contrato Assinado", value: "Assinado", type: "success" },
        { code: "emmely_payment_failed", title: "Pagamento Falhado", value: "Falhou", type: "failure" },
        { code: "emmely_payment_refunded", title: "Reembolso", value: "Reembolsado", type: "warning" },
        { code: "emmely_deal_payment_updated", title: "Parcelas Atualizadas", value: "Atualizado", type: "primary" },
        { code: "emmely_baixa_imported", title: "Baixa Importada", value: "Importado", type: "primary" },
      ];

      for (const badge of badges) {
        const badgeResult = await callBitrix(clientEndpoint, accessToken, "crm.activity.badge.add", badge);
        const badgeErr = String(badgeResult.error || "");
        if (badgeResult.error && !badgeErr.includes("ALREADY") && !badgeErr.includes("DUPLICATE")) {
          console.error(`[INSTALL] Badge ${badge.code} registration failed:`, badgeResult.error, badgeResult.error_description);
        } else {
          console.log(`[INSTALL] Badge ${badge.code}: registered OK`);
          installSummary.badges_registered.push(badge.code);
        }
      }

      installSummary.installed_modules.push("badges");

      await debugLog(supabase, integrationId, "badges_registered", "outbound", {
        badges: badges.map(b => b.code),
      });
    } catch (badgeError) {
      console.error("[INSTALL] Badge registration error:", badgeError);
      await debugLog(supabase, integrationId, "badges_error", "outbound", null, String(badgeError));
    }

    // --- Create Custom User Fields (Deal + Lead) ---
    try {
      const emmelyUserFields = [
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_STATUS",
          USER_TYPE_ID: "enumeration",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "STATUS DE PAGAMENTO", en: "PAYMENT STATUS" },
          LIST_COLUMN_LABEL: { br: "STATUS PAGAMENTO", en: "PAYMENT STATUS" },
          LIST_FILTER_LABEL: { br: "STATUS PAGAMENTO", en: "PAYMENT STATUS" },
          LIST: [
            { VALUE: "Pendente", SORT: 100, DEF: "Y" },
            { VALUE: "Parcial", SORT: 200 },
            { VALUE: "Pago", SORT: 300 },
            { VALUE: "Cancelado", SORT: 400 },
          ],
          SETTINGS: { DISPLAY: "LIST" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_INSTALLMENT_GROUP",
          USER_TYPE_ID: "string",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "GRUPO DE PARCELAS", en: "INSTALLMENT GROUP" },
          LIST_COLUMN_LABEL: { br: "GRUPO PARCELAS", en: "INSTALLMENT GROUP" },
          LIST_FILTER_LABEL: { br: "GRUPO PARCELAS", en: "INSTALLMENT GROUP" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_GATEWAY",
          USER_TYPE_ID: "enumeration",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "GATEWAY DE PAGAMENTO", en: "PAYMENT GATEWAY" },
          LIST_COLUMN_LABEL: { br: "GATEWAY", en: "GATEWAY" },
          LIST_FILTER_LABEL: { br: "GATEWAY", en: "GATEWAY" },
          LIST: [
            { VALUE: "Stripe Portugal", SORT: 100, DEF: "Y" },
            { VALUE: "Stripe Brasil", SORT: 200 },
            { VALUE: "Asaas", SORT: 300 },
            { VALUE: "Direto", SORT: 400 },
          ],
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_TOTAL_PAID",
          USER_TYPE_ID: "double",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "TOTAL PAGO", en: "TOTAL PAID" },
          LIST_COLUMN_LABEL: { br: "TOTAL PAGO", en: "TOTAL PAID" },
          LIST_FILTER_LABEL: { br: "TOTAL PAGO", en: "TOTAL PAID" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_URL",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "LINK DE PAGAMENTO", en: "PAYMENT LINK" },
          LIST_COLUMN_LABEL: { br: "LINK PAGAMENTO", en: "PAYMENT LINK" },
          LIST_FILTER_LABEL: { br: "LINK PAGAMENTO", en: "PAYMENT LINK" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_TOTAL_INSTALLMENTS",
          USER_TYPE_ID: "enumeration",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "Nº DE PARCELAS", en: "INSTALLMENTS" },
          LIST_COLUMN_LABEL: { br: "Nº PARCELAS", en: "INSTALLMENTS" },
          LIST_FILTER_LABEL: { br: "Nº PARCELAS", en: "INSTALLMENTS" },
          LIST: [
            { VALUE: "1 Parcela", SORT: 100, DEF: "Y" },
            { VALUE: "2 Parcelas", SORT: 200 },
            { VALUE: "3 Parcelas", SORT: 300 },
            { VALUE: "4 Parcelas", SORT: 400 },
            { VALUE: "5 Parcelas", SORT: 500 },
            { VALUE: "6 Parcelas", SORT: 600 },
            { VALUE: "7 Parcelas", SORT: 700 },
            { VALUE: "8 Parcelas", SORT: 800 },
            { VALUE: "9 Parcelas", SORT: 900 },
            { VALUE: "10 Parcelas", SORT: 1000 },
            { VALUE: "11 Parcelas", SORT: 1100 },
            { VALUE: "12 Parcelas", SORT: 1200 },
          ],
          SETTINGS: { DISPLAY: "LIST" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAID_INSTALLMENTS",
          USER_TYPE_ID: "integer",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "PARCELAS PAGAS", en: "PAID INSTALLMENTS" },
          LIST_COLUMN_LABEL: { br: "PARCELAS PAGAS", en: "PAID INSTALLMENTS" },
          LIST_FILTER_LABEL: { br: "PARCELAS PAGAS", en: "PAID INSTALLMENTS" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_INSTALLMENT_VALUE",
          USER_TYPE_ID: "double",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "VALOR DA PARCELA", en: "INSTALLMENT VALUE" },
          LIST_COLUMN_LABEL: { br: "VALOR PARCELA", en: "INSTALLMENT VALUE" },
          LIST_FILTER_LABEL: { br: "VALOR PARCELA", en: "INSTALLMENT VALUE" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_NEXT_DUE_DATE",
          USER_TYPE_ID: "date",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "PRÓXIMO VENCIMENTO", en: "NEXT DUE DATE" },
          LIST_COLUMN_LABEL: { br: "PRÓX. VENCIMENTO", en: "NEXT DUE DATE" },
          LIST_FILTER_LABEL: { br: "PRÓX. VENCIMENTO", en: "NEXT DUE DATE" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_METHOD",
          USER_TYPE_ID: "enumeration",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "MÉTODO DE PAGAMENTO", en: "PAYMENT METHOD" },
          LIST_COLUMN_LABEL: { br: "MÉTODO PAGAMENTO", en: "PAYMENT METHOD" },
          LIST_FILTER_LABEL: { br: "MÉTODO PAGAMENTO", en: "PAYMENT METHOD" },
          LIST: [
            { VALUE: "Cartão", SORT: 100, DEF: "Y" },
            { VALUE: "PIX", SORT: 200 },
            { VALUE: "Boleto", SORT: 300 },
            { VALUE: "MB Way", SORT: 400 },
            { VALUE: "Multibanco", SORT: 500 },
            { VALUE: "Débito SEPA", SORT: 600 },
            { VALUE: "Direto", SORT: 700 },
          ],
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PAYMENT_NOTES",
          USER_TYPE_ID: "string",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "NOTAS DE PAGAMENTO", en: "PAYMENT NOTES" },
          LIST_COLUMN_LABEL: { br: "NOTAS PAGAMENTO", en: "PAYMENT NOTES" },
          LIST_FILTER_LABEL: { br: "NOTAS PAGAMENTO", en: "PAYMENT NOTES" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_RECEIPT_URL",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "COMPROVANTE (LINK)", en: "RECEIPT LINK" },
          LIST_COLUMN_LABEL: { br: "COMPROVANTE", en: "RECEIPT" },
          LIST_FILTER_LABEL: { br: "COMPROVANTE", en: "RECEIPT" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_RECEIPT_PDF",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "COMPROVANTE (PDF)", en: "RECEIPT PDF" },
          LIST_COLUMN_LABEL: { br: "PDF COMPROVANTE", en: "RECEIPT PDF" },
          LIST_FILTER_LABEL: { br: "PDF COMPROVANTE", en: "RECEIPT PDF" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PROPOSAL_URL",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "LINK DA PROPOSTA", en: "PROPOSAL LINK" },
          LIST_COLUMN_LABEL: { br: "LINK PROPOSTA", en: "PROPOSAL LINK" },
          LIST_FILTER_LABEL: { br: "LINK PROPOSTA", en: "PROPOSAL LINK" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_PROPOSAL_PDF",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "PDF DA PROPOSTA", en: "PROPOSAL PDF" },
          LIST_COLUMN_LABEL: { br: "PDF PROPOSTA", en: "PROPOSAL PDF" },
          LIST_FILTER_LABEL: { br: "PDF PROPOSTA", en: "PROPOSAL PDF" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_CONTRACT_URL",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "LINK DO CONTRATO", en: "CONTRACT LINK" },
          LIST_COLUMN_LABEL: { br: "LINK CONTRATO", en: "CONTRACT LINK" },
          LIST_FILTER_LABEL: { br: "LINK CONTRATO", en: "CONTRACT LINK" },
        },
        {
          FIELD_NAME: "UF_CRM_EMMELY_CONTRACT_PDF",
          USER_TYPE_ID: "url",
          SORT: 0,
          EDIT_FORM_LABEL: { br: "PDF DO CONTRATO", en: "CONTRACT PDF" },
          LIST_COLUMN_LABEL: { br: "PDF CONTRATO", en: "CONTRACT PDF" },
          LIST_FILTER_LABEL: { br: "PDF CONTRATO", en: "CONTRACT PDF" },
        },
      ];
      const deleteApis = [
        { name: "Deal", listMethod: "crm.deal.userfield.list", deleteMethod: "crm.deal.userfield.delete" },
        { name: "Lead", listMethod: "crm.lead.userfield.list", deleteMethod: "crm.lead.userfield.delete" },
      ];

      for (const api of deleteApis) {
        try {
          const existingFields = await callBitrix(clientEndpoint, accessToken, api.listMethod, {});
          const emmelyFields = (existingFields.result || []).filter(
            (f: any) => f.FIELD_NAME && f.FIELD_NAME.startsWith("UF_CRM_EMMELY_")
          );
          for (const f of emmelyFields) {
            await callBitrix(clientEndpoint, accessToken, api.deleteMethod, { id: f.ID });
            console.log(`[INSTALL] Deleted ${api.name} field ${f.FIELD_NAME} (ID: ${f.ID})`);
          }
          if (emmelyFields.length > 0) {
            console.log(`[INSTALL] Cleaned ${emmelyFields.length} existing ${api.name} EMMELY fields`);
          }
        } catch (delErr) {
          console.error(`[INSTALL] Error cleaning ${api.name} fields:`, delErr);
        }
      }

      // Step 2: Create fields for both Deal and Lead entities
      const entityApis = [
        { name: "Deal", method: "crm.deal.userfield.add" },
        { name: "Lead", method: "crm.lead.userfield.add" },
      ];

      for (const entity of entityApis) {
        for (const field of emmelyUserFields) {
          const result = await callBitrix(clientEndpoint, accessToken, entity.method, { fields: field });
          if (result.error) {
            console.error(`[INSTALL] ${entity.name} UserField ${field.FIELD_NAME} failed:`, result.error, result.error_description);
          } else {
            console.log(`[INSTALL] ${entity.name} UserField ${field.FIELD_NAME}: Created (ID: ${result.result})`);
            installSummary.userfields_registered.push(`${entity.name}:${field.FIELD_NAME}`);
          }
        }
      }

      if (installSummary.userfields_registered.length > 0) {
        installSummary.installed_modules.push("userfields");
      }

      await debugLog(supabase, integrationId, "userfields_registered", "outbound", {
        fields: installSummary.userfields_registered,
      });

      // --- Auto-seed field mappings for Deal entity ---
      try {
        const fieldMappingSeed = [
          { bitrix_field_key: "UF_CRM_EMMELY_PAYMENT_STATUS", bitrix_field_title: "Status de Pagamento", supabase_table: "payment_transactions", supabase_column: "status" },
          { bitrix_field_key: "UF_CRM_EMMELY_INSTALLMENT_GROUP", bitrix_field_title: "Grupo de Parcelas", supabase_table: "payment_transactions", supabase_column: "gateway_payment_id" },
          { bitrix_field_key: "UF_CRM_EMMELY_GATEWAY", bitrix_field_title: "Gateway de Pagamento", supabase_table: "payment_transactions", supabase_column: "gateway" },
          { bitrix_field_key: "UF_CRM_EMMELY_TOTAL_PAID", bitrix_field_title: "Total Pago", supabase_table: "payment_transactions", supabase_column: "amount" },
          { bitrix_field_key: "UF_CRM_EMMELY_PAYMENT_URL", bitrix_field_title: "Link de Pagamento", supabase_table: "payment_transactions", supabase_column: "payment_url" },
          { bitrix_field_key: "UF_CRM_EMMELY_TOTAL_INSTALLMENTS", bitrix_field_title: "Nº de Parcelas", supabase_table: "financial_records", supabase_column: "total_installments" },
          { bitrix_field_key: "UF_CRM_EMMELY_PAID_INSTALLMENTS", bitrix_field_title: "Parcelas Pagas", supabase_table: "financial_records", supabase_column: "installment_number" },
          { bitrix_field_key: "UF_CRM_EMMELY_INSTALLMENT_VALUE", bitrix_field_title: "Valor da Parcela", supabase_table: "financial_records", supabase_column: "installment_value" },
          { bitrix_field_key: "UF_CRM_EMMELY_NEXT_DUE_DATE", bitrix_field_title: "Próximo Vencimento", supabase_table: "financial_records", supabase_column: "due_date" },
          { bitrix_field_key: "UF_CRM_EMMELY_PAYMENT_METHOD", bitrix_field_title: "Método de Pagamento", supabase_table: "payment_transactions", supabase_column: "payment_method" },
          { bitrix_field_key: "UF_CRM_EMMELY_PAYMENT_NOTES", bitrix_field_title: "Notas de Pagamento", supabase_table: "financial_records", supabase_column: "description" },
          { bitrix_field_key: "UF_CRM_EMMELY_RECEIPT_URL", bitrix_field_title: "Comprovante (Link)", supabase_table: "receipt_links", supabase_column: "public_url" },
          { bitrix_field_key: "UF_CRM_EMMELY_RECEIPT_PDF", bitrix_field_title: "Comprovante (PDF)", supabase_table: "receipt_links", supabase_column: "pdf_url" },
          { bitrix_field_key: "UF_CRM_EMMELY_PROPOSAL_URL", bitrix_field_title: "Link da Proposta", supabase_table: "proposals", supabase_column: "accept_token" },
          { bitrix_field_key: "UF_CRM_EMMELY_PROPOSAL_PDF", bitrix_field_title: "PDF da Proposta", supabase_table: "proposals", supabase_column: "pdf_url" },
          { bitrix_field_key: "UF_CRM_EMMELY_CONTRACT_URL", bitrix_field_title: "Link do Contrato", supabase_table: "proposals", supabase_column: "sign_token" },
          { bitrix_field_key: "UF_CRM_EMMELY_CONTRACT_PDF", bitrix_field_title: "PDF do Contrato", supabase_table: "proposals", supabase_column: "file_url" },
        ];

        // Delete existing mappings for this integration
        await supabase
          .from("bitrix24_field_mappings")
          .delete()
          .eq("integration_id", integrationId)
          .eq("bitrix_entity", "deal");

        const mappingsToInsert = fieldMappingSeed.map((m) => ({
          integration_id: integrationId,
          bitrix_entity: "deal",
          bitrix_field_key: m.bitrix_field_key,
          bitrix_field_title: m.bitrix_field_title,
          supabase_table: m.supabase_table,
          supabase_column: m.supabase_column,
          sync_direction: "both",
          is_active: true,
        }));

        const { error: mapError } = await supabase
          .from("bitrix24_field_mappings")
          .insert(mappingsToInsert);

        if (mapError) {
          console.error("[INSTALL] Field mapping seed error:", mapError);
        } else {
          console.log(`[INSTALL] Seeded ${mappingsToInsert.length} field mappings for deal`);
        }
      } catch (seedErr) {
        console.error("[INSTALL] Field mapping seed error:", seedErr);
      }
    } catch (ufError) {
      console.error("[INSTALL] UserField creation error:", ufError);
      await debugLog(supabase, integrationId, "userfields_error", "outbound", null, String(ufError));
    }

    // --- Register BizProc Robots ---
    try {
      const robotHandlerUrl = `${supabaseUrl}/functions/v1/bitrix24-robot-handler`;

      // Load proposal templates for dynamic select in robot
      const { data: proposalTemplates } = await supabase
        .from("proposal_templates")
        .select("id, name")
        .eq("template_type", "proposta");

      const templateOptions: Record<string, string> = {};
      (proposalTemplates || []).forEach((t: any) => {
        templateOptions[t.id] = t.name;
      });
      // Add a fallback option if no templates exist
      if (Object.keys(templateOptions).length === 0) {
        templateOptions[""] = "(Nenhum template encontrado)";
      }

      // Load contract templates for dynamic select in robot
      const { data: contractTemplates } = await supabase
        .from("proposal_templates")
        .select("id, name")
        .eq("template_type", "contrato");

      const contractTemplateOptions: Record<string, string> = {};
      (contractTemplates || []).forEach((t: any) => {
        contractTemplateOptions[t.id] = t.name;
      });
      if (Object.keys(contractTemplateOptions).length === 0) {
        contractTemplateOptions[""] = "(Nenhum template de contrato encontrado)";
      }

      // Load active flows for dynamic select
      const { data: activeFlows } = await supabase.from("flows").select("id, name").eq("is_active", true).order("name");
      const flowOptions: Record<string, string> = { "": "(Não executar flow)" };
      (activeFlows || []).forEach((f: any) => { flowOptions[f.id] = f.name; });

      const robots = [
        {
          CODE: "emmely_send_whatsapp",
          NAME: "Emmely: Enviar WhatsApp",
          PROPERTIES: {
            phone: { Name: "Telefone", Type: "string", Required: "Y", Description: "Número de telefone com código do país" },
            message: { Name: "Mensagem", Type: "text", Required: "Y", Description: "Texto da mensagem" },
          },
          RETURN_PROPERTIES: {
            message_id: { Name: "ID da Mensagem", Type: "string" },
            status: { Name: "Status", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_send_instagram",
          NAME: "Emmely: Enviar Instagram",
          PROPERTIES: {
            instagram_user: { Name: "Utilizador Instagram", Type: "string", Required: "Y", Description: "Username ou ID do Instagram" },
            message: { Name: "Mensagem", Type: "text", Required: "Y", Description: "Texto da mensagem" },
          },
          RETURN_PROPERTIES: {
            message_id: { Name: "ID da Mensagem", Type: "string" },
            status: { Name: "Status", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_create_charge",
          NAME: "Emmely: Criar Cobrança",
          PROPERTIES: {
            amount: { Name: "Valor Total", Type: "double", Required: "Y", Description: "Valor total da cobrança" },
            currency: { Name: "Moeda", Type: "select", Required: "Y", Options: { EUR: "EUR", BRL: "BRL" }, Default: "EUR" },
            gateway: { 
              Name: "Gateway", 
              Type: "select", 
              Options: { 
                auto: "Automático", 
                stripe_pt: "Stripe Portugal (EUR)", 
                stripe_br: "Stripe Brasil (BRL)", 
                asaas: "Asaas (Brasil)", 
                direto: "Crediário Próprio" 
              }, 
              Default: "auto", 
              Description: "Automático: EUR→Stripe PT, BRL→Stripe BR ou Asaas" 
            },
            payment_method: { 
              Name: "Método de Pagamento", 
              Type: "select", 
              Options: { 
                card: "Cartão", 
                multibanco: "Multibanco (PT)", 
                mb_way: "MB WAY (PT)", 
                sepa_debit: "Débito SEPA (PT)", 
                pix: "PIX (BR)", 
                boleto: "Boleto (BR)", 
                link: "Link de Pagamento",
                direto: "Recebimento Direto" 
              }, 
              Default: "card" 
            },
            customer_name: { Name: "Nome do Cliente", Type: "string" },
            customer_email: { Name: "Email do Cliente", Type: "string" },
            customer_cpf: { Name: "CPF/CNPJ", Type: "string", Description: "Obrigatório para Asaas" },
            description: { Name: "Descrição", Type: "string" },
            installments: { Name: "Número de Parcelas", Type: "int", Default: "1", Description: "Quantidade de parcelas mensais" },
            down_payment: { Name: "Valor de Entrada", Type: "double", Default: "0", Description: "Valor de entrada (opcional)" },
            first_due_date: { Name: "Data 1º Vencimento", Type: "date", Description: "Data da primeira parcela (YYYY-MM-DD)" },
            deal_id: { Name: "ID do Negócio", Type: "string", Description: "ID do Deal para vincular faturas" },
            contact_id: { Name: "ID do Contacto", Type: "string", Description: "ID do Contacto para vincular faturas" },
            company_id: { Name: "ID da Empresa", Type: "string", Description: "UUID da empresa/filial em Emmely" },
            paid_flow_id: { Name: "Flow ao Confirmar Pagamento", Type: "select", Options: flowOptions, Description: "Flow executado automaticamente quando o pagamento é confirmado." },
            overdue_flow_id: { Name: "Flow ao Atrasar Pagamento", Type: "select", Options: flowOptions, Description: "Flow executado automaticamente quando o pagamento atrasa X dias." },
            overdue_days: { Name: "Dias de Atraso para Flow", Type: "int", Default: "3", Description: "Número de dias em atraso para disparar o flow de cobrança (default: 3)." },
          },
          RETURN_PROPERTIES: {
            charge_id: { Name: "ID da Cobrança", Type: "string" },
            charge_status: { Name: "Status", Type: "string" },
            payment_url: { Name: "URL de Pagamento", Type: "string" },
            pix_code: { Name: "Código PIX", Type: "string" },
            gateway_used: { Name: "Gateway Utilizado", Type: "string" },
            invoices_created: { Name: "Faturas Criadas", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_check_payment",
          NAME: "Emmely: Verificar Pagamento",
          PROPERTIES: {
            charge_id: { Name: "ID da Cobrança", Type: "string", Required: "Y", Description: "ID retornado ao criar a cobrança" },
          },
          RETURN_PROPERTIES: {
            status: { Name: "Status", Type: "string" },
            paid_at: { Name: "Data de Pagamento", Type: "string" },
            paid_value: { Name: "Valor Pago", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_execute_flow",
          NAME: "Emmely: Executar Flow",
          PROPERTIES: {
            flow_id: { Name: "ID do Flow", Type: "string", Required: "Y", Description: "UUID do flow a executar" },
            phone: { Name: "Telefone", Type: "string", Required: "Y", Description: "Número de telefone com código do país" },
            trigger_message: { Name: "Mensagem Trigger", Type: "string", Description: "Mensagem para iniciar o flow", Default: "iniciar" },
          },
          RETURN_PROPERTIES: {
            status: { Name: "Status", Type: "string" },
            conversation_id: { Name: "ID da Conversa", Type: "string" },
            flow_name: { Name: "Nome do Flow", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_generate_proposal",
          NAME: "Emmely: Gerar Proposta",
          DESCRIPTION: {
            br: "Gera uma proposta/orçamento automaticamente.\n\n📋 CONFIGURAÇÃO OBRIGATÓRIA:\n• entity_type: Escolha 'Negócio' ou 'Lead'\n• deal_id: Use {{ID}} para negócios ou leave vazio para leads\n• lead_id: Use {{ID}} para leads ou deixe vazio para negócios\n• template_name: Nome EXATO do modelo criado em Propostas > Modelos (ex: 'Ação Judicial', 'Nacionalidade')\n\n💰 VALOR (hierarquia de prioridade):\n1. Campo 'Valor' preenchido manualmente\n2. Soma dos Produtos/Serviços informados\n3. Valor definido no Template\n4. Valor do serviço pelo 'Nome do Serviço'\n5. OPPORTUNITY do negócio no Bitrix24\n\n📤 ENVIO AUTOMÁTICO:\n• send_method: 'Não enviar' = apenas gera | 'Enviar Link' = envia link de aceite por WhatsApp | 'Enviar PDF' = envia PDF | 'Link + PDF' = ambos\n• send_to_phone: Número com código do país (ex: 351912345678). Se vazio, usa o telefone do contacto do deal.\n\n🔄 RETORNOS disponíveis para usar em etapas seguintes:\n• proposal_id — usar no robot 'Enviar Orçamento'\n• proposal_url — link de aceite público\n• pdf_url — link direto do PDF\n• template_used / products_used — para log",
            en: "Generates a proposal/quote automatically. Set entity_type + deal_id or lead_id. Use template_name with the exact template name from Proposals > Templates. Value hierarchy: manual > products > template > service > OPPORTUNITY. send_method controls WhatsApp delivery."
          },
          PROPERTIES: {
            deal_id: { Name: "ID do Negócio", Type: "string", Description: "Use {{ID}} para preencher automaticamente com o ID do negócio atual" },
            lead_id: { Name: "ID do Lead", Type: "string", Description: "Use {{ID}} para preencher automaticamente com o ID do lead atual" },
            entity_type: { Name: "Tipo de Entidade", Type: "select", Options: { deal: "Negócio", lead: "Lead" }, Default: "deal", Description: "Escolha 'Negócio' se o robot está numa automação de Deals, ou 'Lead' se está em Leads" },
            template_name: { Name: "Modelo de Proposta", Type: "select", Options: templateOptions, Description: "Selecione o modelo de proposta. Os templates são carregados automaticamente de Propostas > Modelos." },
            product_ids: { Name: "Produtos/Serviços", Type: "string", Description: "UUIDs dos serviços separados por vírgula. Se vazio, carrega automaticamente os produtos do negócio no Bitrix24." },
            title: { Name: "Título da Proposta", Type: "string", Description: "Título personalizado. Se vazio, usa o nome do template ou o título do negócio." },
            service_name: { Name: "Nome do Serviço", Type: "string", Description: "Nome do serviço na tabela de Serviços (busca valor e descrição automaticamente). Modo legado — prefira usar template_name." },
            payment_type: { Name: "Tipo de Pagamento", Type: "select", Options: { fixo: "Fixo", exito: "Êxito", hibrido: "Híbrido", parcelado: "Parcelado" }, Default: "fixo", Description: "Fixo = valor único | Êxito = % sobre resultado | Híbrido = entrada + êxito | Parcelado = dividido em parcelas" },
            installments: { Name: "Parcelas", Type: "int", Default: "1", Description: "Número de parcelas. Apenas relevante se payment_type = parcelado." },
            value: { Name: "Valor", Type: "double", Description: "Valor manual em euros. Se preenchido, tem prioridade sobre todas as outras fontes de valor." },
            description: { Name: "Descrição", Type: "text", Description: "Descrição detalhada da proposta. Se vazio, usa a descrição do template." },
            conditions: { Name: "Condições", Type: "text", Description: "Condições adicionais (ex: prazo de entrega, exclusões). Se vazio, usa as condições do template." },
            valid_days: { Name: "Dias de Validade", Type: "int", Default: "30", Description: "Quantos dias a proposta fica válida. Após expirar, o cliente não poderá aceitar." },
            send_method: { Name: "Método de Envio", Type: "select", Options: { none: "Não enviar", link: "Enviar Link", pdf: "Enviar PDF", both: "Link + PDF" }, Default: "none", Description: "none = apenas gera a proposta | link = envia link de aceite via WhatsApp | pdf = envia PDF via WhatsApp | both = envia ambos" },
            send_to_phone: { Name: "Telefone para Envio", Type: "string", Description: "Número WhatsApp com código do país (ex: 351912345678). Se vazio, usa o telefone do contacto vinculado ao deal." },
            accept_stage_id: { Name: "Etapa ao Aceitar", Type: "string", Description: "ID da etapa do funil para onde o deal move quando o cliente aceita a proposta (ex: C5:WON, C5:PREPARATION). Se vazio, não altera a etapa no Bitrix24." },
            accept_flow_id: { Name: "Flow ao Aceitar", Type: "select", Options: flowOptions, Description: "O flow que será iniciado automaticamente quando o cliente aceitar a proposta." },
          },
          RETURN_PROPERTIES: {
            proposal_url: { Name: "URL da Proposta", Type: "string" },
            pdf_url: { Name: "URL do PDF", Type: "string" },
            proposal_id: { Name: "ID da Proposta", Type: "string" },
            template_used: { Name: "Template Utilizado", Type: "string" },
            products_used: { Name: "Produtos Utilizados", Type: "string" },
            send_status: { Name: "Status de Envio", Type: "string" },
            status: { Name: "Status", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_send_proposal",
          NAME: "Emmely: Enviar Orçamento",
          DESCRIPTION: {
            br: "Envia uma proposta já gerada ao cliente via WhatsApp.\n\n📋 CONFIGURAÇÃO:\n• proposal_id: Use o retorno {{proposal_id}} do robot 'Gerar Proposta' na etapa anterior\n• send_method: 'Link com Aceite' = página de aceite online | 'PDF' = documento PDF | 'Link + PDF' = ambos\n• phone: Número com código do país. Se vazio, usa o telefone do cliente na proposta.\n• custom_message: Texto opcional antes do link/PDF (ex: 'Olá, segue a sua proposta')\n\n💡 DICA: Adicione este robot APÓS o 'Gerar Proposta' e use os retornos da etapa anterior para preencher o proposal_id.",
            en: "Sends a previously generated proposal to the client via WhatsApp. Use proposal_id from the 'Generate Proposal' robot return values."
          },
          PROPERTIES: {
            proposal_id: { Name: "ID da Proposta", Type: "string", Required: "Y", Description: "⚠️ OBRIGATÓRIO — Use o retorno {{proposal_id}} do robot 'Emmely: Gerar Proposta' da etapa anterior" },
            send_method: { Name: "Método de Envio", Type: "select", Required: "Y", Options: { link: "Link com Aceite", pdf: "PDF", both: "Link + PDF" }, Default: "link", Description: "link = página de aceite online | pdf = documento PDF | both = envia os dois" },
            phone: { Name: "Telefone", Type: "string", Description: "Número WhatsApp com código do país (ex: 351912345678). Se vazio, usa o telefone do cliente cadastrado na proposta." },
            custom_message: { Name: "Mensagem Personalizada", Type: "text", Description: "Texto opcional enviado ANTES do link/PDF (ex: 'Olá Sr. João, segue a proposta conforme combinado')" },
          },
          RETURN_PROPERTIES: {
            send_status: { Name: "Status de Envio", Type: "string" },
            proposal_url: { Name: "URL da Proposta", Type: "string" },
            pdf_url: { Name: "URL do PDF", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_convert_currency",
          NAME: "Emmely: Converter Moeda",
          PROPERTIES: {
            source_value: { Name: "Valor Original", Type: "double", Required: "Y", Description: "Campo com o valor a converter" },
            source_currency: { Name: "Moeda Origem", Type: "select", Required: "Y", Options: { EUR: "EUR", BRL: "BRL", USD: "USD", GBP: "GBP", CHF: "CHF", CAD: "CAD" }, Default: "EUR" },
            target_currency: { Name: "Moeda Destino", Type: "select", Required: "Y", Options: { BRL: "BRL", EUR: "EUR", USD: "USD", GBP: "GBP", CHF: "CHF", CAD: "CAD" }, Default: "BRL" },
            spread_percent: { Name: "Spread (%)", Type: "double", Default: "0", Description: "Margem adicional sobre a cotação (ex: 2 = +2%)" },
          },
          RETURN_PROPERTIES: {
            converted_value: { Name: "Valor Convertido", Type: "double" },
            exchange_rate: { Name: "Taxa de Câmbio", Type: "double" },
            rate_date: { Name: "Data da Cotação", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_create_badge",
          NAME: "Emmely: Criar Badge",
          PROPERTIES: {
            badge_code: { Name: "Código da Badge", Type: "string", Required: "Y", Description: "Código da badge (ex: emmely_payment_confirmed ou custom)" },
            header_title: { Name: "Título", Type: "string", Required: "Y", Description: "Título exibido na timeline" },
            message_preview: { Name: "Preview", Type: "string", Description: "Texto de preview na timeline" },
            entity_type: { Name: "Tipo de Entidade", Type: "select", Options: { deal: "Negócio", lead: "Lead", contact: "Contacto" }, Default: "deal" },
            entity_id: { Name: "ID da Entidade", Type: "string", Required: "Y", Description: "ID do deal/lead/contact" },
            badge_type: { Name: "Tipo Visual", Type: "select", Options: { success: "Sucesso (verde)", primary: "Primário (azul)", warning: "Alerta (amarelo)", failure: "Erro (vermelho)", secondary: "Secundário (cinza)" }, Default: "success" },
          },
          RETURN_PROPERTIES: {
            badge_status: { Name: "Status", Type: "string" },
            activity_id: { Name: "ID da Atividade", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
        {
          CODE: "emmely_generate_contract",
          NAME: "Emmely: Gerar Contrato",
          DESCRIPTION: {
            br: "Gera um contrato a partir de uma proposta aceite ou directamente.\n\n📋 CONFIGURAÇÃO:\n• proposal_id: Use o retorno {{proposal_id}} do robot 'Gerar Proposta' OU deixe vazio para criar um contrato novo\n• template_name: Selecione o modelo de contrato (templates do tipo 'contrato')\n• deal_id: Use {{ID}} para vincular ao negócio\n\n📤 ENVIO:\n• send_method: Enviar link de assinatura ou PDF via WhatsApp\n\n🔄 RETORNOS:\n• contract_url — link de assinatura digital\n• contract_pdf — PDF do contrato\n• contract_id — ID interno",
            en: "Generates a contract from an accepted proposal or directly. Can send the signing link via WhatsApp."
          },
          PROPERTIES: {
            proposal_id: { Name: "ID da Proposta", Type: "string", Description: "Use o retorno {{proposal_id}} do robot 'Gerar Proposta'. Se vazio, cria contrato novo com os dados do template." },
            deal_id: { Name: "ID do Negócio", Type: "string", Description: "Use {{ID}} para vincular ao negócio actual" },
            entity_type: { Name: "Tipo de Entidade", Type: "select", Options: { deal: "Negócio", lead: "Lead" }, Default: "deal" },
            template_name: { Name: "Modelo de Contrato", Type: "select", Options: contractTemplateOptions, Description: "Selecione o modelo de contrato. Usado quando não há proposal_id ou para substituir o template da proposta." },
            starts_at: { Name: "Data de Início", Type: "date", Description: "Data de início do contrato (YYYY-MM-DD). Se vazio, usa a data actual." },
            duration_months: { Name: "Duração (meses)", Type: "int", Default: "12", Description: "Duração do contrato em meses a partir da data de início." },
            send_method: { Name: "Método de Envio", Type: "select", Options: { none: "Não enviar", link: "Enviar Link de Assinatura", pdf: "Enviar PDF", both: "Link + PDF" }, Default: "none", Description: "none = apenas gera | link = envia link de assinatura digital via WhatsApp | pdf = envia PDF | both = ambos" },
            send_to_phone: { Name: "Telefone para Envio", Type: "string", Description: "Número WhatsApp com código do país. Se vazio, usa o telefone do cliente da proposta." },
            accept_flow_id: { Name: "Flow ao Aceitar", Type: "select", Options: flowOptions, Description: "O flow que será iniciado automaticamente quando o cliente aceitar/assinar o contrato." },
            signed_flow_id: { Name: "Flow ao Assinar", Type: "select", Options: flowOptions, Description: "Flow executado automaticamente quando o cliente assina o contrato digitalmente." },
            send_payment_after_sign: { Name: "Enviar Cobrança Após Assinatura", Type: "select", Options: { "Y": "Sim — enviar link de pagamento automaticamente", "N": "Não" }, Default: "N", Description: "Se 'Sim', o link de pagamento será enviado automaticamente via WhatsApp após o cliente assinar o contrato." },
            payment_method: { Name: "Método de Pagamento (cobrança automática)", Type: "select", Options: { card: "Cartão", multibanco: "Multibanco", mb_way: "MB Way", pix: "Pix", boleto: "Boleto" }, Default: "card" },
            payment_installments: { Name: "Número de Parcelas", Type: "int", Default: "1" },
          },
          RETURN_PROPERTIES: {
            contract_url: { Name: "URL de Assinatura", Type: "string" },
            contract_pdf: { Name: "URL do PDF", Type: "string" },
            contract_id: { Name: "ID do Contrato", Type: "string" },
            status: { Name: "Status", Type: "string" },
            send_status: { Name: "Status de Envio", Type: "string" },
            error: { Name: "Erro", Type: "string" },
          },
        },
      ];
      for (const robot of robots) {
        // Delete existing robot first (safe for reinstall)
        await callBitrix(clientEndpoint, accessToken, "bizproc.robot.delete", { CODE: robot.CODE });

        // Register robot
        const addResult = await callBitrix(clientEndpoint, accessToken, "bizproc.robot.add", {
          CODE: robot.CODE,
          HANDLER: robotHandlerUrl,
          AUTH_USER_ID: 1,
          NAME: robot.NAME,
          USE_SUBSCRIPTION: "Y",
          PROPERTIES: robot.PROPERTIES,
          RETURN_PROPERTIES: robot.RETURN_PROPERTIES,
        });

        const errStr = String(addResult.error || "");
        if (addResult.error && !errStr.includes("ALREADY")) {
          console.error(`[INSTALL] Robot ${robot.CODE} registration failed:`, addResult.error, addResult.error_description);
        } else {
          console.log(`[INSTALL] Robot ${robot.CODE}: registered OK`);
          installSummary.robots_registered.push(robot.CODE);
        }
      }

      installSummary.installed_modules.push("robots");

      await debugLog(supabase, integrationId, "robots_setup", "outbound", {
        robotsRegistered: robots.map(r => r.CODE),
      });
    } catch (robotError) {
      console.error("[INSTALL] Robot setup error:", robotError);
      await debugLog(supabase, integrationId, "robots_setup_error", "outbound", null, String(robotError));
    }

    // --- Register IM_TEXTAREA placement (Devolver ao Bot button) ---
    try {
      const returnToBotUrl = `${supabaseUrl}/functions/v1/bitrix24-return-to-bot`;

      // Unbind first to avoid duplicates
      await callBitrix(clientEndpoint, accessToken, "placement.unbind", {
        PLACEMENT: "IM_TEXTAREA",
        HANDLER: returnToBotUrl,
      });

      const placementResult = await callBitrix(clientEndpoint, accessToken, "placement.bind", {
        PLACEMENT: "IM_TEXTAREA",
        HANDLER: returnToBotUrl,
        TITLE: "Devolver ao Bot",
        DESCRIPTION: "Devolver conversa ao assistente IA",
        LANG_ALL: {
          pt: { TITLE: "Devolver ao Bot", DESCRIPTION: "Devolver conversa ao assistente IA" },
          en: { TITLE: "Return to Bot", DESCRIPTION: "Return conversation to AI assistant" },
          es: { TITLE: "Devolver al Bot", DESCRIPTION: "Devolver conversación al asistente IA" },
          ru: { TITLE: "Вернуть боту", DESCRIPTION: "Вернуть разговор ИИ-ассистенту" },
        },
        OPTIONS: {
          iconName: "fa-robot",   // OBRIGATÓRIO — Font Awesome icon name
          context: "LINES",       // apenas em Open Lines
          color: "GREEN",
          role: "USER",
          width: "400",
          height: "200",
          extranet: "N",
        },
      });

      const plErr = placementResult.error || "";
      if (plErr && !String(plErr).toLowerCase().includes("already")) {
        console.error("[INSTALL] placement.bind IM_TEXTAREA error:", plErr, placementResult.error_description);
      } else {
        console.log("[INSTALL] placement.bind IM_TEXTAREA: OK");
        installSummary.placements_registered.push("IM_TEXTAREA");
      }

      await debugLog(supabase, integrationId, "placement_bind", "outbound", { result: placementResult });
    } catch (placementError) {
      console.error("[INSTALL] placement.bind error:", placementError);
      await debugLog(supabase, integrationId, "placement_bind_error", "outbound", null, String(placementError));
    }

    // --- Register IM_SIDEBAR placement (Emmely AI Assistant sidebar in messenger) ---
    try {
      const imSidebarUrl = `${supabaseUrl}/functions/v1/bitrix24-im-sidebar`;

      await callBitrix(clientEndpoint, accessToken, "placement.unbind", {
        PLACEMENT: "IM_SIDEBAR",
        HANDLER: imSidebarUrl,
      });

      const sidebarResult = await callBitrix(clientEndpoint, accessToken, "placement.bind", {
        PLACEMENT: "IM_SIDEBAR",
        HANDLER: imSidebarUrl,
        TITLE: "Emmely AI Assistant",
        DESCRIPTION: "Consultar a IA antes de responder ao cliente",
        LANG_ALL: {
          pt: { TITLE: "Emmely AI Assistant", DESCRIPTION: "Consultar a IA antes de responder" },
          en: { TITLE: "Emmely AI Assistant", DESCRIPTION: "Consult AI before replying" },
          es: { TITLE: "Emmely AI Assistant", DESCRIPTION: "Consultar la IA antes de responder" },
          ru: { TITLE: "Emmely AI Assistant", DESCRIPTION: "Консультация ИИ перед ответом" },
        },
        OPTIONS: {
          iconName: "fa-robot",
          context: "ALL",
          role: "USER",
          extranet: "N",
        },
      });

      const sidebarErr = sidebarResult.error || "";
      if (sidebarErr && !String(sidebarErr).toLowerCase().includes("already")) {
        console.error("[INSTALL] placement.bind IM_SIDEBAR error:", sidebarErr);
      } else {
        console.log("[INSTALL] placement.bind IM_SIDEBAR: OK");
        installSummary.placements_registered.push("IM_SIDEBAR");
      }
    } catch (sidebarError) {
      console.error("[INSTALL] IM_SIDEBAR placement error:", sidebarError);
    }

    // --- Register IM_CONTEXT_MENU placement (Analyze with Emmely on messages) ---
    try {
      const imContextMenuUrl = `${supabaseUrl}/functions/v1/bitrix24-im-context-menu`;

      await callBitrix(clientEndpoint, accessToken, "placement.unbind", {
        PLACEMENT: "IM_CONTEXT_MENU",
        HANDLER: imContextMenuUrl,
      });

      const ctxMenuResult = await callBitrix(clientEndpoint, accessToken, "placement.bind", {
        PLACEMENT: "IM_CONTEXT_MENU",
        HANDLER: imContextMenuUrl,
        TITLE: "Analisar com Emmely",
        DESCRIPTION: "Resumir, traduzir ou sugerir resposta",
        LANG_ALL: {
          pt: { TITLE: "Analisar com Emmely", DESCRIPTION: "Resumir, traduzir ou sugerir resposta" },
          en: { TITLE: "Analyze with Emmely", DESCRIPTION: "Summarize, translate or suggest reply" },
          es: { TITLE: "Analizar con Emmely", DESCRIPTION: "Resumir, traducir o sugerir respuesta" },
          ru: { TITLE: "Анализ с Emmely", DESCRIPTION: "Резюме, перевод или предложение ответа" },
        },
      });

      const ctxMenuErr = ctxMenuResult.error || "";
      if (ctxMenuErr && !String(ctxMenuErr).toLowerCase().includes("already")) {
        console.error("[INSTALL] placement.bind IM_CONTEXT_MENU error:", ctxMenuErr);
      } else {
        console.log("[INSTALL] placement.bind IM_CONTEXT_MENU: OK");
        installSummary.placements_registered.push("IM_CONTEXT_MENU");
      }
    } catch (ctxMenuError) {
      console.error("[INSTALL] IM_CONTEXT_MENU placement error:", ctxMenuError);
    }

    // --- Register CRM Detail Tab placements (Lead, Contact, Deal, SPA) ---
    try {
      const crmTabUrl = `${supabaseUrl}/functions/v1/bitrix24-crm-tab`;
      const paymentTabUrl = `${supabaseUrl}/functions/v1/bitrix24-payment-tab`;
      const crmPlacements = [
        "CRM_LEAD_DETAIL_TAB",
        "CRM_CONTACT_DETAIL_TAB",
        "CRM_DEAL_DETAIL_TAB",
        "CRM_DYNAMIC_DETAIL_TAB",
      ];

      for (const placement of crmPlacements) {
        await callBitrix(clientEndpoint, accessToken, "placement.unbind", {
          PLACEMENT: placement,
          HANDLER: crmTabUrl,
        });

        const crmTabResult = await callBitrix(clientEndpoint, accessToken, "placement.bind", {
          PLACEMENT: placement,
          HANDLER: crmTabUrl,
          TITLE: "Emmely AI",
          DESCRIPTION: "Conversa e histórico do cliente",
          LANG_ALL: {
            pt: { TITLE: "Emmely AI", DESCRIPTION: "Conversa e histórico do cliente" },
            en: { TITLE: "Emmely AI", DESCRIPTION: "Conversation and client history" },
            es: { TITLE: "Emmely AI", DESCRIPTION: "Conversación e historial del cliente" },
            ru: { TITLE: "Emmely AI", DESCRIPTION: "Переписка и история клиента" },
          },
        });

        const crmTabErr = crmTabResult.error || "";
        if (crmTabErr && !String(crmTabErr).toLowerCase().includes("already")) {
          console.error(`[INSTALL] placement.bind ${placement} error:`, crmTabErr);
        } else {
          console.log(`[INSTALL] placement.bind ${placement}: OK`);
          installSummary.placements_registered.push(placement);
        }
      }

      // --- Register Emmely Pay tab on CRM_DEAL_DETAIL_TAB ---
      try {
        await callBitrix(clientEndpoint, accessToken, "placement.unbind", {
          PLACEMENT: "CRM_DEAL_DETAIL_TAB",
          HANDLER: paymentTabUrl,
        });

        const payTabResult = await callBitrix(clientEndpoint, accessToken, "placement.bind", {
          PLACEMENT: "CRM_DEAL_DETAIL_TAB",
          HANDLER: paymentTabUrl,
          TITLE: "Emmely Pay",
          DESCRIPTION: "Controlo de pagamentos do negócio",
          LANG_ALL: {
            pt: { TITLE: "Emmely Pay", DESCRIPTION: "Controlo de pagamentos do negócio" },
            en: { TITLE: "Emmely Pay", DESCRIPTION: "Deal payment control" },
            es: { TITLE: "Emmely Pay", DESCRIPTION: "Control de pagos del negocio" },
          },
        });

        const payTabErr = payTabResult.error || "";
        if (payTabErr && !String(payTabErr).toLowerCase().includes("already")) {
          console.error("[INSTALL] placement.bind CRM_DEAL_DETAIL_TAB (pay) error:", payTabErr);
        } else {
          console.log("[INSTALL] placement.bind CRM_DEAL_DETAIL_TAB (Emmely Pay): OK");
          installSummary.placements_registered.push("CRM_DEAL_DETAIL_TAB_PAY");
        }
      } catch (payTabErr) {
        console.error("[INSTALL] Payment tab placement error:", payTabErr);
      }

      // --- Register Emmely Pay tab on CRM_CONTACT_DETAIL_TAB ---
      try {
        await callBitrix(clientEndpoint, accessToken, "placement.unbind", {
          PLACEMENT: "CRM_CONTACT_DETAIL_TAB",
          HANDLER: paymentTabUrl,
        });

        const payContactResult = await callBitrix(clientEndpoint, accessToken, "placement.bind", {
          PLACEMENT: "CRM_CONTACT_DETAIL_TAB",
          HANDLER: paymentTabUrl,
          TITLE: "Emmely Pay",
          DESCRIPTION: "Controlo de pagamentos do contacto",
          LANG_ALL: {
            pt: { TITLE: "Emmely Pay", DESCRIPTION: "Controlo de pagamentos do contacto" },
            en: { TITLE: "Emmely Pay", DESCRIPTION: "Contact payment control" },
            es: { TITLE: "Emmely Pay", DESCRIPTION: "Control de pagos del contacto" },
          },
        });

        const payContactErr = payContactResult.error || "";
        if (payContactErr && !String(payContactErr).toLowerCase().includes("already")) {
          console.error("[INSTALL] placement.bind CRM_CONTACT_DETAIL_TAB (pay) error:", payContactErr);
        } else {
          console.log("[INSTALL] placement.bind CRM_CONTACT_DETAIL_TAB (Emmely Pay): OK");
          installSummary.placements_registered.push("CRM_CONTACT_DETAIL_TAB_PAY");
        }
      } catch (payContactErr) {
        console.error("[INSTALL] Contact Payment tab placement error:", payContactErr);
      }

      // --- Register Emmely Agenda tab on CRM_DEAL/LEAD/CONTACT_DETAIL_TAB ---
      const bookingTabUrl = `${supabaseUrl}/functions/v1/bitrix24-booking-tab`;
      const agendaPlacements = ["CRM_DEAL_DETAIL_TAB", "CRM_LEAD_DETAIL_TAB", "CRM_CONTACT_DETAIL_TAB"];
      for (const placement of agendaPlacements) {
        try {
          await callBitrix(clientEndpoint, accessToken, "placement.unbind", {
            PLACEMENT: placement,
            HANDLER: bookingTabUrl,
          });
          const agendaResult = await callBitrix(clientEndpoint, accessToken, "placement.bind", {
            PLACEMENT: placement,
            HANDLER: bookingTabUrl,
            TITLE: "Emmely Agenda",
            DESCRIPTION: "Agendamento de reuniões",
            LANG_ALL: {
              pt: { TITLE: "Emmely Agenda", DESCRIPTION: "Agendamento de reuniões" },
              en: { TITLE: "Emmely Agenda", DESCRIPTION: "Meeting scheduling" },
              es: { TITLE: "Emmely Agenda", DESCRIPTION: "Agendamiento de reuniones" },
            },
          });
          const agendaErr = agendaResult.error || "";
          if (agendaErr && !String(agendaErr).toLowerCase().includes("already")) {
            console.error(`[INSTALL] placement.bind ${placement} (agenda) error:`, agendaErr);
          } else {
            console.log(`[INSTALL] placement.bind ${placement} (Emmely Agenda): OK`);
            installSummary.placements_registered.push(`${placement}_AGENDA`);
          }
        } catch (agendaErr) {
          console.error(`[INSTALL] Agenda tab placement ${placement} error:`, agendaErr);
        }
      }

      installSummary.installed_modules.push("crm_tabs");
      await debugLog(supabase, integrationId, "crm_tab_placements_bind", "outbound", {
        placements: crmPlacements,
        registered: installSummary.placements_registered,
      });
    } catch (crmTabError) {
      console.error("[INSTALL] CRM tab placement error:", crmTabError);
      await debugLog(supabase, integrationId, "crm_tab_placement_error", "outbound", null, String(crmTabError));
    }

    // --- Register Emmely Pay as Bitrix24 Payment System (CHECKOUT mode) ---
    try {
      const paymentHandlerUrl = `${supabaseUrl}/functions/v1/bitrix24-payment-handler`;

      // 1. Delete existing handler (safe for reinstall)
      await callBitrix(clientEndpoint, accessToken, "sale.paysystem.handler.delete", {
        ID: "emmely_pay",
      });

      // 2. Register payment handler with CHECKOUT mode
      const handlerResult = await callBitrix(clientEndpoint, accessToken, "sale.paysystem.handler.add", {
        NAME: "Emmely Pay",
        CODE: "emmely_pay",
        SORT: 100,
        SETTINGS: {
          CURRENCY: ["BRL", "EUR", "USD"],
          CLIENT_TYPE: "b2c",
          CHECKOUT_DATA: {
            ACTION_URI: paymentHandlerUrl,
          },
          CODES: {
            PAYMENT_ID: {
              NAME: "Número do Pagamento",
              SORT: "100",
              GROUP: "PAYMENT",
              DEFAULT: {
                PROVIDER_KEY: "PAYMENT",
                PROVIDER_VALUE: "ACCOUNT_NUMBER",
              },
            },
            PAYMENT_SHOULD_PAY: {
              NAME: "Valor do Pagamento",
              SORT: "200",
              GROUP: "PAYMENT",
              DEFAULT: {
                PROVIDER_KEY: "PAYMENT",
                PROVIDER_VALUE: "SUM",
              },
            },
            PAYMENT_CURRENCY: {
              NAME: "Moeda",
              SORT: "300",
              GROUP: "PAYMENT",
              DEFAULT: {
                PROVIDER_KEY: "PAYMENT",
                PROVIDER_VALUE: "CURRENCY",
              },
            },
            CUSTOMER_NAME: {
              NAME: "Nome do Cliente",
              SORT: "400",
              GROUP: "PAYMENT",
              DEFAULT: {
                PROVIDER_KEY: "USER",
                PROVIDER_VALUE: "NAME",
              },
            },
            CUSTOMER_EMAIL: {
              NAME: "Email do Cliente",
              SORT: "500",
              GROUP: "PAYMENT",
              DEFAULT: {
                PROVIDER_KEY: "USER",
                PROVIDER_VALUE: "EMAIL",
              },
            },
            CUSTOMER_CPF_CNPJ: {
              NAME: "CPF/CNPJ do Cliente",
              SORT: "600",
              DESCRIPTION: "Obrigatório para pagamentos em BRL (PIX/Boleto)",
            },
            PS_CHANGE_STATUS_PAY: {
              NAME: "Mudança automática de status",
              SORT: "700",
              INPUT: { TYPE: "Y/N" },
            },
          },
        },
      });

      const handlerErr = String(handlerResult.error || "");
      if (handlerResult.error && !handlerErr.includes("ALREADY")) {
        console.error("[INSTALL] Payment handler registration failed:", handlerResult.error, handlerResult.error_description);
      } else {
        console.log("[INSTALL] Payment handler 'emmely_pay': registered OK");
      }

      // 3. Create the actual payment system for CRM invoices
      // We try both ORDER and CRM_INVOICE bindings
      for (const entityType of ["ORDER", "CRM_INVOICE"]) {
        const psResult = await callBitrix(clientEndpoint, accessToken, "sale.paysystem.add", {
          NAME: entityType === "CRM_INVOICE" ? "Emmely Pay (Fatura)" : "Emmely Pay",
          DESCRIPTION: "Pagamento via PIX, Boleto ou Cartão através do Emmely Cloud",
          XML_ID: `emmely_pay_${entityType.toLowerCase()}`,
          PERSON_TYPE_ID: 1,
          BX_REST_HANDLER: "emmely_pay",
          ACTIVE: "Y",
          ENTITY_REGISTRY_TYPE: entityType,
          NEW_WINDOW: "Y",
          SETTINGS: {
            PAYMENT_ID: { TYPE: "PAYMENT", VALUE: "ACCOUNT_NUMBER" },
            PAYMENT_SHOULD_PAY: { TYPE: "PAYMENT", VALUE: "SUM" },
            PAYMENT_CURRENCY: { TYPE: "PAYMENT", VALUE: "CURRENCY" },
            CUSTOMER_NAME: { TYPE: "USER", VALUE: "NAME" },
            CUSTOMER_EMAIL: { TYPE: "USER", VALUE: "EMAIL" },
            PS_CHANGE_STATUS_PAY: { TYPE: "Y\\N", VALUE: "Y" },
          },
        });

        const psErr = String(psResult.error || "");
        if (psResult.error && !psErr.includes("ALREADY") && !psErr.includes("DUPLICATE")) {
          console.error(`[INSTALL] PaySystem ${entityType} creation failed:`, psResult.error, psResult.error_description);
        } else {
          console.log(`[INSTALL] PaySystem ${entityType}: created OK, ID:`, psResult.result);
        }
      }

      installSummary.paysystem_handler_registered = true;
      installSummary.installed_modules.push("paysystem");

      await debugLog(supabase, integrationId, "paysystem_setup", "outbound", {
        handler: "emmely_pay",
        url: paymentHandlerUrl,
      });
    } catch (paySystemError) {
      console.error("[INSTALL] PaySystem setup error:", paySystemError);
      await debugLog(supabase, integrationId, "paysystem_setup_error", "outbound", null, String(paySystemError));
    }

    // --- Final config merge with install summary ---
    try {
      const { data: currentConfig } = await supabase
        .from("bitrix24_integrations")
        .select("config")
        .eq("id", integrationId)
        .single();

      const existingConfig = currentConfig?.config || {};

      await supabase
        .from("bitrix24_integrations")
        .update({
          config: {
            ...existingConfig,
            ...installSummary,
            install_completed_at: new Date().toISOString(),
          },
        })
        .eq("id", integrationId);

      console.log("[INSTALL] Final config merge complete:", JSON.stringify(installSummary).substring(0, 500));
      await debugLog(supabase, integrationId, "install_summary", "outbound", installSummary);
    } catch (configErr) {
      console.error("[INSTALL] Config merge error:", configErr);
    }

    // If called via JSON (from frontend fetch), return JSON
    if (contentType.includes("application/json")) {
      return new Response(
        JSON.stringify({ success: true, integrationId, domain }),
        { headers: jsonHeaders }
      );
    }

    // If called via form POST (legacy Bitrix24 direct), return HTML
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><script src="https://api.bitrix24.com/api/v1/"></script></head>
<body style="font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5">
<div style="text-align:center;padding:40px;background:white;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.1);max-width:400px">
<div style="font-size:48px;margin-bottom:16px">✅</div>
<h2 style="color:#333;margin-bottom:8px">Emmely Cloud Instalado!</h2>
<p style="color:#666;font-size:14px">Conector configurado com sucesso.</p>
</div>
<script>try{BX24.init(function(){BX24.installFinish()});}catch(e){}</script>
</body></html>`;
    return new Response(html, { headers: htmlHeaders });
  } catch (error) {
    console.error("[INSTALL] Fatal error:", error);
    await debugLog(supabase, null, "install_fatal", "inbound", null, String(error));
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
