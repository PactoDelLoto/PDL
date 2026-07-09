// Fallback global para showConfirmationModal si utils.js no está cargado
if (typeof window.showConfirmationModal !== 'function') {
    window.showConfirmationModal = function (title, bodyText, onConfirm) {
        let modalEl = document.getElementById('confirmation-modal');
        if (!modalEl) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = '<div class="modal fade" id="confirmation-modal" tabindex="-1" aria-hidden="true"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title" id="confirmationModalLabel"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><p id="confirmation-modal-body-text"></p></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-danger" id="confirm-action-btn">Confirmar</button></div></div></div></div>';
            document.body.appendChild(wrapper.firstElementChild);
            modalEl = document.getElementById('confirmation-modal');
        }
        const confirmationModal = new bootstrap.Modal(modalEl);
        document.getElementById('confirmationModalLabel').textContent = title;
        document.getElementById('confirmation-modal-body-text').textContent = bodyText;
        const confirmBtn = document.getElementById('confirm-action-btn');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        newConfirmBtn.addEventListener('click', function () {
            onConfirm();
            confirmationModal.hide();
        });
        confirmationModal.show();
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const navbarContainer = document.querySelector('header');
    const footerContainer = document.querySelector('footer');

    // Cargar Navbar y luego inicializar la UI de autenticación
    fetch('/resources/layouts/navbar.html')
        .then(response => response.text())
        .then(html => {
            navbarContainer.innerHTML = html;
            // Esperar a que Firebase esté inicializado antes de usarlo (evita app/no-app)
            const ensureFirebaseReady = (cb, attempts = 0) => {
                try {
                    if (window.firebase && (firebase.apps && firebase.apps.length > 0)) return cb();
                } catch (e) {
                    // ignore
                }
                if (attempts > 50) {
                    console.error('Firebase no se inicializó después de esperar.');
                    return;
                }
                setTimeout(() => ensureFirebaseReady(cb, attempts + 1), 100);
            };
            ensureFirebaseReady(setupAuthUI);
        })
        .catch(error => console.error('Error al cargar el navbar:', error));

    // Delegación de eventos para submenús anidados (móvil)
    document.addEventListener('click', e => {
        const toggle = e.target.closest('.dropdown-submenu > .dropdown-toggle');
        if (toggle) {
            e.preventDefault();
            e.stopPropagation();
            const submenu = toggle.nextElementSibling;
            if (submenu && submenu.classList.contains('dropdown-menu')) {
                submenu.classList.toggle('show');
            }
        }
    });

    // Cargar Footer
    fetch('/resources/layouts/footer.html')
        .then(response => response.text())
        .then(html => {
            footerContainer.innerHTML = html;
            populateFooterLinks();
        })
        .catch(error => console.error('Error al cargar el footer:', error));
});

