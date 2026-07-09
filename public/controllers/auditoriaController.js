document.addEventListener('DOMContentLoaded', function () {
    const tableEl = document.getElementById('auditoria-table');
    if (!tableEl) return;

    const db = firebase.firestore();
    const auth = firebase.auth();
    let auditTable;
    let allEntries = [];
    let userNameMap = {};

    const filterUser = document.getElementById('filter-audit-user');
    const filterSection = document.getElementById('filter-audit-section');
    const filterAction = document.getElementById('filter-audit-action');

    auth.onAuthStateChanged(async user => {
        if (!user) {
            document.querySelector('main').innerHTML = '<div class="alert alert-danger">Acceso denegado. Por favor, inicie sesión.</div>';
            return;
        }
        const isAdmin = await window.isUserAdmin();
        if (!isAdmin) {
            document.querySelector('main').innerHTML = '<div class="alert alert-danger">Acceso denegado. Solo los administradores pueden ver esta sección.</div>';
            return;
        }
        initAuditoria();
    });

    function initAuditoria() {
        loadUserFilter().then(() => {
            initSelect2();
            initTable();
            loadEntries();
            setupFilters();
            setupCleanupButton();
        });
    }

    async function loadUserFilter() {
        try {
            const snapshot = await db.collection('usuarios').get();
            const users = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const fullName = `${data.nombre || ''} ${data.apellidos || ''}`.trim() || data.correo || 'Sin nombre';
                userNameMap[doc.id] = fullName;
                users.push({ id: doc.id, nombre: fullName });
            });
            users.sort((a, b) => a.nombre.localeCompare(b.nombre));
            users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = u.nombre;
                filterUser.appendChild(opt);
            });
        } catch (e) {
            console.error('Error al cargar usuarios:', e);
        }
    }

    function initSelect2() {
        if (typeof $ !== 'undefined' && $.fn.select2) {
            $(filterUser).select2({
                placeholder: 'Todos los usuarios',
                allowClear: true,
                width: '200px',
                language: { noResults: () => 'No se encontraron resultados' }
            });
            $(filterSection).select2({
                placeholder: 'Todas las secciones',
                allowClear: true,
                width: '170px'
            });
            $(filterAction).select2({
                placeholder: 'Todas las acciones',
                allowClear: true,
                width: '170px'
            });
        }
    }

    function initTable() {
        auditTable = $('#auditoria-table').DataTable({
            language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
            responsive: true,
            pageLength: 25,
            destroy: true,
            data: [],
            columns: [
                {
                    data: 'timestamp', orderable: true,
                    render: function (data) {
                        if (!data || !data.toDate) return '-';
                        return data.toDate().toLocaleString('es-ES');
                    }
                },
                {
                    data: null, orderable: true,
                    render: function (row) {
                        return userNameMap[row.userId] || row.userId || '-';
                    }
                },
                {
                    data: 'section', orderable: true,
                    render: function (data) {
                        const colors = { usuarios: 'bg-secondary', eventos: 'bg-primary', torneos: 'bg-success', inventario: 'bg-warning text-dark' };
                        const labels = { usuarios: 'Usuarios', eventos: 'Eventos', torneos: 'Torneos', inventario: 'Inventario' };
                        const color = colors[data] || 'bg-secondary';
                        const label = labels[data] || data;
                        return `<span class="badge ${color} badge-section">${label}</span>`;
                    }
                },
                {
                    data: 'action', orderable: true,
                    render: function (data) {
                        const colors = { crear: 'bg-success', editar: 'bg-info text-dark', eliminar: 'bg-danger', desactivar: 'bg-warning text-dark', reactivar: 'bg-primary', iniciar: 'bg-secondary', finalizar: 'bg-dark', cambio_rol: 'bg-secondary' };
                        const labels = { crear: 'Crear', editar: 'Editar', eliminar: 'Eliminar', desactivar: 'Desactivar', reactivar: 'Reactivar', iniciar: 'Iniciar', finalizar: 'Finalizar', cambio_rol: 'Cambio rol' };
                        const color = colors[data] || 'bg-secondary';
                        const label = labels[data] || data;
                        return `<span class="badge ${color} badge-action">${label}</span>`;
                    }
                },
                { data: 'description', orderable: false }
            ],
            order: [[0, 'desc']]
        });
    }

    function loadEntries() {
        db.collection('auditoria')
            .orderBy('timestamp', 'desc')
            .limit(1000)
            .get()
            .then(snapshot => {
                allEntries = [];
                snapshot.forEach(doc => {
                    allEntries.push({ id: doc.id, ...doc.data() });
                });
                applyFilters();
            })
            .catch(err => {
                console.error('Error al cargar auditoría:', err);
                showAlert('Error al cargar el registro de auditoría.', 'danger');
            });
    }

    function applyFilters() {
        const userId = filterUser.value;
        const section = filterSection.value;
        const action = filterAction.value;

        let filtered = allEntries;
        if (userId) filtered = filtered.filter(e => e.userId === userId);
        if (section) filtered = filtered.filter(e => e.section === section);
        if (action) filtered = filtered.filter(e => e.action === action);

        auditTable.clear().rows.add(filtered).draw();
    }

    function setupFilters() {
        const redraw = () => applyFilters();
        $(filterUser).on('change', redraw);
        $(filterSection).on('change', redraw);
        $(filterAction).on('change', redraw);
    }

    function setupCleanupButton() {
        const btn = document.getElementById('btn-limpiar-auditoria');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            try {
                const snapshot = await db.collection('auditoria').get();
                const total = snapshot.size;
                if (total <= 1000) {
                    showAlert(`Solo hay ${total} registros, no es necesario limpiar.`, 'info');
                    return;
                }
                const toDelete = total - 1000;
                const oldDocs = await db.collection('auditoria')
                    .orderBy('timestamp', 'asc')
                    .limit(toDelete)
                    .get();

                if (oldDocs.empty) {
                    showAlert('No hay registros que eliminar.', 'info');
                    return;
                }

                const batch = db.batch();
                oldDocs.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                showAlert(`Eliminados ${oldDocs.docs.length} registros antiguos. Se mantienen los últimos 1000.`, 'success');
                loadEntries();
            } catch (err) {
                console.error('Error al limpiar auditoría:', err);
                showAlert('Error al limpiar registros.', 'danger');
            }
        });
    }
});
