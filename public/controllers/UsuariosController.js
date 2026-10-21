document.addEventListener('DOMContentLoaded', function () {
    const db = firebase.firestore();
    const auth = firebase.auth();

    const usuariosTableElement = document.getElementById('usuarios-table');
    if (usuariosTableElement) {
        let currentUserIsAdmin = false;

        auth.onAuthStateChanged(user => {
            if (user) {
                window.isUserAdmin().then(isAdmin => {
                    currentUserIsAdmin = isAdmin;
                    if (currentUserIsAdmin) {
                        initializeUsersTable();
                    } else {
                        document.querySelector('main').innerHTML = '<div class="alert alert-danger">Acceso denegado. Solo los administradores pueden ver esta sección.</div>';
                    }
                });
            } else {
                document.querySelector('main').innerHTML = '<div class="alert alert-danger">Acceso denegado. Por favor, inicie sesión.</div>';
            }
        });
    }
});

let usersTable;
const editUserModalEl = document.getElementById('edit-user-modal');
const editUserModal = editUserModalEl ? new bootstrap.Modal(editUserModalEl) : null;
const filterRol = document.getElementById('filter-rol');
let filterEstadoPagoVal = '';
let verDesactivados = false;
const filterEstadoPagoContainer = document.getElementById('filter-estado-pago-container');
const filterEstadoPagoBtn = document.getElementById('filter-estado-pago-btn');
const filterEstadoPagoMenu = document.getElementById('filter-estado-pago-menu');
const btnExportarCsv = document.getElementById('btn-exportar-csv');

function calcularMesesDeuda(pagadoHasta) {
    if (!pagadoHasta || !pagadoHasta.toDate) return 0;
    const d = pagadoHasta.toDate();
    const pagado = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const hoy = new Date();
    const hoyNorm = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (pagado >= hoyNorm) return 0;
    const primerMesDeuda = new Date(pagado.getFullYear(), pagado.getMonth() + 1, 1);
    const hoyPrimerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    if (hoyPrimerDia < primerMesDeuda) return 0;
    return (hoyPrimerDia.getFullYear() - primerMesDeuda.getFullYear()) * 12
        + hoyPrimerDia.getMonth() - primerMesDeuda.getMonth() + 1;
}

function getEstadoDeuda(pagadoHasta) {
    const meses = calcularMesesDeuda(pagadoHasta);
    if (meses === 0) return null;
    if (meses === 1) return 'debe1';
    if (meses === 2) return 'debe2';
    return 'debe3';
}

// Valor numérico para ordenar la columna "Al corriente":
// 0 = al corriente, 1..3 = debe 1/2/3 meses, 4 = socio sin datos, 5 = no socio.
function getOrdenAlCorriente(row) {
    if (row.alCorriente) return 0;
    if (!row.isSocio) return 5;
    const estado = getEstadoDeuda(row.pagadoHasta);
    if (estado === 'debe1') return 1;
    if (estado === 'debe2') return 2;
    if (estado === 'debe3') return 3;
    return 4;
}

