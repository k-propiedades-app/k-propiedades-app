/* K Propiedades: sincronización con Google Drive y Google Sheets.
   - Las propiedades, personas y la lista de archivos quedan en la planilla "K Propiedades - Datos".
   - Las fotos, videos y documentos quedan en la carpeta "K Propiedades App/Archivos" de Google Drive.
   - El celular guarda una copia para trabajar sin señal; al volver la conexión se sincroniza.
   - Solo entran las cuentas de Google autorizadas (usuarios de prueba del proyecto y con la carpeta compartida). */
'use strict';

const GOOGLE_CLIENT_ID = '';
const SCOPES = 'https://www.googleapis.com/auth/drive';
const NOMBRE_CARPETA = 'K Propiedades App';
const NOMBRE_PLANILLA = 'K Propiedades - Datos';
const NOMBRE_ARCHIVOS = 'Archivos';
const CARPETA = 'application/vnd.google-apps.folder';
const PLANILLA = 'application/vnd.google-apps.spreadsheet';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const SUBIDA = 'https://www.googleapis.com/upload/drive/v3/files';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

// Columnas visibles en la planilla. La última columna guarda el registro completo para la app.
const TABLAS = {
  props: { hoja: 'Propiedades', cols: ['id', 'titulo', 'tipo', 'operacion', 'estado', 'comuna', 'direccion', 'rol', 'precio', 'moneda', 'm2util', 'm2total',
    'dorm', 'banos', 'estac', 'bodega', 'gastosComunes', 'contribuciones', 'propietarioId', 'fechaCierre'] },
  personas: { hoja: 'Personas', cols: ['id', 'nombre', 'rol', 'rut', 'telefono', 'email', 'propId', 'busca'] },
  media: { hoja: 'Archivos', cols: ['id', 'propId', 'kind', 'categoria', 'name', 'type', 'driveId', 'driveIdMarca'] }
};
const EXTRA = ['actualizado', 'borrado', 'datos (no editar)'];
const LOCALES = ['blob', 'blobMarca', 'sinSubir'];

