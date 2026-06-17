document.addEventListener('DOMContentLoaded', () => {
    // Usamos firebase global
    const db = firebase.firestore();
    const auth = firebase.auth();

    // Estado local de subeventos
    let subeventosCache = [];
    let subeventosDataTable = null;
    let currentSubevent = null;
    let currentUserProfile = null;
    let registrationsCache = [];
    let currentUserRegistration = null;

    // Elementos DOM (pueden no existir en todas las páginas)
    const subeventModalElement = document.getElementById('subevent-modal');
    const subeventModal = subeventModalElement ? new bootstrap.Modal(subeventModalElement) : null;
    const subeventForm = document.getElementById('subevent-form');
    const subeventTipoSelect = document.getElementById('subevent-tipo');
    const registrationForm = document.getElementById('registration-form');

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
                        // Esta tabla sólo muestra subeventos (actividades), así que siempre mostramos los botones de actividad
                        return `
                            <a href="subeventoDetalle.html?id=${row.id}" class="btn btn-sm btn-info" title="Ver Detalles"><i class="fas fa-eye"></i></a>
                            <button class="btn btn-sm btn-outline-primary btn-edit-subevent admin-controls" data-id="${row.id}" title="Editar"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-outline-danger btn-delete-subevent admin-controls" data-id="${row.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
                        `;
                    }
                }
            ],
            drawCallback: function (settings) {
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
        // Asegurar que el form contiene el id del evento padre (si viene en la URL)
        try {
            const parentInputId = 'subevent-parent-id';
            let parentInput = document.getElementById(parentInputId);
            if (!parentInput && subeventForm) {
                parentInput = document.createElement('input');
                parentInput.type = 'hidden';
                parentInput.id = parentInputId;
                parentInput.name = parentInputId;
                subeventForm.appendChild(parentInput);
            }
            if (parentInput) {
                const parentId = new URLSearchParams(window.location.search).get('id') || '';
                parentInput.value = parentId;
            }
        } catch (e) { console.warn('No se pudo setear parent id en create modal', e); }

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

            try { document.getElementById('subevent-titulo').value = subevento.titulo; } catch (e) { }
            try { document.getElementById('subevent-descripcion').value = subevento.descripcion; } catch (e) { }
            try { document.getElementById('subevent-tipo').value = subevento.tipoEventoId; } catch (e) { }
            try { document.getElementById('subevent-plazas').value = subevento.plazas; } catch (e) { }
            try { document.getElementById('subevent-fechaEvento').value = subevento.fechaEvento; } catch (e) { }
            try { document.getElementById('subevent-horaEvento').value = subevento.horaEvento; } catch (e) { }
            try { document.getElementById('subevent-lugar').value = subevento.lugar; } catch (e) { }
            try { document.getElementById('subevent-imagen').value = subevento.imagen; } catch (e) { }

            try {
                const fp = subevento.fechaPublicacion;
                let d = null;
                if (fp && typeof fp.toDate === 'function') d = fp.toDate();
                else if (fp instanceof Date) d = fp;
                else if (fp) d = new Date(fp);
                if (d && !isNaN(d.getTime())) {
                    const dateString = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                    const pubEl = document.getElementById('subevent-fechaPublicacion'); if (pubEl) pubEl.value = dateString;
                }
            } catch (e) {
                console.warn('No se pudo prellenar fecha de publicación del subevento:', e);
            }
            // Asegurar que el form contiene el id del evento padre del subevento editado
            try {
                const parentInputId = 'subevent-parent-id';
                let parentInput = document.getElementById(parentInputId);
                if (!parentInput && subeventForm) {
                    parentInput = document.createElement('input');
                    parentInput.type = 'hidden';
                    parentInput.id = parentInputId;
                    parentInput.name = parentInputId;
                    subeventForm.appendChild(parentInput);
                }
                if (parentInput) {
                    parentInput.value = subevento.eventoId || '';
                }
            } catch (e) { console.warn('No se pudo setear parent id en edit modal', e); }
            if (subeventModal) subeventModal.show();
        }
    }

    // Cargar detalle de subevento (página independiente)
    function getSubeventIdFromUrl() {
        return new URLSearchParams(window.location.search).get('id');
    }

    function getRegistrationCollection(subId = getSubeventIdFromUrl()) {
        return db.collection('subeventos').doc(subId).collection('inscripciones');
    }

    function isAdminUser() {
        return window.getUserRole ? window.getUserRole() === 'admin' : false;
    }

    function normalizeEmail(email) {
        return String(email || '').trim().toLowerCase();
    }

    function escapeRegistrationText(value) {
        if (window.escapeHtml) return window.escapeHtml(value || '');
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getPaidCount() {
        return registrationsCache.filter(r => r.pagado === true).length;
    }

    function hasAvailablePaidSlot() {
        if (!currentSubevent) return false;
        const plazas = parseInt(currentSubevent.plazas || 0, 10);
        if (plazas <= 0) return true;
        const paidCount = Number.isFinite(parseInt(currentSubevent.plazasOcupadas, 10))
            ? parseInt(currentSubevent.plazasOcupadas, 10)
            : getPaidCount();
        return paidCount < plazas;
    }

    function formatRegistrationDate(value) {
        if (!value) return '';
        const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    async function loadCurrentUserProfile() {
        const user = auth.currentUser;
        currentUserProfile = null;
        if (!user) return null;

        try {
            const doc = await db.collection('usuarios').doc(user.uid).get();
            const data = doc.exists ? doc.data() : {};
            currentUserProfile = {
                uid: user.uid,
                nombre: data.nombre || user.displayName || '',
                apellidos: data.apellidos || '',
                correo: data.correo || user.email || '',
                telefono: data.telefono || ''
            };
        } catch (error) {
            console.error('Error cargando datos del usuario para inscripción:', error);
            currentUserProfile = {
                uid: user.uid,
                nombre: user.displayName || '',
                apellidos: '',
                correo: user.email || '',
                telefono: ''
            };
        }

        return currentUserProfile;
    }

    function renderRegistrationSummary() {
        const capacityText = document.getElementById('registration-capacity-text');
        const statusBadge = document.getElementById('registration-user-status');
        const quickBtn = document.getElementById('quick-register-btn');
        const loginBox = document.getElementById('registration-login-box');
        const manualBtn = document.getElementById('manual-register-btn');

        if (!currentSubevent) return;

        const plazas = parseInt(currentSubevent.plazas || 0, 10);
        const paidCount = Number.isFinite(parseInt(currentSubevent.plazasOcupadas, 10))
            ? parseInt(currentSubevent.plazasOcupadas, 10)
            : getPaidCount();

        if (capacityText) {
            capacityText.textContent = plazas > 0
                ? `${paidCount} / ${plazas} inscritos. Puedes reservar mientras queden plazas de inscritos.`
                : `${paidCount} inscritos. Entrada libre.`;
        }

        if (statusBadge) {
            statusBadge.className = 'badge bg-secondary';
            statusBadge.textContent = 'Sin reserva';
            if (currentUserRegistration) {
                if (currentUserRegistration.pagado) {
                    statusBadge.className = 'badge bg-success';
                    statusBadge.textContent = 'Inscrito';
                } else {
                    statusBadge.className = 'badge bg-warning text-dark';
                    statusBadge.textContent = 'Reservado';
                }
            }
        }

        const alreadyReserved = !!currentUserRegistration;
        const canReserve = hasAvailablePaidSlot() && !alreadyReserved;
        if (quickBtn) quickBtn.style.display = auth.currentUser && canReserve ? 'block' : 'none';
        if (loginBox) loginBox.style.display = !auth.currentUser && canReserve ? 'block' : 'none';
        if (manualBtn) {
            manualBtn.disabled = !canReserve;
            manualBtn.textContent = canReserve ? 'Reservar plaza' : (alreadyReserved ? 'Ya tienes una reserva' : 'Sin plazas disponibles');
        }
    }

    function renderRegistrationLists() {
        const registeredList = document.getElementById('registered-list');
        const reservedList = document.getElementById('reserved-list');
        if (!registeredList || !reservedList) return;

        if (!isAdminUser()) {
            registeredList.innerHTML = '';
            reservedList.innerHTML = '';
            return;
        }

        const renderItem = (registration) => `
            <div class="list-group-item">
                <div class="d-flex justify-content-between align-items-start gap-3">
                    <div>
                        <div class="fw-bold">${escapeRegistrationText(registration.nombreCompleto || 'Sin nombre')}</div>
                        <div>${escapeRegistrationText(registration.correo)}</div>
                        <div>${escapeRegistrationText(registration.telefono)}</div>
                        <div class="text-muted">${formatRegistrationDate(registration.timestamp)}</div>
                    </div>
                    <div class="form-check form-switch">
                        <input class="form-check-input registration-paid-switch" type="checkbox" data-id="${registration.id}" ${registration.pagado ? 'checked' : ''}>
                        <label class="form-check-label">Pagado</label>
                    </div>
                </div>
            </div>
        `;

        const inscritos = registrationsCache.filter(r => r.pagado === true);
        const reservados = registrationsCache.filter(r => r.pagado !== true);

        registeredList.innerHTML = inscritos.length
            ? inscritos.map(renderItem).join('')
            : '<div class="text-muted py-3">No hay inscritos.</div>';
        reservedList.innerHTML = reservados.length
            ? reservados.map(renderItem).join('')
            : '<div class="text-muted py-3">No hay reservados.</div>';
    }

    async function loadRegistrations(subId = getSubeventIdFromUrl()) {
        if (!subId) return;

        await loadCurrentUserProfile();
        registrationsCache = [];
        currentUserRegistration = null;

        try {
            if (isAdminUser()) {
                const snapshot = await getRegistrationCollection(subId).orderBy('timestamp', 'asc').get();
                registrationsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else if (auth.currentUser) {
                const snapshot = await getRegistrationCollection(subId)
                    .where('userId', '==', auth.currentUser.uid)
                    .limit(1)
                    .get();
                registrationsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            currentUserRegistration = auth.currentUser
                ? registrationsCache.find(r => r.userId === auth.currentUser.uid) || null
                : null;
        } catch (error) {
            console.error('Error cargando inscripciones:', error);
            if (window.showAlert) window.showAlert('Error al cargar las inscripciones.', 'danger');
        }

        renderRegistrationSummary();
        renderRegistrationLists();
    }

    async function refreshSubeventAndRegistrations(subId = getSubeventIdFromUrl()) {
        if (!subId) return;
        const doc = await db.collection('subeventos').doc(subId).get();
        if (doc.exists) currentSubevent = { id: doc.id, ...doc.data() };
        await loadRegistrations(subId);
    }

    async function createRegistration(data) {
        const subId = getSubeventIdFromUrl();
        if (!subId || !currentSubevent) return;

        if (!hasAvailablePaidSlot()) {
            if (window.showAlert) window.showAlert('No quedan plazas disponibles para nuevas reservas.', 'warning');
            return;
        }

        const payload = {
            nombreCompleto: String(data.nombreCompleto || '').trim(),
            correo: normalizeEmail(data.correo),
            telefono: String(data.telefono || '').trim(),
            userId: data.userId || null,
            pagado: false,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!payload.nombreCompleto || !payload.correo || !payload.telefono) {
            if (window.showAlert) window.showAlert('Completa nombre, correo y teléfono.', 'warning');
            return;
        }

        try {
            if (payload.userId) {
                await getRegistrationCollection(subId).doc(`user_${payload.userId}`).set(payload, { merge: true });
            } else {
                await getRegistrationCollection(subId).add(payload);
            }
            if (registrationForm) registrationForm.reset();
            if (window.showAlert) window.showAlert('Reserva registrada. Quedará como inscrita cuando se marque como pagada.', 'success');
            if (auth.currentUser) {
                await loadRegistrations(subId);
            } else {
                currentUserRegistration = { ...payload, timestamp: new Date() };
                renderRegistrationSummary();
            }
        } catch (error) {
            console.error('Error creando inscripción:', error);
            if (window.showAlert) window.showAlert('No se pudo registrar la reserva.', 'danger');
        }
    }

    async function handleManualRegistrationSubmit(e) {
        e.preventDefault();
        await createRegistration({
            nombreCompleto: document.getElementById('registration-fullname')?.value || '',
            correo: document.getElementById('registration-email')?.value || '',
            telefono: document.getElementById('registration-phone')?.value || '',
            userId: auth.currentUser ? auth.currentUser.uid : null
        });
    }

    async function handleQuickRegistration() {
        const profile = await loadCurrentUserProfile();
        if (!profile) {
            if (window.showAlert) window.showAlert('Inicia sesión para reservar con tus datos.', 'warning');
            return;
        }

        await createRegistration({
            nombreCompleto: `${profile.nombre || ''} ${profile.apellidos || ''}`.trim(),
            correo: profile.correo,
            telefono: profile.telefono,
            userId: profile.uid
        });
    }

    async function handlePaidToggle(registrationId, checked) {
        if (!isAdminUser() || !currentSubevent) return;

        const subId = getSubeventIdFromUrl();
        const registration = registrationsCache.find(r => r.id === registrationId);
        if (!subId || !registration || registration.pagado === checked) return;

        try {
            await db.runTransaction(async transaction => {
                const subRef = db.collection('subeventos').doc(subId);
                const regRef = getRegistrationCollection(subId).doc(registrationId);
                const subDoc = await transaction.get(subRef);
                const regDoc = await transaction.get(regRef);
                if (!subDoc.exists || !regDoc.exists) throw new Error('Documento no encontrado');

                const subData = subDoc.data();
                const regData = regDoc.data();
                const plazas = parseInt(subData.plazas || 0, 10);
                const ocupadas = parseInt(subData.plazasOcupadas || 0, 10) || 0;

                if (checked && !regData.pagado && plazas > 0 && ocupadas >= plazas) {
                    throw new Error('No quedan plazas libres para marcar esta reserva como pagada.');
                }

                const nextOcupadas = checked
                    ? ocupadas + (regData.pagado ? 0 : 1)
                    : Math.max(0, ocupadas - (regData.pagado ? 1 : 0));

                transaction.update(regRef, { pagado: checked });
                transaction.update(subRef, { plazasOcupadas: nextOcupadas });
            });

            await refreshSubeventAndRegistrations(subId);
        } catch (error) {
            console.error('Error actualizando pago de inscripción:', error);
            if (window.showAlert) window.showAlert(error.message || 'No se pudo actualizar el pago.', 'danger');
            await loadRegistrations(subId);
        }
    }

    async function loadSubeventDetails() {
        const subId = new URLSearchParams(window.location.search).get('id');
        console.log('subeventosController.loadSubeventDetails() subId=', subId);
        if (!subId) return window.showAlert ? window.showAlert('Actividad no especificada.', 'warning') : null;

        if (!navigator.onLine && window.showAlert) window.showAlert('Estás sin conexión. Comprueba tu red y vuelve a intentarlo.', 'warning');
        try {
            const doc = await db.collection('subeventos').doc(subId).get();
            if (!doc.exists) return window.showAlert ? window.showAlert('Actividad no encontrada.', 'warning') : null;
            const sub = { id: doc.id, ...doc.data() };
            currentSubevent = sub;

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
            if (dateEl) dateEl.innerHTML = `<i class="fas fa-calendar-alt"></i> ${(sub.fechaEvento || '')} ${sub.horaEvento ? 'a las ' + sub.horaEvento : ''}`;
            if (placeEl) placeEl.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${window.escapeHtml ? window.escapeHtml(sub.lugar || '') : (sub.lugar || '')}`;
            if (tipoEl) tipoEl.textContent = (window.getTiposCache ? (window.getTiposCache().find(t => t.id === sub.tipoEventoId)?.nombre) : '') || 'Desconocido';
            if (imgEl) {
                const src = sub.imagen && sub.imagen.trim() ? sub.imagen.trim() : 'https://via.placeholder.com/1200x400?text=Sin+imagen';
                imgEl.src = src; imgEl.alt = sub.titulo || 'Imagen de la actividad';
                imgEl.onerror = function () { this.onerror = null; this.src = 'https://via.placeholder.com/1200x400?text=Sin+imagen'; };
            }
            if (parentEl && sub.eventoId) {
                const evDoc = await db.collection('eventos').doc(sub.eventoId).get();
                if (evDoc.exists) {
                    const ev = evDoc.data();
                    parentEl.innerHTML = `Evento padre: <a href="eventoDetalle.html?id=${sub.eventoId}">${window.escapeHtml ? window.escapeHtml(ev.titulo || 'Ver evento') : (ev.titulo || 'Ver evento')}</a>`;
                }
            }
            await loadRegistrations(subId);
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
        // Obtener evento padre ya sea desde campo oculto o desde la URL
        const parentInput = document.getElementById('subevent-parent-id');
        const eventId = (parentInput && parentInput.value) ? parentInput.value : (new URLSearchParams(window.location.search).get('id'));
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
        if (target.is('#quick-register-btn')) handleQuickRegistration();
        if (target.is('.btn-edit-subevent')) {
            const sid = target.data('id');
            openSubeventModalForEdit(sid);
        }
        if (target.is('.btn-delete-subevent')) handleDeleteSubevent(target.data('id'));
    });

    $(document).on('submit', (e) => {
        const form = $(e.target);
        if (form.is('#subevent-form')) handleSubeventFormSubmit(e);
        if (form.is('#registration-form')) handleManualRegistrationSubmit(e);
    });

    $(document).on('change', '.registration-paid-switch', (e) => {
        const target = e.target;
        handlePaidToggle(target.dataset.id, target.checked);
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
