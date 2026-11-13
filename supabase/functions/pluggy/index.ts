// Função do Supabase (Edge Function) que conversa com a Pluggy pelo app.
// As chaves da Pluggy ficam SOMENTE aqui (secrets do Supabase): PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.
// Obrigatório: ALLOWED_EMAILS = e-mails autorizados a usar (separados por vírgula). Impede que outras pessoas
// que baixem o app usem a sua conta da Pluggy. Esses e-mails também podem vincular conexões feitas fora do app
// (ex.: Meu Pluggy) informando o ID.
// Toda chamada exige o login do app (Supabase Auth). Cada usuário só acessa as conexões vinculadas a ele.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const PLUGGY = Deno.env.get('PLUGGY_API_URL') || 'https://api.pluggy.ai'; // variável só para testes
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const ID = /^[A-Za-z0-9-]{8,64}$/;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
class HttpErr extends Error { constructor(public status: number, msg: string) { super(msg); } }

let apiKey = '', apiKeyExp = 0;
async function key(): Promise<string> {
  if (apiKey && Date.now() < apiKeyExp) return apiKey;
  const clientId = Deno.env.get('PLUGGY_CLIENT_ID'), clientSecret = Deno.env.get('PLUGGY_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new HttpErr(503, 'As chaves da Pluggy não foram configuradas no servidor (PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET).');
  const r = await fetch(PLUGGY + '/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret, nonExpiring: false }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.apiKey) throw new HttpErr(502, 'A Pluggy recusou as chaves configuradas no servidor (' + r.status + ').');
  apiKey = j.apiKey; apiKeyExp = Date.now() + 100 * 60_000;
  return apiKey;
}
async function pluggy(method: string, path: string, body?: unknown, params?: Record<string, string | undefined>) {
  const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString() : '';
  const go = async () => fetch(PLUGGY + path + qs, { method, headers: { 'Content-Type': 'application/json', 'X-API-KEY': await key() }, body: body === undefined ? undefined : JSON.stringify(body) });
  let r = await go();
  if (r.status === 401) { apiKey = ''; r = await go(); }
  const text = await r.text();
  let j: any = null; try { j = text ? JSON.parse(text) : null; } catch { j = null; }
  if (!r.ok) throw new HttpErr(r.status, (j && (j.message || j.error)) || text || 'Erro da Pluggy');
  return j;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (req.method !== 'POST') throw new HttpErr(405, 'Use POST.');
    const auth = req.headers.get('Authorization') || '';
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    const user = u && u.user;
    if (!user) throw new HttpErr(401, 'Faça login no app (Configurações → Sincronização).');
    const allowed = (Deno.env.get('ALLOWED_EMAILS') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const isOwner = allowed.includes(String(user.email || '').toLowerCase());
    if (!allowed.length) throw new HttpErr(503, 'Configure no servidor os e-mails autorizados (ALLOWED_EMAILS).');
    if (!isOwner) throw new HttpErr(403, 'Este login não tem permissão para usar o Open Finance deste app.');

    const b = await req.json().catch(() => ({}));
    const a = String(b.action || '');
    const need = (v: unknown, nome: string) => { if (!ID.test(String(v || ''))) throw new HttpErr(400, 'ID inválido: ' + nome); return String(v); };
    const mine = async (itemId: string) => {
      const { data, error } = await db.from('fin_pluggy_items').select('item_id').eq('item_id', itemId).limit(1);
      if (error) throw new HttpErr(500, 'Tabela fin_pluggy_items não encontrada. Execute supabase/schema.sql. (' + error.message + ')');
      if (!data || !data.length) throw new HttpErr(403, 'Esta conexão não está vinculada ao seu login.');
    };

    if (a === 'status') return json(200, { ok: true, configured: !!(Deno.env.get('PLUGGY_CLIENT_ID') && Deno.env.get('PLUGGY_CLIENT_SECRET')), canLinkExisting: isOwner, email: user.email });

    if (a === 'connect-token') {
      const itemId = b.itemId ? need(b.itemId, 'itemId') : undefined;
      if (itemId) await mine(itemId);
      const r = await pluggy('POST', '/connect_token', { itemId, options: { clientUserId: user.id, avoidDuplicates: true } });
      return json(200, { accessToken: r.accessToken });
    }

    if (a === 'items') {
      const { data, error } = await db.from('fin_pluggy_items').select('item_id,name,created_at').order('created_at');
      if (error) throw new HttpErr(500, 'Tabela fin_pluggy_items não encontrada. Execute supabase/schema.sql. (' + error.message + ')');
      const out = [];
      for (const row of data || []) {
        try { const it = await pluggy('GET', '/items/' + row.item_id); out.push({ id: row.item_id, name: it.connector?.name || row.name, status: it.status, lastUpdatedAt: it.lastUpdatedAt, consentExpiresAt: it.consentExpiresAt, connector: { name: it.connector?.name, imageUrl: it.connector?.imageUrl } }); }
        catch (e) { out.push({ id: row.item_id, name: row.name, status: 'ERRO', error: (e as Error).message }); }
      }
      return json(200, { results: out });
    }

    if (a === 'register') {
      const itemId = need(b.itemId, 'itemId');
      const it = await pluggy('GET', '/items/' + itemId);
      const { error } = await db.from('fin_pluggy_items').upsert({ user_id: user.id, item_id: itemId, name: it.connector?.name || 'Banco' });
      if (error) throw new HttpErr(500, 'Não foi possível salvar a conexão: ' + error.message);
      return json(200, { id: itemId, name: it.connector?.name, status: it.status, lastUpdatedAt: it.lastUpdatedAt });
    }

    if (a === 'unregister') {
      const itemId = need(b.itemId, 'itemId');
      await mine(itemId);
      if (b.deleteAtPluggy) { try { await pluggy('DELETE', '/items/' + itemId); } catch { /* já removido */ } }
      await db.from('fin_pluggy_items').delete().eq('item_id', itemId);
      return json(200, { ok: true });
    }

    if (a === 'item') { const id = need(b.id, 'id'); await mine(id); return json(200, await pluggy('GET', '/items/' + id)); }
    if (a === 'refresh') { const id = need(b.id, 'id'); await mine(id); return json(200, await pluggy('PATCH', '/items/' + id, {})); }
    if (a === 'accounts') { const id = need(b.itemId, 'itemId'); await mine(id); return json(200, await pluggy('GET', '/accounts', undefined, { itemId: id })); }
    if (a === 'loans') { const id = need(b.itemId, 'itemId'); await mine(id); return json(200, await pluggy('GET', '/loans', undefined, { itemId: id })); }
    if (a === 'transactions') {
      const acc = need(b.accountId, 'accountId');
      const conta = await pluggy('GET', '/accounts/' + acc);
      await mine(conta.itemId);
      const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(b.dateFrom || '')) ? String(b.dateFrom) : undefined;
      const after = b.after ? String(b.after).slice(0, 500) : undefined;
      return json(200, await pluggy('GET', '/v2/transactions', undefined, { accountId: acc, dateFrom, after }));
    }
    throw new HttpErr(400, 'Ação desconhecida.');
  } catch (e) {
    const st = e instanceof HttpErr ? e.status : 500;
    return json(st, { message: (e as Error).message || 'Erro interno' });
  }
});
