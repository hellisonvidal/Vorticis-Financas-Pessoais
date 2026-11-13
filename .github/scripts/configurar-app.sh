#!/usr/bin/env bash
# Embute no app o endereço e a chave PÚBLICA (anon) do seu Supabase, para os aplicativos já virem prontos
# (basta entrar com e-mail e senha). Só roda se os secrets SUPABASE_PROJECT_REF e SUPABASE_ACCESS_TOKEN existirem.
# A chave anon é pública por natureza: a proteção vem do login e das regras de segurança (RLS).
set -euo pipefail
if [ -z "${SUPABASE_PROJECT_REF:-}" ] || [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "Secrets do Supabase não configurados: o app será gerado sem servidor pré-configurado."; exit 0
fi
if ! [[ "$SUPABASE_PROJECT_REF" =~ ^[a-z0-9]{10,40}$ ]]; then echo "SUPABASE_PROJECT_REF inválido"; exit 1; fi
KEYS=$(curl -fsS "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/api-keys" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")
ANON=$(printf '%s' "$KEYS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const k=JSON.parse(s);const a=k.find(x=>x.name==="anon")||k.find(x=>x.type==="publishable");if(!a||!a.api_key){process.exit(2)}process.stdout.write(a.api_key)})')
if [ -z "$ANON" ]; then echo "Não foi possível obter a chave anon do projeto"; exit 1; fi
cat > www/config.js <<CFG
/* Gerado automaticamente na compilação (GitHub Actions). */
window.APP_CONFIG = {
  supabaseUrl: 'https://$SUPABASE_PROJECT_REF.supabase.co',
  supabaseAnonKey: '$ANON',
};
CFG
echo "App configurado para https://$SUPABASE_PROJECT_REF.supabase.co"
