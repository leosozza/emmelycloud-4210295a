import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AccessClient {
  id: string;
  nome: string;
  documento: string | null;
  nif: string | null;
  nascimento: string | null;
  nacionalidade: string | null;
  email: string | null;
  morada: string | null;
  codigopostal: string | null;
  pais: string | null;
  ativo: string | null;
}

interface AccessHonorario {
  id: string;
  data: string | null;
  valor: string;
  descricao: string;
  parcela: string;
  valor_parcela: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;
  total_pago: string | null;
}

interface AccessRecord {
  cliente: AccessClient;
  honorarios: AccessHonorario[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { records, batch_start = 0, batch_size = 10, member_id, sync_bitrix = false } = body as {
      records: AccessRecord[];
      batch_start?: number;
      batch_size?: number;
      member_id?: string;
      sync_bitrix?: boolean;
    };

    if (!records || !Array.isArray(records)) {
      return new Response(JSON.stringify({ error: "records array is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const total = records.length;
    const batch = records.slice(batch_start, batch_start + batch_size);
    const results: { client_name: string; status: string; error?: string }[] = [];

    // Fetch Bitrix24 integration if syncing
    let integration: any = null;
    if (sync_bitrix && member_id) {
      const { data: int } = await supabase
        .from("bitrix24_integrations")
        .select("*")
        .eq("member_id", member_id)
        .single();
      integration = int;
    }

    for (const record of batch) {
      try {
        const client = record.cliente;
        const honorarios = record.honorarios || [];

        // Parse NIF — skip very short ones that are just IDs
        const nif = client.nif && client.nif.length >= 6 ? client.nif : null;
        const docNumber = nif || client.documento || `ACCESS_${client.id}`;

        // Parse birth date
        let birthDate: string | null = null;
        if (client.nascimento) {
          try {
            birthDate = client.nascimento.split("T")[0];
          } catch { /* ignore */ }
        }

        // 1. Upsert client in Emmely
        const clientData = {
          name: client.nome?.trim() || "SEM NOME",
          document_number: docNumber,
          document_type: client.documento ? "passport" : "nif",
          nationality: client.nacionalidade || null,
          address: client.morada || null,
          postal_code: client.codigopostal || null,
          country: client.pais || "PORTUGAL",
          birth_date: birthDate,
          has_active_contract: client.ativo === "SIM",
          notes: `Importado do Access (ID: ${client.id})`,
        };

        // Check if client exists by document_number
        const { data: existingClients } = await supabase
          .from("clients")
          .select("id")
          .eq("document_number", docNumber)
          .limit(1);

        let clientId: string;
        if (existingClients && existingClients.length > 0) {
          clientId = existingClients[0].id;
          await supabase.from("clients").update(clientData).eq("id", clientId);
        } else {
          const { data: newClient, error: insertErr } = await supabase
            .from("clients")
            .insert(clientData)
            .select("id")
            .single();
          if (insertErr) throw new Error(`Client insert: ${insertErr.message}`);
          clientId = newClient!.id;
        }

        // 2. Group honorarios by descricao (each group = 1 service/contract concept)
        const groups: Record<string, AccessHonorario[]> = {};
        for (const h of honorarios) {
          const key = (h.descricao || "SEM DESCRIÇÃO").trim().toUpperCase();
          if (!groups[key]) groups[key] = [];
          groups[key].push(h);
        }

        // 3. Create financial_records for each installment
        // We need a contract_id — we'll create a dummy proposal+contract or use existing
        // For now, we'll check for an existing contract linked to this client
        let contractId: string | null = null;

        // Find existing contract via proposals linked to cases linked to leads linked to client
        // Simpler: create a "virtual" contract per import if none exists
        const { data: existingContracts } = await supabase
          .from("contracts")
          .select("id, proposals!inner(cases!inner(leads!inner(client_id)))")
          .limit(1);

        // Since financial_records require contract_id, we need to create the full chain
        // For bulk import, let's create a proposal+contract per service group
        for (const [desc, installments] of Object.entries(groups)) {
          const totalValue = parseFloat(installments[0]?.valor || "0");
          const totalInstallments = installments.length;

          // Check if we already imported this (by description match for this client)
          const { data: existingFR } = await supabase
            .from("financial_records")
            .select("id, contracts!inner(proposals!inner(client_name))")
            .eq("description", desc)
            .limit(1);

          // Create the proposal → contract → financial_records chain
          // First create a case for the lead
          const { data: lead } = await supabase
            .from("leads")
            .insert({
              name: client.nome?.trim() || "SEM NOME",
              client_id: clientId,
              origin: "outro" as any,
              funnel_stage: "convertido" as any,
              notes: `Importado do Access - ${desc}`,
              sync_source: "access_import",
            })
            .select("id")
            .single();

          if (!lead) continue;

          const { data: caso } = await supabase
            .from("cases")
            .insert({
              title: desc,
              lead_id: lead.id,
              description: `Serviço importado do Access: ${desc}`,
              status: "concluido" as any,
            })
            .select("id")
            .single();

          if (!caso) continue;

          const allPaid = installments.every(i => i.status === "QUITADO");
          const { data: proposal } = await supabase
            .from("proposals")
            .insert({
              title: desc,
              case_id: caso.id,
              value: totalValue,
              installments: totalInstallments,
              status: (allPaid ? "aceite" : "enviada") as any,
              client_name: client.nome?.trim(),
              client_document: docNumber,
            })
            .select("id")
            .single();

          if (!proposal) continue;

          const { data: contract } = await supabase
            .from("contracts")
            .insert({
              proposal_id: proposal.id,
              case_id: caso.id,
              status: (allPaid ? "concluido" : "ativo") as any,
              signer_name: client.nome?.trim(),
            })
            .select("id")
            .single();

          if (!contract) continue;
          contractId = contract.id;

          // Create financial records for each installment
          for (const inst of installments) {
            const parcelaParts = inst.parcela?.split("/") || ["1", "1"];
            const installmentNumber = parseInt(parcelaParts[0]) || 1;
            const installmentTotal = parseInt(parcelaParts[1]) || totalInstallments;

            let status: string = "pendente";
            let paidAt: string | null = null;
            if (inst.status === "QUITADO") {
              status = "pago";
              paidAt = inst.data_pagamento || inst.data_vencimento || new Date().toISOString();
            } else if (inst.status === "PARCIAL") {
              status = "pendente";
            }

            let dueDate: string | null = null;
            if (inst.data_vencimento) {
              try { dueDate = inst.data_vencimento.split("T")[0]; } catch { /* */ }
            }

            await supabase.from("financial_records").insert({
              contract_id: contractId,
              description: desc,
              total_value: totalValue,
              installment_number: installmentNumber,
              total_installments: installmentTotal,
              installment_value: parseFloat(inst.valor_parcela) || 0,
              status: status as any,
              due_date: dueDate,
              paid_at: paidAt,
              payment_method: "transferencia" as any,
            });
          }
        }

        // 4. Sync to Bitrix24 if enabled
        if (sync_bitrix && integration?.client_endpoint && integration?.access_token) {
          try {
            await syncClientToBitrix(integration, client, groups);
          } catch (e) {
            console.error(`[import] Bitrix sync error for ${client.nome}:`, e);
            // Don't fail the whole import for Bitrix errors
          }
        }

        results.push({ client_name: client.nome, status: "ok" });
      } catch (e) {
        console.error(`[import] Error for ${record.cliente?.nome}:`, e);
        results.push({ client_name: record.cliente?.nome || "?", status: "error", error: String(e) });
      }
    }

    const processed = batch_start + batch.length;
    const hasMore = processed < total;

    return new Response(JSON.stringify({
      success: true,
      processed,
      total,
      has_more: hasMore,
      next_batch_start: hasMore ? processed : null,
      results,
      errors: results.filter(r => r.status === "error"),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[import-access-data] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function syncClientToBitrix(
  integration: any,
  client: AccessClient,
  groups: Record<string, AccessHonorario[]>
) {
  const endpoint = integration.client_endpoint;
  const accessToken = integration.access_token;

  // Check if contact exists by NIF
  const nif = client.nif && client.nif.length >= 6 ? client.nif : null;
  let contactId: string | null = null;

  if (nif) {
    const searchRes = await fetch(`${endpoint}crm.contact.list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth: accessToken,
        filter: { UF_CRM_EMMELY_NIF: nif },
        select: ["ID"],
      }),
    });
    const searchData = await searchRes.json();
    if (searchData.result?.length > 0) {
      contactId = searchData.result[0].ID;
    }
  }

  // Parse name parts
  const nameParts = (client.nome || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const contactFields: Record<string, any> = {
    NAME: firstName,
    LAST_NAME: lastName,
    UF_CRM_EMMELY_NIF: nif || "",
    UF_CRM_EMMELY_DOCUMENTO: client.documento || "",
  };

  if (client.nascimento) {
    contactFields.BIRTHDATE = client.nascimento.split("T")[0];
  }
  if (client.morada) {
    contactFields.ADDRESS = client.morada;
  }
  if (client.codigopostal) {
    contactFields.ADDRESS_POSTAL_CODE = client.codigopostal;
  }
  if (client.pais) {
    contactFields.ADDRESS_COUNTRY = client.pais;
  }
  if (client.email) {
    contactFields.EMAIL = [{ VALUE: client.email, VALUE_TYPE: "WORK" }];
  }

  if (contactId) {
    // Update existing contact
    await fetch(`${endpoint}crm.contact.update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth: accessToken, id: contactId, fields: contactFields }),
    });
  } else {
    // Create new contact
    const createRes = await fetch(`${endpoint}crm.contact.add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth: accessToken, fields: contactFields }),
    });
    const createData = await createRes.json();
    contactId = createData.result ? String(createData.result) : null;
  }

  if (!contactId) return;

  // Create a Deal per service group
  for (const [desc, installments] of Object.entries(groups)) {
    const totalValue = parseFloat(installments[0]?.valor || "0");
    const allPaid = installments.every(i => i.status === "QUITADO");

    const dealFields: Record<string, any> = {
      TITLE: `${desc} - ${client.nome}`,
      CONTACT_ID: contactId,
      OPPORTUNITY: totalValue,
      CURRENCY_ID: "EUR",
      STAGE_ID: allPaid ? "WON" : "NEW",
      UF_CRM_EMMELY_NIF: nif || "",
    };

    const dealRes = await fetch(`${endpoint}crm.deal.add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth: accessToken, fields: dealFields }),
    });
    const dealData = await dealRes.json();
    const dealId = dealData.result ? String(dealData.result) : null;

    if (!dealId) continue;

    // Create Smart Invoices (Type 31) for each installment
    for (const inst of installments) {
      const isPaid = inst.status === "QUITADO";
      const parcelaParts = inst.parcela?.split("/") || ["1", "1"];

      const invoiceFields: Record<string, any> = {
        title: `Parcela ${inst.parcela} - ${desc}`,
        parentId2: dealId,
        opportunity: parseFloat(inst.valor_parcela) || 0,
        currencyId: "EUR",
        stageId: isPaid ? "DT31_6:P" : "DT31_6:NEW",
      };

      if (inst.data_vencimento) {
        invoiceFields.begindate = inst.data_vencimento.split("T")[0];
        invoiceFields.closedate = inst.data_vencimento.split("T")[0];
      }

      await fetch(`${endpoint}crm.item.add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth: accessToken,
          entityTypeId: 31,
          fields: invoiceFields,
        }),
      });
    }
  }
}
