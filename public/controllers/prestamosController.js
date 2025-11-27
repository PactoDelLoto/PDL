document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    const articuloSelect = document.getElementById('articulo');
    const personaInput = document.getElementById('persona');
    const eventoSelect = document.getElementById('evento');
    const formPrestamo = document.getElementById('form-prestamo');
    const filtroArticulo = document.getElementById('filtro-articulo');
    const filtroResponsable = document.getElementById('filtro-responsable');
    const filtroEvento = document.getElementById('filtro-evento');

    let prestamosActivosTable, prestamosHistorialTable;
    let currentUser = null;
    let userCache = {};

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            initializePrestamosPage();
        }
    });

    function initializePrestamosPage() {
        loadArticulos();
        loadEventos();
        loadResponsablesFilter();
        setupEventListeners();
        loadPrestamosActivos();
    }

    async function loadArticulos() {
        try {
            const snapshot = await db.collection("inventario").orderBy('nombre').get();
            articuloSelect.innerHTML = '<option value="">Seleccione un artículo</option>';
            filtroArticulo.innerHTML = '<option value="">Todos</option>';
            snapshot.forEach(doc => {
                const item = doc.data();
                articuloSelect.add(new Option(item.nombre, doc.id));
                filtroArticulo.add(new Option(item.nombre, doc.id));
            });
        } catch (error) {
            console.error("Error cargando artículos: ", error);
        }
    }

    async function loadEventos() {
        try {
            const snapshot = await db.collection("eventos").orderBy('nombre').get();
            eventoSelect.innerHTML = '<option value="">Desconocido/Ninguno</option>';
            snapshot.forEach(doc => {
                const evento = doc.data();
                eventoSelect.add(new Option(evento.nombre, evento.nombre));
            });
        } catch (error) {
            console.error("Error cargando eventos: ", error);
        }
    }

    async function loadResponsablesFilter() {
        try {
            const snapshot = await db.collection("usuarios").where('isSocio', '==', true).get();
            filtroResponsable.innerHTML = '<option value="">Todos</option>';
            snapshot.forEach(doc => {
                const user = doc.data();
                filtroResponsable.add(new Option(`${user.nombre} ${user.apellidos}`.trim(), doc.id));
            });
        } catch (error) {
            console.error("Error cargando responsables: ", error);
        }
    }

    function setupEventListeners() {
        formPrestamo.addEventListener('submit', handlePrestamoSubmit);
        $('#filtro-articulo, #filtro-responsable, #filtro-evento').on('change', loadHistorialPrestamos);
        $('button[data-bs-target="#activos"]').on('shown.bs.tab', loadPrestamosActivos);
        $('button[data-bs-target="#historial"]').on('shown.bs.tab', loadHistorialPrestamos);
        $('#tabla-prestamos-activos').on('click', '.btn-devolver', handleDevolucion);
        $('#tabla-prestamos-historial').on('click', '.btn-cancelar-devolucion', handleCancelarDevolucion);
    }

    async function handlePrestamoSubmit(e) {
        e.preventDefault();
        if (!articuloSelect.value || !personaInput.value) {
            showAlert('Por favor, complete el artículo y la persona que recibe.', 'warning');
            return;
        }
        try {
            await db.collection("prestamos").add({
                IdArticulo: articuloSelect.value,
                nombreArticulo: articuloSelect.options[articuloSelect.selectedIndex].text,
                PersonaRecibe: personaInput.value,
                IdUsuarioResponsable: currentUser.uid,
                fechaHoraPrestamo: new Date(),
                fechaHoraDevolucion: null,
                Evento: eventoSelect.value || "N/A",
                Estado: "Pendiente"
            });
            formPrestamo.reset();
            loadPrestamosActivos();
            showAlert('Préstamo registrado con éxito.', 'success');
        } catch (error) {
            console.error("Error al registrar el préstamo: ", error);
            showAlert('Hubo un error al registrar el préstamo.', 'danger');
        }
    }

    function handleDevolucion(e) {
        const id = $(e.currentTarget).data('id');
        showConfirmationModal(
            'Confirmar Devolución',
            '¿Estás seguro de que quieres marcar este artículo como devuelto?',
            async () => {
                try {
                    await db.collection("prestamos").doc(id).update({ Estado: 'Devuelto', fechaHoraDevolucion: new Date() });
                    showAlert('Artículo devuelto con éxito.', 'success');
                    loadPrestamosActivos();
                    if (prestamosHistorialTable) loadHistorialPrestamos();
                } catch (error) {
                    console.error('Error al devolver el artículo:', error);
                    showAlert('Error al procesar la devolución.', 'danger');
                }
            }
        );
    }

    function handleCancelarDevolucion(e) {
        const id = $(e.currentTarget).data('id');
        showConfirmationModal(
            'Cancelar Devolución',
            '¿Estás seguro de que quieres anular la devolución de este artículo? El préstamo volverá a estar pendiente.',
            async () => {
                try {
                    await db.collection("prestamos").doc(id).update({ Estado: 'Pendiente', fechaHoraDevolucion: null });
                    showAlert('La devolución ha sido cancelada.', 'info');
                    loadHistorialPrestamos();
                    loadPrestamosActivos();
                } catch (error) {
                    console.error('Error al cancelar la devolución:', error);
                    showAlert('Error al cancelar la devolución.', 'danger');
                }
            }
        );
    }

    async function loadPrestamosActivos() {
        if (!prestamosActivosTable) {
            prestamosActivosTable = $('#tabla-prestamos-activos').DataTable({ 
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
                columns: [ null, null, null, null, null, { orderable: false, searchable: false } ]
            });
        }
        try {
            const snapshot = await db.collection("prestamos").where("Estado", "==", "Pendiente").orderBy("fechaHoraPrestamo", "desc").get();
            const data = await Promise.all(snapshot.docs.map(async doc => {
                const p = doc.data();
                const responsable = await getUserName(p.IdUsuarioResponsable);
                return [
                    p.nombreArticulo,
                    p.PersonaRecibe,
                    p.fechaHoraPrestamo.toDate().toLocaleString(),
                    '<span class="badge bg-warning text-dark">Pendiente</span>',
                    responsable,
                    `<button class="btn btn-success btn-sm btn-devolver" data-id="${doc.id}">Devolver</button>`
                ];
            }));
            prestamosActivosTable.clear().rows.add(data).draw();
        } catch (error) {
            console.error("Error cargando préstamos activos: ", error);
        }
    }

    async function loadHistorialPrestamos() {
        if (!prestamosHistorialTable) {
            prestamosHistorialTable = $('#tabla-prestamos-historial').DataTable({ 
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
                order: [[ 3, "desc" ]], // Ordenar por fecha de devolución por defecto
                columns: [ null, null, null, null, null, null, { orderable: false, searchable: false } ]
            });
        }
        try {
            let query = db.collection("prestamos").where("Estado", "==", "Devuelto");
            if (filtroArticulo.value) query = query.where("IdArticulo", "==", filtroArticulo.value);
            if (filtroResponsable.value) query = query.where("IdUsuarioResponsable", "==", filtroResponsable.value);
            if (filtroEvento.value) query = query.where("Evento", "==", filtroEvento.value);

            const snapshot = await query.orderBy("fechaHoraDevolucion", "desc").get();
            const data = await Promise.all(snapshot.docs.map(async doc => {
                const p = doc.data();
                const responsable = await getUserName(p.IdUsuarioResponsable);
                return [
                    p.nombreArticulo,
                    p.PersonaRecibe,
                    p.fechaHoraPrestamo.toDate().toLocaleString(),
                    p.fechaHoraDevolucion ? p.fechaHoraDevolucion.toDate().toLocaleString() : 'N/A',
                    '<span class="badge bg-success">Devuelto</span>',
                    responsable,
                    `<button class="btn btn-warning btn-sm btn-cancelar-devolucion" data-id="${doc.id}">Cancelar</button>`
                ];
            }));
            prestamosHistorialTable.clear().rows.add(data).draw();
        } catch (error) {
            console.error("Error cargando historial de préstamos: ", error);
        }
    }

    async function getUserName(userId) {
        if (!userId) return "Desconocido";
        if (userCache[userId]) return userCache[userId];
        try {
            const userDoc = await db.collection("usuarios").doc(userId).get();
            if (userDoc.exists) {
                const fullName = `${userDoc.data().nombre} ${userDoc.data().apellidos}`.trim();
                userCache[userId] = fullName;
                return fullName;
            } else {
                return "Desconocido";
            }
        } catch (error) {
            console.error(`Error obteniendo nombre de usuario para ID ${userId}:`, error);
            return "Desconocido";
        }
    }
});
