-- Link público + assinatura do cliente. Rode no Supabase > SQL Editor.

alter table public.contracts add column if not exists public_token uuid not null default gen_random_uuid();
alter table public.contracts add column if not exists signed_name text;
alter table public.contracts add column if not exists signed_at timestamptz;
create unique index if not exists contracts_public_token_key on public.contracts(public_token);
alter table public.contracts drop constraint if exists contracts_status_check;

-- Profissional não consegue forjar assinatura nem editar documento já assinado
create or replace function public.contracts_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'Pendente'; new.signed_name := null; new.signed_at := null;
  elsif old.signed_at is not null then
    raise exception 'DOCUMENTO_ASSINADO: documento assinado não pode ser alterado';
  end if;
  return new;
end $$;
drop trigger if exists trg_contracts_guard on public.contracts;
create trigger trg_contracts_guard before insert or update on public.contracts
for each row execute function public.contracts_guard();

revoke update on public.contracts from anon, authenticated;
grant update (client_name, service_value, warranty_period, service_desc, image_url, video_url) on public.contracts to authenticated;

-- Cliente (sem login) lê UM documento pelo token do link
create or replace function public.get_public_contract(p_token uuid) returns jsonb
language sql security definer set search_path = public stable as $$
  select to_jsonb(x) from (
    select c.id, c.client_name, c.service_value, c.warranty_period, c.service_desc,
           c.image_url, c.video_url, c.status, c.signed_name, c.signed_at,
           p.full_name as prof_name, p.whatsapp as prof_whatsapp
    from public.contracts c left join public.profiles p on p.id = c.professional_id
    where c.public_token = p_token
  ) x
$$;

-- Cliente assina (uma única vez)
create or replace function public.sign_public_contract(p_token uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := btrim(coalesce(p_name, ''));
begin
  if char_length(n) < 5 or char_length(n) > 120 then raise exception 'NOME_INVALIDO'; end if;
  update public.contracts set signed_name = n, signed_at = now(), status = 'Assinado'
   where public_token = p_token and signed_at is null;
  if not found then raise exception 'JA_ASSINADO_OU_INVALIDO'; end if;
end $$;

revoke all on function public.get_public_contract(uuid) from public;
revoke all on function public.sign_public_contract(uuid, text) from public;
grant execute on function public.get_public_contract(uuid) to anon, authenticated;
grant execute on function public.sign_public_contract(uuid, text) to anon, authenticated;
