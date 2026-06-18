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
            try { document.getElementById('subevent-bases-url').value = subevento.basesUrl || ''; } catch (e) { }
            try { document.getElementById('subevent-pago-previo').checked = subevento.pagoPrevioEvento === true; } catch (e) { }

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

    function areRegistrationTermsAccepted() {
        const terms = document.getElementById('registration-terms');
        return !terms || terms.checked;
    }

    function updateRegistrationButtons(canReserve) {
        const quickBtn = document.getElementById('quick-register-btn');
        const manualBtn = document.getElementById('manual-register-btn');
        const shouldDisable = !canReserve || !areRegistrationTermsAccepted();

        if (quickBtn) quickBtn.disabled = shouldDisable;
        if (manualBtn) manualBtn.disabled = shouldDisable;
    }

    function hasAvailablePaidSlot() {
        if (!currentSubevent) return false;
        const plazas = parseInt(currentSubevent.plazas || 0, 10);
        if (plazas <= 0) return true;
        const paidCount = parseInt(currentSubevent.plazasOcupadas || 0, 10);
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
        const paidCount = parseInt(currentSubevent.plazasOcupadas || 0, 10);

        // Centrar el formulario si el usuario no es admin
        const regForm = document.getElementById('registration-form');
        if (regForm && !isAdminUser()) {
            const col = regForm.closest('[class*="col-"]');
            if (col) {
                col.classList.add('mx-auto', 'float-none');
                if (col.parentElement) col.parentElement.classList.add('justify-content-center');
            }
        }

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
            manualBtn.textContent = canReserve ? 'Reservar plaza' : (alreadyReserved ? 'Ya tienes una reserva' : 'Sin plazas disponibles');
        }
        updateRegistrationButtons(canReserve);
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
                <div class="d-flex justify-content-between align-items-center gap-3">
                    <div>
                        <div class="fw-bold">${escapeRegistrationText(registration.nombreCompleto || 'Sin nombre')}</div>
                        <div>${escapeRegistrationText(registration.correo)}</div>
                        <div>${escapeRegistrationText(registration.telefono)}</div>
                        <div class="text-muted">${formatRegistrationDate(registration.timestamp)}</div>
                    </div>
                    <div class="d-flex align-items-center gap-3">
                        <div class="form-check form-switch mb-0">
                            <input class="form-check-input registration-paid-switch" type="checkbox" data-id="${registration.id}" ${registration.pagado ? 'checked' : ''}>
                            <label class="form-check-label">Pagado</label>
                        </div>
                        <button class="btn btn-sm btn-outline-danger btn-delete-registration" data-id="${registration.id}" title="Eliminar reserva">
                            <i class="fas fa-trash-alt"></i>
                        </button>
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

        if (!areRegistrationTermsAccepted()) {
            if (window.showAlert) window.showAlert('Debes aceptar las bases antes de reservar plaza.', 'warning');
            updateRegistrationButtons(hasAvailablePaidSlot() && !currentUserRegistration);
            return;
        }

        if (!hasAvailablePaidSlot()) {
            if (window.showAlert) window.showAlert('No quedan plazas disponibles para nuevas reservas.', 'warning');
            return;
        }

        const payload = {
            nombreCompleto: String(data.nombreCompleto || '').trim(),
            correo: normalizeEmail(data.correo),
            telefono: String(data.telefono || '').trim(),
            userId: data.userId || null,
            pagado: currentSubevent.pagoPrevioEvento === true ? false : true,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!payload.nombreCompleto || !payload.correo) {
            if (window.showAlert) window.showAlert('Por favor, completa al menos el nombre y el correo.', 'warning');
            return;
        }

        try {
            const autoPaid = !currentSubevent.pagoPrevioEvento; // Auto-pagado solo si NO hay pago previo

            if (autoPaid) {
                await db.runTransaction(async transaction => {
                    const subRef = db.collection('subeventos').doc(subId);
                    const regRef = payload.userId
                        ? getRegistrationCollection(subId).doc(`user_${payload.userId}`)
                        : getRegistrationCollection(subId).doc();
                    const subDoc = await transaction.get(subRef);

                    if (!subDoc.exists) throw new Error('La actividad no existe.');

                    const subData = subDoc.data();
                    const plazas = parseInt(subData.plazas || 0, 10);
                    const ocupadas = parseInt(subData.plazasOcupadas || 0, 10) || 0;

                    if (plazas > 0 && ocupadas >= plazas) {
                        throw new Error('No quedan plazas disponibles para nuevas inscripciones.');
                    }

                    transaction.set(regRef, { ...payload, pagado: true });
                    transaction.update(subRef, { plazasOcupadas: ocupadas + 1 });
                });
            } else if (payload.userId) {
                await getRegistrationCollection(subId).doc(`user_${payload.userId}`).set(payload);
            } else {
                await getRegistrationCollection(subId).add(payload);
            }
            if (registrationForm) registrationForm.reset();
            const terms = document.getElementById('registration-terms');
            if (terms) terms.checked = false;
            if (window.showAlert) {
                const msg = autoPaid
                    ? 'Inscripcion registrada directamente como pagada.'
                    : 'Reserva registrada. Quedara como inscrita cuando se marque como pagada.';
                window.showAlert(msg, 'success');
            }
            if (auth.currentUser) {
                await refreshSubeventAndRegistrations(subId);
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
        console.log('Iniciando proceso de inscripción rápida...');
        const profile = await loadCurrentUserProfile();
        if (!profile) {
            if (window.showAlert) window.showAlert('Inicia sesión para reservar con tus datos.', 'warning');
            return;
        }

        if (!currentSubevent) {
            console.error('Error: currentSubevent es null');
            if (window.showAlert) window.showAlert('No se ha podido cargar la información de la actividad. Recarga la página.', 'danger');
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

    async function handleDeleteRegistration(registrationId) {
        if (!isAdminUser()) return;

        const subId = getSubeventIdFromUrl();
        if (!subId) return;

        const registration = registrationsCache.find(r => r.id === registrationId);
        if (!registration) return;

        if (!confirm(`¿Estás seguro de que quieres eliminar la inscripción de "${registration.nombreCompleto}"?`)) return;

        try {
            await db.runTransaction(async transaction => {
                const subRef = db.collection('subeventos').doc(subId);
                const regRef = getRegistrationCollection(subId).doc(registrationId);

                const subDoc = await transaction.get(subRef);
                if (!subDoc.exists) throw new Error("La actividad no existe.");

                const currentOcupadas = parseInt(subDoc.data().plazasOcupadas || 0, 10);

                // Si estaba marcado como pagado, restamos una plaza del contador global
                if (registration.pagado) {
                    transaction.update(subRef, { plazasOcupadas: Math.max(0, currentOcupadas - 1) });
                }

                transaction.delete(regRef);
            });

            if (window.showAlert) window.showAlert('Inscripción eliminada con éxito.', 'success');
            await refreshSubeventAndRegistrations(subId);
        } catch (error) {
            console.error('Error al eliminar inscripción:', error);
            if (window.showAlert) window.showAlert('Error al eliminar: ' + error.message, 'danger');
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
            if (descEl) {
                const description = window.escapeHtml ? window.escapeHtml(sub.descripcion || '') : (sub.descripcion || '');
                const basesUrl = String(sub.basesUrl || '').trim();
                const safeBasesUrl = window.escapeHtml ? window.escapeHtml(basesUrl) : basesUrl;
                descEl.innerHTML = description;
                if (basesUrl) {
                    descEl.innerHTML += `<div class="mt-3"><a href="${safeBasesUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary"><i class="fas fa-file-alt me-1"></i> Ver bases</a></div>`;
                }
            }
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
            basesUrl: document.getElementById('subevent-bases-url') ? document.getElementById('subevent-bases-url').value.trim() : '',
            pagoPrevioEvento: document.getElementById('subevent-pago-previo') ? document.getElementById('subevent-pago-previo').checked : false,
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
        console.log("[Subeventos] Iniciando handleDeleteSubevent para ID:", id);

        // Buscar en la caché local o en la caché del controlador de eventos si estamos en la principal
        let subeventToDelete = subeventosCache.find(e => e.id === id);
        if (!subeventToDelete && window._eventosSubCache) {
            console.log("[Subeventos] No encontrado en caché local, buscando en caché global...");
            subeventToDelete = window._eventosSubCache().find(e => e.id === id);
        }

        if (!subeventToDelete) {
            console.error("[Subeventos] Error: No se encontró la actividad en ninguna caché. ID buscado:", id);
            return;
        }

        // Creamos el modal dinámicamente si no existe
        let modalEl = document.getElementById('confirmation-modal');
        if (!modalEl) {
            const modalHtml = `
                <div class="modal fade" id="confirmation-modal" tabindex="-1" aria-hidden="true" style="z-index: 2000;">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header bg-danger text-white">
                                <h5 class="modal-title">Confirmar Eliminación</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <p id="confirmation-modal-body-text" class="mb-0"></p>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                                <button type="button" class="btn btn-danger" id="confirm-action-btn">Eliminar definitivamente</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modalEl = document.getElementById('confirmation-modal');
        }

        window.itemToDeleteId = id;
        window.itemToDeleteType = 'subevento';

        const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
        // Si estamos dentro de otro modal, ajustar z-index

        modalInstance.show();
    }

    // Listeners específicos de subeventos

    // Listener para controlar el bloqueo/desbloqueo de los botones de reserva según las bases
    $(document).on('change', '#registration-terms', function (e) {
        // The updateRegistrationButtons function already checks areRegistrationTermsAccepted()
        // and hasAvailablePaidSlot() and currentUserRegistration.
        // So, we just need to trigger it.
        updateRegistrationButtons(hasAvailablePaidSlot() && !currentUserRegistration);
    });

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
        if (target.is('.btn-delete-registration')) handleDeleteRegistration(target.data('id'));
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

    const checkBases = document.getElementById('registration-terms');
    if (checkBases) {
        checkBases.checked = false; // Nos aseguramos de que empiece desmarcado
    }

    // Al resetear el formulario o cerrar el proceso, volvemos a bloquear los botones por seguridad:
    const quickRegisterBtn = document.getElementById('quick-register-btn');
    const submitRegistrationBtn = document.getElementById('manual-register-btn');

    if (quickRegisterBtn) quickRegisterBtn.disabled = true;
    if (submitRegistrationBtn) submitRegistrationBtn.disabled = true;

});