const nube = (() => {
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* nada */ } }
  };
  let estadoActual = 'apagada', detalle = '', ultima = Number(ls.get('kp_ultima')) || 0;
  let sincronizando = false, otraVez = false, timer = null;
  const descargas = new Map();

  const config = () => { try { return JSON.parse(ls.get('kp_nube') || '{}'); } catch (e) { return {}; } };
  const guardarConfig = c => ls.set('kp_nube', JSON.stringify(c));
  const activa = () => !!GOOGLE_CLIENT_ID && ls.get('kp_conectado') === '1';
  function token() {
    try {
      const t = JSON.parse(ls.get('kp_token') || 'null');
      return t && t.exp > Date.now() + 60000 ? t.v : null;
    } catch (e) { return null; }
  }
  const redirect = () => location.origin + location.pathname.replace(/index\.html$/, '');

  // ---- Indicador en la barra superior ----
  const ICONOS = { apagada: '', desconectada: '🔒', sincronizando: '⟳', ok: '☁️', error: '⚠️', sinred: '📴' };
  const TEXTOS = {
    desconectada: 'Toca para iniciar sesión en Google', sincronizando: 'Sincronizando con Google Drive…',
    ok: 'Todo guardado en Google Drive', error: 'No se pudo sincronizar', sinred: 'Sin conexión: se guarda en el celular y se sube al volver la señal'
  };
  function estado(e, d = '') {
    estadoActual = e; detalle = d;
    const el = document.getElementById('nubeEstado');
    if (el) {
      el.textContent = ICONOS[e] || '';
      el.hidden = !ICONOS[e];
      el.title = TEXTOS[e] || '';
      el.classList.toggle('girando', e === 'sincronizando');
    }
    const t = document.getElementById('nubeTexto');
    if (t) t.textContent = textoEstado();
  }
  function textoEstado() {
    if (!GOOGLE_CLIENT_ID) return 'Falta terminar la configuración de Google.';
    if (!activa()) return 'No conectada. Los datos están solo en este celular.';
    const c = config();
    let t = (TEXTOS[estadoActual] || '') + (detalle ? ` (${detalle})` : '');
    if (c.email) t = `Cuenta: ${c.email}. ` + t;
    if (ultima) t += `. Última sincronización: ${new Date(ultima).toLocaleString('es-CL')}`;
    return t;
  }

  // ---- Inicio de sesión (redirige a Google y vuelve con un permiso de 1 hora) ----
  function conectar(silencioso) {
    if (!GOOGLE_CLIENT_ID) { alert('Falta el Client ID de Google.'); return; }
    ss.set('kp_intento', '1');
    const c = config();
    const p = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: redirect(), response_type: 'token', scope: SCOPES,
      include_granted_scopes: 'true', state: 'kp' });
    if (silencioso) p.set('prompt', 'none');
    if (c.email) p.set('login_hint', c.email);
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
  }
  // Lee el resultado del inicio de sesión que vuelve en la dirección.
  function leerRetorno() {
    if (!location.hash.includes('state=kp')) return null;
    const h = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    if (h.get('access_token')) {
      ls.set('kp_token', JSON.stringify({ v: h.get('access_token'), exp: Date.now() + Number(h.get('expires_in') || 3600) * 1000 }));
      return 'ok';
    }
    return h.get('error') || 'error';
  }

  // ---- Llamadas a Google ----
  async function g(url, op = {}) {
    const t = token();
    if (!t) throw Object.assign(new Error('sin sesión'), { auth: true });
    const headers = Object.assign({ Authorization: 'Bearer ' + t }, op.json ? { 'Content-Type': 'application/json' } : {}, op.headers || {});
    const r = await fetch(url, { method: op.method || 'GET', headers, body: op.json ? JSON.stringify(op.json) : op.body });
    if (r.status === 401) { ls.del('kp_token'); throw Object.assign(new Error('sesión vencida'), { auth: true }); }
    if (!r.ok) throw Object.assign(new Error('Google ' + r.status), { status: r.status });
    if (op.blob) return r.blob();
    return r.status === 204 ? null : r.json();
  }
  async function buscar(q) {
    const r = await g(`${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    return r.files || [];
  }
  const crearEnDrive = (meta) => g(`${DRIVE}/files?fields=id,webViewLink&supportsAllDrives=true`, { method: 'POST', json: meta });

  // Encuentra (o crea) la carpeta, la subcarpeta de archivos y la planilla.
  async function ubicar(crear) {
    const c = config();
    if (c.carpeta && c.planilla && c.archivos) return c;
    let [carpeta] = await buscar(`name='${NOMBRE_CARPETA}' and mimeType='${CARPETA}' and trashed=false`);
    if (!carpeta) {
      if (!crear) return null;
      carpeta = await crearEnDrive({ name: NOMBRE_CARPETA, mimeType: CARPETA });
    }
    let [archivos] = await buscar(`name='${NOMBRE_ARCHIVOS}' and '${carpeta.id}' in parents and mimeType='${CARPETA}' and trashed=false`);
    if (!archivos) archivos = await crearEnDrive({ name: NOMBRE_ARCHIVOS, mimeType: CARPETA, parents: [carpeta.id] });
    let [planilla] = await buscar(`name='${NOMBRE_PLANILLA}' and '${carpeta.id}' in parents and mimeType='${PLANILLA}' and trashed=false`);
    if (!planilla) planilla = await crearEnDrive({ name: NOMBRE_PLANILLA, mimeType: PLANILLA, parents: [carpeta.id] });
    // Deja solo las hojas Propiedades, Personas y Archivos.
    const info = await g(`${SHEETS}/${planilla.id}?fields=sheets.properties(sheetId,title)`);
    const hojas = info.sheets.map(s => s.properties);
    const nombres = Object.values(TABLAS).map(t => t.hoja);
    const req = nombres.filter(n => !hojas.some(h => h.title === n)).map(title => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }));
    hojas.filter(h => !nombres.includes(h.title)).forEach(h => req.push({ deleteSheet: { sheetId: h.sheetId } }));
    if (req.length) await g(`${SHEETS}/${planilla.id}:batchUpdate`, { method: 'POST', json: { requests: req } });
    const yo = await g(`${DRIVE}/about?fields=user(emailAddress)`);
    const nueva = { carpeta: carpeta.id, archivos: archivos.id, planilla: planilla.id, email: yo.user.emailAddress,
      linkCarpeta: `https://drive.google.com/drive/folders/${carpeta.id}`, linkPlanilla: `https://docs.google.com/spreadsheets/d/${planilla.id}` };
    guardarConfig(nueva);
    return nueva;
  }

  // ---- Archivos ----
  async function subir(blob, nombre, carpeta) {
    const tipo = blob.type || 'application/octet-stream';
    const meta = { name: nombre, parents: [carpeta] };
    if (blob.size < 5 * 1024 * 1024) {
      const limite = 'kp' + Math.random().toString(36).slice(2);
      const cuerpo = new Blob([`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${limite}\r\nContent-Type: ${tipo}\r\n\r\n`,
        blob, `\r\n--${limite}--`]);
      const r = await g(`${SUBIDA}?uploadType=multipart&fields=id&supportsAllDrives=true`, { method: 'POST', body: cuerpo,
        headers: { 'Content-Type': `multipart/related; boundary=${limite}` } });
      return r.id;
    }
    // Archivos grandes (videos): subida en dos pasos.
    const ini = await fetch(`${SUBIDA}?uploadType=resumable&fields=id&supportsAllDrives=true`, { method: 'POST',
      headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': tipo },
      body: JSON.stringify(meta) });
    if (!ini.ok) throw Object.assign(new Error('Google ' + ini.status), { status: ini.status, auth: ini.status === 401 });
    const destino = ini.headers.get('Location');
    const r = await fetch(destino, { method: 'PUT', headers: { 'Content-Type': tipo }, body: blob });
    if (!r.ok) throw new Error('Google ' + r.status);
    return (await r.json()).id;
  }
  function descargar(id) {
    if (!descargas.has(id)) {
      descargas.set(id, g(`${DRIVE}/files/${id}?alt=media&supportsAllDrives=true`, { blob: true })
        .catch(e => { descargas.delete(id); if (e.auth) estado('desconectada'); return null; }));
    }
    return descargas.get(id);
  }
  async function aPapelera(id) {
    try { await g(`${DRIVE}/files/${id}?supportsAllDrives=true`, { method: 'PATCH', json: { trashed: true } }); }
    catch (e) { if (e.auth) throw e; /* ya no existe o sin permiso: se ignora */ }
  }
  function nombreArchivo(m, props, marca) {
    const p = props.get(m.propId);
    const base = (p && p.titulo ? p.titulo : 'Propiedad').replace(/[\\/:*?"<>|]+/g, ' ').trim();
    const ext = (m.name && m.name.includes('.') && m.kind !== 'foto' ? m.name.split('.').pop() : (m.kind === 'foto' ? 'jpg' : 'bin')).toLowerCase();
    const que = m.kind === 'doc' ? (m.categoria || 'Documento') : m.kind === 'video' ? 'Video' : (marca ? 'Foto con marca' : 'Foto');
    return `${base} - ${que} - ${m.id}.${ext}`;
  }

  // ---- Planilla ----
  function aFila(t, v) {
    const limpio = {};
    Object.keys(v).forEach(k => { if (!LOCALES.includes(k)) limpio[k] = v[k]; });
    return [...t.cols.map(c => v[c] == null ? '' : String(v[c])),
      v.actualizado ? new Date(v.actualizado).toLocaleString('es-CL') : '', v.borrado ? 'sí' : '', JSON.stringify(limpio)];
  }
  function deFila(t, fila) {
    const json = fila[t.cols.length + EXTRA.length - 1];
    if (!json) return null;
    try { const v = JSON.parse(json); return v && v.id ? v : null; } catch (e) { return null; }
  }

  // ---- Sincronización ----
  function pedirSync(ms = 1500) {
    if (!activa()) return;
    clearTimeout(timer); timer = setTimeout(sincronizar, ms);
  }
  async function sincronizar() {
    if (!activa()) return;
    if (sincronizando) { otraVez = true; return; }
    if (!navigator.onLine) { estado('sinred'); return; }
    if (!token()) { estado('desconectada'); return; }
    sincronizando = true; estado('sincronizando');
    let cambiosLocales = false;
    try {
      const c = await ubicar(false);
      if (!c) { estado('error', 'no se encontró la carpeta en Drive'); return; }
      // 1. Subir archivos nuevos y mandar a la papelera los borrados.
      const props = new Map((await todos('props')).map(p => [p.id, p]));
      const media = await todos('media');
      let n = 0;
      for (const m of media) {
        let cambio = false;
        if (m.borrado) {
          if (!m.enPapelera && (m.driveId || m.driveIdMarca)) {
            if (m.driveId) await aPapelera(m.driveId);
            if (m.driveIdMarca) await aPapelera(m.driveIdMarca);
            m.enPapelera = 1; cambio = true;
          }
        } else {
          if (m.blob && !m.driveId) { estado('sincronizando', `subiendo archivo ${++n}`); m.driveId = await subir(m.blob, nombreArchivo(m, props, false), c.archivos); cambio = true; }
          if (m.blobMarca && !m.driveIdMarca) { estado('sincronizando', `subiendo archivo ${++n}`); m.driveIdMarca = await subir(m.blobMarca, nombreArchivo(m, props, true), c.archivos); cambio = true; }
        }
        if (cambio) {
          const actual = await uno('media', m.id);
          Object.assign(actual, { driveId: m.driveId, driveIdMarca: m.driveIdMarca, enPapelera: m.enPapelera, actualizado: Date.now(), sinSubir: true });
          await guardar('media', actual);
        }
      }
      // 2. Leer la planilla y combinar: gana la versión editada más recientemente.
      estado('sincronizando');
      const claves = Object.keys(TABLAS);
      const rangos = claves.map(k => 'ranges=' + encodeURIComponent(`${TABLAS[k].hoja}!A:ZZ`)).join('&');
      const leido = await g(`${SHEETS}/${c.planilla}/values:batchGet?${rangos}&valueRenderOption=UNFORMATTED_VALUE`);
      const escribir = [];
      const escritos = [];
      for (const [i, k] of claves.entries()) {
        const t = TABLAS[k];
        const filas = (leido.valueRanges[i].values || []).slice(1);
        const remotos = new Map();
        filas.forEach(f => { const v = deFila(t, f); if (v) remotos.set(v.id, v); });
        const locales = new Map((await todos(k)).map(v => [v.id, v]));
        const final = [];
        let subirTabla = remotos.size === 0 && locales.size > 0;
        const ids = new Set([...remotos.keys(), ...locales.keys()]);
        for (const id of ids) {
          const l = locales.get(id), r = remotos.get(id);
          if (l && (!r || (l.actualizado || 0) > (r.actualizado || 0))) {
            final.push(l); subirTabla = true;
          } else if (r && (!l || (r.actualizado || 0) > (l.actualizado || 0))) {
            const nuevo = Object.assign({}, r);
            if (l && k === 'media') {
              if (l.blob && l.driveId === r.driveId) nuevo.blob = l.blob;
              if (l.blobMarca && l.driveIdMarca === r.driveIdMarca) nuevo.blobMarca = l.blobMarca;
            }
            await guardar(k, nuevo); final.push(nuevo); cambiosLocales = true;
          } else {
            final.push(l);
            if (l.sinSubir) subirTabla = true;
          }
        }
        if (subirTabla) {
          final.sort((a, b) => (a.creado || 0) - (b.creado || 0));
          escribir.push({ range: `${t.hoja}!A1`, values: [[...t.cols, ...EXTRA], ...final.map(v => aFila(t, v))] });
          escritos.push([k, final]);
        }
      }
      // 3. Escribir en la planilla lo que cambió.
      if (escribir.length) {
        await g(`${SHEETS}/${c.planilla}/values:batchClear`, { method: 'POST', json: { ranges: escribir.map(e => e.range.replace('!A1', '!A:ZZ')) } });
        await g(`${SHEETS}/${c.planilla}/values:batchUpdate`, { method: 'POST', json: { valueInputOption: 'RAW', data: escribir } });
        for (const [k, lista] of escritos) {
          for (const v of lista) {
            if (!v.sinSubir) continue;
            const actual = await uno(k, v.id);
            if (actual && actual.actualizado === v.actualizado) { delete actual.sinSubir; await guardar(k, actual); }
          }
        }
      }
      ultima = Date.now(); ls.set('kp_ultima', String(ultima));
      estado('ok');
      if (cambiosLocales) refrescar();
    } catch (e) {
      console.warn('Sincronización', e);
      if (e.auth) estado('desconectada');
      else estado(navigator.onLine ? 'error' : 'sinred', e.status ? 'Google respondió ' + e.status : '');
    } finally {
      sincronizando = false;
      if (otraVez) { otraVez = false; pedirSync(500); }
    }
  }
  // Vuelve a dibujar la pantalla si llegaron cambios, salvo que se esté editando un formulario.
  function refrescar() {
    if (typeof pila === 'undefined' || !pila.length) return;
    const vista = pila[pila.length - 1].vista;
    if (vista.startsWith('editar') || document.querySelector('.visor')) return;
    pintar();
  }

  // ---- Pantalla de Ajustes ----
  function htmlAjustes() {
    if (!GOOGLE_CLIENT_ID) return `<div class="seccion"><h2>Google Drive</h2><p class="sub" style="margin:0">Falta terminar la configuración de Google para guardar los datos en línea.</p></div>`;
    const c = config(), on = activa();
    return `<div class="seccion"><h2>Google Drive ${on ? (ICONOS[estadoActual] || '') : ''}</h2>
      <p class="sub" style="margin-top:0" id="nubeTexto">${textoEstado()}</p>
      ${on ? `
        <button class="btn ancho" id="nSync">🔄 Sincronizar ahora</button>
        ${!token() ? '<button class="btn ancho" id="nLogin">🔑 Iniciar sesión en Google</button>' : ''}
        ${c.linkPlanilla ? `<a class="btn sec ancho" href="${c.linkPlanilla}" target="_blank" rel="noopener">📊 Abrir planilla</a>
        <a class="btn sec ancho" href="${c.linkCarpeta}" target="_blank" rel="noopener">📁 Abrir carpeta en Drive</a>` : ''}
        <button class="btn sec ancho" id="nCompartir">👥 Dar acceso a otra cuenta</button>
        <button class="btn peligro ancho" id="nSalir">Cerrar sesión de Google en este celular</button>`
      : `<p class="sub">Al conectar, todo queda guardado en Google Drive y se puede ver y editar desde otro celular o computador con una cuenta autorizada.</p>
        <button class="btn ancho" id="nLogin">🔑 Conectar con Google</button>`}
    </div>`;
  }
  function activarAjustes(main) {
    const $q = s => main.querySelector(s);
    if ($q('#nLogin')) $q('#nLogin').onclick = () => { ls.set('kp_conectado', '1'); conectar(false); };
    if ($q('#nSync')) $q('#nSync').onclick = () => { if (!token()) conectar(true); else sincronizar(); };
    if ($q('#nCompartir')) $q('#nCompartir').onclick = async () => {
      const email = (prompt('Correo Gmail de la persona que tendrá acceso para ver y editar:') || '').trim();
      if (!email) return;
      try {
        const c = await ubicar(false);
        await g(`${DRIVE}/files/${c.carpeta}/permissions?sendNotificationEmail=true&supportsAllDrives=true`, { method: 'POST',
          json: { type: 'user', role: 'writer', emailAddress: email } });
        alert(`Listo. ${email} ya tiene acceso a la carpeta. Recuerda agregar ese correo también como usuario de prueba en Google Cloud.`);
      } catch (e) { alert(e.auth ? 'Inicia sesión en Google primero.' : 'No se pudo dar acceso. Revisa el correo e inténtalo de nuevo.'); }
    };
    if ($q('#nSalir')) $q('#nSalir').onclick = () => {
      if (!confirm('Se cerrará la sesión de Google en este celular. Los datos siguen guardados en Drive y en el celular. ¿Continuar?')) return;
      ls.del('kp_token'); ls.del('kp_conectado'); ls.del('kp_nube');
      estado('apagada'); pintar();
    };
  }

  // Primera conexión: ubica la carpeta compartida o, si no existe, ofrece crearla.
  async function primeraConexion() {
    try {
      let c = await ubicar(false);
      if (!c) {
        const crear = confirm(`No encontré la carpeta "${NOMBRE_CARPETA}" en tu Google Drive.\n\n` +
          '¿Crearla ahora en esta cuenta?\n\nSi otra persona ya la creó, toca Cancelar y pídele que te dé acceso desde Ajustes → "Dar acceso a otra cuenta".');
        if (!crear) { ls.del('kp_conectado'); estado('apagada'); return; }
        c = await ubicar(true);
      }
      aviso(`Conectado a Google Drive (${c.email})`);
      await sincronizar();
    } catch (e) {
      console.warn(e);
      estado(e.auth ? 'desconectada' : 'error');
      aviso('No se pudo conectar con Google Drive');
    }
  }

  function iniciar() {
    const ind = document.getElementById('nubeEstado');
    if (ind) ind.onclick = () => {
      if (estadoActual === 'desconectada') conectar(ss.get('kp_intento') === '1' ? false : true);
      else aviso(TEXTOS[estadoActual] || '');
    };
    if (!GOOGLE_CLIENT_ID) return;
    const r = leerRetorno();
    if (r === 'ok') { ls.set('kp_conectado', '1'); if (!config().planilla) { primeraConexion(); } else { estado('ok'); sincronizar(); } }
    else if (r && activa()) { estado('desconectada'); if (r !== 'interaction_required' && r !== 'login_required' && r !== 'consent_required') aviso('Google no permitió el acceso. Revisa que tu cuenta esté autorizada.'); }
    else if (activa()) {
      if (token()) sincronizar();
      else if (navigator.onLine && ss.get('kp_intento') !== '1') { conectar(true); return; }
      else estado(navigator.onLine ? 'desconectada' : 'sinred');
    }
    window.addEventListener('online', () => pedirSync(300));
    window.addEventListener('offline', () => activa() && estado('sinred'));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pedirSync(300); });
    setInterval(() => { if (document.visibilityState === 'visible') pedirSync(0); }, 3 * 60 * 1000);
  }

  return { iniciar, pedirSync, sincronizar, descargar, htmlAjustes, activarAjustes, activa, estado: () => estadoActual };
})();
window.nube = nube;
