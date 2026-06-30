document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    const form = document.getElementById('sugerencia-form');
    const nameInput = document.getElementById('sugerencia-name');
    const messageInput = document.getElementById('sugerencia-message');
    const submitBtn = document.getElementById('sugerencia-submit-btn');
    const successMsg = document.getElementById('sugerencia-success');

    const adminTabLi = document.getElementById('admin-tab-li');
    const showReadCheck = document.getElementById('show-read-sugerencias');
    const messageModal = new bootstrap.Modal(document.getElementById('messageModal'));
    const modalName = document.getElementById('modal-name');
    const modalDate = document.getElementById('modal-date');
    const modalMessage = document.getElementById('modal-message');
    const modalDeleteBtn = document.getElementById('modal-delete-btn');

    let messagesTable = null;
    let userRole = null;
    let currentMessageId = null;

    auth.onAuthStateChanged(async user => {
        if (user) {
            try {
                const doc = await db.collection('usuarios').doc(user.uid).get();
                if (doc.exists) {
                    const data = doc.data();
                    if (data.isAdmin) userRole = 'admin';
                    else if (data.isSocio) userRole = 'socio';
                    else userRole = 'viewer';
                }
            } catch (e) {
                userRole = null;
            }
            if (userRole === 'admin') {
                adminTabLi.style.display = '';
                if (!messagesTable) initMessagesTable();
                loadMessages();
                if (showReadCheck) showReadCheck.addEventListener('change', () => { if (messagesTable) messagesTable.draw(); });
            }
        } else {
            userRole = null;
        }
    });

    if (form) {
        form.addEventListener('submit', async e => {
            e.preventDefault();
            submitBtn.disabled = true;

            try {
                await db.collection('sugerencias').add({
                    nombre: nameInput.value.trim() || 'Anónimo',
                    mensaje: messageInput.value.trim(),
                    fecha: firebase.firestore.Timestamp.now(),
                    leido: false
                });
                form.reset();
                successMsg.classList.remove('d-none');
                setTimeout(() => successMsg.classList.add('d-none'), 5000);
            } catch (error) {
                showAlert('Error al enviar la sugerencia. Inténtalo de nuevo.', 'danger');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }

    function initMessagesTable() {
        if ($.fn.DataTable.isDataTable('#messages-table')) return;

        $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
            if (settings.nTable.id !== 'messages-table') return true;
            if (showReadCheck && showReadCheck.checked) return true;
            const rowData = messagesTable.row(dataIndex).data();
            return rowData && !rowData.leido;
        });

        messagesTable = $('#messages-table').DataTable({
            language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
            pageLength: 10,
            order: [[0, 'desc']],
            columns: [
                {
                    data: 'fecha',
                    render: data => data && data.toDate
                        ? data.toDate().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : ''
                },
                { data: 'nombre' },
                {
                    data: 'mensaje',
                    render: data => `<div class="text-truncate" style="max-width:300px" title="${escapeHtml2(data)}">${escapeHtml2(data)}</div>`
                },
                {
                    data: 'leido',
                    className: 'text-center',
                    render: data => data
                        ? '<span class="badge bg-secondary"><i class="fa-solid fa-check"></i></span>'
                        : '<span class="badge bg-primary">Nuevo</span>'
                },
                {
                    data: null,
                    orderable: false,
                    className: 'text-center',
                    render: function (data, type, row) {
                        const leerBtn = row.leido
                            ? `<button class="btn btn-sm btn-outline-secondary btn-toggle-leido" data-id="${row.id}" data-estado="no" title="Marcar como no leído"><i class="fa-solid fa-envelope"></i></button>`
                            : `<button class="btn btn-sm btn-outline-primary btn-toggle-leido" data-id="${row.id}" data-estado="si" title="Marcar como leído"><i class="fa-solid fa-envelope-open"></i></button>`;
                        const borrarBtn = `<button class="btn btn-sm btn-outline-danger btn-borrar-mensaje" data-id="${row.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>`;
                        return `<div class="d-flex gap-1 justify-content-center">${leerBtn}${borrarBtn}</div>`;
                    }
                }
            ],
            drawCallback: function () {
                $('#messages-table tbody').off('click').on('click', 'tr', function () {
                    const data = messagesTable.row(this).data();
                    if (data) abrirSugerencia(data);
                }).on('click', '.btn-toggle-leido', function (e) {
                    e.stopPropagation();
                    const id = $(this).data('id');
                    const estado = $(this).data('estado') === 'si';
                    marcarLeido(id, estado);
                }).on('click', '.btn-borrar-mensaje', function (e) {
                    e.stopPropagation();
                    borrarSugerencia($(this).data('id'));
                });
            }
        });
    }

    async function loadMessages() {
        try {
            const snapshot = await db.collection('sugerencias').orderBy('fecha', 'desc').get();
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            messagesTable.clear().rows.add(data).draw();
        } catch (e) {
            console.error('Error al cargar sugerencias:', e);
        }
    }

    async function abrirSugerencia(data) {
        currentMessageId = data.id;
        modalName.textContent = data.nombre;
        modalDate.textContent = data.fecha && data.fecha.toDate
            ? data.fecha.toDate().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '';
        modalMessage.textContent = data.mensaje;
        messageModal.show();

        if (!data.leido) {
            try {
                await db.collection('sugerencias').doc(data.id).update({ leido: true });
                loadMessages();
            } catch (e) {
                console.error('Error al marcar como leído:', e);
            }
        }
    }

    modalDeleteBtn.addEventListener('click', () => {
        if (currentMessageId) {
            borrarSugerencia(currentMessageId, () => {
                messageModal.hide();
            });
        }
    });

    async function marcarLeido(id, leido) {
        try {
            await db.collection('sugerencias').doc(id).update({ leido });
            loadMessages();
        } catch (e) {
            showAlert('Error al actualizar la sugerencia.', 'danger');
        }
    }

    async function borrarSugerencia(id, onDone) {
        showConfirmationModal('Eliminar sugerencia', '¿Seguro que quieres eliminar esta sugerencia?', async () => {
            try {
                await db.collection('sugerencias').doc(id).delete();
                if (currentMessageId === id) currentMessageId = null;
                loadMessages();
                if (onDone) onDone();
            } catch (e) {
                showAlert('Error al eliminar la sugerencia.', 'danger');
            }
        });
    }

    function escapeHtml2(text) {
        return String(text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
});
