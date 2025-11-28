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
        updateUIVisibility();
        initDataTable();
        loadEventTypes();
        loadEvents();
    }

    // --- DATA FETCHING ---
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
                        className: 'admin-controls text-center',
                        render: (id) => `
                            <button class="btn btn-sm btn-outline-primary btn-edit-event" data-id="${id}"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-outline-danger btn-delete-event" data-id="${id}"><i class="fas fa-trash"></i></button>
                        `
                    }
                ]
            });
        }
    }

    // --- UI RENDERING ---
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
                        <div class="admin-controls mt-auto text-end">
                            <button class="btn btn-sm btn-outline-primary btn-edit-event" data-id="${evento.id}"><i class="fas fa-edit"></i> Editar</button>
                            <button class="btn btn-sm btn-outline-danger btn-delete-event" data-id="${evento.id}"><i class="fas fa-trash"></i> Eliminar</button>
                        </div>
                    </div>
                </div>`;
            eventosGallery.appendChild(col);
        });
        updateUIVisibility();
    }

    // --- EVENT MODAL & CRUD ---
    function openEventModalForCreate() {
        eventForm.reset();
        document.getElementById('event-id').value = '';
        document.getElementById('event-modal-title').textContent = 'Crear Nuevo Evento';
        eventModal.show();
    }

    function openEventModalForEdit(id) {
        const evento = eventosCache.find(e => e.id === id);
        if (!evento) return;
        document.getElementById('event-id').value = evento.id;
        document.getElementById('event-modal-title').textContent = 'Editar Evento';
        document.getElementById('event-titulo').value = evento.titulo;
        document.getElementById('event-descripcion').value = evento.descripcion;
        document.getElementById('event-fecha').value = evento.fecha;
        document.getElementById('event-hora').value = evento.hora;
        document.getElementById('event-lugar').value = evento.lugar;
        document.getElementById('event-publicacion').value = evento.publicacion;
        document.getElementById('event-imagen').value = evento.imagen;
        eventModal.show();
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
            publicacion: document.getElementById('event-publicacion').value,
            imagen: document.getElementById('event-imagen').value,
            tipo: document.getElementById('event-tipo').value,
        };
        try {
            if (id) {
                await db.collection('eventos').doc(id).update(eventoData);
                showAlert('Evento actualizado con éxito', 'success');
            } else {
                await db.collection('eventos').add(eventoData);
                showAlert('Evento creado con éxito', 'success');
            }
            eventModal.hide();
            loadEvents();
        } catch (error) {
            showAlert('Error al guardar el evento.', 'danger');
        }
    }

    function handleDeleteEvent(id) {
        const evento = eventosCache.find(e => e.id === id);
        if (!evento) return;
        document.getElementById('confirm-modal-body').innerHTML = `¿Seguro que deseas eliminar el evento <strong>"${evento.titulo}"</strong>?`;
        confirmModal.show();
        document.getElementById('confirm-modal-btn').onclick = async () => {
            try {
                await db.collection('eventos').doc(id).delete();
                showAlert('Evento eliminado.', 'success');
                confirmModal.hide();
                loadEvents();
            } catch (error) {
                showAlert('Error al eliminar el evento.', 'danger');
            }
        };
    }

    // --- TYPE MODAL & CRUD ---
    function openManageTypesModal() {
        renderTypesList();
        manageTypesModal.show();
    }

    function renderTypesList() {
        if (!typesListContainer) return;
        typesListContainer.innerHTML = '';
        tiposCache.forEach(tipo => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.textContent = tipo.nombre;
            li.dataset.id = tipo.id;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-outline-danger btn-delete-type';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.dataset.id = tipo.id;
            deleteBtn.dataset.name = tipo.nombre;

            li.appendChild(deleteBtn);
            typesListContainer.appendChild(li);
        });
    }

    async function handleTypeFormSubmit(e) {
        e.preventDefault();
        const typeNameInput = document.getElementById('type-name');
        const newTypeName = typeNameInput.value.trim();
        if (!newTypeName) {
            showAlert('El nombre del tipo no puede estar vacío.', 'warning');
            return;
        }

        const isDuplicate = tiposCache.some(tipo => tipo.nombre.toLowerCase() === newTypeName.toLowerCase());
        if (isDuplicate) {
            showAlert(`El tipo "${newTypeName}" ya existe.`, 'warning');
            return;
        }

        try {
            await db.collection('tipoSubevento').add({ nombre: newTypeName });
            showAlert('Tipo de evento creado con éxito.', 'success');
            typeNameInput.value = '';
            await loadEventTypes();
        } catch (error) {
            console.error("Error creando tipo de evento:", error);
            showAlert('Error al crear el tipo de evento.', 'danger');
        }
    }

    async function handleDeleteType(id) {
        const typeToDelete = tiposCache.find(t => t.id === id);
        if (!typeToDelete) return;

        const eventsWithType = eventosCache.filter(evento => evento.tipo === typeToDelete.nombre);
        if (eventsWithType.length > 0) {
            const eventTitles = eventsWithType.map(e => e.titulo).join(', ');
            showAlert(`No se puede eliminar el tipo "${typeToDelete.nombre}" porque está en uso por los siguientes eventos: ${eventTitles}.`, 'danger', 10000);
            return;
        }
        
        document.getElementById('confirm-modal-body').innerHTML = `¿Seguro que deseas eliminar el tipo de evento <strong>"${typeToDelete.nombre}"</strong>?`;
        confirmModal.show();

        document.getElementById('confirm-modal-btn').onclick = async () => {
            try {
                await db.collection('tipoSubevento').doc(id).delete();
                showAlert('Tipo de evento eliminado.', 'success');
                confirmModal.hide();
                await loadEventTypes();
            } catch (error) {
                console.error("Error eliminando tipo de evento:", error);
                showAlert('Error al eliminar el tipo de evento.', 'danger');
            }
        };
    }

    // --- ADMIN VISIBILITY & BINDINGS ---
    function updateUIVisibility() {
        const isAdmin = userRole === 'admin';
        document.querySelectorAll('.admin-controls').forEach(c => c.style.display = isAdmin ? 'revert' : 'none');
        document.querySelectorAll('.admin-only').forEach(c => c.style.display = isAdmin ? 'block' : 'none');
        if (eventosDataTable) {
             const col = eventosDataTable.column('.admin-controls');
             if (col.visible() !== isAdmin) {
                col.visible(isAdmin);
             }
        }
    }

    // --- GLOBAL EVENT LISTENERS ---
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
});
