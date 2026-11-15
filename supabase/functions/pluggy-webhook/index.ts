// Função pública (sem JWT de usuário) para receber webhooks da Pluggy.
// Necessária para concluir o passo "Registre webhooks para eventos-chave" no painel da Pluggy
// ao solicitar acesso à produção (eventos obrigatórios ou "all").
// Opcional: defina o secret PLUGGY_WEBHOOK_SECRET no Supabase e envie o mesmo valor no header
// "x-webhook-secret" (ou na query ?token=...) ao cadastrar o webhook na Pluggy.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const VALID_EVENT = /^[a-z0-9_]+(?:\/[a-z0-9_]+)?$/i;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json(200, { ok: true, service: 'pluggy-webhook' });
  if (req.method !== 'POST') return json(405, { ok: false, message: 'Use POST.' });

  const secret = (Deno.env.get('PLUGGY_WEBHOOK_SECRET') || '').trim();
  if (secret) {
    const url = new URL(req.url);
    const provided =
      req.headers.get('x-webhook-secret') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      url.searchParams.get('token') ||
      '';
    if (!timingSafeEqual(provided.trim(), secret)) {
      return json(401, { ok: false, message: 'Webhook não autorizado.' });
    }
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json(400, { ok: false, message: 'Payload JSON inválido.' });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, message: 'Corpo JSON inválido.' });
  }

  const event = typeof body.event === 'string' ? body.event.trim() : '';
  if (!event || !VALID_EVENT.test(event)) {
    return json(400, { ok: false, message: 'Evento de webhook inválido ou ausente.' });
  }

  const eventId = typeof body.eventId === 'string' ? body.eventId : null;
  const itemId = typeof body.itemId === 'string' ? body.itemId : null;
  console.log('Pluggy webhook:', { event, eventId, itemId });

  return json(200, { ok: true, received: event, eventId });
});
