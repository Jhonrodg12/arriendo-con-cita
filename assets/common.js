// Utilidades compartidas por todas las páginas.
const sb = window.supabase.createClient(CONFIG.url, CONFIG.key, { auth: { persistSession: false } });

const FR = {
  manana: { l: 'Mañana', s: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'] },
  tarde: { l: 'Tarde', s: ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30'] },
  noche: { l: 'Noche', s: ['18:00', '18:30', '19:00', '19:30'] }
};
const ORDEN = [1, 2, 3, 4, 5, 6, 0];
const DC = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const GAR = {
  poliza: 'Póliza con aseguradora',
  codeudor: 'Codeudor',
  fianza: 'Fianza (por ejemplo, Fianzacrédito)'
};
const GAR_INTERESADO = {
  poliza: 'Puedo pasar el estudio de una aseguradora (póliza)',
  codeudor: 'Tengo codeudor',
  fianza: 'Puedo tomar una fianza',
  no_se: 'Aún no sé'
};
const MUDANZA = { este_mes: 'Este mes', proximo_mes: 'Próximo mes', mas_adelante: 'En 2 meses o más' };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const cop = n => fmtCOP.format(n || 0);
const num = v => Number(String(v ?? '').replace(/\D/g, '')) || 0;
const multTxt = m => String(Number(m)).replace('.', ',');

function dkey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function hora12(h) { let [H, M] = h.split(':').map(Number); const ap = H >= 12 ? 'p. m.' : 'a. m.'; H = H % 12 || 12; return H + ':' + String(M).padStart(2, '0') + ' ' + ap; }
function fechaLarga(k) { return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseKey(k)); }
function fechaCorta(k) { return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(parseKey(k)); }
function dias(n) { const t = new Date(); t.setHours(0, 0, 0, 0); return Array.from({ length: n }, (_, i) => { const d = new Date(t); d.setDate(t.getDate() + i); return d; }); }

function errMsg(e) {
  const m = (e && (e.message || e.error_description)) || '';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No hay conexión. Revisa tu internet e intenta de nuevo.';
  if (/violates check constraint/i.test(m)) return 'Hay un dato fuera de rango. Revisa los valores e intenta de nuevo.';
  return m || 'Algo salió mal. Intenta de nuevo.';
}

function baseUrl() { return location.href.replace(/[^/]*([?#].*)?$/, ''); }
function fichaUrl(slug) { return baseUrl() + 'ver.html?a=' + slug; }
function panelUrl(slug, token) { return baseUrl() + 'panel.html#' + slug + '.' + token; }

function waNumber(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('3')) d = '57' + d;
  return d;
}
function waLink(tel, text) { return 'https://wa.me/' + waNumber(tel) + (text ? '?text=' + encodeURIComponent(text) : ''); }
function waShare(text) { return 'https://wa.me/?text=' + encodeURIComponent(text); }

async function copiar(texto, boton) {
  const original = boton.textContent;
  try { await navigator.clipboard.writeText(texto); boton.textContent = 'Copiado'; }
  catch (e) { const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); boton.textContent = 'Copiado'; } catch (_) { boton.textContent = 'Cópialo manualmente'; } t.remove(); }
  setTimeout(() => (boton.textContent = original), 1800);
}

function textoAviso(p, slug) {
  const enc = p.mode === 'cesion' ? 'SE CEDE CONTRATO de arriendo' : 'SE ARRIENDA';
  const specs = [p.bedrooms != null && p.bedrooms !== '' ? p.bedrooms + ' hab.' : '', p.bathrooms ? p.bathrooms + ' baños' : '', p.area_m2 ? p.area_m2 + ' m²' : '', p.estrato ? 'estrato ' + p.estrato : ''].filter(Boolean).join(', ');
  return `${enc}: ${p.title}${p.neighborhood ? ', ' + p.neighborhood : ''} (${p.municipality}).${specs ? ' ' + specs + '.' : ''}
Canon ${cop(p.rent)}${p.admin_fee ? ' + administración ' + cop(p.admin_fee) : ''}.
Requisitos, garantías y horarios de visita aquí. Agenda sin esperar respuesta:
${fichaUrl(slug)}`;
}

// Cuadrícula de disponibilidad (crear ficha y panel)
function renderDisp(container, set) {
  let h = '<span></span>' + Object.values(FR).map(f => `<span class="hd">${f.l}</span>`).join('');
  for (const d of ORDEN) {
    h += `<span class="dl">${DC[d]}</span>` + Object.keys(FR).map(f => {
      const on = set.has(d + ':' + f);
      return `<button type="button" class="tg" data-d="${d}" data-f="${f}" aria-pressed="${on}" aria-label="${DC[d]} ${FR[f].l}">${on ? 'Libre' : '—'}</button>`;
    }).join('');
  }
  container.innerHTML = h;
  container.onclick = e => {
    const b = e.target.closest('.tg'); if (!b) return;
    const k = b.dataset.d + ':' + b.dataset.f;
    set.has(k) ? set.delete(k) : set.add(k);
    renderDisp(container, set);
  };
}
function dispToArray(set) { return [...set].map(k => { const [w, b] = k.split(':'); return { weekday: Number(w), block: b }; }); }
function dispFromArray(arr) { return new Set((arr || []).map(x => x.weekday + ':' + x.block)); }

// Formulario de la ficha, compartido por "crear" y "panel"
function formFicha(p) {
  p = p || {};
  const g = new Set(p.guarantees || ['poliza', 'codeudor']);
  const ces = p.mode === 'cesion';
  return `
  <div class="field"><span>Qué publicas</span>
    <div class="seg" id="modo-seg">
      <button type="button" class="segb" data-v="arriendo" aria-pressed="${!ces}">Arriendo</button>
      <button type="button" class="segb" data-v="cesion" aria-pressed="${ces}">Cesión de contrato</button>
    </div>
  </div>
  <label>Título del aviso<input id="f-title" maxlength="120" required placeholder="Apartamento de 3 habitaciones en conjunto" value="${esc(p.title)}"></label>
  <div class="grid2">
    <label>Municipio o ciudad<input id="f-mun" maxlength="80" value="${esc(p.municipality || 'Madrid, Cundinamarca')}"></label>
    <label>Barrio o conjunto<input id="f-bar" maxlength="80" placeholder="Opcional" value="${esc(p.neighborhood)}"></label>
  </div>
  <div class="grid3">
    <label>Habitaciones<input id="f-hab" inputmode="numeric" value="${esc(p.bedrooms)}"></label>
    <label>Baños<input id="f-ban" inputmode="numeric" value="${esc(p.bathrooms)}"></label>
    <label>Área m²<input id="f-area" inputmode="decimal" value="${esc(p.area_m2)}"></label>
    <label>Estrato<select id="f-est"><option value="">—</option>${[1, 2, 3, 4, 5, 6].map(n => `<option ${p.estrato == n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Piso<input id="f-piso" inputmode="numeric" value="${esc(p.floor)}"></label>
    <label>Disponible<input id="f-disp" maxlength="60" value="${esc(p.available_from || 'Inmediato')}"></label>
  </div>
  <label>Otros detalles<textarea id="f-extras" maxlength="300" placeholder="Parqueadero, balcón, cerca al transporte...">${esc(p.extras)}</textarea></label>
  <div class="grid2">
    <label>${ces ? 'Canon vigente' : 'Canon mensual'}<input id="f-canon" inputmode="numeric" required value="${p.rent ? Number(p.rent).toLocaleString('es-CO') : ''}" placeholder="1.250.000"></label>
    <label>Administración<input id="f-admin" inputmode="numeric" value="${p.admin_fee ? Number(p.admin_fee).toLocaleString('es-CO') : ''}" placeholder="0 si está incluida"></label>
  </div>
  <div id="arr-fields" class="field" ${ces ? 'hidden' : ''}><span>Garantías que aceptas</span>
    ${Object.entries(GAR).map(([k, v]) => `<label class="check"><input type="checkbox" class="f-gar" value="${k}" ${g.has(k) ? 'checked' : ''}>${v}</label>`).join('')}
    <p class="help">La Ley 820 de 2003 no permite exigir depósitos en dinero como garantía en vivienda urbana.</p>
  </div>
  <div id="ces-fields" ${ces ? '' : 'hidden'} style="display:grid;gap:12px">
    <div class="grid2">
      <label>Contrato vigente hasta<input id="f-fin" type="date" value="${esc(p.lease_end)}"></label>
      <label>Inmobiliaria o arrendador<input id="f-inmo" maxlength="80" value="${esc(p.agency_name)}"></label>
    </div>
    <label class="check"><input type="checkbox" id="f-aut" ${p.assignment_authorized ? 'checked' : ''}>El arrendador o la inmobiliaria autorizó la cesión del contrato.</label>
    <p class="help">Sin esa autorización, la cesión puede ser causal para terminar el contrato (Ley 820, art. 17).</p>
  </div>
  <label>Ingreso mínimo del hogar
    <select id="f-mult">${[2, 2.5, 3].map(m => `<option value="${m}" ${Number(p.income_multiplier || 2) === m ? 'selected' : ''}>${multTxt(m)} veces el canon</option>`).join('')}</select>
  </label>
  <div class="field"><span>Mascotas</span>
    <div class="seg" id="masc-seg">
      <button type="button" class="segb" data-v="1" aria-pressed="${p.pets_allowed !== false}">Sí acepto</button>
      <button type="button" class="segb" data-v="0" aria-pressed="${p.pets_allowed === false}">No acepto</button>
    </div>
  </div>`;
}

function wireFormFicha(root, state) {
  state.mode = state.mode || 'arriendo';
  state.pets = state.pets !== false;
  $('#modo-seg', root).onclick = e => {
    const b = e.target.closest('.segb'); if (!b) return;
    state.mode = b.dataset.v;
    $$('#modo-seg .segb', root).forEach(x => x.setAttribute('aria-pressed', x === b));
    $('#ces-fields', root).hidden = state.mode !== 'cesion';
    $('#arr-fields', root).hidden = state.mode === 'cesion';
  };
  $('#masc-seg', root).onclick = e => {
    const b = e.target.closest('.segb'); if (!b) return;
    state.pets = b.dataset.v === '1';
    $$('#masc-seg .segb', root).forEach(x => x.setAttribute('aria-pressed', x === b));
  };
  $$('#f-canon, #f-admin', root).forEach(i => i.addEventListener('blur', () => { if (i.value) i.value = num(i.value).toLocaleString('es-CO'); }));
}

function leerFormFicha(root, state) {
  const v = id => $(id, root).value.trim();
  const p = {
    mode: state.mode,
    title: v('#f-title'), municipality: v('#f-mun'), neighborhood: v('#f-bar'),
    bedrooms: v('#f-hab').replace(/\D/g, ''), bathrooms: v('#f-ban').replace(/\D/g, ''),
    area_m2: v('#f-area').replace(',', '.').replace(/[^0-9.]/g, ''), estrato: v('#f-est'), floor: v('#f-piso').replace(/[^0-9-]/g, ''),
    available_from: v('#f-disp'), extras: v('#f-extras'),
    rent: num(v('#f-canon')), admin_fee: num(v('#f-admin')),
    guarantees: state.mode === 'cesion' ? ['poliza', 'codeudor', 'fianza'] : $$('.f-gar:checked', root).map(x => x.value),
    lease_end: state.mode === 'cesion' ? v('#f-fin') : '', agency_name: state.mode === 'cesion' ? v('#f-inmo') : '',
    assignment_authorized: state.mode === 'cesion' ? $('#f-aut', root).checked : false,
    income_multiplier: Number(v('#f-mult')), pets_allowed: state.pets
  };
  const errs = [];
  if (p.title.length < 3) errs.push('Escribe un título para el aviso.');
  if (p.rent < 100000) errs.push('Escribe el canon mensual.');
  if (!p.guarantees.length) errs.push('Elige al menos una garantía.');
  if (p.mode === 'cesion' && !p.assignment_authorized) errs.push('Para ceder el contrato necesitas la autorización del arrendador o la inmobiliaria.');
  return { p, errs };
}

// ---------- Fotos ----------
const MAX_FOTOS = 8;
function fotoUrl(path) { return CONFIG.url + '/storage/v1/object/public/fotos/' + path; }

// Reduce la foto en el celular (máx. 1600 px, JPEG) antes de subirla.
// Al redibujarla se pierden los metadatos, incluida la ubicación GPS de la cámara.
function comprimirFoto(file, max = 1600) {
  return new Promise((resolve, reject) => {
    if (file.type && !/^image\//.test(file.type)) return reject(new Error('"' + file.name + '" no es una imagen.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const intentar = q => c.toBlob(b => {
        if (!b) return reject(new Error('No pudimos procesar esa imagen.'));
        if (b.size > 1900000 && q > 0.5) return intentar(q - 0.15);
        resolve(b);
      }, 'image/jpeg', q);
      intentar(0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No pudimos abrir "' + file.name + '". Prueba con una foto JPG o PNG.')); };
    img.src = url;
  });
}

async function fotosApi(body) {
  const { data, error } = await sb.functions.invoke('fotos', { body });
  if (error) {
    let m = '';
    try { m = (await error.context.json()).error; } catch (_) {}
    throw new Error(m || 'No pudimos procesar la foto. Revisa tu conexión e intenta de nuevo.');
  }
  return data;
}

async function subirFoto(slug, token, file) {
  const blob = await comprimirFoto(file);
  const s = await fotosApi({ action: 'sign', slug, token });
  const { error } = await sb.storage.from('fotos').uploadToSignedUrl(s.path, s.token, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error('No se pudo subir la foto. Revisa tu conexión.');
  return (await fotosApi({ action: 'confirm', slug, token, path: s.path })).photo;
}

// Sube varias fotos en orden e informa el avance. Devuelve las subidas y los errores.
async function subirFotos(slug, token, files, onProgress) {
  const ok = [], fallas = [];
  for (let i = 0; i < files.length; i++) {
    onProgress && onProgress(i + 1, files.length);
    try { ok.push(await subirFoto(slug, token, files[i])); }
    catch (e) { fallas.push(e.message); if (/hasta \d+ fotos/.test(e.message)) break; }
  }
  return { ok, fallas };
}
