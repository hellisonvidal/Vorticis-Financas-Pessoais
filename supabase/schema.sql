-- =====================================================================
-- Vorticis Finanças Pessoais — estrutura de sincronização no Supabase
-- Execute UMA vez em: Supabase > SQL Editor > New query > cole tudo > Run
-- (pode ser executado de novo sem problemas)
-- =====================================================================

create table if not exists public.fin_records (
  user_id           uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id                text        not null,
  collection        text        not null,
  data              jsonb       not null default '{}'::jsonb,
  deleted           boolean     not null default false,
  updated_at        timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists fin_records_user_server_ts on public.fin_records (user_id, server_updated_at, id);

-- Segurança: cada usuário só enxerga e altera os próprios registros
alter table public.fin_records enable row level security;

drop policy if exists "fin_select_own" on public.fin_records;
drop policy if exists "fin_insert_own" on public.fin_records;
drop policy if exists "fin_update_own" on public.fin_records;
drop policy if exists "fin_delete_own" on public.fin_records;

create policy "fin_select_own" on public.fin_records for select to authenticated using ((select auth.uid()) = user_id);
create policy "fin_insert_own" on public.fin_records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "fin_update_own" on public.fin_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "fin_delete_own" on public.fin_records for delete to authenticated using ((select auth.uid()) = user_id);

-- Resolução de conflitos no servidor: uma versão mais antiga nunca sobrescreve uma mais nova.
create or replace function public.fin_records_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return old;            -- mantém a versão mais nova
    end if;
    new.user_id := old.user_id;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists fin_records_guard on public.fin_records;
create trigger fin_records_guard
before insert or update on public.fin_records
for each row execute function public.fin_records_guard();

grant select, insert, update, delete on public.fin_records to authenticated;

-- =====================================================================
-- Open Finance (Pluggy): conexões de banco vinculadas a cada usuário.
-- Usado pela função supabase/functions/pluggy (as chaves da Pluggy ficam nos secrets do Supabase).
-- =====================================================================
create table if not exists public.fin_pluggy_items (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  item_id    text        not null,
  name       text,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.fin_pluggy_items enable row level security;
drop policy if exists "pluggy_select_own" on public.fin_pluggy_items;
drop policy if exists "pluggy_insert_own" on public.fin_pluggy_items;
drop policy if exists "pluggy_update_own" on public.fin_pluggy_items;
drop policy if exists "pluggy_delete_own" on public.fin_pluggy_items;
create policy "pluggy_select_own" on public.fin_pluggy_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "pluggy_insert_own" on public.fin_pluggy_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "pluggy_update_own" on public.fin_pluggy_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "pluggy_delete_own" on public.fin_pluggy_items for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.fin_pluggy_items to authenticated;

-- Donos do servidor (podem usar o Open Finance e cadastrar as chaves da Pluggy pelo app).
-- O primeiro login que abrir o Open Finance vira dono automaticamente.
create table if not exists public.fin_owners (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.fin_owners enable row level security;
drop policy if exists "owners_select_own" on public.fin_owners;
create policy "owners_select_own" on public.fin_owners for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.fin_owners from anon;
grant select on public.fin_owners to authenticated;

-- Configuração do servidor (chaves da Pluggy). RLS sem políticas: só a função do servidor (service role) lê e grava.
create table if not exists public.fin_server_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.fin_server_config enable row level security;
revoke all on public.fin_server_config from anon, authenticated;
