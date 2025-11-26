
// Definir un objeto de caché en el ámbito global para almacenar nombres de usuario
window.userCache = {};

/**
 * Obtiene el nombre de un usuario desde Firestore a partir de su ID.
 * Utiliza una caché para minimizar las lecturas a la base de datos.
 *
 * @param {string} userId El ID del usuario a buscar.
 * @returns {Promise<string>} Una promesa que se resuelve con el nombre del usuario o un texto predeterminado si no se encuentra.
 */
async function getUserName(userId) {
    // Si no hay ID, no hay nada que buscar.
    if (!userId) {
        return 'Desconocido';
    }

    // Primero, revisar si el nombre ya está en la caché.
    if (window.userCache[userId]) {
        return window.userCache[userId];
    }

    try {
        // Si no está en caché, buscarlo en Firestore.
        const userDoc = await db.collection('usuarios').doc(userId).get();
        if (userDoc.exists) {
            // Si el usuario existe, obtener su nombre. Usar un valor por defecto si no tiene nombre.
            const userName = userDoc.data().nombre || 'Nombre no registrado';
            // Guardar el nombre en la caché para futuras consultas.
            window.userCache[userId] = userName;
            return userName;
        } else {
            // Si el usuario no se encuentra, guardarlo en caché para no volver a buscarlo.
            window.userCache[userId] = 'Usuario no encontrado';
            return 'Usuario no encontrado';
        }
    } catch (error) {
        console.error(`Error al obtener el nombre para el usuario ${userId}:`, error);
        // En caso de error, no guardar en caché para poder reintentar más tarde.
        return 'Error al buscar';
    }
}

// Exponer la función getUserName globalmente para que otros controladores puedan usarla.
window.getUserName = getUserName;

document.addEventListener('DOMContentLoaded', function () {
    // Esta parte del código es específica para la página 'listaUsuarios.html'.
    // Comprobamos si la tabla de usuarios existe en la página actual antes de ejecutarla.
    const usuariosTable = document.getElementById('usuarios-table');
    if (usuariosTable) {
        auth.onAuthStateChanged(user => {
            if (user) {
                // Solo los administradores pueden ver la lista de usuarios.
                window.isUserAdmin().then(isAdmin => {
                    if (isAdmin) {
                        initializeUsersTable();
                    } else {
                        // Si no es admin, se le niega el acceso a esta funcionalidad.
                        console.warn("Acceso denegado. El usuario no es administrador.");
                        // Opcional: podrías ocultar la tabla o mostrar un mensaje.
                        document.querySelector('main').innerHTML = '<div class="alert alert-danger">Acceso denegado. Solo los administradores pueden ver esta sección.</div>';
                    }
                });
            }
            // Si el usuario no está autenticado, la lógica de redirección la maneja authController.js
        });
    }
});

/**
 * Inicializa la tabla de usuarios con DataTables.
 * Esta función solo se llama si 'usuarios-table' existe en el DOM.
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
            { "data": "correo" },
            {
                "data": "isSocio",
                "render": (data) => data ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-secondary">No</span>'
            },
            {
                "data": "isAdmin",
                "render": (data) => data ? '<span class="badge bg-primary">Sí</span>' : '<span class="badge bg-secondary">No</span>'
            },
            {
                "data": "timestamp",
                "render": (data) => data && data.toDate ? data.toDate().toLocaleDateString('es-ES') : 'No disponible'
            }
        ],
        "order": [[5, 'desc']]
    });

    // Cargar los datos de los usuarios en la tabla.
    loadUsers(table);
}

/**
 * Carga los usuarios desde Firestore y los añade a la tabla de DataTables.
 */
function loadUsers(table) {
    db.collection('usuarios').get()
        .then((querySnapshot) => {
            const userData = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            table.clear().rows.add(userData).draw();
        })
        .catch((error) => {
            console.error("Error al obtener los usuarios: ", error);
        });
}
