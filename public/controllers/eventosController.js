document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    // --- STATE ---
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
    const eventosTableBody = document.querySelector('#eventos-table tbody');

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
            showAlert("Error al cargar eventos. Es posible que necesites crear un índice en Firestore (revisa la consola F12).", "danger");
        }
    }

    async function loadEventTypes() { /* ... (código sin cambios) ... */ }

    // --- UI RENDERING ---
    function renderViews() {
        renderGallery();
        renderTable();
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
        updateUIVisibility(); // Asegura que los botones admin se muestren/oculten
    }

    function renderTable() {
        if (!eventosTableBody) return;
        eventosTableBody.innerHTML = '';
        eventosCache.forEach(evento => {
            const tr = document.createElement('tr');
            const fecha = new Date(evento.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
            tr.innerHTML = `
                <td>${evento.titulo}</td>
                <td>${fecha} ${evento.hora}</td>
                <td>${evento.lugar}</td>
                <td class="admin-controls">
                    <button class="btn btn-sm btn-outline-primary btn-edit-event" data-id="${evento.id}"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger btn-delete-event" data-id="${evento.id}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            eventosTableBody.appendChild(tr);
        });
        updateUIVisibility(); // Asegura que los botones admin se muestren/oculten
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
        const eventoData = { /* ... (código de recogida de datos sin cambios) ... */ };
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
    /* ... (código de tipos de evento sin cambios) ... */

    // --- ADMIN VISIBILITY & BINDINGS ---
    function updateUIVisibility() {
        const isAdmin = userRole === 'admin';
        document.querySelectorAll('.admin-controls').forEach(c => c.style.display = isAdmin ? 'inline-block' : 'none');
    }

    // --- GLOBAL EVENT LISTENERS ---
    $('body').off()
        .on('click', '#create-event-btn', openEventModalForCreate)
        .on('click', '#manage-types-btn', openManageTypesModal)
        .on('click', '.btn-edit-event', e => openEventModalForEdit(e.currentTarget.dataset.id))
        .on('click', '.btn-delete-event', e => handleDeleteEvent(e.currentTarget.dataset.id))
        .on('submit', '#event-form', handleEventFormSubmit)
        .on('click', '#view-gallery-btn', () => switchView('gallery'))
        .on('click', '#view-table-btn', () => switchView('table'));
        // ... (resto de listeners para tipos)

    function switchView(view) {
        $('#eventos-gallery-container, #eventos-table-container').hide();
        $(`#eventos-${view}-container`).show();
        $('#view-gallery-btn, #view-table-btn').removeClass('active');
        $(`#view-${view}-btn`).addClass('active');
    }
    
    function showAlert(message, type = 'info') { /* ... (código sin cambios) ... */ }
});
