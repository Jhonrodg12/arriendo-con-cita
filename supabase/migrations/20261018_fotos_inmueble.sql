-- Fotos del inmueble. Las subidas pasan por la función de borde "fotos", que valida el enlace del dueño
-- y entrega una URL firmada; nadie puede subir directamente al bucket con la clave pública.
create table public.property_photos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  path text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index property_photos_orden on public.property_photos (property_id, position);
alter table public.property_photos enable row level security;
create policy "Fotos de fichas activas" on public.property_photos
  for select to anon, authenticated
  using (exists (select 1 from public.properties p where p.id = property_id and p.status = 'activo'));
revoke insert, update, delete on public.property_photos from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

-- Solo la función de borde (service_role) puede verificar el enlace del dueño.
create or replace function public.verify_owner(p_slug text, p_token text) returns uuid
language sql stable security definer set search_path = '' as $$ select private.resolve_owner(p_slug, p_token) $$;
revoke execute on function public.verify_owner(text,text) from public, anon, authenticated;
grant execute on function public.verify_owner(text,text) to service_role;

-- El panel ahora incluye las fotos.
create or replace function public.owner_get(p_slug text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := private.resolve_owner(p_slug, p_token);
begin
  return jsonb_build_object(
    'property', (select to_jsonb(p) from public.properties p where p.id = v_id),
    'availability', coalesce((select jsonb_agg(jsonb_build_object('weekday', weekday, 'block', block))
                                from public.availability where property_id = v_id), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'path', path, 'position', position) order by position, created_at)
                          from public.property_photos where property_id = v_id), '[]'::jsonb),
    'appointments', coalesce((select jsonb_agg(to_jsonb(a) order by a.visit_date, a.visit_time)
                                from public.appointments a
                               where a.property_id = v_id and a.visit_date >= private.now_bogota()::date - 30), '[]'::jsonb),
    'rejections', coalesce((select jsonb_agg(jsonb_build_object('reasons', reasons, 'created_at', created_at) order by created_at desc)
                              from public.rejections where property_id = v_id), '[]'::jsonb));
end $$;
