-- PENDIENTE DE APLICAR (requiere aprobación porque borra datos antiguos).
-- Cumple la política de datos: elimina citas 90 días después de la visita y descartados de más de 180 días.
create extension if not exists pg_cron;

create or replace function private.purge_old_data() returns void
language sql security definer set search_path = '' as $$
  delete from public.appointments where visit_date < (now() at time zone 'America/Bogota')::date - 90;
  delete from public.rejections where created_at < now() - interval '180 days';
$$;
revoke execute on function private.purge_old_data() from public, anon, authenticated;

select cron.schedule('purgar-datos-antiguos', '15 8 * * *', $$select private.purge_old_data()$$);
