
document.addEventListener('DOMContentLoaded', function () {
    // 1. VERIFICAR EL ESTADO DE AUTENTICACIÓN Y ROL DE ADMINISTRADOR
    auth.onAuthStateChanged(user => {
        if (user) {
            window.isUserAdmin().then(isAdmin => {
                if (isAdmin) {
                    initializeUsersTable();
                } else {
                    console.warn("Acceso denegado. El usuario no es administrador.");
                    window.location.href = '/index.html';
                }
            });
        } else {
            console.log("Usuario no autenticado. Redirigiendo a login.");
            window.location.href = '/login.html';
        }
    });
});

/**
 * Inicializa la tabla de DataTables y carga los usuarios de Firestore.
 */
function initializeUsersTable() {
    const table = $('#usuarios-table').DataTable({
        "language": {
            "url": "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json"
        },
        "responsive": true,
        "pageLength": 10,
        "lengthMenu": [10, 25, 50, 100],
        "columns": [
            { "data": "nombre" },
            { "data": "apellidos" },
            { "data": "correo" }, // Añadida columna de correo
            {
                "data": "isSocio", // Campo corregido
                "render": (data) => data ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-secondary">No</span>'
            },
            {
                "data": "isAdmin", // Añadida columna de admin
                "render": (data) => data ? '<span class="badge bg-primary">Sí</span>' : '<span class="badge bg-secondary">No</span>'
            },
            {
                "data": "timestamp", // Usando el campo timestamp
                "render": (data) => data && data.toDate ? data.toDate().toLocaleDateString('es-ES') : 'No disponible'
            }
        ],
        "order": [[5, 'desc']] // Ordenar por fecha de registro (ahora índice 5)
    });

    // Cargar los datos
    loadUsers(table);
}

/**
 * Carga los usuarios desde Firestore y los añade a la tabla.
 */
function loadUsers(table) {
    const usuariosRef = db.collection('usuarios');

    usuariosRef.get()
        .then((querySnapshot) => {
            const userData = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return { ...data, id: doc.id };
            });
            table.clear().rows.add(userData).draw();
        })
        .catch((error) => {
            console.error("Error al obtener los usuarios: ", error);
        });
}
