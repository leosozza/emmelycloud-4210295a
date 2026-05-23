import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  integration_id: string;
  message?: string;
  conversation_id?: string;
  contact?: Record<string, unknown> | string;
  test?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.integration_id) {
      return new Response(JSON.stringify({ error: 'integration_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: integ, error: integErr } = await admin
      .from('openclaw_integrations')
      .select('*')
      .eq('id', body.integration_id)
      .maybeSingle();

    if (integErr || !integ) {
      return new Response(JSON.stringify({ error: 'Integration not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!integ.is_active && !body.test) {
      return new Response(JSON.stringify({ error: 'Integration disabled' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build payload from template
    const template = JSON.stringify(integ.payload_template ?? {});
    const filled = template
      .replace(/"\{\{message\}\}"/g, JSON.stringify(body.message ?? (body.test ? 'ping from Emmely' : '')))
      .replace(/"\{\{conversation_id\}\}"/g, JSON.stringify(body.conversation_id ?? ''))
      .replace(/"\{\{contact\}\}"/g, JSON.stringify(body.contact ?? ''));

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (integ.auth_token && integ.auth_header_name) {
      const headerName = integ.auth_header_name;
      const value = headerName.toLowerCase() === 'authorization' && !/^bearer\s/i.test(integ.auth_token)
        ? `Bearer ${integ.auth_token}`
        : integ.auth_token;
      headers[headerName] = value;
    }

    const started = Date.now();
    const response = await fetch(integ.agent_endpoint, {
      method: 'POST',
      headers,
      body: filled,
    });

    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep text */ }

    return new Response(
      JSON.stringify({
        ok: response.ok,
        status: response.status,
        latency_ms: Date.now() - started,
        response: parsed,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
