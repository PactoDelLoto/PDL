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

function initializeUsersTable() {
    usersTable = $('#usuarios-table').DataTable({
        language: {
            url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json"
        },
        responsive: true,
        pageLength: 10,
        lengthMenu: [10, 25, 50, 100],
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
                data: null,
                orderable: false,
                searchable: false,
                className: 'text-center',
                render: function (data, type, row) {
                    if (row.id === firebase.auth().currentUser.uid) return '';
                    if (row.isSocio) {
                        return `<button class="btn btn-sm btn-warning toggle-socio-btn" data-id="${row.id}" data-name="${row.nombre}" title="Quitar rol de Socio">Quitar Socio</button>`;
                    } else {
                        return `<button class="btn btn-sm btn-success toggle-socio-btn" data-id="${row.id}" data-name="${row.nombre}" title="Asignar rol de Socio">Hacer Socio</button>`;
                    }
                }
            },
            {
                data: null,
                orderable: false,
                searchable: false,
                className: 'text-center',
                render: function (data, type, row) {
                    if (row.id === firebase.auth().currentUser.uid) {
                        return '<span class="badge bg-info">Eres tú</span>';
                    }
                    if (row.isAdmin) {
                        return `<button class="btn btn-sm btn-danger toggle-admin-btn" data-id="${row.id}" data-name="${row.nombre}" title="Quitar rol de Admin">Quitar Admin</button>`;
                    } else {
                        return `<button class="btn btn-sm btn-primary toggle-admin-btn" data-id="${row.id}" data-name="${row.nombre}" title="Asignar rol de Admin">Hacer Admin</button>`;
                    }
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

    $('#usuarios-table tbody').on('click', '.toggle-socio-btn', function () {
        const userId = $(this).data('id');
        const userName = $(this).data('name');
        const userDocRef = db.collection('usuarios').doc(userId);

        userDocRef.get().then(doc => {
            if (!doc.exists) return;
            const currentIsSocio = doc.data().isSocio || false;
            const actionText = currentIsSocio ? 'quitar como socio a' : 'hacer socio a';

            showConfirmationModal('Confirmar Rol de Socio', `¿Seguro que quieres ${actionText} ${userName}?`, async () => {
                try {
                    await userDocRef.update({ isSocio: !currentIsSocio });
                    showAlert(`Rol de socio de ${userName} actualizado.`, 'success');
                    loadUsersIntoTable();
                } catch (error) {
                    showAlert('Error al actualizar el rol.', 'danger');
                }
            });
        });
    });

    $('#usuarios-table tbody').on('click', '.toggle-admin-btn', function () {
        const userId = $(this).data('id');
        const userName = $(this).data('name');
        const userDocRef = db.collection('usuarios').doc(userId);

        userDocRef.get().then(doc => {
            if (!doc.exists) return;
            const currentIsAdmin = doc.data().isAdmin || false;
            const actionText = currentIsAdmin ? 'quitar como administrador a' : 'hacer administrador a';

            showConfirmationModal('Confirmar Rol de Admin', `¿Seguro que quieres ${actionText} ${userName}?`, async () => {
                try {
                    await userDocRef.update({ isAdmin: !currentIsAdmin });
                    showAlert(`Rol de administrador de ${userName} actualizado.`, 'success');
                    loadUsersIntoTable();
                } catch (error) {
                    showAlert('Error al actualizar el rol.', 'danger');
                }
            });
        });
    });
}
