/* Configuração opcional da sincronização.
 * Se preencher aqui ANTES de gerar o .exe e o .apk, os aplicativos já vêm prontos para sincronizar
 * (basta entrar com e-mail e senha). Também é possível informar estes dados na tela Configurações.
 * A "anon key" (publishable key) é pública por natureza; a segurança vem do login + RLS do Supabase. */
window.APP_CONFIG = {
  supabaseUrl: '',      // ex.: 'https://abcdefghijklm.supabase.co'
  supabaseAnonKey: '',  // ex.: 'eyJhbGciOi...' ou 'sb_publishable_...'
};
