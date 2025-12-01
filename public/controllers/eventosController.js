document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    // --- STATE ---
    let userRole = 'viewer'; // viewer, socio, admin
    let currentUser = null;
    let eventosCache = [];
    let tiposCache = [];
    let tiposCountMap = {};
    let subeventosCache = [];
    let itemToDeleteId = null;
    let itemToDeleteType = null; // 'evento' or 'subevento'
    // Exponer getters simples para otros controladores (subeventos)
    window.getTiposCache = () => tiposCache;
    window.getUserRole = () => userRole;

    // --- UI ELEMENTS ---
    let eventModal, confirmModal, manageTypesModal, subeventModal;
    const eventModalElement = document.getElementById('event-modal');
    const confirmModalElement = document.getElementById('confirm-modal');
    const manageTypesModalElement = document.getElementById('manage-types-modal');
    const subeventModalElement = document.getElementById('subevent-modal');
    
    const eventForm = document.getElementById('event-form');
    const typeForm = document.getElementById('type-form');
    const subeventForm = document.getElementById('subevent-form');

    const eventosGallery = document.getElementById('eventos-gallery');
    const typesListContainer = document.getElementById('types-list-container');
    const typeFilterSelect = document.getElementById('type-filter');
    const eventTypeSelect = document.getElementById('event-tipo');
    const subeventTipoSelect = document.getElementById('subevent-tipo');
    // Filtros de vista: mostrar eventos / actividades
    const filterShowEventsEl = document.getElementById('filter-show-events');
    const filterShowActivitiesEl = document.getElementById('filter-show-activities');
    // Campos nuevos para eventos continuos
    const eventContinuoCheckbox = document.getElementById('event-continuo');
    const eventFechaInicioEl = document.getElementById('event-fechaInicio');
    const eventFechaFinEl = document.getElementById('event-fechaFin');
    const eventFechaCol = document.getElementById('event-fecha-col');
    const eventHoraCol = document.getElementById('event-hora-col');
    const eventFechaEl = document.getElementById('event-fecha');
    const eventHoraEl = document.getElementById('event-hora');

    // --- DATATABLES ---
    let eventosDataTable;

    // --- INITIALIZATION ---
    if (eventModalElement) eventModal = new bootstrap.Modal(eventModalElement);
    if (confirmModalElement) confirmModal = new bootstrap.Modal(confirmModalElement);
    if (manageTypesModalElement) manageTypesModal = new bootstrap.Modal(manageTypesModalElement);
    if (subeventModalElement) subeventModal = new bootstrap.Modal(subeventModalElement);

    // Helper para mostrar un modal por encima de otros (corrige stacking cuando hay múltiples modales)
    function showModalOnTop(modalInstance, modalElement) {
        if (!modalInstance || !modalElement) return;
        try {
            // Determinar el z-index más alto entre modales y backdrops abiertos
            let maxZ = 1050; // base aproximada
            document.querySelectorAll('.modal.show').forEach(m => {
                const z = parseInt(window.getComputedStyle(m).zIndex) || 1050;
                if (z > maxZ) maxZ = z;
            });
            document.querySelectorAll('.modal-backdrop').forEach(b => {
                const z = parseInt(window.getComputedStyle(b).zIndex) || 1040;
                if (z > maxZ) maxZ = z;
            });
            const newZ = maxZ + 20;
            modalElement.style.zIndex = newZ;

            const onShown = () => {
                // Ajustar el backdrop recién creado para que quede justo debajo del modal
                const backdrops = document.querySelectorAll('.modal-backdrop');
                if (backdrops.length) {
                    const bd = backdrops[backdrops.length - 1];
                    bd.style.zIndex = newZ - 10;
                }
                modalElement.removeEventListener('shown.bs.modal', onShown);
            };
            modalElement.addEventListener('shown.bs.modal', onShown);
            modalInstance.show();
        } catch (e) {
            // Fallback: mostrar normalmente
            modalInstance.show();
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toggleEventContinuoUI() {
        try {
            const continuo = eventContinuoCheckbox && eventContinuoCheckbox.checked;
            if (eventFechaCol) eventFechaCol.style.display = continuo ? 'none' : 'block';
            if (eventHoraCol) eventHoraCol.style.display = continuo ? 'none' : 'block';
            if (eventFechaInicioEl) eventFechaInicioEl.parentElement.style.display = continuo ? 'block' : 'none';
            if (eventFechaFinEl) eventFechaFinEl.parentElement.style.display = continuo ? 'block' : 'none';
            if (eventFechaEl) eventFechaEl.required = !continuo;
            if (eventHoraEl) eventHoraEl.required = !continuo;
            if (eventFechaInicioEl) eventFechaInicioEl.required = !!continuo;
            if (eventFechaFinEl) eventFechaFinEl.required = !!continuo;
            if (continuo) {
                // limpiar fecha/hora para evitar valores inconsistentes
                if (eventFechaEl) eventFechaEl.value = '';
                if (eventHoraEl) eventHoraEl.value = '';
            } else {
                if (eventFechaInicioEl) eventFechaInicioEl.value = '';
                if (eventFechaFinEl) eventFechaFinEl.value = '';
            }
        } catch (e) {
            // noop
        }
    }

    auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        if (user) {
            const userDoc = await db.collection('usuarios').doc(user.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData.isAdmin) userRole = 'admin';
                else if (userData.isSocio) userRole = 'socio';
                else userRole = 'viewer';
            } else {
                userRole = 'viewer';
            }
        } else {
            userRole = 'viewer';
        }
        initPage();
    });

    function initPage() {
        const path = window.location.pathname;
        loadEventTypes();

        // Evitar colisiones: comprobar primero la ruta de subevento (subeventoDetalle contiene 'eventoDetalle' como substring)
        if (path.includes('subeventoDetalle.html')) {
            if (window.loadSubeventDetails) window.loadSubeventDetails();
        } else if (path.includes('eventoDetalle.html')) {
            loadEventDetails();
        } else if (path.includes('eventos.html')) {
            initDataTable();
            // Cargar eventos y todas las actividades (subeventos) antes de renderizar
            Promise.all([loadEvents(), loadAllSubeventos()]).then(() => {
                renderViews();
            });
        }
        updateUIVisibility(); // Initial call for non-datatable elements
    }

    async function loadAllSubeventos() {
        try {
            const now = firebase.firestore.Timestamp.now();
            let query = db.collection('subeventos').orderBy('fechaEvento', 'asc');
            const snapshot = await query.get();
            // Convertir y mantener fechaPublicacion como Date si existe
            subeventosCache = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    fechaPublicacion: data.fechaPublicacion && data.fechaPublicacion.toDate ? data.fechaPublicacion.toDate() : (data.fechaPublicacion || null)
                };
            });
        } catch (error) {
            console.error('Error loading all subevents:', error);
        }
    }

    // ================================================
    // EVENT LISTING PAGE (eventos.html)
    // ================================================

    async function loadEvents() {
        try {
            const snapshot = await db.collection('eventos').orderBy('fecha', 'desc').get();
            eventosCache = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    fechaPublicacion: data.fechaPublicacion && data.fechaPublicacion.toDate ? data.fechaPublicacion.toDate() : (data.fechaPublicacion || null)
                };
            });
            renderViews();
        } catch (error) {
            console.error("Error loading events:", error);
            showAlert("Error al cargar los eventos.", "danger");
        }
    }

    function initDataTable() {
        if ($.fn.DataTable.isDataTable('#eventos-table')) return;
        eventosDataTable = $('#eventos-table').DataTable({
            language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
            responsive: true, pageLength: 10, data: [],
            columns: [
                { data: 'titulo', title: 'Título', render: (data, type, row) => {
                    const badge = row.kind === 'actividad' ? '<span class="badge bg-success ms-2">Actividad</span>' : '<span class="badge bg-primary ms-2">Evento</span>';
                    return `${data || ''} ${badge}`;
                }},
                {
                    data: null, title: 'Fecha y Hora',
                    render: (data) => {
                        try {
                            if (data.continuo) {
                                const start = data.fechaInicio ? new Date((data.fechaInicio || '') + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                                const end = data.fechaFin ? new Date((data.fechaFin || '') + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                                return `${start}${end ? ' — ' + end : ''}`;
                            }
                            const fecha = data.fecha ? new Date((data.fecha || '') + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                            return `${fecha} ${data.hora || ''}`;
                        } catch (e) {
                            return '';
                        }
                    }
                },
                { data: 'lugar', title: 'Lugar', render: (data) => {
                    if (!data) return '';
                    const full = String(data);
                    if (full.length > 40) {
                        const short = full.slice(0,40) + '…';
                        return `<span title="${escapeHtml(full)}">${escapeHtml(short)}</span>`;
                    }
                    return escapeHtml(full);
                } },
                {
                    data: null, title: 'Acciones',
                    orderable: false, searchable: false, className: 'text-center',
                    render: (data, type, row) => {
                        if (row.kind === 'actividad') {
                            return `
                                <a href="subeventoDetalle.html?id=${row.id}" class="btn btn-sm btn-info" title="Ver Detalles"><i class="fas fa-eye"></i></a>
                                <button class="btn btn-sm btn-outline-primary btn-edit-subevent admin-controls" data-id="${row.id}" title="Editar"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-sm btn-outline-danger btn-delete-subevent admin-controls" data-id="${row.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
                            `;
                        }
                        return `
                            <a href="eventoDetalle.html?id=${data}" class="btn btn-sm btn-info" title="Ver Detalles"><i class="fas fa-eye"></i></a>
                            <button class="btn btn-sm btn-outline-primary btn-edit-event admin-controls" data-id="${data}" title="Editar"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-outline-danger btn-delete-event admin-controls" data-id="${data}" title="Eliminar"><i class="fas fa-trash"></i></button>
                        `;
                    }
                }
            ],
            drawCallback: function(settings) {
                // This is the key fix: run visibility update AFTER the table is drawn.
                updateUIVisibility();
            }
        });
    }

    function renderViews() {
        // kept for backward compatibility; prefer usar applyEventFilterAndRender
        applyEventFilterAndRender();
    }

    function renderGallery(events = null) {
        const list = events || eventosCache.map(e => ({ kind: 'evento', item: e }));
        if (!eventosGallery) return;
        eventosGallery.innerHTML = '';
        if (!list || list.length === 0) {
            eventosGallery.innerHTML = '<div class="col-12"><p class="text-center text-muted">No hay eventos para mostrar.</p></div>';
            return;
        }
        list.forEach(wrapper => {
            const { kind, item } = wrapper;
            const col = document.createElement('div');
            col.className = 'col-lg-4 col-md-6 mb-4';
            const titulo = item.titulo || '';
            const descripcion = item.descripcion || '';
            const imagen = item.imagen || 'https://via.placeholder.com/400x250';
            let fechaStr = '';
            let horaStr = '';
            if (kind === 'evento') {
                if (item.continuo) {
                    const start = item.fechaInicio ? new Date((item.fechaInicio || '') + 'T00:00:00').toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
                    const end = item.fechaFin ? new Date((item.fechaFin || '') + 'T00:00:00').toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
                    fechaStr = start + (end ? ' — ' + end : '');
                    horaStr = '';
                } else {
                    fechaStr = new Date((item.fecha || '') + 'T00:00:00').toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
                    horaStr = item.hora || '';
                }
            } else {
                fechaStr = new Date((item.fechaEvento || '') + 'T00:00:00').toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
                horaStr = item.horaEvento || '';
            }
            const badge = kind === 'evento' ? `<span class="badge bg-primary">Evento</span>` : `<span class="badge bg-success">Actividad</span>`;
            // Enlace directo: eventos -> eventoDetalle, actividades -> subeventoDetalle
            const viewHref = kind === 'evento' ? `eventoDetalle.html?id=${item.id}` : `subeventoDetalle.html?id=${item.id}`;
            col.innerHTML = `
                <div class="card h-100 shadow-sm">
                    <img src="${imagen}" class="card-img-top">
                    <div class="card-body d-flex flex-column">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h5 class="card-title mb-0">${titulo}</h5>
                            ${badge}
                        </div>
                        <p class="card-text text-muted small">${fechaStr} ${horaStr ? 'a las ' + horaStr : ''}</p>
                        <p class="card-text flex-grow-1">${descripcion.substring(0, 100)}...</p>
                        <div class="mt-auto d-flex justify-content-between align-items-center">
                            <a href="${viewHref}" class="btn btn-outline-info btn-sm"><i class="fas fa-eye"></i> Ver Detalles</a>
                            <div class="admin-controls">
                                ${kind === 'evento' ? `<button class="btn btn-sm btn-outline-primary btn-edit-event" data-id="${item.id}" title="Editar"><i class="fas fa-edit"></i></button>` : `<button class="btn btn-sm btn-outline-primary btn-edit-subevent" data-id="${item.id}" title="Editar"><i class="fas fa-edit"></i></button>`}
                                ${kind === 'evento' ? `<button class="btn btn-sm btn-outline-danger btn-delete-event" data-id="${item.id}" title="Eliminar"><i class="fas fa-trash"></i></button>` : `<button class="btn btn-sm btn-outline-danger btn-delete-subevent" data-id="${item.id}" title="Eliminar"><i class="fas fa-trash"></i></button>`}
                            </div>
                        </div>
                    </div>
                </div>`;
            eventosGallery.appendChild(col);
        });
        updateUIVisibility(); // Update for gallery view
    }

    async function applyEventFilterAndRender() {
        const selectedType = typeFilterSelect ? typeFilterSelect.value : '';
        const showEvents = filterShowEventsEl ? filterShowEventsEl.checked : true;
        const showActivities = filterShowActivitiesEl ? filterShowActivitiesEl.checked : true;
        const searchTerm = (document.getElementById('search-input') && document.getElementById('search-input').value) ? document.getElementById('search-input').value.trim().toLowerCase() : '';
        if (!selectedType) {
            // sin filtro: mostrar todos los eventos y actividades futuras
            const now = new Date();
            let upcomingEvents = [];
            let upcomingActivities = [];

            if (showEvents) {
                upcomingEvents = eventosCache.filter(ev => {
                    try {
                        // Si el evento es continuo, considerarlo si su fechaFin aún no ha pasado
                        if (ev.continuo) {
                            if (!ev.fechaFin) return false;
                            const endDt = new Date((ev.fechaFin || '') + 'T23:59:59');
                            return endDt > now;
                        }
                        // Eventos normales: comprobar fecha + hora
                        if (!ev.fecha) return false;
                        const dt = new Date((ev.fecha || '') + 'T' + (ev.hora || '00:00'));
                        return dt > now;
                    } catch (e) {
                        return false;
                    }
                });
                if (searchTerm) {
                    upcomingEvents = upcomingEvents.filter(ev => (ev.titulo || '').toLowerCase().includes(searchTerm) || (ev.descripcion || '').toLowerCase().includes(searchTerm));
                }
            }

            if (showActivities) {
                upcomingActivities = (subeventosCache || []).filter(s => {
                    if (!s.fechaEvento) return false;
                    const dt = new Date((s.fechaEvento || '') + 'T' + (s.horaEvento || '00:00'));
                    // si viewer, solo mostrar publicadas
                    if (userRole === 'viewer' && s.fechaPublicacion && s.fechaPublicacion > now) return false;
                    return dt > now;
                });
                if (searchTerm) {
                    upcomingActivities = upcomingActivities.filter(s => (s.titulo || '').toLowerCase().includes(searchTerm) || (s.descripcion || '').toLowerCase().includes(searchTerm));
                }
            }

            // Construir listados para galería y tabla
            const combinedForGallery = [...upcomingEvents.map(e => ({ kind: 'evento', item: e })), ...upcomingActivities.map(s => ({ kind: 'actividad', item: s }))];
            renderGallery(combinedForGallery);

            if (eventosDataTable) {
                const tableRows = [];
                if (showEvents) upcomingEvents.forEach(ev => tableRows.push({ id: ev.id, titulo: ev.titulo, fecha: ev.fecha, hora: ev.hora, fechaInicio: ev.fechaInicio, fechaFin: ev.fechaFin, continuo: !!ev.continuo, lugar: ev.lugar, kind: 'evento' }));
                if (showActivities) upcomingActivities.forEach(s => tableRows.push({ id: s.id, titulo: s.titulo, fecha: s.fechaEvento, hora: s.horaEvento, lugar: s.lugar, kind: 'actividad', eventoId: s.eventoId }));
                eventosDataTable.clear().rows.add(tableRows).draw();
            }
            return;
        }

        // Cuando los tipos aplican a subeventos, mostramos solo aquellos eventos
        // que tienen al menos un subevento del tipo seleccionado.
        try {
            const now = firebase.firestore.Timestamp.now();
            // Obtener todos los subeventos del tipo seleccionado en una sola consulta
            let query = db.collection('subeventos').where('tipoEventoId', '==', selectedType);
            if (userRole === 'viewer') query = query.where('fechaPublicacion', '<=', now);
            const snap = await query.get();
            const nowDate = new Date();
            const snapData = snap.docs.map(d => ({ id: d.id, ...d.data(), fechaPublicacion: d.data().fechaPublicacion && d.data().fechaPublicacion.toDate ? d.data().fechaPublicacion.toDate() : null }));
            let activityFiltered = (subeventosCache && subeventosCache.length ? subeventosCache : snapData).filter(s => s.tipoEventoId === selectedType).filter(s => {
                if (!s.fechaEvento) return false;
                const dt = new Date((s.fechaEvento || '') + 'T' + (s.horaEvento || '00:00'));
                if (userRole === 'viewer' && s.fechaPublicacion && s.fechaPublicacion > nowDate) return false;
                return dt > nowDate;
            });
            if (searchTerm) {
                // Filtrar por término de búsqueda tanto actividades como eventos
                activityFiltered = activityFiltered.filter(s => (s.titulo || '').toLowerCase().includes(searchTerm) || (s.descripcion || '').toLowerCase().includes(searchTerm));
            }
            const eventIds = new Set(activityFiltered.map(s => s.eventoId).filter(Boolean));
            const filteredEvents = eventosCache.filter(ev => {
                if (!eventIds.has(ev.id)) return false;
                if (ev.continuo) {
                    if (!ev.fechaFin) return false;
                    return new Date((ev.fechaFin || '') + 'T23:59:59') > nowDate;
                }
                return (new Date((ev.fecha || '') + 'T' + (ev.hora || '00:00')) > nowDate);
            });
            // Construir combinados
            const combinedForGallery = [
                ...(showEvents ? filteredEvents.map(e => ({ kind: 'evento', item: e })) : []),
                ...(showActivities ? activityFiltered.map(s => ({ kind: 'actividad', item: s })) : [])
            ];
            renderGallery(combinedForGallery);

            if (eventosDataTable) {
                const tableRows = [];
                if (showEvents) filteredEvents.forEach(ev => tableRows.push({ id: ev.id, titulo: ev.titulo, fecha: ev.fecha, hora: ev.hora, fechaInicio: ev.fechaInicio, fechaFin: ev.fechaFin, continuo: !!ev.continuo, lugar: ev.lugar, kind: 'evento' }));
                if (showActivities) activityFiltered.forEach(s => tableRows.push({ id: s.id, titulo: s.titulo, fecha: s.fechaEvento, hora: s.horaEvento, lugar: s.lugar, kind: 'actividad', eventoId: s.eventoId }));
                eventosDataTable.clear().rows.add(tableRows).draw();
            }
        } catch (error) {
            console.error('Error aplicando filtro por tipo en eventos:', error);
            // fallback: mostrar todos
            renderGallery(eventosCache);
            if (eventosDataTable) {
                eventosDataTable.clear().rows.add(eventosCache).draw();
            }
        }
    }
    
    function openEventModalForEdit(id) {
        const evento = eventosCache.find(e => e.id === id);
        if (evento && eventForm) {
            eventForm.reset();
            document.getElementById('event-id').value = id;
            document.getElementById('event-modal-title').textContent = 'Editar Evento';
            document.getElementById('event-titulo').value = evento.titulo;
            // Continuo / rango de fechas
            try {
                if (document.getElementById('event-continuo')) document.getElementById('event-continuo').checked = !!evento.continuo;
                if (document.getElementById('event-fechaInicio')) document.getElementById('event-fechaInicio').value = evento.fechaInicio || '';
                if (document.getElementById('event-fechaFin')) document.getElementById('event-fechaFin').value = evento.fechaFin || '';
                document.getElementById('event-fecha').value = evento.fecha || '';
                document.getElementById('event-hora').value = evento.hora || '';
                // Ajustar UI según el checkbox
                toggleEventContinuoUI();
            } catch (e) {
                console.warn('No se pudo prellenar campos de fecha/continuo:', e);
            }
            document.getElementById('event-lugar').value = evento.lugar;
            document.getElementById('event-descripcion').value = evento.descripcion;
            document.getElementById('event-imagen').value = evento.imagen;
            // Prefill publication datetime if present
            try {
                const pubEl = document.getElementById('event-publicacion');
                if (pubEl) {
                    const fp = evento.fechaPublicacion;
                    let d = null;
                    if (fp && fp.toDate) d = fp.toDate();
                    else if (fp) d = new Date(fp);
                    if (d && !isNaN(d.getTime())) {
                        const dateString = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0,16);
                        pubEl.value = dateString;
                    }
                }
            } catch (e) {
                console.warn('No se pudo prellenar fecha de publicación:', e);
            }
            if(eventModal) eventModal.show();
        }
    }

    async function handleEventFormSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('event-id').value;
        const titulo = document.getElementById('event-titulo').value;
        const descripcion = document.getElementById('event-descripcion').value;
        const lugar = document.getElementById('event-lugar').value;
        const imagen = document.getElementById('event-imagen').value;
        const continuo = document.getElementById('event-continuo') ? document.getElementById('event-continuo').checked : false;
        const fecha = document.getElementById('event-fecha') ? document.getElementById('event-fecha').value : '';
        const hora = document.getElementById('event-hora') ? document.getElementById('event-hora').value : '';
        const fechaInicio = document.getElementById('event-fechaInicio') ? document.getElementById('event-fechaInicio').value : '';
        const fechaFin = document.getElementById('event-fechaFin') ? document.getElementById('event-fechaFin').value : '';

        const eventoData = {
            titulo,
            descripcion,
            lugar,
            imagen,
            continuo: !!continuo
        };

        if (continuo) {
            eventoData.fechaInicio = fechaInicio || null;
            eventoData.fechaFin = fechaFin || null;
            // Remove single fecha/hora
            eventoData.fecha = null;
            eventoData.hora = null;
        } else {
            eventoData.fecha = fecha || null;
            eventoData.hora = hora || null;
            eventoData.fechaInicio = null;
            eventoData.fechaFin = null;
        }

        // fechaPublicacion
        try {
            const pubVal = document.getElementById('event-publicacion')?.value;
            if (pubVal) {
                eventoData.fechaPublicacion = firebase.firestore.Timestamp.fromDate(new Date(pubVal));
            }
        } catch (e) {
            console.warn('No se pudo parsear fechaPublicacion:', e);
        }

        try {
            if (id) {
                await db.collection('eventos').doc(id).update(eventoData);
                showAlert('Evento actualizado con éxito', 'success');
            } else {
                await db.collection('eventos').add(eventoData);
                showAlert('Evento creado con éxito', 'success');
            }
            if(eventModal) eventModal.hide();
            loadEvents();
        } catch (error) {
            console.error('Error saving event: ', error);
            showAlert('Error al guardar el evento.', 'danger');
        }
    }
    
    function handleDeleteEvent(id) {
        const eventToDelete = eventosCache.find(e => e.id === id);
        if (!eventToDelete) return;
        itemToDeleteId = id;
        itemToDeleteType = 'evento';
        document.getElementById('confirm-modal-body').textContent = `¿Estás seguro de que quieres eliminar el evento "${eventToDelete.titulo}"?`;
        if(confirmModal) showModalOnTop(confirmModal, confirmModalElement);
    }

    // ================================================
    // EVENT DETAIL PAGE (eventoDetalle.html)
    // ================================================

    async function loadEventDetails() {
        const eventId = new URLSearchParams(window.location.search).get('id');
        if (!eventId) return showAlert('Evento no especificado.', 'warning');
        try {
            // Cargar datos del evento
            const eventoDoc = await db.collection('eventos').doc(eventId).get();
            if (!eventoDoc.exists) return showAlert('Evento no encontrado.', 'warning');
            const raw = eventoDoc.data();
            const evento = {
                id: eventoDoc.id,
                ...raw,
                fechaPublicacion: raw.fechaPublicacion && typeof raw.fechaPublicacion.toDate === 'function' ? raw.fechaPublicacion.toDate() : (raw.fechaPublicacion || null)
            };

            // Cargar tipos y conteos
            const snapshot = await db.collection('tipoSubevento').orderBy('nombre').get();
            tiposCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            const subSnap = await db.collection('subeventos').get();
            const counts = {};
            subSnap.docs.forEach(d => {
                const data = d.data();
                const tipoId = data.tipoEventoId;
                if (tipoId) counts[tipoId] = (counts[tipoId] || 0) + 1;
            });
            tiposCountMap = counts;

            // Poblar selects
            const filter = document.getElementById('type-filter');
            const select = document.getElementById('subevent-tipo');
            if (filter) {
                filter.innerHTML = '<option value="">-- Todos los tipos --</option>';
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const option = document.createElement('option');
                    option.value = doc.id;
                    option.textContent = data.nombre;
                    filter.appendChild(option);
                });
            }
            if (select) {
                select.innerHTML = '<option value="">-- Selecciona un tipo --</option>';
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const opt2 = document.createElement('option');
                    opt2.value = doc.id;
                    opt2.textContent = data.nombre;
                    select.appendChild(opt2);
                });
            }
            renderTypesList();

            // Rellenar detalles del evento en la vista
            const fecha = evento.fecha || '';
            const dateEl = document.getElementById('event-detail-date');
            const placeEl = document.getElementById('event-detail-place');
            const titleEl = document.getElementById('event-detail-title');
            const descEl = document.getElementById('event-detail-description');
            const imgEl = document.getElementById('event-detail-image');

            if (dateEl) dateEl.innerHTML = `<i class="fas fa-calendar-alt"></i> ${fecha} ${evento.hora ? 'a las ' + evento.hora : ''}`;
            if (placeEl) placeEl.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${escapeHtml(evento.lugar || '')}`;
            if (titleEl) titleEl.textContent = evento.titulo || 'Sin título';
            if (descEl) descEl.textContent = evento.descripcion || '';
            if (imgEl) {
                const src = evento.imagen && evento.imagen.trim() ? evento.imagen.trim() : 'https://via.placeholder.com/1200x400?text=Sin+imagen';
                imgEl.src = src;
                imgEl.alt = evento.titulo || 'Imagen del evento';
                imgEl.onerror = function() { this.onerror = null; this.src = 'https://via.placeholder.com/1200x400?text=Sin+imagen'; };
            }

            if (window.initSubeventosDataTable) window.initSubeventosDataTable();
            if (window.loadSubeventos) await window.loadSubeventos(eventId);

            // Si venimos con editSubeventId en la URL, abrir la edición de ese subevento
            const params = new URLSearchParams(window.location.search);
            const editId = params.get('editSubeventId');
            if (editId) setTimeout(() => { if (window.openSubeventModalForEdit) window.openSubeventModalForEdit(editId); }, 50);
        } catch (error) {
            console.error("Error loading event details:", error);
            showAlert("Error al cargar los detalles del evento.", "danger");
        }
    }

    // La carga y gestión de subeventos ahora la gestiona `subeventosController.js`

    // Las funciones y la lógica referente a "subeventos" han sido movidas a
    // `public/controllers/subeventosController.js` para mantener este archivo más pequeño.

    // ================================================
    // SHARED LOGIC & TYPE MANAGEMENT
    // ================================================

    async function loadEventTypes() {
        try {
            // Colección 'tipoSubevento' para tipos de subeventos
            const snapshot = await db.collection('tipoSubevento').orderBy('nombre').get();
            tiposCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Calcular conteos de actividades por tipo (una sola consulta a subeventos)
            try {
                const subSnap = await db.collection('subeventos').get();
                const counts = {};
                subSnap.docs.forEach(d => {
                    const data = d.data();
                    const tipoId = data.tipoEventoId;
                    if (tipoId) counts[tipoId] = (counts[tipoId] || 0) + 1;
                });
                tiposCountMap = counts;
            } catch (errCounts) {
                console.warn('No se pudo calcular conteos para tipos:', errCounts);
                tiposCountMap = {};
            }

            // Poblar selects y lista
            if (typeFilterSelect) {
                typeFilterSelect.innerHTML = `<option value="">Filtrar por tipo</option>`;
                tiposCache.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = t.nombre;
                    typeFilterSelect.appendChild(opt);
                });
            }
            if (subeventTipoSelect) {
                subeventTipoSelect.innerHTML = `<option value="">Selecciona un tipo</option>`;
                tiposCache.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = t.nombre;
                    subeventTipoSelect.appendChild(opt);
                });
            }
            renderTypesList();
        } catch (error) {
            console.error('Error loading types:', error);
        }
    }

    function renderTypesList() {
        if (!typesListContainer) return;
        typesListContainer.innerHTML = '';
        if (!tiposCache || tiposCache.length === 0) {
            typesListContainer.innerHTML = '<p class="text-muted">No hay tipos creados.</p>';
            return;
        }
        const list = document.createElement('div');
        list.className = 'list-group';
        tiposCache.forEach(t => {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            const count = tiposCountMap[t.id] || 0;
            item.innerHTML = `
                <div>${escapeHtml(t.nombre)} <span class="badge bg-secondary ms-2">${count}</span></div>
                <div>
                    <button class="btn btn-sm btn-outline-primary btn-edit-type me-2" data-id="${t.id}">Editar</button>
                    <button class="btn btn-sm btn-outline-danger btn-delete-type" data-id="${t.id}">Eliminar</button>
                </div>`;
            list.appendChild(item);
        });
        typesListContainer.appendChild(list);
    }

    async function handleTypeFormSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('type-id').value;
        const nombre = document.getElementById('type-name').value.trim();
        if (!nombre) return showAlert('El nombre del tipo no puede estar vacío.', 'warning');
        try {
                if (id) {
                await db.collection('tipoSubevento').doc(id).update({ nombre });
                showAlert('Tipo actualizado correctamente.', 'success');
            } else {
                await db.collection('tipoSubevento').add({ nombre });
                showAlert('Tipo creado correctamente.', 'success');
            }
            // Reset y recarga
            if (typeForm) typeForm.reset();
            if (manageTypesModal) manageTypesModal.hide();
            await loadEventTypes();
        } catch (error) {
            console.error('Error saving type:', error);
            showAlert('No se pudo guardar el tipo.', 'danger');
        }
    }

    async function handleDeleteType(id) {
        const tipo = tiposCache.find(t => t.id === id);
        if (!tipo) return;
        // Comprobar si existen subeventos asociados a este tipo
        try {
            const snap = await db.collection('subeventos').where('tipoEventoId', '==', id).get();
            const count = snap.size || 0;
            if (count > 0) {
                showAlert(`No se puede eliminar este tipo porque ${count} actividad(es) lo usan.`, 'warning');
                return;
            }
        } catch (error) {
            console.error('Error comprobando subeventos para tipo:', error);
            showAlert('Error al comprobar uso del tipo. Intenta de nuevo.', 'danger');
            return;
        }

        itemToDeleteId = id;
        itemToDeleteType = 'tipo';
        document.getElementById('confirm-modal-body').textContent = `¿Estás seguro de que deseas eliminar el tipo "${tipo.nombre}"?`;
        if (confirmModal) showModalOnTop(confirmModal, confirmModalElement);
    }

    // ================================================
    // UI, VISIBILITY & LISTENERS
    // ================================================

    function updateUIVisibility() {
        const isAdmin = userRole === 'admin';
        const isSocio = userRole === 'socio';

        document.querySelectorAll('.admin-controls').forEach(c => c.style.display = isAdmin ? 'revert' : 'none');
        document.querySelectorAll('.socio-controls').forEach(c => c.style.display = (isAdmin || isSocio) ? 'revert' : 'none');
        document.querySelectorAll('.admin-only').forEach(c => c.style.display = isAdmin ? 'block' : 'none');
    }
    
    function switchView(view) {
        $('#eventos-gallery-container, #eventos-table-container').hide();
        $(`#eventos-${view}-container`).show();
        $('#view-gallery-btn, #view-table-btn').removeClass('active');
        $(`#view-${view}-btn`).addClass('active');
        if (view === 'table' && eventosDataTable) {
            eventosDataTable.responsive.recalc();
        }
    }
    
    function showAlert(message, type = 'info', duration = 5000) { 
        const container = document.getElementById('alert-container');
        if (!container) return;
        const alertId = `alert-${Date.now()}`;
        const alert = document.createElement('div');
        alert.id = alertId;
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.role = 'alert';
        alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
        container.appendChild(alert);
        setTimeout(() => {
            const activeAlert = document.getElementById(alertId);
            if (activeAlert) {
                new bootstrap.Alert(activeAlert).close();
            }
        }, duration);
     }

    function showRetryAlert(message) {
        const container = document.getElementById('alert-container');
        if (!container) return;
        // eliminar previo
        const prev = document.getElementById('retry-alert');
        if (prev) prev.remove();
        const alert = document.createElement('div');
        alert.id = 'retry-alert';
        alert.className = `alert alert-warning alert-dismissible fade show`;
        alert.role = 'alert';
        alert.innerHTML = `${escapeHtml(message)} <button type="button" id="retry-load-subevent" class="btn btn-sm btn-primary ms-2">Reintentar</button> <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
        container.appendChild(alert);
        // Attach click
        setTimeout(() => {
            const btn = document.getElementById('retry-load-subevent');
            if (btn) btn.addEventListener('click', () => {
                // eliminar alerta y reintentar
                const existing = document.getElementById('retry-alert');
                if (existing) existing.remove();
                try { if (window.loadSubeventDetails) window.loadSubeventDetails(); } catch(e) { console.error('Error reintentando loadSubeventDetails:', e); }
            });
        }, 50);
    }

    // Exponer helpers para otros controladores (p.ej. subeventosController)
    window.showAlert = showAlert;
    window.showRetryAlert = showRetryAlert;
    window.renderTypesList = () => { try { return renderTypesList(); } catch(e) { console.warn('renderTypesList no disponible aún', e); } };
    window.escapeHtml = (typeof escapeHtml === 'function') ? escapeHtml : (s => s);

    // --- GLOBAL EVENT LISTENERS ---
    $(document).off('click submit change');

    $(document).on('click', (e) => {
        const target = $(e.target).closest('button, a');
        if (!target.length) return;

        // Main Events Page
        if (target.is('#create-event-btn')) {
             if (eventForm) eventForm.reset();
            $('#event-id').val('');
            $('#event-modal-title').text('Crear Nuevo Evento');
            // Asegurar que la UI del checkbox de 'continuo' esté en estado inicial
            try { if (document.getElementById('event-continuo')) document.getElementById('event-continuo').checked = false; } catch(e){}
            try { toggleEventContinuoUI(); } catch(e){}
            if(eventModal) eventModal.show();
        }
        if (target.is('#manage-types-btn')) if(manageTypesModal) manageTypesModal.show();
        if (target.is('.btn-edit-event')) openEventModalForEdit(target.data('id'));
        if (target.is('.btn-delete-event')) handleDeleteEvent(target.data('id'));
        if (target.is('#view-gallery-btn')) switchView('gallery');
        if (target.is('#view-table-btn')) switchView('table');
        if (target.is('.btn-delete-type')) handleDeleteType(target.data('id'));
        if (target.is('.btn-edit-type')) {
            const id = target.data('id');
            const tipo = tiposCache.find(t => t.id === id);
            if (tipo) {
                document.getElementById('type-id').value = tipo.id;
                document.getElementById('type-name').value = tipo.nombre;
                if (manageTypesModal) manageTypesModal.show();
            }
        }
        
        // Detail Page
        if (target.is('#create-subevent-btn')) { if (window.openSubeventModalForCreate) window.openSubeventModalForCreate(); }
        if (target.is('.btn-edit-subevent')) {
            const sid = target.data('id');
            if (subeventModal) {
                if (window.openSubeventModalForEdit) window.openSubeventModalForEdit(sid);
            } else {
                // Redirigir al detalle del evento padre y abrir edición allí
                const sub = (window._subeventosCache ? window._subeventosCache() : (typeof subeventosCache !== 'undefined' ? subeventosCache : [])).find(s => s.id === sid);
                const parentId = sub ? sub.eventoId : null;
                if (parentId) {
                    window.location.href = `eventoDetalle.html?id=${parentId}&editSubeventId=${sid}`;
                } else {
                    // Si no lo tenemos en cache, obtener el documento desde Firestore y redirigir usando su eventoId
                    db.collection('subeventos').doc(sid).get()
                        .then(doc => {
                            const pid = doc.exists ? (doc.data().eventoId || '') : '';
                            window.location.href = `eventoDetalle.html?id=${pid}&editSubeventId=${sid}`;
                        })
                        .catch(err => {
                            console.error('Error fetching subevento parent for redirect:', err);
                            showAlert('No se pudo localizar la actividad para editarla. Intenta de nuevo.', 'danger');
                        });
                }
            }
        }
        if (target.is('.btn-delete-subevent')) { if (window.handleDeleteSubevent) window.handleDeleteSubevent(target.data('id')); }
        
        // Confirmation Modal
        if (target.is('#confirm-modal-btn')) {
            if (!itemToDeleteId || !itemToDeleteType) return;

            let collectionName = 'subeventos';
            if (itemToDeleteType === 'evento') collectionName = 'eventos';
            else if (itemToDeleteType === 'tipo') collectionName = 'tipoSubevento';

            db.collection(collectionName).doc(itemToDeleteId).delete()
                .then(() => {
                    showAlert(`${itemToDeleteType.charAt(0).toUpperCase() + itemToDeleteType.slice(1)} eliminado con éxito.`, 'success');
                            if (itemToDeleteType === 'evento') {
                                loadEvents();
                            } else if (itemToDeleteType === 'subevento') {
                                const eventId = new URLSearchParams(window.location.search).get('id');
                                if (window.loadSubeventos) window.loadSubeventos(eventId);
                            } else if (itemToDeleteType === 'tipo') {
                                loadEventTypes();
                            }
                })
                .catch(error => {
                    console.error(`Error deleting ${itemToDeleteType}: `, error);
                    showAlert(`No se pudo eliminar el ${itemToDeleteType}.`, 'danger');
                })
                .finally(() => {
                    if(confirmModal) confirmModal.hide();
                    itemToDeleteId = null;
                    itemToDeleteType = null;
                });
        }
    });
    
    $(document).on('submit', (e) => {
        const form = $(e.target);
        if (form.is('#event-form')) handleEventFormSubmit(e);
        if (form.is('#type-form')) handleTypeFormSubmit(e);
        // El envío de '#subevent-form' lo gestiona `subeventosController.js`.
    });

    $(document).on('change', '#type-filter', function() {
        // Filtrar la vista de eventos por tipo seleccionado
        renderViews();
        if (eventosDataTable) eventosDataTable.responsive.recalc();
    });

    $(document).on('input', '#search-input', function() {
        // Búsqueda por título/descripcion
        renderViews();
        if (eventosDataTable) eventosDataTable.responsive.recalc();
    });

    $(document).on('change', '#event-continuo', function() {
        try { toggleEventContinuoUI(); } catch (e) { /* noop */ }
    });

    // Checkboxes para mostrar eventos / actividades
    $(document).on('change', '#filter-show-events, #filter-show-activities', function() {
        renderViews();
        if (eventosDataTable) eventosDataTable.responsive.recalc();
    });

});
