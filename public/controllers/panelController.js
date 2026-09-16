document.addEventListener('DOMContentLoaded', function () {
    const panelMain = document.getElementById('panel-main');
    if (!panelMain) return;

    const db = firebase.firestore();
    const auth = firebase.auth();
    const KEY = 'contenido';

    // Estado del editor de carrusel: true = todas las diapositivas usan el mismo tiempo
    let carruselLock = false;

    // ---------- Esquema de secciones ----------
    const TIPOS = {
        hero: { label: 'Hero / cabecera', fields: [
            { n: 'titulo', t: 'text', l: 'Título' },
            { n: 'subtitulo', t: 'text', l: 'Subtítulo' },
            { n: 'icono', t: 'text', l: 'Icono (Font Awesome)', ph: 'Ej: fa-solid fa-dragon' },
            { n: 'imagenFondo', t: 'url', l: 'Imagen de fondo (enlace)', instr: 'Opcional. Si se deja vacío, fondo de color liso.' },
            { n: 'modo', t: 'select', l: 'Estilo', opts: [['oscuro', 'Oscuro (con imagen)'], ['claro', 'Claro (liso)']] }
        ] },
        textoImagen: { label: 'Texto con imagen', fields: [
            { n: 'titulo', t: 'text', l: 'Título' },
            { n: 'imagen', t: 'url', l: 'Imagen (enlace)' },
            { n: 'alt', t: 'text', l: 'Texto alternativo (alt)' },
            { n: 'parrafos', t: 'textlines', l: 'Párrafos (uno por línea)' },
            { n: 'imagenDerecha', t: 'checkbox', l: 'Imagen a la derecha' }
        ] },
        tarjetas: { label: 'Tarjetas con iconos', fields: [
            { n: 'titulo', t: 'text', l: 'Título de la sección (opcional)' }
        ], list: { key: 'items', label: 'Tarjetas', fields: [
            { n: 'icono', t: 'text', l: 'Icono (Font Awesome)', ph: 'Ej: fa-solid fa-users' },
            { n: 'titulo', t: 'text', l: 'Título' },
            { n: 'texto', t: 'textarea', l: 'Texto' },
            { n: 'enlace', t: 'url', l: 'Enlace (opcional)', instr: 'Si se deja vacío, la tarjeta no es clicable.' }
        ] } },
        textoCentrado: { label: 'Texto centrado', fields: [
            { n: 'titulo', t: 'text', l: 'Título' },
            { n: 'subtitulo', t: 'text', l: 'Subtítulo' },
            { n: 'parrafos', t: 'textlines', l: 'Párrafos (uno por línea)' },
            { n: 'fondoClaro', t: 'checkbox', l: 'Fondo gris claro' }
        ] },
        cta: { label: 'Botón de acción', fields: [
            { n: 'botonTexto', t: 'text', l: 'Texto del botón', ph: 'Ej: ¡Quiero registrarme!' },
            { n: 'botonEnlace', t: 'url', l: 'Enlace del botón', ph: 'Ej: /registro.html' },
            { n: 'avisoTexto', t: 'textarea', l: 'Aviso bajo el botón', ph: 'Puede incluir <strong>negrita</strong> o <a href="...">enlaces</a>.' }
        ] },
        pdf: { label: 'PDF insertado', fields: [
            { n: 'url', t: 'url', l: 'Enlace del PDF (preview / embed)' },
            { n: 'altura', t: 'text', l: 'Altura en píxeles (opcional)', ph: 'Ej: 1000' },
            { n: 'titulo', t: 'text', l: 'Título (opcional)' },
            { n: 'descripcion', t: 'textarea', l: 'Descripción (opcional)' }
        ] },
        html: { label: 'Bloque libre (HTML)', fields: [
            { n: 'html', t: 'textarea', l: 'Contenido HTML', ph: 'Pega aquí HTML libre...' }
        ] }
    };

    const CONFIG_FIELDS = [
        { n: 'emailContacto', t: 'text', l: 'Email de contacto', ph: 'Ej: hola@asociacion.es' },
        { n: 'instagramUrl', t: 'url', l: 'Enlace de Instagram', ph: 'https://www.instagram.com/...' },
        { n: 'whatsappUrl', t: 'url', l: 'Enlace del grupo de WhatsApp', ph: 'https://chat.whatsapp.com/...' },
        { n: 'cuotaMensualEur', t: 'text', l: 'Cuota mensual (€)', ph: 'Ej: 2' }
    ];

    const PAGINAS = [
        { key: 'quienesSomos', label: 'Quiénes somos', tipo: 'secciones' },
        { key: 'hazteSocio', label: 'Hazte socio', tipo: 'secciones' },
        { key: 'home', label: 'Inicio (carrusel)', tipo: 'carrusel' },
        { key: 'config', label: 'Opciones generales', tipo: 'config' }
    ];

    const state = {};
    let inited = false;

    // ---------- Utilidades ----------
    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function escAttr(v) { return esc(v); }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function swap(arr, a, b) { const t = arr[a]; arr[a] = arr[b]; arr[b] = t; }
    function byKey(k) { return PAGINAS.find(p => p.key === k); }

    function esUrlAceptable(v) {
        return /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[^\s]+|#[^\s]*|\/[^\s]*|[\w-]+(\.[\w-]+)+[^\s]*)$/i.test(v);
    }

    function valOf(el) {
        if (el.type === 'checkbox') return el.checked;
        if (el.dataset.multi === '1') return el.value.split('\n').map(s => s.trim()).filter(Boolean);
        return el.value;
    }

    function parseDur(v) {
        if (v === '' || v === null || v === undefined) return null;
        const n = Number(v);
        return isFinite(n) && n > 0 ? n : null;
    }

    function validDur(v, def) {
        const n = Number(v);
        return isFinite(n) && n > 0 ? n : def;
    }

    function blankSection(tipo) {
        const t = TIPOS[tipo] || { fields: [] };
        const datos = {};
        (t.fields || []).forEach(f => {
            if (f.t === 'checkbox') datos[f.n] = false;
            else if (f.t === 'textlines') datos[f.n] = [];
            else if (f.t === 'select') datos[f.n] = (f.opts && f.opts[0]) ? f.opts[0][0] : '';
            else datos[f.n] = '';
        });
        if (t.list) {
            const blank = {};
            t.list.fields.forEach(f => {
                if (f.t === 'checkbox') blank[f.n] = false;
                else if (f.t === 'textlines') blank[f.n] = [];
                else blank[f.n] = '';
            });
            datos[t.list.key] = [];
        }
        return { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), tipo, datos };
    }

    function sField(fld, value) {
        const id = 'f_' + Math.random().toString(36).slice(2, 9);
        const label = `<label class="form-label small mb-1 fw-bold" for="${id}">${fld.l}${fld.t === 'url' ? ' <span class="text-muted fw-normal">(enlace)</span>' : ''}</label>`;
        const instr = fld.instr ? `<div class="text-muted small mb-1">${fld.instr}</div>` : '';
        switch (fld.t) {
            case 'textarea':
                return `<div class="mb-2">${label}${instr}<textarea id="${id}" class="form-control form-control-sm" data-fld="${fld.n}" rows="2" ${fld.ph ? `placeholder="${escAttr(fld.ph)}"` : ''}>${escAttr(value)}</textarea></div>`;
            case 'textlines':
                return `<div class="mb-2">${label}${instr}<textarea id="${id}" class="form-control form-control-sm" data-fld="${fld.n}" data-multi="1" rows="3" ${fld.ph ? `placeholder="${escAttr(fld.ph)}"` : ''}>${escAttr(Array.isArray(value) ? value.join('\n') : '')}</textarea></div>`;
            case 'checkbox':
                return `<div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="${id}" data-fld="${fld.n}" ${value ? 'checked' : ''}><label class="form-check-label small" for="${id}">${fld.l}</label></div>`;
            case 'select':
                return `<div class="mb-2">${label}<select id="${id}" class="form-select form-select-sm" data-fld="${fld.n}">${(fld.opts || []).map(o => `<option value="${escAttr(o[0])}" ${String(value) === String(o[0]) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>`;
            default:
                return `<div class="mb-2">${label}${instr}<input type="text" id="${id}" class="form-control form-control-sm" data-fld="${fld.n}" ${fld.t === 'url' ? 'data-url="1"' : ''} value="${escAttr(value)}" ${fld.ph ? `placeholder="${escAttr(fld.ph)}"` : ''}></div>`;
        }
    }

    // ---------- Editor de secciones ----------
    function sublistHtml(sec, t) {
        const list = t.list;
        const items = (sec.datos && sec.datos[list.key]) || [];
        return `<div class="sublist mt-3 border-top pt-3">
            <h6 class="text-muted text-uppercase small fw-bold mb-2">${list.label}</h6>
            ${items.map((it, i) => `
                <div class="sublist-item card mb-2" data-subitem="${i}">
                    <div class="card-body py-3">
                        <div class="d-flex justify-content-end mb-1">
                            <div class="btn-group btn-group-sm">
                                <button type="button" class="btn btn-outline-secondary" data-sub-move="-1" title="Subir"><i class="fa-solid fa-arrow-up"></i></button>
                                <button type="button" class="btn btn-outline-secondary" data-sub-move="1" title="Bajar"><i class="fa-solid fa-arrow-down"></i></button>
                                <button type="button" class="btn btn-outline-danger" data-sub-del title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
                            </div>
                        </div>
                        ${list.fields.map(f => sField(f, it[f.n])).join('')}
                    </div>
                </div>`).join('')}
            <button type="button" class="btn btn-sm btn-outline-primary mt-1" data-sub-add="1"><i class="fa-solid fa-plus me-1"></i>Añadir ${list.label.toLowerCase()}</button>
        </div>`;
    }

    function sectionCardHtml(sec, idx) {
        const t = TIPOS[sec.tipo] || null;
        const fields = t ? t.fields : [];
        return `
        <div class="card section-card mb-3 shadow-sm" data-sec-tipo="${sec.tipo}" data-sec-idx="${idx}" data-sec-id="${escAttr(sec.id || '')}">
            <div class="card-header py-2 d-flex align-items-center gap-2">
                <span class="badge bg-secondary">${t ? t.label : sec.tipo}</span>
                <span class="text-muted small">${idx + 1}</span>
                <div class="ms-auto btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-secondary" data-sec-move="-1" title="Subir sección"><i class="fa-solid fa-arrow-up"></i></button>
                    <button type="button" class="btn btn-outline-secondary" data-sec-move="1" title="Bajar sección"><i class="fa-solid fa-arrow-down"></i></button>
                    <button type="button" class="btn btn-outline-secondary" data-sec-dup title="Duplicar sección"><i class="fa-solid fa-copy"></i></button>
                    <button type="button" class="btn btn-outline-danger" data-sec-del title="Eliminar sección"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
            <div class="card-body">
                <div class="section-fields">
                    ${fields.map(f => sField(f, sec.datos ? sec.datos[f.n] : (f.t === 'checkbox' ? false : (f.t === 'textlines' ? [] : '')))).join('')}
                </div>
                ${t && t.list ? sublistHtml(sec, t) : ''}
            </div>
        </div>`;
    }

    function renderSections(p) {
        const ed = document.getElementById('editor-' + p.key);
        if (!ed) return;
        const secciones = (state[p.key] && state[p.key].secciones) || [];
        ed.innerHTML = secciones.map((sec, idx) => sectionCardHtml(sec, idx)).join('') + `
        <div class="d-flex gap-2 align-items-center border rounded p-3 bg-light">
            <select class="form-select form-select-sm" id="addsel-${p.key}" style="max-width:280px;">
                ${Object.keys(TIPOS).map(k => `<option value="${k}">${TIPOS[k].label}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-sm btn-primary" data-add="${p.key}"><i class="fa-solid fa-plus me-1"></i>Añadir sección</button>
        </div>`;
    }

    function readSections(p) {
        const ed = document.getElementById('editor-' + p.key);
        if (!ed) return [];
        return Array.from(ed.querySelectorAll(':scope > .section-card')).map(card => {
            const tipo = card.dataset.secTipo;
            const t = TIPOS[tipo] || null;
            const datos = {};
            card.querySelectorAll(':scope > .card-body > .section-fields [data-fld]').forEach(el => {
                datos[el.dataset.fld] = valOf(el);
            });
            if (t && t.list) {
                const items = [];
                card.querySelectorAll(':scope > .card-body > .sublist [data-subitem]').forEach(sub => {
                    const item = {};
                    sub.querySelectorAll('[data-fld]').forEach(el => { item[el.dataset.fld] = valOf(el); });
                    items.push(item);
                });
                datos[t.list.key] = items;
            }
            return { id: card.dataset.secId || '', tipo, datos };
        });
    }

    function bindEditor(p) {
        const ed = document.getElementById('editor-' + p.key);
        if (!ed) return;
        ed.addEventListener('click', function (e) {
            const secBtn = e.target.closest('[data-sec-move],[data-sec-dup],[data-sec-del],[data-add]');
            if (secBtn) {
                e.preventDefault();
                state[p.key].secciones = readSections(p);
                const secciones = state[p.key].secciones;
                const card = secBtn.closest('.section-card');
                const idx = card ? Number(card.dataset.secIdx) : -1;
                let changed = false;
                if (secBtn.hasAttribute('data-sec-move')) {
                    const ni = idx + Number(secBtn.getAttribute('data-sec-move'));
                    if (idx >= 0 && ni >= 0 && ni < secciones.length) { swap(secciones, idx, ni); changed = true; }
                } else if (secBtn.hasAttribute('data-sec-dup')) {
                    if (idx >= 0) { secciones.splice(idx + 1, 0, clone(secciones[idx])); changed = true; }
                } else if (secBtn.hasAttribute('data-sec-del')) {
                    if (idx >= 0) { secciones.splice(idx, 1); changed = true; }
                } else if (secBtn.hasAttribute('data-add')) {
                    const sel = document.getElementById('addsel-' + p.key);
                    secciones.push(blankSection(sel ? sel.value : 'tarjetas'));
                    changed = true;
                }
                if (changed) renderSections(p);
                return;
            }

            const subBtn = e.target.closest('[data-sub-move],[data-sub-del],[data-sub-add]');
            if (subBtn) {
                e.preventDefault();
                state[p.key].secciones = readSections(p);
                const secciones = state[p.key].secciones;
                const card = subBtn.closest('.section-card');
                const idx = card ? Number(card.dataset.secIdx) : -1;
                const sec = secciones[idx];
                const t = TIPOS[sec && sec.tipo];
                if (!t || !t.list) return;
                const items = sec.datos[t.list.key] || (sec.datos[t.list.key] = []);
                let changed = false;
                if (subBtn.hasAttribute('data-sub-add')) {
                    const blank = {};
                    t.list.fields.forEach(f => {
                        if (f.t === 'checkbox') blank[f.n] = false;
                        else if (f.t === 'textlines') blank[f.n] = [];
                        else blank[f.n] = '';
                    });
                    items.push(blank);
                    changed = true;
                } else {
                    const sub = subBtn.closest('[data-subitem]');
                    const si = sub ? Number(sub.dataset.subitem) : -1;
                    if (subBtn.hasAttribute('data-sub-move')) {
                        const ni = si + Number(subBtn.getAttribute('data-sub-move'));
                        if (si >= 0 && ni >= 0 && ni < items.length) { swap(items, si, ni); changed = true; }
                    } else {
                        if (si >= 0) { items.splice(si, 1); changed = true; }
                    }
                }
                if (changed) renderSections(p);
            }
        });
    }

    // ---------- Editor de carrusel ----------
    function renderCarrusel(p) {
        const ed = document.getElementById('editor-' + p.key);
        if (!ed) return;
        const data = state[p.key] || {};
        const carrusel = data.carrusel || [];
        const globalDur = validDur(data.globalDuracion, 5);
        ed.innerHTML = `
        <div class="card shadow-sm mb-3">
            <div class="card-body">
                <div class="row g-3 align-items-end">
                    <div class="col-auto">
                        <label class="form-label small mb-1 fw-bold" for="carrusel-global-duracion">Duración general (s)<br>por diapositiva</label>
                        <input type="number" class="form-control form-control-sm" id="carrusel-global-duracion" min="0.5" step="0.5" value="${escAttr(globalDur)}" style="width:100px;" title="Segundos que se muestra cada imagen cuando no tiene su propia duración">
                    </div>
                    <div class="col-auto">
                        <label class="form-label small mb-1 fw-bold d-block">Tiempos</label>
                        <button type="button" class="btn btn-sm ${carruselLock ? 'btn-primary' : 'btn-outline-secondary'}" data-carrusel-lock title="${carruselLock ? 'Bloqueado: al cambiar uno, cambian todos' : 'Desbloqueado: cada slide puede tener su propio tiempo'}">
                            <i class="fa-solid fa-${carruselLock ? 'lock' : 'lock-open'} me-1"></i>${carruselLock ? 'Iguales (bloqueado)' : 'Individuales (desbloqueado)'}
                        </button>
                    </div>
                </div>
                <p class="text-muted small mb-0 mt-2"><i class="fa-solid fa-circle-info me-1"></i>Si una diapositiva tiene su propia duración se usa esa; en blanco usa la duración general.</p>
            </div>
        </div>
        ${carrusel.map((s, i) => `
            <div class="card mb-3 ${s.oculto ? 'slide-oculto' : ''}" data-slide-idx="${i}" data-oculto="${s.oculto ? 1 : 0}">
                <div class="card-header py-2 d-flex align-items-center gap-2">
                    <span class="badge bg-secondary">Slide ${i + 1}</span>
                    ${s.oculto ? '<span class="badge bg-warning text-dark"><i class="fa-solid fa-eye-slash me-1"></i>Oculto</span>' : ''}
                    ${s.url ? `<img class="panel-preview-img" src="${escAttr(s.url)}" alt="">` : '<span class="text-muted small">Sin imagen</span>'}
                    <div class="ms-auto btn-group btn-group-sm">
                        <button type="button" class="btn btn-outline-secondary" data-slide-hide title="${s.oculto ? 'Mostrar' : 'Ocultar'}"><i class="fa-solid ${s.oculto ? 'fa-eye' : 'fa-eye-slash'}"></i></button>
                        <button type="button" class="btn btn-outline-secondary" data-slide-move="-1" title="Subir"><i class="fa-solid fa-arrow-up"></i></button>
                        <button type="button" class="btn btn-outline-secondary" data-slide-move="1" title="Bajar"><i class="fa-solid fa-arrow-down"></i></button>
                        <button type="button" class="btn btn-outline-danger" data-slide-del title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </div>
                <div class="card-body">
                    ${sField({ n: 'url', t: 'url', l: 'Imagen (enlace)' }, s.url)}
                    ${sField({ n: 'titulo', t: 'text', l: 'Título' }, s.titulo)}
                    ${sField({ n: 'texto', t: 'textarea', l: 'Texto' }, s.texto)}
                    <div class="mb-2">
                        <label class="form-label small mb-1 fw-bold" for="slide-duracion-${i}">Duración (s) <span class="text-muted fw-normal">en blanco = general (${globalDur} s)</span></label>
                        <input type="number" class="form-control form-control-sm" id="slide-duracion-${i}" data-fld="duracion" value="${escAttr(s.duracion != null ? s.duracion : '')}" min="0.5" step="0.5" placeholder="${globalDur}" ${carruselLock ? 'disabled' : ''}>
                    </div>
                </div>
            </div>`).join('')}
        <button type="button" class="btn btn-sm btn-outline-primary" data-slide-add><i class="fa-solid fa-plus me-1"></i>Añadir slide</button>`;
    }

    function readCarrusel(p) {
        const ed = document.getElementById('editor-' + p.key);
        if (!ed) return [];
        const items = [];
        ed.querySelectorAll(':scope > .card[data-slide-idx]').forEach(card => {
            const o = {};
            card.querySelectorAll('[data-fld]').forEach(el => { o[el.dataset.fld] = valOf(el); });
            items.push({ url: o.url || '', titulo: o.titulo || '', texto: o.texto || '', duracion: parseDur(o.duracion), oculto: card.dataset.oculto === '1' });
        });
        return items;
    }

    function bindCarrusel(p) {
        const ed = document.getElementById('editor-' + p.key);
        if (!ed) return;

        function syncState() {
            const gEl = document.getElementById('carrusel-global-duracion');
            state[p.key].globalDuracion = gEl ? validDur(gEl.value, 5) : 5;
            state[p.key].carrusel = readCarrusel(p);
        }

        ed.addEventListener('click', function (e) {
            const btn = e.target.closest('[data-slide-move],[data-slide-del],[data-slide-add],[data-slide-hide],[data-carrusel-lock]');
            if (!btn) return;
            e.preventDefault();

            if (btn.hasAttribute('data-slide-hide')) {
                syncState();
                const items = state[p.key].carrusel;
                const card = btn.closest('.card[data-slide-idx]');
                const idx = card ? Number(card.dataset.slideIdx) : -1;
                if (idx >= 0 && items[idx]) {
                    items[idx].oculto = items[idx].oculto === true ? false : true;
                    renderCarrusel(p);
                }
                return;
            }

            if (btn.hasAttribute('data-carrusel-lock')) {
                syncState();
                carruselLock = !carruselLock;
                // Al bloquear, todas las diapositivas adoptan la duración general
                const g = validDur(state[p.key].globalDuracion, 5);
                if (carruselLock) state[p.key].carrusel.forEach(s => s.duracion = g);
                renderCarrusel(p);
                return;
            }

            syncState();
            const items = state[p.key].carrusel;
            const card = btn.closest('.card[data-slide-idx]');
            const idx = card ? Number(card.dataset.slideIdx) : -1;
            let changed = false;
            if (btn.hasAttribute('data-slide-add')) {
                items.push({ url: '', titulo: '', texto: '', duracion: null, oculto: false });
                changed = true;
            } else if (btn.hasAttribute('data-slide-move')) {
                const ni = idx + Number(btn.getAttribute('data-slide-move'));
                if (idx >= 0 && ni >= 0 && ni < items.length) { swap(items, idx, ni); changed = true; }
            } else if (btn.hasAttribute('data-slide-del')) {
                if (idx >= 0) { items.splice(idx, 1); changed = true; }
            }
            if (changed) renderCarrusel(p);
        });

        // Sincronizar duraciones mientras se escribe
        ed.addEventListener('input', function (e) {
            const gEl = document.getElementById('carrusel-global-duracion');
            if (e.target === gEl) {
                state[p.key].globalDuracion = parseDur(e.target.value) || 5;
                if (carruselLock) {
                    const g = parseDur(e.target.value);
                    state[p.key].carrusel.forEach(s => s.duracion = g);
                    ed.querySelectorAll('[data-fld="duracion"]').forEach(inp => {
                        inp.value = g != null ? g : '';
                        inp.placeholder = g != null ? g : 5;
                    });
                }
            } else if (e.target.dataset && e.target.dataset.fld === 'duracion') {
                const card = e.target.closest('.card[data-slide-idx]');
                if (!card) return;
                const idx = Number(card.dataset.slideIdx);
                const items = state[p.key].carrusel;
                if (items[idx]) items[idx].duracion = parseDur(e.target.value);
            }
        });
    }

    // ---------- Editor de opciones generales ----------
    function renderConfig(p) {
        const ed = document.getElementById('editor-' + p.key);
        if (!ed) return;
        const cfg = state[p.key] || {};
        ed.innerHTML = `<div class="card shadow-sm"><div class="card-body">
            ${CONFIG_FIELDS.map(f => sField(f, cfg[f.n])).join('')}
            <div class="text-muted small mt-2"><i class="fa-solid fa-circle-info me-1"></i>El email y el enlace de Instagram también se usan en el pie de página.</div>
        </div></div>`;
    }

    function readConfig(p) {
        const ed = document.getElementById('editor-' + p.key);
        if (!ed) return {};
        const cfg = {};
        ed.querySelectorAll('[data-fld]').forEach(el => { cfg[el.dataset.fld] = valOf(el); });
        return cfg;
    }

    // ---------- Guardar / restaurar ----------
    function validarEntradas(p) {
        const ed = document.getElementById('editor-' + p.key);
        if (!ed) return true;
        const malos = [];
        ed.querySelectorAll('[data-url="1"]').forEach(el => {
            const v = (el.value || '').trim();
            if (v && !esUrlAceptable(v)) malos.push(v);
        });
        if (malos.length) {
            showAlert(`Hay enlaces que no parecen válidos:<ul class="mb-0 mt-1">${malos.map(v => `<li>${esc(v)}</li>`).join('')}</ul>`, 'danger');
            return false;
        }
        const malDur = [];
        ed.querySelectorAll('[data-fld="duracion"]').forEach(el => {
            const v = (el.value || '').trim();
            if (v !== '' && !(isFinite(Number(v)) && Number(v) > 0)) malDur.push(v);
        });
        if (malDur.length) {
            showAlert(`Las duraciones deben ser números positivos en segundos. Revisa: "${malDur.join('", "')}"`, 'danger');
            return false;
        }
        return true;
    }

    async function guardar(p) {
        if (!validarEntradas(p)) return;
        let model;
        if (p.tipo === 'secciones') model = { secciones: readSections(p) };
        else if (p.tipo === 'carrusel') {
            const gEl = document.getElementById('carrusel-global-duracion');
            model = { globalDuracion: (gEl ? parseDur(gEl.value) : null) || 5, carrusel: readCarrusel(p) };
        }
        else model = readConfig(p);

        const btn = document.querySelector(`[data-save="${p.key}"]`);
        const orig = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...'; }
        try {
            await db.collection(KEY).doc(p.key).set(model);
            state[p.key] = model;
            if (window.auditar) await window.auditar('contenido', 'editar', `Contenido de "${p.label}" actualizado`, { pagina: p.key });
            showAlert(`Contenido de "${p.label}" guardado.`, 'success');
        } catch (e) {
            console.error('Error al guardar:', e);
            showAlert('Error al guardar. Inténtalo de nuevo.', 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = orig; }
        }
    }

    function restaurar(p) {
        showConfirmationModal(
            `Restaurar "${p.label}"`,
            'Se reemplazará TODO el contenido de esta sección por los valores por defecto de fábrica. Esta acción no se puede deshacer. ¿Continuar?',
            async function () {
                const def = clone((window.CONTENIDO_DEFAULT || {})[p.key] || {});
                try {
                    await db.collection(KEY).doc(p.key).set(def);
                    state[p.key] = def;
                    if (window.auditar) await window.auditar('contenido', 'restaurar', `Contenido de "${p.label}" restaurado a valores por defecto`, { pagina: p.key });
                    renderTab(p);
                    showAlert('Valores por defecto restaurados.', 'success');
                } catch (e) {
                    console.error('Error al restaurar:', e);
                    showAlert('Error al restaurar.', 'danger');
                }
            }
        );
    }

    function renderTab(p) {
        if (p.tipo === 'secciones') renderSections(p);
        else if (p.tipo === 'carrusel') renderCarrusel(p);
        else renderConfig(p);
    }

    // ---------- Inicialización (solo admin) ----------
    auth.onAuthStateChanged(async user => {
        if (!user) {
            panelMain.innerHTML = '<div class="alert alert-danger">Acceso denegado. Por favor, inicia sesión.</div>';
            return;
        }
        const isAdmin = await window.isUserAdmin();
        if (!isAdmin) {
            panelMain.innerHTML = '<div class="alert alert-danger">Acceso denegado. Solo los administradores pueden acceder al panel de control.</div>';
            return;
        }
        if (inited) return;
        inited = true;
        try {
            const snaps = await Promise.all(PAGINAS.map(p => db.collection(KEY).doc(p.key).get()));
            PAGINAS.forEach((p, i) => {
                state[p.key] = snaps[i].exists ? snaps[i].data() : clone((window.CONTENIDO_DEFAULT || {})[p.key] || {});
            });
            PAGINAS.forEach(p => renderTab(p));
            PAGINAS.forEach(p => {
                if (p.tipo === 'secciones') bindEditor(p);
                else if (p.tipo === 'carrusel') bindCarrusel(p);
            });

            panelMain.addEventListener('click', function (e) {
                const saveBtn = e.target.closest('[data-save]');
                if (saveBtn) { e.preventDefault(); const p = byKey(saveBtn.getAttribute('data-save')); if (p) guardar(p); return; }
                const resBtn = e.target.closest('[data-restore]');
                if (resBtn) { e.preventDefault(); const p = byKey(resBtn.getAttribute('data-restore')); if (p) restaurar(p); }
            });
        } catch (err) {
            console.error('Error al cargar el panel:', err);
            panelMain.innerHTML = '<div class="alert alert-danger">No se pudieron cargar los contenidos.</div>';
        }
    });
});