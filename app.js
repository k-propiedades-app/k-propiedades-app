/* K Propiedades: app para guardar propiedades, personas, fotos, videos y documentos.
   Todo queda guardado en el celular (IndexedDB) y funciona sin conexión. */
'use strict';

// ---------- Base de datos local ----------
const DB_NOMBRE = 'kpropiedades';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((ok, mal) => {
    const r = indexedDB.open(DB_NOMBRE, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('props', { keyPath: 'id' });
      d.createObjectStore('personas', { keyPath: 'id' });
      d.createObjectStore('media', { keyPath: 'id' }).createIndex('propId', 'propId');
      d.createObjectStore('ajustes', { keyPath: 'k' });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  return dbp;
}
async function tx(store, modo, fn) {
  const d = await db();
  return new Promise((ok, mal) => {
    const t = d.transaction(store, modo);
    const res = fn(t.objectStore(store));
    t.oncomplete = () => ok(res && 'result' in res ? res.result : res);
    t.onerror = () => mal(t.error);
    t.onabort = () => mal(t.error);
  });
}
const todos = s => tx(s, 'readonly', o => o.getAll());
const uno = (s, id) => tx(s, 'readonly', o => o.get(id));
const guardar = (s, v) => tx(s, 'readwrite', o => o.put(v));
const borrar = (s, id) => tx(s, 'readwrite', o => o.delete(id));
const mediaDe = propId => tx('media', 'readonly', o => o.index('propId').getAll(propId));
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const AJUSTES_BASE = { corredora: 'K Propiedades', telefono: '+56 9 3499 7313', email: 'kliberona.b@gmail.com', hashtags: '#KPropiedades #propiedades #Chile', marcaAuto: true };
// Repositorio donde vive la vitrina pública (GitHub Pages).
const REPO = 'k-propiedades-app/k-propiedades-app';
const URL_VITRINA = 'https://k-propiedades-app.github.io/k-propiedades-app/vitrina/';
async function ajustes() {
  const r = await uno('ajustes', 'general');
  return Object.assign({}, AJUSTES_BASE, r ? r.v : {});
}

// ---------- Utilidades ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let urls = [];
function url(blob) { const u = URL.createObjectURL(blob); urls.push(u); return u; }
function limpiarUrls() { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; }
function aviso(txt) {
  const a = $('#aviso'); a.textContent = txt; a.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), 2600);
}
// Convierte "110.000" o "5.200,5" (formato chileno) a número.
function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const t = String(v).trim().replace(/\s|\$|UF/gi, '');
  return Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/[.,]/g, '')) || 0;
}
const plata = v => '$' + num(v).toLocaleString('es-CL');
function precioTxt(p) {
  if (!num(p.precio)) return '';
  const n = num(p.precio).toLocaleString('es-CL');
  return p.moneda === 'UF' ? `UF ${n}` : `$${n}`;
}
function telWhatsapp(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 9 && d[0] === '9') d = '56' + d;
  return d;
}
function elegirArchivos({ accept, multiple = true, capture = false }) {
  return new Promise(ok => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = multiple;
    if (capture) i.setAttribute('capture', 'environment');
    i.onchange = () => ok([...i.files]);
    i.click();
  });
}
function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- Fotos: tamaño y marca de agua ----------
let logoImg = null;
function cargarLogo() {
  if (!logoImg) logoImg = new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = 'logo.png'; });
  return logoImg;
}
async function imagen(blob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { /* sigue abajo */ }
  }
  return new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = URL.createObjectURL(blob); });
}
// Achica la foto (lado mayor 1600 px) y opcionalmente pone el logo abajo a la derecha con halo blanco.
async function procesarFoto(blob, conMarca) {
  const img = await imagen(blob);
  const max = 1600, esc_ = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * esc_), h = Math.round(img.height * esc_);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  if (conMarca) {
    const logo = await cargarLogo();
    const lw = Math.round(w * 0.24), lh = Math.round(logo.height * lw / logo.width);
    const m = Math.round(w * 0.03), x = w - lw - m, y = h - lh - m;
    g.save();
    g.shadowColor = 'rgba(255,255,255,0.95)'; g.shadowBlur = Math.max(8, lw * 0.06);
    for (let k = 0; k < 3; k++) g.drawImage(logo, x, y, lw, lh);
    g.restore();
    g.drawImage(logo, x, y, lw, lh);
  }
  return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.88));
}

// ---------- Navegación ----------
const pila = [];
let tab = 'propiedades';
function ir(vista, params = {}, reemplazar = false) {
  if (reemplazar) pila.pop(); else history.pushState({ n: pila.length + 1 }, '');
  pila.push({ vista, params });
  pintar();
}
function volver() { history.back(); }
window.addEventListener('popstate', () => {
  if (pila.length > 1) { pila.pop(); pintar(); }
});
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  tab = b.dataset.tab;
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('activo', x === b));
  pila.length = 0; pila.push({ vista: tab, params: {} });
  pintar();
});
$('#atras').onclick = volver;

const VISTAS = {};
async function pintar() {
  limpiarUrls();
  document.querySelectorAll('.fab, .visor').forEach(e => e.remove());
  const { vista, params } = pila[pila.length - 1];
  $('#atras').hidden = pila.length <= 1;
  const main = $('#vista');
  main.innerHTML = '';
  await VISTAS[vista](main, params);
  window.scrollTo(0, 0);
}
function titulo(t) { $('#titulo').textContent = t; document.title = t + ' · K Propiedades'; }
function fab(fn) {
  const b = document.createElement('button'); b.className = 'fab'; b.textContent = '+'; b.setAttribute('aria-label', 'Agregar');
  b.onclick = fn; document.body.appendChild(b);
}

// ---------- Propiedades ----------
const TIPOS = ['Departamento', 'Casa', 'Oficina', 'Local comercial', 'Terreno', 'Parcela', 'Bodega', 'Estacionamiento'];
const ESTADOS = ['Captar', 'Captada', 'Disponible', 'Negociando', 'Arrendada', 'Vendida'];
const ESTADO_ANTIGUO = { 'Captación': 'Captar', 'Publicada': 'Disponible', 'Pausada': 'Disponible', 'Reservada': 'Negociando' };
const estadoDe = p => ESTADO_ANTIGUO[p.estado] || (ESTADOS.includes(p.estado) ? p.estado : 'Captar');
const cerrada = p => ['Arrendada', 'Vendida'].includes(estadoDe(p));
const enVitrina = p => p.vitrina !== '' && ['Disponible', 'Negociando'].includes(estadoDe(p));
// Tareas de postventa (post atención) una vez arrendada o vendida.
const POSTVENTA = {
  Arrendada: ['Contrato firmado y copias entregadas', 'Acta de toma de razón firmada (medidores con foto)', 'Entrega de llaves',
    'Garantía y primer mes pagados', 'Llamada de seguimiento al mes', 'Revisión a los 6 meses', 'Aviso de renovación (2 meses antes del término)',
    'Pedir recomendación o reseña'],
  Vendida: ['Promesa firmada', 'Escritura firmada en notaría', 'Inscripción en el Conservador', 'Entrega de la propiedad y acta',
    'Cambio de titular de servicios (agua, luz, gas)', 'Llamada de seguimiento al mes', 'Pedir recomendación o reseña']
};
// Pasos de captación: al completarlos la propiedad queda lista para pasar a Disponible.
const CAPTACION = ['Visita en terreno realizada', 'Propietario y dominio vigente confirmados',
  'Cruce con datainmobiliaria.cl (m², contribuciones, valor de mercado)', 'Precio y comisión acordados con el propietario',
  'Orden de corretaje firmada', 'Fotos y video tomados'];
