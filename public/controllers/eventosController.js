document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    // --- STATE ---
    let userRole = 'viewer'; // viewer, socio, admin
    let currentUser = null;
    let eventosCache = [];
    let tiposCache = [];
    let subeventosCache = [];

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
        loadEventTypes(); // Cargar tipos es común para ambas páginas

        if (path.includes('eventoDetalle.html')) {
            loadEventDetails();
        } else if (path.includes('eventos.html')) {
            initDataTable();
            loadEvents();
        }
        updateUIVisibility();
    }

    // ================================================
    // PÁGINA LISTADO DE EVENTOS (eventos.html)
    // ================================================

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

    // ================================================
    // PÁGINA DETALLE DE EVENTO (eventoDetalle.html)
    // ================================================

    async function loadEventDetails() {
        const eventId = new URLSearchParams(window.location.search).get('id');
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

            document.getElementById('event-detail-title').textContent = evento.titulo;
            document.getElementById('event-detail-description').textContent = evento.descripcion;
            document.getElementById('event-detail-image').src = evento.imagen || 'https://via.placeholder.com/800x400';
            const fecha = new Date(evento.fecha + 'T00:00:00').toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
            document.getElementById('event-detail-date').textContent = `Fecha: ${fecha} a las ${evento.hora}`;
            document.getElementById('event-detail-place').textContent = `Lugar: ${evento.lugar}`;

            initSubeventosDataTable();
            loadSubeventos(eventId);
        } catch (error) {
            console.error("Error cargando los detalles del evento:", error);
            showAlert("Error cargando los detalles del evento.", "danger");
        }
    }

    async function loadSubeventos(eventId) {
        const now = firebase.firestore.Timestamp.now();
        let query = db.collection('subeventos').where('eventoId', '==', eventId);
        if (userRole !== 'admin') {
            query = query.where('fechaPublicacion', '<', now);
        }

        try {
            const snapshot = await query.get();
            subeventosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (subeventosDataTable) {
                subeventosDataTable.clear().rows.add(subeventosCache).draw();
            }
            updateUIVisibility();
        } catch(error) {
            console.error("Error cargando subeventos: ", error);
        }
    }

    function initSubeventosDataTable() {
        if ($.fn.DataTable.isDataTable('#subeventos-table')) {
            subeventosDataTable = $('#subeventos-table').DataTable();
        } else {
            subeventosDataTable = $('#subeventos-table').DataTable({
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
                data: [],
                columns: [
                    { data: 'titulo', title: 'Nombre' },
                    { 
                        data: 'tipoEventoId', 
                        title: 'Tipo', 
                        render: (tipoId) => tiposCache.find(t => t.id === tipoId)?.nombre || 'Desconocido'
                    },
                    {
                        data: null,
                        title: 'Plazas',
                        render: data => data.plazas > 0 ? `${data.plazasOcupadas || 0} / ${data.plazas}` : 'Entrada libre'
                    },
                    {
                        data: 'id',
                        title: 'Acciones',
                        orderable: false, 
                        searchable: false,
                        className: 'text-center',
                        render: (id, type, row) => {
                            let buttons = '';
                            if (userRole === 'admin' || (currentUser && row.creador === currentUser.uid)) {
                                buttons += `<button class="btn btn-sm btn-outline-primary btn-edit-subevent" data-id="${id}"><i class="fas fa-edit"></i></button> `;
                                buttons += `<button class="btn btn-sm btn-outline-danger btn-delete-subevent" data-id="${id}"><i class="fas fa-trash"></i></button>`;
                            }
                            return buttons;
                        }
                    }
                ]
            });
        }
    }

    function openSubeventModalForCreate() {
        if (subeventForm) subeventForm.reset();
        document.getElementById('subevent-id').value = '';
        document.getElementById('subevent-modal-title').textContent = 'Crear Nuevo Subevento';
        if (subeventModal) subeventModal.show();
    }

    async function handleSubeventFormSubmit(e) {
        e.preventDefault();
        if (!currentUser) return showAlert('Debes iniciar sesión para crear un subevento', 'danger');
        
        const eventId = new URLSearchParams(window.location.search).get('id');
        const subeventId = document.getElementById('subevent-id').value;
        
        const publicacionVal = document.getElementById('subevent-fechaPublicacion').value;
        const fechaPublicacion = firebase.firestore.Timestamp.fromDate(new Date(publicacionVal));

        const subeventoData = {
            titulo: document.getElementById('subevent-titulo').value,
            descripcion: document.getElementById('subevent-descripcion').value,
            tipoEventoId: document.getElementById('subevent-tipo').value,
            eventoId: eventId,
            creador: currentUser.uid,
            imagen: document.getElementById('subevent-imagen').value,
            fechaEvento: document.getElementById('subevent-fechaEvento').value,
            horaEvento: document.getElementById('subevent-horaEvento').value,
            fechaPublicacion: fechaPublicacion,
            lugar: document.getElementById('subevent-lugar').value,
            plazas: parseInt(document.getElementById('subevent-plazas').value, 10),
            plazasOcupadas: 0, // Se gestionará en las inscripciones
        };

        try {
            if (subeventId) {
                await db.collection('subeventos').doc(subeventId).update(subeventoData);
                 showAlert('Subevento actualizado con éxito', 'success');
            } else {
                await db.collection('subeventos').add(subeventoData);
                showAlert('Subevento creado con éxito', 'success');
            }
            if (subeventModal) subeventModal.hide();
            loadSubeventos(eventId);
        } catch (error) {
            console.error('Error al guardar subevento: ', error);
            showAlert('Error al guardar el subevento', 'danger');
        }
    }


    // ================================================
    // LÓGICA COMPARTIDA Y DE TIPOS
    // ================================================

    async function loadEventTypes() {
        try {
            const snapshot = await db.collection('tipoSubevento').orderBy('nombre').get();
            tiposCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Para el filtro en eventos.html
            if (typeFilterSelect) {
                typeFilterSelect.innerHTML = '<option value="">Todos</option>';
                tiposCache.forEach(tipo => typeFilterSelect.add(new Option(tipo.nombre, tipo.nombre)));
            }

            // Para el modal de creación/edición de evento principal
            if (eventTypeSelect) {
                eventTypeSelect.innerHTML = '<option value="" disabled selected>Seleccione un tipo</option>';
                tiposCache.forEach(tipo => eventTypeSelect.add(new Option(tipo.nombre, tipo.nombre)));
            }
            
            // Para el modal de creación/edición de subevento
            if (subeventTipoSelect) {
                subeventTipoSelect.innerHTML = '<option value="" disabled selected>Seleccione un tipo...</option>';
                tiposCache.forEach(tipo => {
                    subeventTipoSelect.add(new Option(tipo.nombre, tipo.id));
                });
            }

            renderTypesList(); 
        } catch (error) {
            console.error("Error cargando tipos de evento:", error);
        }
    }
    
    function renderTypesList() {
        if (!typesListContainer) return;
        typesListContainer.innerHTML = '';
        tiposCache.forEach(tipo => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.textContent = tipo.nombre;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-outline-danger btn-delete-type';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.dataset.id = tipo.id;
            li.appendChild(deleteBtn);
            typesListContainer.appendChild(li);
        });
    }

    // ...Aquí irían las funciones de CRUD para tipos y eventos que faltan

    // ================================================
    // UI, VISIBILIDAD Y LISTENERS
    // ================================================

    function updateUIVisibility() {
        const isAdmin = userRole === 'admin';
        const isSocio = userRole === 'socio';

        document.querySelectorAll('.admin-controls').forEach(c => c.style.display = isAdmin ? 'revert' : 'none');
        document.querySelectorAll('.socio-controls').forEach(c => c.style.display = (isAdmin || isSocio) ? 'revert' : 'none');
        document.querySelectorAll('.admin-only').forEach(c => c.style.display = isAdmin ? 'block' : 'none');
        
        if (eventosDataTable) {
            eventosDataTable.column('.admin-controls').visible(isAdmin);
        }
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
    const path = window.location.pathname;
    $('body').off(); // Limpiar listeners anteriores para evitar duplicados

    if (path.includes('eventoDetalle.html')) {
        $('body').on('click', '#create-subevent-btn', openSubeventModalForCreate);
        $('body').on('submit', '#subevent-form', handleSubeventFormSubmit);
        // Aquí irían los listeners para editar/borrar subevento

    } else if (path.includes('eventos.html')) {
        $('body').on('click', '#create-event-btn', () => eventModal.show());
        $('body').on('click', '#manage-types-btn', () => manageTypesModal.show());
        $('body').on('click', '.btn-edit-event', e => openEventModalForEdit(e.currentTarget.dataset.id));
        $('body').on('click', '.btn-delete-event', e => handleDeleteEvent(e.currentTarget.dataset.id));
        $('body').on('submit', '#event-form', handleEventFormSubmit);
        $('body').on('click', '#view-gallery-btn', () => switchView('gallery'));
        $('body').on('click', '#view-table-btn', () => switchView('table'));
        $('body').on('submit', '#type-form', handleTypeFormSubmit);
        $('body').on('click', '.btn-delete-type', e => handleDeleteType(e.currentTarget.dataset.id));
    }
});