async function populateNavbarLinks(isLoggedIn) {
    const links = [
        { text: 'Hazte socio', href: '/hazte-socio.html' },
        { text: 'Eventos', href: '/eventos.html' },
        { text: 'Quiénes somos', href: '/quienes-somos.html' }
    ];

    if (isLoggedIn) {
        const isAdmin = await window.isUserAdmin();
        const isSocio = await window.isUserSocio();
        const isColaborador = await window.isUserColaborador();

        const adminItems = [];

        if (isAdmin || isColaborador) {
            adminItems.push({
                text: 'Torneos',
                isSubDropdown: true,
                items: [
                    { text: 'MTG Commander', href: '/mtg-commander.html', locked: false },
                    { text: 'MTG Modern', href: '/mtg-modern.html', locked: false },
                    { text: 'Star Wars Unlimited', href: '/starwars-unlimited.html', locked: false },
                    { text: 'Riftbound', href: '/mtg-riftbound.html', locked: false }
                ]
            });
            adminItems.push({ text: 'Inventario', href: '/inventario.html' });
        }
        if (isAdmin) {
            adminItems.push({ text: 'Lista de Usuarios', href: '/listaUsuarios.html' });
            adminItems.push({ text: 'Solicitudes', href: '/solicitudes.html' });
            adminItems.push({ text: 'Auditoría', href: '/auditoria.html' });
        }

        if (adminItems.length > 0) {
            links.push({ text: 'Administración', isDropdown: true, items: adminItems, isAdmin: true });
        }
    }

    const navbarList = document.getElementById('navbar-links');
    if (navbarList) {
        navbarList.innerHTML = links.map(link => {
            if (link.isDropdown) {
                const isAnySubPageActive = link.items.some(item => {
                    if (item.isSubDropdown) {
                        return item.items.some(sub => window.location.pathname === sub.href);
                    }
                    return window.location.pathname === item.href;
                });
                const dropdownClass = isAnySubPageActive ? 'active' : '';
                const hasSubDropdown = link.items.some(item => item.isSubDropdown);

                const itemsHtml = link.items.map(item => {
                    if (item.isSubDropdown) {
                        const subItemsHtml = item.items.map(sub => {
                            if (sub.locked) {
                                return `<li><span class="dropdown-item disabled">${sub.text}<i class="fas fa-lock ms-2"></i></span></li>`;
                            }
                            const isSubActive = window.location.pathname === sub.href ? 'active' : '';
                            return `<li><a class="dropdown-item ${isSubActive}" href="${sub.href}">${sub.text}</a></li>`;
                        }).join('');
                        return `
                            <li class="dropdown-submenu">
                                <a class="dropdown-item dropdown-toggle" href="#">${item.text}</a>
                                <ul class="dropdown-menu dropdown-menu-dark">
                                    ${subItemsHtml}
                                </ul>
                            </li>
                        `;
                    }
                    const isActive = window.location.pathname === item.href ? 'active' : '';
                    return `<li><a class="dropdown-item ${isActive}" href="${item.href}">${item.text}</a></li>`;
                }).join('');

                const idSuffix = link.text === 'Administración' ? 'Admin' : 'Torneos';
                const linkText = link.isAdmin
                    ? `Administración<span id="admin-unread-badge" class="badge bg-danger rounded-pill ms-1" style="display:none;font-size:0.6rem">0</span>`
                    : link.text;

                return `
                    <li class="nav-item dropdown">
                        <a class="nav-link dropdown-toggle ${dropdownClass}" href="#" id="navbarDropdown${idSuffix}" role="button" data-bs-toggle="dropdown"${hasSubDropdown ? ' data-bs-auto-close="outside"' : ''} aria-expanded="false">
                            ${linkText}
                        </a>
                        <ul class="dropdown-menu dropdown-menu-dark" aria-labelledby="navbarDropdown${idSuffix}">
                            ${itemsHtml}
                        </ul>
                    </li>
                `;
            }

            return `
                <li class="nav-item">
                    <a class="nav-link ${window.location.pathname === link.href ? 'active' : ''}" href="${link.href}">${link.text}</a>
                </li>
            `;
        }).join('');
    }
}

function populateFooterLinks() {
    const links = [
        { text: 'Aviso legal', href: '/aviso-legal.html' },
        { text: 'Política de privacidad', href: '/privacidad.html' },
        { text: 'Contacto', href: '/contacto.html' },
        { text: 'Instagram', href: 'https://www.instagram.com/pacto_del_loto/', isExternal: true },
    ];

    const footerList = document.getElementById('footer-links');
    if (footerList) {
        footerList.innerHTML = links.map(link => `
            <li class="list-inline-item mx-2">
                <a class="text-light text-decoration-none" 
                   href="${link.href}" ${link.isExternal ? 'target="_blank"' : ''}>
                   ${link.text}
                </a>
            </li>
        `).join('');
    }
}