const enCaptacion = p => ['Captar', 'Captada'].includes(estadoDe(p));
function captacionDe(p) {
  const hechas = CAPTACION.filter(t => (p.captacion || {})[t]).length;
  return { tareas: CAPTACION, hechas, lista: hechas === CAPTACION.length };
}
// Foto de portada: la elegida o, si no hay, la primera.
function portadaDe(p, fotos) {
  return fotos.find(f => f.id === p.portada) || [...fotos].sort((a, b) => a.creado - b.creado)[0];
}
// Registra fechas útiles para el newsletter cuando cambia el estado.
function marcarCambioEstado(p, antes) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (estadoDe(p) === antes) return;
  if (cerrada(p)) p.fechaCierre = hoy;
  if (estadoDe(p) === 'Disponible' && !p.fechaDisponible) p.fechaDisponible = hoy;
}
function postventaDe(p) {
  const tareas = POSTVENTA[estadoDe(p)] || [];
  const hechas = tareas.filter(t => (p.postventa || {})[t]).length;
  return { tareas, hechas, pendiente: tareas.length > 0 && hechas < tareas.length };
}
function chipEstado(p) {
  const e = estadoDe(p), pv = postventaDe(p);
  const color = { Captar: 'gris', Captada: 'morado', Disponible: 'verde', Negociando: 'amarillo', Arrendada: 'azul', Vendida: 'azul' }[e];
  let s = `<span class="chip ${color}">${e}</span>`;
  if (enCaptacion(p)) { const c = captacionDe(p); s += `<span class="chip">${c.lista ? '✅ Lista para disponible' : `📋 Captación ${c.hechas}/${c.tareas.length}`}</span>`; }
  if (cerrada(p)) s += pv.pendiente ? `<span class="chip estrella">⭐ Postventa ${pv.hechas}/${pv.tareas.length}</span>` : '<span class="chip">✅ Postventa lista</span>';
  return s;
}

VISTAS.propiedades = async (main) => {
  titulo('Propiedades');
  const props = (await todos('props')).sort((a, b) => b.creado - a.creado);
  const fotos = (await todos('media')).filter(m => m.kind === 'foto');
  main.innerHTML = `
    <button class="btn sec ancho" id="irNews" style="margin:0 0 12px">📰 Newsletter para LinkedIn</button>
    <div class="barra">
      <input id="buscar" type="search" placeholder="Buscar por comuna, dirección, rol…">
      <select id="filtro" style="max-width:40%"><option value="">Todas</option>${ESTADOS.map(e => `<option>${e}</option>`).join('')}<option value="pv">⭐ Postventa pendiente</option></select>
    </div>
    <div class="resumen">${ESTADOS.map(e => `<span>${e} <b>${props.filter(p => estadoDe(p) === e).length}</b></span>`).join('')}
      <span>⭐ Postventa <b>${props.filter(p => postventaDe(p).pendiente).length}</b></span></div>
    <div class="lista" id="lista"></div>`;
  const listar = () => {
    const q = $('#buscar').value.toLowerCase(), f = $('#filtro').value;
    const vis = props.filter(p => (!f || (f === 'pv' ? postventaDe(p).pendiente : estadoDe(p) === f)) &&
      [p.titulo, p.direccion, p.comuna, p.rol, p.tipo].join(' ').toLowerCase().includes(q));
    $('#lista').innerHTML = vis.length ? '' : `<p class="vacio">${props.length ? 'Nada coincide con la búsqueda.' : 'Aún no hay propiedades.<br>Toca + para agregar la primera.'}</p>`;
    vis.forEach(p => {
      const foto = portadaDe(p, fotos.filter(m => m.propId === p.id));
      const b = document.createElement('button'); b.className = 'tarjeta';
      b.innerHTML = `${foto ? `<img src="${url(foto.blob)}" alt="">` : '<div class="sinfoto">🏠</div>'}
        <div class="info"><h3>${esc(p.titulo || p.tipo)}</h3>
        <div class="sub">${esc([p.direccion, p.comuna].filter(Boolean).join(', '))}</div>
        <span class="chip oro">${esc(p.operacion)}</span>${chipEstado(p)}${precioTxt(p) ? `<span class="chip">${precioTxt(p)}</span>` : ''}</div>`;
      b.onclick = () => ir('propiedad', { id: p.id });
      $('#lista').appendChild(b);
    });
  };
  $('#buscar').oninput = listar; $('#filtro').onchange = listar; listar();
  $('#irNews').onclick = () => ir('newsletter', {});
  fab(() => ir('editarProp', {}));
};

VISTAS.editarProp = async (main, { id }) => {
  const p = id ? await uno('props', id) : { id: nuevoId(), creado: Date.now(), tipo: 'Departamento', operacion: 'Arriendo', estado: 'Captar', moneda: 'CLP', vitrina: 'si' };
  p.estado = estadoDe(p);
  const estadoAntes = p.estado, precioAntes = p.precio;
  const personas = (await todos('personas')).sort((a, b) => a.nombre.localeCompare(b.nombre));
  titulo(id ? 'Editar propiedad' : 'Nueva propiedad');
  const opt = (arr, v) => arr.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('');
  const campo = (k, lbl, tipo = 'text', extra = '') => `<label>${lbl}</label><input name="${k}" type="${tipo}" value="${esc(p[k])}" ${extra}>`;
  main.innerHTML = `<form id="f">
    ${campo('titulo', 'Nombre corto (ej. Depto 2D2B Ñuñoa)')}
    <div class="fila"><div><label>Tipo</label><select name="tipo">${opt(TIPOS, p.tipo)}</select></div>
      <div><label>Operación</label><select name="operacion">${opt(['Arriendo', 'Venta'], p.operacion)}</select></div></div>
    <label>Estado del proceso</label><select name="estado">${opt(ESTADOS, p.estado)}</select>
    <label class="check"><input type="checkbox" name="vitrina" value="si" ${p.vitrina !== '' ? 'checked' : ''}> Mostrar en la vitrina pública (solo si está disponible o negociando)</label>
    ${campo('direccion', 'Dirección (privada, no sale en la vitrina)')}
    ${campo('ubicacionPublica', 'Ubicación para la vitrina (ej. a pasos de metro Ñuble)')}
    <div class="fila"><div>${campo('comuna', 'Comuna')}</div><div>${campo('rol', 'Rol SII')}</div></div>
    <div class="fila"><div>${campo('precio', 'Precio', 'text', 'inputmode="decimal" placeholder="ej. 105.000.000"')}</div>
      <div><label>Moneda</label><select name="moneda">${opt(['CLP', 'UF'], p.moneda)}</select></div></div>
    <div class="fila"><div>${campo('m2util', 'm² útiles', 'number', 'step="any"')}</div><div>${campo('m2total', 'm² totales', 'number', 'step="any"')}</div></div>
    <div class="fila"><div>${campo('dorm', 'Dormitorios', 'number')}</div><div>${campo('banos', 'Baños', 'number')}</div></div>
    <div class="fila"><div>${campo('estac', 'Estacionamientos', 'number')}</div><div>${campo('bodega', 'Bodegas', 'number')}</div></div>
    <div class="fila"><div>${campo('gastosComunes', 'Gastos comunes ($)', 'text', 'inputmode="decimal"')}</div><div>${campo('contribuciones', 'Contribuciones ($/trim.)', 'text', 'inputmode="decimal"')}</div></div>
    <label>Propietario</label><select name="propietarioId"><option value="">— Sin asignar —</option>
      ${personas.map(x => `<option value="${x.id}" ${x.id === p.propietarioId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>
    <label>Descripción para el aviso (se publica)</label><textarea name="descripcion">${esc(p.descripcion)}</textarea>
    <label>Notas internas (no se publican)</label><textarea name="notas">${esc(p.notas)}</textarea>
    <button class="btn ancho">Guardar</button>
    ${id ? '<button type="button" id="del" class="btn peligro ancho">Eliminar propiedad</button>' : ''}
  </form>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    Object.assign(p, { vitrina: '' }, Object.fromEntries(new FormData(e.target)));
    p.titulo = p.titulo || `${p.tipo} ${p.comuna || ''}`.trim();
    marcarCambioEstado(p, estadoAntes);
    if (precioAntes && p.precio && num(p.precio) < num(precioAntes)) {
      p.precioAnterior = precioAntes; p.fechaBajaPrecio = new Date().toISOString().slice(0, 10);
    }
    p.actualizado = Date.now();
    await guardar('props', p);
    aviso('Propiedad guardada');
    if (id) volver(); else ir('propiedad', { id: p.id }, true);
  };
  if (id) $('#del').onclick = async () => {
    if (!confirm('¿Eliminar esta propiedad con todas sus fotos, videos y documentos?')) return;
    for (const m of await mediaDe(id)) await borrar('media', m.id);
    await borrar('props', id);
    aviso('Propiedad eliminada');
    pila.length = 1; history.go(-2);
    pintar();
  };
};

