document.addEventListener('DOMContentLoaded', function () {
    const db = firebase.firestore();
    const auth = firebase.auth();
    let mensajesTable;
    let allMensajes = [];
    let currentMensajeId = null;
    let mostrarEnviados = false;

    const modal = new bootstrap.Modal(document.getElementById('mensaje-modal'));
    const modalFecha = document.getElementById('mensaje-modal-fecha');
    const modalTipo = document.getElementById('mensaje-modal-tipo');
    const conversacionContainer = document.getElementById('mensaje-conversacion');
    const respuestaInput = document.getElementById('mensaje-respuesta-input');
    const enviarRespuestaBtn = document.getElementById('mensaje-enviar-respuesta-btn');
    const marcarNoLeidoBtn = document.getElementById('mensaje-marcar-no-leido-btn');

    auth.onAuthStateChanged(function (user) {
        if (!user) {
            document.querySelector('main').innerHTML = '<div class="alert alert-warning">Debes iniciar sesión para ver tus mensajes.</div>';
            return;
        }
        initMensajes(user.uid);
    });

    function initMensajes(uid) {
        initTable();
        loadMensajes(uid);
        setupModalEvents();
        setupFilterToggle();
    }

    function setupFilterToggle() {
        const toggle = document.getElementById('toggle-mostrar-enviados');
        if (!toggle) return;
        toggle.addEventListener('change', function () {
            mostrarEnviados = this.checked;
            const title = document.getElementById('inbox-title');
            if (title) title.textContent = mostrarEnviados ? 'Todos los mensajes' : 'Bandeja de entrada';
            renderTable();
        });
    }

    function esMensajeRecibido(m) {
        if (m.respuestaAdmin) return true;
        if (m.conversacion && Array.isArray(m.conversacion) && m.conversacion.length > 0) {
            return m.conversacion[0].rol === 'equipo';
        }
        return false;
    }

    function renderTable() {
        let data = allMensajes;
        if (!mostrarEnviados) {
            data = data.filter(esMensajeRecibido);
        }
        mensajesTable.clear().rows.add(data).draw();
    }

    function initTable() {
        mensajesTable = $('#mis-mensajes-table').DataTable({
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
                    data: 'tipo', orderable: true,
                    render: function (data) {
                        const labels = { ser_socio: 'Ser socio', actualizar_cuentas: 'Actualizar cuentas', inscripcion_actividad: 'Inscripción actividad' };
                        const colors = { ser_socio: 'bg-success', actualizar_cuentas: 'bg-info text-dark', inscripcion_actividad: 'bg-primary' };
                        return `<span class="badge ${colors[data] || 'bg-secondary'}">${labels[data] || data}</span>`;
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
                        if (row.respuestaAdmin && !row.leidoUser) return '<span class="badge bg-warning" style="color:#000!important">Nueva respuesta</span>';
                        if (row.respuestaAdmin) return '<span class="badge bg-secondary">Respondido</span>';
                        if (!row.leidoUser) return '<span class="badge bg-warning" style="color:#000!important">Nuevo</span>';
                        return '<span class="badge bg-secondary">Leído</span>';
                    }
                },
                {
                    data: null, orderable: false,
                    render: function (row) {
                        const leido = row.leidoUser === true;
                        return `<button class="btn btn-sm ${leido ? 'btn-outline-secondary' : 'btn-warning'} btn-toggle-leido" data-id="${row.id}" data-leido="${leido}" title="${leido ? 'Marcar como no leído' : 'Marcar como leído'}">
                            <i class="fa-solid ${leido ? 'fa-envelope-open' : 'fa-envelope'}"></i>
                        </button>`;
                    }
                }
            ]
        });

        // Click en fila → abre modal
        $('#mis-mensajes-table tbody').on('click', 'tr', function (e) {
            if (e.target.closest('button')) return;
            const data = mensajesTable.row(this).data();
            if (data) abrirMensaje(data);
        });
    }

    function loadMensajes(uid) {
        db.collection('solicitudes')
            .where('userId', '==', uid)
            .get()
            .then(snapshot => {
                allMensajes = [];
                snapshot.forEach(doc => {
                    allMensajes.push({ id: doc.id, ...doc.data() });
                });
                allMensajes.sort((a, b) => {
                    const aTime = a.fecha?.toDate?.()?.getTime() || 0;
                    const bTime = b.fecha?.toDate?.()?.getTime() || 0;
                    return bTime - aTime;
                });
                renderTable();
            })
            .catch(err => {
                console.error('Error cargando mensajes:', err);
                const container = document.querySelector('main .col');
                if (container) {
                    container.innerHTML = '<div class="alert alert-danger">Error al cargar los mensajes. Es posible que Falte un índice en Firestore. Contacta al administrador.</div>';
                }
            });
    }

    function toggleLeidoMensaje(id, marcarLeido) {
        const data = allMensajes.find(m => m.id === id);
        db.collection('solicitudes').doc(id).update({
            leidoUser: marcarLeido,
            leidoUserFecha: marcarLeido ? firebase.firestore.FieldValue.serverTimestamp() : null
        }).then(() => {
            loadMensajes(auth.currentUser.uid);
            if (typeof updateNotificationBubbles === 'function') updateNotificationBubbles();
        }).catch(err => {
            console.error('Error al cambiar estado de lectura:', err);
            window.showAlert('Error al cambiar el estado.', 'danger');
        });
    }

    function setupModalEvents() {
        document.getElementById('mis-mensajes-table').addEventListener('click', function (e) {
            const toggleBtn = e.target.closest('.btn-toggle-leido');
            if (toggleBtn) {
                e.stopPropagation();
                const id = toggleBtn.dataset.id;
                const leido = toggleBtn.dataset.leido === 'true';
                toggleLeidoMensaje(id, !leido);
                return;
            }
        });

        enviarRespuestaBtn.addEventListener('click', function () {
            const respuesta = respuestaInput.value.trim();
            if (!respuesta) { window.showAlert('Escribe un mensaje antes de responder.', 'warning'); return; }
            if (!currentMensajeId) return;
            const data = allMensajes.find(m => m.id === currentMensajeId);
            db.collection('solicitudes').doc(currentMensajeId).update({
                respuestaUser: respuesta,
                respondidoUserFecha: firebase.firestore.FieldValue.serverTimestamp(),
                leidoAdmin: false,
                leidoAdminPor: null,
                leidoAdminFecha: null,
                status: 'pendiente',
                conversacion: firebase.firestore.FieldValue.arrayUnion({
                    rol: 'usuario', mensaje: respuesta, fecha: new Date()
                })
            }).then(() => {
                if (window.auditar) window.auditar('solicitudes', 'responder_usuario', `Usuario respondió a solicitud`, { solicitudId: currentMensajeId, tipo: data?.tipo });
                window.showAlert('Respuesta enviada. El equipo la revisará.', 'success');
                respuestaInput.value = '';
                modal.hide();
                loadMensajes(auth.currentUser.uid);
                if (typeof updateNotificationBubbles === 'function') updateNotificationBubbles();
            }).catch(err => {
                console.error('Error al responder:', err);
                window.showAlert('Error al enviar la respuesta.', 'danger');
            });
        });

        if (marcarNoLeidoBtn) {
            marcarNoLeidoBtn.addEventListener('click', function () {
                if (!currentMensajeId) return;
                toggleLeidoMensaje(currentMensajeId, false);
                marcarNoLeidoBtn.classList.add('d-none');
                modal.hide();
            });
        }

        document.getElementById('mensaje-modal').addEventListener('hidden.bs.modal', function () {
            currentMensajeId = null;
            respuestaInput.value = '';
        });
    }

    function abrirMensaje(data) {
        currentMensajeId = data.id;
        modalFecha.textContent = data.fecha && data.fecha.toDate ? data.fecha.toDate().toLocaleString('es-ES') : '-';
        const tipoLabels = { ser_socio: 'Ser socio', actualizar_cuentas: 'Actualizar cuentas', inscripcion_actividad: 'Inscripción actividad' };
        modalTipo.textContent = tipoLabels[data.tipo] || data.tipo;

        // Render conversación
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
                <div class="mb-3 ${isEquipo ? '' : 'text-end'}">
                    <div class="d-inline-block p-2 rounded ${isEquipo ? 'bg-primary text-white' : 'bg-light'}" style="max-width:85%">
                        <small class="fw-bold d-block">${isEquipo ? 'Equipo' : 'Tú'}</small>
                        <p class="mb-0" style="white-space: pre-wrap;">${escapeHtml2(msg.mensaje)}</p>
                        ${fecha ? `<small class="${isEquipo ? 'text-white-50' : 'text-muted'}">${fecha}</small>` : ''}
                    </div>
                </div>`;
        });
        conversacionContainer.innerHTML = html;

        // Mostrar botón "marcar como no leído" si ya estaba leído
        if (marcarNoLeidoBtn) {
            if (data.leidoUser === true) {
                marcarNoLeidoBtn.classList.remove('d-none');
            } else {
                marcarNoLeidoBtn.classList.add('d-none');
            }
        }

        modal.show();

        // Scroll al final de la conversación al abrir
        if (conversacionContainer) {
            setTimeout(() => { conversacionContainer.scrollTop = conversacionContainer.scrollHeight; }, 150);
        }

        // Marcar como leído por usuario si no lo estaba
        if (!data.leidoUser) {
            db.collection('solicitudes').doc(data.id).update({
                leidoUser: true,
                leidoUserFecha: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                if (marcarNoLeidoBtn) marcarNoLeidoBtn.classList.remove('d-none');
                loadMensajes(auth.currentUser.uid);
                if (typeof updateNotificationBubbles === 'function') updateNotificationBubbles();
            }).catch(err => console.error('Error al marcar como leído:', err));
        }
    }

    function escapeHtml2(text) {
        if (!text) return '';
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }
});
