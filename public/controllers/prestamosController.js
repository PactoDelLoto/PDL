document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    // Selectores de elementos del DOM
    const articuloSelect = document.getElementById('articulo');
    const personaInput = document.getElementById('persona');
    const eventoSelect = document.getElementById('evento');
    const formPrestamo = document.getElementById('form-prestamo');
    const filtroArticulo = document.getElementById('filtro-articulo');
    const filtroResponsable = document.getElementById('filtro-responsable');
    const filtroEvento = document.getElementById('filtro-evento');

    // Instancias de DataTables
    let prestamosActivosTable, prestamosHistorialTable;

    let currentUser = null;
    let userCache = {};

    // --- INICIALIZACIÓN Y AUTENTICACIÓN ---
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            initializePrestamosPage();
        } else {
            console.log("Usuario no autenticado.");
        }
    });

    function initializePrestamosPage() {
        loadArticulos();
        loadEventos();
        loadResponsablesFilter();
        setupEventListeners();
        // Carga inicial de la primera tabla visible
        loadPrestamosActivos();
    }
    
    // --- CARGA DE DATOS PARA FORMULARIOS Y FILTROS ---

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

    // --- GESTIÓN DE EVENTOS ---

    function setupEventListeners() {
        formPrestamo.addEventListener('submit', handlePrestamoSubmit);

        filtroArticulo.addEventListener('change', loadHistorialPrestamos);
        filtroResponsable.addEventListener('change', loadHistorialPrestamos);
        filtroEvento.addEventListener('change', loadHistorialPrestamos);
        
        // Listeners para inicializar tablas de DataTables al mostrar la pestaña
        $('button[data-bs-target="#activos"]').on('shown.bs.tab', loadPrestamosActivos);
        $('button[data-bs-target="#historial"]').on('shown.bs.tab', loadHistorialPrestamos);

        // Delegación de eventos para los botones de las tablas
        $('#tabla-prestamos-activos').on('click', '.btn-devolver', handleDevolucion);
        $('#tabla-prestamos-historial').on('click', '.btn-cancelar-devolucion', handleCancelarDevolucion);
    }

    // --- MANEJADORES DE ACCIONES ---

    async function handlePrestamoSubmit(e) {
        e.preventDefault();
        if (!articuloSelect.value || !personaInput.value) {
            alert('Por favor, complete todos los campos requeridos.');
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
            alert('Préstamo registrado con éxito.');
        } catch (error) {
            console.error("Error al registrar el préstamo: ", error);
        }
    }

    async function handleDevolucion(e) {
        const id = $(e.currentTarget).data('id');
        if (confirm('¿Confirmar la devolución de este artículo?')) {
            try {
                await db.collection("prestamos").doc(id).update({ Estado: 'Devuelto', fechaHoraDevolucion: new Date() });
                loadPrestamosActivos();
                if (prestamosHistorialTable) loadHistorialPrestamos(); // Recarga si la tabla de historial ya se ha cargado
            } catch (error) {
                console.error('Error al devolver el artículo:', error);
            }
        }
    }

    async function handleCancelarDevolucion(e) {
        const id = $(e.currentTarget).data('id');
        if (confirm('¿Está seguro de que desea cancelar la devolución?')) {
            try {
                await db.collection("prestamos").doc(id).update({ Estado: 'Pendiente', fechaHoraDevolucion: null });
                loadHistorialPrestamos();
                loadPrestamosActivos(); 
            } catch (error) {
                console.error('Error al cancelar la devolución:', error);
            }
        }
    }

    // --- CARGA Y RENDERIZADO DE TABLAS ---

    async function loadPrestamosActivos() {
        if (!$.fn.DataTable.isDataTable('#tabla-prestamos-activos')) {
            prestamosActivosTable = $('#tabla-prestamos-activos').DataTable({ 
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
            });
        }
        try {
            const snapshot = await db.collection("prestamos").where("Estado", "==", "Pendiente").orderBy("fechaHoraPrestamo", "desc").get();
            const data = await Promise.all(snapshot.docs.map(async doc => {
                const prestamo = doc.data();
                return {
                    ...prestamo,
                    id: doc.id,
                    responsable: await getUserName(prestamo.IdUsuarioResponsable),
                    fechaHoraPrestamo: prestamo.fechaHoraPrestamo.toDate()
                };
            }));
            
            prestamosActivosTable.clear();
            prestamosActivosTable.rows.add(data.map(p => ([
                p.nombreArticulo,
                p.PersonaRecibe,
                p.fechaHoraPrestamo.toLocaleString(),
                '<span class="badge bg-warning text-dark">Pendiente</span>',
                p.responsable,
                `<button class="btn btn-success btn-sm btn-devolver" data-id="${p.id}">Devolver</button>`
            ]))).draw();

        } catch (error) {
            console.error("Error cargando préstamos activos: ", error);
        }
    }

    async function loadHistorialPrestamos() {
        if (!$.fn.DataTable.isDataTable('#tabla-prestamos-historial')) {
            prestamosHistorialTable = $('#tabla-prestamos-historial').DataTable({ 
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
            });
        }
        try {
            let query = db.collection("prestamos").where("Estado", "==", "Devuelto");
            if (filtroArticulo.value) query = query.where("IdArticulo", "==", filtroArticulo.value);
            if (filtroResponsable.value) query = query.where("IdUsuarioResponsable", "==", filtroResponsable.value);
            if (filtroEvento.value) query = query.where("Evento", "==", filtroEvento.value);

            const snapshot = await query.orderBy("fechaHoraDevolucion", "desc").get();
            const data = await Promise.all(snapshot.docs.map(async doc => {
                const prestamo = doc.data();
                return {
                    ...prestamo,
                    id: doc.id,
                    responsable: await getUserName(prestamo.IdUsuarioResponsable),
                    fechaHoraPrestamo: prestamo.fechaHoraPrestamo.toDate(),
                    fechaHoraDevolucion: prestamo.fechaHoraDevolucion ? prestamo.fechaHoraDevolucion.toDate() : null
                };
            }));
            
            prestamosHistorialTable.clear();
            prestamosHistorialTable.rows.add(data.map(p => ([
                p.nombreArticulo,
                p.PersonaRecibe,
                p.fechaHoraPrestamo.toLocaleString(),
                p.fechaHoraDevolucion ? p.fechaHoraDevolucion.toLocaleString() : 'N/A',
                '<span class="badge bg-success">Devuelto</span>',
                p.responsable,
                `<button class="btn btn-warning btn-sm btn-cancelar-devolucion" data-id="${p.id}">Cancelar Devolución</button>`
            ]))).draw();

        } catch (error) {
            console.error("Error cargando historial de préstamos: ", error);
        }
    }

    // --- FUNCIONES DE UTILIDAD ---

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