const CATEGORIAS_DOC = ['Acta de toma de razón', 'Medidor de agua', 'Medidor de luz', 'Medidor de gas', 'Gastos comunes al día',
  'Orden de corretaje', 'Promesa de compraventa', 'Contrato de arriendo', 'Contrato de compraventa', 'Certificado / dominio', 'Otro'];

VISTAS.propiedad = async (main, { id }) => {
  const p = await uno('props', id);
  if (!p) { volver(); return; }
  titulo(p.titulo || p.tipo);
  const media = (await mediaDe(id)).sort((a, b) => a.creado - b.creado);
  const fotos = media.filter(m => m.kind === 'foto'), videos = media.filter(m => m.kind === 'video'), docs = media.filter(m => m.kind === 'doc');
  const personas = await todos('personas');
  const prop = personas.find(x => x.id === p.propietarioId);
  const interesados = personas.filter(x => x.propId === id && x.id !== p.propietarioId);
  const cfg = await ajustes();
  const fila = (k, v) => v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '';
  main.innerHTML = `
    <div class="seccion">
      <h2>${esc(p.titulo)} <button class="btn sec chico" id="editar">Editar</button></h2>
      <span class="chip oro">${esc(p.operacion)}</span><span id="chipsEstado">${chipEstado(p)}</span>${enVitrina(p) ? '<span class="chip">🌐 En vitrina</span>' : ''}
      <div class="estados" role="group" aria-label="Estado del proceso">
        ${ESTADOS.map(e => `<button data-estado="${e}" class="${estadoDe(p) === e ? 'activo' : ''}">${e}</button>`).join('')}
      </div>
      <dl class="datos" style="margin-top:10px">
        ${fila('Precio', precioTxt(p))}${fila('Dirección', p.direccion)}${fila('Comuna', p.comuna)}${fila('Ubic. pública', p.ubicacionPublica)}${fila('Rol', p.rol)}
        ${fila(estadoDe(p) === 'Vendida' ? 'Vendida el' : 'Arrendada el', cerrada(p) && p.fechaCierre ? new Date(p.fechaCierre + 'T12:00').toLocaleDateString('es-CL') : '')}
        ${fila('m² útiles', p.m2util)}${fila('m² totales', p.m2total)}${fila('Dormitorios', p.dorm)}${fila('Baños', p.banos)}
        ${fila('Estacionam.', p.estac)}${fila('Bodegas', p.bodega)}
        ${fila('Gastos com.', num(p.gastosComunes) && plata(p.gastosComunes))}
        ${fila('Contribuc.', num(p.contribuciones) && plata(p.contribuciones))}
      </dl>
      ${p.notas ? `<p class="sub" style="white-space:pre-wrap">📝 ${esc(p.notas)}</p>` : ''}
    </div>

    ${enCaptacion(p) ? (() => {
      const c = captacionDe(p);
      return `<div class="seccion captacion">
      <h2>📋 Captación (${c.hechas}/${c.tareas.length})</h2>
      <p class="sub" style="margin-top:0">Pasos antes de ofrecerla. Al completarlos puedes pasarla a Disponible.</p>
      ${c.tareas.map(t => `<label class="check"><input type="checkbox" data-capt="${esc(t)}" ${(p.captacion || {})[t] ? 'checked' : ''}> ${esc(t)}</label>`).join('')}
      <button class="btn ancho" id="aDisponible" ${c.lista ? '' : 'hidden'}>✅ Pasar a Disponible</button>
    </div>`;
    })() : ''}

    ${cerrada(p) ? (() => {
      const pv = postventaDe(p);
      return `<div class="seccion postventa">
      <h2>${pv.pendiente ? '⭐' : '✅'} Postventa (${pv.hechas}/${pv.tareas.length})</h2>
      <p class="sub" style="margin-top:0">${pv.pendiente ? 'Marca cada paso a medida que se cumple. La estrella se quita cuando todo está listo.' : 'Postventa completa. ¡Buen trabajo!'}</p>
      ${pv.tareas.map(t => `<label class="check"><input type="checkbox" data-tarea="${esc(t)}" ${(p.postventa || {})[t] ? 'checked' : ''}> ${esc(t)}</label>`).join('')}
    </div>`;
    })() : ''}

    <div class="seccion">
      <h2>Publicar</h2>
      <p class="sub" style="margin-top:0">Marca las fotos que quieres publicar (si no marcas ninguna van todas). Se comparten con marca de agua y con el texto del aviso listo.</p>
      <div class="acciones">
        <button class="btn" id="compartir">📤 Compartir aviso</button>
        <button class="btn sec" id="copiar">📋 Copiar texto</button>
        <button class="btn sec" id="pubFicha">🚀 Publicar en vitrina</button>
        <a class="btn sec" href="sticker.png" download="K_Propiedades_sticker.png">🏷️ Sticker del logo</a>
      </div>
    </div>

    <div class="seccion">
      <h2>Fotos (${fotos.length}) <span class="acciones"><button class="btn sec chico" id="camara">📷</button><button class="btn chico" id="addFoto">+ Galería</button></span></h2>
      <label class="check" style="margin-top:0"><input type="checkbox" id="verMarca" checked> Ver con marca de agua</label>
      <div class="galeria" id="galFotos" style="margin-top:8px">${fotos.length ? '' : '<p class="sub">Sin fotos.</p>'}</div>
    </div>

    <div class="seccion">
      <h2>Videos (${videos.length}) <span class="acciones"><button class="btn sec chico" id="grabar">🎥</button><button class="btn chico" id="addVideo">+ Galería</button></span></h2>
      <div class="galeria" id="galVideos">${videos.length ? '' : '<p class="sub">Sin videos.</p>'}</div>
    </div>

    <div class="seccion">
      <h2>Documentos (${docs.length}) <button class="btn chico" id="addDoc">+ Agregar</button></h2>
      <ul class="docs" id="listaDocs">${docs.length ? '' : '<li class="sub">Actas, fotos de medidores, contratos, promesas…</li>'}</ul>
    </div>

    <div class="seccion">
      <h2>Personas</h2>
      ${prop ? `<button class="tarjeta" data-persona="${prop.id}"><div class="info"><h3>${esc(prop.nombre)}</h3><span class="chip oro">Propietario</span></div></button>` : '<p class="sub">Sin propietario asignado (Editar).</p>'}
      <div class="lista" style="margin-top:8px">${interesados.map(x => `<button class="tarjeta" data-persona="${x.id}"><div class="info"><h3>${esc(x.nombre)}</h3><span class="chip">${esc(x.rol)}</span></div></button>`).join('')}</div>
    </div>`;

  $('#editar').onclick = () => ir('editarProp', { id });
  main.querySelectorAll('[data-estado]').forEach(b => b.onclick = async () => {
    const nuevo = b.dataset.estado;
    if (nuevo === estadoDe(p)) return;
    const antes = estadoDe(p);
    p.estado = nuevo; p.actualizado = Date.now();
    marcarCambioEstado(p, antes);
    await guardar('props', p);
    aviso(cerrada(p) ? `¡${nuevo}! Se activó la postventa ⭐` : `Estado: ${nuevo}`);
    pintar();
  });
  main.querySelectorAll('[data-capt]').forEach(ch => ch.onchange = async () => {
    p.captacion = Object.assign({}, p.captacion, { [ch.dataset.capt]: ch.checked ? new Date().toISOString().slice(0, 10) : '' });
    p.actualizado = Date.now();
    if (ch.checked && ch.dataset.capt === 'Orden de corretaje firmada' && estadoDe(p) === 'Captar') { p.estado = 'Captada'; aviso('Estado: Captada'); }
    await guardar('props', p);
    const c = captacionDe(p);
    main.querySelector('.captacion h2').textContent = `📋 Captación (${c.hechas}/${c.tareas.length})`;
    $('#aDisponible').hidden = !c.lista;
    $('#chipsEstado').innerHTML = chipEstado(p);
    main.querySelectorAll('[data-estado]').forEach(b => b.classList.toggle('activo', b.dataset.estado === estadoDe(p)));
  });
  if ($('#aDisponible')) $('#aDisponible').onclick = () => main.querySelector('[data-estado="Disponible"]').click();
  main.querySelectorAll('[data-tarea]').forEach(c => c.onchange = async () => {
    p.postventa = Object.assign({}, p.postventa, { [c.dataset.tarea]: c.checked ? new Date().toISOString().slice(0, 10) : '' });
    await guardar('props', p);
    const pv = postventaDe(p);
    if (!pv.pendiente) { aviso('Postventa completa ✅'); pintar(); }
    else {
      main.querySelector('.postventa h2').textContent = `⭐ Postventa (${pv.hechas}/${pv.tareas.length})`;
      $('#chipsEstado').innerHTML = chipEstado(p);
    }
  });
  main.querySelectorAll('[data-persona]').forEach(b => b.onclick = () => ir('persona', { id: b.dataset.persona }));

  // Galería de fotos
  const seleccion = new Set();
  const pintarFotos = () => {
    if (!fotos.length) return;
    const g = $('#galFotos'); g.innerHTML = '';
    const conMarca = $('#verMarca').checked;
    fotos.forEach(f => {
      const d = document.createElement('div'); d.className = 'item';
      d.innerHTML = `<img src="${url(conMarca ? f.blobMarca || f.blob : f.blob)}" alt="" loading="lazy">
        ${conMarca && f.blobMarca ? '<span class="marca">con marca</span>' : ''}${portadaDe(p, fotos) === f ? '<span class="portada">★ Portada</span>' : ''}
        <input type="checkbox" class="sel" ${seleccion.has(f.id) ? 'checked' : ''} aria-label="Seleccionar">`;
      d.querySelector('.sel').onchange = e => { e.target.checked ? seleccion.add(f.id) : seleccion.delete(f.id); };
      d.querySelector('img').onclick = () => visor(f, 'foto');
      g.appendChild(d);
    });
  };
  $('#verMarca').onchange = pintarFotos; pintarFotos();

  const agregarFotos = async capture => {
    const files = await elegirArchivos({ accept: 'image/*', capture, multiple: !capture });
    if (!files.length) return;
    aviso(`Procesando ${files.length} foto(s)…`);
    let fallidas = 0;
    for (const file of files) {
      try {
        const blob = await procesarFoto(file, false);
        const blobMarca = cfg.marcaAuto ? await procesarFoto(file, true) : null;
        if (!blob) throw new Error('foto vacía');
        await guardar('media', { id: nuevoId(), propId: id, kind: 'foto', name: file.name, blob, blobMarca, creado: Date.now() });
      } catch (e) { fallidas++; }
    }
    if (fallidas) alert(`${fallidas} foto(s) no se pudieron leer. Prueba con otra foto o en formato JPG.`);
    else aviso('Fotos guardadas');
    pintar();
  };
  $('#addFoto').onclick = () => agregarFotos(false);
  $('#camara').onclick = () => agregarFotos(true);

  // Videos
  videos.forEach(v => {
    const d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<video src="${url(v.blob)}#t=0.5" muted playsinline preload="metadata"></video><span class="marca">▶ video</span>`;
    d.onclick = () => visor(v, 'video');
    $('#galVideos').appendChild(d);
  });
  const agregarVideos = async capture => {
    const files = await elegirArchivos({ accept: 'video/*', capture, multiple: !capture });
    for (const file of files) await guardar('media', { id: nuevoId(), propId: id, kind: 'video', name: file.name, type: file.type, blob: file, creado: Date.now() });
    if (files.length) { aviso('Video guardado'); pintar(); }
  };
  $('#addVideo').onclick = () => agregarVideos(false);
  $('#grabar').onclick = () => agregarVideos(true);

  // Documentos
  docs.forEach(doc => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${doc.type && doc.type.startsWith('image/') ? '🖼️' : '📄'}</span>
      <div class="nom"><div>${esc(doc.categoria)}</div><div class="sub">${esc(doc.name)} · ${new Date(doc.creado).toLocaleDateString('es-CL')}</div></div>
      <button class="btn sec chico">Abrir</button>`;
    li.querySelector('button').onclick = () => visor(doc, 'doc');
    $('#listaDocs').appendChild(li);
  });
  $('#addDoc').onclick = async () => {
    const cat = await elegirCategoria();
    if (!cat) return;
    const files = await elegirArchivos({ accept: 'image/*,application/pdf,.doc,.docx' });
    for (const file of files) {
      const blob = file.type.startsWith('image/') ? await procesarFoto(file, false) : file;
      await guardar('media', { id: nuevoId(), propId: id, kind: 'doc', categoria: cat, name: file.name, type: blob.type || file.type, blob, creado: Date.now() });
    }
    if (files.length) { aviso('Documento guardado'); pintar(); }
  };

  // Publicar
  const texto = () => textoAviso(p, cfg);
  $('#copiar').onclick = async () => { await copiar(texto()); };
  $('#pubFicha').onclick = e => publicarVitrina(e.target);
  $('#compartir').onclick = async () => {
    const elegidas = seleccion.size ? fotos.filter(f => seleccion.has(f.id)) : fotos;
    const base = (p.titulo || 'propiedad').replace(/[^\w]+/g, '_');
    const files = elegidas.map((f, i) => new File([f.blobMarca || f.blob], `${base}_${i + 1}.jpg`, { type: 'image/jpeg' }));
    await compartir(files, texto());
  };
};