function normalizarFecha(timestamp) {
    if (!timestamp || !timestamp.toDate) return null;
    const d = timestamp.toDate();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getEstadoDeuda(pagadoHasta) {
    const pagado = normalizarFecha(pagadoHasta);
    if (!pagado) return null;
    const hoy = new Date();
    const hoyNorm = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (pagado >= hoyNorm) return null;
    const fechaLimite = new Date(pagado);
    fechaLimite.setMonth(fechaLimite.getMonth() + 1);
    fechaLimite.setDate(fechaLimite.getDate() + 1);
    if (hoyNorm < fechaLimite) return 'debe1';
    return 'debe2';
}

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

function setupAuthUI() {
    firebase.auth().onAuthStateChanged(async user => {
        populateNavbarLinks(!!user);

        const userActionsDesktop = document.getElementById('user-navbar-actions');
        const userActionsMobile = document.getElementById('user-navbar-actions-mobile');

        if (user) {
            const db = firebase.firestore();
            let displayName = user.email;
            let isSocio = false;
            let isAdmin = false;
            let isColaborador = false;
            let alCorriente = false;
            let pagadoHasta = null;
            try {
                const doc = await db.collection('usuarios').doc(user.uid).get();
                if (doc.exists) {
                    const data = doc.data();
                    const nombre = data.nombre || '';
                    const apellidos = data.apellidos || '';
                    if (nombre && apellidos) displayName = `${nombre} ${apellidos.split(' ')[0]}`;
                    isSocio = data.isSocio === true;
                    isAdmin = data.isAdmin === true;
                    isColaborador = data.isColaborador === true;
                    alCorriente = data.alCorriente === true;
                    pagadoHasta = data.pagadoHasta || null;
                }
            } catch (e) {}

            let roleBadgeHtml = '';
            if (isAdmin) {
                roleBadgeHtml = '<span class="badge bg-primary ms-1" style="font-size:0.6rem">Admin</span>';
            } else if (isColaborador) {
                roleBadgeHtml = '<span class="badge bg-info ms-1" style="font-size:0.6rem">Colab</span>';
            } else if (isSocio) {
                roleBadgeHtml = '<span class="badge bg-success ms-1" style="font-size:0.6rem">Socio</span>';
            }

            let bubbleHtml = '';
            let tooltipText = '';
            if (roleBadgeHtml && !alCorriente) {
                const estado = getEstadoDeuda(pagadoHasta);
                if (estado) {
                    const meses = calcularMesesDeuda(pagadoHasta);
                    const mesText = meses === 1 ? '1 mes' : `${meses} meses`;
                    tooltipText = `Actualmente no estás al corriente de pago, debes ${mesText}. Si no abonas tu cuota durante tres meses perderás la condición de socio.`;
                    const colorClass = estado === 'debe1' ? 'bg-warning text-dark' : 'bg-danger';
                    bubbleHtml = `<span class="badge ${colorClass} rounded-pill ms-1" style="font-size:0.55rem;cursor:pointer" data-bs-toggle="tooltip" title="${tooltipText}"><i class="fa-solid fa-triangle-exclamation" style="font-size:0.55rem"></i></span>`;
                }
            }

            if (tooltipText && roleBadgeHtml) {
                roleBadgeHtml = roleBadgeHtml.replace('<span ', `<span data-bs-toggle="tooltip" title="${tooltipText}" `);
            }

            const userUnreadBubble = '<span id="user-unread-badge-desktop" class="badge bg-danger rounded-pill ms-1 user-unread-badge" style="display:none;font-size:0.65rem">0</span>';
            const userUnreadBubbleMobile = '<span id="user-unread-badge-mobile" class="badge bg-danger rounded-pill ms-1 user-unread-badge" style="display:none;font-size:0.65rem">0</span>';

            const misMensajesItem = `<li><a class="dropdown-item" href="/mis-mensajes.html"><i class="fa-regular fa-envelope me-2"></i>Mis mensajes<span id="user-unread-badge-menu" class="badge bg-danger rounded-pill ms-1" style="display:none;font-size:0.6rem">0</span></a></li>`;

            // "Actualizar cuentas" for socios with debt, "Ser socio" for non-socios
            let solicitudItem = '';
            if (isSocio && !alCorriente) {
                solicitudItem = `<li><a class="dropdown-item" href="#" id="btn-solicitar-actualizar-cuentas"><i class="fa-solid fa-rotate me-2"></i>Actualizar cuentas</a></li>`;
            } else if (!isSocio) {
                solicitudItem = `<li><a class="dropdown-item" href="#" id="btn-solicitar-ser-socio"><i class="fa-solid fa-user-plus me-2"></i>Ser socio</a></li>`;
            }

            const sugerenciasItem = (isSocio || isAdmin)
                ? `<li><a class="dropdown-item" href="/buzon-sugerencias.html"><i class="fa-regular fa-lightbulb me-2"></i>Sugerencias socios</a></li>`
                : '';

            const commonItems = `
                <li><a class="dropdown-item" href="/perfil.html"><i class="fa-regular fa-user me-2"></i>Mi Perfil</a></li>
                <li><a class="dropdown-item" href="/perfil.html?tab=actividades"><i class="fa-regular fa-calendar me-2"></i>Mis actividades</a></li>
                <li><hr class="dropdown-divider"></li>
                ${misMensajesItem}
                ${solicitudItem ? `<li>${solicitudItem}</li>` : ''}
                ${sugerenciasItem ? `<li>${sugerenciasItem}</li>` : ''}
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-danger" href="#" id="logout-button-desktop"><i class="fa-solid fa-right-from-bracket me-2"></i>Cerrar Sesión</a></li>
            `;

            const desktopUI = `
                <div class="dropdown">
                    <button class="btn btn-outline-light dropdown-toggle" type="button" id="user-menu-desktop" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="fas fa-user-circle me-2"></i> ${displayName}${roleBadgeHtml}${bubbleHtml}${userUnreadBubble}
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="user-menu-desktop">
                        ${commonItems}
                    </ul>
                </div>
            `;
            const mobileUI = `
                <p class="text-light mb-2">${displayName}${roleBadgeHtml}${bubbleHtml}${userUnreadBubbleMobile}</p>
                <a class="btn btn-outline-light w-100 mb-2" href="/perfil.html"><i class="fa-regular fa-user me-2"></i>Mi Perfil</a>
                <a class="btn btn-outline-light w-100 mb-2" href="/perfil.html?tab=actividades"><i class="fa-regular fa-calendar me-2"></i>Mis actividades</a>
                <a class="btn btn-outline-light w-100 mb-2" href="/mis-mensajes.html"><i class="fa-regular fa-envelope me-2"></i>Mis mensajes</a>
                ${solicitudItem ? `<a class="btn btn-outline-info w-100 mb-2" href="#" id="btn-solicitar-mobile">${solicitudItem.includes('Actualizar') ? 'Actualizar cuentas' : 'Ser socio'}</a>` : ''}
                ${isSocio || isAdmin ? `<a class="btn btn-outline-warning w-100 mb-2" href="/buzon-sugerencias.html"><i class="fa-regular fa-lightbulb me-2"></i>Sugerencias socios</a>` : ''}
                <button class="btn btn-danger w-100" id="logout-button-mobile"><i class="fa-solid fa-right-from-bracket me-2"></i>Cerrar Sesión</button>
            `;
            userActionsDesktop.innerHTML = desktopUI;
            userActionsMobile.innerHTML = mobileUI;

            document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                try { new bootstrap.Tooltip(el); } catch (e) {}
            });

            document.getElementById('logout-button-desktop').addEventListener('click', e => { e.preventDefault(); firebase.auth().signOut(); });
            document.getElementById('logout-button-mobile').addEventListener('click', () => firebase.auth().signOut());

            // Solicitud "Actualizar cuentas"
            const btnActualizar = document.getElementById('btn-solicitar-actualizar-cuentas');
            if (btnActualizar) {
                btnActualizar.addEventListener('click', async function (e) {
                    e.preventDefault();
                    const db = firebase.firestore();
                    try {
                        const cooldown = await checkSolicitudCooldown(db, user.uid, 'actualizar_cuentas');
                        if (cooldown) {
                            window.showAlert(`Ya enviaste una solicitud de actualización de cuentas el ${cooldown.fecha}. Debes esperar una semana desde esa fecha para enviar otra.`, 'warning');
                            return;
                        }
                    } catch (e) {}
                    window.showConfirmationModal(
                        'Actualizar cuentas',
                        'Al enviar esta solicitud, el equipo revisará que estés al corriente de pago para actualizar el estado de tus cuentas y así mantener tu condición de socio. Asegúrate de haber realizado el pago de las cuotas pendientes antes de continuar.',
                        async function () {
                            try {
                                const doc = await db.collection('usuarios').doc(user.uid).get();
                                if (!doc.exists) return;
                                const data = doc.data();
                                const nombre = data.nombre || '';
                                const apellidos = data.apellidos || '';
                                await db.collection('solicitudes').add({
                                    userId: user.uid,
                                    userName: `${nombre} ${apellidos}`.trim(),
                                    userEmail: user.email,
                                    tipo: 'actualizar_cuentas',
                                    mensaje: 'Debido a que debía cuotas y actualmente me he puesto al día, solicito la actualización de mis cuentas. Gracias, un saludo.',
                                    fecha: firebase.firestore.FieldValue.serverTimestamp(),
                                    leidoAdmin: false, leidoAdminPor: null, leidoAdminFecha: null,
                                    respuestaAdmin: null, respondidoAdminPor: null, respondidoAdminFecha: null,
                                    leidoUser: false, leidoUserFecha: null,
                                    status: 'pendiente',
                                    conversacion: [{ rol: 'usuario', mensaje: 'Debido a que debía cuotas y actualmente me he puesto al día, solicito la actualización de mis cuentas. Gracias, un saludo.', fecha: new Date() }]
                                });
                                if (window.auditar) window.auditar('solicitudes', 'crear', 'Solicitud de actualización de cuentas enviada', { tipo: 'actualizar_cuentas' });
                                if (window.showAlert) window.showAlert('Solicitud enviada correctamente. El equipo revisará tu caso.', 'success');
                            } catch (err) {
                                console.error('Error al crear solicitud:', err);
                                if (window.showAlert) window.showAlert('Error al enviar la solicitud.', 'danger');
                            }
                        }
                    );
                });
            }

            // Solicitud "Ser socio" (para no socios)
            const btnSerSocio = document.getElementById('btn-solicitar-ser-socio');
            if (btnSerSocio) {
                btnSerSocio.addEventListener('click', async function (e) {
                    e.preventDefault();
                    const db = firebase.firestore();
                    try {
                        const cooldown = await checkSolicitudCooldown(db, user.uid, 'ser_socio');
                        if (cooldown) {
                            window.showAlert(`Ya enviaste una solicitud para ser socio el ${cooldown.fecha}. Debes esperar una semana desde esa fecha para enviar otra.`, 'warning');
                            return;
                        }
                    } catch (e) {}
                    window.showConfirmationModal(
                        'Solicitar ser socio',
                        'Al enviar esta solicitud, el equipo evaluará tu petición para convertirte en socio. Podrás acceder a descuentos, actividades exclusivas y participar en la vida del club. Un administrador revisará tu caso y te responderá a la mayor brevedad.',
                        async function () {
                            try {
                                const doc = await db.collection('usuarios').doc(user.uid).get();
                                if (!doc.exists) return;
                                const data = doc.data();
                                const nombre = data.nombre || '';
                                const apellidos = data.apellidos || '';
                                await db.collection('solicitudes').add({
                                    userId: user.uid,
                                    userName: `${nombre} ${apellidos}`.trim(),
                                    userEmail: user.email,
                                    tipo: 'ser_socio',
                                    mensaje: `${nombre} ${apellidos} quiere ser socio.`,
                                    fecha: firebase.firestore.FieldValue.serverTimestamp(),
                                    leidoAdmin: false, leidoAdminPor: null, leidoAdminFecha: null,
                                    respuestaAdmin: null, respondidoAdminPor: null, respondidoAdminFecha: null,
                                    leidoUser: false, leidoUserFecha: null,
                                    status: 'pendiente',
                                    conversacion: [{ rol: 'usuario', mensaje: `${nombre} ${apellidos} quiere ser socio.`, fecha: new Date() }]
                                });
                                if (window.auditar) window.auditar('solicitudes', 'crear', 'Solicitud de socio enviada', { tipo: 'ser_socio' });
                                if (window.showAlert) window.showAlert('Solicitud enviada correctamente. El equipo se pondrá en contacto contigo.', 'success');
                            } catch (err) {
                                console.error('Error al crear solicitud:', err);
                                if (window.showAlert) window.showAlert('Error al enviar la solicitud.', 'danger');
                            }
                        }
                    );
                });
            }

            // Mobile: same handler for solicitud button
            const btnSolicitarMobile = document.getElementById('btn-solicitar-mobile');
            if (btnSolicitarMobile) {
                btnSolicitarMobile.addEventListener('click', function (e) {
                    e.preventDefault();
                    const desktopBtn = document.getElementById('btn-solicitar-actualizar-cuentas') || document.getElementById('btn-solicitar-ser-socio');
                    if (desktopBtn) desktopBtn.click();
                });
            }

            updateNotificationBubbles();
            applySolicitudCooldown(db, user.uid);

        } else {
            userActionsDesktop.innerHTML = '<a href="/login.html" class="btn btn-outline-light me-2">Login</a><a href="/registro.html" class="btn btn-warning">Registro</a>';
            userActionsMobile.innerHTML = '<div class="d-grid gap-2"><a href="/login.html" class="btn btn-outline-light">Login</a><a href="/registro.html" class="btn btn-warning">Registro</a></div>';
        }
    });
}