function normalizarFecha(timestamp) {
    if (!timestamp || !timestamp.toDate) return null;
    const d = timestamp.toDate();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Nombre completo para los mensajes de auditoría (nombre + apellidos).
function nombreCompletoUsuario(userData) {
    const nombre = `${userData.nombre || ''} ${userData.apellidos || ''}`.trim();
    return nombre || userData.correo || userData.id || 'usuario desconocido';
}

// Datos identificativos extra (correo, DNI, teléfono) para detallar la auditoría.
function datosExtraUsuario(userData) {
    const partes = [];
    if (userData.correo) partes.push(userData.correo);
    if (userData.dni) partes.push(`DNI ${userData.dni}`);
    if (userData.telefono) partes.push(`tel. ${userData.telefono}`);
    return partes.length ? ` (${partes.join(', ')})` : '';
}

function initializeUsersTable() {
    usersTable = $('#usuarios-table').DataTable({
        language: {
            url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json"
        },
        responsive: true,
        pageLength: 25,
        destroy: true,
        columns: [
            {
                data: null, orderable: true, searchable: true,
                render: function (data, type, row) {
                    const nombre = row.nombre || '';
                    const apellidos = row.apellidos || '';
                    const telefono = row.telefono || '';
                    const correo = row.correo || '';
                    const fechaReg = row.timestamp && row.timestamp.toDate
                        ? row.timestamp.toDate().toLocaleDateString('es-ES')
                        : '';
                    return `<div class="d-flex align-items-center gap-2">
                        <span class="fw-semibold text-nowrap">${nombre} ${apellidos}</span>
                        <span class="text-muted small d-none d-sm-inline">${correo}</span>
                    </div>`;
                },
                responsivePriority: 1
            },
            {
                data: null, orderable: true, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    if (row.isAdmin) return '<span class="badge bg-primary" style="font-size:0.65rem">Admin</span>';
                    if (row.isColaborador) return '<span class="badge bg-info" style="font-size:0.65rem">Colab</span>';
                    if (row.isSocio) return '<span class="badge bg-success" style="font-size:0.65rem">Socio</span>';
                    return '<span class="badge bg-secondary" style="font-size:0.65rem">User</span>';
                },
                responsivePriority: 2
            },
            {
                data: null, orderable: true, type: 'num', searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    if (type === 'sort' || type === 'type' || type === 'filter') {
                        return getOrdenAlCorriente(row);
                    }
                    if (row.alCorriente) {
                        return '<span class="badge bg-success" data-bs-toggle="tooltip" title="Al corriente de pago"><i class="fa-solid fa-check"></i></span>';
                    }
                    if (!row.isSocio) {
                        return '<span class="badge bg-secondary" data-bs-toggle="tooltip" title="No es socio"><i class="fa-solid fa-xmark"></i></span>';
                    }
                    const estado = getEstadoDeuda(row.pagadoHasta);
                    if (estado === 'debe3') {
                        return '<span class="badge bg-danger" data-bs-toggle="tooltip" title="Debe 3 o más meses"><i class="fa-solid fa-triangle-exclamation"></i></span>';
                    }
                    if (estado === 'debe2') {
                        return '<span class="badge bg-warning text-dark" data-bs-toggle="tooltip" title="Debe 2 meses"><i class="fa-solid fa-triangle-exclamation"></i></span>';
                    }
                    if (estado === 'debe1') {
                        return '<span class="badge bg-info" data-bs-toggle="tooltip" title="Debe 1 mes"><i class="fa-solid fa-triangle-exclamation"></i></span>';
                    }
                    return '<span class="badge bg-secondary"><i class="fa-solid fa-xmark"></i></span>';
                },
                responsivePriority: 4
            },
            {
                data: null, orderable: false, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    const months = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                    let selected = '';
                    if (row.pagadoHasta && row.pagadoHasta.toDate) {
                        selected = row.pagadoHasta.toDate().getMonth() + 1;
                    }
                    let html = `<select class="form-select form-select-sm user-pagado-hasta" style="min-width:90px;font-size:0.7rem" data-id="${row.id}">`;
                    html += '<option value="">—</option>';
                    for (let i = 1; i <= 12; i++) {
                        html += `<option value="${i}"${selected == i ? ' selected' : ''}>${months[i]}</option>`;
                    }
                    return html + '</select>';
                },
                responsivePriority: 3
            },
            {
                data: null, orderable: false, searchable: false, className: 'text-center',
                render: function (data, type, row) {
                    const isMe = row.id === firebase.auth().currentUser.uid;
                    const meBadge = isMe ? '<span class="badge bg-info me-1" style="font-size:0.6rem">Tú</span>' : '';
                    const nombreCompleto = nombreCompletoUsuario(row);

                    if (verDesactivados) {
                        return `<div class="d-flex align-items-center justify-content-center gap-1">
                            ${meBadge}
                            <div class="dropdown">
                                <button class="btn btn-sm btn-secondary dropdown-toggle py-0 px-1" type="button" data-bs-toggle="dropdown" title="Acciones">
                                    <i class="fa-solid fa-gear"></i>
                                </button>
                                <ul class="dropdown-menu dropdown-menu-end" style="min-width:160px;font-size:0.85rem">
                                    <li><button class="dropdown-item edit-user-btn" data-id="${row.id}"><i class="fa-solid fa-pen me-2"></i>Editar</button></li>
                                    <li><button class="dropdown-item text-success reactivate-user-btn" data-id="${row.id}" data-name="${nombreCompleto}" data-correo="${row.correo || ''}" data-dni="${row.dni || ''}" data-telefono="${row.telefono || ''}"><i class="fa-solid fa-rotate-left me-2"></i>Reactivar</button></li>
                                </ul>
                            </div>
                        </div>`;
                    }

                    const socioIcon = row.isSocio ? 'fa-user-minus' : 'fa-user-plus';
                    const socioText = row.isSocio ? 'Quitar Socio' : 'Hacer Socio';

                    const colabIcon = row.isColaborador ? 'fa-user-gear' : 'fa-user-gear';
                    const colabText = row.isColaborador ? 'Quitar Colab' : 'Hacer Colab';

                    const adminIcon = row.isAdmin ? 'fa-shield-halved' : 'fa-shield';
                    const adminText = row.isAdmin ? 'Quitar Admin' : 'Hacer Admin';

                    return `<div class="d-flex align-items-center justify-content-center gap-1">
                        ${meBadge}
                        <div class="dropdown">
                            <button class="btn btn-sm btn-secondary dropdown-toggle py-0 px-1" type="button" data-bs-toggle="dropdown" title="Acciones">
                                <i class="fa-solid fa-gear"></i>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end" style="min-width:160px;font-size:0.85rem">
                                <li><button class="dropdown-item toggle-socio-btn" data-id="${row.id}" data-name="${nombreCompleto}"><i class="fa-solid ${socioIcon} me-2"></i>${socioText}</button></li>
                                <li><button class="dropdown-item toggle-colaborador-btn" data-id="${row.id}" data-name="${nombreCompleto}" ${!row.isSocio ? 'disabled' : ''}><i class="fa-solid ${colabIcon} me-2"></i>${colabText}</button></li>
                                <li><button class="dropdown-item toggle-admin-btn" data-id="${row.id}" data-name="${nombreCompleto}"><i class="fa-solid ${adminIcon} me-2"></i>${adminText}</button></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><button class="dropdown-item edit-user-btn" data-id="${row.id}"><i class="fa-solid fa-pen me-2"></i>Editar</button></li>
                                <li><button class="dropdown-item text-danger deactivate-user-btn" data-id="${row.id}" data-name="${nombreCompleto}" data-correo="${row.correo || ''}" data-dni="${row.dni || ''}" data-telefono="${row.telefono || ''}"><i class="fa-solid fa-ban me-2"></i>Desactivar</button></li>
                            </ul>
                        </div>
                    </div>`;
                },
                responsivePriority: 1
            }
        ],
        order: [[0, 'asc']],
        drawCallback: function () {
            document.querySelectorAll('#usuarios-table [data-bs-toggle="tooltip"]').forEach(el => {
                try { new bootstrap.Tooltip(el); } catch (e) {}
            });
        }
    });

    // Registrar filtros combinados una vez
    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
        const rowData = usersTable.row(dataIndex).data();
        if (!rowData) return true;
        const rolVal = filterRol ? filterRol.value : '';
        if (rolVal === 'admin' && !rowData.isAdmin) return false;
        if (rolVal === 'colaborador' && !rowData.isColaborador) return false;
        if (rolVal === 'socio' && !rowData.isSocio) return false;
        if (rolVal === 'noSocio' && rowData.isSocio) return false;
        const estadoPagoVal = filterEstadoPagoVal;
        if (estadoPagoVal === 'alCorriente') {
            if (!rowData.alCorriente) return false;
        } else if (estadoPagoVal) {
            const estado = getEstadoDeuda(rowData.pagadoHasta);
            if (estado !== estadoPagoVal) return false;
        }
        return true;
    });

    setupUserActionHandlers();

    // Las cuentas se recalculan solas al entrar (no hay botón que pulsar) y esta
    // función deja la tabla pintada al terminar.
    recalcularCuentas();
}

