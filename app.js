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

const AJUSTES_BASE = { corredora: 'K Propiedades', telefono: '', email: '', hashtags: '#KPropiedades #propiedades #Chile', marcaAuto: true };
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
function precioTxt(p) {
  if (!p.precio) return '';
  const n = Number(p.precio).toLocaleString('es-CL');
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
const ESTADOS = ['Captación', 'Publicada', 'Reservada', 'Arrendada', 'Vendida', 'Pausada'];

VISTAS.propiedades = async (main) => {
  titulo('Propiedades');
  const props = (await todos('props')).sort((a, b) => b.creado - a.creado);
  const fotos = (await todos('media')).filter(m => m.kind === 'foto');
  main.innerHTML = `
    <div class="barra">
      <input id="buscar" type="search" placeholder="Buscar por comuna, dirección, rol…">
      <select id="filtro" style="max-width:40%"><option value="">Todas</option>${ESTADOS.map(e => `<option>${e}</option>`).join('')}</select>
    </div>
    <div class="lista" id="lista"></div>`;
  const listar = () => {
    const q = $('#buscar').value.toLowerCase(), f = $('#filtro').value;
    const vis = props.filter(p => (!f || p.estado === f) &&
      [p.titulo, p.direccion, p.comuna, p.rol, p.tipo].join(' ').toLowerCase().includes(q));
    $('#lista').innerHTML = vis.length ? '' : `<p class="vacio">${props.length ? 'Nada coincide con la búsqueda.' : 'Aún no hay propiedades.<br>Toca + para agregar la primera.'}</p>`;
    vis.forEach(p => {
      const foto = fotos.find(m => m.propId === p.id);
      const b = document.createElement('button'); b.className = 'tarjeta';
      b.innerHTML = `${foto ? `<img src="${url(foto.blob)}" alt="">` : '<div class="sinfoto">🏠</div>'}
        <div class="info"><h3>${esc(p.titulo || p.tipo)}</h3>
        <div class="sub">${esc([p.direccion, p.comuna].filter(Boolean).join(', '))}</div>
        <span class="chip oro">${esc(p.operacion)}</span><span class="chip">${esc(p.estado)}</span>${precioTxt(p) ? `<span class="chip">${precioTxt(p)}</span>` : ''}</div>`;
      b.onclick = () => ir('propiedad', { id: p.id });
      $('#lista').appendChild(b);
    });
  };
  $('#buscar').oninput = listar; $('#filtro').onchange = listar; listar();
  fab(() => ir('editarProp', {}));
};

VISTAS.editarProp = async (main, { id }) => {
  const p = id ? await uno('props', id) : { id: nuevoId(), creado: Date.now(), tipo: 'Departamento', operacion: 'Arriendo', estado: 'Captación', moneda: 'CLP' };
  const personas = (await todos('personas')).sort((a, b) => a.nombre.localeCompare(b.nombre));
  titulo(id ? 'Editar propiedad' : 'Nueva propiedad');
  const opt = (arr, v) => arr.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('');
  const campo = (k, lbl, tipo = 'text', extra = '') => `<label>${lbl}</label><input name="${k}" type="${tipo}" value="${esc(p[k])}" ${extra}>`;
  main.innerHTML = `<form id="f">
    ${campo('titulo', 'Nombre corto (ej. Depto 2D2B Ñuñoa)')}
    <div class="fila"><div><label>Tipo</label><select name="tipo">${opt(TIPOS, p.tipo)}</select></div>
      <div><label>Operación</label><select name="operacion">${opt(['Arriendo', 'Venta'], p.operacion)}</select></div></div>
    <label>Estado</label><select name="estado">${opt(ESTADOS, p.estado)}</select>
    ${campo('direccion', 'Dirección')}
    <div class="fila"><div>${campo('comuna', 'Comuna')}</div><div>${campo('rol', 'Rol SII')}</div></div>
    <div class="fila"><div>${campo('precio', 'Precio', 'number', 'inputmode="decimal" step="any"')}</div>
      <div><label>Moneda</label><select name="moneda">${opt(['CLP', 'UF'], p.moneda)}</select></div></div>
    <div class="fila"><div>${campo('m2util', 'm² útiles', 'number', 'step="any"')}</div><div>${campo('m2total', 'm² totales', 'number', 'step="any"')}</div></div>
    <div class="fila"><div>${campo('dorm', 'Dormitorios', 'number')}</div><div>${campo('banos', 'Baños', 'number')}</div></div>
    <div class="fila"><div>${campo('estac', 'Estacionamientos', 'number')}</div><div>${campo('bodega', 'Bodegas', 'number')}</div></div>
    <div class="fila"><div>${campo('gastosComunes', 'Gastos comunes ($)', 'number')}</div><div>${campo('contribuciones', 'Contribuciones ($/trim.)', 'number')}</div></div>
    <label>Propietario</label><select name="propietarioId"><option value="">— Sin asignar —</option>
      ${personas.map(x => `<option value="${x.id}" ${x.id === p.propietarioId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>
    <label>Descripción para el aviso (se publica)</label><textarea name="descripcion">${esc(p.descripcion)}</textarea>
    <label>Notas internas (no se publican)</label><textarea name="notas">${esc(p.notas)}</textarea>
    <button class="btn ancho">Guardar</button>
    ${id ? '<button type="button" id="del" class="btn peligro ancho">Eliminar propiedad</button>' : ''}
  </form>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    Object.assign(p, Object.fromEntries(new FormData(e.target)));
    p.titulo = p.titulo || `${p.tipo} ${p.comuna || ''}`.trim();
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
      <span class="chip oro">${esc(p.operacion)}</span><span class="chip">${esc(p.estado)}</span>
      <dl class="datos" style="margin-top:10px">
        ${fila('Precio', precioTxt(p))}${fila('Dirección', p.direccion)}${fila('Comuna', p.comuna)}${fila('Rol', p.rol)}
        ${fila('m² útiles', p.m2util)}${fila('m² totales', p.m2total)}${fila('Dormitorios', p.dorm)}${fila('Baños', p.banos)}
        ${fila('Estacionam.', p.estac)}${fila('Bodegas', p.bodega)}
        ${fila('Gastos com.', p.gastosComunes && '$' + Number(p.gastosComunes).toLocaleString('es-CL'))}
        ${fila('Contribuc.', p.contribuciones && '$' + Number(p.contribuciones).toLocaleString('es-CL'))}
      </dl>
      ${p.notas ? `<p class="sub" style="white-space:pre-wrap">📝 ${esc(p.notas)}</p>` : ''}
    </div>

    <div class="seccion">
      <h2>Publicar</h2>
      <p class="sub" style="margin-top:0">Marca las fotos que quieres publicar (si no marcas ninguna van todas). Se comparten con marca de agua y con el texto del aviso listo.</p>
      <div class="acciones">
        <button class="btn" id="compartir">📤 Compartir aviso</button>
        <button class="btn sec" id="copiar">📋 Copiar texto</button>
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
        ${conMarca && f.blobMarca ? '<span class="marca">con marca</span>' : ''}
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
    for (const file of files) {
      const blob = await procesarFoto(file, false);
      const blobMarca = cfg.marcaAuto ? await procesarFoto(file, true) : null;
      await guardar('media', { id: nuevoId(), propId: id, kind: 'foto', name: file.name, blob, blobMarca, creado: Date.now() });
    }
    aviso('Fotos guardadas'); pintar();
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
  if (p.gastosComunes) l.push(`🧾 Gastos comunes aprox. $${Number(p.gastosComunes).toLocaleString('es-CL')}`);
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
    if (a === 'compartir') await compartir([archivo(blob)], '');
    if (a === 'sin') await compartir([archivo(m.blob, '_sin_marca')], '');
    if (a === 'abrir') window.open(url(m.blob), '_blank');
    if (a === 'borrar' && confirm('¿Eliminar este archivo?')) { await borrar('media', m.id); v.remove(); aviso('Eliminado'); pintar(); }
  };
}

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
    b.innerHTML = `<div class="info"><h3>${esc(p.titulo)}</h3><span class="chip">${r}</span><span class="chip">${esc(p.estado)}</span></div>`;
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
};

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
    props: await todos('props'), personas: await todos('personas'), ajustes: await todos('ajustes'), media };
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
