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
        /*{ text: 'Actividades', href: '/actividades.html' },*/
        { text: 'Eventos', href: '/eventos.html' },
        { text: 'Quiénes somos', href: '/quienes-somos.html' }
    ];

    if (isLoggedIn) {
        const isAdmin = await window.isUserAdmin();
        const isSocio = await window.isUserSocio();
        const isColaborador = await window.isUserColaborador();

        if (isSocio || isAdmin) {
            links.push({
                text: 'Torneos',
                isDropdown: true,
                items: [
                    { text: 'MTG Commander', href: '/mtg-commander.html', locked: false },
                    { text: 'MTG Modern', href: '/mtg-modern.html', locked: false },
                    { text: 'Star Wars Unlimited', href: '/starwars-unlimited.html', locked: true },
                    { text: 'Riftbound', href: '/riftbound.html', locked: true }
                ]
            });
        }
        if (isAdmin || isColaborador) {
            links.push({ text: 'Inventario', href: '/inventario.html' });
        }
        if (isAdmin) {
            links.push({ text: 'Lista de Usuarios', href: '/listaUsuarios.html' });
        }
    }

    const navbarList = document.getElementById('navbar-links');
    if (navbarList) {
        navbarList.innerHTML = links.map(link => {
            if (link.isDropdown) {
                const isAnySubPageActive = link.items.some(item => window.location.pathname === item.href);
                const dropdownClass = isAnySubPageActive ? 'active' : '';
                
                const itemsHtml = link.items.map(item => {
                    if (item.locked) {
                        return `
                            <li>
                                <span class="dropdown-item disabled">
                                    ${item.text}
                                    <i class="fas fa-lock ms-2"></i>
                                </span>
                            </li>
                        `;
                    } else {
                        const isSubActive = window.location.pathname === item.href ? 'active' : '';
                        return `
                            <li>
                                <a class="dropdown-item ${isSubActive}" href="${item.href}">
                                    ${item.text}
                                </a>
                            </li>
                        `;
                    }
                }).join('');

                return `
                    <li class="nav-item dropdown">
                        <a class="nav-link dropdown-toggle ${dropdownClass}" href="#" id="navbarDropdownTorneos" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            ${link.text}
                        </a>
                        <ul class="dropdown-menu dropdown-menu-dark" aria-labelledby="navbarDropdownTorneos">
                            ${itemsHtml}
                        </ul>
                    </li>
                `;
            } else {
                return `
                    <li class="nav-item">
                        <a class="nav-link ${window.location.pathname === link.href ? 'active' : ''}" href="${link.href}">${link.text}</a>
                    </li>
                `;
            }
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
            try {
                const doc = await db.collection('usuarios').doc(user.uid).get();
                if (doc.exists) {
                    const data = doc.data();
                    const nombre = data.nombre || '';
                    const apellidos = data.apellidos || '';
                    if (nombre && apellidos) displayName = `${nombre} ${apellidos.split(' ')[0]}`;
                    isSocio = data.isSocio === true;
                    isAdmin = data.isAdmin === true;
                }
            } catch (e) {}

            const sugerenciasItem = (isSocio || isAdmin)
                ? `<li><a class="dropdown-item" href="/buzon-sugerencias.html"><i class="fa-regular fa-lightbulb me-2"></i>Sugerencias socios</a></li><li><hr class="dropdown-divider"></li>`
                : '';

            const desktopUI = `
                <div class="dropdown">
                    <button class="btn btn-outline-light dropdown-toggle" type="button" id="user-menu-desktop" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="fas fa-user-circle me-2"></i> ${displayName}
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="user-menu-desktop">
                        <li><a class="dropdown-item" href="/perfil.html"><i class="fa-regular fa-user me-2"></i>Mi Perfil</a></li>
                        <li><hr class="dropdown-divider"></li>
                        ${sugerenciasItem}
                        <li><a class="dropdown-item text-danger" href="#" id="logout-button-desktop"><i class="fa-solid fa-right-from-bracket me-2"></i>Cerrar Sesión</a></li>
                    </ul>
                </div>
            `;
            const mobileUI = `
                <p class="text-light mb-2">${displayName}</p>
                <a class="btn btn-outline-light w-100 mb-2" href="/perfil.html"><i class="fa-regular fa-user me-2"></i>Mi Perfil</a>
                ${isSocio || isAdmin ? `<a class="btn btn-outline-warning w-100 mb-2" href="/buzon-sugerencias.html"><i class="fa-regular fa-lightbulb me-2"></i>Sugerencias socios</a>` : ''}
                <button class="btn btn-danger w-100" id="logout-button-mobile"><i class="fa-solid fa-right-from-bracket me-2"></i>Cerrar Sesión</button>
            `;
            userActionsDesktop.innerHTML = desktopUI;
            userActionsMobile.innerHTML = mobileUI;

            document.getElementById('logout-button-desktop').addEventListener('click', e => { e.preventDefault(); firebase.auth().signOut(); });
            document.getElementById('logout-button-mobile').addEventListener('click', () => firebase.auth().signOut());

        } else {
            userActionsDesktop.innerHTML = '<a href="/login.html" class="btn btn-outline-light me-2">Login</a><a href="/registro.html" class="btn btn-warning">Registro</a>';
            userActionsMobile.innerHTML = '<div class="d-grid gap-2"><a href="/login.html" class="btn btn-outline-light">Login</a><a href="/registro.html" class="btn btn-warning">Registro</a></div>';
        }
    });
}
