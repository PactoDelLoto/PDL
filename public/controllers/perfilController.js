document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    const loadingBox = document.getElementById('profile-loading');
    const deniedBox = document.getElementById('profile-denied');
    const profileCard = document.getElementById('profile-card');
    const profileForm = document.getElementById('profile-form');
    const saveButton = document.getElementById('profile-save-btn');

    const emailInput = document.getElementById('profile-email');
    const nameInput = document.getElementById('profile-name');
    const lastnameInput = document.getElementById('profile-lastname');
    const socioBadge = document.getElementById('profile-socio-badge');
    const colaboradorBadge = document.getElementById('profile-colaborador-badge');
    const adminBadge = document.getElementById('profile-admin-badge');
    const activitiesLoading = document.getElementById('profile-activities-loading');
    const activitiesEmpty = document.getElementById('profile-activities-empty');
    const activitiesList = document.getElementById('profile-activities-list');
    const showPastToggle = document.getElementById('show-past-activities');
    const paginationNav = document.getElementById('profile-activities-pagination');
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    const solicitudesSection = document.getElementById('profile-solicitudes-section');
    const btnActualizarContainer = document.getElementById('btn-solicitar-actualizar-cuentas-container');
    const btnSerSocioContainer = document.getElementById('btn-solicitar-ser-socio-container');
    const btnActualizar = document.getElementById('btn-solicitar-actualizar-cuentas');
    const btnSerSocio = document.getElementById('btn-solicitar-ser-socio');

    let currentUser = null;
    let allActivities = [];
    let currentPage = 1;
    const PER_PAGE = 5;

    auth.onAuthStateChanged(async user => {
        currentUser = user;

        if (!user) {
            showLoading(false);
            deniedBox.classList.remove('d-none');
            profileCard.classList.add('d-none');
            return;
        }

        await loadProfile(user);
        await loadUserActivities(user);

        const params = new URLSearchParams(window.location.search);
        if (params.get('tab') === 'actividades') {
            const tabTrigger = document.getElementById('profile-activities-tab');
            if (tabTrigger) tabTrigger.click();
        }
    });

    if (showPastToggle) {
        showPastToggle.addEventListener('change', () => {
            currentPage = 1;
            renderUserActivities();
        });
    }

    if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderUserActivities(); } });
    if (nextBtn) nextBtn.addEventListener('click', () => { const total = getFilteredActivities().length; const maxPage = Math.ceil(total / PER_PAGE); if (currentPage < maxPage) { currentPage++; renderUserActivities(); } });

    profileForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (!currentUser) return;

        const updatedData = {
            nombre: nameInput.value.trim(),
            apellidos: lastnameInput.value.trim(),
            correo: currentUser.email || emailInput.value.trim()
        };

        if (!updatedData.nombre || !updatedData.apellidos) {
            showAlert('Nombre y apellidos son obligatorios.', 'warning');
            return;
        }

        saveButton.disabled = true;
        try {
            await db.collection('usuarios').doc(currentUser.uid).set(updatedData, { merge: true });
            showAlert('Perfil actualizado con exito.', 'success');
        } catch (error) {
            console.error('Error al actualizar el perfil:', error);
            showAlert('No se pudo actualizar el perfil.', 'danger');
        } finally {
            saveButton.disabled = false;
        }
    });

    async function loadProfile(user) {
        showLoading(true);
        deniedBox.classList.add('d-none');
        profileCard.classList.add('d-none');

        try {
            const doc = await db.collection('usuarios').doc(user.uid).get();
            const userData = doc.exists ? doc.data() : {};

            emailInput.value = userData.correo || user.email || '';
            nameInput.value = userData.nombre || (user.displayName ? user.displayName.split(' ')[0] : '');
            lastnameInput.value = userData.apellidos || '';

            updateRoleBadge(socioBadge, 'Socio', userData.isSocio === true);
            updateRoleBadge(colaboradorBadge, 'Colaborador', userData.isColaborador === true);
            updateRoleBadge(adminBadge, 'Admin', userData.isAdmin === true);

            const isSocio = userData.isSocio === true;
            const pagadoHasta = userData.pagadoHasta || null;
            showSolicitudButtons(isSocio, pagadoHasta);
            applyProfileCooldown(db, user.uid);

            profileCard.classList.remove('d-none');
        } catch (error) {
            console.error('Error al cargar el perfil:', error);
            showAlert('No se pudieron cargar tus datos.', 'danger');
        } finally {
            showLoading(false);
        }
    }

    async function loadUserActivities(user) {
        if (!user || !activitiesList) return;

        setActivitiesLoading(true);
        activitiesEmpty.classList.add('d-none');
        activitiesList.innerHTML = '';
        paginationNav.classList.add('d-none');

        try {
            const snapshotByUser = await db.collectionGroup('inscripciones')
                .where('userId', '==', user.uid)
                .get();

            // También buscar por correo para incluir inscripciones hechas
            // antes de fusionar un perfil de invitado con el usuario registrado
            const snapshotByEmail = await db.collectionGroup('inscripciones')
                .where('correo', '==', user.email)
                .get();

            // Fusionar y deduplicar por referencia del documento
            const seenRefs = new Set();
            const allDocs = [...snapshotByUser.docs, ...snapshotByEmail.docs];

            const activities = await Promise.all(allDocs.map(async doc => {
                if (seenRefs.has(doc.ref.path)) return null;
                seenRefs.add(doc.ref.path);

                const registration = doc.data();
                const subeventRef = doc.ref.parent.parent;
                if (!subeventRef) return null;

                const subeventDoc = await subeventRef.get();
                if (!subeventDoc.exists) return null;

                const subevent = subeventDoc.data();
                return { id: subeventDoc.id, registration, subevent, regRef: doc.ref };
            }));

            allActivities = activities
                .filter(Boolean)
                .sort((a, b) => getActivityDate(a.subevent) - getActivityDate(b.subevent));

            currentPage = 1;
            renderUserActivities();
        } catch (error) {
            console.error('Error al cargar actividades del perfil:', error);
            activitiesList.innerHTML = `
                <div class="alert alert-danger mb-0" role="alert">
                    No se pudieron cargar tus actividades.
                </div>
            `;
        } finally {
            setActivitiesLoading(false);
        }
    }

    function getFilteredActivities() {
        const showPast = showPastToggle ? showPastToggle.checked : false;
        const now = new Date();
        if (!showPast) {
            return allActivities.filter(({ subevent }) => {
                const date = getActivityDate(subevent);
                return date >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
            });
        }
        return allActivities;
    }

    function renderUserActivities() {
        const filtered = getFilteredActivities();

        if (!filtered.length) {
            activitiesEmpty.classList.remove('d-none');
            activitiesList.innerHTML = '';
            paginationNav.classList.add('d-none');
            return;
        }
        activitiesEmpty.classList.add('d-none');

        const totalPages = Math.ceil(filtered.length / PER_PAGE);
        if (currentPage > totalPages) currentPage = totalPages;
        const start = (currentPage - 1) * PER_PAGE;
        const pageItems = filtered.slice(start, start + PER_PAGE);

        activitiesList.innerHTML = pageItems.map(({ id, registration, subevent, regRef }) => {
            const isPaid = registration.pagado === true;
            const statusClass = isPaid ? 'bg-success' : 'bg-warning text-dark';
            const statusText = isPaid ? 'Inscrito' : 'Reservado';
            const dateText = formatActivityDate(subevent);
            const placeText = escapeText(subevent.lugar || 'Lugar por confirmar');
            const regId = regRef.id;

            const eventDate = getActivityDate(subevent);
            const isPast = eventDate < new Date();

            return `
                <div class="list-group-item list-group-item-action">
                    <a href="/subeventoDetalle.html?id=${encodeURIComponent(id)}" class="text-decoration-none text-reset">
                        <div class="d-flex w-100 justify-content-between gap-3">
                            <h5 class="mb-1">${escapeText(subevent.titulo || 'Actividad sin titulo')}</h5>
                            <span class="badge ${statusClass} align-self-start">${statusText}</span>
                        </div>
                        <p class="mb-1">${dateText}</p>
                        <small class="text-muted">${placeText}</small>
                    </a>
                    ${isPast ? '' : `
                    <div class="text-end mt-2">
                        <button class="btn btn-danger btn-sm cancel-registration-btn" data-reg-path="${escapeText(regRef.path)}" data-subevent-id="${escapeText(id)}" data-subevent-title="${escapeText(subevent.titulo || 'Actividad sin titulo')}">
                            <i class="fa-solid fa-xmark me-1"></i>Anular inscripción
                        </button>
                    </div>
                    `}
                </div>
            `;
        }).join('');

        if (totalPages > 1) {
            paginationNav.classList.remove('d-none');
            pageInfo.textContent = `${currentPage} / ${totalPages}`;
            prevBtn.classList.toggle('disabled', currentPage <= 1);
            nextBtn.classList.toggle('disabled', currentPage >= totalPages);
        } else {
            paginationNav.classList.add('d-none');
        }
    }

    function getActivityDate(subevent) {
        if (!subevent.fechaEvento) return new Date(8640000000000000);
        const date = new Date(`${subevent.fechaEvento}T${subevent.horaEvento || '00:00'}`);
        return Number.isNaN(date.getTime()) ? new Date(8640000000000000) : date;
    }

    function formatActivityDate(subevent) {
        if (!subevent.fechaEvento) return 'Indefinida';
        const date = getActivityDate(subevent);
        if (Number.isNaN(date.getTime())) return 'Indefinida';

        const formattedDate = date.toLocaleDateString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const formattedTime = subevent.horaEvento ? ` a las ${subevent.horaEvento}` : '';
        return `${formattedDate}${formattedTime}`;
    }

    function escapeText(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setActivitiesLoading(isLoading) {
        if (activitiesLoading) {
            activitiesLoading.textContent = isLoading ? 'Cargando actividades...' : '';
        }
    }

    function updateRoleBadge(element, label, isActive) {
        element.textContent = `${label}: ${isActive ? 'Si' : 'No'}`;
        element.className = `badge ${isActive ? 'bg-success' : 'bg-secondary'} me-2`;
    }

    function showLoading(isLoading) {
        loadingBox.classList.toggle('d-none', !isLoading);
    }

    function showSolicitudButtons(isSocio, pagadoHasta) {
        if (!solicitudesSection) return;
        const tieneDeuda = isSocio && pagadoHasta ? !!getEstadoDeuda(pagadoHasta) : false;
        if (tieneDeuda) {
            solicitudesSection.classList.remove('d-none');
            btnActualizarContainer.classList.remove('d-none');
            btnSerSocioContainer.classList.add('d-none');
        } else if (!isSocio) {
            solicitudesSection.classList.remove('d-none');
            btnActualizarContainer.classList.add('d-none');
            btnSerSocioContainer.classList.remove('d-none');
        } else {
            solicitudesSection.classList.add('d-none');
            btnActualizarContainer.classList.add('d-none');
            btnSerSocioContainer.classList.add('d-none');
        }
    }

    async function handleSolicitud(tipo) {
        if (!currentUser) return;
        try {
            const cooldown = await checkSolicitudCooldown(db, currentUser.uid, tipo);
            if (cooldown) {
                showAlert(`Ya enviaste una solicitud el ${cooldown.fecha}. Debes esperar una semana desde esa fecha para enviar otra.`, 'warning');
                return;
            }
        } catch (e) {}

        const titles = { actualizar_cuentas: 'Actualizar cuentas', ser_socio: 'Solicitar ser socio' };
        const messages = {
            actualizar_cuentas: 'Al enviar esta solicitud, el equipo revisará que estés al corriente de pago para actualizar el estado de tus cuentas y así mantener tu condición de socio. Asegúrate de haber realizado el pago de las cuotas pendientes antes de continuar.',
            ser_socio: 'Al enviar esta solicitud, el equipo evaluará tu petición para convertirte en socio. Podrás acceder a descuentos, actividades exclusivas y participar en la vida del club. Un administrador revisará tu caso y te responderá a la mayor brevedad.'
        };
        const mensajesTexto = {
            actualizar_cuentas: 'Debido a que debía cuotas y actualmente me he puesto al día, solicito la actualización de mis cuentas. Gracias, un saludo.',
            ser_socio: ''
        };

        showConfirmationModal(titles[tipo], messages[tipo], async function () {
            try {
                const doc = await db.collection('usuarios').doc(currentUser.uid).get();
                if (!doc.exists) return;
                const data = doc.data();
                const nombre = data.nombre || '';
                const apellidos = data.apellidos || '';
                const mensaje = tipo === 'actualizar_cuentas'
                    ? mensajesTexto.actualizar_cuentas
                    : `${nombre} ${apellidos} quiere ser socio.`;
                await db.collection('solicitudes').add({
                    userId: currentUser.uid,
                    userName: `${nombre} ${apellidos}`.trim(),
                    userEmail: currentUser.email,
                    tipo: tipo,
                    mensaje: mensaje,
                    fecha: firebase.firestore.FieldValue.serverTimestamp(),
                    leidoAdmin: false, leidoAdminPor: null, leidoAdminFecha: null,
                    respuestaAdmin: null, respondidoAdminPor: null, respondidoAdminFecha: null,
                    leidoUser: true, leidoUserFecha: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'pendiente',
                    conversacion: [{ rol: 'usuario', mensaje: mensaje, fecha: new Date() }]
                });
                if (window.auditar) window.auditar('solicitudes', 'crear', `Solicitud de ${tipo === 'actualizar_cuentas' ? 'actualización de cuentas' : 'socio'} enviada`, { tipo });
                showAlert('Solicitud enviada correctamente. El equipo revisará tu caso.', 'success');
                applyProfileCooldown(db, currentUser.uid);
            } catch (err) {
                console.error('Error al crear solicitud:', err);
                showAlert('Error al enviar la solicitud.', 'danger');
            }
        });
    }

    if (btnActualizar) {
        btnActualizar.addEventListener('click', () => handleSolicitud('actualizar_cuentas'));
    }
    if (btnSerSocio) {
        btnSerSocio.addEventListener('click', () => handleSolicitud('ser_socio'));
    }

    async function applyProfileCooldown(db, uid) {
        try {
            const snapshot = await db.collection('solicitudes').where('userId', '==', uid).get();
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const cooldownTipos = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                const fecha = data.fecha?.toDate?.();
                if (fecha && fecha > weekAgo) {
                    if (!cooldownTipos[data.tipo]) {
                        cooldownTipos[data.tipo] = fecha;
                    }
                }
            });
            const tipos = [
                { tipo: 'actualizar_cuentas', btnId: 'btn-solicitar-actualizar-cuentas', containerId: 'btn-solicitar-actualizar-cuentas-container' },
                { tipo: 'ser_socio', btnId: 'btn-solicitar-ser-socio', containerId: 'btn-solicitar-ser-socio-container' }
            ];
            for (const { tipo, btnId, containerId } of tipos) {
                if (cooldownTipos[tipo]) {
                    const btn = document.getElementById(btnId);
                    if (btn) {
                        btn.disabled = true;
                        btn.classList.add('opacity-50');
                        btn.style.pointerEvents = 'none';
                        const tooltipText = tipo === 'ser_socio'
                            ? 'Ya has solicitado ser socio, debes esperar una semana para volver a solicitarlo.'
                            : 'No puedes volver a solicitarlo hasta que pase una semana.';
                        let wrapper = btn.parentElement;
                        if (!wrapper || !wrapper.classList.contains('btn-tooltip-wrapper')) {
                            wrapper = document.createElement('span');
                            wrapper.className = 'd-inline-block btn-tooltip-wrapper';
                            wrapper.tabIndex = 0;
                            btn.parentNode.insertBefore(wrapper, btn);
                            wrapper.appendChild(btn);
                        }
                        wrapper.setAttribute('data-bs-toggle', 'tooltip');
                        wrapper.setAttribute('data-bs-placement', 'top');
                        wrapper.title = tooltipText;
                        setTimeout(() => {
                            try { new bootstrap.Tooltip(wrapper); } catch (e) {}
                        }, 100);
                    }
                }
            }
        } catch (e) {}
    }

    document.addEventListener('click', e => {
        const btn = e.target.closest('.cancel-registration-btn');
        if (!btn) return;

        const regPath = btn.dataset.regPath;
        const subeventId = btn.dataset.subeventId;
        const subeventTitle = btn.dataset.subeventTitle;

        showConfirmationModal(
            'Anular inscripción',
            `¿Seguro que quieres anular tu inscripción en "${subeventTitle}"?`,
            async () => {
                try {
                    const regRef = db.doc(regPath);
                    const regDoc = await regRef.get();
                    if (!regDoc.exists) {
                        showAlert('No se encontró la inscripción.', 'danger');
                        return;
                    }
                    await regRef.delete();

                    // Crear notificación de cancelación para el admin
                    const userDoc = await db.collection('usuarios').doc(currentUser.uid).get();
                    const userData = userDoc.data();
                    const userNombre = `${userData?.nombre || ''} ${userData?.apellidos || ''}`.trim() || currentUser.email;
                    await db.collection('solicitudes').add({
                        userId: currentUser.uid,
                        userName: userNombre,
                        userEmail: currentUser.email,
                        tipo: 'cancelacion actividad',
                        mensaje: `${userNombre} ha cancelado su inscripción en "${subeventTitle}".`,
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        leidoAdmin: false, leidoAdminPor: null, leidoAdminFecha: null,
                        respuestaAdmin: null, respondidoAdminPor: null, respondidoAdminFecha: null,
                        leidoUser: true, leidoUserFecha: firebase.firestore.FieldValue.serverTimestamp(),
                        status: 'pendiente',
                        conversacion: [{ rol: 'usuario', mensaje: `He cancelado mi inscripción en "${subeventTitle}".`, fecha: new Date() }]
                    });

                    showAlert('Inscripción anulada correctamente.', 'success');
                    await loadUserActivities(currentUser);
                } catch (error) {
                    console.error('Error al anular inscripción:', error);
                    showAlert('No se pudo anular la inscripción.', 'danger');
                }
            }
        );
    });

    // --- MODO OSCURO ---
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    if (darkModeToggle) {
        darkModeToggle.checked = localStorage.getItem('darkMode') === 'true';
        darkModeToggle.addEventListener('change', () => {
            const isDark = darkModeToggle.checked;
            localStorage.setItem('darkMode', isDark ? 'true' : 'false');
            if (isDark) {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
        });
    }

    // --- CAMBIAR CONTRASEÑA ---
    const changePasswordBtn = document.getElementById('change-password-btn');
    const changePasswordModalEl = document.getElementById('change-password-modal');
    const changePasswordForm = document.getElementById('change-password-form');
    const savePasswordBtn = document.getElementById('save-password-btn');

    const currentPasswordInput = document.getElementById('current-password');
    const newPasswordInput = document.getElementById('new-password');
    const confirmNewPasswordInput = document.getElementById('confirm-new-password');

    const changeStrengthChecks = {
        length: document.getElementById('change-length-check'),
        case: document.getElementById('change-case-check'),
        number: document.getElementById('change-number-check'),
        symbol: document.getElementById('change-symbol-check')
    };
    const changeValidations = {
        length: v => v.length >= 8,
        case: v => /[a-z]/.test(v) && /[A-Z]/.test(v),
        number: v => /[0-9]/.test(v),
        symbol: v => /[^A-Za-z0-9]/.test(v)
    };

    if (changePasswordModalEl) {
        const changePasswordModal = new bootstrap.Modal(changePasswordModalEl);

        const toggleEls = {
            'toggle-current-password': currentPasswordInput,
            'toggle-new-password': newPasswordInput,
            'toggle-confirm-new-password': confirmNewPasswordInput
        };

        for (const [id, input] of Object.entries(toggleEls)) {
            const icon = document.getElementById(id);
            if (icon && input) {
                icon.addEventListener('click', () => {
                    const isHidden = input.type === 'password';
                    input.type = isHidden ? 'text' : 'password';
                    icon.classList.toggle('fa-eye-slash', !isHidden);
                    icon.classList.toggle('fa-eye', isHidden);
                });
            }
        }

        if (newPasswordInput) {
            newPasswordInput.addEventListener('input', () => {
                const password = newPasswordInput.value;
                for (const key in changeValidations) {
                    const checkElement = changeStrengthChecks[key];
                    const isValid = changeValidations[key](password);
                    checkElement.classList.toggle('valid', isValid);
                    checkElement.classList.toggle('invalid', !isValid);
                    const icon = checkElement.querySelector('i');
                    if (icon) {
                        icon.className = isValid ? 'fas fa-check-circle' : 'fas fa-times-circle';
                    }
                }
            });
        }

        if (confirmNewPasswordInput) {
            confirmNewPasswordInput.addEventListener('input', () => {
                if (confirmNewPasswordInput.value === newPasswordInput.value) {
                    confirmNewPasswordInput.setCustomValidity('');
                } else {
                    confirmNewPasswordInput.setCustomValidity('Las contraseñas no coinciden.');
                }
            });
        }

        function resetPasswordModal() {
            changePasswordForm.reset();
            changePasswordForm.classList.remove('was-validated');
            confirmNewPasswordInput.setCustomValidity('');
            for (const key in changeStrengthChecks) {
                const checkElement = changeStrengthChecks[key];
                checkElement.classList.remove('valid');
                checkElement.classList.add('invalid');
                const icon = checkElement.querySelector('i');
                if (icon) icon.className = 'fas fa-times-circle';
            }
        }

        if (changePasswordBtn) {
            changePasswordBtn.addEventListener('click', () => {
                resetPasswordModal();
                changePasswordModal.show();
            });
        }

        changePasswordModalEl.addEventListener('hidden.bs.modal', resetPasswordModal);

        if (savePasswordBtn) {
            savePasswordBtn.addEventListener('click', () => {
                if (!changePasswordForm.checkValidity()) {
                    changePasswordForm.classList.add('was-validated');
                    return;
                }

                const newPassword = newPasswordInput.value;
                const allValid = Object.values(changeValidations).every(fn => fn(newPassword));
                if (!allValid) {
                    showAlert('La nueva contraseña no cumple con los requisitos de seguridad.', 'warning');
                    return;
                }

                if (newPassword !== confirmNewPasswordInput.value) {
                    confirmNewPasswordInput.setCustomValidity('Las contraseñas no coinciden.');
                    changePasswordForm.classList.add('was-validated');
                    return;
                }

                const currentPassword = currentPasswordInput.value;
                if (!currentPassword) {
                    showAlert('Debes introducir tu contraseña actual.', 'warning');
                    return;
                }

                showConfirmationModal(
                    'Cambiar contraseña',
                    '¿Seguro que quieres cambiar tu contraseña?',
                    async () => {
                        try {
                            const user = auth.currentUser;
                            const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
                            await user.reauthenticateWithCredential(credential);
                            await user.updatePassword(newPassword);
                            showAlert('Contraseña cambiada con éxito.', 'success');
                            changePasswordModal.hide();
                        } catch (error) {
                            console.error('Error al cambiar la contraseña:', error);
                            if (error.code === 'auth/wrong-password') {
                                showAlert('La contraseña actual no es correcta.', 'danger');
                            } else if (error.code === 'auth/requires-recent-login') {
                                showAlert('Por motivos de seguridad, cierra sesión y vuelve a iniciarla antes de cambiar la contraseña.', 'warning');
                            } else {
                                showAlert('No se pudo cambiar la contraseña. Inténtalo de nuevo.', 'danger');
                            }
                        }
                    }
                );
            });
        }
    }
});