function loadUsersIntoTable() {
    firebase.firestore().collection('usuarios').get()
        .then((querySnapshot) => {
            const allData = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            const userData = allData.filter(u => {
                if (verDesactivados) return u.desactivado === true;
                return !u.desactivado;
            });
            usersTable.clear().rows.add(userData).draw();
        })
        .catch((error) => {
            console.error("Error al obtener los usuarios: ", error);
        });
}

function setupUserActionHandlers() {
    const db = firebase.firestore();
    const tbody = $('#usuarios-table tbody');

    tbody.off('click');

    tbody.on('click', '.toggle-socio-btn', function () { handleRoleToggle(this, 'isSocio'); });
    tbody.on('click', '.toggle-colaborador-btn', function () { handleRoleToggle(this, 'isColaborador'); });
    tbody.on('click', '.toggle-admin-btn', function () { handleRoleToggle(this, 'isAdmin'); });

    tbody.on('click', '.edit-user-btn', async function () {
        const userId = $(this).data('id');
        try {
            const doc = await db.collection('usuarios').doc(userId).get();
            if (doc.exists) {
                const userData = doc.data();
                $('#edit-user-id').val(doc.id);
                $('#edit-user-name').val(userData.nombre);
                $('#edit-user-lastname').val(userData.apellidos);
                $('#edit-user-phone').val(userData.telefono || '');
                $('#edit-user-socio').prop('checked', userData.isSocio === true);
                $('#edit-user-colaborador').prop('checked', userData.isColaborador === true);
                $('#edit-user-admin').prop('checked', userData.isAdmin === true);
                editUserModal.show();
            }
        } catch (error) {
            showAlert('Error al cargar los datos del usuario.', 'danger');
        }
    });

    tbody.on('click', '.deactivate-user-btn', function () {
        const userId = $(this).data('id');
        const userName = $(this).data('name');
        const datos = { correo: $(this).data('correo') || '', dni: $(this).data('dni') || '', telefono: $(this).data('telefono') || '' };
        const extraTxt = datosExtraUsuario(datos);

        showConfirmationModal(
            'Desactivar Usuario',
            `¿Estás seguro de que quieres desactivar a ${userName}${extraTxt}? El usuario no podrá acceder a la web hasta que sea reactivado.`,
            async () => {
                try {
                    await db.collection('usuarios').doc(userId).update({ desactivado: true });
                    if (window.auditar) window.auditar('usuarios', 'desactivar', `Usuario "${userName}"${extraTxt} desactivado`, { uid: userId, correo: datos.correo || null, dni: datos.dni || null });
                    showAlert(`Usuario ${userName} desactivado con éxito.`, 'success');
                    loadUsersIntoTable();
                } catch (error) {
                    showAlert('Error al desactivar el usuario.', 'danger');
                }
            }
        );
    });

    tbody.on('click', '.reactivate-user-btn', function () {
        const userId = $(this).data('id');
        const userName = $(this).data('name');
        const datos = { correo: $(this).data('correo') || '', dni: $(this).data('dni') || '', telefono: $(this).data('telefono') || '' };
        const extraTxt = datosExtraUsuario(datos);

        showConfirmationModal(
            'Reactivar Usuario',
            `¿Estás seguro de que quieres reactivar a ${userName}${extraTxt}? El usuario podrá volver a acceder a la web.`,
            async () => {
                try {
                    await db.collection('usuarios').doc(userId).update({ desactivado: false });
                    if (window.auditar) window.auditar('usuarios', 'reactivar', `Usuario "${userName}"${extraTxt} reactivado`, { uid: userId, correo: datos.correo || null, dni: datos.dni || null });
                    showAlert(`Usuario ${userName} reactivado con éxito.`, 'success');
                    loadUsersIntoTable();
                } catch (error) {
                    showAlert('Error al reactivar el usuario.', 'danger');
                }
            }
        );
    });

    // Cambio del selector de mes pagadoHasta
    tbody.on('change', '.user-pagado-hasta', async function () {
        const userId = $(this).data('id');
        const month = parseInt($(this).val());
        let fecha = null;
        if (month) {
            const now = new Date();
            const year = now.getFullYear();
            fecha = firebase.firestore.Timestamp.fromDate(new Date(year, month, 0));
        }
        try {
            await db.collection('usuarios').doc(userId).update({ pagadoHasta: fecha });
            await recalcularCuentas();
        } catch (error) {
            showAlert('Error al actualizar la fecha de pago.', 'danger');
        }
    });

    // Filtros
    const redrawTable = () => usersTable.draw();
    if (filterRol) {
        filterRol.addEventListener('change', () => {
            if (filterEstadoPagoContainer) {
                filterEstadoPagoContainer.classList.toggle('d-none', filterRol.value !== 'socio');
            }
            filterEstadoPagoVal = '';
            if (filterEstadoPagoBtn) filterEstadoPagoBtn.textContent = 'Todos';
            redrawTable();
        });
    }

    if (filterEstadoPagoMenu) {
        filterEstadoPagoMenu.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                filterEstadoPagoVal = item.dataset.value || '';
                if (filterEstadoPagoBtn) filterEstadoPagoBtn.textContent = item.textContent.trim();
                redrawTable();
            });
        });
    }

    // Estado inicial del filtro estado de pago
    if (filterEstadoPagoContainer && filterRol) {
        filterEstadoPagoContainer.classList.toggle('d-none', filterRol.value !== 'socio');
    }

    // Botón Exportar CSV
    if (btnExportarCsv) {
        btnExportarCsv.addEventListener('click', handleExportarCsv);
    }

    // Toggle activos / desactivados
    const btnVerActivos = document.getElementById('btn-ver-activos');
    const btnVerDesactivados = document.getElementById('btn-ver-desactivados');

    function actualizarVista() {
        btnVerActivos.className = verDesactivados ? 'btn btn-outline-primary btn-sm' : 'btn btn-primary btn-sm';
        btnVerDesactivados.className = verDesactivados ? 'btn btn-secondary btn-sm' : 'btn btn-outline-secondary btn-sm';

        const subtitle = document.getElementById('user-list-subtitle');
        if (subtitle) {
            subtitle.textContent = verDesactivados ? 'Mostrando usuarios desactivados' : '';
        }

        const filtersArea = document.getElementById('filters-area');
        if (filtersArea) {
            filtersArea.style.display = verDesactivados ? 'none' : '';
        }

        filterEstadoPagoVal = '';
        if (filterEstadoPagoBtn) filterEstadoPagoBtn.textContent = 'Todos';
        if (filterRol) filterRol.value = '';
        if (filterEstadoPagoContainer) filterEstadoPagoContainer.classList.add('d-none');

        loadUsersIntoTable();
    }

    if (btnVerActivos) {
        btnVerActivos.addEventListener('click', () => {
            if (verDesactivados) {
                verDesactivados = false;
                actualizarVista();
            }
        });
    }
    if (btnVerDesactivados) {
        btnVerDesactivados.addEventListener('click', () => {
            if (!verDesactivados) {
                verDesactivados = true;
                actualizarVista();
            }
        });
    }

    $('#edit-user-form').on('submit', async function (e) {
        e.preventDefault();
        const userId = $('#edit-user-id').val();
        const isSocio = $('#edit-user-socio').is(':checked');
        const isColaborador = $('#edit-user-colaborador').is(':checked');
        const isAdmin = $('#edit-user-admin').is(':checked');

        if (isColaborador && !isSocio) {
            showAlert('No se puede dar rol Colaborador sin ser Socio.', 'warning');
            return;
        }

        const updatedData = {
            nombre: $('#edit-user-name').val(),
            apellidos: $('#edit-user-lastname').val(),
            telefono: $('#edit-user-phone').val() || null,
            isSocio,
            isColaborador,
            isAdmin,
        };

        if (!isSocio) {
            updatedData.isColaborador = false;
        }

        try {
            const beforeDoc = await db.collection('usuarios').doc(userId).get();
            const before = beforeDoc.exists ? beforeDoc.data() : {};
            await db.collection('usuarios').doc(userId).update(updatedData);
            editUserModal.hide();

            const nombreCompleto = nombreCompletoUsuario({ ...before, ...updatedData, id: userId });
            const extra = [];
            if (before.correo) extra.push(before.correo);
            if (before.dni) extra.push(`DNI ${before.dni}`);
            const extraTxt = extra.length ? ` (${extra.join(', ')})` : '';

            const cambios = [];
            if (before.nombre !== updatedData.nombre || before.apellidos !== updatedData.apellidos) cambios.push('datos personales');
            if ((before.telefono || null) !== updatedData.telefono) cambios.push('teléfono');
            if (before.isSocio !== isSocio) cambios.push(isSocio ? 'rol socio añadido' : 'rol socio quitado');
            if (before.isColaborador !== updatedData.isColaborador) cambios.push(updatedData.isColaborador ? 'rol colaborador añadido' : 'rol colaborador quitado');
            if (before.isAdmin !== isAdmin) cambios.push(isAdmin ? 'rol admin añadido' : 'rol admin quitado');
            const cambiosTxt = cambios.length ? `: ${cambios.join(', ')}` : '';

            if (window.auditar) window.auditar('usuarios', 'editar', `Usuario "${nombreCompleto}"${extraTxt} editado${cambiosTxt}`, {
                uid: userId,
                correo: before.correo || null,
                dni: before.dni || null,
                antes: { nombre: before.nombre, apellidos: before.apellidos, telefono: before.telefono, isSocio: before.isSocio, isColaborador: before.isColaborador, isAdmin: before.isAdmin },
                nuevo: { nombre: updatedData.nombre, apellidos: updatedData.apellidos, telefono: updatedData.telefono, isSocio, isColaborador: updatedData.isColaborador, isAdmin }
            });
            showAlert('Usuario actualizado con éxito.', 'success');
            loadUsersIntoTable();
        } catch (error) {
            showAlert('Error al actualizar el usuario.', 'danger');
        }
    });
}

