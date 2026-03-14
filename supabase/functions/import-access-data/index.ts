import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Types ──────────────────────────────────────────────────────────────────

interface RawClient {
  ID: number;
  NOME: string;
  TIPODOCUMENTO1?: string;
  NIFNIPC?: string;
  TIPODOCUMENTO2?: string;
  DOCUMENTO?: string;
  VALIDADE?: string;
  NASCIMENTO?: string;
  NACIONALIDADE?: string;
  ESTADOCIVIL?: string;
  MORADA?: string;
  CODIGOPOSTAL?: string;
  FREGUESIA?: string;
  CONSELHO?: string;
  DISTRITO?: string;
  OBSERVACAO?: string;
  PAIS?: string;
  NIB?: string;
  EMAIL?: string;
  ATIVO?: string;
}

interface RawHonorario {
  ID: number;
  SEPARADORID: number;
  CLIENTE: number;
  DATA?: string;
  VALOR?: string;
  DESCRICAO?: string;
  DATA_VENC?: string;
  PARCELA?: string;
  VALOR_PARCELA?: string;
  VALOR_PARCELA_CORRIGIDO?: string;
  TOTALPAGO?: string;
  DATAPGTO?: string;
  STATUS?: string;
  ENCARGOS_ATRASO?: string;
  JUROS?: string;
  MULTA?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseNum(v: any): number {
  if (v == null || v === "") return 0;
  const s = String(v).replace(/,/g, "");
  return parseFloat(s) || 0;
}

function parseDate(v: any): string | null {
  if (v == null || v === "") return null;
  const num = typeof v === "number" ? v : Number(v);
  if (!isNaN(num) && num > 1000 && num < 100000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + num);
    return epoch.toISOString().split("T")[0];
  }
  const s = String(v).trim();
  const parts = s.split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    const year = y.length === 2 ? `20${y}` : y;
    const month = m.padStart(2, "0");
    const day = d.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (s.includes("T")) return s.split("T")[0];
  return s;
}

function cleanStr(v: any): string | null {
  if (v == null || String(v).trim() === "") return null;
  return String(v).trim();
}

function mapStatus(s: string): string {
  const upper = (s || "").toUpperCase().trim();
  if (upper === "QUITADO") return "paga";
  if (upper === "ATRASADO") return "atrasada";
  if (upper === "PARCIAL") return "atrasada";
  return "pendente";
}

// ── Upsert Client Helper ──────────────────────────────────────────────────

async function upsertClient(supabase: any, client: RawClient): Promise<{ clientId: string; docNumber: string }> {
  const clientName = cleanStr(client.NOME) || "SEM NOME";
  const nif = cleanStr(client.NIFNIPC);
  const docNumber = nif || cleanStr(client.DOCUMENTO) || `ACCESS_${client.ID}`;

  const clientData: Record<string, any> = {
    name: clientName,
    document_number: docNumber,
    document_type: client.TIPODOCUMENTO1 ? client.TIPODOCUMENTO1.replace(/:$/, "").trim().toLowerCase() : (nif ? "nif" : "passport"),
    nationality: cleanStr(client.NACIONALIDADE),
    address: cleanStr(client.MORADA),
    postal_code: cleanStr(client.CODIGOPOSTAL),
    freguesia: cleanStr(client.FREGUESIA),
    concelho: cleanStr(client.CONSELHO),
    distrito: cleanStr(client.DISTRITO),
    country: cleanStr(client.PAIS) || "PORTUGAL",
    nib: cleanStr(client.NIB),
    birth_date: parseDate(client.NASCIMENTO),
    has_active_contract: (client.ATIVO || "").toUpperCase() === "SIM",
    notes: cleanStr(client.ESTADOCIVIL) ? `Estado civil: ${client.ESTADOCIVIL}. Importado do Access (ID: ${client.ID})` : `Importado do Access (ID: ${client.ID})`,
  };

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

  return { clientId, docNumber };
}

