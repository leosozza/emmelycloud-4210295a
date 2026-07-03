// Shared helper for Bitrix24 robots: reads Emmely Pay UF_CRM_EMMELY_* fields
// from a deal and returns a normalized payment plan (same shape the manual
// calculator produces in the payment tab).

type BitrixCall = (method: string, params?: Record<string, any>) => Promise<any>;

export interface EmmelyCustomer {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  companyId: string;
  contactId: string;
}

export interface EmmelyPaymentPlan {
  totalAmount: number;
  currency: string;
  gateway: string; // stripe_pt | stripe_br | asaas | auto
  hasDown: boolean;
  downPayment: number;
  downInstallments: number;
  downMethod: string;
  downFirstDue: string; // yyyy-mm-dd
  downInterval: number;
  remainingInstallments: number;
  remainingMethod: string;
  firstDue: string; // yyyy-mm-dd (for saldo)
  interval: number;
  customer: EmmelyCustomer;
  raw: Record<string, any>; // original deal fields, for debug
  warnings: string[];
}

function num(v: any, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function intNum(v: any, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function toIsoDate(v: any): string {
  const s = str(v);
  if (!s) return "";
  // Bitrix date can be "2026-07-01T00:00:00+02:00" or "2026-07-01"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

// Map ENUM ids -> code, or accept raw string like 'card'.
async function resolvePaymentMethod(
  call: BitrixCall,
  rawValue: any,
  entityType: "deal" | "lead" | "spa"
): Promise<string> {
  const v = str(rawValue).toLowerCase();
  if (!v) return "";
  const LABEL_MAP: Record<string, string> = {
    "cartão": "card", "cartao": "card", "credit_card": "card",
    "cliente escolhe": "customer_choice", "cliente escolhe (stripe)": "customer_choice",
    "customer choice": "customer_choice", "customer_choice": "customer_choice",
    "mb way": "mb_way", "mbway": "mb_way",
    "débito sepa": "sepa_debit", "debito sepa": "sepa_debit",
  };
  if (LABEL_MAP[v]) return LABEL_MAP[v];
  // If already a known string code, keep it.
  const KNOWN = new Set([
    "card", "pix", "boleto", "multibanco", "mb_way",
    "sepa_debit", "transferencia", "direto", "parcelado_direto",
    "customer_choice", "link", "n"
  ]);
  if (KNOWN.has(v)) return v;
  // Purely numeric → enum ID, need to resolve.
  if (!/^\d+$/.test(v)) return v;
  try {
    const method = entityType === "lead"
      ? "crm.lead.fields"
      : entityType === "deal"
      ? "crm.deal.fields"
      : null;
    if (!method) return v;
    const res = await call(method);
    const fields = res?.result || {};
    const items = fields.UF_CRM_EMMELY_PAYMENT_METHOD?.items || [];
    const found = items.find((it: any) => String(it.ID) === v);
    if (found) {
      const label = String(found.VALUE || found.value || v).toLowerCase();
      return LABEL_MAP[label] || label;
    }
  } catch (_e) { /* ignore */ }
  return v;
}

/**
 * Read the Emmely Pay plan attached to a Bitrix deal (or lead / SPA).
 * Returns the normalized plan plus any warnings for missing fields.
 */
export async function readEmmelyPaymentPlan(
  call: BitrixCall,
  entityType: "deal" | "lead" | "spa",
  entityId: string | number,
  entityTypeId?: number, // required for SPA
  supabase?: any, // optional — enables fallback to financial_records when UF fields are empty
): Promise<EmmelyPaymentPlan> {
  const warnings: string[] = [];
  const id = typeof entityId === "number" ? entityId : parseInt(String(entityId).replace(/^\D+/, ""), 10);
  if (!id) throw new Error("entityId required");

  let deal: Record<string, any> = {};
  if (entityType === "deal") {
    const res = await call("crm.deal.get", { id });
    deal = res?.result || {};
  } else if (entityType === "lead") {
    const res = await call("crm.lead.get", { id });
    deal = res?.result || {};
  } else {
    const res = await call("crm.item.get", { entityTypeId, id });
    deal = res?.result?.item || {};
    // SPA returns camelCase — normalize a few we care about
    // (keep both cases available in `raw`)
  }

  const pick = (snake: string) => {
    if (deal[snake] !== undefined) return deal[snake];
    const camel = snake.toLowerCase().replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    return deal[camel];
  };

  const totalAmount = num(pick("UF_CRM_EMMELY_TOTAL_AMOUNT")) || num(pick("OPPORTUNITY")) || num(pick("opportunity"));
  const currency = str(pick("CURRENCY_ID") || pick("currencyId")) || "EUR";
  const gatewayRaw = str(pick("UF_CRM_EMMELY_GATEWAY")).toLowerCase();
  const gateway = gatewayRaw || "auto";

  const downPayment = num(pick("UF_CRM_EMMELY_DOWN_PAYMENT"));
  const downInstallments = intNum(pick("UF_CRM_EMMELY_DOWN_INSTALLMENTS"), 1);
  const downFirstDue = toIsoDate(pick("UF_CRM_EMMELY_DOWN_FIRST_DUE"));
  const downInterval = intNum(pick("UF_CRM_EMMELY_DOWN_INTERVAL"), 30);
  const remainingInstallments = intNum(pick("UF_CRM_EMMELY_TOTAL_INSTALLMENTS"), 1);
  const firstDue = toIsoDate(pick("UF_CRM_EMMELY_FIRST_DUE_DATE") || pick("UF_CRM_EMMELY_NEXT_DUE_DATE"));
  const interval = intNum(pick("UF_CRM_EMMELY_INSTALLMENT_INTERVAL"), 30);

  const [remainingMethod, downMethod] = await Promise.all([
    resolvePaymentMethod(call, pick("UF_CRM_EMMELY_PAYMENT_METHOD"), entityType),
    resolvePaymentMethod(call, pick("UF_CRM_EMMELY_DOWN_METHOD"), entityType),
  ]);

  // Customer lookup: contact preferred, fallback to lead-embedded fields
  const contactId = str(pick("CONTACT_ID") || pick("contactId"));
  const companyId = str(pick("COMPANY_ID") || pick("companyId"));

  const customer: EmmelyCustomer = {
    name: "", email: "", cpf: "", phone: "",
    contactId, companyId,
  };

  if (contactId) {
    try {
      const cres = await call("crm.contact.get", { id: parseInt(contactId, 10) });
      const c = cres?.result || {};
      customer.name = str(`${c.NAME || ""} ${c.LAST_NAME || ""}`).trim() || str(c.FULL_NAME);
      const emails = c.EMAIL || [];
      const phones = c.PHONE || [];
      customer.email = str(emails[0]?.VALUE);
      customer.phone = str(phones[0]?.VALUE);
      customer.cpf = str(c.UF_CRM_CPF || c.UF_CRM_CNPJ || c.UF_CRM_CPF_CNPJ);
    } catch (_e) { /* ignore */ }
  } else if (entityType === "lead") {
    customer.name = str(pick("NAME") + " " + (pick("LAST_NAME") || "")).trim() || str(pick("TITLE"));
    const emails = pick("EMAIL") || [];
    const phones = pick("PHONE") || [];
    customer.email = str(emails[0]?.VALUE);
    customer.phone = str(phones[0]?.VALUE);
  }

  // ---- Fallback to financial_records when UF fields are empty ----
  // The Emmely Pay UI writes the plan to financial_records (source of truth),
  // and does NOT sync those values back to the deal's UF_CRM_EMMELY_* fields.
  // Without this fallback, deals configured via the UI fail validation here.
  let effTotal = totalAmount;
  let effFirstDue = firstDue;
  let effRemainingInstallments = remainingInstallments;
  let effRemainingMethod = remainingMethod;
  const missingParcels: string[] = [];
  let frRows: any[] = [];

  if (supabase && entityType === "deal" && id) {
    try {
      const { data: frData, error: frErr } = await supabase
        .from("financial_records")
        .select("id, installment_number, total_installments, installment_value, payment_method, due_date, status")
        .eq("bitrix24_deal_id", String(id))
        .order("installment_number", { ascending: true, nullsFirst: true });
      if (frErr) {
        warnings.push(`financial_records fallback query error: ${frErr.message || frErr}`);
      } else if (Array.isArray(frData) && frData.length > 0) {
        frRows = frData;
        const pendingOrAll = frData.filter((r: any) => (r.status || "pendente") !== "paga");
        const sumAll = frData.reduce((a: number, r: any) => a + num(r.installment_value), 0);
        if (effTotal <= 0 && sumAll > 0) {
          effTotal = sumAll;
          warnings.push("totalAmount from financial_records");
        }
        if (!effFirstDue) {
          const withDue = pendingOrAll
            .filter((r: any) => r.due_date)
            .sort((a: any, b: any) => String(a.due_date).localeCompare(String(b.due_date)));
          if (withDue[0]?.due_date) {
            effFirstDue = toIsoDate(withDue[0].due_date);
            if (effFirstDue) warnings.push("firstDue from financial_records");
          }
        }
        if (!remainingInstallments || remainingInstallments === 1) {
          // Best-effort: use max total_installments seen or the count of rows
          const maxTot = frData.reduce((m: number, r: any) => Math.max(m, intNum(r.total_installments, 0)), 0);
          if (maxTot > 0) effRemainingInstallments = maxTot;
          else if (pendingOrAll.length > 0) effRemainingInstallments = pendingOrAll.length;
        }
        if (!effRemainingMethod) {
          // Majority method among rows that declare one
          const counts: Record<string, number> = {};
          for (const r of frData) {
            const m = str(r.payment_method).toLowerCase();
            if (m) counts[m] = (counts[m] || 0) + 1;
          }
          const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
          if (top) {
            effRemainingMethod = top;
            warnings.push(`remainingMethod from financial_records (${top})`);
          }
        }
        // Per-parcel diagnostics for the caller to surface in the timeline
        for (const r of frData) {
          const label = r.total_installments && r.total_installments > 1
            ? `Parcela ${r.installment_number || "?"}/${r.total_installments}`
            : `Parcela ${r.installment_number || "?"}`;
          const holes: string[] = [];
          if (!r.due_date) holes.push("data de vencimento");
          if (!str(r.payment_method)) holes.push("método");
          if (holes.length > 0) missingParcels.push(`${label}: falta ${holes.join(" e ")}`);
        }
      } else {
        warnings.push("no financial_records for this deal");
      }
    } catch (e) {
      warnings.push(`financial_records fallback exception: ${String(e).slice(0, 200)}`);
    }
  }

  // Warnings (post-fallback so they reflect effective values)
  if (effTotal <= 0) warnings.push("UF_CRM_EMMELY_TOTAL_AMOUNT is empty or 0");
  if (!effRemainingMethod && !downMethod) warnings.push("UF_CRM_EMMELY_PAYMENT_METHOD missing");
  if (effTotal > downPayment && !effFirstDue) warnings.push("UF_CRM_EMMELY_FIRST_DUE_DATE missing for saldo");
  if (downPayment > 0 && !downFirstDue) warnings.push("UF_CRM_EMMELY_DOWN_FIRST_DUE missing");
  if (!customer.name) warnings.push("Customer name not found (link a contact to the deal)");
  if (!customer.email) warnings.push("Customer email not found (link a contact with email)");

  const plan: EmmelyPaymentPlan = {
    totalAmount: effTotal,
    currency,
    gateway,
    hasDown: downPayment > 0,
    downPayment,
    downInstallments: Math.max(1, downInstallments),
    downMethod: downMethod || effRemainingMethod || "card",
    downFirstDue: downFirstDue || new Date().toISOString().split("T")[0],
    downInterval: Math.max(1, downInterval),
    remainingInstallments: Math.max(1, effRemainingInstallments),
    remainingMethod: effRemainingMethod || downMethod || "card",
    firstDue: effFirstDue,
    interval: Math.max(1, interval),
    customer,
    raw: deal,
    warnings,
  };
  // Attach parcel-level diagnostics as a non-typed extra field for the caller.
  (plan as any).missingParcels = missingParcels;
  (plan as any).financialRecords = frRows;
  return plan;
}

/**
 * Explode a normalized plan into individual parcels — same shape expected by
 * payment-create (one call per parcel). Mirrors the manual calculator.
 */
export interface ParcelSpec {
  amount: number;
  due_date: string; // yyyy-mm-dd
  installment_number: number;
  total_in_group: number;
  is_down_payment: boolean;
  method: string;
}

export function planToParcels(plan: EmmelyPaymentPlan): ParcelSpec[] {
  const parcels: ParcelSpec[] = [];
  const remaining = Math.max(0, plan.totalAmount - plan.downPayment);

  if (plan.hasDown) {
    const n = plan.downInstallments;
    const per = n > 0 ? Math.floor((plan.downPayment * 100) / n) / 100 : plan.downPayment;
    const last = plan.downPayment - per * (n - 1);
    const base = plan.downFirstDue ? new Date(plan.downFirstDue) : new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + plan.downInterval * i);
      parcels.push({
        amount: i === n - 1 ? last : per,
        due_date: d.toISOString().split("T")[0],
        installment_number: i + 1,
        total_in_group: n,
        is_down_payment: true,
        method: plan.downMethod,
      });
    }
  }

  if (remaining > 0) {
    const n = plan.remainingInstallments;
    const per = n > 0 ? Math.floor((remaining * 100) / n) / 100 : remaining;
    const last = remaining - per * (n - 1);
    const base = plan.firstDue ? new Date(plan.firstDue) : new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + plan.interval * i);
      parcels.push({
        amount: i === n - 1 ? last : per,
        due_date: d.toISOString().split("T")[0],
        installment_number: i + 1,
        total_in_group: n,
        is_down_payment: false,
        method: plan.remainingMethod,
      });
    }
  }

  return parcels;
}
