document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    // --- STATE ---
    let currentUser = null;
    let userRole = 'viewer';
    let eventosCache = [];
    let tiposCache = [];

    let eventModal, confirmModal, manageTypesModal;

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
        currentUser = user;
        if (user) {
            const userDoc = await db.collection('usuarios').doc(user.uid).get();
            userRole = userDoc.exists && userDoc.data().isAdmin ? 'admin' : 'viewer';
        } else {
            userRole = 'viewer';
        }
        initPage();
    });

    function initPage() {
        setupEventListeners();
        updateUIVisibility();
        loadEventTypes();
        loadEvents();
    }

    function setupEventListeners() {
        document.getElementById('view-gallery-btn').addEventListener('click', () => switchView('gallery'));
        document.getElementById('view-table-btn').addEventListener('click', () => switchView('table'));
    }

    // --- DATA FETCHING ---
    async function loadEvents() {
        try {
            // NOTA: Esta consulta puede requerir un índice de Firestore. Si falla, la consola mostrará un enlace para crearlo.
            const snapshot = await db.collection('eventos').orderBy('fecha', 'desc').get();
            eventosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderGallery();
        } catch (error) {
            console.error("Error cargando eventos:", error);
            showAlert("Error al cargar eventos. Revisa la consola (F12) para más detalles.", "danger");
        }
    }

    async function loadEventTypes() {
        try {
            const snapshot = await db.collection('tipoSubevento').get();
            tiposCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            populateTypeFilters();
            renderEventTypesList();
        } catch (error) {
            console.error("Error cargando tipos:", error);
        }
    }

    // --- UI RENDERING ---
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
                    <img src="${evento.imagen || 'https://via.placeholder.com/400x250'}" class="card-img-top" alt="Imagen del evento">
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title">${evento.titulo}</h5>
                        <p class="card-text text-muted small">${fecha} a las ${evento.hora}</p>
                        <p class="card-text flex-grow-1">${evento.descripcion.substring(0, 100)}...</p>
                        <div class="admin-controls mt-auto text-end" style="display: ${userRole === 'admin' ? 'block' : 'none'};">
                             <button class="btn btn-sm btn-outline-primary"><i class="fas fa-edit"></i></button>
                             <button class="btn btn-sm btn-outline-danger"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>`;
            eventosGallery.appendChild(col);
        });
    }

    function populateTypeFilters() {
        [typeFilterSelect, eventTypeSelect].forEach(select => {
            if (!select) return;
            select.innerHTML = '<option value="">Selecciona tipo...</option>';
            tiposCache.forEach(tipo => select.add(new Option(tipo.nombre, tipo.id)));
        });
    }

    function renderEventTypesList() {
        if (!typesListContainer) return;
        typesListContainer.innerHTML = '';
        tiposCache.forEach(tipo => {
            typesListContainer.innerHTML += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    ${tipo.nombre}
                    <div>
                        <button class="btn btn-sm btn-outline-primary btn-edit-type" data-id="${tipo.id}"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-outline-danger btn-delete-type" data-id="${tipo.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </li>`;
        });
    }

    // --- EVENT MODAL & CRUD ---
    function openEventModalForCreate() {
        eventForm.reset();
        document.getElementById('event-id').value = '';
        document.getElementById('event-modal-title').textContent = 'Crear Nuevo Evento';
        eventModal.show();
    }

    async function handleEventFormSubmit(e) {
        e.preventDefault();
        const eventoData = {
            titulo: document.getElementById('event-titulo').value,
            descripcion: document.getElementById('event-descripcion').value,
            fecha: document.getElementById('event-fecha').value,
            hora: document.getElementById('event-hora').value,
            lugar: document.getElementById('event-lugar').value,
            publicacion: document.getElementById('event-publicacion').value,
            imagen: document.getElementById('event-imagen').value,
        };
        try {
            await db.collection('eventos').add(eventoData);
            showAlert('Evento creado con éxito', 'success');
            eventModal.hide();
            loadEvents();
        } catch (error) {
            showAlert('Error al guardar el evento.', 'danger');
        }
    }

    // --- TYPE MODAL & CRUD ---
    function openManageTypesModal() {
        typeForm.reset();
        document.getElementById('type-id').value = '';
        manageTypesModal.show();
    }

    async function handleTypeFormSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('type-id').value;
        const nombre = document.getElementById('type-name').value;
        if (id) {
            await db.collection('tipoSubevento').doc(id).update({ nombre });
        } else {
            await db.collection('tipoSubevento').add({ nombre });
        }
        loadEventTypes();
        typeForm.reset();
    }

    function handleEditType(id) {
        const type = tiposCache.find(t => t.id === id);
        document.getElementById('type-id').value = type.id;
        document.getElementById('type-name').value = type.nombre;
    }

    async function handleDeleteType(id) {
        await db.collection('tipoSubevento').doc(id).delete();
        loadEventTypes();
    }

    // --- ADMIN VISIBILITY & BINDINGS ---
    function updateUIVisibility() {
        const isAdmin = userRole === 'admin';
        document.querySelectorAll('.admin-controls').forEach(c => c.style.display = isAdmin ? 'block' : 'none');
        $('body').off();
        if (isAdmin) {
            $('body').on('click', '#create-event-btn', openEventModalForCreate);
            $('body').on('click', '#manage-types-btn', openManageTypesModal);
            $('body').on('submit', '#event-form', handleEventFormSubmit);
            $('body').on('submit', '#type-form', handleTypeFormSubmit);
            $('body').on('click', '.btn-edit-type', e => handleEditType(e.currentTarget.dataset.id));
            $('body').on('click', '.btn-delete-type', e => handleDeleteType(e.currentTarget.dataset.id));
        }
    }

    // --- UTILS ---
    function switchView(view) {
        $('#eventos-gallery-container, #eventos-table-container').hide();
        $(`#eventos-${view}-container`).show();
    }
    function showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alert-container');
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
        alertContainer.appendChild(alert);
        setTimeout(() => bootstrap.Alert.getOrCreateInstance(alert).close(), 5000);
    }
});