// Recalcula "al corriente" y el rol de socio de todos los usuarios a partir
// de su campo "pagado hasta". Se ejecuta sola al entrar en la página y tras
// cada cambio de ese campo, así que ya no hace falta ningún botón manual.
// Devuelve cuántas cuentas han cambiado (-1 si hubo error).

async function recalcularCuentas() {
    const db = firebase.firestore();
    const MAX_POR_LOTE = 400;   // Firestore admite 500 escrituras por batch

    try {
        const snapshot = await db.collection('usuarios').get();
        const updates = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            let alCorriente = false;
            let socioStatus = data.isSocio;
            const mesesDeuda = data.pagadoHasta ? calcularMesesDeuda(data.pagadoHasta) : null;

            if (data.pagadoHasta && mesesDeuda === 0) {
                alCorriente = true;
                socioStatus = true;
            } else if (data.pagadoHasta) {
                if (mesesDeuda >= 4) {
                    socioStatus = false;
                } else {
                    socioStatus = true;
                }
            } else {
                socioStatus = false;
            }

            const updateData = {};
            if (data.alCorriente !== alCorriente) {
                updateData.alCorriente = alCorriente;
            }
            if (data.isSocio !== socioStatus) {
                updateData.isSocio = socioStatus;
                if (!socioStatus && data.isColaborador === true) {
                    updateData.isColaborador = false;
                }
            }
            if (Object.keys(updateData).length > 0) {
                updates.push({ ref: db.collection('usuarios').doc(doc.id), data: updateData });
            }
        });

        for (let i = 0; i < updates.length; i += MAX_POR_LOTE) {
            const batch = db.batch();
            updates.slice(i, i + MAX_POR_LOTE).forEach(u => batch.update(u.ref, u.data));
            await batch.commit();
        }

        if (updates.length > 0) {
            showAlert(`${updates.length} cuenta(s) actualizada(s).`, 'success');
        } else {
            showAlert('Todas las cuentas ya están al día.', 'info');
        }

        loadUsersIntoTable();
        return updates.length;
    } catch (error) {
        console.error('Error al actualizar cuentas:', error);
        showAlert('Error al actualizar las cuentas.', 'danger');
        loadUsersIntoTable();
        return -1;
    }
}

