document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    // Elements
    const articuloSelect = document.getElementById('articulo');
    const personaInput = document.getElementById('persona');
    const eventoSelect = document.getElementById('evento');
    const formPrestamo = document.getElementById('form-prestamo');
    const filtroArticulo = document.getElementById('filtro-articulo');
    const filtroResponsable = document.getElementById('filtro-responsable');
    const filtroEvento = document.getElementById('filtro-evento');

    // DataTables
    let prestamosActivosTable, prestamosHistorialTable;
    
    // State
    let currentUser = null;
    let userCache = {}; // Cache for user names to reduce DB reads

    // --- INITIALIZATION ---
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            initializePrestamosPage();
        }
    });

    function initializePrestamosPage() {
        // Initialize Select2 on static dropdowns first
        $('#evento, #filtro-articulo, #filtro-responsable, #filtro-evento').select2({
            theme: 'bootstrap-5'
        });

        loadArticulosParaPrestamo();
        loadEventos();
        loadFiltros();
        setupEventListeners();
        loadPrestamosActivos();
    }

    // --- DATA LOADING ---

    async function loadArticulosParaPrestamo() {
        try {
            // If Select2 is already initialized on the element, destroy it
            if ($('#articulo').data('select2')) {
                $('#articulo').select2('destroy');
            }

            const snapshot = await db.collection("inventario").orderBy('nombre').get();
            articuloSelect.innerHTML = '<option value="">Seleccione un artículo</option>';
            
            snapshot.forEach(doc => {
                const item = doc.data();
                const total = item.cantidad;

                if (total > 0) {
                    const disponibles = (item.cantidadRestante === undefined || item.cantidadRestante === null) ? total : item.cantidadRestante;
                    if (disponibles > 0) {
                        const optionText = `${item.nombre} (${disponibles}/${total} disponibles)`;
                        articuloSelect.add(new Option(optionText, doc.id));
                    }
                }
            });

            // Initialize Select2
            $('#articulo').select2({
                theme: 'bootstrap-5'
            });

        } catch (error) {
            console.error("Error cargando artículos para prestar: ", error);
        }
    }

    async function loadFiltros() {
        try {
            const snapshot = await db.collection("inventario").orderBy('nombre').get();
            filtroArticulo.innerHTML = '<option value="">Todos</option>';
            snapshot.forEach(doc => {
                filtroArticulo.add(new Option(doc.data().nombre, doc.id));
            });
        } catch (error) {
            console.error("Error cargando artículos para filtro: ", error);
        }

        try {
            const snapshot = await db.collection("eventos").orderBy('nombre').get();
            filtroEvento.innerHTML = '<option value="">Todos</option>';
            snapshot.forEach(doc => {
                 filtroEvento.add(new Option(doc.data().nombre, doc.data().nombre));
            });
        } catch (error) {
            console.error("Error cargando eventos para filtro: ", error);
        }


        try {
            const snapshot = await db.collection("usuarios").where('isSocio', '==', true).get();
            filtroResponsable.innerHTML = '<option value="">Todos</option>';
            snapshot.forEach(doc => {
                const user = doc.data();
                const fullName = `${user.nombre} ${user.apellidos}`.trim();
                filtroResponsable.add(new Option(fullName, doc.id));
            });
        } catch (error) {
            console.error("Error cargando responsables: ", error);
        }
    }

    async function loadEventos() {
        try {
            const snapshot = await db.collection("eventos").orderBy('nombre').get();
            eventoSelect.innerHTML = '<option value="">Desconocido/Ninguno</option>';
            snapshot.forEach(doc => {
                eventoSelect.add(new Option(doc.data().nombre, doc.data().nombre));
            });
        } catch (error) {
            console.error("Error cargando eventos: ", error);
        }
    }

    // --- EVENT LISTENERS ---

    function setupEventListeners() {
        formPrestamo.addEventListener('submit', handlePrestamoSubmit);
        $('#filtro-articulo, #filtro-responsable, #filtro-evento').on('change', loadHistorialPrestamos);
        $('button[data-bs-target="#activos"]').on('shown.bs.tab', loadPrestamosActivos);
        $('button[data-bs-target="#historial"]').on('shown.bs.tab', loadHistorialPrestamos);
        $('#tabla-prestamos-activos tbody').on('click', '.btn-devolver', handleDevolucion);
        $('#tabla-prestamos-historial tbody').on('click', '.btn-cancelar-devolucion', handleCancelarDevolucion);
    }

    // --- ACTION HANDLERS (with transactions) ---

    async function handlePrestamoSubmit(e) {
        e.preventDefault();
        const articuloId = $('#articulo').val(); // Get value from Select2
        const persona = personaInput.value;

        if (!articuloId || !persona) {
            showAlert('Por favor, complete el artículo y la persona que recibe.', 'warning');
            return;
        }

        const articuloRef = db.collection('inventario').doc(articuloId);

        try {
            await db.runTransaction(async (transaction) => {
                const articuloDoc = await transaction.get(articuloRef);
                if (!articuloDoc.exists) {
                    throw "El artículo seleccionado ya no existe.";
                }

                const item = articuloDoc.data();
                const total = item.cantidad;
                const disponibles = (item.cantidadRestante === undefined || item.cantidadRestante === null) ? total : item.cantidadRestante;

                if (disponibles <= 0) {
                    throw "No quedan unidades disponibles de este artículo para prestar.";
                }

                transaction.update(articuloRef, { cantidadRestante: disponibles - 1 });

                const prestamoRef = db.collection('prestamos').doc();
                transaction.set(prestamoRef, {
                    IdArticulo: articuloId,
                    nombreArticulo: item.nombre,
                    PersonaRecibe: persona,
                    IdUsuarioResponsable: currentUser.uid,
                    fechaHoraPrestamo: firebase.firestore.FieldValue.serverTimestamp(),
                    fechaHoraDevolucion: null,
                    Evento: $('#evento').val() || "N/A",
                    Estado: "Pendiente"
                });
            });

            showAlert('Préstamo registrado con éxito.', 'success');
            formPrestamo.reset();
            $('#articulo, #evento').val('').trigger('change'); // Reset Select2 dropdowns
            await loadArticulosParaPrestamo();
            loadPrestamosActivos();
            document.dispatchEvent(new CustomEvent('inventarioActualizado'));

        } catch (error) {
            console.error("Error en la transacción de préstamo: ", error);
            showAlert(typeof error === 'string' ? error : 'Hubo un error al registrar el préstamo.', 'danger');
        }
    }

    function handleDevolucion(e) {
        const prestamoId = $(e.currentTarget).data('id');
        const prestamoRef = db.collection('prestamos').doc(prestamoId);

        showConfirmationModal('Confirmar Devolución', '¿Marcar este artículo como devuelto?', async () => {
            try {
                await db.runTransaction(async (transaction) => {
                    const prestamoDoc = await transaction.get(prestamoRef);
                    if (!prestamoDoc.exists) throw "El préstamo ya no existe.";
                    
                    const prestamoData = prestamoDoc.data();
                    const articuloRef = db.collection('inventario').doc(prestamoData.IdArticulo);
                    const articuloDoc = await transaction.get(articuloRef);

                    if (articuloDoc.exists) {
                        const item = articuloDoc.data();
                        const disponibles = (item.cantidadRestante === undefined || item.cantidadRestante === null) ? item.cantidad : item.cantidadRestante;
                        if (disponibles < item.cantidad) {
                            transaction.update(articuloRef, { cantidadRestante: disponibles + 1 });
                        }
                    }
                    
                    transaction.update(prestamoRef, { Estado: 'Devuelto', fechaHoraDevolucion: firebase.firestore.FieldValue.serverTimestamp() });
                });

                showAlert('Artículo devuelto con éxito.', 'success');
                loadPrestamosActivos();
                if ($.fn.DataTable.isDataTable('#tabla-prestamos-historial')) loadHistorialPrestamos();
                await loadArticulosParaPrestamo();
                document.dispatchEvent(new CustomEvent('inventarioActualizado'));

            } catch (error) {
                console.error('Error en la transacción de devolución:', error);
                showAlert('Error al procesar la devolución.', 'danger');
            }
        });
    }

    function handleCancelarDevolucion(e) {
        const prestamoId = $(e.currentTarget).data('id');
        const prestamoRef = db.collection('prestamos').doc(prestamoId);

        showConfirmationModal('Cancelar Devolución', '¿Anular la devolución? El préstamo volverá a estar pendiente.', async () => {
             try {
                await db.runTransaction(async (transaction) => {
                    const prestamoDoc = await transaction.get(prestamoRef);
                    if (!prestamoDoc.exists) throw "El préstamo ya no existe.";

                    const prestamoData = prestamoDoc.data();
                    const articuloRef = db.collection('inventario').doc(prestamoData.IdArticulo);
                    const articuloDoc = await transaction.get(articuloRef);

                     if (articuloDoc.exists) {
                        const item = articuloDoc.data();
                        const disponibles = (item.cantidadRestante === undefined || item.cantidadRestante === null) ? item.cantidad : item.cantidadRestante;
                        if (disponibles > 0) {
                            transaction.update(articuloRef, { cantidadRestante: disponibles - 1 });
                        }
                    }

                    transaction.update(prestamoRef, { Estado: 'Pendiente', fechaHoraDevolucion: null });
                });

                showAlert('La devolución ha sido cancelada.', 'info');
                loadHistorialPrestamos();
                loadPrestamosActivos();
                await loadArticulosParaPrestamo();
                document.dispatchEvent(new CustomEvent('inventarioActualizado'));

            } catch (error) {
                console.error('Error al cancelar la devolución:', error);
                showAlert('Error al cancelar la devolución.', 'danger');
            }
        });
    }

    // --- TABLE RENDERING ---

    async function loadPrestamosActivos() {
        if (!prestamosActivosTable) {
            prestamosActivosTable = $('#tabla-prestamos-activos').DataTable({
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
                order: [],
                columns: [ null, null, null, null, null, { orderable: false, searchable: false } ]
            });
        }
        try {
            const snapshot = await db.collection("prestamos").where("Estado", "==", "Pendiente").get();
            const data = await Promise.all(snapshot.docs.map(async doc => {
                const p = doc.data();
                return {
                    fechaOrden: p.fechaHoraPrestamo ? p.fechaHoraPrestamo.toDate() : new Date(0),
                    row: [
                        p.nombreArticulo,
                        p.PersonaRecibe,
                        p.fechaHoraPrestamo ? p.fechaHoraPrestamo.toDate().toLocaleString() : 'N/A',
                        '<span class="badge bg-warning text-dark">Pendiente</span>',
                        await getUserName(p.IdUsuarioResponsable),
                        `<button class="btn btn-success btn-sm btn-devolver" data-id="${doc.id}">Devolver</button>`
                    ]
                };
            }));
            data.sort((a, b) => b.fechaOrden - a.fechaOrden);
            prestamosActivosTable.clear().rows.add(data.map(item => item.row)).draw();
        } catch (error) {
            console.error("Error cargando préstamos activos: ", error);
        }
    }

    async function loadHistorialPrestamos() {
        if (!prestamosHistorialTable) {
            prestamosHistorialTable = $('#tabla-prestamos-historial').DataTable({
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
                order: [],
                columns: [ null, null, null, null, null, null, { orderable: false, searchable: false } ]
            });
        }

        try {
            const filtroArticulo = $('#filtro-articulo').val();
            const filtroResponsable = $('#filtro-responsable').val();
            const filtroEvento = $('#filtro-evento').val();

            const snapshot = await db.collection("prestamos").where("Estado", "==", "Devuelto").get();
            const prestamosFiltrados = snapshot.docs.filter(doc => {
                const p = doc.data();
                return (!filtroArticulo || p.IdArticulo === filtroArticulo)
                    && (!filtroResponsable || p.IdUsuarioResponsable === filtroResponsable)
                    && (!filtroEvento || p.Evento === filtroEvento);
            });

            const data = await Promise.all(prestamosFiltrados.map(async doc => {
                const p = doc.data();
                return {
                    fechaOrden: p.fechaHoraDevolucion ? p.fechaHoraDevolucion.toDate() : new Date(0),
                    row: [
                        p.nombreArticulo,
                        p.PersonaRecibe,
                        p.fechaHoraPrestamo ? p.fechaHoraPrestamo.toDate().toLocaleString() : 'N/A',
                        p.fechaHoraDevolucion ? p.fechaHoraDevolucion.toDate().toLocaleString() : 'N/A',
                        '<span class="badge bg-success">Devuelto</span>',
                        await getUserName(p.IdUsuarioResponsable),
                        `<button class="btn btn-warning btn-sm btn-cancelar-devolucion" data-id="${doc.id}">Anular</button>`
                    ]
                };
            }));
            data.sort((a, b) => b.fechaOrden - a.fechaOrden);
            prestamosHistorialTable.clear().rows.add(data.map(item => item.row)).draw();
        } catch (error) {
            console.error("Error cargando historial de préstamos: ", error);
        }
    }

    // --- UTILITY FUNCTIONS ---

    async function getUserName(userId) {
        if (!userId) return "Desconocido";
        if (userCache[userId]) return userCache[userId];
        try {
            const userDoc = await db.collection("usuarios").doc(userId).get();
            if (userDoc.exists) {
                const fullName = `${userDoc.data().nombre} ${userDoc.data().apellidos}`.trim();
                userCache[userId] = fullName;
                return fullName;
            }
            return "Usuario no encontrado";
        } catch (error) {
            console.error(`Error obteniendo nombre de usuario para ID ${userId}:`, error);
            return "Desconocido";
        }
    }
});
