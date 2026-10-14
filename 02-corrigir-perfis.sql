-- Cria o perfil automaticamente para cada novo usuário
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, whatsapp, plan)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', 'Profissional'),
          new.email,
          coalesce(new.raw_user_meta_data->>'whatsapp', ''),
          'free')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Conserta quem já criou conta e ficou sem perfil
insert into public.profiles (id, full_name, email, whatsapp, plan)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', 'Profissional'),
       u.email,
       coalesce(u.raw_user_meta_data->>'whatsapp', ''),
       'free'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
