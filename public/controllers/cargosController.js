document.addEventListener('DOMContentLoaded', function () {
    const main = document.getElementById('cargos-main');
    if (!main) return;

    const db = window.db;
    const auth = window.auth;
    let usuarios = [];
    let asignaciones = {};
    let inited = false;

    const NOMBRES_MODULO = {
        torneos: 'Torneos',
        eventos: 'Eventos',
        actividades: 'Actividades',
        tiposActividad: 'Tipos de actividad',
        inventario: 'Inventario',
        tesoreria: 'Tesorería',
        contenido: 'Control de contenido',
        usuarios: 'Lista de usuarios',
        contrasenas: 'Contraseñas',
        solicitudes: 'Solicitudes',
        auditoria: 'Auditoría',
        buzon: 'Buzón de sugerencias',
        roles: 'Roles'
    };

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function nombreUsuario(uid) {
        const u = usuarios.find(x => x.id === uid);
        if (!u) return 'Usuario ' + uid.slice(0, 6) + '…';
        const nombre = `${u.nombre || ''} ${u.apellidos || ''}`.trim();
        return nombre || u.correo || uid;
    }

    function textoPermisos(def) {
        if (def.permisos === null) return 'Acceso total a toda la administración.';
        const partes = Object.keys(def.permisos).map(mod => {
            const p = def.permisos[mod];
            const nombre = NOMBRES_MODULO[mod] || mod;
            if (p.acceso === 'edicion') {
                const acciones = [];
                if (p.crear) acciones.push('crear');
                if (p.editar) acciones.push('editar');
                if (p.eliminar) acciones.push('eliminar');
                return `${nombre}: ${acciones.join(', ') || 'editar'}`;
            }
            return `${nombre}: solo lectura`;
        }).join(', ');
        return partes || 'Sin permisos específicos.';
    }

    async function cargarUsuarios() {
        const snap = await db.collection('usuarios').get();
        usuarios = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(u => !u.desactivado)
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
    }

    // Mantiene 'config/superadmin' (espejo que las rules de Firestore leen para
    // saber quién es superadmin) alineado con 'cargos/superadmin'.
    async function sincronizarMirrorSuperadmin() {
        const lista = asignaciones['superadmin'] || [];
        try {
            const ref = db.collection('config').doc('superadmin');
            const snap = await ref.get();
            const actual = snap.exists && Array.isArray(snap.data().usuarioIds) ? snap.data().usuarioIds : null;
            const mismo = actual !== null &&
                actual.length === lista.length &&
                actual.every(x => lista.indexOf(x) !== -1) &&
                lista.every(x => actual.indexOf(x) !== -1);
            if (!mismo) {
                await ref.set({ usuarioIds: lista });
                console.info('Espejo config/superadmin sincronizado.');
            }
        } catch (e) {
            console.warn('No se pudo sincronizar config/superadmin:', e);
        }
    }

    async function guardarCargo(cargoId, lista) {
        await db.collection('cargos').doc(cargoId).set({ usuarioIds: lista });
        asignaciones[cargoId] = lista.slice();
        if (cargoId === 'superadmin') await sincronizarMirrorSuperadmin();
    }

    function render() {
        const container = document.getElementById('cargos-container');
        if (!container) return;

        const defKeys = Object.keys(window.C.DEFINICIONES);
        container.innerHTML = defKeys.map(cargoId => {
            const def = window.C.DEFINICIONES[cargoId];
            const lista = asignaciones[cargoId] || [];

            const usuariosAsignados = lista.map(uid => `
                <div class="cargo-usuario">
                    <div class="d-flex align-items-center gap-2">
                        <i class="fa-regular fa-user text-muted"></i>
                        <span>${esc(nombreUsuario(uid))}</span>
                    </div>
                    <button class="btn btn-sm btn-outline-danger btn-quitar-cargo"
                        data-cargo="${esc(cargoId)}" data-uid="${esc(uid)}" title="Quitar cargo">
                        <i class="fa-solid fa-user-minus"></i>
                    </button>
                </div>`).join('') || '<p class="text-muted small mb-2">Sin personas asignadas.</p>';

            const disponibles = usuarios
                .filter(u => lista.indexOf(u.id) === -1)
                .map(u => `<option value="${esc(u.id)}">${esc(nombreUsuario(u.id))}</option>`).join('');

            return `
                <div class="card mb-4" data-cargo-card="${esc(cargoId)}">
                    <div class="card-header d-flex flex-wrap align-items-center gap-2">
                        <i class="${esc(def.icono || 'fa-solid fa-shield-halved')} text-muted"></i>
                        <span class="fw-bold">${esc(def.nombre)}</span>
                        <span class="badge bg-${esc(def.color)} cargo-badge ms-1">${esc(def.nombre)}</span>
                    </div>
                    <div class="card-body">
                        <p class="text-muted small mb-3">
                            <i class="fa-solid fa-circle-info me-1"></i>${esc(textoPermisos(def))}
                        </p>
                        <div class="row g-3">
                            <div class="col-md-6">
                                <h6 class="text-uppercase small text-muted mb-2">Personas con este cargo</h6>
                                <div class="cargo-lista">${usuariosAsignados}</div>
                            </div>
                            <div class="col-md-6">
                                <h6 class="text-uppercase small text-muted mb-2">Asignar cargo</h6>
                                <div class="input-group">
                                    <select class="form-select form-select-sm cargo-usa-select" data-cargo="${esc(cargoId)}">
                                        <option value="">Selecciona un usuario…</option>
                                        ${disponibles}
                                    </select>
                                    <button class="btn btn-sm btn-primary btn-asignar-cargo" data-cargo="${esc(cargoId)}">
                                        <i class="fa-solid fa-user-plus me-1"></i>Añadir
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
        }).join('');

        // Eventos de asignación
        container.querySelectorAll('.btn-asignar-cargo').forEach(btn => {
            btn.addEventListener('click', async function () {
                const cargoId = this.getAttribute('data-cargo');
                const sel = container.querySelector(`.cargo-usa-select[data-cargo="${CSS.escape(cargoId)}"]`);
                if (!sel || !sel.value) {
                    showAlert('Selecciona un usuario.', 'warning');
                    return;
                }
                const lista = (asignaciones[cargoId] || []).slice();
                if (lista.indexOf(sel.value) === -1) lista.push(sel.value);
                const uid = sel.value;
                try {
                    await guardarCargo(cargoId, lista);
                    const def = window.C.DEFINICIONES[cargoId];
                    if (window.auditar) await window.auditar('cargos', 'asignar', `Cargo "${def.nombre}" asignado a ${nombreUsuario(uid)}`, { cargoId, uid });
                    showAlert(`Cargo asignado a ${esc(nombreUsuario(uid))}.`, 'success');
                    render();
                } catch (err) {
                    console.error('Error al asignar cargo:', err);
                    showAlert('Error al asignar el cargo. Inténtalo de nuevo.', 'danger');
                }
            });
        });

        // Eventos de quitar cargo
        container.querySelectorAll('.btn-quitar-cargo').forEach(btn => {
            btn.addEventListener('click', function () {
                const cargoId = this.getAttribute('data-cargo');
                const uid = this.getAttribute('data-uid');
                const def = window.C.DEFINICIONES[cargoId];
                showConfirmationModal(
                    'Quitar cargo',
                    `¿Quitar el cargo "${def.nombre}" a ${nombreUsuario(uid)}?`,
                    async function () {
                        const lista = (asignaciones[cargoId] || []).filter(x => x !== uid);
                        try {
                            await guardarCargo(cargoId, lista);
                            if (window.auditar) await window.auditar('cargos', 'quitar', `Cargo "${def.nombre}" retirado a ${nombreUsuario(uid)}`, { cargoId, uid });
                            showAlert(`Se retiró el cargo a ${esc(nombreUsuario(uid))}.`, 'success');
                            render();
                        } catch (err) {
                            console.error('Error al quitar cargo:', err);
                            showAlert('Error al quitar el cargo. Inténtalo de nuevo.', 'danger');
                        }
                    }
                );
            });
        });
    }

    auth.onAuthStateChanged(async user => {
        if (!user) {
            main.innerHTML = '<div class="alert alert-danger">Acceso denegado. Por favor, inicia sesión.</div>';
            return;
        }
        try {
            if (typeof window.C !== 'undefined') await window.C.listo();
            // Solo el superadmin puede gestionar cargos
            const esSuperAdmin = typeof window.C !== 'undefined' && window.C.cargado && window.C.esSuperAdmin();
            if (!esSuperAdmin) {
                main.innerHTML = '<div class="alert alert-danger">Acceso denegado. Solo el superadmin puede gestionar cargos.</div>';
                return;
            }
            if (inited) return;
            inited = true;
            await cargarUsuarios();
            asignaciones = {};
            Object.keys(window.C.asignaciones || {}).forEach(k => { asignaciones[k] = (window.C.asignaciones[k] || []).slice(); });
            await sincronizarMirrorSuperadmin();
            render();
        } catch (err) {
            console.error('Error cargando cargos:', err);
            main.innerHTML = '<div class="alert alert-danger">No se pudo cargar la gestión de cargos.</div>';
        }
    });
});