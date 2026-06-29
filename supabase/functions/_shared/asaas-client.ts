// Shared Asaas REST helper.
// Usage:
//   const client = makeAsaasClient(apiKey, "sandbox" | "production");
//   await client.createCustomer({...});
//
// Reads `access_token` header per Asaas API convention.

export type AsaasEnv = "sandbox" | "production";

export interface AsaasClient {
  baseUrl: string;
  request<T = any>(method: string, path: string, body?: any): Promise<T>;

  findCustomerByCpfCnpj(cpfCnpj: string): Promise<any | null>;
  createCustomer(input: {
    name: string;
    email?: string;
    cpfCnpj?: string;
    phone?: string;
    mobilePhone?: string;
    externalReference?: string;
  }): Promise<any>;
  ensureCustomer(input: {
    name: string;
    email?: string;
    cpfCnpj?: string;
    phone?: string;
    externalReference?: string;
  }): Promise<string>;

  getPayment(id: string): Promise<any>;
  createPayment(input: Record<string, any>): Promise<any>;

  createSubscription(input: Record<string, any>): Promise<any>;
  getSubscription(id: string): Promise<any>;
  updateSubscription(id: string, input: Record<string, any>): Promise<any>;
  cancelSubscription(id: string): Promise<any>;
  listSubscriptionPayments(id: string): Promise<any>;

  createInvoice(input: Record<string, any>): Promise<any>;
  getInvoice(id: string): Promise<any>;
  cancelInvoice(id: string): Promise<any>;
}

export function makeAsaasClient(apiKey: string, env: AsaasEnv = "sandbox"): AsaasClient {
  const baseUrl =
    env === "production"
      ? "https://api.asaas.com/v3"
      : "https://sandbox.asaas.com/api/v3";

  async function request<T = any>(method: string, path: string, body?: any): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "access_token": apiKey,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data: any = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok || data?.errors) {
      const msg =
        data?.errors?.map((e: any) => e.description || e.code).join("; ") ||
        data?.message ||
        `HTTP ${res.status}`;
      const err: any = new Error(`[asaas ${method} ${path}] ${msg}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data as T;
  }

  async function findCustomerByCpfCnpj(cpfCnpj: string) {
    const digits = (cpfCnpj || "").replace(/\D/g, "");
    if (!digits) return null;
    const res = await request<any>("GET", `/customers?cpfCnpj=${digits}`);
    return res?.data?.[0] || null;
  }

  async function createCustomer(input: any) {
    return request("POST", "/customers", {
      name: input.name || "Cliente",
      email: input.email || undefined,
      cpfCnpj: input.cpfCnpj ? input.cpfCnpj.replace(/\D/g, "") : undefined,
      phone: input.phone || undefined,
      mobilePhone: input.mobilePhone || input.phone || undefined,
      externalReference: input.externalReference,
    });
  }

  async function ensureCustomer(input: any): Promise<string> {
    if (input.cpfCnpj) {
      const existing = await findCustomerByCpfCnpj(input.cpfCnpj);
      if (existing?.id) return existing.id;
    }
    const created = await createCustomer(input);
    return created.id;
  }

  return {
    baseUrl,
    request,
    findCustomerByCpfCnpj,
    createCustomer,
    ensureCustomer,
    getPayment: (id) => request("GET", `/payments/${id}`),
    createPayment: (input) => request("POST", "/payments", input),
    createSubscription: (input) => request("POST", "/subscriptions", input),
    getSubscription: (id) => request("GET", `/subscriptions/${id}`),
    updateSubscription: (id, input) => request("POST", `/subscriptions/${id}`, input),
    cancelSubscription: (id) => request("DELETE", `/subscriptions/${id}`),
    listSubscriptionPayments: (id) => request("GET", `/subscriptions/${id}/payments`),
    createInvoice: (input) => request("POST", "/invoices", input),
    getInvoice: (id) => request("GET", `/invoices/${id}`),
    cancelInvoice: (id) => request("POST", `/invoices/${id}/cancel`),
  };
}

export async function getAsaasCredentialsFromSupabase(supabase: any, companyId?: string | null) {
  // 1. per-company key
  if (companyId) {
    const { data: company } = await supabase
      .from("companies")
      .select("asaas_credential_key")
      .eq("id", companyId)
      .maybeSingle();
    const ck = company?.asaas_credential_key;
    if (ck) {
      const { data: cred } = await supabase
        .from("integration_credentials")
        .select("credential_value")
        .eq("provider", "asaas")
        .eq("credential_key", ck)
        .maybeSingle();
      const key = cred?.credential_value?.trim();
      if (key) {
        const { data: envRow } = await supabase
          .from("integration_credentials")
          .select("credential_value")
          .eq("provider", "asaas")
          .eq("credential_key", `${ck}_ENV`)
          .maybeSingle();
        return { apiKey: key, env: (envRow?.credential_value?.trim() === "production" ? "production" : "sandbox") as AsaasEnv };
      }
    }
  }

  // 2. global fallback
  const { data: keyRow } = await supabase
    .from("integration_credentials")
    .select("credential_value")
    .eq("provider", "asaas")
    .eq("credential_key", "ASAAS_API_KEY")
    .maybeSingle();
  const apiKey = keyRow?.credential_value?.trim();
  if (!apiKey) return null;
  const { data: envRow } = await supabase
    .from("integration_credentials")
    .select("credential_value")
    .eq("provider", "asaas")
    .eq("credential_key", "ASAAS_ENVIRONMENT")
    .maybeSingle();
  return { apiKey, env: (envRow?.credential_value?.trim() === "production" ? "production" : "sandbox") as AsaasEnv };
}
