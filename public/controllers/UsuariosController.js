document.addEventListener('DOMContentLoaded', function () {
    const db = firebase.firestore();
    const auth = firebase.auth();

    const usuariosTableElement = document.getElementById('usuarios-table');
    if (usuariosTableElement) {
        let currentUserIsAdmin = false;

        auth.onAuthStateChanged(user => {
            if (user) {
                window.isUserAdmin().then(isAdmin => {
                    currentUserIsAdmin = isAdmin;
                    if (currentUserIsAdmin) {
                        initializeUsersTable();
                    } else {
                        document.querySelector('main').innerHTML = '<div class="alert alert-danger">Acceso denegado. Solo los administradores pueden ver esta sección.</div>';
                    }
                });
            } else {
                document.querySelector('main').innerHTML = '<div class="alert alert-danger">Acceso denegado. Por favor, inicie sesión.</div>';
            }
        });
    }
});

let usersTable;
const editUserModalEl = document.getElementById('edit-user-modal');
const editUserModal = editUserModalEl ? new bootstrap.Modal(editUserModalEl) : null;
const filterRol = document.getElementById('filter-rol');
const filterProximosDeuda = document.getElementById('filter-proximos-deuda');
let filterEstadoPagoVal = '';
const filterEstadoPagoContainer = document.getElementById('filter-estado-pago-container');
const filterEstadoPagoBtn = document.getElementById('filter-estado-pago-btn');
const filterEstadoPagoMenu = document.getElementById('filter-estado-pago-menu');
const btnActualizarCuentas = document.getElementById('btn-actualizar-cuentas');
const btnExportarCsv = document.getElementById('btn-exportar-csv');

function isProximoDeuda(pagadoHasta, isSocio) {
    if (!pagadoHasta || !isSocio) return false;
    const pagado = normalizarFecha(pagadoHasta);
    if (!pagado) return false;
    const hoy = new Date();
    const hoyNorm = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const fechaLimite = new Date(pagado);
    fechaLimite.setMonth(fechaLimite.getMonth() + 3);
    if (hoyNorm >= fechaLimite) return false;
    const diasRestantes = Math.ceil((fechaLimite - hoyNorm) / (1000 * 60 * 60 * 24));
    return diasRestantes <= 30;
}

function getEstadoDeuda(pagadoHasta) {
    const pagado = normalizarFecha(pagadoHasta);
    if (!pagado) return null;
    const hoy = new Date();
    const hoyNorm = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (pagado >= hoyNorm) return null;
    const fechaLimite = new Date(pagado);
    fechaLimite.setMonth(fechaLimite.getMonth() + 1);
    fechaLimite.setDate(fechaLimite.getDate() + 1);
    if (hoyNorm < fechaLimite) return 'debe1';
    return 'debe2';
}

