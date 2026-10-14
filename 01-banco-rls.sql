-- ETAPA 1: rode no Supabase > SQL Editor

alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as
$$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;

-- PROFILES
alter table public.profiles enable row level security;
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_select" on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id and plan = 'free' and is_admin = false);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
-- usuário só pode alterar nome e WhatsApp. "plan" e "is_admin" só via service role.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, whatsapp) on public.profiles to authenticated;

-- CONTRACTS
alter table public.contracts enable row level security;
drop policy if exists "contracts_select" on public.contracts;
drop policy if exists "contracts_insert" on public.contracts;
drop policy if exists "contracts_update" on public.contracts;
drop policy if exists "contracts_delete" on public.contracts;
create policy "contracts_select" on public.contracts for select using (professional_id = auth.uid());
create policy "contracts_insert" on public.contracts for insert with check (professional_id = auth.uid());
create policy "contracts_update" on public.contracts for update using (professional_id = auth.uid()) with check (professional_id = auth.uid());
create policy "contracts_delete" on public.contracts for delete using (professional_id = auth.uid());

-- LIMITE DO PLANO GRATUITO (2 termos) aplicado no banco
create or replace function public.enforce_free_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_count int;
begin
  select plan into v_plan from public.profiles where id = new.professional_id;
  if coalesce(v_plan,'free') <> 'pro' then
    select count(*) into v_count from public.contracts where professional_id = new.professional_id;
    if v_count >= 2 then raise exception 'LIMITE_GRATUITO: assine o plano PRO para criar mais termos'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_free_limit on public.contracts;
create trigger trg_free_limit before insert on public.contracts for each row execute function public.enforce_free_limit();

-- PAGAMENTOS (escrita só pelas Edge Functions)
create table if not exists public.payments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mp_payment_id text unique not null,
  status text not null default 'pending',
  amount numeric(10,2) not null,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments for select using (user_id = auth.uid() or public.is_admin());

-- Torne-se admin (troque pelo seu e-mail):
-- update public.profiles set is_admin = true where email = 'SEU_EMAIL';
