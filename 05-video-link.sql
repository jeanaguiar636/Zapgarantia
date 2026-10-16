-- Link do vídeo no orçamento. Rode no Supabase > SQL Editor.
alter table public.contracts add column if not exists video_link text;
grant update (video_link) on public.contracts to authenticated;

create or replace function public.get_public_contract(p_token uuid) returns jsonb
language sql security definer set search_path = public stable as $$
  select to_jsonb(x) from (
    select c.id, c.client_name, c.service_value, c.warranty_period, c.service_desc,
           c.image_url, c.video_url, c.video_link, c.status, c.signed_name, c.signed_at,
           p.full_name as prof_name, p.whatsapp as prof_whatsapp
    from public.contracts c left join public.profiles p on p.id = c.professional_id
    where c.public_token = p_token
  ) x
$$;
