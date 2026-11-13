/* Servidor de sincronização e Open Finance (Supabase do projeto "financas-pessoais").
 * Com isto preenchido, os aplicativos já vêm prontos: basta entrar com e-mail e senha.
 * A "anon key" é pública por natureza: a segurança vem do login + regras RLS do Supabase.
 * (Se os secrets SUPABASE_PROJECT_REF/SUPABASE_ACCESS_TOKEN existirem no GitHub, a compilação regrava este arquivo.) */
window.APP_CONFIG = {
  supabaseUrl: 'https://gdzgaxlcqjieczeabncq.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkemdheGxjcWppZWN6ZWFibmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1ODU2MDEsImV4cCI6MjExMDE2MTYwMX0.-q8mJ8eR_qECCPkOUOugt2wRcArZxflwmEUeqSXJG_E',
};
