document.addEventListener('DOMContentLoaded', function () {
    const main = document.getElementById('contrasenas-main');
    if (!main) return;

    const db = firebase.firestore();
    const auth = firebase.auth();
    const COL = 'contrasenas';
    const EMAIL_DEFAULT = 'pactodellotocadiz@gmail.com';
    const TITULO_BASE = 'General';

    let tablas = []; // { id, nombre, base, items }
    let inited = false;

    // ---------- Utilidades ----------
    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function escAttr(v) { return esc(v); }
    function abs(v) { return (v == null ? '' : String(v)); }

    function mesActual() {
        const s = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function esUrlAceptable(v) {
        return /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[^\s]+|#[^\s]*|\/[^\s]*|[\w-]+(\.[\w-]+)+[^\s]*)$/i.test(v);
    }

    function valorFecha(it) {
        return abs(it.fechaUltimaActualizacion);
    }

    // Los admins no-superadmin solo pueden añadir contraseñas; el resto solo superadmins
    function esSuperAdmin() {
        return typeof window.C !== 'undefined' && window.C.cargado && window.C.esSuperAdmin();
    }

    // ---------- Render ----------
    function entryRowHtml(tablaId, it, idx) {
        const google = it.inicioGoogle === true;
        const usuarioCell = google
            ? `<span class="badge google-badge"><i class="fa-brands fa-google me-1"></i>Inicio de sesión con cuenta de Google</span>`
            : `<span>${abs(it.usuario) || `<em class="text-muted">${esc(EMAIL_DEFAULT)}</em>`}</span>`;
        const pwCell = google
            ? `<span class="text-muted">—</span>`
            : `<div class="pw-masked">••••••••</div>
               <div class="mt-1 d-flex gap-1">
                   <button type="button" class="btn btn-sm btn-outline-secondary" data-pw-toggle title="Mostrar"><i class="fa-solid fa-eye"></i></button>
                   <button type="button" class="btn btn-sm btn-outline-secondary" data-pw-copy title="Copiar"><i class="fa-solid fa-copy"></i></button>
               </div>`;
        const dosPasosBadge = it.dosPasos
            ? `<span class="badge bg-warning text-dark"><i class="fa-solid fa-shield-halved me-1"></i>2FA</span>`
            : '';
        const enlaceText = abs(it.enlace).length > 40 ? abs(it.enlace).substring(0, 40) + '...' : abs(it.enlace);
        const enlaceCell = abs(it.enlace)
            ? `<a href="${escAttr(it.enlace)}" target="_blank" rel="noopener noreferrer" title="${escAttr(it.enlace)}"><i class="fa-solid fa-arrow-up-right-from-square me-1"></i>${esc(enlaceText)}</a>`
            : `<span class="text-muted">—</span>`;
        const accionesCell = esSuperAdmin()
            ? `<td class="text-nowrap">
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary" data-entry-edit title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="btn btn-outline-danger" data-entry-del title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>`
            : '';
        return `<tr data-idx="${idx}" data-pw="${escAttr(abs(it.contrasena))}">
            <td class="fw-bold">${esc(it.nombre) || '<span class="text-muted">—</span>'}</td>
            <td>${usuarioCell}</td>
            <td class="pw-cell">${pwCell}</td>
            <td>${dosPasosBadge}</td>
            <td>${enlaceCell}</td>
            <td class="small text-muted">${esc(valorFecha(it)) || '<span class="text-muted">—</span>'}</td>
            ${accionesCell}
        </tr>`;
    }

    function renderTablas() {
        const cont = document.getElementById('tablas-container');
        if (!cont) return;
        const superAdmin = esSuperAdmin();
        const colSpan = superAdmin ? 7 : 6;
        const accionesTh = superAdmin ? '<th class="text-end">Acciones</th>' : '';
        cont.innerHTML = tablas.map((t) => {
            const items = t.items || [];
            const accionesHeaderHtml = superAdmin ? `<div class="ms-auto btn-group btn-group-sm">
                        <button type="button" class="btn btn-outline-secondary" data-tabla-edit="${escAttr(t.id)}" title="Renombrar"><i class="fa-solid fa-pen"></i></button>
                        ${t.base === true ? '' : `<button type="button" class="btn btn-outline-danger" data-tabla-del="${escAttr(t.id)}" title="Eliminar tabla"><i class="fa-solid fa-trash-can"></i></button>`}
                    </div>` : '';
            return `
            <div class="card shadow-sm mb-4" data-tabla-id="${escAttr(t.id)}">
                <div class="card-header py-3 d-flex flex-wrap align-items-center gap-2">
                    <i class="fa-solid fa-key me-1 text-muted"></i>
                    <span class="editable-title">${esc(t.nombre)}</span>
                    ${t.base === true ? '<span class="badge bg-secondary small">Base</span>' : ''}
                    ${accionesHeaderHtml}
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle tabla-contrasenas mb-3">
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Usuario</th>
                                    <th>Contraseña</th>
                                    <th>2FA</th>
                                    <th>Enlace</th>
                                    <th>Última actualización</th>
                                    ${accionesTh}
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map((it, i) => entryRowHtml(t.id, it, i)).join('')}
                                ${items.length ? '' : `<tr><td colspan="${colSpan}" class="text-center text-muted py-3">No hay contraseñas en esta tabla todavía.</td></tr>`}
                            </tbody>
                        </table>
                    </div>
                    <button type="button" class="btn btn-sm btn-success" data-entry-add="${escAttr(t.id)}"><i class="fa-solid fa-plus me-1"></i>Añadir contraseña</button>
                </div>
            </div>`;
        }).join('') || '<div class="alert alert-info">No hay tablas todavía.</div>';
    }

    // ---------- Persistencia ----------
    function guardarTabla(t, msg) {
        return db.collection(COL).doc(t.id).set({ nombre: t.nombre, base: t.base === true, items: t.items || [] })
            .then(async () => {
                if (window.auditar && msg) await window.auditar('contrasenas', 'editar', msg, { tabla: t.nombre });
            });
    }

    async function cargarTablas() {
        const snap = await db.collection(COL).get();
        tablas = snap.docs.map(d => ({
            id: d.id,
            base: d.data().base === true,
            nombre: d.data().nombre || '',
            items: Array.isArray(d.data().items) ? d.data().items : []
        }));
        if (!tablas.length) {
            const docRef = await db.collection(COL).add({ nombre: TITULO_BASE, base: true, items: [] });
            tablas.push({ id: docRef.id, nombre: TITULO_BASE, base: true, items: [] });
        }
        renderTablas();
    }

    // ---------- Modales ----------
    let tablaModal, pwModal;

    function abrirTablaModal(t) {
        const form = document.getElementById('tabla-form');
        form.reset();
        document.getElementById('tabla-id').value = t ? t.id : '';
        document.getElementById('tabla-nombre').value = t ? t.nombre : '';
        document.getElementById('tablaModalLabel').textContent = t ? 'Renombrar tabla' : 'Nueva tabla';
        (tablaModal || (tablaModal = new bootstrap.Modal(document.getElementById('tabla-modal')))).show();
    }

    function abrirPwModal(t, it, idx) {
        const form = document.getElementById('pw-form');
        form.reset();
        document.getElementById('pw-tabla-id').value = t.id;
        document.getElementById('pw-index').value = idx >= 0 ? idx : -1;
        document.getElementById('pwModalLabel').textContent = it ? 'Editar contraseña' : 'Nueva contraseña';
        document.getElementById('pw-nombre').value = it ? abs(it.nombre) : '';
        document.getElementById('pw-google').checked = it ? it.inicioGoogle === true : false;
        document.getElementById('pw-usuario').value = it && it.inicioGoogle !== true ? abs(it.usuario) : (it ? abs(it.usuario) : '');
        document.getElementById('pw-clave').value = it && it.inicioGoogle !== true ? abs(it.contrasena) : '';
        document.getElementById('pw-enlace').value = it ? abs(it.enlace) : '';
        document.getElementById('pw-dospasos').checked = it ? it.dosPasos === true : false;
        sincronizarGoogle();
        (pwModal || (pwModal = new bootstrap.Modal(document.getElementById('pw-modal')))).show();
    }

    function sincronizarGoogle() {
        const google = document.getElementById('pw-google').checked;
        document.getElementById('pw-credenciales').classList.toggle('d-none', google);
        document.getElementById('pw-google-nota').classList.toggle('d-none', !google);
        if (google) {
            document.getElementById('pw-usuario').value = '';
            document.getElementById('pw-clave').value = '';
        }
        if (google) document.getElementById('pw-enlace').focus();
    }

    // ---------- Validación ----------
    function validarEnlace(v) {
        v = (v || '').trim();
        if (v && !esUrlAceptable(v)) {
            showAlert('El enlace no parece válido. Revísalo antes de guardar.', 'danger');
            return false;
        }
        return true;
    }

    // ---------- Eventos ----------
    document.getElementById('btn-tabla-add').addEventListener('click', function () {
        if (!esSuperAdmin()) return;
        abrirTablaModal(null);
    });

    document.getElementById('tabla-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!esSuperAdmin()) return;
        const id = document.getElementById('tabla-id').value;
        const nombre = document.getElementById('tabla-nombre').value.trim();
        if (!nombre) return;
        const btn = this.querySelector('button[type="submit"]');
        const orig = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...';
        try {
            if (id) {
                const t = tablas.find(x => x.id === id);
                if (t) {
                    t.nombre = nombre;
                    await guardarTabla(t, `Tabla "${nombre}" renombrada`);
                }
            } else {
                const ref = await db.collection(COL).add({ nombre, base: false, items: [] });
                tablas.push({ id: ref.id, nombre, base: false, items: [] });
                if (window.auditar) await window.auditar('contrasenas', 'crear', `Tabla "${nombre}" creada`, { tabla: nombre });
            }
            renderTablas();
            bootstrap.Modal.getInstance(document.getElementById('tabla-modal')).hide();
            showAlert(id ? 'Tabla renombrada.' : 'Tabla creada.', 'success');
        } catch (err) {
            console.error('Error al guardar la tabla:', err);
            showAlert('Error al guardar la tabla. Inténtalo de nuevo.', 'danger');
        } finally {
            btn.disabled = false; btn.innerHTML = orig;
        }
    });

    document.getElementById('pw-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        const tablaId = document.getElementById('pw-tabla-id').value;
        const idx = Number(document.getElementById('pw-index').value);
        const nombre = document.getElementById('pw-nombre').value.trim();
        if (!nombre) { showAlert('El nombre es obligatorio.', 'danger'); return; }
        const enlace = document.getElementById('pw-enlace').value.trim();
        if (!validarEnlace(enlace)) return;
        const google = document.getElementById('pw-google').checked;
        const esNueva = idx < 0;

        const t = tablas.find(x => x.id === tablaId);
        if (!t) return;

        const item = {
            nombre: nombre,
            usuario: google ? '' : document.getElementById('pw-usuario').value.trim(),
            contrasena: google ? '' : document.getElementById('pw-clave').value,
            enlace: enlace,
            inicioGoogle: google,
            dosPasos: document.getElementById('pw-dospasos').checked,
            fechaUltimaActualizacion: mesActual()
        };

        const btn = this.querySelector('button[type="submit"]');
        const orig = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...';
        try {
            if (esNueva) t.items.push(item);
            else t.items[idx] = item;
            await guardarTabla(t, `Contraseña "${nombre}" ${esNueva ? 'añadida' : 'editada'} en "${t.nombre}"`);
            renderTablas();
            bootstrap.Modal.getInstance(document.getElementById('pw-modal')).hide();
            showAlert(esNueva ? 'Contraseña añadida.' : 'Contraseña actualizada.', 'success');
        } catch (err) {
            console.error('Error al guardar la contraseña:', err);
            showAlert('Error al guardar. Inténtalo de nuevo.', 'danger');
        } finally {
            btn.disabled = false; btn.innerHTML = orig;
        }
    });

    document.getElementById('pw-google').addEventListener('change', sincronizarGoogle);
    document.getElementById('pw-eye').addEventListener('click', function () {
        const input = document.getElementById('pw-clave');
        const esPass = input.type === 'password';
        input.type = esPass ? 'text' : 'password';
        this.innerHTML = `<i class="fa-solid ${esPass ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
    });

    main.addEventListener('click', function (e) {
        const toggle = e.target.closest('[data-pw-toggle]');
        if (toggle) {
            const tr = toggle.closest('tr');
            const cell = tr.querySelector('.pw-cell');
            const span = cell.querySelector('.pw-masked');
            let plain = cell.querySelector('.pw-plain');
            if (!plain) {
                plain = document.createElement('div');
                plain.className = 'pw-plain d-none';
                plain.textContent = tr.dataset.pw;
                cell.insertBefore(plain, cell.firstChild);
            }
            const icon = toggle.querySelector('i');
            if (span.classList.contains('d-none')) {
                span.classList.remove('d-none');
                plain.classList.add('d-none');
                icon.className = 'fa-solid fa-eye';
            } else {
                span.classList.add('d-none');
                plain.classList.remove('d-none');
                icon.className = 'fa-solid fa-eye-slash';
            }
            return;
        }

        const copy = e.target.closest('[data-pw-copy]');
        if (copy) {
            const tr = copy.closest('tr');
            const pw = tr.dataset.pw || '';
            navigator.clipboard.writeText(pw).then(() => {
                showAlert('Contraseña copiada al portapapeles.', 'success');
            }).catch(() => showAlert('No se pudo copiar la contraseña.', 'danger'));
            return;
        }

        const entryAdd = e.target.closest('[data-entry-add]');
        if (entryAdd) {
            const t = tablas.find(x => x.id === entryAdd.getAttribute('data-entry-add'));
            if (t) abrirPwModal(t, null, -1);
            return;
        }

        const entryEdit = e.target.closest('[data-entry-edit]');
        if (entryEdit) {
            if (!esSuperAdmin()) return;
            const tr = entryEdit.closest('tr');
            const idx = Number(tr.dataset.idx);
            const t = tablas.find(x => x.id === tr.closest('.card').dataset.tablaId);
            if (t) abrirPwModal(t, t.items[idx], idx);
            return;
        }

        const entryDel = e.target.closest('[data-entry-del]');
        if (entryDel) {
            if (!esSuperAdmin()) return;
            const tr = entryDel.closest('tr');
            const idx = Number(tr.dataset.idx);
            const t = tablas.find(x => x.id === tr.closest('.card').dataset.tablaId);
            if (!t) return;
            const it = t.items[idx];
            showConfirmationModal(
                'Eliminar contraseña',
                `¿Seguro que quieres eliminar "${it.nombre || 'esta entrada'}"?`,
                async function () {
                    try {
                        t.items.splice(idx, 1);
                        await guardarTabla(t, `Contraseña "${it.nombre}" eliminada de "${t.nombre}"`);
                        renderTablas();
                        showAlert('Contraseña eliminada.', 'success');
                    } catch (err) {
                        console.error('Error al eliminar:', err);
                        showAlert('Error al eliminar. Inténtalo de nuevo.', 'danger');
                    }
                }
            );
            return;
        }

        const tablaEdit = e.target.closest('[data-tabla-edit]');
        if (tablaEdit) {
            if (!esSuperAdmin()) return;
            const t = tablas.find(x => x.id === tablaEdit.getAttribute('data-tabla-edit'));
            if (t) abrirTablaModal(t);
            return;
        }

        const tablaDel = e.target.closest('[data-tabla-del]');
        if (tablaDel) {
            if (!esSuperAdmin()) return;
            const t = tablas.find(x => x.id === tablaDel.getAttribute('data-tabla-del'));
            if (!t) return;
            showConfirmationModal(
                'Eliminar tabla',
                `¿Seguro que quieres eliminar la tabla "${t.nombre}" y todas sus contraseñas?`,
                async function () {
                    try {
                        await db.collection(COL).doc(t.id).delete();
                        tablas = tablas.filter(x => x.id !== t.id);
                        if (window.auditar) await window.auditar('contrasenas', 'eliminar', `Tabla "${t.nombre}" eliminada`, { tabla: t.nombre });
                        renderTablas();
                        showAlert('Tabla eliminada.', 'success');
                    } catch (err) {
                        console.error('Error al eliminar la tabla:', err);
                        showAlert('Error al eliminar la tabla. Inténtalo de nuevo.', 'danger');
                    }
                }
            );
            return;
        }
    });

    // ---------- Inicialización (solo admin) ----------
    auth.onAuthStateChanged(async user => {
        if (!user) {
            main.innerHTML = '<div class="alert alert-danger">Acceso denegado. Por favor, inicia sesión.</div>';
            return;
        }
        const isAdmin = await window.isUserAdmin();
        if (!isAdmin) {
            main.innerHTML = '<div class="alert alert-danger">Acceso denegado. Solo los administradores pueden acceder a Contraseñas.</div>';
            return;
        }
        if (inited) return;
        inited = true;
        try {
            if (typeof window.C !== 'undefined' && window.C.listo) await window.C.listo();
        } catch (e) { /* los permisos quedan en false */ }
        const btnNuevaTabla = document.getElementById('btn-tabla-add');
        if (btnNuevaTabla) btnNuevaTabla.style.display = esSuperAdmin() ? '' : 'none';
        try {
            await cargarTablas();
        } catch (err) {
            console.error('Error al cargar las contraseñas:', err);
            main.insertAdjacentHTML('beforeend', '<div class="alert alert-danger">No se pudieron cargar las contraseñas.</div>');
        }
    });
});