-- Painel Admin: rode no Supabase > SQL Editor (depois do 01, 02 e 03)

alter table public.profiles add column if not exists blocked boolean not null default false;
alter table public.profiles add column if not exists admin_notes text;

-- Conta bloqueada não cria orçamento novo
create or replace function public.contracts_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if coalesce((select blocked from public.profiles where id = new.professional_id), false) then
      raise exception 'CONTA_BLOQUEADA: sua conta está bloqueada. Fale com o suporte.';
    end if;
    new.status := 'Pendente'; new.signed_name := null; new.signed_at := null;
  elsif old.signed_at is not null then
    raise exception 'DOCUMENTO_ASSINADO: documento assinado não pode ser alterado';
  end if;
  return new;
end $$;

create or replace function public.admin_only() returns void language plpgsql security definer set search_path = public as $$
begin if not public.is_admin() then raise exception 'NAO_AUTORIZADO'; end if; end $$;

create or replace function public.admin_overview() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_only();
  return jsonb_build_object(
    'users',     (select count(*) from profiles),
    'pro',       (select count(*) from profiles where plan = 'pro'),
    'blocked',   (select count(*) from profiles where blocked),
    'contracts', (select count(*) from contracts),
    'signed',    (select count(*) from contracts where signed_at is not null),
    'revenue',   coalesce((select sum(amount) from payments where status = 'approved'), 0)
  );
end $$;

create or replace function public.admin_list_users() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_only();
  return coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'contracts', (select count(*) from contracts c where c.professional_id = p.id),
      'signed',    (select count(*) from contracts c where c.professional_id = p.id and c.signed_at is not null))
    order by p.full_name) from profiles p), '[]'::jsonb);
end $$;

create or replace function public.admin_user_contracts(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_only();
  return coalesce((select jsonb_agg(to_jsonb(c) order by to_jsonb(c)->>'created_at' desc nulls last)
                   from contracts c where c.professional_id = p_user), '[]'::jsonb);
end $$;

create or replace function public.admin_payments() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_only();
  return coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'status', y.status, 'amount', y.amount,
           'created_at', y.created_at, 'name', p.full_name, 'email', p.email) order by y.created_at desc)
         from payments y left join profiles p on p.id = y.user_id), '[]'::jsonb);
end $$;

create or replace function public.admin_set_plan(p_user uuid, p_plan text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_only();
  if p_plan not in ('free', 'pro') then raise exception 'PLANO_INVALIDO'; end if;
  update profiles set plan = p_plan where id = p_user;
end $$;

create or replace function public.admin_set_blocked(p_user uuid, p_blocked boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_only();
  if p_user = auth.uid() then raise exception 'NAO_PODE_BLOQUEAR_A_SI_MESMO'; end if;
  update profiles set blocked = p_blocked where id = p_user;
end $$;

create or replace function public.admin_set_notes(p_user uuid, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_only();
  update profiles set admin_notes = left(coalesce(p_notes, ''), 1000) where id = p_user;
end $$;

create or replace function public.admin_delete_contract(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_only();
  delete from contracts where id = p_id;
end $$;

create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_only();
  if p_user = auth.uid() then raise exception 'NAO_PODE_EXCLUIR_A_SI_MESMO'; end if;
  if (select is_admin from profiles where id = p_user) then raise exception 'NAO_PODE_EXCLUIR_ADMIN'; end if;
  delete from contracts where professional_id = p_user;
  delete from payments where user_id = p_user;
  delete from profiles where id = p_user;
  delete from auth.users where id = p_user;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'admin_only()','admin_overview()','admin_list_users()','admin_user_contracts(uuid)','admin_payments()',
    'admin_set_plan(uuid,text)','admin_set_blocked(uuid,boolean)','admin_set_notes(uuid,text)',
    'admin_delete_contract(text)','admin_delete_user(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