function textoAviso(p, cfg) {
  const l = [];
  l.push(`🏠 ${p.tipo} en ${p.operacion.toLowerCase()}${p.comuna ? ' en ' + p.comuna : ''}`);
  if (precioTxt(p)) l.push(`💰 ${precioTxt(p)}${p.operacion === 'Arriendo' && p.moneda !== 'UF' ? ' mensual' : ''}`);
  const m = [p.m2util && `${p.m2util} m² útiles`, p.m2total && `${p.m2total} m² totales`].filter(Boolean).join(' / ');
  if (m) l.push(`📐 ${m}`);
  const c = [p.dorm && `${p.dorm} dorm.`, p.banos && `${p.banos} baño(s)`, Number(p.estac) && `${p.estac} estac.`, Number(p.bodega) && `${p.bodega} bodega`].filter(Boolean).join(' · ');
  if (c) l.push(`🛏️ ${c}`);
  if (num(p.gastosComunes)) l.push(`🧾 Gastos comunes aprox. ${plata(p.gastosComunes)}`);
  if (p.descripcion) l.push('', p.descripcion);
  l.push('', `📲 ${cfg.corredora}${cfg.telefono ? ' · ' + cfg.telefono : ''}${cfg.email ? ' · ' + cfg.email : ''}`);
  const tags = [cfg.hashtags, p.comuna && '#' + p.comuna.replace(/\s+/g, ''), '#' + (p.operacion === 'Venta' ? 'venta' : 'arriendo')].filter(Boolean).join(' ');
  l.push('', tags);
  return l.join('\n');
}
async function copiar(t) {
  try { await navigator.clipboard.writeText(t); aviso('Texto copiado'); }
  catch (e) { prompt('Copia el texto:', t); }
}
// Abre el menú de compartir del celular (Instagram, Facebook, WhatsApp, Marketplace…).
async function compartir(files, text) {
  try {
    if (files.length && navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.clipboard.writeText(text || ''); } catch (e) { /* no importa */ }
      await navigator.share({ files, text });
      if (text) aviso('Texto copiado también, por si la app no lo pega sola');
      return;
    }
    if (!files.length && navigator.share) { await navigator.share({ text }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  // Sin menú de compartir (ej. computador): descarga archivos y copia el texto.
  files.forEach(f => descargar(f, f.name));
  if (text) await copiar(text);
  aviso('Archivos descargados y texto copiado');
}
function elegirCategoria() {
  return new Promise(ok => {
    const v = document.createElement('div'); v.className = 'visor';
    v.innerHTML = `<div class="cuerpo" style="padding:16px"><div class="seccion" style="width:100%;max-width:420px">
      <h2>Tipo de documento</h2><select id="cat">${CATEGORIAS_DOC.map(c => `<option>${c}</option>`).join('')}</select>
      <div class="acciones" style="margin-top:12px"><button class="btn sec" id="no">Cancelar</button><button class="btn" id="si">Elegir archivo</button></div></div></div>`;
    document.body.appendChild(v);
    v.querySelector('#no').onclick = () => { v.remove(); ok(null); };
    v.querySelector('#si').onclick = () => { const c = v.querySelector('#cat').value; v.remove(); ok(c); };
  });
}
function visor(m, tipo) {
  const v = document.createElement('div'); v.className = 'visor';
  const blob = tipo === 'foto' ? m.blobMarca || m.blob : m.blob;
  let cuerpo;
  if (tipo === 'video') cuerpo = `<video src="${url(blob)}" controls autoplay playsinline></video>`;
  else if (tipo === 'foto' || (m.type || '').startsWith('image/')) cuerpo = `<img src="${url(blob)}" alt="">`;
  else cuerpo = `<div style="color:#fff;text-align:center">📄<br>${esc(m.name)}</div>`;
  v.innerHTML = `<div class="cuerpo">${cuerpo}</div><div class="pie">
    <button class="btn sec" data-a="cerrar">Cerrar</button>
    ${tipo === 'foto' ? '<button class="btn sec" data-a="portada">★ Portada</button>' : ''}
    ${tipo === 'foto' && m.blobMarca ? '<button class="btn sec" data-a="sin">Compartir sin marca</button>' : ''}
    ${tipo === 'doc' && !(m.type || '').startsWith('image/') ? '<button class="btn sec" data-a="abrir">Abrir</button>' : ''}
    <button class="btn" data-a="compartir">Compartir</button>
    <button class="btn peligro" data-a="borrar">Eliminar</button></div>`;
  document.body.appendChild(v);
  const ext = tipo === 'video' ? (m.name.split('.').pop() || 'mp4') : null;
  const archivo = (b, sufijo = '') => new File([b], tipo === 'foto' ? `foto${sufijo}.jpg` : (m.name || `archivo.${ext}`), { type: b.type || m.type });
  v.onclick = async e => {
    const a = e.target.dataset.a;
    if (!a) return;
    if (a === 'cerrar') v.remove();
    if (a === 'portada') {
      const p = await uno('props', m.propId);
      p.portada = m.id; p.actualizado = Date.now();
      await guardar('props', p);
      v.remove(); aviso('Foto de portada elegida. Publica la vitrina para verla ahí.'); pintar();
    }
    if (a === 'compartir') await compartir([archivo(blob)], '');
    if (a === 'sin') await compartir([archivo(m.blob, '_sin_marca')], '');
    if (a === 'abrir') window.open(url(m.blob), '_blank');
    if (a === 'borrar' && confirm('¿Eliminar este archivo?')) { await borrar('media', m.id); v.remove(); aviso('Eliminado'); pintar(); }
  };
}

// ---------- Newsletter ----------
function lineaProp(p, conLink = true, extra = '') {
  const datos = [precioTxt(p) && precioTxt(p) + (p.operacion === 'Arriendo' && p.moneda !== 'UF' ? '/mes' : ''),
    (p.m2util || p.m2total) && `${p.m2util || p.m2total} m²`, p.dorm && `${p.dorm}D`, p.banos && `${p.banos}B`].filter(Boolean).join(' · ');
  return `• ${p.tipo} en ${p.operacion.toLowerCase()}${p.comuna ? ', ' + p.comuna : ''}${datos ? ' · ' + datos : ''}` +
    extra + (conLink ? `\n  👉 ${URL_VITRINA}#p=${p.id}` : '');
}
function textoNewsletter(props, dias, cfg) {
  const desde = Date.now() - dias * 864e5;
  const fecha = f => f ? new Date(f + 'T12:00').getTime() : 0;
  const enPeriodo = f => fecha(f) >= desde;
  const vis = p => p.vitrina !== '' && ['Disponible', 'Negociando'].includes(estadoDe(p));
  const nuevas = props.filter(p => vis(p) && enPeriodo(p.fechaDisponible || new Date(p.creado).toISOString().slice(0, 10)));
  const bajas = props.filter(p => vis(p) && p.precioAnterior && enPeriodo(p.fechaBajaPrecio) && !nuevas.includes(p));
  const cerradas = props.filter(p => cerrada(p) && enPeriodo(p.fechaCierre));
  const otras = props.filter(p => vis(p) && !nuevas.includes(p) && !bajas.includes(p));
  const mes = new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  const l = [`📰 Novedades K Propiedades · ${mes.charAt(0).toUpperCase() + mes.slice(1)}`, '',
    '¡Hola! Te compartimos las novedades de nuestra cartera de propiedades.'];
  if (nuevas.length) l.push('', '🆕 Nuevas propiedades', ...nuevas.map(p => lineaProp(p)));
  if (bajas.length) l.push('', '📉 Bajaron de precio', ...bajas.map(p => lineaProp(p, true,
    ` (antes ${p.moneda === 'UF' ? 'UF ' : '$'}${num(p.precioAnterior).toLocaleString('es-CL')})`)));
  if (cerradas.length) l.push('', '🔑 Arrendadas y vendidas', ...cerradas.map(p =>
    `• ${p.tipo}${p.comuna ? ' en ' + p.comuna : ''}: ¡${estadoDe(p).toLowerCase().slice(0, -1)}${['Casa', 'Oficina', 'Parcela', 'Bodega'].includes(p.tipo) ? 'a' : 'o'}! Gracias por confiar en nosotros.`));
  if (otras.length) l.push('', '🏠 También disponibles', ...otras.slice(0, 8).map(p => lineaProp(p)));
  if (!nuevas.length && !bajas.length && !cerradas.length && !otras.length) l.push('', '(No hay propiedades para mostrar en este período.)');
  l.push('', '¿Quieres arrendar o vender tu propiedad? Te acompañamos en todo el proceso, desde la captación hasta la postventa.',
    `📲 ${cfg.telefono}${cfg.email ? ' · ✉️ ' + cfg.email : ''}`, `🌐 Todas las propiedades: ${URL_VITRINA}`, '',
    `${cfg.hashtags} #CorretajeDePropiedades #BienesRaíces`);
  return { texto: l.join('\n'), n: { nuevas: nuevas.length, bajas: bajas.length, cerradas: cerradas.length, otras: otras.length } };
}

VISTAS.newsletter = async (main) => {
  titulo('Newsletter');
  const props = await todos('props'), cfg = await ajustes();
  main.innerHTML = `<div class="seccion">
      <h2>Newsletter para LinkedIn</h2>
      <p class="sub" style="margin-top:0">Se arma solo con las propiedades nuevas, las que bajaron de precio y las arrendadas o vendidas en el período. Revisa y ajusta el texto antes de publicar.</p>
      <label>Período</label>
      <select id="periodo"><option value="7">Última semana</option><option value="15">Últimos 15 días</option><option value="30" selected>Último mes</option><option value="90">Últimos 3 meses</option></select>
      <p class="sub" id="resumenNl"></p>
      <textarea id="textoNl" style="min-height:340px;font-size:15px"></textarea>
      <div class="acciones" style="margin-top:10px">
        <button class="btn" id="nlCopiar">📋 Copiar</button>
        <button class="btn sec" id="nlCompartir">📤 Compartir</button>
        <button class="btn sec" id="nlLinkedin">💼 Abrir LinkedIn</button>
      </div>
      <p class="sub">Para que los links funcionen, primero publica la vitrina (Ajustes → Publicar en vitrina).</p>
    </div>`;
  const generar = () => {
    const r = textoNewsletter(props, Number($('#periodo').value), cfg);
    $('#textoNl').value = r.texto;
    $('#resumenNl').textContent = `${r.n.nuevas} nueva(s) · ${r.n.bajas} con baja de precio · ${r.n.cerradas} arrendada(s)/vendida(s) · ${r.n.otras} otra(s) disponible(s)`;
  };
  $('#periodo').onchange = generar; generar();
  $('#nlCopiar').onclick = () => copiar($('#textoNl').value);
  $('#nlCompartir').onclick = () => compartir([], $('#textoNl').value);
  $('#nlLinkedin').onclick = async () => {
    try { await navigator.clipboard.writeText($('#textoNl').value); } catch (e) { /* sin portapapeles */ }
    aviso('Texto copiado: pégalo en la publicación');
    window.open('https://www.linkedin.com/feed/?shareActive=true&text=' + encodeURIComponent($('#textoNl').value), '_blank', 'noopener');
  };
};

// ---------- Personas ----------
const ROLES = ['Propietario', 'Arrendatario', 'Comprador', 'Interesado', 'Otro'];

VISTAS.personas = async (main) => {
  titulo('Personas');
  const personas = (await todos('personas')).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const props = await todos('props');
  main.innerHTML = `<div class="barra"><input id="buscar" type="search" placeholder="Buscar por nombre, RUT, teléfono…">
    <select id="filtro" style="max-width:40%"><option value="">Todos</option>${ROLES.map(r => `<option>${r}</option>`).join('')}</select></div>
    <div class="lista" id="lista"></div>`;
  const listar = () => {
    const q = $('#buscar').value.toLowerCase(), f = $('#filtro').value;
    const vis = personas.filter(x => (!f || x.rol === f) && [x.nombre, x.rut, x.telefono, x.email].join(' ').toLowerCase().includes(q));
    $('#lista').innerHTML = vis.length ? '' : `<p class="vacio">${personas.length ? 'Nada coincide.' : 'Aún no hay personas.<br>Toca + para agregar propietarios y clientes.'}</p>`;
    vis.forEach(x => {
      const pr = props.find(p => p.id === x.propId);
      const b = document.createElement('button'); b.className = 'tarjeta';
      b.innerHTML = `<div class="sinfoto">${x.rol === 'Propietario' ? '🔑' : '🙂'}</div><div class="info"><h3>${esc(x.nombre)}</h3>
        <div class="sub">${esc(x.telefono || x.email || '')}</div><span class="chip oro">${esc(x.rol)}</span>${pr ? `<span class="chip">${esc(pr.titulo)}</span>` : ''}</div>`;
      b.onclick = () => ir('persona', { id: x.id });
      $('#lista').appendChild(b);
    });
  };
  $('#buscar').oninput = listar; $('#filtro').onchange = listar; listar();
  fab(() => ir('editarPersona', {}));
};

VISTAS.persona = async (main, { id }) => {
  const x = await uno('personas', id);
  if (!x) { volver(); return; }
  titulo(x.nombre);
  const props = await todos('props');
  const suyas = props.filter(p => p.propietarioId === id);
  const interes = props.find(p => p.id === x.propId);
  const wa = telWhatsapp(x.telefono);
  main.innerHTML = `<div class="seccion"><h2>${esc(x.nombre)} <button class="btn sec chico" id="editar">Editar</button></h2>
      <span class="chip oro">${esc(x.rol)}</span>
      <dl class="datos" style="margin-top:10px">
        ${x.rut ? `<dt>RUT</dt><dd>${esc(x.rut)}</dd>` : ''}${x.telefono ? `<dt>Teléfono</dt><dd>${esc(x.telefono)}</dd>` : ''}
        ${x.email ? `<dt>Correo</dt><dd>${esc(x.email)}</dd>` : ''}${x.busca ? `<dt>Busca</dt><dd>${esc(x.busca)}</dd>` : ''}
      </dl>
      ${x.notas ? `<p class="sub" style="white-space:pre-wrap">📝 ${esc(x.notas)}</p>` : ''}
      <div class="acciones" style="margin-top:10px">
        ${x.telefono ? `<a class="btn" href="tel:${esc(x.telefono)}">📞 Llamar</a>` : ''}
        ${wa ? `<a class="btn" href="https://wa.me/${wa}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
        ${x.email ? `<a class="btn sec" href="mailto:${esc(x.email)}">✉️ Correo</a>` : ''}
      </div></div>
    <div class="seccion"><h2>Propiedades</h2><div class="lista" id="lp"></div></div>`;
  const lista = [...suyas.map(p => [p, 'Dueño']), ...(interes && !suyas.includes(interes) ? [[interes, 'Interesado']] : [])];
  $('#lp').innerHTML = lista.length ? '' : '<p class="sub">Ninguna vinculada.</p>';
  lista.forEach(([p, r]) => {
    const b = document.createElement('button'); b.className = 'tarjeta';
    b.innerHTML = `<div class="info"><h3>${esc(p.titulo)}</h3><span class="chip">${r}</span>${chipEstado(p)}</div>`;
    b.onclick = () => ir('propiedad', { id: p.id });
    $('#lp').appendChild(b);
  });
  $('#editar').onclick = () => ir('editarPersona', { id });
};

VISTAS.editarPersona = async (main, { id }) => {
  const x = id ? await uno('personas', id) : { id: nuevoId(), creado: Date.now(), rol: 'Interesado', nombre: '' };
  const props = (await todos('props')).sort((a, b) => (a.titulo || '').localeCompare(b.titulo || ''));
  titulo(id ? 'Editar persona' : 'Nueva persona');
  const campo = (k, lbl, tipo = 'text', extra = '') => `<label>${lbl}</label><input name="${k}" type="${tipo}" value="${esc(x[k])}" ${extra}>`;
  main.innerHTML = `<form id="f">
    ${campo('nombre', 'Nombre completo', 'text', 'required')}
    <label>Rol</label><select name="rol">${ROLES.map(r => `<option ${r === x.rol ? 'selected' : ''}>${r}</option>`).join('')}</select>
    <div class="fila"><div>${campo('rut', 'RUT')}</div><div>${campo('telefono', 'Teléfono', 'tel', 'placeholder="+56 9 …"')}</div></div>
    ${campo('email', 'Correo', 'email')}
    <label>Propiedad de interés</label><select name="propId"><option value="">— Ninguna —</option>
      ${props.map(p => `<option value="${p.id}" ${p.id === x.propId ? 'selected' : ''}>${esc(p.titulo)}</option>`).join('')}</select>
    ${campo('busca', 'Qué busca (ej. 2D en Ñuñoa hasta $650.000)')}
    <label>Notas</label><textarea name="notas">${esc(x.notas)}</textarea>
    <button class="btn ancho">Guardar</button>
    ${id ? '<button type="button" id="del" class="btn peligro ancho">Eliminar persona</button>' : ''}
  </form>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    Object.assign(x, Object.fromEntries(new FormData(e.target)));
    await guardar('personas', x);
    aviso('Persona guardada');
    if (id) volver(); else ir('persona', { id: x.id }, true);
  };
  if (id) $('#del').onclick = async () => {
    if (!confirm('¿Eliminar a esta persona?')) return;
    await borrar('personas', id);
    pila.length = 1; history.go(-2); pintar();
  };
};

// ---------- Ajustes y respaldo ----------
let instalar = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalar = e; });