// ── Main Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const {
      clientes,
      honorarios,
      batch_start = 0,
      batch_size = 10,
      member_id,
      sync_bitrix = false,
      category_id = "0",
      mode = "full", // "clients_only" | "honorarios" | "full"
    } = body as {
      clientes: RawClient[];
      honorarios?: RawHonorario[];
      batch_start?: number;
      batch_size?: number;
      member_id?: string;
      sync_bitrix?: boolean;
      category_id?: string;
      mode?: string;
    };

    // ── MODE: clients_only ────────────────────────────────────────────
    if (mode === "clients_only") {
      if (!clientes) {
        return new Response(JSON.stringify({ error: "clientes array is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const total = clientes.length;
      const batch = clientes.slice(batch_start, batch_start + batch_size);
      const results: { client_name: string; status: string; error?: string; details?: string }[] = [];

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

      for (const client of batch) {
        try {
          const clientName = cleanStr(client.NOME) || "SEM NOME";
          if (client.ID <= 3) {
            results.push({ client_name: clientName, status: "skipped", details: "System record" });
            continue;
          }

          const { clientId, docNumber } = await upsertClient(supabase, client);

          // Sync to Bitrix: create Contact + empty Deal
          if (sync_bitrix && integration?.client_endpoint && integration?.access_token) {
            try {
              await syncClientOnlyToBitrix(integration, client, docNumber, category_id);
            } catch (e) {
              console.error(`[import] Bitrix client sync error ${clientName}:`, e);
              results.push({ client_name: clientName, status: "partial", details: `DB OK, Bitrix error: ${e}` });
              continue;
            }
          }

          results.push({ client_name: clientName, status: "ok", details: `Client upserted (${clientId.substring(0, 8)})` });
        } catch (e) {
          console.error(`[import] Error for client ${client.NOME}:`, e);
          results.push({ client_name: client.NOME || "?", status: "error", error: String(e) });
        }
      }

      const processed = batch_start + batch.length;
      const hasMore = processed < total;

      return new Response(JSON.stringify({
        success: true,
        mode: "clients_only",
        processed,
        total,
        has_more: hasMore,
        next_batch_start: hasMore ? processed : null,
        results,
        errors: results.filter(r => r.status === "error"),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── MODE: honorarios or full ──────────────────────────────────────
    if (!honorarios || !Array.isArray(honorarios)) {
      return new Response(JSON.stringify({ error: "honorarios array is required for this mode" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // If clientes not provided, use empty array (clients fetched from DB)
    const clientesList = Array.isArray(clientes) ? clientes : [];

    // Build honorarios lookup: clientId -> honorarios[]
    const honByClient: Record<number, RawHonorario[]> = {};
    for (const h of honorarios) {
      const cid = h.CLIENTE;
      if (!honByClient[cid]) honByClient[cid] = [];
      honByClient[cid].push(h);
    }

    // For mode=honorarios, we need to resolve clients from DB, not from the clientes array
    // But we still accept clientes for backward compat — derive client list from honorarios
    let clientsToProcess: RawClient[];
    if (mode === "honorarios") {
      // Build minimal client stubs from honorarios' CLIENTE ids
      const uniqueClientIds = [...new Set(honorarios.map(h => h.CLIENTE))];
      if (clientesList.length > 0) {
        // Use provided clientes filtered to those with honorarios
        const clientIdSet = new Set(uniqueClientIds);
        clientsToProcess = clientesList.filter(c => clientIdSet.has(c.ID));
      } else {
        // No clientes provided — create stubs
        clientsToProcess = uniqueClientIds.map(id => ({ ID: id, NOME: `Cliente ${id}` } as RawClient));
      }
    } else {
      clientsToProcess = clientesList;
    }

    const total = clientsToProcess.length;
    const batch = clientsToProcess.slice(batch_start, batch_start + batch_size);
    const results: { client_name: string; status: string; error?: string; details?: string }[] = [];

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

    for (const client of batch) {
      try {
        const clientName = cleanStr(client.NOME) || "SEM NOME";
        if (client.ID <= 3) {
          results.push({ client_name: clientName, status: "skipped", details: "System record" });
          continue;
        }

        // For honorarios mode, look up existing client by document_number
        let clientId: string;
        let docNumber: string;
        
        if (mode === "honorarios") {
          // Try to find existing client first
          const nif = cleanStr(client.NIFNIPC);
          docNumber = nif || cleanStr(client.DOCUMENTO) || `ACCESS_${client.ID}`;
          
          const { data: existing } = await supabase
            .from("clients")
            .select("id")
            .eq("document_number", docNumber)
            .limit(1);
          
          if (existing && existing.length > 0) {
            clientId = existing[0].id;
          } else {
            // Client doesn't exist yet — upsert
            const result = await upsertClient(supabase, client);
            clientId = result.clientId;
            docNumber = result.docNumber;
          }
        } else {
          const result = await upsertClient(supabase, client);
          clientId = result.clientId;
          docNumber = result.docNumber;
        }

        // Get client's honorarios and group by SEPARADORID
        const clientHons = honByClient[client.ID] || [];
        if (clientHons.length === 0) {
          results.push({ client_name: clientName, status: "ok", details: "No honorarios" });
          continue;
        }

        const groups: Record<number, RawHonorario[]> = {};
        for (const h of clientHons) {
          const sid = h.SEPARADORID;
          if (!groups[sid]) groups[sid] = [];
          groups[sid].push(h);
        }

        // Create chain per SEPARADORID group
        let groupsOk = 0;
        let groupsErr = 0;

        for (const [separadorIdStr, installments] of Object.entries(groups)) {
          const separadorId = parseInt(separadorIdStr);
          try {
            const desc = (installments[0]?.DESCRICAO || "SEM DESCRIÇÃO").trim().toUpperCase();
            const totalValue = parseNum(installments[0]?.VALOR);
            
            const firstParcelaRaw = installments[0]?.PARCELA || "1/1";
            const firstParcelaParts = firstParcelaRaw.split(/[;/]/);
            const totalInstallments = parseInt(firstParcelaParts[1]) || installments.length;
            
            const allPaid = installments.every(i => (i.STATUS || "").toUpperCase() === "QUITADO");
            const hasOverdue = installments.some(i => (i.STATUS || "").toUpperCase() === "ATRASADO");
            const totalPaid = installments.reduce((sum, i) => sum + parseNum(i.TOTALPAGO), 0);
            const overdueCount = installments.filter(i => (i.STATUS || "").toUpperCase() === "ATRASADO").length;
            const overdueValue = installments
              .filter(i => (i.STATUS || "").toUpperCase() === "ATRASADO")
              .reduce((sum, i) => sum + (parseNum(i.VALOR_PARCELA_CORRIGIDO) || parseNum(i.VALOR_PARCELA)) - parseNum(i.TOTALPAGO), 0);

            const serviceDateRaw = parseDate(installments[0]?.DATA);
            const serviceDate = serviceDateRaw ? `${serviceDateRaw}T00:00:00Z` : new Date().toISOString();

            // Create lead
            const { data: lead, error: leadErr } = await supabase
              .from("leads")
              .insert({
                name: clientName,
                client_id: clientId,
                origin: "outro",
                funnel_stage: "fechado",
                notes: `Importado do Access - ${desc} (SeparadorID: ${separadorId})`,
                sync_source: "access_import",
                created_at: serviceDate,
              })
              .select("id")
              .single();

            if (leadErr) {
              console.error(`[import] Lead error ${clientName}/${desc}:`, leadErr.message);
              groupsErr++;
              continue;
            }

            // Create case
            const { data: caso, error: casoErr } = await supabase
              .from("cases")
              .insert({
                title: desc,
                lead_id: lead!.id,
                description: `Serviço importado do Access: ${desc} (SeparadorID: ${separadorId})`,
                status: "concluido",
                created_at: serviceDate,
              })
              .select("id")
              .single();

            if (casoErr) {
              console.error(`[import] Case error ${clientName}/${desc}:`, casoErr.message);
              groupsErr++;
              continue;
            }

            // Create proposal
            const { data: proposal, error: proposalErr } = await supabase
              .from("proposals")
              .insert({
                title: desc,
                case_id: caso!.id,
                value: totalValue,
                installments: totalInstallments,
                status: allPaid ? "aceita" : "enviada",
                client_name: clientName,
                client_document: docNumber,
                created_at: serviceDate,
              })
              .select("id")
              .single();

            if (proposalErr) {
              console.error(`[import] Proposal error ${clientName}/${desc}:`, proposalErr.message);
              groupsErr++;
              continue;
            }

            // Create contract
            const { data: contract, error: contractErr } = await supabase
              .from("contracts")
              .insert({
                proposal_id: proposal!.id,
                case_id: caso!.id,
                status: allPaid ? "assinado" : "pendente",
                signer_name: clientName,
                created_at: serviceDate,
                signed_at: allPaid ? serviceDate : null,
              })
              .select("id")
              .single();

            if (contractErr) {
              console.error(`[import] Contract error ${clientName}/${desc}:`, contractErr.message);
              groupsErr++;
              continue;
            }

            // Create financial records for each installment
            for (const inst of installments) {
              const parcelaParts = (inst.PARCELA || "1/1").split(/[;/]/);
              const installmentNumber = parseInt(parcelaParts[0]) || 1;
              const installmentTotal = parseInt(parcelaParts[1]) || totalInstallments;

              const instValue = parseNum(inst.VALOR_PARCELA_CORRIGIDO) || parseNum(inst.VALOR_PARCELA);
              const paidAmount = parseNum(inst.TOTALPAGO);
              const status = mapStatus(inst.STATUS || "PENDENTE");
              const paidAt = status === "paga" ? (parseDate(inst.DATAPGTO) || parseDate(inst.DATA_VENC) || new Date().toISOString()) : null;
              const dueDate = parseDate(inst.DATA_VENC);

              const extras: string[] = [];
              if (parseNum(inst.ENCARGOS_ATRASO) > 0) extras.push(`Encargos: €${parseNum(inst.ENCARGOS_ATRASO).toFixed(2)}`);
              if (parseNum(inst.JUROS) > 0) extras.push(`Juros: €${parseNum(inst.JUROS).toFixed(2)}`);
              if (parseNum(inst.MULTA) > 0) extras.push(`Multa: €${parseNum(inst.MULTA).toFixed(2)}`);
              if (paidAmount > 0 && paidAmount < instValue) extras.push(`Pago parcial: €${paidAmount.toFixed(2)}`);

              const description = extras.length > 0 ? `${desc} | ${extras.join(", ")}` : desc;

              const { error: frErr } = await supabase.from("financial_records").insert({
                contract_id: contract!.id,
                description,
                total_value: totalValue,
                installment_number: installmentNumber,
                total_installments: installmentTotal,
                installment_value: instValue,
                status: status as any,
                due_date: dueDate,
                paid_at: paidAt,
                payment_method: "transferencia",
                created_at: serviceDate,
              });

              if (frErr) {
                console.error(`[import] Financial record error ${clientName}/${desc} parcela ${inst.PARCELA}:`, frErr.message);
              }
            }

            // Sync to Bitrix24 if enabled
            if (sync_bitrix && integration?.client_endpoint && integration?.access_token) {
              try {
                await syncHonorariosToBitrix(integration, client, desc, installments, String(separadorId), totalValue, totalPaid, allPaid, category_id, hasOverdue, overdueCount, overdueValue);
              } catch (e) {
                console.error(`[import] Bitrix sync error ${clientName}/${desc}:`, e);
              }
            }

            groupsOk++;
          } catch (e) {
            console.error(`[import] Group ${separadorIdStr} error for ${clientName}:`, e);
            groupsErr++;
          }
        }

        results.push({
          client_name: clientName,
          status: groupsErr > 0 ? "partial" : "ok",
          details: `${groupsOk} serviços OK, ${groupsErr} erros`,
        });
      } catch (e) {
        console.error(`[import] Error for client ${client.NOME}:`, e);
        results.push({ client_name: client.NOME || "?", status: "error", error: String(e) });
      }
    }

    const processed = batch_start + batch.length;
    const hasMore = processed < total;

    return new Response(JSON.stringify({
      success: true,
      mode,
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

// ── Bitrix24 Sync: Client Only (Phase 1) ──────────────────────────────────

async function syncClientOnlyToBitrix(
  integration: any,
  client: RawClient,
  docNumber: string,
  categoryId: string = "0",
) {
  const endpoint = integration.client_endpoint;
  const accessToken = integration.access_token;
  const nif = cleanStr(client.NIFNIPC);
  const clientAccessId = String(client.ID);
  const clientName = cleanStr(client.NOME) || "SEM NOME";

  // ── Upsert Contact ──
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

  const nameParts = (client.NOME || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const contactFields: Record<string, any> = {
    NAME: firstName,
    LAST_NAME: lastName,
    UF_CRM_EMMELY_NIF: nif || "",
    UF_CRM_EMMELY_DOCUMENTO: cleanStr(client.DOCUMENTO) || "",
  };

  if (client.NASCIMENTO) contactFields.BIRTHDATE = parseDate(client.NASCIMENTO);
  if (client.MORADA) contactFields.ADDRESS = client.MORADA;
  if (client.CODIGOPOSTAL) contactFields.ADDRESS_POSTAL_CODE = client.CODIGOPOSTAL;
  if (client.PAIS) contactFields.ADDRESS_COUNTRY = client.PAIS;
  if (client.EMAIL) contactFields.EMAIL = [{ VALUE: client.EMAIL, VALUE_TYPE: "WORK" }];

  if (contactId) {
    await fetch(`${endpoint}crm.contact.update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth: accessToken, id: contactId, fields: contactFields }),
    });
  } else {
    const createRes = await fetch(`${endpoint}crm.contact.add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth: accessToken, fields: contactFields }),
    });
    const createData = await createRes.json();
    contactId = createData.result ? String(createData.result) : null;
  }

  if (!contactId) return;

  // ── Create empty Deal (placeholder for Phase 2) ──
  const dealSearchRes = await fetch(`${endpoint}crm.deal.list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth: accessToken,
      filter: { UF_CRM_1768312831: clientAccessId },
      select: ["ID"],
    }),
  });
  const dealSearchData = await dealSearchRes.json();

  // Only create if no deal exists for this client
  if (!dealSearchData.result || dealSearchData.result.length === 0) {
    const dealFields: Record<string, any> = {
      TITLE: `CLIENTE - ${clientName}`,
      CONTACT_ID: contactId,
      OPPORTUNITY: 0,
      CURRENCY_ID: "EUR",
      STAGE_ID: "NEW",
      CATEGORY_ID: categoryId,
      UF_CRM_EMMELY_NIF: nif || "",
      UF_CRM_1768312831: clientAccessId,
    };

    const dealRes = await fetch(`${endpoint}crm.deal.add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth: accessToken, fields: dealFields }),
    });
    const dealData = await dealRes.json();
    console.log(`[import] Created empty Bitrix deal for client ${clientName} (Access ID: ${clientAccessId}), dealId=${dealData.result}`);
  } else {
    console.log(`[import] Deal already exists for client ${clientName} (Access ID: ${clientAccessId}), skipping`);
  }
}

// ── Bitrix24 Sync: Honorarios (Phase 2 / Full) ───────────────────────────

async function syncHonorariosToBitrix(
  integration: any,
  client: RawClient,
  desc: string,
  installments: RawHonorario[],
  separadorId: string,
  totalValue: number,
  totalPaid: number,
  allPaid: boolean,
  categoryId: string = "0",
  hasOverdue: boolean = false,
  overdueCount: number = 0,
  overdueValue: number = 0,
) {
  const endpoint = integration.client_endpoint;
  const accessToken = integration.access_token;
  const nif = cleanStr(client.NIFNIPC);

  // ── Upsert Contact ──
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

  const nameParts = (client.NOME || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const contactFields: Record<string, any> = {
    NAME: firstName,
    LAST_NAME: lastName,
    UF_CRM_EMMELY_NIF: nif || "",
    UF_CRM_EMMELY_DOCUMENTO: cleanStr(client.DOCUMENTO) || "",
  };

  if (client.NASCIMENTO) contactFields.BIRTHDATE = parseDate(client.NASCIMENTO);
  if (client.MORADA) contactFields.ADDRESS = client.MORADA;
  if (client.CODIGOPOSTAL) contactFields.ADDRESS_POSTAL_CODE = client.CODIGOPOSTAL;
  if (client.PAIS) contactFields.ADDRESS_COUNTRY = client.PAIS;
  if (client.EMAIL) contactFields.EMAIL = [{ VALUE: client.EMAIL, VALUE_TYPE: "WORK" }];

  if (contactId) {
    await fetch(`${endpoint}crm.contact.update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth: accessToken, id: contactId, fields: contactFields }),
    });
  } else {
    const createRes = await fetch(`${endpoint}crm.contact.add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth: accessToken, fields: contactFields }),
    });
    const createData = await createRes.json();
    contactId = createData.result ? String(createData.result) : null;
  }

  if (!contactId) return;

  // ── Upsert Deal ──
  let dealId: string | null = null;
  const clientAccessId = String(client.ID);

  const dealSearchRes = await fetch(`${endpoint}crm.deal.list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth: accessToken,
      filter: { UF_CRM_1768312831: clientAccessId, "%TITLE": desc },
      select: ["ID", "TITLE"],
    }),
  });
  const dealSearchData = await dealSearchRes.json();
  if (dealSearchData.result?.length > 0) {
    dealId = dealSearchData.result[0].ID;
  }

  const dealFields: Record<string, any> = {
    TITLE: `${desc} - ${client.NOME}`,
    CONTACT_ID: contactId,
    OPPORTUNITY: totalValue,
    CURRENCY_ID: "EUR",
    STAGE_ID: allPaid ? "WON" : "NEW",
    UF_CRM_EMMELY_NIF: nif || "",
    UF_CRM_1768312831: clientAccessId,
  };

  if (dealId) {
    await fetch(`${endpoint}crm.deal.update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth: accessToken, id: dealId, fields: dealFields }),
    });
    console.log(`[import] Updated Bitrix deal ${dealId} for separadorId=${separadorId}`);
  } else {
    // Check if there's an empty placeholder deal for this client
    const placeholderRes = await fetch(`${endpoint}crm.deal.list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth: accessToken,
        filter: { UF_CRM_1768312831: clientAccessId, OPPORTUNITY: 0 },
        select: ["ID"],
      }),
    });
    const placeholderData = await placeholderRes.json();
    
    if (placeholderData.result?.length > 0) {
      // Update the placeholder deal
      dealId = placeholderData.result[0].ID;
      await fetch(`${endpoint}crm.deal.update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth: accessToken, id: dealId, fields: dealFields }),
      });
      console.log(`[import] Updated placeholder deal ${dealId} for separadorId=${separadorId}`);
    } else {
      // Create new deal
      dealFields.CATEGORY_ID = categoryId;
      const dealRes = await fetch(`${endpoint}crm.deal.add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth: accessToken, fields: dealFields }),
      });
      const dealData = await dealRes.json();
      dealId = dealData.result ? String(dealData.result) : null;
      console.log(`[import] Created Bitrix deal ${dealId} in category=${categoryId} for separadorId=${separadorId}`);
    }
  }

  if (!dealId) return;

  // ── Create Smart Invoices (Type 31) per installment ──
  for (const inst of installments) {
    const upperStatus = (inst.STATUS || "").toUpperCase();
    const isPaid = upperStatus === "QUITADO";
    const isOverdue = upperStatus === "ATRASADO";
    const instValue = parseNum(inst.VALOR_PARCELA_CORRIGIDO) || parseNum(inst.VALOR_PARCELA);

    let invoiceStage = "DT31_6:NEW";
    if (isPaid) invoiceStage = "DT31_6:P";
    else if (isOverdue) invoiceStage = "DT31_6:UC";

    const invoiceFields: Record<string, any> = {
      title: `Parcela ${inst.PARCELA} - ${desc}`,
      parentId2: dealId,
      opportunity: instValue,
      currencyId: "EUR",
      stageId: invoiceStage,
    };

    const dueDate = parseDate(inst.DATA_VENC);
    if (dueDate) {
      invoiceFields.begindate = dueDate;
      invoiceFields.closedate = dueDate;
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

  // ── Add timeline badge for overdue deals ──
  if (hasOverdue && dealId) {
    const badgeText = `⚠️ IMPORTAÇÃO: ${overdueCount} parcela(s) em atraso — Valor em dívida: €${overdueValue.toFixed(2)}`;
    await fetch(`${endpoint}crm.timeline.comment.add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth: accessToken,
        fields: {
          ENTITY_ID: dealId,
          ENTITY_TYPE: "deal",
          COMMENT: badgeText,
        },
      }),
    });
    console.log(`[import] Added overdue badge to deal ${dealId}: ${overdueCount} parcelas, €${overdueValue.toFixed(2)}`);
  }
}
