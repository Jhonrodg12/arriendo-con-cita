-- Esquema inicial de Arriendo con Cita (aplicado en el proyecto Supabase "arriendo-con-cita").
-- Modelo de seguridad: sin cuentas en la beta. La ficha es pública; el panel del dueño se abre con un
-- enlace privado (token). Citas y descartados solo se leen o escriben mediante funciones que validan todo.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{4,60}$'),
  mode text not null default 'arriendo' check (mode in ('arriendo','cesion')),
  title text not null check (char_length(title) between 3 and 120),
  municipality text not null default 'Madrid, Cundinamarca' check (char_length(municipality) <= 80),
  neighborhood text check (char_length(neighborhood) <= 80),
  bedrooms smallint check (bedrooms between 0 and 20),
  bathrooms smallint check (bathrooms between 0 and 20),
  area_m2 numeric(7,1) check (area_m2 > 0),
  estrato smallint check (estrato between 1 and 6),
  floor smallint check (floor between -5 and 100),
  extras text check (char_length(extras) <= 300),
  rent integer not null check (rent between 100000 and 100000000),
  admin_fee integer not null default 0 check (admin_fee between 0 and 100000000),
  guarantees text[] not null default '{poliza,codeudor}'
    check (guarantees <@ array['poliza','codeudor','fianza']::text[] and cardinality(guarantees) > 0),
  income_multiplier numeric(3,1) not null default 2 check (income_multiplier between 1 and 5),
  pets_allowed boolean not null default true,
  available_from text not null default 'Inmediato' check (char_length(available_from) <= 60),
  lease_end date,
  agency_name text check (char_length(agency_name) <= 80),
  assignment_authorized boolean not null default false,
  status text not null default 'activo' check (status in ('activo','pausado','arrendado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cesion_requiere_autorizacion check (mode <> 'cesion' or assignment_authorized)
);

create table private.property_tokens (
  property_id uuid primary key references public.properties(id) on delete cascade,
  token_hash bytea not null
);

create table public.availability (
  property_id uuid not null references public.properties(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  block text not null check (block in ('manana','tarde','noche')),
  primary key (property_id, weekday, block)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  visit_date date not null,
  visit_time time not null,
  name text not null check (char_length(name) between 2 and 80),
  whatsapp text not null check (whatsapp ~ '^[0-9 +()-]{7,20}$'),
  income_declared integer not null check (income_declared between 0 and 1000000000),
  household_size smallint not null check (household_size between 1 and 12),
  has_pets boolean not null default false,
  guarantee text not null check (guarantee in ('poliza','codeudor','fianza','no_se')),
  credit_report text not null check (credit_report in ('no','si','no_se')),
  titular text not null check (titular in ('propio','otra_persona')),
  move_in text not null check (move_in in ('este_mes','proximo_mes','mas_adelante')),
  consent_at timestamptz not null default now(),
  status text not null default 'agendada' check (status in ('agendada','cancelada','realizada','no_asistio')),
  created_at timestamptz not null default now()
);
create unique index appointments_un_cupo on public.appointments (property_id, visit_date, visit_time) where status = 'agendada';
create index appointments_por_fecha on public.appointments (property_id, visit_date);

create table public.rejections (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  reasons text[] not null,
  created_at timestamptz not null default now()
);
create index rejections_por_inmueble on public.rejections (property_id, created_at desc);

alter table public.properties enable row level security;
alter table public.availability enable row level security;
alter table public.appointments enable row level security;
alter table public.rejections enable row level security;
alter table private.property_tokens enable row level security;

create policy "Fichas activas visibles" on public.properties
  for select to anon, authenticated using (status = 'activo');
create policy "Disponibilidad de fichas activas" on public.availability
  for select to anon, authenticated
  using (exists (select 1 from public.properties p where p.id = property_id and p.status = 'activo'));

-- Funciones internas
create or replace function private.now_bogota() returns timestamp
language sql stable set search_path = '' as $$ select (now() at time zone 'America/Bogota') $$;

create or replace function private.block_times(p_block text) returns time[]
language sql immutable set search_path = '' as $$
  select case p_block
    when 'manana' then array['09:00','09:30','10:00','10:30','11:00','11:30']::time[]
    when 'tarde'  then array['14:00','14:30','15:00','15:30','16:00','16:30']::time[]
    when 'noche'  then array['18:00','18:30','19:00','19:30']::time[]
    else array[]::time[] end $$;

create or replace function private.resolve_owner(p_slug text, p_token text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  select p.id into v_id from public.properties p
    join private.property_tokens t on t.property_id = p.id
   where p.slug = p_slug and t.token_hash = extensions.digest(coalesce(p_token,''), 'sha256');
  if v_id is null then raise exception 'Enlace de propietario no válido' using errcode = '28000'; end if;
  return v_id;
end $$;

create or replace function private.evaluate(p public.properties, p_income int, p_pets boolean, p_guarantee text, p_credit text)
returns text[] language plpgsql immutable set search_path = '' as $$
declare r text[] := '{}'; m text := replace(rtrim(rtrim(p.income_multiplier::text, '0'), '.'), '.', ',');
begin
  if coalesce(p_income,0) < p.rent * p.income_multiplier then
    r := r || ('Ingresos por debajo de ' || m || ' veces el canon'); end if;
  if coalesce(p_pets,false) and not p.pets_allowed then
    r := r || 'Llega con mascota y no se aceptan'::text; end if;
  if p_guarantee <> 'no_se' and not (p_guarantee = any(p.guarantees)) then
    r := r || 'Ofrece una garantía que no aceptas'::text; end if;
  if p_credit = 'si' and p_guarantee not in ('codeudor','fianza') then
    r := r || 'Tiene reportes y no ofrece codeudor ni fianza'::text; end if;
  return r;
end $$;

create or replace function private.write_availability(p_id uuid, p_blocks jsonb) returns void
language sql security definer set search_path = '' as $$
  delete from public.availability where property_id = p_id;
  insert into public.availability (property_id, weekday, block)
  select distinct p_id, (x->>'weekday')::smallint, x->>'block'
    from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) x;
$$;

-- Funciones públicas: quien busca
create or replace function public.check_applicant(p_property uuid, p_income int, p_pets boolean, p_guarantee text, p_credit text)
returns text[] language plpgsql volatile security definer set search_path = '' as $$
declare v public.properties; r text[];
begin
  select * into v from public.properties where id = p_property and status = 'activo';
  if not found then raise exception 'Este aviso ya no está disponible'; end if;
  r := private.evaluate(v, p_income, p_pets, p_guarantee, p_credit);
  if cardinality(r) > 0 then insert into public.rejections (property_id, reasons) values (p_property, r); end if;
  return r;
end $$;

create or replace function public.taken_slots(p_property uuid)
returns table (visit_date date, visit_time time)
language sql stable security definer set search_path = '' as $$
  select a.visit_date, a.visit_time
    from public.appointments a join public.properties p on p.id = a.property_id
   where a.property_id = p_property and p.status = 'activo' and a.status = 'agendada'
     and a.visit_date >= private.now_bogota()::date $$;

create or replace function public.book_visit(
  p_property uuid, p_date date, p_time time, p_name text, p_whatsapp text,
  p_income int, p_household int, p_pets boolean, p_guarantee text, p_credit text,
  p_titular text, p_move_in text, p_consent boolean)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v public.properties; v_now timestamp := private.now_bogota(); v_id uuid;
begin
  if not coalesce(p_consent,false) then raise exception 'Debes autorizar el tratamiento de tus datos para agendar'; end if;
  select * into v from public.properties where id = p_property and status = 'activo';
  if not found then raise exception 'Este aviso ya no está disponible'; end if;
  if cardinality(private.evaluate(v, p_income, p_pets, p_guarantee, p_credit)) > 0 then
    raise exception 'No cumples los requisitos de este inmueble'; end if;
  if p_date < v_now::date or p_date > v_now::date + 13 then
    raise exception 'Elige una fecha dentro de las próximas dos semanas'; end if;
  if (p_date + p_time) < v_now + interval '60 minutes' then
    raise exception 'Ese horario ya pasó o está muy cerca. Elige otro'; end if;
  if not exists (select 1 from public.availability a
                  where a.property_id = p_property and a.weekday = extract(dow from p_date)::int
                    and p_time = any (private.block_times(a.block))) then
    raise exception 'El propietario no recibe visitas a esa hora'; end if;
  begin
    insert into public.appointments (property_id, visit_date, visit_time, name, whatsapp, income_declared,
      household_size, has_pets, guarantee, credit_report, titular, move_in)
    values (p_property, p_date, p_time, trim(p_name), trim(p_whatsapp), p_income,
      p_household, coalesce(p_pets,false), p_guarantee, p_credit, p_titular, p_move_in)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ese horario se acaba de ocupar. Elige otro';
  end;
  return v_id;
end $$;

-- Funciones públicas: propietario (enlace privado)
create or replace function public.create_property(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_slug text; v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  loop
    v_slug := 'a-' || encode(extensions.gen_random_bytes(4), 'hex');
    exit when not exists (select 1 from public.properties where slug = v_slug);
  end loop;
  insert into public.properties (slug, mode, title, municipality, neighborhood, bedrooms, bathrooms, area_m2,
    estrato, floor, extras, rent, admin_fee, guarantees, income_multiplier, pets_allowed, available_from,
    lease_end, agency_name, assignment_authorized)
  values (v_slug,
    coalesce(nullif(p->>'mode',''),'arriendo'), trim(p->>'title'),
    coalesce(nullif(trim(p->>'municipality'),''),'Madrid, Cundinamarca'), nullif(trim(p->>'neighborhood'),''),
    nullif(p->>'bedrooms','')::smallint, nullif(p->>'bathrooms','')::smallint, nullif(p->>'area_m2','')::numeric,
    nullif(p->>'estrato','')::smallint, nullif(p->>'floor','')::smallint, nullif(trim(p->>'extras'),''),
    (p->>'rent')::int, coalesce(nullif(p->>'admin_fee','')::int,0),
    case when jsonb_typeof(p->'guarantees') = 'array' then array(select jsonb_array_elements_text(p->'guarantees')) else '{poliza,codeudor}' end,
    coalesce(nullif(p->>'income_multiplier','')::numeric,2), coalesce((p->>'pets_allowed')::boolean,true),
    coalesce(nullif(trim(p->>'available_from'),''),'Inmediato'), nullif(p->>'lease_end','')::date,
    nullif(trim(p->>'agency_name'),''), coalesce((p->>'assignment_authorized')::boolean,false))
  returning id into v_id;
  insert into private.property_tokens (property_id, token_hash) values (v_id, extensions.digest(v_token, 'sha256'));
  perform private.write_availability(v_id, p->'availability');
  return jsonb_build_object('slug', v_slug, 'token', v_token);
end $$;

create or replace function public.owner_get(p_slug text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := private.resolve_owner(p_slug, p_token);
begin
  return jsonb_build_object(
    'property', (select to_jsonb(p) from public.properties p where p.id = v_id),
    'availability', coalesce((select jsonb_agg(jsonb_build_object('weekday', weekday, 'block', block))
                                from public.availability where property_id = v_id), '[]'::jsonb),
    'appointments', coalesce((select jsonb_agg(to_jsonb(a) order by a.visit_date, a.visit_time)
                                from public.appointments a
                               where a.property_id = v_id and a.visit_date >= private.now_bogota()::date - 30), '[]'::jsonb),
    'rejections', coalesce((select jsonb_agg(jsonb_build_object('reasons', reasons, 'created_at', created_at) order by created_at desc)
                              from public.rejections where property_id = v_id), '[]'::jsonb));
end $$;

create or replace function public.owner_update_property(p_slug text, p_token text, p jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid := private.resolve_owner(p_slug, p_token);
begin
  update public.properties set
    mode = coalesce(nullif(p->>'mode',''), mode),
    title = coalesce(nullif(trim(p->>'title'),''), title),
    municipality = coalesce(nullif(trim(p->>'municipality'),''), municipality),
    neighborhood = nullif(trim(p->>'neighborhood'),''),
    bedrooms = nullif(p->>'bedrooms','')::smallint,
    bathrooms = nullif(p->>'bathrooms','')::smallint,
    area_m2 = nullif(p->>'area_m2','')::numeric,
    estrato = nullif(p->>'estrato','')::smallint,
    floor = nullif(p->>'floor','')::smallint,
    extras = nullif(trim(p->>'extras'),''),
    rent = coalesce(nullif(p->>'rent','')::int, rent),
    admin_fee = coalesce(nullif(p->>'admin_fee','')::int, 0),
    guarantees = case when jsonb_typeof(p->'guarantees') = 'array' then array(select jsonb_array_elements_text(p->'guarantees')) else guarantees end,
    income_multiplier = coalesce(nullif(p->>'income_multiplier','')::numeric, income_multiplier),
    pets_allowed = coalesce((p->>'pets_allowed')::boolean, pets_allowed),
    available_from = coalesce(nullif(trim(p->>'available_from'),''), 'Inmediato'),
    lease_end = nullif(p->>'lease_end','')::date,
    agency_name = nullif(trim(p->>'agency_name'),''),
    assignment_authorized = coalesce((p->>'assignment_authorized')::boolean, assignment_authorized),
    status = coalesce(nullif(p->>'status',''), status),
    updated_at = now()
  where id = v_id;
  if p ? 'availability' then perform private.write_availability(v_id, p->'availability'); end if;
end $$;

create or replace function public.owner_set_appointment_status(p_slug text, p_token text, p_id uuid, p_status text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid := private.resolve_owner(p_slug, p_token);
begin
  update public.appointments set status = p_status where id = p_id and property_id = v_id;
  if not found then raise exception 'No encontramos esa visita'; end if;
end $$;

-- Permisos
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function public.check_applicant(uuid,int,boolean,text,text) to anon, authenticated;
grant execute on function public.taken_slots(uuid) to anon, authenticated;
grant execute on function public.book_visit(uuid,date,time,text,text,int,int,boolean,text,text,text,text,boolean) to anon, authenticated;
grant execute on function public.create_property(jsonb) to anon, authenticated;
grant execute on function public.owner_get(text,text) to anon, authenticated;
grant execute on function public.owner_update_property(text,text,jsonb) to anon, authenticated;
grant execute on function public.owner_set_appointment_status(text,text,uuid,text) to anon, authenticated;
revoke insert, update, delete on public.properties, public.availability, public.appointments, public.rejections from anon, authenticated;
revoke select on public.appointments, public.rejections from anon, authenticated;