VISTAS.ajustes = async (main) => {
  titulo('Ajustes');
  const cfg = await ajustes();
  const gh = await tokenGitHub();
  let uso = '';
  if (navigator.storage && navigator.storage.estimate) {
    const e = await navigator.storage.estimate();
    uso = `Usando ${(e.usage / 1048576).toFixed(1)} MB del celular.`;
  }
  main.innerHTML = `
    ${instalar ? '<div class="seccion"><h2>Instalar</h2><button class="btn ancho" id="inst">📲 Instalar en este celular</button></div>' : ''}
    <form class="seccion" id="f"><h2>Datos para los avisos</h2>
      <label>Nombre de la corredora</label><input name="corredora" value="${esc(cfg.corredora)}">
      <label>Teléfono de contacto</label><input name="telefono" type="tel" value="${esc(cfg.telefono)}">
      <label>Correo de contacto</label><input name="email" type="email" value="${esc(cfg.email)}">
      <label>Hashtags</label><input name="hashtags" value="${esc(cfg.hashtags)}">
      <label class="check"><input type="checkbox" name="marcaAuto" ${cfg.marcaAuto ? 'checked' : ''}> Crear versión con marca de agua al agregar fotos</label>
      <button class="btn ancho">Guardar</button>
    </form>
    <div class="seccion"><h2>Vitrina pública</h2>
      <p class="sub" style="margin-top:0">Página para clientes con las propiedades disponibles o en negociación marcadas "Mostrar en la vitrina". Solo sale información pública: fotos con marca, precio, m², comuna y descripción.</p>
      <a class="btn sec ancho" href="${URL_VITRINA}" target="_blank" rel="noopener">🌐 Ver vitrina</a>
      <button class="btn ancho" id="pub">🚀 Publicar en vitrina</button>
      <label>Llave de publicación de GitHub ${gh ? '✅ guardada' : '(se pide una sola vez)'}</label>
      <input id="token" type="password" placeholder="${gh ? '•••••••• (guardada en este celular)' : 'github_pat_…'}" autocomplete="off">
      <button class="btn sec ancho" id="guardarToken">Guardar llave</button></div>
    <div class="seccion"><h2>Logo para videos</h2>
      <p class="sub" style="margin-top:0">Guárdalo en la galería y agrégalo como sticker de foto al publicar Reels o historias.</p>
      <a class="btn sec ancho" href="sticker.png" download="K_Propiedades_sticker.png">🏷️ Descargar sticker</a></div>
    <div class="seccion"><h2>Respaldo</h2>
      <p class="sub" style="margin-top:0">Los datos viven en este celular. ${uso} Haz un respaldo cada semana y súbelo a Google Drive.</p>
      <button class="btn ancho" id="exp">💾 Descargar respaldo</button>
      <button class="btn sec ancho" id="imp">📥 Restaurar desde respaldo</button></div>
    <p class="sub" style="text-align:center">K Propiedades · app open source</p>`;
  if (instalar) $('#inst').onclick = async () => { instalar.prompt(); await instalar.userChoice; instalar = null; pintar(); };
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    v.marcaAuto = !!v.marcaAuto;
    await guardar('ajustes', { k: 'general', v });
    aviso('Ajustes guardados');
  };
  $('#exp').onclick = exportar;
  $('#imp').onclick = importar;
  $('#guardarToken').onclick = async () => {
    const t = $('#token').value.trim();
    if (!t) return;
    await guardar('ajustes', { k: 'github', v: t });
    aviso('Llave guardada'); pintar();
  };
  $('#pub').onclick = e => publicarVitrina(e.target);
};

