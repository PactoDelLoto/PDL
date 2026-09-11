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
    let prestamosActivosTable, prestamosHistorialTable, prestamosStatsTable;

    // State
    let currentUser = null;
    let userCache = {}; // Cache for user names to reduce DB reads
    let statsChart = null;
    let statsDateFilter = {
        days: 30
    };

    // --- INITIALIZATION ---
    auth.onAuthStateChanged(async user => {
        if (user) {
            currentUser = user;
            const isColaborador = await window.isUserColaborador();
            if (isColaborador) {
                initializePrestamosPage();
            }
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
        if (document.getElementById('stats-section')) renderLoanStats();
    }

    // --- DATA LOADING ---

    async function loadArticulosParaPrestamo() {
        try {
            // If Select2 is already initialized on the element, destroy it
            if ($('#articulo').data('select2')) {
                $('#articulo').select2('destroy');
            }

            // Load articles with open incidencias to filter them out
            const incidenciasSnapshot = await db.collection('incidencias').where('estado', '==', 'abierta').get();
            const articulosConIncidencia = new Set();
            incidenciasSnapshot.forEach(doc => {
                articulosConIncidencia.add(doc.data().idArticulo);
            });

            const snapshot = await db.collection("inventario").orderBy('nombre').get();
            articuloSelect.innerHTML = '<option value="">Seleccione un artículo</option>';

            snapshot.forEach(doc => {
                const item = doc.data();
                const total = item.cantidad;

                if (total > 0) {
                    const disponibles = (item.cantidadRestante === undefined || item.cantidadRestante === null) ? total : item.cantidadRestante;
                    if (disponibles > 0) {
                        // Filter out articles with open incidencias unless forzarPrestamo is true
                        const tieneIncidencia = articulosConIncidencia.has(doc.id);
                        if (tieneIncidencia && item.forzarPrestamo !== true) {
                            return; // Skip this article
                        }

                        let optionText = `${item.nombre} (${disponibles}/${total} disponibles)`;
                        if (tieneIncidencia && item.forzarPrestamo === true) {
                            optionText += ' ⚠️ (Forzado)';
                        }
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
        // Load articles with open incidencias to filter them out from history
        let articulosConIncidencia = new Set();
        try {
            const incidenciasSnapshot = await db.collection('incidencias').where('estado', '==', 'abierta').get();
            incidenciasSnapshot.forEach(doc => {
                articulosConIncidencia.add(doc.data().idArticulo);
            });
        } catch (error) {
            console.error("Error cargando incidencias para filtro: ", error);
        }

        try {
            const snapshot = await db.collection("inventario").orderBy('nombre').get();
            filtroArticulo.innerHTML = '<option value="">Todos</option>';
            snapshot.forEach(doc => {
                const item = doc.data();
                if (!articulosConIncidencia.has(doc.id) || item.forzarPrestamo === true) {
                    filtroArticulo.add(new Option(item.nombre, doc.id));
                }
            });
        } catch (error) {
            console.error("Error cargando artículos para filtro: ", error);
        }

        try {
            const snapshot = await db.collection("eventos").orderBy('titulo').get();
            filtroEvento.innerHTML = '<option value="">Todos</option>';
            snapshot.forEach(doc => {
                filtroEvento.add(new Option(doc.data().titulo, doc.data().titulo));
            });

            // También poblamos el filtro de eventos de las estadísticas
            const statsEventFilter = document.getElementById('stats-event-filter');
            if (statsEventFilter) {
                statsEventFilter.innerHTML = '<option value="">Todos los eventos</option>';
                snapshot.forEach(doc => {
                    statsEventFilter.add(new Option(doc.data().titulo, doc.data().titulo));
                });
            }
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
            const snapshot = await db.collection("eventos").get();
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            eventoSelect.innerHTML = '<option value="">Desconocido/Ninguno</option>';
            snapshot.forEach(doc => {
                const ev = doc.data();
                let fechaEvento = null;
                if (ev.fecha) {
                    fechaEvento = new Date(ev.fecha + 'T00:00:00');
                } else if (ev.fechaFin) {
                    fechaEvento = new Date(ev.fechaFin + 'T00:00:00');
                } else if (ev.fechaInicio) {
                    fechaEvento = new Date(ev.fechaInicio + 'T00:00:00');
                }
                if (fechaEvento && fechaEvento < hoy) return;
                eventoSelect.add(new Option(ev.titulo, ev.titulo));
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
        $('button[data-bs-target="#stats-section"]').on('shown.bs.tab', () => renderLoanStats());
        $(document).on('change', '#stats-time-filter', function () {
            statsDateFilter.days = parseInt($(this).val()); // Solo actualiza 'days' si el filtro de tiempo cambia
            renderLoanStats();
        });
        $(document).on('change', '#stats-event-filter', function () {
            // El filtro de evento se lee directamente en las funciones, solo necesitamos llamarlas
            renderLoanStats();
        });
        $(document).on('change', '#stats-limit-filter', () => renderLoanStats());
        $(document).on('change', '#stats-min-loans-filter', () => renderPrestamosStatsTable());
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
                columns: [null, null, null, null, null, null, { orderable: false, searchable: false }]
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
                        p.Evento || 'N/A',
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
                columns: [null, null, null, null, null, null, null, { orderable: false, searchable: false }]
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
                        p.Evento || 'N/A',
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

    async function getPrestamosData() {
        const eventFilter = document.getElementById('stats-event-filter')?.value || '';
        const now = new Date();
        const filterDate = new Date();
        filterDate.setDate(now.getDate() - statsDateFilter.days);

        const snapshot = await db.collection('prestamos')
            .where('fechaHoraPrestamo', '>=', filterDate)
            .get();

        const counts = {};
        snapshot.forEach(doc => {
            const data = doc.data();

            // Filtro local por evento para evitar necesidad de índices compuestos complejos
            if (eventFilter && data.Evento !== eventFilter) return;

            const nombre = data.nombreArticulo || 'Desconocido';
            if (!counts[nombre]) counts[nombre] = { count: 0, lastDate: null };
            counts[nombre].count++;

            const fecha = data.fechaHoraPrestamo ? data.fechaHoraPrestamo.toDate() : null;
            if (fecha && (!counts[nombre].lastDate || fecha > counts[nombre].lastDate)) {
                counts[nombre].lastDate = fecha;
            }
        });

        return Object.entries(counts)
            .map(([nombre, info]) => ({ nombre, count: info.count, lastDate: info.lastDate }))
            .sort((a, b) => b.count - a.count);
    }

    async function renderLoanStats() {
        const canvas = document.getElementById('loansChart');
        if (!canvas) return;

        try {
            const selectedItems = document.getElementById('stats-limit-filter')?.value || '10';
            const limit = parseInt(selectedItems, 10) || 0;

            const sortedData = await getPrestamosData();
            const chartData = limit > 0 ? sortedData.slice(0, limit) : sortedData;

            const labels = chartData.map(d => {
                return d.nombre.length > 30 ? d.nombre.substring(0, 27) + "..." : d.nombre;
            });
            const values = chartData.map(d => d.count);

            if (statsChart) {
                statsChart.destroy();
                statsChart = null;
            }

            if (chartData.length === 0) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "#6c757d";

                // Mensaje simpático
                ctx.font = "bold 32px sans-serif";
                ctx.fillText("🕵️", canvas.width / 2, canvas.height / 2 - 40);

                ctx.font = "600 16px 'Roboto', sans-serif";
                ctx.fillText("¡Vaya! No hay préstamos que coincidan...", canvas.width / 2, canvas.height / 2 + 10);

                ctx.font = "400 14px 'Roboto', sans-serif";
                ctx.fillText("Prueba a cambiar el periodo o el evento seleccionado.", canvas.width / 2, canvas.height / 2 + 40);
            } else {
                statsChart = new Chart(canvas, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Número de préstamos',
                            data: values,
                            backgroundColor: 'rgba(54, 162, 235, 0.6)',
                            borderColor: 'rgba(54, 162, 235, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        }
                    }
                });
            }

            renderPrestamosStatsTable(sortedData);

        } catch (error) {
            console.error("Error al generar estadísticas: ", error);
        }
    }

    async function renderPrestamosStatsTable(providedData) {
        const tableEl = document.getElementById('tabla-prestamos-stats');
        if (!tableEl) return;

        try {
            const minLoans = parseInt(document.getElementById('stats-min-loans-filter')?.value || '0', 10) || 0;
            const allData = providedData || await getPrestamosData();
            const filteredData = allData.filter(d => d.count >= minLoans);

            if ($.fn.DataTable.isDataTable('#tabla-prestamos-stats')) {
                prestamosStatsTable.destroy();
            }

            prestamosStatsTable = $('#tabla-prestamos-stats').DataTable({
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
                pageLength: 10,
                order: [[1, 'desc']],
                data: filteredData,
                columns: [
                    { data: 'nombre' },
                    {
                        data: 'count',
                        className: 'text-center',
                        render: function (data, type) {
                            if (type === 'display') {
                                return `<span class="badge bg-primary">${data}</span>`;
                            }
                            return data;
                        }
                    },
                    {
                        data: 'lastDate',
                        className: 'text-center',
                        render: function (data, type) {
                            if (!data) return 'N/A';
                            if (type === 'sort' || type === 'type') return data.getTime();
                            return data.toLocaleString();
                        }
                    }
                ]
            });
        } catch (error) {
            console.error("Error al generar la tabla de préstamos por producto: ", error);
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
            }
            return "Usuario no encontrado";
        } catch (error) {
            console.error(`Error obteniendo nombre de usuario para ID ${userId}:`, error);
            return "Desconocido";
        }
    }
});