async function updateNotificationBubbles() {
    const db = firebase.firestore();
    const user = firebase.auth().currentUser;
    if (!user) return;

    try {
        const isAdmin = await window.isUserAdmin();
        if (isAdmin) {
            const snapshot = await db.collection('solicitudes')
                .where('leidoAdmin', '==', false)
                .get();
            const count = snapshot.size;
            const badge = document.getElementById('admin-unread-badge');
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? '' : 'none';
            }
        }
    } catch (e) { console.error('Error en admin badge:', e); }

    try {
        const userSnapshot = await db.collection('solicitudes')
            .where('userId', '==', user.uid)
            .get();
        const userCount = userSnapshot.docs.filter(doc => {
            const data = doc.data();
            return data.respuestaAdmin && !data.leidoUser;
        }).length;
        ['user-unread-badge-desktop', 'user-unread-badge-mobile', 'user-unread-badge-menu'].forEach(id => {
            const badge = document.getElementById(id);
            if (badge) {
                badge.textContent = userCount;
                badge.style.display = userCount > 0 ? '' : 'none';
            }
        });
    } catch (e) { console.error('Error en user badge:', e); }
}

async function checkSolicitudCooldown(db, uid, tipo) {
    const snapshot = await db.collection('solicitudes')
        .where('userId', '==', uid)
        .get();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.tipo !== tipo) continue;
        const fecha = data.fecha?.toDate?.();
        if (fecha && fecha > weekAgo) {
            const fechaStr = fecha.toLocaleDateString('es-ES');
            return { fecha: fechaStr, docId: doc.id };
        }
    }
    return null;
}

