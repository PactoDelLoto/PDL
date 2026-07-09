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

    function renderTable() {
        let data = allMensajes;
        if (!mostrarEnviados) {
            data = data.filter(m => m.respuestaAdmin);
        }
        mensajesTable.clear().rows.add(data).draw();
    }

    function initTable() {
        mensajesTable = $('#mis-mensajes-table').DataTable({
            language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
            responsive: true,
            pageLength: 15,
            order: [[0, 'desc']],
            data: [],
            columns: [
                {
                    data: 'fecha', orderable: true,
                    render: function (data) {
                        if (!data || !data.toDate) return '-';
                        return data.toDate().toLocaleString('es-ES');
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
                        if (row.respuestaAdmin && !row.leidoUser) return '<span class="badge bg-warning text-dark">Nueva respuesta</span>';
                        if (row.respuestaAdmin) return '<span class="badge bg-secondary">Respondido</span>';
                        return '<span class="badge bg-info text-dark">Enviado</span>';
                    }
                },
                {
                    data: null, orderable: false,
                    render: function (row) {
                        const unreadClass = (row.respuestaAdmin && !row.leidoUser) ? 'btn-warning' : 'btn-outline-secondary';
                        return `<button class="btn btn-sm ${unreadClass} btn-ver-mensaje" data-id="${row.id}" title="Ver"><i class="fa-solid fa-eye"></i></button>`;
                    }
                }
            ]
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

    function setupModalEvents() {
        document.getElementById('mis-mensajes-table').addEventListener('click', function (e) {
            const verBtn = e.target.closest('.btn-ver-mensaje');
            if (verBtn) {
                const id = verBtn.dataset.id;
                const data = allMensajes.find(m => m.id === id);
                if (data) abrirMensaje(data);
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
                <div class="mb-3 ${isEquipo ? 'text-end' : ''}">
                    <div class="d-inline-block p-2 rounded ${isEquipo ? 'bg-primary text-white' : 'bg-light'}" style="max-width:85%">
                        <small class="fw-bold d-block">${isEquipo ? 'Equipo' : 'Tú'}</small>
                        <p class="mb-0" style="white-space: pre-wrap;">${escapeHtml2(msg.mensaje)}</p>
                        ${fecha ? `<small class="${isEquipo ? 'text-white-50' : 'text-muted'}">${fecha}</small>` : ''}
                    </div>
                </div>`;
        });
        conversacionContainer.innerHTML = html;

        modal.show();

        // Scroll al final de la conversación al abrir
        if (conversacionContainer) {
            setTimeout(() => { conversacionContainer.scrollTop = conversacionContainer.scrollHeight; }, 150);
        }

        // Marcar como leído por usuario si hay respuesta sin leer
        if (data.respuestaAdmin && !data.leidoUser) {
            db.collection('solicitudes').doc(data.id).update({
                leidoUser: true,
                leidoUserFecha: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
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
