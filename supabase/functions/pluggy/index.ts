// Função do Supabase (Edge Function) que conversa com a Pluggy pelo app.
// Quem pode usar: os "donos" do servidor (tabela fin_owners) ou e-mails no secret ALLOWED_EMAILS.
//   Isso impede que outras pessoas que baixem o app usem a sua conta da Pluggy.
// Chaves da Pluggy: secrets PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET ou, mais prático, cadastradas pelo dono
//   dentro do app (ação "set-keys"), guardadas na tabela fin_server_config, que só o servidor consegue ler.
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

// cliente com privilégio de servidor: só para ler/gravar a configuração (fin_server_config)
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
let creds: { clientId: string; clientSecret: string } | null = null, credsAt = 0;
async function getCreds() {
  const envId = Deno.env.get('PLUGGY_CLIENT_ID'), envSecret = Deno.env.get('PLUGGY_CLIENT_SECRET');
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret };
  if (creds && Date.now() - credsAt < 60_000) return creds;
  const { data } = await admin().from('fin_server_config').select('key,value').in('key', ['pluggy_client_id', 'pluggy_client_secret']);
  const m = Object.fromEntries((data || []).map((r: { key: string; value: string }) => [r.key, r.value]));
  creds = m.pluggy_client_id && m.pluggy_client_secret ? { clientId: m.pluggy_client_id, clientSecret: m.pluggy_client_secret } : null;
  credsAt = Date.now();
  return creds;
}
async function pluggyAuth(clientId: string, clientSecret: string) {
  const r = await fetch(PLUGGY + '/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret, nonExpiring: false }) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !!j.apiKey, status: r.status, apiKey: j.apiKey as string };
}
let apiKey = '', apiKeyExp = 0;
async function key(): Promise<string> {
  if (apiKey && Date.now() < apiKeyExp) return apiKey;
  const c = await getCreds();
  if (!c) throw new HttpErr(503, 'As chaves da Pluggy ainda não foram cadastradas. Abra Open Finance no app e informe o Client ID e o Client Secret.');
  const r = await pluggyAuth(c.clientId, c.clientSecret);
  if (!r.ok) throw new HttpErr(502, 'A Pluggy recusou as chaves cadastradas (' + r.status + '). Cadastre-as de novo em Open Finance.');
  apiKey = r.apiKey; apiKeyExp = Date.now() + 100 * 60_000;
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
    let isOwner = allowed.includes(String(user.email || '').toLowerCase());
    if (!isOwner) {
      const { data: own } = await db.from('fin_owners').select('user_id').eq('user_id', user.id).limit(1);
      isOwner = !!(own && own.length);
    }
    if (!isOwner && !allowed.length) {
      // servidor novo, ainda sem dono: o primeiro login que usar o Open Finance vira o dono
      const adm = admin();
      const { count, error: ce } = await adm.from('fin_owners').select('user_id', { count: 'exact', head: true });
      if (!ce && count === 0) { const { error: ie } = await adm.from('fin_owners').insert({ user_id: user.id }); isOwner = !ie; }
    }
    if (!isOwner) throw new HttpErr(403, 'Este login não tem permissão para usar o Open Finance deste app.');

    const b = await req.json().catch(() => ({}));
    const a = String(b.action || '');
    const need = (v: unknown, nome: string) => { if (!ID.test(String(v || ''))) throw new HttpErr(400, 'ID inválido: ' + nome); return String(v); };
    const mine = async (itemId: string) => {
      const { data, error } = await db.from('fin_pluggy_items').select('item_id').eq('item_id', itemId).limit(1);
      if (error) throw new HttpErr(500, 'Tabela fin_pluggy_items não encontrada. Execute supabase/schema.sql. (' + error.message + ')');
      if (!data || !data.length) throw new HttpErr(403, 'Esta conexão não está vinculada ao seu login.');
    };

    if (a === 'status') return json(200, { ok: true, configured: !!(await getCreds()), owner: true, canLinkExisting: true, email: user.email, keysFromEnv: !!Deno.env.get('PLUGGY_CLIENT_ID') });

    if (a === 'set-keys') {
      const clientId = String(b.clientId || '').trim(), clientSecret = String(b.clientSecret || '').trim();
      if (!/^[A-Za-z0-9_-]{3,100}$/.test(clientId) || clientSecret.length < 3 || clientSecret.length > 300) throw new HttpErr(400, 'Client ID ou Client Secret em formato inválido.');
      const r = await pluggyAuth(clientId, clientSecret);
      if (!r.ok) throw new HttpErr(400, 'A Pluggy não aceitou essas chaves (' + r.status + '). Confira o Client ID e o Client Secret.');
      const now = new Date().toISOString();
      const { error } = await admin().from('fin_server_config').upsert([{ key: 'pluggy_client_id', value: clientId, updated_at: now }, { key: 'pluggy_client_secret', value: clientSecret, updated_at: now }]);
      if (error) throw new HttpErr(500, 'Não foi possível salvar as chaves: ' + error.message);
      creds = { clientId, clientSecret }; credsAt = Date.now(); apiKey = r.apiKey; apiKeyExp = Date.now() + 100 * 60_000;
      return json(200, { ok: true, configured: true });
    }

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
