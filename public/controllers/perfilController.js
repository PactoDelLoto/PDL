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
    const adminBadge = document.getElementById('profile-admin-badge');
    const activitiesLoading = document.getElementById('profile-activities-loading');
    const activitiesEmpty = document.getElementById('profile-activities-empty');
    const activitiesList = document.getElementById('profile-activities-list');

    let currentUser = null;

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
    });

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
            updateRoleBadge(adminBadge, 'Admin', userData.isAdmin === true);

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

        try {
            const snapshot = await db.collectionGroup('inscripciones')
                .where('userId', '==', user.uid)
                .get();

            const activities = await Promise.all(snapshot.docs.map(async doc => {
                const registration = doc.data();
                const subeventRef = doc.ref.parent.parent;
                if (!subeventRef) return null;

                const subeventDoc = await subeventRef.get();
                if (!subeventDoc.exists) return null;

                const subevent = subeventDoc.data();
                return {
                    id: subeventDoc.id,
                    registration,
                    subevent
                };
            }));

            const validActivities = activities
                .filter(Boolean)
                .sort((a, b) => getActivityDate(a.subevent) - getActivityDate(b.subevent));

            renderUserActivities(validActivities);
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

    function renderUserActivities(activities) {
        if (!activities.length) {
            activitiesEmpty.classList.remove('d-none');
            return;
        }

        activitiesList.innerHTML = activities.map(({ id, registration, subevent }) => {
            const isPaid = registration.pagado === true;
            const statusClass = isPaid ? 'bg-success' : 'bg-warning text-dark';
            const statusText = isPaid ? 'Inscrito' : 'Reservado';
            const dateText = formatActivityDate(subevent);
            const placeText = escapeText(subevent.lugar || 'Lugar por confirmar');

            return `
                <a href="/subeventoDetalle.html?id=${encodeURIComponent(id)}" class="list-group-item list-group-item-action">
                    <div class="d-flex w-100 justify-content-between gap-3">
                        <h5 class="mb-1">${escapeText(subevent.titulo || 'Actividad sin titulo')}</h5>
                        <span class="badge ${statusClass} align-self-start">${statusText}</span>
                    </div>
                    <p class="mb-1">${dateText}</p>
                    <small class="text-muted">${placeText}</small>
                </a>
            `;
        }).join('');
    }

    function getActivityDate(subevent) {
        if (!subevent.fechaEvento) return new Date(8640000000000000);
        const date = new Date(`${subevent.fechaEvento}T${subevent.horaEvento || '00:00'}`);
        return Number.isNaN(date.getTime()) ? new Date(8640000000000000) : date;
    }

    function formatActivityDate(subevent) {
        const date = getActivityDate(subevent);
        if (Number.isNaN(date.getTime())) return 'Fecha por confirmar';

        const formattedDate = date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
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
        if (activitiesLoading) activitiesLoading.classList.toggle('d-none', !isLoading);
    }

    function updateRoleBadge(element, label, isActive) {
        element.textContent = `${label}: ${isActive ? 'Si' : 'No'}`;
        element.className = `badge ${isActive ? 'bg-success' : 'bg-secondary'} me-2`;
    }

    function showLoading(isLoading) {
        loadingBox.classList.toggle('d-none', !isLoading);
    }
});
