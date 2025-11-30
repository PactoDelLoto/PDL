document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    // --- STATE ---
    let userRole = 'viewer'; // viewer, socio, admin
    let currentUser = null;
    let eventosCache = [];
    let tiposCache = [];
    let subeventosCache = [];
    let itemToDeleteId = null;
    let itemToDeleteType = null; // 'evento' or 'subevento'

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

    // --- DATATABLES ---
    let eventosDataTable, subeventosDataTable;

    // --- INITIALIZATION ---
    if (eventModalElement) eventModal = new bootstrap.Modal(eventModalElement);
    if (confirmModalElement) confirmModal = new bootstrap.Modal(confirmModalElement);
    if (manageTypesModalElement) manageTypesModal = new bootstrap.Modal(manageTypesModalElement);
    if (subeventModalElement) subeventModal = new bootstrap.Modal(subeventModalElement);

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

        if (path.includes('eventoDetalle.html')) {
            loadEventDetails();
        } else if (path.includes('eventos.html')) {
            initDataTable();
            loadEvents();
        }
        updateUIVisibility(); // Initial call for non-datatable elements
    }

    // ================================================
    // EVENT LISTING PAGE (eventos.html)
    // ================================================

    async function loadEvents() {
        try {
            const snapshot = await db.collection('eventos').orderBy('fecha', 'desc').get();
            eventosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
                { data: 'titulo', title: 'Título' },
                {
                    data: null, title: 'Fecha y Hora',
                    render: (data) => {
                        const fecha = new Date(data.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                        return `${fecha} ${data.hora}`;
                    }
                },
                { data: 'lugar', title: 'Lugar' },
                {
                    data: 'id', title: 'Acciones',
                    orderable: false, searchable: false, className: 'text-center',
                    render: (id) => `
                        <a href="eventoDetalle.html?id=${id}" class="btn btn-sm btn-info" title="Ver Detalles"><i class="fas fa-eye"></i></a>
                        <button class="btn btn-sm btn-outline-primary btn-edit-event admin-controls" data-id="${id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-outline-danger btn-delete-event admin-controls" data-id="${id}" title="Eliminar"><i class="fas fa-trash"></i></button>
                    `
                }
            ],
            drawCallback: function(settings) {
                // This is the key fix: run visibility update AFTER the table is drawn.
                updateUIVisibility();
            }
        });
    }

    function renderViews() {
        renderGallery();
        if(eventosDataTable) {
            eventosDataTable.clear().rows.add(eventosCache).draw();
        }
    }

    function renderGallery() {
        if (!eventosGallery) return;
        eventosGallery.innerHTML = '';
        if (eventosCache.length === 0) {
            eventosGallery.innerHTML = '<div class="col-12"><p class="text-center text-muted">No hay eventos para mostrar.</p></div>';
            return;
        }
        eventosCache.forEach(evento => {
            const col = document.createElement('div');
            col.className = 'col-lg-4 col-md-6 mb-4';
            const fecha = new Date(evento.fecha + 'T00:00:00').toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
            col.innerHTML = `
                <div class="card h-100 shadow-sm">
                    <img src="${evento.imagen || 'https://via.placeholder.com/400x250'}" class="card-img-top">
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title">${evento.titulo}</h5>
                        <p class="card-text text-muted small">${fecha} a las ${evento.hora}</p>
                        <p class="card-text flex-grow-1">${evento.descripcion.substring(0, 100)}...</p>
                        <div class="mt-auto d-flex justify-content-between align-items-center">
                            <a href="eventoDetalle.html?id=${evento.id}" class="btn btn-outline-info btn-sm"><i class="fas fa-eye"></i> Ver Detalles</a>
                            <div class="admin-controls">
                                <button class="btn btn-sm btn-outline-primary btn-edit-event" data-id="${evento.id}" title="Editar"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-sm btn-outline-danger btn-delete-event" data-id="${evento.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                    </div>
                </div>`;
            eventosGallery.appendChild(col);
        });
        updateUIVisibility(); // Update for gallery view
    }
    
    function openEventModalForEdit(id) {
        const evento = eventosCache.find(e => e.id === id);
        if (evento && eventForm) {
            eventForm.reset();
            document.getElementById('event-id').value = id;
            document.getElementById('event-modal-title').textContent = 'Editar Evento';
            document.getElementById('event-titulo').value = evento.titulo;
            document.getElementById('event-fecha').value = evento.fecha;
            document.getElementById('event-hora').value = evento.hora;
            document.getElementById('event-lugar').value = evento.lugar;
            document.getElementById('event-descripcion').value = evento.descripcion;
            document.getElementById('event-imagen').value = evento.imagen;
            if(eventModal) eventModal.show();
        }
    }

    async function handleEventFormSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('event-id').value;
        const eventoData = {
            titulo: document.getElementById('event-titulo').value,
            descripcion: document.getElementById('event-descripcion').value,
            fecha: document.getElementById('event-fecha').value,
            hora: document.getElementById('event-hora').value,
            lugar: document.getElementById('event-lugar').value,
            imagen: document.getElementById('event-imagen').value,
        };
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
        if(confirmModal) confirmModal.show();
    }

    // ================================================
    // EVENT DETAIL PAGE (eventoDetalle.html)
    // ================================================

    async function loadEventDetails() {
        const eventId = new URLSearchParams(window.location.search).get('id');
        if (!eventId) {
            document.querySelector('main').innerHTML = '<div class="alert alert-danger">ID de evento no especificado.</div>';
            return;
        }
        try {
            const eventDoc = await db.collection('eventos').doc(eventId).get();
            if (!eventDoc.exists) {
                document.querySelector('main').innerHTML = '<div class="alert alert-danger">Evento no encontrado.</div>';
                return;
            }
            const evento = eventDoc.data();
            document.getElementById('event-detail-title').textContent = evento.titulo;
            document.getElementById('event-detail-description').textContent = evento.descripcion;
            document.getElementById('event-detail-image').src = evento.imagen || 'https://via.placeholder.com/800x400';
            const fecha = new Date(evento.fecha + 'T00:00:00').toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
            document.getElementById('event-detail-date').innerHTML = `<i class="fas fa-calendar-alt"></i> ${fecha} a las ${evento.hora}`;
            document.getElementById('event-detail-place').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${evento.lugar}`;
            initSubeventosDataTable();
            loadSubeventos(eventId);
        } catch (error) {
            console.error("Error loading event details:", error);
            showAlert("Error al cargar los detalles del evento.", "danger");
        }
    }

    async function loadSubeventos(eventId) {
        const now = firebase.firestore.Timestamp.now();
        let query = db.collection('subeventos').where('eventoId', '==', eventId);
        if (userRole === 'viewer') {
            query = query.where('fechaPublicacion', '<=', now);
        }
        try {
            const snapshot = await query.get();
            subeventosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), fechaPublicacion: doc.data().fechaPublicacion.toDate() }));
            if (subeventosDataTable) {
                subeventosDataTable.clear().rows.add(subeventosCache).draw();
            }
        } catch(error) {
            console.error("Error loading subevents: ", error);
        }
    }

    function initSubeventosDataTable() {
        if ($.fn.DataTable.isDataTable('#subeventos-table')) return;
        subeventosDataTable = $('#subeventos-table').DataTable({
            language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
            responsive: true, data: [],
            columns: [
                { data: 'titulo', title: 'Nombre' },
                { 
                    data: 'tipoEventoId', 
                    title: 'Tipo', 
                    render: (tipoId) => tiposCache.find(t => t.id === tipoId)?.nombre || 'Desconocido'
                },
                {
                    data: null, title: 'Plazas',
                    render: data => data.plazas > 0 ? `${data.plazasOcupadas || 0} / ${data.plazas}` : 'Entrada libre'
                },
                {
                    data: 'id', title: 'Acciones',
                    orderable: false, searchable: false, className: 'text-center',
                    render: (id, type, row) => {
                        let buttons = '';
                        if (userRole === 'admin' || (currentUser && row.creador === currentUser.uid)) {
                            buttons += `<button class="btn btn-sm btn-outline-primary btn-edit-subevent" data-id="${id}"><i class="fas fa-edit"></i></button> `;
                            buttons += `<button class="btn btn-sm btn-outline-danger btn-delete-subevent" data-id="${id}"><i class="fas fa-trash"></i></button>`;
                        }
                        return buttons;
                    }
                }
            ],
            drawCallback: function(settings) {
                updateUIVisibility();
            }
        });
    }

    function openSubeventModalForCreate() {
        if (subeventForm) subeventForm.reset();
        document.getElementById('subevent-id').value = '';
        document.getElementById('subevent-modal-title').textContent = 'Crear Nuevo Subevento';
        if (subeventModal) subeventModal.show();
    }

    function openSubeventModalForEdit(id) {
        const subevento = subeventosCache.find(s => s.id === id);
        if (subevento && subeventForm) {
            subeventForm.reset();
            document.getElementById('subevent-id').value = id;
            document.getElementById('subevent-modal-title').textContent = 'Editar Subevento';

            document.getElementById('subevent-titulo').value = subevento.titulo;
            document.getElementById('subevent-descripcion').value = subevento.descripcion;
            document.getElementById('subevent-tipo').value = subevento.tipoEventoId;
            document.getElementById('subevent-plazas').value = subevento.plazas;
            document.getElementById('subevent-fechaEvento').value = subevento.fechaEvento;
            document.getElementById('subevent-horaEvento').value = subevento.horaEvento;
            document.getElementById('subevent-lugar').value = subevento.lugar;
            document.getElementById('subevent-imagen').value = subevento.imagen;
            
            const d = new Date(subevento.fechaPublicacion);
            const dateString = new Date(d.getTime() - (d.getTimezoneOffset() * 60000 )).toISOString().slice(0, 16);
            document.getElementById('subevent-fechaPublicacion').value = dateString;

            if(subeventModal) subeventModal.show();
        }
    }

    async function handleSubeventFormSubmit(e) {
        e.preventDefault();
        if (!currentUser) return showAlert('Debes iniciar sesión para esta acción.', 'danger');
        
        const eventId = new URLSearchParams(window.location.search).get('id');
        const subeventId = document.getElementById('subevent-id').value;
        const publicacionVal = document.getElementById('subevent-fechaPublicacion').value;
        const fechaPublicacion = firebase.firestore.Timestamp.fromDate(new Date(publicacionVal));

        const subeventoData = {
            titulo: document.getElementById('subevent-titulo').value,
            descripcion: document.getElementById('subevent-descripcion').value,
            tipoEventoId: document.getElementById('subevent-tipo').value,
            eventoId: eventId,
            imagen: document.getElementById('subevent-imagen').value,
            fechaEvento: document.getElementById('subevent-fechaEvento').value,
            horaEvento: document.getElementById('subevent-horaEvento').value,
            fechaPublicacion: fechaPublicacion,
            lugar: document.getElementById('subevent-lugar').value,
            plazas: parseInt(document.getElementById('subevent-plazas').value, 10),
        };

        try {
            if (subeventId) {
                await db.collection('subeventos').doc(subeventId).update(subeventoData);
                showAlert('Subevento actualizado con éxito', 'success');
            } else {
                subeventoData.creador = currentUser.uid;
                subeventoData.plazasOcupadas = 0;
                await db.collection('subeventos').add(subeventoData);
                showAlert('Subevento creado con éxito', 'success');
            }
            if (subeventModal) subeventModal.hide();
            loadSubeventos(eventId);
        } catch (error) {
            console.error('Error saving subevent: ', error);
            showAlert('Error al guardar el subevento.', 'danger');
        }
    }

    function handleDeleteSubevent(id) {
        const subeventToDelete = subeventosCache.find(e => e.id === id);
        if (!subeventToDelete) return;
        itemToDeleteId = id;
        itemToDeleteType = 'subevento';
        document.getElementById('confirm-modal-body').textContent = `¿Estás seguro de que quieres eliminar el subevento "${subeventToDelete.titulo}"?`;
        if(confirmModal) confirmModal.show();
    }

    // ================================================
    // SHARED LOGIC & TYPE MANAGEMENT
    // ================================================

    async function loadEventTypes() { /* ... existing code ... */ }
    function renderTypesList() { /* ... existing code ... */ }
    async function handleTypeFormSubmit(e) { /* ... existing code ... */ }
    function handleDeleteType(id) { /* ... existing code ... */ }

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
            if(eventModal) eventModal.show();
        }
        if (target.is('#manage-types-btn')) if(manageTypesModal) manageTypesModal.show();
        if (target.is('.btn-edit-event')) openEventModalForEdit(target.data('id'));
        if (target.is('.btn-delete-event')) handleDeleteEvent(target.data('id'));
        if (target.is('#view-gallery-btn')) switchView('gallery');
        if (target.is('#view-table-btn')) switchView('table');
        if (target.is('.btn-delete-type')) handleDeleteType(target.data('id'));
        
        // Detail Page
        if (target.is('#create-subevent-btn')) openSubeventModalForCreate();
        if (target.is('.btn-edit-subevent')) openSubeventModalForEdit(target.data('id'));
        if (target.is('.btn-delete-subevent')) handleDeleteSubevent(target.data('id'));
        
        // Confirmation Modal
        if (target.is('#confirm-delete-btn')) {
            if (!itemToDeleteId || !itemToDeleteType) return;

            let collectionName = itemToDeleteType === 'evento' ? 'eventos' : 'subeventos';

            db.collection(collectionName).doc(itemToDeleteId).delete()
                .then(() => {
                    showAlert(`${itemToDeleteType.charAt(0).toUpperCase() + itemToDeleteType.slice(1)} eliminado con éxito.`, 'success');
                    if (itemToDeleteType === 'evento') {
                        loadEvents();
                    } else {
                        const eventId = new URLSearchParams(window.location.search).get('id');
                        loadSubeventos(eventId);
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
        if (form.is('#subevent-form')) handleSubeventFormSubmit(e);
    });

    $(document).on('change', '#type-filter', function() {
        // This requires the main events to have a type field.
    });

});
