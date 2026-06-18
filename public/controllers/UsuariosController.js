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

function initializeUsersTable() {
    usersTable = $('#usuarios-table').DataTable({
        language: {
            url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json"
        },
        responsive: true,
        pageLength: 10,
        destroy: true, // Permite reinicializar la tabla si ya existe
        columns: [
            { data: "nombre" },
            { data: "apellidos" },
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
                data: "timestamp",
                render: (data) => data && data.toDate ? data.toDate().toLocaleDateString('es-ES') : 'No disponible'
            },
            {
                data: null, orderable: false, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    if (row.id === firebase.auth().currentUser.uid) return '';
                    return row.isSocio ?
                        `<button class="btn btn-sm btn-warning toggle-socio-btn" data-id="${row.id}" data-name="${row.nombre}">Quitar Socio</button>` :
                        `<button class="btn btn-sm btn-success toggle-socio-btn" data-id="${row.id}" data-name="${row.nombre}">Hacer Socio</button>`;
                }
            },
            {
                data: null, orderable: false, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    if (row.id === firebase.auth().currentUser.uid) return '<span class="badge bg-info">Eres tú</span>';
                    return row.isAdmin ?
                        `<button class="btn btn-sm btn-danger toggle-admin-btn" data-id="${row.id}" data-name="${row.nombre}">Quitar Admin</button>` :
                        `<button class="btn btn-sm btn-primary toggle-admin-btn" data-id="${row.id}" data-name="${row.nombre}">Hacer Admin</button>`;
                }
            },
            {
                data: null, orderable: false, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    if (row.id === firebase.auth().currentUser.uid) return '';
                    return `<button class="btn btn-sm btn-info edit-user-btn" data-id="${row.id}"><i class="fas fa-edit"></i></button>`;
                }
            },
            {
                data: null, orderable: false, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    if (row.id === firebase.auth().currentUser.uid) return '';
                    return `<button class="btn btn-sm btn-danger delete-user-btn" data-id="${row.id}" data-name="${row.nombre}"><i class="fas fa-trash"></i></button>`;
                }
            }
        ],
        order: [[0, 'asc']]
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

    // Limpiar manejadores previos para evitar duplicados
    tbody.off('click');

    // --- Manejadores para Roles ---
    tbody.on('click', '.toggle-socio-btn', function () { handleRoleToggle(this, 'isSocio'); });
    tbody.on('click', '.toggle-admin-btn', function () { handleRoleToggle(this, 'isAdmin'); });

    // --- Manejador para Editar ---
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

    // --- Manejador para Eliminar ---
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

    // --- Manejador del formulario de edición ---
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
