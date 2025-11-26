// Espera a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function () {

    // Inicializa la tabla de datos, pero sin datos todavía
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
            { "data": "email" },
            { 
                "data": "socio",
                "render": function(data, type, row) {
                    return data ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-secondary">No</span>';
                }
            },
            { 
                "data": "timestamp",
                "render": function(data, type, row) {
                    if (data && data.toDate) {
                        return data.toDate().toLocaleDateString('es-ES');
                    }
                    return 'No disponible';
                }
            }
        ]
    });

    // Escucha los cambios en el estado de autenticación
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            // Si el usuario está logueado, carga los datos de Firestore
            loadUsers(table);
        } else {
            // Si no, puedes redirigirlo o mostrar un mensaje.
            console.log("Usuario no autenticado. No se cargarán los datos.");
            // Opcional: Redirigir a la página de login
            // window.location.href = '/login.html';
        }
    });
});

/**
 * Carga los usuarios desde Firestore y los añade a la tabla.
 * @param {DataTables.Api} table La instancia de la DataTable.
 */
function loadUsers(table) {
    const usuariosRef = db.collection('usuarios');

    usuariosRef.get()
        .then((querySnapshot) => {
            let userData = [];
            querySnapshot.forEach((doc) => {
                userData.push(doc.data());
            });

            // Limpia la tabla y añade los nuevos datos
            table.clear().rows.add(userData).draw();
        })
        .catch((error) => {
            console.error("Error al obtener los usuarios: ", error);
        });
}
