document.addEventListener('DOMContentLoaded', function () {
    const db = firebase.firestore();
    const auth = firebase.auth();
    let solicitudesTable;
    let allSolicitudes = [];
    let currentSolicitudId = null;

    const filterTipo = document.getElementById('filter-solicitud-tipo');
    const showRead = document.getElementById('show-read-solicitudes');

    const modal = new bootstrap.Modal(document.getElementById('solicitud-modal'));
    const modalUser = document.getElementById('solicitud-modal-user');
    const modalFecha = document.getElementById('solicitud-modal-fecha');
    const modalTipo = document.getElementById('solicitud-modal-tipo');
    const conversacionContainer = document.getElementById('solicitud-conversacion');
    const respuestaInput = document.getElementById('solicitud-respuesta-input');
    const enviarRespuestaBtn = document.getElementById('solicitud-enviar-respuesta-btn');
    const eliminarBtn = document.getElementById('solicitud-eliminar-btn');
    const marcarNoLeidoBtn = document.getElementById('solicitud-marcar-no-leido-btn');

    auth.onAuthStateChanged(async function (user) {
        if (!user) return;
        const isAdmin = await window.isUserAdmin();
        if (!isAdmin) return;
        initSolicitudes();
    });

    function initSolicitudes() {
        initTable();
        loadSolicitudes();
        setupFilters();
        setupModalEvents();
    }

    function initTable() {
        solicitudesTable = $('#solicitudes-table').DataTable({
            language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
            responsive: true,
            pageLength: 15,
            order: [],
            data: [],
            columns: [
                {
                    data: function (row) { return row.fecha?.toDate?.()?.getTime() || 0; },
                    render: function (data, type, row) {
                        if (!row.fecha || !row.fecha.toDate) return '-';
                        return row.fecha.toDate().toLocaleString('es-ES');
                    }
                },
                {
                    data: null, orderable: true,
                    render: function (row) {
                        return `<strong>${escapeHtml2(row.userName || 'Desconocido')}</strong><br><small class="text-muted">${escapeHtml2(row.userEmail || '')}</small>`;
                    }
                },
                {
                    data: 'tipo', orderable: true,
                    render: function (data) {
                        const labels = { ser_socio: 'Ser socio', actualizar_cuentas: 'Actualizar cuentas', inscripcion_actividad: 'Inscripción actividad' };
                        const colors = { ser_socio: 'bg-success', actualizar_cuentas: 'bg-info text-dark', inscripcion_actividad: 'bg-primary' };
                        const color = colors[data] || 'bg-secondary';
                        const label = labels[data] || data;
                        return `<span class="badge ${color}">${label}</span>`;
                    }
                },
                {
                    data: 'mensaje', orderable: false,
                    render: function (data) {
                        const text = data || '';
                        return text.length > 80 ? escapeHtml2(text.substring(0, 80)) + '...' : escapeHtml2(text);
                    }
                },
                {
                    data: null, orderable: true,
                    render: function (row) {
                        if (row.respuestaUser && !row.leidoAdmin) return '<span class="badge bg-info text-dark">Respuesta usuario</span>';
                        if (row.respuestaUser) return '<span class="badge bg-secondary">Respuesta usuario</span>';
                        if (row.status === 'respondido' && row.leidoUser) return '<span class="badge bg-secondary">Respondido</span>';
                        if (row.status === 'respondido') return '<span class="badge bg-warning text-dark">Respondido</span>';
                        if (row.leidoAdmin) return '<span class="badge bg-secondary">Leído</span>';
                        return '<span class="badge bg-danger">Nuevo</span>';
                    }
                },
                {
                    data: null, orderable: false,
                    render: function (row) {
                        const leido = row.leidoAdmin;
                        return `
                            <button class="btn btn-sm ${leido ? 'btn-outline-secondary' : 'btn-warning'} btn-toggle-leido" data-id="${row.id}" data-leido="${leido}" title="${leido ? 'Marcar como no leído' : 'Marcar como leído'}">
                                <i class="fa-solid ${leido ? 'fa-envelope-open' : 'fa-envelope'}"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger btn-eliminar-solicitud" data-id="${row.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                        `;
                    }
                }
            ]
        });

        // Click en fila → abre modal
        $('#solicitudes-table tbody').on('click', 'tr', function (e) {
            if (e.target.closest('button')) return;
            const data = solicitudesTable.row(this).data();
            if (data) abrirSolicitud(data);
        });
    }

    function loadSolicitudes() {
        db.collection('solicitudes')
            .orderBy('fecha', 'desc')
            .limit(500)
            .get()
            .then(snapshot => {
                allSolicitudes = [];
                snapshot.forEach(doc => {
                    allSolicitudes.push({ id: doc.id, ...doc.data() });
                });
                applyFilters();
            })
            .catch(err => console.error('Error cargando solicitudes:', err));
    }

    function applyFilters() {
        const tipo = filterTipo.value;
        const mostrarLeidos = showRead.checked;
        let filtered = allSolicitudes;
        if (tipo) filtered = filtered.filter(s => s.tipo === tipo);
        if (!mostrarLeidos) filtered = filtered.filter(s => !s.leidoAdmin);
        solicitudesTable.clear().rows.add(filtered).draw();
    }

    function setupFilters() {
        $(filterTipo).on('change', applyFilters);
        $(showRead).on('change', applyFilters);
    }

    function toggleLeidoSolicitud(id, marcarLeido) {
        const data = allSolicitudes.find(s => s.id === id);
        const update = {
            leidoAdmin: marcarLeido,
            leidoAdminPor: marcarLeido ? auth.currentUser.uid : null,
            leidoAdminFecha: marcarLeido ? firebase.firestore.FieldValue.serverTimestamp() : null
        };
        db.collection('solicitudes').doc(id).update(update).then(() => {
            if (window.auditar) window.auditar('solicitudes', marcarLeido ? 'marcar_leido' : 'marcar_no_leido', `Solicitud ${marcarLeido ? 'marcada como leída' : 'marcada como no leída'}`, { solicitudId: id, tipo: data?.tipo });
            loadSolicitudes();
            if (typeof updateNotificationBubbles === 'function') updateNotificationBubbles();
        }).catch(err => {
            console.error('Error al cambiar estado de lectura:', err);
            window.showAlert('Error al cambiar el estado.', 'danger');
        });
    }

    function setupModalEvents() {
        document.getElementById('solicitudes-table').addEventListener('click', function (e) {
            const toggleBtn = e.target.closest('.btn-toggle-leido');
            if (toggleBtn) {
                e.stopPropagation();
                const id = toggleBtn.dataset.id;
                const leido = toggleBtn.dataset.leido === 'true';
                toggleLeidoSolicitud(id, !leido);
                return;
            }
            const elimBtn = e.target.closest('.btn-eliminar-solicitud');
            if (elimBtn) {
                e.stopPropagation();
                const id = elimBtn.dataset.id;
                borrarSolicitud(id);
                return;
            }
        });

        enviarRespuestaBtn.addEventListener('click', function () {
            const respuesta = respuestaInput.value.trim();
            if (!respuesta) { window.showAlert('Escribe una respuesta antes de enviar.', 'warning'); return; }
            if (!currentSolicitudId) return;
            const data = allSolicitudes.find(s => s.id === currentSolicitudId);
            db.collection('solicitudes').doc(currentSolicitudId).update({
                respuestaAdmin: respuesta,
                respondidoAdminPor: auth.currentUser.uid,
                respondidoAdminFecha: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'respondido',
                leidoUser: false,
                leidoUserFecha: null,
                conversacion: firebase.firestore.FieldValue.arrayUnion({
                    rol: 'equipo', mensaje: respuesta, fecha: new Date()
                })
            }).then(() => {
                if (window.auditar) window.auditar('solicitudes', 'responder', `Respuesta enviada a ${data?.userName || 'usuario'}`, { solicitudId: currentSolicitudId, tipo: data?.tipo });
                window.showAlert('Respuesta enviada correctamente.', 'success');
                respuestaInput.value = '';
                modal.hide();
                loadSolicitudes();
                if (typeof updateNotificationBubbles === 'function') updateNotificationBubbles();
            }).catch(err => {
                console.error('Error al responder:', err);
                window.showAlert('Error al enviar la respuesta.', 'danger');
            });
        });

        eliminarBtn.addEventListener('click', function () {
            if (!currentSolicitudId) return;
            const data = allSolicitudes.find(s => s.id === currentSolicitudId);
            window.showConfirmationModal('Eliminar solicitud', '¿Estás seguro de eliminar esta solicitud?', () => {
                db.collection('solicitudes').doc(currentSolicitudId).delete().then(() => {
                    if (window.auditar) window.auditar('solicitudes', 'eliminar', `Solicitud eliminada de ${data?.userName || 'usuario'}`, { solicitudId: currentSolicitudId, tipo: data?.tipo });
                    window.showAlert('Solicitud eliminada.', 'success');
                    modal.hide();
                    loadSolicitudes();
                    if (typeof updateNotificationBubbles === 'function') updateNotificationBubbles();
                }).catch(err => {
                    console.error('Error al eliminar:', err);
                    window.showAlert('Error al eliminar la solicitud.', 'danger');
                });
            });
        });

        if (marcarNoLeidoBtn) {
            marcarNoLeidoBtn.addEventListener('click', function () {
                if (!currentSolicitudId) return;
                toggleLeidoSolicitud(currentSolicitudId, false);
                marcarNoLeidoBtn.classList.add('d-none');
                modal.hide();
            });
        }

        document.getElementById('solicitud-modal').addEventListener('hidden.bs.modal', function () {
            currentSolicitudId = null;
            respuestaInput.value = '';
        });
    }

    function abrirSolicitud(data) {
        currentSolicitudId = data.id;
        modalUser.textContent = data.userName || 'Desconocido';
        modalFecha.textContent = data.fecha && data.fecha.toDate ? data.fecha.toDate().toLocaleString('es-ES') : '-';
        const tipoLabels = { ser_socio: 'Ser socio', actualizar_cuentas: 'Actualizar cuentas', inscripcion_actividad: 'Inscripción actividad' };
        modalTipo.textContent = tipoLabels[data.tipo] || data.tipo;

        renderConversacion(data, conversacionContainer);

        // Mostrar botón "marcar como no leído" si ya estaba leído
        if (marcarNoLeidoBtn) {
            if (data.leidoAdmin) {
                marcarNoLeidoBtn.classList.remove('d-none');
            } else {
                marcarNoLeidoBtn.classList.add('d-none');
            }
        }

        modal.show();

        if (conversacionContainer) {
            setTimeout(() => { conversacionContainer.scrollTop = conversacionContainer.scrollHeight; }, 150);
        }

        // Marcar como leído por admin si no lo estaba
        if (!data.leidoAdmin) {
            db.collection('solicitudes').doc(data.id).update({
                leidoAdmin: true,
                leidoAdminPor: auth.currentUser.uid,
                leidoAdminFecha: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                if (window.auditar) window.auditar('solicitudes', 'leer', `Solicitud leída de ${data.userName || 'usuario'}`, { solicitudId: data.id, tipo: data.tipo });
                if (marcarNoLeidoBtn) marcarNoLeidoBtn.classList.remove('d-none');
                loadSolicitudes();
                if (typeof updateNotificationBubbles === 'function') updateNotificationBubbles();
            }).catch(err => console.error('Error al marcar como leído:', err));
        }
    }

    function renderConversacion(data, container) {
        if (!container) return;
        let mensajes = data.conversacion || [];
        if (mensajes.length === 0) {
            if (data.mensaje) mensajes.push({ rol: 'usuario', mensaje: data.mensaje, fecha: data.fecha });
            if (data.respuestaAdmin) mensajes.push({ rol: 'equipo', mensaje: data.respuestaAdmin, fecha: data.respondidoAdminFecha });
            if (data.respuestaUser) mensajes.push({ rol: 'usuario', mensaje: data.respuestaUser, fecha: data.respondidoUserFecha });
        }
        let html = '';
        mensajes.forEach(msg => {
            const isEquipo = msg.rol === 'equipo';
            const fecha = msg.fecha ? (msg.fecha.toDate ? msg.fecha.toDate().toLocaleString('es-ES') : '') : '';
            html += `
                <div class="mb-3 ${isEquipo ? 'text-end' : ''}">
                    <div class="d-inline-block p-2 rounded ${isEquipo ? 'bg-primary text-white' : 'bg-light'}" style="max-width:85%">
                        <small class="fw-bold d-block">${isEquipo ? 'Equipo' : 'Usuario'}</small>
                        <p class="mb-0" style="white-space: pre-wrap;">${escapeHtml2(msg.mensaje)}</p>
                        ${fecha ? `<small class="${isEquipo ? 'text-white-50' : 'text-muted'}">${fecha}</small>` : ''}
                    </div>
                </div>`;
        });
        container.innerHTML = html;
    }

    function borrarSolicitud(id) {
        const data = allSolicitudes.find(s => s.id === id);
        window.showConfirmationModal('Eliminar solicitud', '¿Estás seguro de eliminar esta solicitud?', () => {
            db.collection('solicitudes').doc(id).delete().then(() => {
                if (window.auditar) window.auditar('solicitudes', 'eliminar', `Solicitud eliminada de ${data?.userName || 'usuario'}`, { solicitudId: id, tipo: data?.tipo });
                window.showAlert('Solicitud eliminada.', 'success');
                loadSolicitudes();
            }).catch(err => {
                console.error('Error al eliminar:', err);
                window.showAlert('Error al eliminar la solicitud.', 'danger');
            });
        });
    }

    function escapeHtml2(text) {
        if (!text) return '';
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }
});