async function applySolicitudCooldown(db, uid) {
    try {
        const snapshot = await db.collection('solicitudes')
            .where('userId', '==', uid)
            .get();
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const cooldownTipos = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            const fecha = data.fecha?.toDate?.();
            if (fecha && fecha > weekAgo) {
                if (!cooldownTipos[data.tipo]) {
                    cooldownTipos[data.tipo] = fecha.toLocaleDateString('es-ES');
                }
            }
        });
        const tipos = [
            { tipo: 'actualizar_cuentas', btnId: 'btn-solicitar-actualizar-cuentas' },
            { tipo: 'ser_socio', btnId: 'btn-solicitar-ser-socio' }
        ];
        for (const { tipo, btnId } of tipos) {
            if (cooldownTipos[tipo]) {
                const btn = document.getElementById(btnId);
                if (btn) {
                    btn.style.pointerEvents = 'none';
                    btn.classList.add('opacity-50');
                    btn.setAttribute('tabindex', '-1');
                    btn.setAttribute('aria-disabled', 'true');
                    btn.setAttribute('title', 'No puedes volver a solicitarlo hasta que pase una semana.');
                    btn.setAttribute('data-bs-toggle', 'tooltip');
                    btn.setAttribute('data-bs-placement', 'left');
                    setTimeout(() => {
                        try { new bootstrap.Tooltip(btn); } catch (e) {}
                    }, 100);
                }
            }
        }
    } catch (e) {}
}
