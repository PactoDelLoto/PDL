// Controlador de Torneos y Ligas - Pacto del Loto
window.initializeTorneosController = function (canManage) {
    const db = firebase.firestore();
    const auth = firebase.auth();

    // Referencias a Modales Bootstrap
    const modalTorneo = new bootstrap.Modal(document.getElementById('modal-torneo'));
    const modalLiga = new bootstrap.Modal(document.getElementById('modal-liga'));
    const modalJugadores = new bootstrap.Modal(document.getElementById('modal-jugadores'));
    const mergePointsModal = new bootstrap.Modal(document.getElementById('merge-points-modal'));
    const modalResultados = new bootstrap.Modal(document.getElementById('modal-resultados'));

    // Estado local
    let usuariosCache = [];
    let eventosCache = [];
    let subeventosCache = [];
    let ligasCache = [];
    let torneosCache = [];
    let selectedTournament = null;
    let tempJugadores = []; // Jugadores en edición en el modal

    // Elementos DOM (Asegúrate de que coincidan con estos nombres)
    const listaTorneos = document.getElementById('lista-torneos-container');
    const selectLigaActiva = document.getElementById('select-liga-activa');
    const filterTorneoLiga = document.getElementById('filter-torneo-liga');
    const filterShowFinalized = document.getElementById('filter-show-finalized');
    const btnEliminarLiga = document.getElementById('btn-eliminar-liga');
    const selectTorneoLiga = document.getElementById('torneo-liga');
    const selectTorneoEvento = document.getElementById('torneo-evento');
    const selectTorneoSubevento = document.getElementById('torneo-subevento');
    const checkEsLiga = document.getElementById('torneo-esLiga');

    // Contenedores de bloques dinámicos
    const ligaBloque = document.getElementById('torneo-liga-bloque');
    const independienteBloque = document.getElementById('torneo-independiente-bloque');
    const selectLigaEvento = document.getElementById('liga-evento'); // El nuevo del modal ligas

    const selectMergeLeagueCode = document.getElementById('select-merge-league-code');
    const selectMergeUser = document.getElementById('select-merge-user');

    // Inicialización del controlador
    async function init() {
        showLoadingSpinner();
        await loadInitialData();
        setupEventListeners();
    }

    // --- CARGA DE DATOS ---

    async function loadInitialData() {
        try {
            // Cargar usuarios (solo administradores)
            if (canManage) {
                const usersSnapshot = await db.collection('usuarios').get();
                usuariosCache = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            // Cargar eventos
            const eventsSnapshot = await db.collection('eventos').get();
            eventosCache = eventsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Cargar subeventos
            const subeventsSnapshot = await db.collection('subeventos').get();
            subeventosCache = subeventsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Cargar ligas
            const ligasSnapshot = await db.collection('ligas').get();
            ligasCache = ligasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Cargar torneos
            const torneosSnapshot = await db.collection('torneos').get();
            torneosCache = torneosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Renderizar vistas
            renderTournamentsList();
            populateLigasDropdowns();
            populateEventosDropdown();
            populateMergeUserDropdown();
            populateAgregarUsuarioSelect();

        } catch (error) {
            console.error("Error al cargar datos iniciales del controlador de torneos:", error);
            if (window.showAlert) window.showAlert("Error al conectar con la base de datos.", "danger");
        }
    }

    // Muestra spinner de carga en contenedores
    function showLoadingSpinner() {
        const spinner = `<div class="text-center w-100 py-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Cargando...</span></div></div>`;
        if (listaTorneos) listaTorneos.innerHTML = spinner;
    }

    // --- RENDERIZADO DE INTERFAZ ---

    // Lista general de torneos
    function renderTournamentsList(filterLigaId = null) {
        if (!listaTorneos) return;

        const currentFilter = filterLigaId !== null ? filterLigaId : (filterTorneoLiga ? filterTorneoLiga.value : '');

        if (torneosCache.length === 0) {
            listaTorneos.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fa-solid fa-folder-open fa-3x mb-3"></i><p>No hay torneos registrados de momento.</p></div>`;
            return;
        }

        let filteredTorneos = [...torneosCache];
        if (currentFilter) {
            filteredTorneos = filteredTorneos.filter(t => t.ligaId === currentFilter);
        }
        const showFinalized = filterShowFinalized ? filterShowFinalized.checked : false;
        if (!showFinalized) {
            filteredTorneos = filteredTorneos.filter(t => t.estado !== 'finalizado');
        }

        // Ordenar torneos por fecha descendente
        const sortedTorneos = filteredTorneos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        listaTorneos.innerHTML = sortedTorneos.map(torneo => {
            let badgeClass = 'badge-draft';
            let estadoTexto = 'Borrador';
            if (torneo.estado === 'en_curso') {
                badgeClass = 'badge-progress';
                estadoTexto = 'En Curso';
            } else if (torneo.estado === 'finalizado') {
                badgeClass = 'badge-finished';
                estadoTexto = 'Finalizado';
            }

            const fechaFormat = new Date(torneo.fecha).toLocaleString('es-ES', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            const eventoAsociado = eventosCache.find(e => e.id === torneo.eventoId);
            const subeventoAsociado = subeventosCache.find(s => s.id === torneo.subeventoId);
            let asociacionText = 'Independiente';
            if (eventoAsociado) {
                asociacionText = eventoAsociado.titulo;
                if (subeventoAsociado) {
                    asociacionText += ` (${subeventoAsociado.titulo})`;
                }
            }

            const jugadoresCount = torneo.jugadores ? torneo.jugadores.length : 0;
            const capacityText = (subeventoAsociado && subeventoAsociado.plazas > 0) ? ` / ${subeventoAsociado.plazas}` : '';
            const ligaMatchBadge = torneo.esJornadaLiga ? `<span class="badge bg-purple ms-2" style="background-color:#6c5ce7;">Liga</span>` : '';

            // Botones según rol y estado
            let buttons = '';
            if (canManage) {
                if (torneo.estado === 'borrador') {
                    buttons += `
                        <button class="btn btn-sm btn-outline-primary btn-add-players-torneo" data-id="${torneo.id}"><i class="fa-solid fa-users-gear"></i> Jugadores</button>
                        <button class="btn btn-sm btn-success btn-iniciar-torneo" data-id="${torneo.id}"><i class="fa-solid fa-play"></i> Iniciar</button>
                        <button class="btn btn-sm btn-outline-secondary btn-editar-torneo" data-id="${torneo.id}"><i class="fa-solid fa-edit"></i></button>
                    `;
                } else if (torneo.estado === 'en_curso') {
                    buttons += `<button class="btn btn-sm btn-primary btn-gestionar-torneo" data-id="${torneo.id}"><i class="fa-solid fa-gears"></i> Gestionar</button>`;
                } else {
                    buttons += `<button class="btn btn-sm btn-outline-info btn-ver-detalles-torneo" data-id="${torneo.id}"><i class="fa-solid fa-eye"></i> Resultados</button>`;
                }
                buttons += `<button class="btn btn-sm btn-outline-danger btn-eliminar-torneo" data-id="${torneo.id}"><i class="fa-solid fa-trash"></i></button>`;
            } else {
                if (torneo.estado === 'en_curso') {
                    buttons += `<button class="btn btn-sm btn-primary btn-ver-detalles-torneo" data-id="${torneo.id}"><i class="fa-solid fa-eye"></i> Ver Rondas</button>`;
                } else if (torneo.estado === 'finalizado') {
                    buttons += `<button class="btn btn-sm btn-outline-info btn-ver-detalles-torneo" data-id="${torneo.id}"><i class="fa-solid fa-eye"></i> Clasificación</button>`;
                } else {
                    buttons += `<span class="text-muted small">No disponible</span>`;
                }
            }

            return `
                <div class="col-md-6 col-lg-4">
                    <div class="card card-custom h-100 p-3">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <span class="badge ${badgeClass}">${estadoTexto}</span>
                            <span class="small text-muted">${fechaFormat}</span>
                        </div>
                        <h5 class="fw-bold text-dark mb-1">${torneo.nombre} ${ligaMatchBadge}</h5>
                        <p class="small text-muted mb-3"><i class="fa-solid fa-calendar-day me-2"></i>${asociacionText}</p>
                        <div class="d-flex justify-content-between align-items-center mt-auto border-top pt-2">
                            <span class="small text-muted"><i class="fa-solid fa-user-group me-1"></i> ${jugadoresCount}${capacityText} jugadores</span>
                            <div class="d-flex gap-1">
                                ${buttons}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function initSelect2(selector, options = {}) {
        if (!window.jQuery || !$.fn.select2 || !selector) return;
        const $selector = $(selector);
        if ($selector.data('select2')) {
            $selector.select2('destroy');
        }
        $selector.select2({
            theme: 'bootstrap-5',
            width: '100%',
            ...options
        });
    }

    function updateEliminarLigaButton() {
        if (!btnEliminarLiga || !selectLigaActiva) return;
        btnEliminarLiga.disabled = !selectLigaActiva.value;
    }

    function renderLigaClasificacionPlaceholder(message) {
        const tbody = document.getElementById('tabla-clasificacion-liga');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">${message}</td></tr>`;
    }

    function handleLigaActivaChange() {
        const ligaId = selectLigaActiva ? selectLigaActiva.value : '';

        if (ligaId) {
            loadLigaClasificacion(ligaId);
        } else {
            renderLigaClasificacionPlaceholder('Selecciona una liga para ver su clasificacion');
        }

        updateEliminarLigaButton();
    }

    function bindLigaActivaSelect2Change() {
        if (!window.jQuery || !selectLigaActiva) return;
        $(selectLigaActiva)
            .off('change.ligaActiva')
            .on('change.ligaActiva', handleLigaActivaChange);
    }

    // Poblar dropdowns de ligas
    function populateLigasDropdowns() {
        const ligasOrdenadas = [...ligasCache]
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
        const optionsHtml = ligasOrdenadas
            .map(liga => `<option value="${liga.id}">${liga.nombre}</option>`)
            .join('');

        if (selectLigaActiva) {
            const previousValue = selectLigaActiva.value;
            selectLigaActiva.innerHTML = `<option value="">-- Selecciona una Liga --</option>` + optionsHtml;
            selectLigaActiva.value = ligasOrdenadas.some(liga => liga.id === previousValue) ? previousValue : '';
            initSelect2(selectLigaActiva, {
                placeholder: '-- Escribe para buscar una liga --',
                allowClear: true
            });
            bindLigaActivaSelect2Change();

            if (selectLigaActiva.value) {
                loadLigaClasificacion(selectLigaActiva.value);
            } else {
                renderLigaClasificacionPlaceholder(ligasOrdenadas.length
                    ? 'Selecciona una liga para ver su clasificacion'
                    : 'No hay ligas registradas.');
            }
            updateEliminarLigaButton();
        }

        if (selectTorneoLiga) {
            const previousValue = selectTorneoLiga.value;
            const allOptionsHtml = ligasOrdenadas
                .map(liga => `<option value="${liga.id}">${liga.nombre}</option>`)
                .join('');
            selectTorneoLiga.innerHTML = `<option value="">-- Selecciona una Liga --</option>` + allOptionsHtml;
            selectTorneoLiga.value = ligasCache.some(liga => liga.id === previousValue) ? previousValue : '';
            initSelect2(selectTorneoLiga, {
                dropdownParent: $('#modal-torneo'),
                placeholder: '-- Escribe para buscar una liga --'
            });
        }

        if (filterTorneoLiga) {
            const previousValue = filterTorneoLiga.value;
            filterTorneoLiga.innerHTML = `<option value="">-- Todas las Ligas --</option>` + optionsHtml;
            filterTorneoLiga.value = ligasCache.some(liga => liga.id === previousValue) ? previousValue : '';
            initSelect2(filterTorneoLiga, {
                placeholder: '-- Filtrar torneos por liga --',
                allowClear: true
            });
            $(filterTorneoLiga).off('change.filterTorneo').on('change.filterTorneo', function () {
                renderTournamentsList(this.value);
            });
        }
    }

    // Poblar eventos en ambos formularios filtrando por fecha e inicializando el buscador
    function populateEventosDropdown() {
        if (!selectTorneoEvento) return;

        const ahora = new Date();
        const limiteHoras = 72 * 60 * 60 * 1000; // 72 horas en milisegundos

        // 1. Filtrar los eventos válidos
        const eventosFiltrados = eventosCache.filter(evento => {
            // Si el evento tiene fecha de fin (evento continuo), usamos esa; si no, la fecha de inicio
            const fechaReferenciaStr = evento.fechaFin || evento.fecha || evento.fechaInicio;
            if (!fechaReferenciaStr) return true; // Si no hay fecha por algún motivo, lo dejamos por seguridad

            const fechaReferencia = new Date(fechaReferenciaStr);

            // Calculamos la diferencia: (Fecha Actual - Fecha del Evento)
            const diferenciaTiempo = ahora.getTime() - fechaReferencia.getTime();

            // Si la diferencia es mayor a 72 horas (el evento terminó hace más de 3 días), se descarta (retorna false)
            return diferenciaTiempo <= limiteHoras;
        });

        // 2. Generar el HTML con los eventos que han pasado el filtro
        const optionsHtml = eventosFiltrados.map(e => `<option value="${e.id}">${e.titulo}</option>`).join('');

        // 3. Inyectar las opciones en los selectores correspondientes
        selectTorneoEvento.innerHTML = `<option value="">Ninguno</option>` + optionsHtml;

        if (selectLigaEvento) {
            selectLigaEvento.innerHTML = `<option value="" disabled selected>-- Escribe para buscar el evento --</option>` + optionsHtml;

            // 4. Inicializar Select2 con el buscador en el select de la Liga
            // Usamos jQuery (vía $) ya que Select2 depende de él y está integrado en tu HTML
            initSelect2(selectLigaEvento, {
                dropdownParent: $('#modal-liga'), // Importante: previene bugs visuales al estar dentro de un modal
                placeholder: '-- Escribe para buscar el evento --',
                allowClear: false
            });
        }
    }

    // Carga de subeventos dinámicos en el modal de torneo
    async function handleEventoChange(eventId) {
        if (!selectTorneoSubevento) return;

        if (!eventId) {
            selectTorneoSubevento.innerHTML = '<option value="">Ninguno (Selecciona un evento primero)</option>';
            selectTorneoSubevento.disabled = true;
            return;
        }

        const filtered = subeventosCache.filter(s => s.eventoId === eventId);
        if (filtered.length === 0) {
            selectTorneoSubevento.innerHTML = '<option value="">Sin subeventos en este evento</option>';
            selectTorneoSubevento.disabled = true;
        } else {
            selectTorneoSubevento.innerHTML = '<option value="">Ninguno</option>' +
                filtered.map(s => `<option value="${s.id}">${s.titulo}</option>`).join('');
            selectTorneoSubevento.disabled = false;
        }
    }

    // Renders general de clasificacion de liga
    async function loadLigaClasificacion(ligaId) {
        const tbody = document.getElementById('tabla-clasificacion-liga');
        if (!tbody) return;

        if (!ligaId) {
            renderLigaClasificacionPlaceholder('Selecciona una liga para ver su clasificacion');
            return;
        }

        const liga = ligasCache.find(l => l.id === ligaId);
        if (!liga || !liga.clasificacion || Object.keys(liga.clasificacion).length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">No hay jugadores registrados en esta liga todavía.</td></tr>`;
            return;
        }

        // Ordenar clasificación
        const clasifArray = Object.entries(liga.clasificacion).map(([key, data]) => ({
            id: key,
            nombre: data.nombre,
            puntos: data.puntos,
            mergedFromGuest: data.mergedFromGuest || false
        })).sort((a, b) => b.puntos - a.puntos);

        tbody.innerHTML = clasifArray.map((row, index) => `
            <tr>
                <td class="fw-bold">${index + 1}</td>
                <td>
                    ${row.nombre}
                    ${row.mergedFromGuest ? ` <i class="fas fa-user-check text-success ms-1" title="Puntos fusionados de invitado"></i>` : ''}
                </td>
                <td class="text-center">
                    ${row.id.startsWith('invitado_') ? `<span class="badge bg-${row.mergedFromGuest ? 'primary' : 'secondary'}">${row.id.split('_')[1]}</span>` : `<span class="badge bg-primary">Socio</span>`}
                </td>
                <td class="text-center fw-bold">${row.puntos}</td>
            </tr>
        `).join('');
    }

    // --- VISTA DE GESTIÓN DE UN TORNEO ---

    function openTournamentManagement(torneoId) {
        selectedTournament = torneosCache.find(t => t.id === torneoId);
        if (!selectedTournament) return;

        // Ocultar lista y mostrar contenedor de gestión
        document.getElementById('lista-torneos-container').style.display = 'none';
        document.getElementById('btn-nuevo-torneo').style.display = 'none';
        const gestionContainer = document.getElementById('gestion-torneo-container');
        gestionContainer.style.display = 'block';

        // Llenar cabecera
        document.getElementById('gt-nombre').textContent = selectedTournament.nombre;
        const fechaFormat = new Date(selectedTournament.fecha).toLocaleString('es-ES');
        document.getElementById('gt-detalles').textContent = `${fechaFormat} | Formato: Commander`;

        const badge = document.getElementById('gt-estado');
        badge.textContent = selectedTournament.estado === 'en_curso' ? 'En Curso' : 'Finalizado';
        badge.className = `badge ${selectedTournament.estado === 'en_curso' ? 'badge-progress' : 'badge-finished'} mb-2`;

        // Mostrar u ocultar botones administrativos
        const btnFinalizar = document.getElementById('btn-finalizar-torneo');
        const btnNuevaRonda = document.getElementById('btn-nueva-ronda');
        const btnDeshacerRonda = document.getElementById('btn-deshacer-ronda');
        const btnGestionarJugadores = document.getElementById('btn-modal-jugadores');
        const numRondas = selectedTournament.rondas ? selectedTournament.rondas.length : 0;
        const tieneRondas = numRondas > 0;

        if (canManage && selectedTournament.estado === 'en_curso') {
            btnFinalizar.style.display = 'inline-block';
            btnNuevaRonda.style.display = 'inline-block';
            // El botón de gestionar desaparece a partir de que se lanza la segunda ronda (numRondas >= 2)
            if (btnGestionarJugadores) {
                btnGestionarJugadores.style.display = (numRondas >= 2) ? 'none' : 'inline-block';
            }
            // Mostrar deshacer ronda solo si hay al menos una ronda
            if (btnDeshacerRonda) {
                btnDeshacerRonda.style.display = tieneRondas ? 'inline-block' : 'none';
            }
        } else {
            btnFinalizar.style.display = 'none';
            btnNuevaRonda.style.display = 'none';
            if (btnDeshacerRonda) btnDeshacerRonda.style.display = 'none';
            if (btnGestionarJugadores) btnGestionarJugadores.style.display = 'none';
        }

        renderGestionJugadoresList();
        renderRondas();
        renderClasificacionInterna();
    }

    function closeTournamentManagement() {
        selectedTournament = null;
        document.getElementById('gestion-torneo-container').style.display = 'none';
        document.getElementById('lista-torneos-container').style.display = 'flex';
        if (canManage) {
            document.getElementById('btn-nuevo-torneo').style.display = 'inline-block';
        }
    }

    // Renderiza lista de jugadores del panel lateral
    function renderGestionJugadoresList() {
        const container = document.getElementById('gt-lista-jugadores');
        const countBadge = document.getElementById('gt-count-jugadores');
        if (!container) return;

        const jugadores = selectedTournament.jugadores || [];

        // Actualizar badge de contador en el panel
        if (countBadge) countBadge.textContent = jugadores.length;

        if (jugadores.length === 0) {
            container.innerHTML = `<li class="text-muted small py-2">No hay jugadores añadidos todavía.</li>`;
            return;
        }

        container.innerHTML = jugadores.map((j, i) => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <span><!--<span class="badge bg-secondary me-2">${i + 1}</span>-->${j.nombre}</span>
            </li>
        `).join('');
    }

    // -------------------------------------------------------
    // Calcula los tamaños de mesa: máximo de 4, nunca 5.
    // Maximiza mesas de 4 y usa mesas de 3 para el resto.
    // -------------------------------------------------------
    function calculateTableSizes(N) {
        if (N < 3) return [];
        let t4 = Math.floor(N / 4);
        while (t4 >= 0) {
            const remaining = N - 4 * t4;
            if (remaining >= 0 && remaining % 3 === 0) {
                const sizes = [];
                for (let i = 0; i < t4; i++) sizes.push(4);
                for (let i = 0; i < remaining / 3; i++) sizes.push(3);
                return sizes;
            }
            t4--;
        }
        return [N]; // fallback: única mesa con todos (solo ocurre con 5 o menos)
    }

    // -------------------------------------------------------
    // Genera la siguiente ronda con seeding por clasificación.
    // Ronda 1: aleatorio. Ronda 2+: ordenado por puntos+Buchholz.
    // Mesas de 4 = jugadores de mayor puntuación (arriba).
    // Mesas de 3 = jugadores de menor puntuación (abajo).
    // -------------------------------------------------------
    async function handleGenerateRound() {
        if (!selectedTournament) return;

        const jugadores = selectedTournament.jugadores || [];
        if (jugadores.length < 3) {
            if (window.showAlert) window.showAlert("Se necesitan al menos 3 jugadores para jugar.", "warning");
            return;
        }

        const rondas = selectedTournament.rondas || [];
        const esRondaInicial = rondas.length === 0;

        const confirmText = esRondaInicial
            ? "¿Seguro que quieres iniciar la Ronda 1?"
            : "¿Seguro que quieres generar la siguiente ronda?";
        if (!confirm(confirmText)) return;

        // 1. Calcular tamaños de mesa
        const tableSizes = calculateTableSizes(jugadores.length);
        // Tablas de 4 primero (jugadores de más puntos), luego las de 3
        tableSizes.sort((a, b) => b - a);

        // 2. Ordenar jugadores por ranking (ronda 1 = aleatorio)
        let sortedPlayers;
        if (esRondaInicial) {
            sortedPlayers = [...jugadores].sort(() => Math.random() - 0.5);
        } else {
            const standings = calculateStandings(selectedTournament);
            // standings ya viene ordenado por puntos desc + buchholz desc
            sortedPlayers = standings
                .map(s => jugadores.find(j => j.id === s.id))
                .filter(Boolean);
        }

        // 3. Distribuir jugadores en mesas en orden de ranking
        const mesas = [];
        let playerIndex = 0;
        tableSizes.forEach((size, tableIndex) => {
            const jugadoresMesa = sortedPlayers.slice(playerIndex, playerIndex + size);
            playerIndex += size;
            const resultados = {};
            jugadoresMesa.forEach(j => { resultados[j.id] = 0; });
            mesas.push({
                numero: tableIndex + 1,
                jugadores: jugadoresMesa.map(j => j.id),
                resultados
            });
        });

        const nuevasRondas = [...rondas];
        const numeroRonda = nuevasRondas.length + 1;
        nuevasRondas.push({ numero: numeroRonda, mesas });

        try {
            await db.collection('torneos').doc(selectedTournament.id).update({ rondas: nuevasRondas });
            selectedTournament.rondas = nuevasRondas;
            openTournamentManagement(selectedTournament.id); // Refrescar toda la vista para actualizar visibilidad de botones
            if (window.showAlert) window.showAlert(`Ronda ${numeroRonda} generada. ${mesas.length} mesa(s) formadas.`, "success");
        } catch (error) {
            console.error("Error al guardar la ronda en Firestore:", error);
            if (window.showAlert) window.showAlert("Error al guardar la ronda.", "danger");
        }
    }

    // -------------------------------------------------------
    // Deshace la última ronda generada (la de mayor número).
    // -------------------------------------------------------
    async function handleUndoRound() {
        if (!selectedTournament) return;
        const rondas = selectedTournament.rondas || [];
        if (rondas.length === 0) return;

        const ultimaRonda = rondas[rondas.length - 1].numero;
        if (!confirm(`¿Seguro que quieres eliminar la Ronda ${ultimaRonda}? Se borrarán todos sus resultados.`)) return;

        const nuevasRondas = rondas.slice(0, -1);

        try {
            await db.collection('torneos').doc(selectedTournament.id).update({ rondas: nuevasRondas });
            selectedTournament.rondas = nuevasRondas;
            // Re-abrir la vista para refrescar botones correctamente
            const torneoLocal = torneosCache.find(t => t.id === selectedTournament.id);
            if (torneoLocal) torneoLocal.rondas = nuevasRondas;
            openTournamentManagement(selectedTournament.id);
            if (window.showAlert) window.showAlert(`Ronda ${ultimaRonda} eliminada. Se ha vuelto a la ronda anterior.`, 'warning');
        } catch (error) {
            console.error('Error al deshacer la ronda:', error);
            if (window.showAlert) window.showAlert('Error al deshacer la ronda.', 'danger');
        }
    }

    function renderRondas() {
        const container = document.getElementById('rondas-container');
        if (!container) return;

        const rondas = selectedTournament.rondas || [];
        if (rondas.length === 0) {
            container.innerHTML = `<p class="text-muted small py-4 text-center">No se han generado rondas para este torneo todavía.</p>`;
            return;
        }

        // Mostrar de la más reciente a la más antigua
        const sortedRondas = [...rondas].sort((a, b) => b.numero - a.numero);

        container.innerHTML = sortedRondas.map(ronda => {
            const mesasHtml = ronda.mesas.map(mesa => {
                // Calcular posiciones de la mesa ordenando por puntos desc
                const mesaResultados = mesa.jugadores.map(jId => ({
                    jId,
                    puntos: mesa.resultados[jId] !== undefined ? mesa.resultados[jId] : 0
                })).sort((a, b) => b.puntos - a.puntos);

                // Asignar posición a cada jugador (empates comparten posición)
                const placementMap = {};
                let pos = 1;
                for (let i = 0; i < mesaResultados.length; i++) {
                    if (i > 0 && mesaResultados[i].puntos === mesaResultados[i - 1].puntos) {
                        placementMap[mesaResultados[i].jId] = placementMap[mesaResultados[i - 1].jId];
                    } else {
                        placementMap[mesaResultados[i].jId] = pos;
                    }
                    pos++;
                }

                const placementColors = ['bg-success', 'bg-warning text-dark', 'bg-secondary', 'bg-dark'];
                const placementLabels = ['1º', '2º', '3º', '4º', '5º'];

                const jugadoresHtml = mesa.jugadores.map(jId => {
                    const jugadorObj = selectedTournament.jugadores.find(jg => jg.id === jId);
                    const nombre = jugadorObj ? jugadorObj.nombre : "Desconocido";
                    const pMesa = mesa.resultados[jId] || 0;
                    const pExtra = (mesa.puntosAdicionales && mesa.puntosAdicionales[jId]) ? mesa.puntosAdicionales[jId] : 0;
                    const totalMesa = pMesa + pExtra;

                    let placementBadge = '';
                    const anyResultsSet = mesa.jugadores.some(id => (mesa.resultados[id] || 0) > 0 || (mesa.puntosAdicionales && mesa.puntosAdicionales[id]));
                    if (anyResultsSet) {
                        const placement = placementMap[jId] || 1;
                        const colorClass = placementColors[Math.min(placement - 1, placementColors.length - 1)];
                        const label = placementLabels[Math.min(placement - 1, placementLabels.length - 1)];
                        placementBadge = `<span class="badge ${colorClass} ms-2">${label}</span>`;
                    }

                    return `
                        <div class="d-flex justify-content-between align-items-center py-2 px-3 border-bottom bg-white">
                            <span>${nombre} ${placementBadge}</span>
                            <span class="fw-bold">${totalMesa > 0 ? totalMesa + ' pts' : '-'}</span>
                        </div>
                    `;
                }).join('');

                const btnEditarResultados = (canManage && selectedTournament.estado === 'en_curso') ? `
                    <button class="btn btn-sm btn-outline-primary btn-resultados-mesa" data-ronda="${ronda.numero}" data-mesa="${mesa.numero}">
                        <i class="fa-solid fa-edit"></i> Registrar Puntos
                    </button>
                ` : '';

                return `
                    <div class="col-md-6 mb-3">
                        <div class="pod-card shadow-sm">
                            <div class="pod-header d-flex justify-content-between align-items-center">
                                <span>Mesa ${mesa.numero}</span>
                                ${btnEditarResultados}
                            </div>
                            <div class="pod-body">
                                ${jugadoresHtml}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="card bg-white p-3 mb-4 rounded-3 border-0 shadow-sm">
                    <h5 class="fw-bold text-dark border-bottom pb-2 mb-3">Ronda ${ronda.numero}</h5>
                    <div class="row">
                        ${mesasHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Calcula clasificacion temporal interna del torneo
    function renderClasificacionInterna() {
        const tbody = document.getElementById('tabla-clasificacion-interna');
        if (!tbody) return;

        const standings = calculateStandings(selectedTournament);
        if (standings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No hay posiciones calculadas todavía.</td></tr>`;
            return;
        }

        tbody.innerHTML = standings.map((player, index) => `
            <tr>
                <td class="fw-bold">${index + 1}</td>
                <td>${player.nombre}</td>
                <td class="text-center">${Number(player.puntosMesa).toFixed(1)}</td>
                <td class="text-center text-success">+${Number(player.puntosExtra).toFixed(1)}</td>
                <td class="fw-bold text-center text-primary">${Number(player.puntos).toFixed(1)}</td>
                <td class="text-center text-muted small" title="Buchholz (desempate): suma de puntos de tus rivales">${Number(player.buchholz || 0).toFixed(1)}</td>
            </tr>
        `).join('');
    }

    // -------------------------------------------------------
    // Clasificación con desempate Buchholz.
    // Primario: puntos totales.
    // Desempate: suma de los puntos de todos los rivales (Buchholz).
    // -------------------------------------------------------
    function calculateStandings(tournament) {
        const jugadores = tournament.jugadores || [];
        const rondas = tournament.rondas || [];

        // Acumular puntos y registrar rivales
        const scores = {};
        jugadores.forEach(j => {
            scores[j.id] = { id: j.id, nombre: j.nombre, puntos: 0, puntosMesa: 0, puntosExtra: 0, rivalIds: [] };
        });

        rondas.forEach(r => {
            r.mesas.forEach(m => {
                m.jugadores.forEach(jId => {
                    if (scores[jId]) {
                        const pMesa = (m.resultados[jId] || 0);
                        const pExtra = (m.puntosAdicionales && m.puntosAdicionales[jId]) ? m.puntosAdicionales[jId] : 0;
                        scores[jId].puntosMesa += pMesa;
                        scores[jId].puntosExtra += pExtra;
                        scores[jId].puntos += (pMesa + pExtra);
                        // Registrar rivales de la mesa
                        m.jugadores.forEach(rivId => {
                            if (rivId !== jId) scores[jId].rivalIds.push(rivId);
                        });
                    }
                });
            });
        });

        // Calcular Buchholz (suma de puntos de todos los rivales)
        const players = Object.values(scores);
        players.forEach(p => {
            p.buchholz = p.rivalIds.reduce((sum, rivId) => {
                return sum + (scores[rivId] ? scores[rivId].puntos : 0);
            }, 0);
        });

        // Ordenar: 1º por puntos, 2º por Buchholz
        return players.sort((a, b) => {
            if (b.puntos !== a.puntos) return b.puntos - a.puntos;
            return b.buchholz - a.buchholz;
        });
    }

    // Abre modal para meter resultados de una mesa
    function openMesaResultsModal(rondaNum, mesaNum) {
        const ronda = selectedTournament.rondas.find(r => r.numero === parseInt(rondaNum));
        const mesa = ronda.mesas.find(m => m.numero === parseInt(mesaNum));
        const size = mesa.jugadores.length;

        document.getElementById('modal-res-mesa').textContent = `${mesaNum} (Ronda ${rondaNum})`;

        const container = document.getElementById('resultados-jugadores-fields');
        container.innerHTML = mesa.jugadores.map(jId => {
            const jugador = selectedTournament.jugadores.find(jg => jg.id === jId);
            const nombre = jugador ? jugador.nombre : "Desconocido";
            const actualVal = mesa.resultados[jId] !== undefined ? mesa.resultados[jId] : 0;
            const actualExtra = (mesa.puntosAdicionales && mesa.puntosAdicionales[jId]) ? mesa.puntosAdicionales[jId] : 0;

            // Intentar deducir la posición actual en base a los puntos guardados
            let actualPlacement = '';
            if (actualVal > 0) {
                if (size > 1) {
                    actualPlacement = Math.round((4 - actualVal) * (size - 1) / 3) + 1;
                } else {
                    actualPlacement = 1;
                }
            }

            const options = [...Array(size).keys()].map(i => {
                const placementNum = i + 1;
                const isSelected = (actualPlacement === placementNum) ? 'selected' : '';
                return `<option value="${placementNum}" ${isSelected}>${placementNum}º Lugar</option>`;
            }).join('');

            return `
                <div class="mb-2 d-flex align-items-center justify-content-between">
                    <label class="form-label mb-0 fw-bold">${nombre}</label>
                    <div class="d-flex gap-2" style="width: 250px;">
                        <select class="form-select select-placement-player" data-id="${jId}" style="flex: 1;" required>
                            <option value="" disabled ${actualPlacement === '' ? 'selected' : ''}>-- Posición --</option>
                            ${options}
                        </select>
                        <input type="number" class="form-control input-extra-points" data-id="${jId}" value="${actualExtra}" step="0.5" style="width: 70px;">
                    </div>
                </div>
            `;
        }).join('');

        // Adjuntar metadatos de la mesa en el form
        const form = document.getElementById('form-resultados');
        form.dataset.ronda = rondaNum;
        form.dataset.mesa = mesaNum;

        modalResultados.show();
    }

    // Guardar resultados de mesa en Firestore
    async function handleMesaResultsSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const rondaNum = parseInt(form.dataset.ronda);
        const mesaNum = parseInt(form.dataset.mesa);

        const rondas = [...selectedTournament.rondas];
        const ronda = rondas.find(r => r.numero === rondaNum);
        const mesa = ronda.mesas.find(m => m.numero === mesaNum);
        const size = mesa.jugadores.length;

        const puntosAdicionales = {};

        // Leer inputs de posiciones
        const selects = form.querySelectorAll('.select-placement-player');
        let hasUnselected = false;
        selects.forEach(select => {
            if (!select.value) hasUnselected = true;
        });

        if (hasUnselected) {
            if (window.showAlert) window.showAlert("Por favor, selecciona una posición para todos los jugadores.", "warning");
            return;
        }

        selects.forEach(select => {
            const jId = select.dataset.id;
            const placement = parseInt(select.value);

            const extraInput = form.querySelector(`.input-extra-points[data-id="${jId}"]`);
            puntosAdicionales[jId] = parseFloat(extraInput.value) || 0;

            // Fórmula: points = 4 - (placement - 1) * (3 / (size - 1))
            let score = 4;
            if (size > 1) {
                score = 4 - (placement - 1) * (3 / (size - 1));
            }
            mesa.resultados[jId] = score;
        });

        mesa.puntosAdicionales = puntosAdicionales;

        try {
            await db.collection('torneos').doc(selectedTournament.id).update({ rondas });
            selectedTournament.rondas = rondas;
            modalResultados.hide();
            renderRondas();
            renderClasificacionInterna();
            if (window.showAlert) window.showAlert("Resultados registrados con éxito.", "success");
        } catch (error) {
            console.error("Error al guardar resultados en Firestore:", error);
            if (window.showAlert) window.showAlert("Error al guardar resultados.", "danger");
        }
    }


    // Finalizar torneo y sumar a la liga
    async function handleFinalizeTournament() {
        if (!selectedTournament) return;
        if (!confirm("¿Estás seguro de que deseas finalizar este torneo? Esto congelará los resultados y acumulará las clasificaciones de liga (si aplica).")) return;

        const standings = calculateStandings(selectedTournament);
        const posiciones = standings.map((st, i) => ({
            id: st.id,
            nombre: st.nombre,
            puntos: st.puntos,
            posicion: i + 1
        }));

        try {
            // Transacción por si se actualiza la liga de forma simultánea
            await db.runTransaction(async (transaction) => {
                const torneoRef = db.collection('torneos').doc(selectedTournament.id);

                let ligaRef = null;
                let ligaDoc = null;

                // Si es jornada de liga y tiene liga asociada
                // Firestore obliga a hacer todas las lecturas antes de cualquier escritura
                if (selectedTournament.esJornadaLiga && selectedTournament.ligaId) {
                    ligaRef = db.collection('ligas').doc(selectedTournament.ligaId);
                    ligaDoc = await transaction.get(ligaRef);
                }

                // Actualizar torneo a finalizado
                transaction.update(torneoRef, {
                    estado: 'finalizado',
                    posiciones: posiciones
                });

                // Si es jornada de liga y tiene liga asociada
                if (ligaDoc && ligaDoc.exists) {
                    const ligaData = ligaDoc.data();
                    const clasificacion = ligaData.clasificacion || {};

                    // Sumar los puntos obtenidos en este torneo
                    posiciones.forEach(pos => {
                        // Si el jugador es un usuario registrado (no invitado), buscar si tiene
                        // una entrada fusionada (invitado_* con userId === pos.id) para no duplicar
                        const isRegisteredUser = !pos.id.startsWith('invitado_') && !pos.id.startsWith('temp_');
                        let fusedEntryKey = null;
                        if (isRegisteredUser) {
                            for (const [key, data] of Object.entries(clasificacion)) {
                                if (data.userId === pos.id) {
                                    fusedEntryKey = key;
                                    break;
                                }
                            }
                        }

                        if (fusedEntryKey) {
                            // Sumar al perfil fusionado en lugar de crear uno nuevo
                            clasificacion[fusedEntryKey].puntos += pos.puntos;
                            clasificacion[fusedEntryKey].nombre = pos.nombre;
                        } else if (clasificacion[pos.id]) {
                            clasificacion[pos.id].puntos += pos.puntos;
                        } else {
                            clasificacion[pos.id] = {
                                nombre: pos.nombre,
                                puntos: pos.puntos
                            };
                        }
                    });

                    transaction.update(ligaRef, { clasificacion });
                }
            });

            // Actualizar caché local
            const localTorneo = torneosCache.find(t => t.id === selectedTournament.id);
            if (localTorneo) {
                localTorneo.estado = 'finalizado';
                localTorneo.posiciones = posiciones;
            }

            // Recargar datos e interfaz
            await loadInitialData();
            openTournamentManagement(selectedTournament.id);

            if (window.showAlert) {
                window.showAlert(
                    "Torneo finalizado y clasificación actualizada con éxito.",
                    "success"
                );
            }

        } catch (error) {
            console.error("Error al finalizar el torneo en la base de datos:", error);
            if (window.showAlert) window.showAlert("Error al finalizar el torneo.", "danger");
        }
    }

    // --- GESTIÓN DE PARTICIPANTES (MODAL) ---

    function openJugadoresModal(torneoId) {
        selectedTournament = torneosCache.find(t => t.id === torneoId);
        if (!selectedTournament) return;

        tempJugadores = selectedTournament.jugadores ? [...selectedTournament.jugadores] : [];
        updateImportarInscritosButton();
        renderTempJugadoresList();
        loadJugadoresPrevios().catch(e => console.error(e));
        // Limpiar filtros
        const fActuales = document.getElementById('filter-jugadores-actuales');
        if (fActuales) fActuales.value = '';
        const fPrevios = document.getElementById('filter-jugadores-previos');
        if (fPrevios) fPrevios.value = '';
        modalJugadores.show();
    }

    function updateImportarInscritosButton() {
        const btn = document.getElementById('btn-importar-inscritos-jornada');
        if (!btn) return;

        const hasSubevento = !!(selectedTournament && selectedTournament.subeventoId);
        btn.disabled = !hasSubevento;
        btn.title = hasSubevento
            ? 'Traer jugadores inscritos de la actividad asociada'
            : 'Asocia una actividad al torneo para importar inscritos';
    }

    async function handleImportarInscritosJornada() {
        if (!selectedTournament || !selectedTournament.subeventoId) {
            if (window.showAlert) window.showAlert('Este torneo no tiene una actividad asociada.', 'warning');
            return;
        }

        try {
            const snapshot = await db.collection('subeventos')
                .doc(selectedTournament.subeventoId)
                .collection('inscripciones')
                .where('pagado', '==', true)
                .get();

            const inscritos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (!inscritos.length) {
                if (window.showAlert) window.showAlert('No hay inscritos pagados en la actividad asociada.', 'info');
                return;
            }

            let addedCount = 0;
            const ligaAsociada = selectedTournament.ligaId ? ligasCache.find(l => l.id === selectedTournament.ligaId) : null;

            inscritos.forEach(inscripcion => {
                // Determinar el ID del jugador para verificar si ya existe
                const playerIdToCheck = inscripcion.userId || (inscripcion.leagueCode ? `invitado_${inscripcion.leagueCode}` : null);

                // Si ya está añadido, saltar
                if (playerIdToCheck && tempJugadores.some(j => j.id === playerIdToCheck)) return;

                if (inscripcion.userId) {
                    // Jugador con cuenta
                    tempJugadores.push({
                        id: inscripcion.userId,
                        nombre: inscripcion.nombreCompleto || 'Sin nombre'
                    });
                    addedCount++;
                } else {
                    // Invitado desde inscripción (sin userId)
                    const email = inscripcion.correo ? inscripcion.correo.toLowerCase() : '';
                    // Intentar buscar si este correo ya tiene un código en la liga
                    let existingCode = '';
                    if (ligaAsociada && ligaAsociada.clasificacion) {
                        const found = Object.entries(ligaAsociada.clasificacion).find(([id, data]) => (data.email || '').toLowerCase() === email);
                        if (found) existingCode = found[0].replace('invitado_', '');
                    }

                    tempJugadores.push({
                        id: existingCode ? `invitado_${existingCode}` : `temp_${Date.now()}_${addedCount}`,
                        nombre: inscripcion.nombreCompleto || 'Invitado',
                        leagueCode: existingCode,
                        needsCode: !existingCode
                    });
                    addedCount++;
                }
            });

            renderTempJugadoresList();
            if (window.showAlert) {
                const msg = addedCount
                    ? `${addedCount} jugador(es) importado(s) desde la actividad.`
                    : 'Los inscritos de la actividad ya estaban en el torneo.';
                window.showAlert(msg, addedCount ? 'success' : 'info');
            }
        } catch (error) {
            console.error('Error importando inscritos de la actividad:', error);
            if (window.showAlert) window.showAlert('No se pudieron importar los inscritos de la actividad.', 'danger');
        }
    }

    function populateAgregarUsuarioSelect() {
        // Poblar el datalist del buscador
        const datalist = document.getElementById('datalist-usuarios');
        if (!datalist) return;

        datalist.innerHTML = usuariosCache.map(u => {
            const nombre = `${u.nombre} ${u.apellidos || ''}`.trim();
            return `<option value="${nombre}" data-id="${u.id}">`;
        }).join('');
    }

    function handleAgregarUsuarioALista() {
        const input = document.getElementById('input-buscar-usuario');
        if (!input) return;
        const searchVal = input.value.trim();
        if (!searchVal) return;

        // Buscar coincidencia exacta por nombre completo
        const userObj = usuariosCache.find(u =>
            `${u.nombre} ${u.apellidos || ''}`.trim().toLowerCase() === searchVal.toLowerCase()
        );

        if (!userObj) {
            if (window.showAlert) window.showAlert("No se encontró ningún socio con ese nombre. Asegúrate de seleccionarlo de la lista.", "warning");
            return;
        }

        if (tempJugadores.some(j => j.id === userObj.id)) {
            if (window.showAlert) window.showAlert("Este jugador ya está añadido.", "warning");
            input.value = '';
            return;
        }

        tempJugadores.push({
            id: userObj.id,
            nombre: `${userObj.nombre} ${userObj.apellidos || ''}`.trim()
        });

        renderTempJugadoresList();
        input.value = '';
        input.focus();
    }

    // Genera un código aleatorio de 6 caracteres alfanuméricos
    // (Esta función ya estaba definida arriba, la dejo aquí para referencia si se movió)

    function generateLeagueCode() {
        const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }


    function handleAgregarInvitadoALista() {
        const inputNombre = document.getElementById('input-nombre-invitado');
        const inputCodigo = document.getElementById('input-codigo-invitado');
        const nombre = inputNombre.value.trim();
        let codigo = inputCodigo.value.trim().toUpperCase();

        if (!nombre) {
            if (window.showAlert) window.showAlert("El nombre del invitado no puede estar vacío.", "warning");
            return;
        }

        if (!codigo) {
            codigo = generateLeagueCode();
        }

        const idInvitado = 'invitado_' + codigo;

        if (tempJugadores.some(j => j.id === idInvitado)) {
            if (window.showAlert) window.showAlert("Este código de invitado ya está en la lista.", "warning");
            return;
        }

        tempJugadores.push({
            id: idInvitado,
            nombre: nombre + ' (Invitado)',
            leagueCode: codigo
        });

        renderTempJugadoresList();
        inputNombre.value = '';
        inputCodigo.value = '';
    }

    function handleRemoveJugadorTemp(jId) {
        tempJugadores = tempJugadores.filter(j => j.id !== jId);
        renderTempJugadoresList();
    }

    function renderTempJugadoresList() {
        const list = document.getElementById('lista-gestion-jugadores');
        const count = document.getElementById('count-jugadores');
        const filterInput = document.getElementById('filter-jugadores-actuales');
        if (!list || !count) return;

        count.textContent = tempJugadores.length;

        const term = filterInput ? filterInput.value.trim().toLowerCase() : '';
        const filtered = term
            ? tempJugadores.filter(j => j.nombre.toLowerCase().includes(term))
            : tempJugadores;

        if (filtered.length === 0) {
            list.innerHTML = `<li class="list-group-item text-center text-muted py-3">${
                term ? 'No hay coincidencias.' : 'No hay participantes agregados.'
            }</li>`;
            return;
        }

        list.innerHTML = filtered.map((j, i) => {
            const isGuest = j.id.startsWith('invitado_') || j.id.startsWith('temp_') || j.needsCode;
            const itemClass = j.needsCode ? 'list-group-item-danger' : '';

            let guestInfoHtml = '';
            if (isGuest) {
                if (j.needsCode) {
                    guestInfoHtml = `
                        <div class="mt-2 d-flex gap-2">
                            <input type="text" class="form-control form-control-sm input-assign-code" data-playerid="${j.id}" placeholder="Asignar Código" maxlength="6" style="text-transform: uppercase;">
                            <button class="btn btn-sm btn-success btn-gen-code-row" data-playerid="${j.id}"><i class="fa-solid fa-dice"></i></button>
                        </div>
                    `;
                } else {
                    guestInfoHtml = `<span class="badge bg-dark ms-2">Cod: ${j.leagueCode}</span>`;
                }
            }

            return `
                <li class="list-group-item ${itemClass} d-flex flex-column">
                    <div class="d-flex justify-content-between align-items-center w-100">
                        <span>
                            <span class="badge bg-secondary me-2" style="min-width:1.8rem;">${i + 1}</span>
                            ${j.nombre} ${guestInfoHtml && !j.needsCode ? guestInfoHtml : ''}
                        </span>
                        <button class="btn btn-sm btn-outline-danger btn-quitar-jugador-temp" data-id="${j.id}"
                            title="Quitar jugador"><i class="fa-solid fa-times"></i></button>
                    </div>
                    ${j.needsCode ? guestInfoHtml : ''}
                </li>
            `;
        }).join('');
    }

    async function handleConfirmJugadores() {
        if (!selectedTournament) return;

        // Validar que no haya jugadores con 'needsCode'
        if (tempJugadores.some(j => j.needsCode)) {
            if (window.showAlert) window.showAlert("Hay invitados sin código de liga asignado. Por favor, genera o introduce sus códigos (marcados en rojo).", "danger");
            return;
        }

        try {
            // Antes de guardar, asegurarse de que los IDs de los jugadores temporales con código asignado
            // se actualicen a 'invitado_CODIGO' si aún están como 'temp_...'
            tempJugadores = tempJugadores.map(j => {
                if (j.id.startsWith('temp_') && j.leagueCode) {
                    return { ...j, id: `invitado_${j.leagueCode}` };
                }
                return j;
            });
            await db.collection('torneos').doc(selectedTournament.id).update({
                jugadores: tempJugadores
            });
            selectedTournament.jugadores = tempJugadores;

            // Actualizar caché
            const localTorneo = torneosCache.find(t => t.id === selectedTournament.id);
            if (localTorneo) localTorneo.jugadores = tempJugadores;

            renderTournamentsList();
            renderGestionJugadoresList();
            if (window.showAlert) window.showAlert("Participantes actualizados correctamente.", "success");
        } catch (error) {
            console.error("Error al actualizar jugadores en Firestore:", error);
        }
    }

    // --- JUGADORES DE JORNADAS ANTERIORES ---
    let _jugadoresPrevios = [];
    let _previosPage = 1;
    const PREVIOS_PER_PAGE = 10;

    async function loadJugadoresPrevios() {
        _jugadoresPrevios = [];
        _previosPage = 1;

        if (!selectedTournament || !selectedTournament.ligaId) {
            renderJugadoresPrevios();
            return;
        }

        // Cargar clasificación actual de la liga para detectar fusiones
        let mergedMap = {};
        try {
            const ligaDoc = await db.collection('ligas').doc(selectedTournament.ligaId).get();
            if (ligaDoc.exists) {
                const clasificacion = ligaDoc.data().clasificacion || {};
                for (const [key, entry] of Object.entries(clasificacion)) {
                    if (key.startsWith('invitado_') && entry.userId) {
                        mergedMap[key] = entry.userId;
                    }
                }
            }
        } catch (e) {
            console.warn('No se pudo cargar la clasificación de la liga:', e);
        }

        const torneosLiga = torneosCache.filter(t =>
            t.ligaId === selectedTournament.ligaId &&
            t.id !== selectedTournament.id &&
            t.jugadores && t.jugadores.length > 0
        );

        const seen = new Set();
        torneosLiga.forEach(t => {
            (t.jugadores || []).forEach(j => {
                // Si el jugador ya está en tempJugadores, saltar
                if (tempJugadores.some(tj => tj.id === j.id)) return;

                // Si es invitado fusionado a un usuario registrado, mostrar el perfil registrado
                if (j.id.startsWith('invitado_') && mergedMap[j.id]) {
                    const userId = mergedMap[j.id];
                    if (!seen.has(userId)) {
                        seen.add(userId);
                        const user = usuariosCache.find(u => u.id === userId);
                        if (user) {
                            _jugadoresPrevios.push({
                                id: userId,
                                nombre: `${user.nombre || ''} ${user.apellidos || ''}`.trim() || user.correo,
                                leagueCode: j.id.split('_')[1]
                            });
                        } else {
                            // Usuario no encontrado en cache, mostrar entrada original
                            seen.add(j.id);
                            _jugadoresPrevios.push({ ...j });
                        }
                    }
                    return;
                }

                if (!seen.has(j.id)) {
                    seen.add(j.id);
                    _jugadoresPrevios.push({ ...j });
                }
            });
        });

        renderJugadoresPrevios();
    }

    function renderJugadoresPrevios() {
        const tbody = document.getElementById('lista-jugadores-previos');
        const paginationNav = document.getElementById('pagination-jugadores-previos');
        const filterInput = document.getElementById('filter-jugadores-previos');
        if (!tbody) return;

        const term = filterInput ? filterInput.value.trim().toLowerCase() : '';
        const filtered = term
            ? _jugadoresPrevios.filter(j => j.nombre.toLowerCase().includes(term))
            : _jugadoresPrevios;

        const totalPages = Math.ceil(filtered.length / PREVIOS_PER_PAGE) || 1;
        if (_previosPage > totalPages) _previosPage = totalPages;
        const start = (_previosPage - 1) * PREVIOS_PER_PAGE;
        const page = filtered.slice(start, start + PREVIOS_PER_PAGE);

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">${
                term ? 'No hay coincidencias.' : 'No hay jugadores de jornadas anteriores.'
            }</td></tr>`;
            if (paginationNav) paginationNav.innerHTML = '';
            return;
        }

        tbody.innerHTML = page.map((j, i) => {
            const code = j.id.startsWith('invitado_') ? j.id.split('_')[1] : (j.leagueCode || '—');
            const badge = j.id.startsWith('invitado_')
                ? `<span class="badge bg-secondary">Invitado</span>`
                : `<span class="badge bg-primary">Registrado</span>`;
            return `
                <tr>
                    <td>${start + i + 1}</td>
                    <td>${j.nombre} ${badge}</td>
                    <td><code>${code}</code></td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-success btn-add-previo" data-id="${j.id}" data-nombre="${j.nombre.replace(/"/g, '&quot;')}" data-leaguecode="${j.leagueCode || ''}">
                            <i class="fa-solid fa-plus"></i> Añadir
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        if (paginationNav) {
            if (totalPages <= 1) {
                paginationNav.innerHTML = '';
            } else {
                let html = '<ul class="pagination pagination-sm justify-content-center mb-0">';
                html += `<li class="page-item ${_previosPage === 1 ? 'disabled' : ''}"><button class="page-link" data-page-prev="${_previosPage - 1}">&laquo;</button></li>`;
                for (let i = 1; i <= totalPages; i++) {
                    html += `<li class="page-item ${i === _previosPage ? 'active' : ''}"><button class="page-link" data-page-prev="${i}">${i}</button></li>`;
                }
                html += `<li class="page-item ${_previosPage === totalPages ? 'disabled' : ''}"><button class="page-link" data-page-prev="${_previosPage + 1}">&raquo;</button></li>`;
                html += '</ul>';
                paginationNav.innerHTML = html;
            }
        }
    }

    function addJugadorPrevio(id, nombre, leagueCode) {
        if (tempJugadores.some(j => j.id === id)) {
            if (window.showAlert) window.showAlert('Este jugador ya está en la lista.', 'warning');
            return;
        }
        tempJugadores.push({
            id: id,
            nombre: nombre,
            leagueCode: leagueCode || undefined
        });
        renderTempJugadoresList();
        // Quitarlo de la lista de previos y re-renderizar
        _jugadoresPrevios = _jugadoresPrevios.filter(j => j.id !== id);
        renderJugadoresPrevios();
    }

    // --- ACCIONES DE CREACIÓN DE TORNEO Y LIGA ---

    // Maneja el cambio del checkbox "¿Es jornada de Liga?"
    function handleEsLigaChange(isLiga) {
        if (isLiga) {
            ligaBloque.style.display = 'block';
            independienteBloque.style.display = 'none';
            selectTorneoLiga.required = true;
            selectTorneoEvento.required = false;
            selectTorneoEvento.value = ''; // Limpiar

            // Forzar actualización de subeventos basados en la liga seleccionada actual
            handleTorneoLigaChange(selectTorneoLiga.value);
        } else {
            ligaBloque.style.display = 'none';
            independienteBloque.style.display = 'block';
            selectTorneoLiga.required = false;
            selectTorneoLiga.value = ''; // Limpiar

            // Forzar actualización de subeventos basados en el evento manual
            handleEventoChange(selectTorneoEvento.value);
        }
    }

    // Cuando se selecciona una liga, buscamos a qué evento pertenece para filtrar los subeventos
    function handleTorneoLigaChange(ligaId) {
        console.log('handleTorneoLigaChange - received ligaId:', ligaId); // Debugging
        if (!ligaId) {
            if (selectTorneoSubevento) {
                selectTorneoSubevento.innerHTML = '<option value="">Selecciona una liga primero</option>';
                selectTorneoSubevento.disabled = true;
            }
            return;
        }

        const ligaAsociada = ligasCache.find(l => l.id === ligaId);
        console.log('handleTorneoLigaChange - found ligaAsociada:', ligaAsociada); // Debugging
        if (ligaAsociada && ligaAsociada.eventoId) {
            // Reutilizamos tu función handleEventoChange pasándole el ID del evento de la liga
            handleEventoChange(ligaAsociada.eventoId);
            console.log('handleTorneoLigaChange - Calling handleEventoChange with eventoId:', ligaAsociada.eventoId); // Debugging
        } else {
            if (selectTorneoSubevento) {
                selectTorneoSubevento.innerHTML = '<option value="">Esta liga no tiene un evento válido asignado</option>';
                selectTorneoSubevento.disabled = true;
            }
        }
    }

    // Guardar/Editar Torneo
    async function handleTorneoFormSubmit(e) {
        console.log('handleTorneoFormSubmit - Submitting form...'); // Debugging
        e.preventDefault();
        const torneoId = document.getElementById('torneo-id').value;

        const esLiga = checkEsLiga.checked;
        let finalEventoId = null;
        let finalLigaId = null;

        if (esLiga) {
            finalLigaId = selectTorneoLiga.value;
            console.log('handleTorneoFormSubmit - esLiga is true, finalLigaId:', finalLigaId); // Debugging
            // Extraer el eventoId directamente de la configuración de la Liga elegida
            const ligaObj = ligasCache.find(l => l.id === finalLigaId);
            finalEventoId = ligaObj ? ligaObj.eventoId : null;
        } else {
            finalEventoId = selectTorneoEvento.value || null;
        }

        const data = {
            nombre: document.getElementById('torneo-nombre').value.trim(),
            fecha: new Date(document.getElementById('torneo-fecha').value).toISOString(),
            juego: 'mtg-commander',
            esJornadaLiga: esLiga,
            ligaId: finalLigaId,
            eventoId: finalEventoId,
            subeventoId: selectTorneoSubevento.value || null, // Actividad/Jornada opcional
        };

        try {
            if (torneoId) {
                await db.collection('torneos').doc(torneoId).update(data);
                if (window.showAlert) window.showAlert("Torneo actualizado con éxito.", "success");
            } else {
                // Campos por defecto para nuevos torneos
                data.estado = 'borrador';
                data.jugadores = [];
                data.rondas = [];
                await db.collection('torneos').add(data);
                if (window.showAlert) window.showAlert("Torneo creado con éxito en estado Borrador.", "success");
            }
            modalTorneo.hide();
            await loadInitialData();
        } catch (error) {
            console.error("Error al guardar torneo:", error);
            if (window.showAlert) window.showAlert("Error al guardar el torneo.", "danger");
        }
    }

    // Crear Nueva Liga
    async function handleLigaFormSubmit(e) {
        e.preventDefault();
        const eventId = selectLigaEvento.value;
        const eventoObj = eventosCache.find(e => e.id === eventId);

        const data = {
            nombre: document.getElementById('liga-nombre').value.trim(),
            juego: 'mtg-commander',
            activa: true,
            eventoId: eventId,
            eventoTitulo: eventoObj ? eventoObj.titulo : '', // Backup para búsquedas rápidas
            creado: firebase.firestore.Timestamp.now(),
            clasificacion: {}
        };

        try {
            await db.collection('ligas').add(data);
            modalLiga.hide();
            document.getElementById('form-liga').reset();
            $('#liga-evento').val(null).trigger('change');
            if (window.showAlert) window.showAlert("Liga creada y asociada al evento con éxito.", "success");
            await loadInitialData();
        } catch (error) {
            console.error("Error al guardar liga:", error);
            if (window.showAlert) window.showAlert("Error al guardar la liga.", "danger");
        }
    }

    async function handleIniciarTorneo(torneoId) {
        const torneo = torneosCache.find(t => t.id === torneoId);
        if (!torneo) return;

        if (!torneo.jugadores || torneo.jugadores.length < 3) {
            if (window.showAlert) window.showAlert("Necesitas agregar al menos 3 jugadores antes de iniciar el torneo.", "warning");
            return;
        }

        if (!confirm(`¿Estás seguro de iniciar el torneo "${torneo.nombre}"? Esto cambiará su estado a En Curso.`)) return;

        try {
            await db.collection('torneos').doc(torneoId).update({ estado: 'en_curso' });
            if (window.showAlert) window.showAlert("Torneo iniciado. Ya puedes generar emparejamientos y rondas.", "success");
            await loadInitialData();
            openTournamentManagement(torneoId);
        } catch (error) {
            console.error("Error al iniciar torneo:", error);
        }
    }

    async function handleEliminarTorneo(torneoId) {
        if (!confirm("¿Estás completamente seguro de que deseas eliminar este torneo? Esta acción no se puede deshacer y borrará todas sus rondas e historial.")) return;

        try {
            const torneoRef = db.collection('torneos').doc(torneoId);
            const torneoDoc = await torneoRef.get();

            if (!torneoDoc.exists) {
                if (window.showAlert) window.showAlert("El torneo no existe.", "danger");
                return;
            }

            const torneoData = torneoDoc.data();
            const posiciones = torneoData.posiciones || [];

            // Si es jornada de liga y tiene posiciones, restar los puntos de la clasificación
            if (torneoData.esJornadaLiga && torneoData.ligaId && posiciones.length > 0) {
                await db.runTransaction(async (transaction) => {
                    const ligaRef = db.collection('ligas').doc(torneoData.ligaId);
                    const ligaDoc = await transaction.get(ligaRef);

                    if (ligaDoc.exists) {
                        const ligaData = ligaDoc.data();
                        const clasificacion = ligaData.clasificacion || {};

                        posiciones.forEach(pos => {
                            // Misma lógica que al sumar: buscar entrada fusionada por userId
                            const isRegisteredUser = !pos.id.startsWith('invitado_') && !pos.id.startsWith('temp_');
                            let fusedEntryKey = null;
                            if (isRegisteredUser) {
                                for (const [key, data] of Object.entries(clasificacion)) {
                                    if (data.userId === pos.id) {
                                        fusedEntryKey = key;
                                        break;
                                    }
                                }
                            }

                            const targetKey = fusedEntryKey || pos.id;
                            if (clasificacion[targetKey]) {
                                clasificacion[targetKey].puntos -= pos.puntos;
                                // Si los puntos bajan a 0 o menos, eliminar la entrada
                                if (clasificacion[targetKey].puntos <= 0) {
                                    delete clasificacion[targetKey];
                                }
                            }
                        });

                        transaction.update(ligaRef, { clasificacion });
                    }
                });
            }

            await torneoRef.delete();
            if (window.showAlert) window.showAlert("Torneo eliminado y puntos de liga restados.", "success");
            await loadInitialData();
        } catch (error) {
            console.error("Error al eliminar torneo:", error);
            if (window.showAlert) window.showAlert("Error al eliminar el torneo.", "danger");
        }
    }

    async function handleEliminarLiga() {
        const ligaId = selectLigaActiva ? selectLigaActiva.value : '';
        const liga = ligasCache.find(l => l.id === ligaId);
        if (!liga) return;

        const torneosAsociados = torneosCache.filter(t => t.ligaId === ligaId);
        const detalleTorneos = torneosAsociados.length === 1
            ? '1 torneo asociado'
            : `${torneosAsociados.length} torneos asociados`;

        if (!confirm(`Eliminar la liga "${liga.nombre}" y sus ${detalleTorneos}? Esta accion no se puede deshacer.`)) return;

        try {
            const batch = db.batch();
            torneosAsociados.forEach(torneo => {
                batch.delete(db.collection('torneos').doc(torneo.id));
            });
            batch.delete(db.collection('ligas').doc(ligaId));
            await batch.commit();

            if (window.showAlert) window.showAlert("Liga y torneos asociados eliminados.", "success");
            await loadInitialData();
        } catch (error) {
            console.error("Error al eliminar liga:", error);
            if (window.showAlert) window.showAlert("Error al eliminar la liga.", "danger");
        }
    }

    // --- EVENT LISTENERS ---

    function setupEventListeners() {
        // Checkbox de liga en formulario de torneo (Cambia la visualización del formulario)
        if (checkEsLiga) {
            checkEsLiga.addEventListener('change', (e) => handleEsLigaChange(e.target.checked));
        }

        // Cuando cambia la liga seleccionada en el formulario de torneo
        if (selectTorneoLiga) {
            $(selectTorneoLiga).off('change.torneoLiga').on('change.torneoLiga', function () {
                handleTorneoLigaChange(this.value);
            });
        }

        // Cambio de evento en formulario (Solo aplica en modo independiente)
        if (selectTorneoEvento) {
            selectTorneoEvento.addEventListener('change', (e) => handleEventoChange(e.target.value));
        }

        if (selectLigaActiva) {
            selectLigaActiva.addEventListener('change', handleLigaActivaChange);
            bindLigaActivaSelect2Change();
        }

        if (btnEliminarLiga) {
            btnEliminarLiga.addEventListener('click', handleEliminarLiga);
        }

        // Al abrir el botón "Nuevo Torneo", resetear al estado por defecto (Independiente)
        const btnNuevoTorneo = document.getElementById('btn-nuevo-torneo');
        if (btnNuevoTorneo) {
            btnNuevoTorneo.addEventListener('click', () => {
                document.getElementById('form-torneo').reset();
                document.getElementById('torneo-id').value = '';
                document.getElementById('modal-torneo-titulo').textContent = 'Crear Nuevo Torneo';

                // Forzar reset manual de los bloques visuales
                checkEsLiga.checked = false;
                handleEsLigaChange(false);

                modalTorneo.show();
            });
        }

        // Submit formularios
        const formTorneo = document.getElementById('form-torneo');
        if (formTorneo) formTorneo.addEventListener('submit', handleTorneoFormSubmit);

        const formLiga = document.getElementById('form-liga');
        if (formLiga) formLiga.addEventListener('submit', handleLigaFormSubmit);

        const formMergePoints = document.getElementById('form-merge-points');
        if (formMergePoints) formMergePoints.addEventListener('submit', handleMergeInvitedPoints);

        const formResultados = document.getElementById('form-resultados');
        if (formResultados) formResultados.addEventListener('submit', handleMesaResultsSubmit);

        // Botones del panel de gestión
        const btnCerrarGestion = document.getElementById('btn-cerrar-gestion');
        if (btnCerrarGestion) btnCerrarGestion.addEventListener('click', closeTournamentManagement);

        const btnNuevaRonda = document.getElementById('btn-nueva-ronda');
        if (btnNuevaRonda) btnNuevaRonda.addEventListener('click', handleGenerateRound);

        const btnDeshacerRonda = document.getElementById('btn-deshacer-ronda');
        if (btnDeshacerRonda) btnDeshacerRonda.addEventListener('click', handleUndoRound);

        const btnFinalizarTorneo = document.getElementById('btn-finalizar-torneo');
        if (btnFinalizarTorneo) btnFinalizarTorneo.addEventListener('click', handleFinalizeTournament);

        // Botón nueva liga
        const btnNuevaLiga = document.getElementById('btn-nueva-liga');
        if (btnNuevaLiga) btnNuevaLiga.addEventListener('click', () => modalLiga.show());

        // Eventos de gestión de participantes (Modal)
        const btnModalJugadores = document.getElementById('btn-modal-jugadores');
        if (btnModalJugadores) {
            btnModalJugadores.addEventListener('click', () => {
                if (selectedTournament) openJugadoresModal(selectedTournament.id);
            });
        }

        const btnAgregarUsuario = document.getElementById('btn-agregar-usuario-lista');
        if (btnAgregarUsuario) btnAgregarUsuario.addEventListener('click', handleAgregarUsuarioALista);

        const btnImportarInscritos = document.getElementById('btn-importar-inscritos-jornada');
        if (btnImportarInscritos) btnImportarInscritos.addEventListener('click', handleImportarInscritosJornada);

        // También añadir al pulsar Enter en el buscador
        const inputBuscarUsuario = document.getElementById('input-buscar-usuario');
        if (inputBuscarUsuario) {
            inputBuscarUsuario.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleAgregarUsuarioALista(); }
            });
        }

        if (document.getElementById('btn-open-merge-modal')) {
            document.getElementById('btn-open-merge-modal').addEventListener('click', openMergePointsModal);
        }

        const btnAgregarInvitado = document.getElementById('btn-agregar-invitado-lista');
        if (btnAgregarInvitado) btnAgregarInvitado.addEventListener('click', handleAgregarInvitadoALista);

        const btnGenerarCodigo = document.getElementById('btn-generar-codigo-invitado');
        if (btnGenerarCodigo) {
            btnGenerarCodigo.addEventListener('click', () => {
                document.getElementById('input-codigo-invitado').value = generateLeagueCode();
            });
        }

        const btnConfirmarJugadores = document.getElementById('btn-confirmar-jugadores');
        if (btnConfirmarJugadores) btnConfirmarJugadores.addEventListener('click', handleConfirmJugadores);

        // Manejador genérico para delegación de clics en listas y tablas
        document.addEventListener('click', (e) => {
            const target = e.target.closest('button');
            if (!target) return;

            // Eliminar jugador temporal en el modal
            if (target.classList.contains('btn-quitar-jugador-temp')) {
                handleRemoveJugadorTemp(target.dataset.id);
            }

            // Gestionar Jugadores (Lista general)
            if (target.classList.contains('btn-add-players-torneo')) {
                openJugadoresModal(target.dataset.id);
            }

            // Iniciar Torneo
            if (target.classList.contains('btn-iniciar-torneo')) {
                handleIniciarTorneo(target.dataset.id);
            }

            // Gestionar Torneo (Acceso a rondas y mesas)
            if (target.classList.contains('btn-gestionar-torneo') || target.classList.contains('btn-ver-detalles-torneo')) {
                openTournamentManagement(target.dataset.id);
            }

            // Eliminar Torneo
            if (target.classList.contains('btn-eliminar-torneo')) {
                handleEliminarTorneo(target.dataset.id);
            }

            // Editar Torneo (Dentro del document click listener)
            if (target.classList.contains('btn-editar-torneo')) {
                const tId = target.dataset.id;
                const torneoObj = torneosCache.find(t => t.id === tId);
                if (torneoObj) {
                    document.getElementById('form-torneo').reset();
                    document.getElementById('torneo-id').value = tId;
                    document.getElementById('modal-torneo-titulo').textContent = 'Editar Torneo';
                    document.getElementById('torneo-nombre').value = torneoObj.nombre;

                    const d = new Date(torneoObj.fecha);
                    const formattedDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                    document.getElementById('torneo-fecha').value = formattedDate;

                    // Cargar el estado del checkbox y disparar el layout correcto
                    checkEsLiga.checked = torneoObj.esJornadaLiga;
                    handleEsLigaChange(torneoObj.esJornadaLiga);

                    if (torneoObj.esJornadaLiga) {
                        selectTorneoLiga.value = torneoObj.ligaId || '';
                        // Cargar subeventos de la liga
                        handleTorneoLigaChange(torneoObj.ligaId);
                        setTimeout(() => { selectTorneoSubevento.value = torneoObj.subeventoId || ''; }, 500);
                    } else {
                        selectTorneoEvento.value = torneoObj.eventoId || '';
                        handleEventoChange(torneoObj.eventoId).then(() => {
                            selectTorneoSubevento.value = torneoObj.subeventoId || '';
                        });
                    }
                    modalTorneo.show();
                }
            }

            // Cargar resultados de mesa
            if (target.classList.contains('btn-resultados-mesa')) {
                openMesaResultsModal(target.dataset.ronda, target.dataset.mesa);
            }
        });

        // Listener para los inputs de asignación manual de código en la lista
        $(document).on('input', '.input-assign-code', function () {
            const playerId = this.dataset.playerid;
            const code = this.value.trim().toUpperCase();
            if (code.length === 6) {
                const player = tempJugadores.find(j => j.id === playerId);
                if (player) {
                    player.leagueCode = code;
                    player.id = `invitado_${code}`;
                    player.needsCode = false;
                    renderTempJugadoresList();
                }
            }
        });

        // Listener para los botones de generar código en la lista
        $(document).on('click', '.btn-gen-code-row', function () {
            const playerId = this.dataset.playerid;
            const player = tempJugadores.find(j => j.id === playerId);
            if (player) {
                const code = generateLeagueCode();
                player.leagueCode = code;
                player.id = `invitado_${code}`;
                player.needsCode = false;
                renderTempJugadoresList();
            }
        });

        // Checkbox de mostrar finalizados
        if (filterShowFinalized) {
            filterShowFinalized.addEventListener('change', () => renderTournamentsList());
        }

        // Filtro en lista actual de jugadores (modal)
        const filterActuales = document.getElementById('filter-jugadores-actuales');
        if (filterActuales) {
            filterActuales.addEventListener('input', () => renderTempJugadoresList());
        }

        // Filtro y paginación en jugadores previos (modal)
        const filterPrevios = document.getElementById('filter-jugadores-previos');
        if (filterPrevios) {
            filterPrevios.addEventListener('input', () => {
                _previosPage = 1;
                renderJugadoresPrevios();
            });
        }

        $(document).on('click', '.btn-add-previo', function () {
            const id = this.dataset.id;
            const nombre = this.dataset.nombre;
            const leagueCode = this.dataset.leaguecode || '';
            addJugadorPrevio(id, nombre, leagueCode);
        });

        $(document).on('click', '[data-page-prev]', function () {
            _previosPage = parseInt(this.dataset.pagePrev);
            renderJugadoresPrevios();
        });
    }

    // --- FUSIONAR PUNTOS DE INVITADO A USUARIO ---

    function populateMergeUserDropdown() {
        if (!selectMergeUser) return;
        const sortedUsers = [...usuariosCache].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
        selectMergeUser.innerHTML = `<option value="">-- Selecciona un usuario --</option>` +
            sortedUsers.map(u => `<option value="${u.id}">${u.nombre} ${u.apellidos || ''} (${u.correo})</option>`).join('');
        initSelect2(selectMergeUser, {
            dropdownParent: $('#merge-points-modal'),
            placeholder: '-- Escribe para buscar un usuario --',
            allowClear: false
        });
    }

    function populateMergeLeagueCodeDropdown(ligaId) {
        if (!selectMergeLeagueCode) return;
        const liga = ligasCache.find(l => l.id === ligaId);
        if (!liga || !liga.clasificacion) {
            selectMergeLeagueCode.innerHTML = `<option value="">No hay invitados en esta liga</option>`;
            selectMergeLeagueCode.disabled = true;
            return;
        }

        const invitedPlayers = Object.entries(liga.clasificacion)
            .filter(([id, data]) => id.startsWith('invitado_') && !data.mergedFromGuest)
            .map(([id, data]) => ({ id, nombre: data.nombre, code: id.split('_')[1] }))
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));

        selectMergeLeagueCode.innerHTML = `<option value="">-- Selecciona un código de invitado --</option>` +
            invitedPlayers.map(p => `<option value="${p.id}">${p.nombre} (Código: ${p.code})</option>`).join('');
        selectMergeLeagueCode.disabled = invitedPlayers.length === 0;

        initSelect2(selectMergeLeagueCode, {
            dropdownParent: $('#merge-points-modal'),
            placeholder: '-- Escribe para buscar un código --',
            allowClear: false
        });
    }

    function openMergePointsModal() {
        const ligaId = selectLigaActiva.value;
        if (!ligaId) {
            if (window.showAlert) window.showAlert("Por favor, selecciona una liga primero.", "warning");
            return;
        }
        populateMergeLeagueCodeDropdown(ligaId);
        mergePointsModal.show();
    }

    async function handleMergeInvitedPoints(e) {
        e.preventDefault();
        const ligaId = selectLigaActiva.value;
        const invitedPlayerId = selectMergeLeagueCode.value;
        const registeredUserId = selectMergeUser.value;

        if (!ligaId || !invitedPlayerId || !registeredUserId) {
            if (window.showAlert) window.showAlert("Por favor, selecciona un código de invitado y un usuario.", "warning");
            return;
        }

        const liga = ligasCache.find(l => l.id === ligaId);
        if (!liga) {
            if (window.showAlert) window.showAlert("Liga no encontrada.", "danger");
            return;
        }

        const registeredUser = usuariosCache.find(u => u.id === registeredUserId);
        if (!registeredUser) {
            if (window.showAlert) window.showAlert("Usuario registrado no encontrado.", "danger");
            return;
        }

        if (!confirm(`¿Estás seguro de fusionar los puntos del invitado "${liga.clasificacion[invitedPlayerId].nombre}" (Código: ${invitedPlayerId.split('_')[1]}) con el usuario "${registeredUser.nombre} ${registeredUser.apellidos}"?`)) {
            return;
        }

        try {
            await db.runTransaction(async (transaction) => {
                const ligaRef = db.collection('ligas').doc(ligaId);
                const ligaDoc = await transaction.get(ligaRef);

                if (!ligaDoc.exists) throw new Error("La liga no existe.");

                const clasificacion = ligaDoc.data().clasificacion || {};
                const invitedPlayerEntry = clasificacion[invitedPlayerId];
                const registeredUserEntry = clasificacion[registeredUserId];

                if (!invitedPlayerEntry) throw new Error("El código de invitado no existe en la clasificación de esta liga.");

                if (registeredUserEntry) {
                    invitedPlayerEntry.puntos += registeredUserEntry.puntos;
                    delete clasificacion[registeredUserId];
                }

                invitedPlayerEntry.nombre = `${registeredUser.nombre} ${registeredUser.apellidos || ''}`.trim();
                invitedPlayerEntry.userId = registeredUserId;
                invitedPlayerEntry.email = registeredUser.correo;
                invitedPlayerEntry.mergedFromGuest = true;

                clasificacion[invitedPlayerId] = invitedPlayerEntry;
                transaction.update(ligaRef, { clasificacion });
            });

            if (window.showAlert) window.showAlert("Puntos fusionados con éxito. La clasificación se actualizará.", "success");
            mergePointsModal.hide();
            await loadInitialData();
        } catch (error) {
            console.error("Error al fusionar puntos:", error);
            if (window.showAlert) window.showAlert(`Error al fusionar puntos: ${error.message}`, "danger");
        }
    }

    // Arrancar el controlador
    init();
};
