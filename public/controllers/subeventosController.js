document.addEventListener('DOMContentLoaded', () => {
    // Usamos firebase global
    const db = firebase.firestore();
    const auth = firebase.auth();

    // Estado local de subeventos
    let subeventosCache = [];
    let subeventosDataTable = null;

    // Elementos DOM (pueden no existir en todas las páginas)
    const subeventModalElement = document.getElementById('subevent-modal');
    const subeventModal = subeventModalElement ? new bootstrap.Modal(subeventModalElement) : null;
    const subeventForm = document.getElementById('subevent-form');
    const subeventTipoSelect = document.getElementById('subevent-tipo');

    // Exponer referencias si se necesita (opcional)
    window._subeventosCache = () => subeventosCache;

    // Inicializar DataTable para subeventos (si existe tabla en DOM)
    function initSubeventosDataTable() {
        if (!document.getElementById('subeventos-table')) return;
        if ($.fn.DataTable.isDataTable('#subeventos-table')) return;
        subeventosDataTable = $('#subeventos-table').DataTable({
            language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
            responsive: true, data: [],
            columns: [
                { data: 'titulo', title: 'Nombre' },
                { data: 'tipoEventoId', title: 'Tipo', render: (tipoId) => (window.getTiposCache ? (window.getTiposCache().find(t => t.id === tipoId)?.nombre) : 'Desconocido') || 'Desconocido' },
                { data: null, title: 'Plazas', render: data => data.plazas > 0 ? `${data.plazasOcupadas || 0} / ${data.plazas}` : 'Entrada libre' },
                {
                    data: 'id', title: 'Acciones', orderable: false, searchable: false, className: 'text-center',
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
                if (window.updateUIVisibility) window.updateUIVisibility();
            }
        });
    }

    // Cargar subeventos para un evento padre
    async function loadSubeventos(eventId) {
        if (!eventId) return;
        const now = firebase.firestore.Timestamp.now();
        let query = db.collection('subeventos').where('eventoId', '==', eventId);
        try {
            // Si existe getter de rol/visibilidad aplicada en otro módulo, respetarla aquí
            // (en el controlador principal se filtra por fechaPublicacion para viewers)
            if (window.getUserRole && window.getUserRole() === 'viewer') {
                query = query.where('fechaPublicacion', '<=', now);
            }
        } catch (e) {
            // ignore
        }
        try {
            const snapshot = await query.get();
            subeventosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), fechaPublicacion: doc.data().fechaPublicacion && typeof doc.data().fechaPublicacion.toDate === 'function' ? doc.data().fechaPublicacion.toDate() : doc.data().fechaPublicacion }));
            if (subeventosDataTable) {
                subeventosDataTable.clear().rows.add(subeventosCache).draw();
            }
        } catch (error) {
            console.error('Error loading subevents: ', error);
            if (window.showAlert) window.showAlert('Error al cargar actividades relacionadas.', 'danger');
        }
    }

    // Abrir modal para crear subevento
    function openSubeventModalForCreate() {
        if (subeventForm) subeventForm.reset();
        const idEl = document.getElementById('subevent-id'); if (idEl) idEl.value = '';
        const titleEl = document.getElementById('subevent-modal-title'); if (titleEl) titleEl.textContent = 'Crear Nueva Actividad';
        if (subeventModal) subeventModal.show();
    }

    // Abrir modal para editar subevento
    async function openSubeventModalForEdit(id) {
        let subevento = subeventosCache.find(s => s.id === id);
        // Si no está en cache, intentar obtenerlo directamente de Firestore
        if (!subevento) {
            try {
                const doc = await db.collection('subeventos').doc(id).get();
                if (doc.exists) {
                    subevento = { id: doc.id, ...doc.data() };
                    subeventosCache.push(subevento);
                }
            } catch (e) {
                console.error('Error fetching subevento for edit:', e);
            }
        }
        if (subevento && subeventForm) {
            subeventForm.reset();
            const idEl = document.getElementById('subevent-id'); if (idEl) idEl.value = id;
            const titleEl = document.getElementById('subevent-modal-title'); if (titleEl) titleEl.textContent = 'Editar Actividad';

            try { document.getElementById('subevent-titulo').value = subevento.titulo; } catch(e){}
            try { document.getElementById('subevent-descripcion').value = subevento.descripcion; } catch(e){}
            try { document.getElementById('subevent-tipo').value = subevento.tipoEventoId; } catch(e){}
            try { document.getElementById('subevent-plazas').value = subevento.plazas; } catch(e){}
            try { document.getElementById('subevent-fechaEvento').value = subevento.fechaEvento; } catch(e){}
            try { document.getElementById('subevent-horaEvento').value = subevento.horaEvento; } catch(e){}
            try { document.getElementById('subevent-lugar').value = subevento.lugar; } catch(e){}
            try { document.getElementById('subevent-imagen').value = subevento.imagen; } catch(e){}

            try {
                const fp = subevento.fechaPublicacion;
                let d = null;
                if (fp && typeof fp.toDate === 'function') d = fp.toDate();
                else if (fp instanceof Date) d = fp;
                else if (fp) d = new Date(fp);
                if (d && !isNaN(d.getTime())) {
                    const dateString = new Date(d.getTime() - (d.getTimezoneOffset() * 60000 )).toISOString().slice(0, 16);
                    const pubEl = document.getElementById('subevent-fechaPublicacion'); if (pubEl) pubEl.value = dateString;
                }
            } catch (e) {
                console.warn('No se pudo prellenar fecha de publicación del subevento:', e);
            }
            if (subeventModal) subeventModal.show();
        }
    }

    // Cargar detalle de subevento (página independiente)
    async function loadSubeventDetails() {
        const subId = new URLSearchParams(window.location.search).get('id');
        console.log('subeventosController.loadSubeventDetails() subId=', subId);
        if (!subId) return window.showAlert ? window.showAlert('Actividad no especificada.', 'warning') : null;

        if (!navigator.onLine && window.showAlert) window.showAlert('Estás sin conexión. Comprueba tu red y vuelve a intentarlo.', 'warning');
        try {
            const doc = await db.collection('subeventos').doc(subId).get();
            if (!doc.exists) return window.showAlert ? window.showAlert('Actividad no encontrada.', 'warning') : null;
            const sub = { id: doc.id, ...doc.data() };

            if (window.renderTypesList) window.renderTypesList();

            const titleEl = document.getElementById('subevent-detail-title');
            const descEl = document.getElementById('subevent-detail-description');
            const dateEl = document.getElementById('subevent-detail-date');
            const placeEl = document.getElementById('subevent-detail-place');
            const tipoEl = document.getElementById('subevent-detail-tipo');
            const imgEl = document.getElementById('subevent-detail-image');
            const parentEl = document.getElementById('subevent-detail-parent');

            if (titleEl) titleEl.textContent = sub.titulo || 'Sin título';
            if (descEl) descEl.textContent = sub.descripcion || '';
            if (dateEl) dateEl.innerHTML = `<i class="fas fa-calendar-alt"></i> ${(sub.fechaEvento||'')} ${sub.horaEvento ? 'a las ' + sub.horaEvento : ''}`;
            if (placeEl) placeEl.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${window.escapeHtml ? window.escapeHtml(sub.lugar || '') : (sub.lugar || '')}`;
            if (tipoEl) tipoEl.textContent = (window.getTiposCache ? (window.getTiposCache().find(t => t.id === sub.tipoEventoId)?.nombre) : '') || 'Desconocido';
            if (imgEl) {
                const src = sub.imagen && sub.imagen.trim() ? sub.imagen.trim() : 'https://via.placeholder.com/1200x400?text=Sin+imagen';
                imgEl.src = src; imgEl.alt = sub.titulo || 'Imagen de la actividad';
                imgEl.onerror = function() { this.onerror = null; this.src = 'https://via.placeholder.com/1200x400?text=Sin+imagen'; };
            }
            if (parentEl && sub.eventoId) {
                const evDoc = await db.collection('eventos').doc(sub.eventoId).get();
                if (evDoc.exists) {
                    const ev = evDoc.data();
                    parentEl.innerHTML = `Evento padre: <a href="eventoDetalle.html?id=${sub.eventoId}">${window.escapeHtml ? window.escapeHtml(ev.titulo || 'Ver evento') : (ev.titulo || 'Ver evento')}</a>`;
                }
            }
        } catch (error) {
            console.error('Error loading subevent detail:', error);
            const msg = error && error.message ? error.message : String(error);
            if (msg.includes('ERR_BLOCKED_BY_CLIENT') || msg.includes('blocked')) {
                if (window.showAlert) window.showAlert('La petición a Firestore fue bloqueada (¿extensión tipo adblock?). Desactiva extensiones y prueba de nuevo.', 'warning', 10000);
                if (window.showRetryAlert) window.showRetryAlert('La petición a Firestore fue bloqueada (posible extensión).');
            } else if (msg.includes('The message port closed')) {
                if (window.showAlert) window.showAlert('Comunicación interrumpida por una extensión o el navegador. Prueba en una ventana sin extensiones.', 'warning', 10000);
                if (window.showRetryAlert) window.showRetryAlert('Comunicación interrumpida (The message port closed).');
            } else {
                if (window.showAlert) window.showAlert('Error al cargar la actividad: ' + msg, 'danger', 8000);
                if (window.showRetryAlert) window.showRetryAlert('Error al cargar la actividad. Reintenta o revisa la consola para más detalles.');
            }
        }
    }

    // Guardar subevento
    async function handleSubeventFormSubmit(e) {
        e.preventDefault();
        const currentUser = auth.currentUser;
        if (!currentUser) return window.showAlert ? window.showAlert('Debes iniciar sesión para esta acción.', 'danger') : null;

        const eventId = new URLSearchParams(window.location.search).get('id');
        const subeventIdEl = document.getElementById('subevent-id');
        const subeventId = subeventIdEl ? subeventIdEl.value : '';
        const publicacionVal = document.getElementById('subevent-fechaPublicacion') ? document.getElementById('subevent-fechaPublicacion').value : '';
        const fechaPublicacion = publicacionVal ? firebase.firestore.Timestamp.fromDate(new Date(publicacionVal)) : firebase.firestore.Timestamp.now();

        const subeventoData = {
            titulo: document.getElementById('subevent-titulo') ? document.getElementById('subevent-titulo').value : '',
            descripcion: document.getElementById('subevent-descripcion') ? document.getElementById('subevent-descripcion').value : '',
            tipoEventoId: document.getElementById('subevent-tipo') ? document.getElementById('subevent-tipo').value : '',
            eventoId: eventId,
            imagen: document.getElementById('subevent-imagen') ? document.getElementById('subevent-imagen').value : '',
            fechaEvento: document.getElementById('subevent-fechaEvento') ? document.getElementById('subevent-fechaEvento').value : '',
            horaEvento: document.getElementById('subevent-horaEvento') ? document.getElementById('subevent-horaEvento').value : '',
            fechaPublicacion: fechaPublicacion,
            lugar: document.getElementById('subevent-lugar') ? document.getElementById('subevent-lugar').value : '',
            plazas: parseInt(document.getElementById('subevent-plazas') ? document.getElementById('subevent-plazas').value : '0', 10) || 0,
        };

        try {
            if (subeventId) {
                await db.collection('subeventos').doc(subeventId).update(subeventoData);
                if (window.showAlert) window.showAlert('Subevento actualizado con éxito', 'success');
            } else {
                subeventoData.creador = currentUser.uid;
                subeventoData.plazasOcupadas = 0;
                await db.collection('subeventos').add(subeventoData);
                if (window.showAlert) window.showAlert('Subevento creado con éxito', 'success');
            }
            if (subeventModal) subeventModal.hide();
            // recargar la lista si estamos dentro del detalle del evento
            if (eventId) loadSubeventos(eventId);
        } catch (error) {
            console.error('Error saving subevent: ', error);
            if (window.showAlert) window.showAlert('Error al guardar el subevento.', 'danger');
        }
    }

    function handleDeleteSubevent(id) {
        const subeventToDelete = subeventosCache.find(e => e.id === id);
        if (!subeventToDelete) return;
        window.itemToDeleteId = id;
        window.itemToDeleteType = 'subevento';
        const confirmModalElement = document.getElementById('confirm-modal');
        const confirmModal = confirmModalElement ? new bootstrap.Modal(confirmModalElement) : null;
        const body = document.getElementById('confirm-modal-body');
        if (body) body.textContent = `¿Estás seguro de que quieres eliminar el subevento "${subeventToDelete.titulo}"?`;
        if (confirmModal) confirmModal.show();
    }

    // Listeners específicos de subeventos
    $(document).on('click', (e) => {
        const target = $(e.target).closest('button, a');
        if (!target.length) return;
        if (target.is('#create-subevent-btn')) openSubeventModalForCreate();
        if (target.is('.btn-edit-subevent')) {
            const sid = target.data('id');
            openSubeventModalForEdit(sid);
        }
        if (target.is('.btn-delete-subevent')) handleDeleteSubevent(target.data('id'));
    });

    $(document).on('submit', (e) => {
        const form = $(e.target);
        if (form.is('#subevent-form')) handleSubeventFormSubmit(e);
    });

    // Exponer funciones en global para compatibilidad con eventController
    window.initSubeventosDataTable = initSubeventosDataTable;
    window.loadSubeventos = loadSubeventos;
    window.openSubeventModalForCreate = openSubeventModalForCreate;
    window.openSubeventModalForEdit = openSubeventModalForEdit;
    window.loadSubeventDetails = loadSubeventDetails;
    window.handleSubeventFormSubmit = handleSubeventFormSubmit;
    window.handleDeleteSubevent = handleDeleteSubevent;

});