function normalizarFecha(timestamp) {
    if (!timestamp || !timestamp.toDate) return null;
    const d = timestamp.toDate();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function initializeUsersTable() {
    usersTable = $('#usuarios-table').DataTable({
        language: {
            url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json"
        },
        responsive: true,
        pageLength: 25,
        destroy: true,
        columns: [
            {
                data: null, orderable: true, searchable: true,
                render: function (data, type, row) {
                    const nombre = row.nombre || '';
                    const apellidos = row.apellidos || '';
                    const telefono = row.telefono || '';
                    const correo = row.correo || '';
                    const fechaReg = row.timestamp && row.timestamp.toDate
                        ? row.timestamp.toDate().toLocaleDateString('es-ES')
                        : '';
                    return `<div class="d-flex align-items-center gap-2">
                        <span class="fw-semibold text-nowrap">${nombre} ${apellidos}</span>
                        <span class="text-muted small d-none d-sm-inline">${correo}</span>
                    </div>`;
                },
                responsivePriority: 1
            },
            {
                data: null, orderable: true, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    if (row.isAdmin) return '<span class="badge bg-primary" style="font-size:0.65rem">Admin</span>';
                    if (row.isColaborador) return '<span class="badge bg-info" style="font-size:0.65rem">Colab</span>';
                    if (row.isSocio) return '<span class="badge bg-success" style="font-size:0.65rem">Socio</span>';
                    return '<span class="badge bg-secondary" style="font-size:0.65rem">User</span>';
                },
                responsivePriority: 2
            },
            {
                data: null, orderable: false, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    if (row.alCorriente) {
                        return '<span class="badge bg-success"><i class="fa-solid fa-check"></i></span>';
                    }
                    if (!row.isSocio) {
                        return '<span class="badge bg-secondary"><i class="fa-solid fa-xmark"></i></span>';
                    }
                    const estado = getEstadoDeuda(row.pagadoHasta);
                    if (estado === 'debe2') {
                        return '<span class="badge bg-danger"><i class="fa-solid fa-triangle-exclamation"></i></span>';
                    }
                    if (estado === 'debe1') {
                        return '<span class="badge bg-warning text-dark"><i class="fa-solid fa-triangle-exclamation"></i></span>';
                    }
                    return '<span class="badge bg-secondary"><i class="fa-solid fa-xmark"></i></span>';
                },
                responsivePriority: 4
            },
            {
                data: null, orderable: false, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    const val = row.pagadoHasta && row.pagadoHasta.toDate
                        ? row.pagadoHasta.toDate().toISOString().split('T')[0]
                        : (row.pagadoHasta || '');
                    return `<input type="date" class="form-control form-control-sm user-pagado-hasta" style="min-width:90px;font-size:0.7rem" data-id="${row.id}" value="${val}">`;
                },
                responsivePriority: 3
            },
            {
                data: null, orderable: false, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    const isMe = row.id === firebase.auth().currentUser.uid;
                    const meBadge = isMe ? '<span class="badge bg-info me-1" style="font-size:0.6rem">Tú</span>' : '';

                    const socioIcon = row.isSocio ? 'fa-user-minus' : 'fa-user-plus';
                    const socioText = row.isSocio ? 'Quitar Socio' : 'Hacer Socio';

                    const colabIcon = row.isColaborador ? 'fa-user-gear' : 'fa-user-gear';
                    const colabText = row.isColaborador ? 'Quitar Colab' : 'Hacer Colab';

                    const adminIcon = row.isAdmin ? 'fa-shield-halved' : 'fa-shield';
                    const adminText = row.isAdmin ? 'Quitar Admin' : 'Hacer Admin';

                    return `<div class="d-flex align-items-center justify-content-center gap-1">
                        ${meBadge}
                        <div class="dropdown">
                            <button class="btn btn-sm btn-secondary dropdown-toggle py-0 px-1" type="button" data-bs-toggle="dropdown" title="Acciones">
                                <i class="fa-solid fa-gear"></i>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end" style="min-width:160px;font-size:0.85rem">
                                <li><button class="dropdown-item toggle-socio-btn" data-id="${row.id}" data-name="${row.nombre}"><i class="fa-solid ${socioIcon} me-2"></i>${socioText}</button></li>
                                <li><button class="dropdown-item toggle-colaborador-btn" data-id="${row.id}" data-name="${row.nombre}" ${!row.isSocio ? 'disabled' : ''}><i class="fa-solid ${colabIcon} me-2"></i>${colabText}</button></li>
                                <li><button class="dropdown-item toggle-admin-btn" data-id="${row.id}" data-name="${row.nombre}"><i class="fa-solid ${adminIcon} me-2"></i>${adminText}</button></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><button class="dropdown-item edit-user-btn" data-id="${row.id}"><i class="fa-solid fa-pen me-2"></i>Editar</button></li>
                                <li><button class="dropdown-item text-danger delete-user-btn" data-id="${row.id}" data-name="${row.nombre}"><i class="fa-solid fa-trash me-2"></i>Eliminar</button></li>
                            </ul>
                        </div>
                    </div>`;
                },
                responsivePriority: 1
            }
        ],
        order: [[0, 'asc']]
    });

    // Registrar filtros combinados una vez
    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
        const rowData = usersTable.row(dataIndex).data();
        if (!rowData) return true;
        const rolVal = filterRol ? filterRol.value : '';
        const filterDeuda = filterProximosDeuda && filterProximosDeuda.checked;
        if (rolVal === 'admin' && !rowData.isAdmin) return false;
        if (rolVal === 'colaborador' && !rowData.isColaborador) return false;
        if (rolVal === 'socio' && !rowData.isSocio) return false;
        if (rolVal === 'noSocio' && rowData.isSocio) return false;
        if (filterDeuda) {
            return isProximoDeuda(rowData.pagadoHasta, rowData.isSocio);
        }
        const estadoPagoVal = filterEstadoPagoVal;
        if (estadoPagoVal) {
            const pagado = normalizarFecha(rowData.pagadoHasta);
            if (!pagado) return false;
            const hoyFiltro = new Date();
            const hoyNorm = new Date(hoyFiltro.getFullYear(), hoyFiltro.getMonth(), hoyFiltro.getDate());
            if (estadoPagoVal === 'debe1' && pagado >= hoyNorm) return false;
            if (estadoPagoVal === 'debe2') {
                const fechaLimite = new Date(pagado);
                fechaLimite.setMonth(fechaLimite.getMonth() + 1);
                fechaLimite.setDate(fechaLimite.getDate() + 1);
                if (pagado >= hoyNorm || hoyNorm < fechaLimite) return false;
            }
        }
        return true;
    });

    loadUsersIntoTable();
    setupUserActionHandlers();
}