function handleExportarCsv() {
    const db = firebase.firestore();
    db.collection('usuarios').get().then(snapshot => {
        const socios = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(u => u.isSocio === true);

        if (socios.length === 0) {
            showAlert('No hay socios para exportar.', 'info');
            return;
        }

        const escapeCsv = (val) => {
            if (val === null || val === undefined) return '';
            const s = String(val);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        };

        const formatDate = (ts) => {
            if (!ts) return '';
            if (ts.toDate) return ts.toDate().toLocaleDateString('es-ES');
            return ts;
        };

        const headers = ['Nombre', 'Apellidos', 'Teléfono', 'Correo', 'Admin', 'Al corriente', 'Pagado hasta', 'Fecha de registro'];
        const rows = socios.map(u => [
            escapeCsv(u.nombre),
            escapeCsv(u.apellidos || ''),
            escapeCsv(u.telefono || ''),
            escapeCsv(u.correo || ''),
            u.isAdmin ? 'Sí' : 'No',
            u.alCorriente ? 'Sí' : 'No',
            formatDate(u.pagadoHasta),
            formatDate(u.timestamp)
        ].join(','));

        const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `socios_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }).catch(error => {
        console.error('Error al exportar CSV:', error);
        showAlert('Error al exportar el CSV.', 'danger');
    });
}

async function handleRoleToggle(button, role) {
    const db = firebase.firestore();
    const userId = $(button).data('id');
    const userDocRef = db.collection('usuarios').doc(userId);

    try {
        const doc = await userDocRef.get();
        if (!doc.exists) return;

        const userData = doc.data();
        const nombreCompleto = nombreCompletoUsuario({ ...userData, id: userId });
        const extraTxt = datosExtraUsuario(userData);
        const rolLabels = { isSocio: 'socio', isColaborador: 'colaborador', isAdmin: 'admin' };
        const rolLabel = rolLabels[role] || role.substring(2).toLowerCase();
        const currentRoleState = userData[role] || false;
        const actionText = currentRoleState ? `quitar rol de ${rolLabel} a` : `hacer ${rolLabel} a`;

        showConfirmationModal(`Confirmar Rol`, `¿Seguro que quieres ${actionText} ${nombreCompleto}?`, async () => {
            try {
                const updates = {};
                updates[role] = !currentRoleState;

                if (role === 'isSocio' && currentRoleState === true) {
                    updates['isColaborador'] = false;
                }

                if (role === 'isColaborador' && !currentRoleState && !userData.isSocio) {
                    showAlert('No se puede hacer colaborador a un usuario que no es socio.', 'warning');
                    return;
                }

                await userDocRef.update(updates);
                let cambioTexto = currentRoleState ? `rol ${rolLabel} quitado` : `rol ${rolLabel} añadido`;
                if (role === 'isSocio' && currentRoleState === true && userData.isColaborador) {
                    cambioTexto += ' (también rol colaborador quitado)';
                }
                if (window.auditar) window.auditar('usuarios', 'cambio_rol', `Usuario "${nombreCompleto}"${extraTxt}: ${cambioTexto}`, { uid: userId, correo: userData.correo || null, dni: userData.dni || null, rol: rolLabel, activo: !currentRoleState });
                showAlert(`Rol de ${nombreCompleto} actualizado.`, 'success');
                loadUsersIntoTable();
            } catch (error) {
                showAlert('Error al actualizar el rol.', 'danger');
            }
        });
    } catch (error) {
        showAlert('Error al obtener datos del usuario.', 'danger');
    }
}
