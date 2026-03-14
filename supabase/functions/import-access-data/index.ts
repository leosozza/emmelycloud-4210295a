// v4 - Phase 3 interactive: list_sync_clients + sync_single_client
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
      category_id = "0",
      mode = "full", // "clients_only" | "honorarios" | "full" | "sync_bitrix"
    } = body as {
      clientes: RawClient[];
      honorarios?: RawHonorario[];
      batch_start?: number;
      batch_size?: number;
      member_id?: string;
      category_id?: string;
      mode?: string;
    };

    // ══════════════════════════════════════════════════════════════════
    // MODE: sync_bitrix — Phase 3: Sync clients from Supabase to Bitrix
    // ══════════════════════════════════════════════════════════════════
    if (mode === "sync_bitrix") {
      if (!member_id) {
        return new Response(JSON.stringify({ error: "member_id is required for sync_bitrix" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: integration, error: intErr } = await supabase
        .from("bitrix24_integrations")
        .select("*")
        .eq("member_id", member_id)
        .single();

      if (intErr || !integration?.client_endpoint || !integration?.access_token) {
        return new Response(JSON.stringify({ error: "Integration not found or missing credentials" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const endpoint = integration.client_endpoint;
      const accessToken = integration.access_token;

      // Fetch clients from Supabase with notes containing Access ID
      const { data: allClients, error: clientsErr } = await supabase
        .from("clients")
        .select("id, name, document_number, document_type, notes, address, postal_code, country, birth_date, nationality")
        .like("notes", "%Importado do Access%")
        .order("name");

      if (clientsErr) {
        return new Response(JSON.stringify({ error: `Failed to fetch clients: ${clientsErr.message}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const total = allClients?.length || 0;
      const batch = (allClients || []).slice(batch_start, batch_start + batch_size);
      const results: { client_name: string; status: string; error?: string; details?: string }[] = [];

      const bitrixCall = async (method: string, payload: Record<string, any> = {}) => {
        const res = await fetch(`${endpoint}${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auth: accessToken, ...payload }),
        });
        return res.json();
      };

      for (const client of batch) {
        try {
          const clientName = client.name || "SEM NOME";
          const docNumber = client.document_number || "";
          
          // Extract Access ID from notes
          const accessIdMatch = (client.notes || "").match(/ID:\s*(\d+)/);
          const accessId = accessIdMatch ? accessIdMatch[1] : null;

          // Fetch client contacts (phone/email)
          const { data: contacts } = await supabase
            .from("client_contacts")
            .select("phone, mobile, email")
            .eq("client_id", client.id)
            .limit(5);

          const phones = (contacts || []).flatMap(c => [c.phone, c.mobile].filter(Boolean));
          const emails = (contacts || []).map(c => c.email).filter(Boolean);

          // Fetch financial records for this client (via contracts → proposals → cases → leads)
          const { data: financialData } = await supabase
            .from("leads")
            .select(`
              id, name,
              cases!cases_lead_id_fkey (
                id, title,
                proposals!proposals_case_id_fkey (
                  id, title, value, installments, status,
                  contracts!contracts_proposal_id_fkey (
                    id,
                    financial_records!financial_records_contract_id_fkey (
                      id, description, total_value, installment_number, total_installments,
                      installment_value, status, due_date, paid_at
                    )
                  )
                )
              )
            `)
            .eq("client_id", client.id)
            .eq("sync_source", "access_import");

          // Flatten all financial records
          const allRecords: any[] = [];
          let totalValue = 0;
          let totalPaid = 0;
          let allPaid = true;
          let hasOverdue = false;
          let overdueCount = 0;
          let overdueValue = 0;
          const serviceDescs: string[] = [];

          for (const lead of (financialData || [])) {
            for (const caso of (lead.cases || [])) {
              if (caso.title && !serviceDescs.includes(caso.title)) {
                serviceDescs.push(caso.title);
              }
              for (const proposal of (caso.proposals || [])) {
                totalValue += Number(proposal.value) || 0;
                for (const contract of (proposal.contracts || [])) {
                  for (const fr of (contract.financial_records || [])) {
                    allRecords.push(fr);
                    if (fr.status === "paga") {
                      totalPaid += Number(fr.installment_value) || 0;
                    } else {
                      allPaid = false;
                      if (fr.status === "atrasada") {
                        hasOverdue = true;
                        overdueCount++;
                        overdueValue += Number(fr.installment_value) || 0;
                      }
                    }
                  }
                }
              }
            }
          }

          if (allRecords.length === 0) {
            results.push({ client_name: clientName, status: "skipped", details: "Sem registos financeiros" });
            continue;
          }

          // ── Find Deal in Bitrix by 3 criteria ──
          let dealId: string | null = null;
          let contactId: string | null = null;

          // 1) Search by UF_CRM_1768312831 (id_access)
          if (accessId) {
            const res = await bitrixCall("crm.deal.list", {
              filter: { UF_CRM_1768312831: accessId },
              select: ["ID", "CONTACT_ID"],
            });
            if (res.result?.length > 0) {
              dealId = res.result[0].ID;
              contactId = res.result[0].CONTACT_ID || null;
            }
          }

          // 2) Search by NIF/CPF
          if (!dealId && docNumber && !docNumber.startsWith("ACCESS_")) {
            const res = await bitrixCall("crm.deal.list", {
              filter: { UF_CRM_EMMELY_NIF: docNumber },
              select: ["ID", "CONTACT_ID"],
            });
            if (res.result?.length > 0) {
              dealId = res.result[0].ID;
              contactId = res.result[0].CONTACT_ID || null;
            }
          }

          // 3) Search by phone (via Contact)
          if (!dealId && phones.length > 0) {
            for (const phone of phones) {
              const contactRes = await bitrixCall("crm.contact.list", {
                filter: { PHONE: phone },
                select: ["ID"],
              });
              if (contactRes.result?.length > 0) {
                const foundContactId = contactRes.result[0].ID;
                // Find deal linked to this contact
                const dealRes = await bitrixCall("crm.deal.list", {
                  filter: { CONTACT_ID: foundContactId },
                  select: ["ID", "CONTACT_ID"],
                });
                if (dealRes.result?.length > 0) {
                  dealId = dealRes.result[0].ID;
                  contactId = foundContactId;
                  break;
                }
              }
            }
          }

          // ── Upsert Contact if needed ──
          if (!contactId) {
            const nameParts = clientName.trim().split(/\s+/);
            const firstName = nameParts[0] || "";
            const lastName = nameParts.slice(1).join(" ") || "";

            const contactFields: Record<string, any> = {
              NAME: firstName,
              LAST_NAME: lastName,
              UF_CRM_EMMELY_NIF: docNumber || "",
            };
            if (phones.length > 0) contactFields.PHONE = phones.map(p => ({ VALUE: p, VALUE_TYPE: "WORK" }));
            if (emails.length > 0) contactFields.EMAIL = emails.map(e => ({ VALUE: e, VALUE_TYPE: "WORK" }));
            if (client.address) contactFields.ADDRESS = client.address;
            if (client.birth_date) contactFields.BIRTHDATE = client.birth_date;

            // Try find by NIF first
            if (docNumber && !docNumber.startsWith("ACCESS_")) {
              const searchRes = await bitrixCall("crm.contact.list", {
                filter: { UF_CRM_EMMELY_NIF: docNumber },
                select: ["ID"],
              });
              if (searchRes.result?.length > 0) {
                contactId = searchRes.result[0].ID;
                await bitrixCall("crm.contact.update", { id: contactId, fields: contactFields });
              }
            }

            if (!contactId) {
              const createRes = await bitrixCall("crm.contact.add", { fields: contactFields });
              contactId = createRes.result ? String(createRes.result) : null;
            }
          }

          // ── Create or Update Deal ──
          const dealTitle = serviceDescs.length === 1
            ? `${serviceDescs[0]} - ${clientName}`
            : serviceDescs.length > 1
              ? `${serviceDescs.length} SERVIÇOS - ${clientName}`
              : `CLIENTE - ${clientName}`;

          const dealFields: Record<string, any> = {
            TITLE: dealTitle,
            OPPORTUNITY: totalValue,
            CURRENCY_ID: "EUR",
            STAGE_ID: allPaid ? "WON" : (hasOverdue ? "EXECUTING" : "NEW"),
            UF_CRM_EMMELY_NIF: docNumber || "",
          };
          if (accessId) dealFields.UF_CRM_1768312831 = accessId;
          if (contactId) dealFields.CONTACT_ID = contactId;

          if (dealId) {
            await bitrixCall("crm.deal.update", { id: dealId, fields: dealFields });
            console.log(`[sync_bitrix] Updated deal ${dealId} for ${clientName}, total=€${totalValue}`);
          } else {
            dealFields.CATEGORY_ID = category_id;
            const dealRes = await bitrixCall("crm.deal.add", { fields: dealFields });
            dealId = dealRes.result ? String(dealRes.result) : null;
            console.log(`[sync_bitrix] Created deal ${dealId} for ${clientName}, total=€${totalValue}`);
          }

          if (!dealId) {
            results.push({ client_name: clientName, status: "partial", details: "Deal não criado" });
            continue;
          }

          // ── Create/Update Smart Invoices (Type 31) ──
          let invoicesCreated = 0;
          let invoicesUpdated = 0;

          for (const fr of allRecords) {
            const isPaid = fr.status === "paga";
            const isOverdue = fr.status === "atrasada";
            const instValue = Number(fr.installment_value) || 0;
            const desc = (fr.description || "").split("|")[0].trim();

            let invoiceStage = "DT31_6:NEW";
            if (isPaid) invoiceStage = "DT31_6:P";
            else if (isOverdue) invoiceStage = "DT31_6:UC";

            const invoiceTitle = `Parcela ${fr.installment_number}/${fr.total_installments} - ${desc}`;

            const invoiceFields: Record<string, any> = {
              title: invoiceTitle,
              parentId2: dealId,
              opportunity: instValue,
              currencyId: "EUR",
              stageId: invoiceStage,
            };

            if (contactId) invoiceFields.contactId = contactId;
            if (fr.due_date) {
              invoiceFields.begindate = fr.due_date;
              invoiceFields.closedate = fr.due_date;
            }

            // Check if invoice already exists
            const existingRes = await bitrixCall("crm.item.list", {
              entityTypeId: 31,
              filter: {
                parentId2: dealId,
                "%title": `Parcela ${fr.installment_number}/${fr.total_installments}`,
              },
              select: ["id", "title"],
            });
            const existing = existingRes.result?.items?.[0];

            if (existing) {
              await bitrixCall("crm.item.update", {
                entityTypeId: 31,
                id: existing.id,
                fields: invoiceFields,
              });
              invoicesUpdated++;
            } else {
              await bitrixCall("crm.item.add", {
                entityTypeId: 31,
                fields: invoiceFields,
              });
              invoicesCreated++;
            }
          }

          // ── Timeline comment for overdue ──
          if (hasOverdue) {
            const badgeText = `⚠️ SINCRONIZAÇÃO: ${overdueCount} parcela(s) em atraso — Valor em dívida: €${overdueValue.toFixed(2)}`;
            await bitrixCall("crm.timeline.comment.add", {
              fields: {
                ENTITY_ID: dealId,
                ENTITY_TYPE: "deal",
                COMMENT: badgeText,
              },
            });
          }

          results.push({
            client_name: clientName,
            status: "ok",
            details: `Deal ${dealId} · ${invoicesCreated} faturas criadas, ${invoicesUpdated} atualizadas · €${totalValue.toFixed(2)}`,
          });
        } catch (e) {
          console.error(`[sync_bitrix] Error for client:`, e);
          results.push({ client_name: client.name || "?", status: "error", error: String(e) });
        }
      }

      const processed = batch_start + batch.length;
      const hasMore = processed < total;

      return new Response(JSON.stringify({
        success: true,
        mode: "sync_bitrix",
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

    // ══════════════════════════════════════════════════════════════════
    // MODE: clients_only — Phase 1: Import clients to Supabase only
    // ══════════════════════════════════════════════════════════════════
    if (mode === "clients_only") {
      if (!clientes) {
        return new Response(JSON.stringify({ error: "clientes array is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const total = clientes.length;
      const batch = clientes.slice(batch_start, batch_start + batch_size);
      const results: { client_name: string; status: string; error?: string; details?: string }[] = [];

      for (const client of batch) {
        try {
          const clientName = cleanStr(client.NOME) || "SEM NOME";
          if (client.ID <= 3) {
            results.push({ client_name: clientName, status: "skipped", details: "System record" });
            continue;
          }

          const { clientId } = await upsertClient(supabase, client);

          // Upsert contact info if email exists
          if (client.EMAIL) {
            const { data: existingContacts } = await supabase
              .from("client_contacts")
              .select("id")
              .eq("client_id", clientId)
              .eq("email", client.EMAIL)
              .limit(1);
            if (!existingContacts || existingContacts.length === 0) {
              await supabase.from("client_contacts").insert({
                client_id: clientId,
                name: clientName,
                email: client.EMAIL,
              });
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

    // ══════════════════════════════════════════════════════════════════
    // MODE: honorarios or full — Phase 2: Import to Supabase only
    // ══════════════════════════════════════════════════════════════════
    if (!honorarios || !Array.isArray(honorarios)) {
      return new Response(JSON.stringify({ error: "honorarios array is required for this mode" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const clientesList = Array.isArray(clientes) ? clientes : [];

    const honByClient: Record<number, RawHonorario[]> = {};
    for (const h of honorarios) {
      const cid = h.CLIENTE;
      if (!honByClient[cid]) honByClient[cid] = [];
      honByClient[cid].push(h);
    }

    let clientsToProcess: RawClient[];
    if (mode === "honorarios") {
      const uniqueClientIds = [...new Set(honorarios.map(h => h.CLIENTE))];
      if (clientesList.length > 0) {
        const clientIdSet = new Set(uniqueClientIds);
        clientsToProcess = clientesList.filter(c => clientIdSet.has(c.ID));
      } else {
        clientsToProcess = uniqueClientIds.map(id => ({ ID: id, NOME: `Cliente ${id}` } as RawClient));
      }
    } else {
      clientsToProcess = clientesList;
    }

    const total = clientsToProcess.length;
    const batch = clientsToProcess.slice(batch_start, batch_start + batch_size);
    const results: { client_name: string; status: string; error?: string; details?: string }[] = [];

    for (const client of batch) {
      try {
        const clientName = cleanStr(client.NOME) || "SEM NOME";
        if (client.ID <= 3) {
          results.push({ client_name: clientName, status: "skipped", details: "System record" });
          continue;
        }

        let clientId: string;
        let docNumber: string;
        
        if (mode === "honorarios") {
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
            // Also try by notes containing Access ID
            const { data: byNotes } = await supabase
              .from("clients")
              .select("id")
              .like("notes", `%ID: ${client.ID})%`)
              .limit(1);
            
            if (byNotes && byNotes.length > 0) {
              clientId = byNotes[0].id;
            } else {
              const result = await upsertClient(supabase, client);
              clientId = result.clientId;
              docNumber = result.docNumber;
            }
          }
        } else {
          const result = await upsertClient(supabase, client);
          clientId = result.clientId;
          docNumber = result.docNumber;
        }

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