// ---------- Vitrina pública: sube datos y fotos al repositorio en un solo cambio ----------
async function tokenGitHub() { const r = await uno('ajustes', 'github'); return r ? r.v : ''; }
const aB64Puro = async b => (await aB64(b)).split(',')[1];
async function api(token, ruta, metodo = 'GET', cuerpo) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  if (!r.ok) {
    const err = new Error(`GitHub ${r.status}`); err.status = r.status; throw err;
  }
  return r.json();
}
async function fotoVitrina(blob) {
  const img = await imagen(blob);
  const k = Math.min(1, 1200 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
}
async function publicarVitrina(boton) {
  const token = await tokenGitHub();
  if (!token) { alert('Primero guarda la llave de publicación de GitHub (más abajo en Ajustes).'); return; }
  if (!navigator.onLine) { alert('Necesitas conexión a internet para publicar.'); return; }
  const cfg = await ajustes();
  const props = (await todos('props')).filter(enVitrina).sort((a, b) => (b.actualizado || b.creado) - (a.actualizado || a.creado));
  if (!confirm(`Se publicarán ${props.length} propiedad(es) en la vitrina. ¿Continuar?`)) return;
  const textoOriginal = boton.textContent; boton.disabled = true;
  try {
    boton.textContent = 'Conectando…';
    const ref = await api(token, 'git/ref/heads/main');
    const padre = ref.object.sha;
    const commit = await api(token, `git/commits/${padre}`);
    const arbol = await api(token, `git/trees/${commit.tree.sha}?recursive=1`);
    const existentes = new Set(arbol.tree.filter(t => t.path.startsWith('vitrina/datos/fotos/')).map(t => t.path));
    const cambios = [], usadas = new Set();
    const publicas = [];
    let n = 0;
    for (const p of props) {
      const todas = (await mediaDe(p.id)).filter(m => m.kind === 'foto').sort((a, b) => a.creado - b.creado);
      const tapa = portadaDe(p, todas);
      const fotos = (tapa ? [tapa, ...todas.filter(f => f !== tapa)] : todas).slice(0, 12);
      const rutas = [];
      for (const f of fotos) {
        const ruta = `vitrina/datos/fotos/${f.id}.jpg`;
        usadas.add(ruta); rutas.push(ruta.replace('vitrina/', ''));
        if (!existentes.has(ruta)) {
          boton.textContent = `Subiendo fotos… ${++n}`;
          const blob = await api(token, 'git/blobs', 'POST', { content: await aB64Puro(await fotoVitrina(f.blobMarca || f.blob)), encoding: 'base64' });
          cambios.push({ path: ruta, mode: '100644', type: 'blob', sha: blob.sha });
        }
      }
      publicas.push({
        id: p.id, titulo: p.titulo, tipo: p.tipo, operacion: p.operacion, estado: estadoDe(p), comuna: p.comuna || '',
        ubicacion: p.ubicacionPublica || '', precio: num(p.precio) || '', moneda: p.moneda, m2util: p.m2util || '', m2total: p.m2total || '',
        dorm: p.dorm || '', banos: p.banos || '', estac: p.estac || '', bodega: p.bodega || '', gastosComunes: num(p.gastosComunes) || '',
        descripcion: p.descripcion || '', fotos: rutas
      });
    }
    // Quita de la vitrina las fotos que ya no se usan.
    existentes.forEach(r => { if (!usadas.has(r)) cambios.push({ path: r, mode: '100644', type: 'blob', sha: null }); });
    const datos = { actualizado: new Date().toISOString(), contacto: { nombre: cfg.corredora, telefono: cfg.telefono, email: cfg.email }, propiedades: publicas };
    cambios.push({ path: 'vitrina/datos/propiedades.json', mode: '100644', type: 'blob', content: JSON.stringify(datos, null, 1) });
    boton.textContent = 'Publicando…';
    const nuevoArbol = await api(token, 'git/trees', 'POST', { base_tree: commit.tree.sha, tree: cambios });
    const nuevo = await api(token, 'git/commits', 'POST', { message: `Vitrina: ${publicas.length} propiedad(es)`, tree: nuevoArbol.sha, parents: [padre] });
    await api(token, 'git/refs/heads/main', 'PATCH', { sha: nuevo.sha });
    alert(`¡Listo! ${publicas.length} propiedad(es) publicadas. La vitrina se actualiza en 1 a 2 minutos.`);
  } catch (e) {
    alert(e.status === 401 || e.status === 403 || e.status === 404
      ? 'GitHub rechazó la llave. Revisa que esté bien copiada, que no haya vencido y que tenga permiso de "Contents: Read and write" en el repositorio k-propiedades-app.'
      : 'No se pudo publicar. Revisa la conexión e inténtalo de nuevo.');
  } finally { boton.disabled = false; boton.textContent = textoOriginal; }
}

const aB64 = b => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
const deB64 = async s => (await fetch(s)).blob();
async function exportar() {
  aviso('Preparando respaldo…');
  const media = await todos('media');
  for (const m of media) {
    m.blob = await aB64(m.blob);
    if (m.blobMarca) m.blobMarca = await aB64(m.blobMarca);
  }
  const data = { app: 'kpropiedades', version: 1, fecha: new Date().toISOString(),
    props: await todos('props'), personas: await todos('personas'), ajustes: (await todos('ajustes')).filter(a => a.k !== 'github'), media };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const nombre = `respaldo_K_Propiedades_${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], nombre, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nombre }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  descargar(blob, nombre);
}
async function importar() {
  const [f] = await elegirArchivos({ accept: 'application/json,.json', multiple: false });
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== 'kpropiedades') throw new Error('archivo');
    if (!confirm('Se agregarán y actualizarán los datos del respaldo. ¿Continuar?')) return;
    for (const p of data.props) await guardar('props', p);
    for (const x of data.personas) await guardar('personas', x);
    for (const a of data.ajustes || []) await guardar('ajustes', a);
    for (const m of data.media) {
      m.blob = await deB64(m.blob);
      if (m.blobMarca) m.blobMarca = await deB64(m.blobMarca);
      await guardar('media', m);
    }
    aviso('Respaldo restaurado');
  } catch (e) { alert('No pude leer ese archivo. ¿Es un respaldo de K Propiedades?'); }
}

// ---------- Inicio ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
history.replaceState({ n: 1 }, '');
pila.push({ vista: 'propiedades', params: {} });
pintar();
