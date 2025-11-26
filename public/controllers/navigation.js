document.addEventListener('DOMContentLoaded', () => {
    const navbarContainer = document.querySelector('header');
    const footerContainer = document.querySelector('footer');

    // Cargar Navbar y luego inicializar la UI de autenticación
    fetch('/resources/layouts/navbar.html')
        .then(response => response.text())
        .then(html => {
            navbarContainer.innerHTML = html;
            // Una vez cargado el navbar, podemos escuchar el estado de autenticación
            setupAuthUI(); 
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
        { text: 'Actividades', href: '/actividades.html' },
        { text: 'Eventos', href: '/eventos.html' },
        { text: 'Quiénes somos', href: '/quienes-somos.html' }
    ];

    if (isLoggedIn) {
        const isAdmin = await window.isUserAdmin();
        const isSocio = await window.isUserSocio();

        if (isSocio) {
            links.push({ text: 'Inventario', href: '/inventario.html' });
        }
        if (isAdmin) {
            links.push({ text: 'Lista de Usuarios', href: '/listaUsuarios.html' });
        }
    }

    const navbarList = document.getElementById('navbar-links');
    if (navbarList) {
        navbarList.innerHTML = links.map(link => `
            <li class="nav-item">
                <a class="nav-link ${window.location.pathname === link.href ? 'active' : ''}" href="${link.href}">${link.text}</a>
            </li>
        `).join('');
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
    firebase.auth().onAuthStateChanged(user => {
        // Poblar los enlaces del navbar basándose en si el usuario está logueado
        populateNavbarLinks(!!user);

        const userActionsDesktop = document.getElementById('user-navbar-actions');
        const userActionsMobile = document.getElementById('user-navbar-actions-mobile');

        if (user) {
            // El usuario ha iniciado sesión
            const userEmail = user.email;
            const desktopUI = `
                <div class="dropdown">
                    <button class="btn btn-outline-light dropdown-toggle" type="button" id="user-menu-desktop" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="fas fa-user-circle me-2"></i> ${userEmail}
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="user-menu-desktop">
                        <li><a class="dropdown-item" href="#" id="logout-button-desktop">Cerrar Sesión</a></li>
                    </ul>
                </div>
            `;
            const mobileUI = `
                <p class="text-light mb-2">${userEmail}</p>
                <button class="btn btn-danger w-100" id="logout-button-mobile">Cerrar Sesión</button>
            `;
            userActionsDesktop.innerHTML = desktopUI;
            userActionsMobile.innerHTML = mobileUI;

            document.getElementById('logout-button-desktop').addEventListener('click', () => firebase.auth().signOut());
            document.getElementById('logout-button-mobile').addEventListener('click', () => firebase.auth().signOut());

        } else {
            // El usuario no ha iniciado sesión
            const loginButton = `<a href="/login.html" class="btn btn-outline-light me-2">Login</a>`;
            const registerButton = `<a href="/registro.html" class="btn btn-warning">Registro</a>`;

            userActionsDesktop.innerHTML = loginButton + registerButton;
            userActionsMobile.innerHTML = `<div class="d-grid gap-2">${loginButton}${registerButton}</div>`;
        }
    });
}
