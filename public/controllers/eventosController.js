document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    // --- STATE ---
    let userRole = 'viewer';
    let eventosCache = [];
    let tiposCache = [];
    let eventModal, confirmModal, manageTypesModal, eventosDataTable;

    // --- UI ELEMENTS ---
    const eventModalElement = document.getElementById('event-modal');
    const confirmModalElement = document.getElementById('confirm-modal');
    const manageTypesModalElement = document.getElementById('manage-types-modal');
    const eventForm = document.getElementById('event-form');
    const typeForm = document.getElementById('type-form');
    const typesListContainer = document.getElementById('types-list-container');
    const typeFilterSelect = document.getElementById('type-filter');
    const eventTypeSelect = document.getElementById('event-tipo');
    const eventosGallery = document.getElementById('eventos-gallery');
    
    // --- INITIALIZATION ---
    if (eventModalElement) eventModal = new bootstrap.Modal(eventModalElement);
    if (confirmModalElement) confirmModal = new bootstrap.Modal(confirmModalElement);
    if (manageTypesModalElement) manageTypesModal = new bootstrap.Modal(manageTypesModalElement);

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            const userDoc = await db.collection('usuarios').doc(user.uid).get();
            userRole = userDoc.exists && userDoc.data().isAdmin ? 'admin' : 'viewer';
        } else {
            userRole = 'viewer';
        }
        initPage();
    });

    function initPage() {
        // Si estamos en la página de detalles, ejecutamos una lógica diferente
        if (window.location.pathname.includes('eventoDetalle.html')) {
            loadEventDetails();
        } else {
            updateUIVisibility();
            initDataTable();
            loadEventTypes();
            loadEvents();
        }
    }

    // --- DATA FETCHING (LIST PAGE) ---
    async function loadEvents() {
        try {
            const snapshot = await db.collection('eventos').orderBy('fecha', 'desc').get();
            eventosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderViews();
        } catch (error) {
            console.error("Error cargando eventos:", error);
            showAlert("Error al cargar eventos.", "danger");
        }
    }

    async function loadEventTypes() {
        try {
            const snapshot = await db.collection('tipoSubevento').orderBy('nombre').get();
            tiposCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            if (typeFilterSelect) {
                const currentFilterValue = typeFilterSelect.value;
                typeFilterSelect.innerHTML = '<option value="">Todos</option>';
                tiposCache.forEach(tipo => typeFilterSelect.add(new Option(tipo.nombre, tipo.nombre)));
                typeFilterSelect.value = currentFilterValue;
            }

            if (eventTypeSelect) {
                const currentTypeValue = eventTypeSelect.value;
                eventTypeSelect.innerHTML = '<option value="" disabled selected>Seleccione un tipo</option>';
                tiposCache.forEach(tipo => eventTypeSelect.add(new Option(tipo.nombre, tipo.nombre)));
                eventTypeSelect.value = currentTypeValue;
            }

            renderTypesList(); 
        } catch (error) {
            console.error("Error cargando tipos de evento:", error);
        }
    }

    function initDataTable() {
        if ($.fn.DataTable.isDataTable('#eventos-table')) {
            eventosDataTable = $('#eventos-table').DataTable();
        } else {
            eventosDataTable = $('#eventos-table').DataTable({
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
                pageLength: 10,
                data: [],
                columns: [
                    { data: 'titulo', title: 'Título' },
                    {
                        data: null,
                        title: 'Fecha y Hora',
                        render: (data) => {
                            const fecha = new Date(data.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            return `${fecha} ${data.hora}`;
                        }
                    },
                    { data: 'lugar', title: 'Lugar' },
                    {
                        data: 'id',
                        title: 'Acciones',
                        orderable: false, 
                        searchable: false, 
                        className: 'text-center',
                        render: (id) => `
                            <a href="eventoDetalle.html?id=${id}" class="btn btn-sm btn-info" title="Ver Detalles"><i class="fas fa-eye"></i></a>
                            <button class="btn btn-sm btn-outline-primary btn-edit-event admin-controls" data-id="${id}" title="Editar"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-outline-danger btn-delete-event admin-controls" data-id="${id}" title="Eliminar"><i class="fas fa-trash"></i></button>
                        `
                    }
                ]
            });
        }
    }

    // --- UI RENDERING (LIST PAGE) ---
    function renderViews() {
        renderGallery();
        eventosDataTable.clear().rows.add(eventosCache).draw();
        updateUIVisibility();
    }

    function renderGallery() {
        if (!eventosGallery) return;
        eventosGallery.innerHTML = '';
        if (eventosCache.length === 0) {
            eventosGallery.innerHTML = '<div class="col-12"><p class="text-center text-muted">No hay eventos creados.</p></div>';
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
        updateUIVisibility();
    }

    // --- EVENTOS DETALLE PAGE LOGIC ---
    async function loadEventDetails() {
        const params = new URLSearchParams(window.location.search);
        const eventId = params.get('id');
        if (!eventId) {
            document.querySelector('main').innerHTML = '<div class="alert alert-danger">No se ha especificado un ID de evento.</div>';
            return;
        }

        try {
            const eventDoc = await db.collection('eventos').doc(eventId).get();
            if (!eventDoc.exists) {
                document.querySelector('main').innerHTML = '<div class="alert alert-danger">Evento no encontrado.</div>';
                return;
            }
            const evento = eventDoc.data();

            // Rellenar detalles del evento
            document.getElementById('event-detail-title').textContent = evento.titulo;
            document.getElementById('event-detail-description').textContent = evento.descripcion;
            document.getElementById('event-detail-image').src = evento.imagen || 'https://via.placeholder.com/800x400';
            const fecha = new Date(evento.fecha + 'T00:00:00').toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
            document.getElementById('event-detail-date').textContent = `Fecha: ${fecha} a las ${evento.hora}`;
            document.getElementById('event-detail-place').textContent = `Lugar: ${evento.lugar}`;

            // Inicializar DataTable para subeventos (vacía por ahora)
            $('#subeventos-table').DataTable({
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
                data: [],
                columns: [
                    { title: 'Nombre' },
                    { title: 'Tipo' },
                    { title: 'Inscritos' },
                    { title: 'Acciones' }
                ]
            });

        } catch (error) {
            console.error("Error al cargar los detalles del evento:", error);
            showAlert("Error cargando los detalles del evento.", "danger");
        }
    }
    
    // --- MODAL & CRUD (LIST PAGE) ---
    function openEventModalForCreate() { /* ... */ }
    function openEventModalForEdit(id) { /* ... */ }
    async function handleEventFormSubmit(e) { /* ... */ }
    function handleDeleteEvent(id) { /* ... */ }
    function openManageTypesModal() { /* ... */ }
    function renderTypesList() { /* ... */ }
    async function handleTypeFormSubmit(e) { /* ... */ }
    async function handleDeleteType(id) { /* ... */ }

    // --- ADMIN & GENERAL UI ---
    function updateUIVisibility() {
        const isAdmin = userRole === 'admin';
        // Usamos 'inline-block' para los botones que están en línea
        document.querySelectorAll('.admin-controls').forEach(c => {
            c.style.display = isAdmin ? 'inline-block' : 'none';
        });
        // Usamos 'block' para elementos más grandes
        document.querySelectorAll('.admin-only').forEach(c => {
            c.style.display = isAdmin ? 'block' : 'none';
        });
    }

    function switchView(view) {
        $('#eventos-gallery-container, #eventos-table-container').hide();
        $(`#eventos-${view}-container`).show();
        $('#view-gallery-btn, #view-table-btn').removeClass('active');
        $(`#view-${view}-btn`).addClass('active');
    }
    
    function showAlert(message, type = 'info', duration = 5000) {
        const container = document.getElementById('alert-container');
        if (!container) return;
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.role = 'alert';
        alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
        container.appendChild(alert);
        setTimeout(() => new bootstrap.Alert(alert).close(), duration);
    }

    // --- GLOBAL EVENT LISTENERS ---
    if (!window.location.pathname.includes('eventoDetalle.html')) {
        $('body').off()
            .on('click', '#create-event-btn', openEventModalForCreate)
            .on('click', '#manage-types-btn', openManageTypesModal)
            .on('click', '.btn-edit-event', e => openEventModalForEdit(e.currentTarget.dataset.id))
            .on('click', '.btn-delete-event', e => handleDeleteEvent(e.currentTarget.dataset.id))
            .on('submit', '#event-form', handleEventFormSubmit)
            .on('click', '#view-gallery-btn', () => switchView('gallery'))
            .on('click', '#view-table-btn', () => switchView('table'))
            .on('submit', '#type-form', handleTypeFormSubmit)
            .on('click', '.btn-delete-type', e => handleDeleteType(e.currentTarget.dataset.id));
    }
});