function loadUsersIntoTable() {
    firebase.firestore().collection('usuarios').get()
        .then((querySnapshot) => {
            const userData = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            usersTable.clear().rows.add(userData).draw();
        })
        .catch((error) => {
            console.error("Error al obtener los usuarios: ", error);
        });
}

function setupUserActionHandlers() {
    const db = firebase.firestore();
    const tbody = $('#usuarios-table tbody');

    tbody.off('click');

    tbody.on('click', '.toggle-socio-btn', function () { handleRoleToggle(this, 'isSocio'); });
    tbody.on('click', '.toggle-colaborador-btn', function () { handleRoleToggle(this, 'isColaborador'); });
    tbody.on('click', '.toggle-admin-btn', function () { handleRoleToggle(this, 'isAdmin'); });

    tbody.on('click', '.edit-user-btn', async function () {
        const userId = $(this).data('id');
        try {
            const doc = await db.collection('usuarios').doc(userId).get();
            if (doc.exists) {
                const userData = doc.data();
                $('#edit-user-id').val(doc.id);
                $('#edit-user-name').val(userData.nombre);
                $('#edit-user-lastname').val(userData.apellidos);
                $('#edit-user-phone').val(userData.telefono || '');
                $('#edit-user-socio').prop('checked', userData.isSocio === true);
                $('#edit-user-colaborador').prop('checked', userData.isColaborador === true);
                $('#edit-user-admin').prop('checked', userData.isAdmin === true);
                editUserModal.show();
            }
        } catch (error) {
            showAlert('Error al cargar los datos del usuario.', 'danger');
        }
    });

    tbody.on('click', '.delete-user-btn', function () {
        const userId = $(this).data('id');
        const userName = $(this).data('name');

        showConfirmationModal(
            'Confirmar Eliminación',
            `¿Estás seguro de que quieres eliminar a ${userName}? Esta acción es permanente y eliminará sus datos de la aplicación (no su cuenta de Google).`,
            async () => {
                try {
                    await db.collection('usuarios').doc(userId).delete();
                    showAlert(`Usuario ${userName} eliminado con éxito.`, 'success');
                    loadUsersIntoTable();
                } catch (error) {
                    showAlert('Error al eliminar el usuario.', 'danger');
                }
            }
        );
    });

    // Cambio del input pagadoHasta
    tbody.on('change', '.user-pagado-hasta', async function () {
        const userId = $(this).data('id');
        const val = $(this).val();
        let fecha = null;
        if (val) {
            fecha = firebase.firestore.Timestamp.fromDate(new Date(val + 'T23:59:59'));
        }
        try {
            await db.collection('usuarios').doc(userId).update({ pagadoHasta: fecha });
        } catch (error) {
            showAlert('Error al actualizar la fecha de pago.', 'danger');
        }
    });

    // Filtros
    const redrawTable = () => usersTable.draw();
    if (filterRol) {
        filterRol.addEventListener('change', () => {
            if (filterEstadoPagoContainer) {
                filterEstadoPagoContainer.classList.toggle('d-none', filterRol.value !== 'socio');
            }
            filterEstadoPagoVal = '';
            if (filterEstadoPagoBtn) filterEstadoPagoBtn.textContent = 'Todos';
            redrawTable();
        });
    }

    if (filterEstadoPagoMenu) {
        filterEstadoPagoMenu.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                filterEstadoPagoVal = item.dataset.value || '';
                if (filterEstadoPagoBtn) filterEstadoPagoBtn.textContent = item.textContent.trim();
                redrawTable();
            });
        });
    }

    if (filterProximosDeuda) filterProximosDeuda.addEventListener('change', redrawTable);

    // Estado inicial del filtro estado de pago
    if (filterEstadoPagoContainer && filterRol) {
        filterEstadoPagoContainer.classList.toggle('d-none', filterRol.value !== 'socio');
    }

    // Botón Actualizar Cuentas
    if (btnActualizarCuentas) {
        btnActualizarCuentas.addEventListener('click', handleActualizarCuentas);
    }

    // Botón Exportar CSV
    if (btnExportarCsv) {
        btnExportarCsv.addEventListener('click', handleExportarCsv);
    }

    $('#edit-user-form').on('submit', async function (e) {
        e.preventDefault();
        const userId = $('#edit-user-id').val();
        const isSocio = $('#edit-user-socio').is(':checked');
        const isColaborador = $('#edit-user-colaborador').is(':checked');
        const isAdmin = $('#edit-user-admin').is(':checked');

        if (isColaborador && !isSocio) {
            showAlert('No se puede dar rol Colaborador sin ser Socio.', 'warning');
            return;
        }

        const updatedData = {
            nombre: $('#edit-user-name').val(),
            apellidos: $('#edit-user-lastname').val(),
            telefono: $('#edit-user-phone').val() || null,
            isSocio,
            isColaborador,
            isAdmin,
        };

        if (!isSocio) {
            updatedData.isColaborador = false;
        }

        try {
            await db.collection('usuarios').doc(userId).update(updatedData);
            editUserModal.hide();
            showAlert('Usuario actualizado con éxito.', 'success');
            loadUsersIntoTable();
        } catch (error) {
            showAlert('Error al actualizar el usuario.', 'danger');
        }
    });
}

