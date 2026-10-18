// Función de borde "fotos": valida el enlace privado del dueño y gestiona las fotos del inmueble.
// Acciones: sign (URL firmada para subir), confirm (registrar la foto subida), delete, cover (poner de portada).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const MAX_FOTOS = 8;
const BUCKET = 'fotos';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  try {
    const { action, slug, token, path, id } = await req.json();
    if (typeof slug !== 'string' || typeof token !== 'string') return json({ error: 'Enlace de propietario no válido' }, 401);

    const { data: pid, error: authError } = await sb.rpc('verify_owner', { p_slug: slug, p_token: token });
    if (authError || !pid) return json({ error: 'Enlace de propietario no válido' }, 401);

    const contar = async () => {
      const { count } = await sb.from('property_photos').select('id', { count: 'exact', head: true }).eq('property_id', pid);
      return count ?? 0;
    };

    if (action === 'sign') {
      if ((await contar()) >= MAX_FOTOS) return json({ error: `Puedes tener hasta ${MAX_FOTOS} fotos por inmueble` }, 400);
      const newPath = `${pid}/${crypto.randomUUID()}.jpg`;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(newPath);
      if (error) throw error;
      return json({ path: newPath, token: data.token });
    }

    if (action === 'confirm') {
      if (typeof path !== 'string' || !path.startsWith(`${pid}/`) || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(path)) {
        return json({ error: 'Ruta de foto no válida' }, 400);
      }
      const file = path.split('/')[1];
      const { data: found } = await sb.storage.from(BUCKET).list(pid, { search: file, limit: 1 });
      if (!found?.some((f) => f.name === file)) return json({ error: 'La foto no terminó de subir. Intenta de nuevo.' }, 400);
      if ((await contar()) >= MAX_FOTOS) {
        await sb.storage.from(BUCKET).remove([path]);
        return json({ error: `Puedes tener hasta ${MAX_FOTOS} fotos por inmueble` }, 400);
      }
      const { data: last } = await sb.from('property_photos').select('position').eq('property_id', pid)
        .order('position', { ascending: false }).limit(1);
      const position = (last?.[0]?.position ?? -1) + 1;
      const { data: photo, error } = await sb.from('property_photos')
        .upsert({ property_id: pid, path, position }, { onConflict: 'path' }).select('id, path, position').single();
      if (error) throw error;
      return json({ photo });
    }

    if (action === 'delete' || action === 'cover') {
      const { data: row } = await sb.from('property_photos').select('id, path').eq('id', id).eq('property_id', pid).maybeSingle();
      if (!row) return json({ error: 'No encontramos esa foto' }, 404);
      if (action === 'delete') {
        await sb.storage.from(BUCKET).remove([row.path]);
        const { error } = await sb.from('property_photos').delete().eq('id', row.id);
        if (error) throw error;
      } else {
        const { data: first } = await sb.from('property_photos').select('position').eq('property_id', pid)
          .order('position', { ascending: true }).limit(1);
        const { error } = await sb.from('property_photos').update({ position: (first?.[0]?.position ?? 0) - 1 }).eq('id', row.id);
        if (error) throw error;
      }
      return json({ ok: true });
    }

    return json({ error: 'Acción no válida' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'No pudimos procesar la foto. Intenta de nuevo.' }, 500);
  }
});
