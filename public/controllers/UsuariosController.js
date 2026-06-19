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
const filterSoloSocios = document.getElementById('filter-solo-socios');
const filterSoloAdmins = document.getElementById('filter-solo-admins');
const btnActualizarCuentas = document.getElementById('btn-actualizar-cuentas');
const btnExportarCsv = document.getElementById('btn-exportar-csv');

function initializeUsersTable() {
    usersTable = $('#usuarios-table').DataTable({
        language: {
            url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json"
        },
        responsive: true,
        pageLength: 25,
        destroy: true,
        columns: [
            { data: "nombre" },
            { data: "apellidos" },
            { data: "telefono" },
            { data: "correo" },
            {
                data: "isSocio",
                render: (data) => data ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-secondary">No</span>',
                className: 'text-center'
            },
            {
                data: "isAdmin",
                render: (data) => data ? '<span class="badge bg-primary">Sí</span>' : '<span class="badge bg-secondary">No</span>',
                className: 'text-center'
            },
            {
                data: null, orderable: false, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    const checked = row.alCorriente ? 'checked' : '';
                    return `<div class="form-check form-switch mb-0 justify-content-center">
                        <input class="form-check-input user-paid-switch" type="checkbox" data-id="${row.id}" ${checked}>
                    </div>`;
                }
            },
            {
                data: null, orderable: false, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    const val = row.pagadoHasta && row.pagadoHasta.toDate
                        ? row.pagadoHasta.toDate().toISOString().split('T')[0]
                        : (row.pagadoHasta || '');
                    return `<input type="date" class="form-control form-control-sm user-pagado-hasta" style="min-width:130px" data-id="${row.id}" value="${val}">`;
                }
            },
            {
                data: "timestamp",
                render: (data) => data && data.toDate ? data.toDate().toLocaleDateString('es-ES') : 'No disponible'
            },
            {
                data: null, orderable: false, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    if (row.id === firebase.auth().currentUser.uid) return '<span class="badge bg-info">Eres tú</span>';

                    const socioBtn = row.isSocio
                        ? `<button class="btn btn-sm btn-warning toggle-socio-btn" data-id="${row.id}" data-name="${row.nombre}" title="Quitar Socio"><i class="fa-solid fa-user-minus"></i></button>`
                        : `<button class="btn btn-sm btn-success toggle-socio-btn" data-id="${row.id}" data-name="${row.nombre}" title="Hacer Socio"><i class="fa-solid fa-user-plus"></i></button>`;

                    const adminBtn = row.isAdmin
                        ? `<button class="btn btn-sm btn-danger toggle-admin-btn" data-id="${row.id}" data-name="${row.nombre}" title="Quitar Admin"><i class="fa-solid fa-shield-halved"></i></button>`
                        : `<button class="btn btn-sm btn-primary toggle-admin-btn" data-id="${row.id}" data-name="${row.nombre}" title="Hacer Admin"><i class="fa-solid fa-shield"></i></button>`;

                    const editBtn = `<button class="btn btn-sm btn-info edit-user-btn" data-id="${row.id}" title="Editar"><i class="fas fa-edit"></i></button>`;
                    const deleteBtn = `<button class="btn btn-sm btn-danger delete-user-btn" data-id="${row.id}" data-name="${row.nombre}" title="Eliminar"><i class="fas fa-trash"></i></button>`;

                    return `<div class="d-flex gap-1 justify-content-center flex-nowrap">${socioBtn}${adminBtn}${editBtn}${deleteBtn}</div>`;
                }
            }
        ],
        order: [[0, 'asc']]
    });

    // Registrar filtros combinados una vez (consulta los checkboxes en cada evaluación)
    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
        const rowData = usersTable.row(dataIndex).data();
        if (!rowData) return true;
        const filterSocio = filterSoloSocios && filterSoloSocios.checked;
        const filterAdmin = filterSoloAdmins && filterSoloAdmins.checked;
        if (filterSocio && filterAdmin) return rowData.isSocio === true && rowData.isAdmin === true;
        if (filterSocio) return rowData.isSocio === true;
        if (filterAdmin) return rowData.isAdmin === true;
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

    // Cambio del switch alCorriente
    tbody.on('change', '.user-paid-switch', async function () {
        const userId = $(this).data('id');
        const checked = $(this).prop('checked');
        try {
            await db.collection('usuarios').doc(userId).update({
                alCorriente: checked,
                isSocio: checked
            });
        } catch (error) {
            showAlert('Error al actualizar estado de pago.', 'danger');
            $(this).prop('checked', !checked);
        }
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
    if (filterSoloSocios) filterSoloSocios.addEventListener('change', redrawTable);
    if (filterSoloAdmins) filterSoloAdmins.addEventListener('change', redrawTable);

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
        const updatedData = {
            nombre: $('#edit-user-name').val(),
            apellidos: $('#edit-user-lastname').val(),
        };

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
            if (data.pagadoHasta) {
                const pagadoHasta = data.pagadoHasta.toDate
                    ? new Date(data.pagadoHasta.toDate().getFullYear(), data.pagadoHasta.toDate().getMonth(), data.pagadoHasta.toDate().getDate())
                    : null;
                if (pagadoHasta && pagadoHasta >= hoy) {
                    alCorriente = true;
                }
            }
            const updateData = {};
            if (data.alCorriente !== alCorriente) {
                updateData.alCorriente = alCorriente;
            }
            if (alCorriente && data.isSocio !== true) {
                updateData.isSocio = true;
            } else if (!alCorriente && data.isSocio === true) {
                updateData.isSocio = false;
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
                await userDocRef.update({ [role]: !currentRoleState });
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