async function handleActualizarCuentas() {
    const db = firebase.firestore();
    const now = new Date();
    const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    try {
        const snapshot = await db.collection('usuarios').get();
        const batch = db.batch();
        let count = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            let alCorriente = false;
            let socioStatus = data.isSocio;
            const pagadoHasta = normalizarFecha(data.pagadoHasta);

            if (pagadoHasta && pagadoHasta >= hoy) {
                alCorriente = true;
                socioStatus = true;
            } else if (pagadoHasta) {
                const fechaLimite = new Date(pagadoHasta);
                fechaLimite.setMonth(fechaLimite.getMonth() + 3);
                if (hoy >= fechaLimite) {
                    socioStatus = false;
                } else {
                    socioStatus = true;
                }
            } else {
                socioStatus = false;
            }

            const updateData = {};
            if (data.alCorriente !== alCorriente) {
                updateData.alCorriente = alCorriente;
            }
            if (data.isSocio !== socioStatus) {
                updateData.isSocio = socioStatus;
                if (!socioStatus && data.isColaborador === true) {
                    updateData.isColaborador = false;
                }
            }
            if (Object.keys(updateData).length > 0) {
                batch.update(db.collection('usuarios').doc(doc.id), updateData);
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
            showAlert(`${count} cuenta(s) actualizada(s).`, 'success');
        } else {
            showAlert('Todas las cuentas ya están al día.', 'info');
        }

        loadUsersIntoTable();
    } catch (error) {
        console.error('Error al actualizar cuentas:', error);
        showAlert('Error al actualizar las cuentas.', 'danger');
    }
}

function handleExportarCsv() {
    const db = firebase.firestore();
    db.collection('usuarios').get().then(snapshot => {
        const socios = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(u => u.isSocio === true);

        if (socios.length === 0) {
            showAlert('No hay socios para exportar.', 'info');
            return;
        }

        const escapeCsv = (val) => {
            if (val === null || val === undefined) return '';
            const s = String(val);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        };

        const formatDate = (ts) => {
            if (!ts) return '';
            if (ts.toDate) return ts.toDate().toLocaleDateString('es-ES');
            return ts;
        };

        const headers = ['Nombre', 'Apellidos', 'Teléfono', 'Correo', 'Admin', 'Al corriente', 'Pagado hasta', 'Fecha de registro'];
        const rows = socios.map(u => [
            escapeCsv(u.nombre),
            escapeCsv(u.apellidos || ''),
            escapeCsv(u.telefono || ''),
            escapeCsv(u.correo || ''),
            u.isAdmin ? 'Sí' : 'No',
            u.alCorriente ? 'Sí' : 'No',
            formatDate(u.pagadoHasta),
            formatDate(u.timestamp)
        ].join(','));

        const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `socios_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }).catch(error => {
        console.error('Error al exportar CSV:', error);
        showAlert('Error al exportar el CSV.', 'danger');
    });
}

async function handleRoleToggle(button, role) {
    const db = firebase.firestore();
    const userId = $(button).data('id');
    const userName = $(button).data('name');
    const userDocRef = db.collection('usuarios').doc(userId);

    try {
        const doc = await userDocRef.get();
        if (!doc.exists) return;

        const currentRoleState = doc.data()[role] || false;
        const actionText = currentRoleState ? `quitar rol de ${role.substring(2).toLowerCase()} a` : `hacer ${role.substring(2).toLowerCase()} a`;

        showConfirmationModal(`Confirmar Rol`, `¿Seguro que quieres ${actionText} ${userName}?`, async () => {
            try {
                const updates = {};
                updates[role] = !currentRoleState;

                if (role === 'isSocio' && currentRoleState === true) {
                    updates['isColaborador'] = false;
                }

                if (role === 'isColaborador' && !currentRoleState && !doc.data().isSocio) {
                    showAlert('No se puede hacer colaborador a un usuario que no es socio.', 'warning');
                    return;
                }

                await userDocRef.update(updates);
                showAlert(`Rol de ${userName} actualizado.`, 'success');
                loadUsersIntoTable();
            } catch (error) {
                showAlert('Error al actualizar el rol.', 'danger');
            }
        });
    } catch (error) {
        showAlert('Error al obtener datos del usuario.', 'danger');
    }
}
