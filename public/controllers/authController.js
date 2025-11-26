
/**
 * Checks if the currently logged-in user is an administrator.
 * @returns {Promise<boolean>} A promise that resolves to true if the user is an admin, false otherwise.
 */
window.isUserAdmin = function() {
    return new Promise((resolve) => {
        const user = auth.currentUser;
        if (!user) {
            resolve(false);
            return;
        }

        const userRef = db.collection('usuarios').doc(user.uid);
        userRef.get().then(doc => {
            if (doc.exists && doc.data().isAdmin === true) {
                resolve(true);
            } else {
                resolve(false);
            }
        }).catch(error => {
            console.error("Error al verificar el estado de administrador:", error);
            resolve(false); // Resolve to false on error to prevent unauthorized access
        });
    });
};

/**
 * Observador del estado de autenticación de Firebase.
 * Se ejecuta cuando la página carga y cada vez que el estado de autenticación cambia.
 */
auth.onAuthStateChanged(user => {
    // Llama a la función que actualiza la UI del navbar.
    // La función se define en navigation.js para asegurar que el navbar exista primero.
    if (window.renderAuthUI) {
        window.renderAuthUI(user);
    }
});

/**
 * Función global para renderizar los botones de usuario en el navbar.
 * Esta función es llamada por navigation.js y por el observador de auth.
 * @param {firebase.User | null} user El objeto de usuario de Firebase, o null si no está conectado.
 */
window.renderAuthUI = function(user) {
    const userActionsDesktop = document.getElementById('user-navbar-actions');
    const userActionsMobile = document.getElementById('user-navbar-actions-mobile');

    // Si los contenedores del navbar no existen, no hacer nada.
    if (!userActionsDesktop || !userActionsMobile) {
        console.warn("Contenedores de UI de autenticación no encontrados.");
        return;
    }

    let desktopHTML = '';
    let mobileHTML = '';

    if (user) {
        // USUARIO CONECTADO
        const userEmail = user.email ? user.email.split('@')[0] : 'Usuario'; // Nombre de usuario antes del @
        desktopHTML = `
            <div class="dropdown">
                <button class="btn btn-primary dropdown-toggle" type="button" id="userDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="fas fa-user me-2"></i> ${userEmail}
                </button>
                <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userDropdown">
                    <li><a class="dropdown-item" href="/perfil.html">Mi Perfil</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><button class="dropdown-item" id="logout-button">Cerrar Sesión</button></li>
                </ul>
            </div>
        `;
        mobileHTML = `
            <div class="text-white mb-2">Hola, ${userEmail}</div>
            <a class="btn btn-info w-100 mb-2" href="/perfil.html">Mi Perfil</a>
            <button class="btn btn-danger w-100" id="logout-button-mobile">Cerrar Sesión</button>
        `;
    } else {
        // USUARIO DESCONECTADO
        desktopHTML = `
            <a href="/login.html" class="btn btn-outline-light me-2">Iniciar Sesión</a>
            <a href="/registro.html" class="btn btn-primary">Registrarse</a>
        `;
        mobileHTML = `
            <a href="/login.html" class="btn btn-outline-light w-100 mb-2">Iniciar Sesión</a>
            <a href="/registro.html" class="btn btn-primary w-100">Registrarse</a>
        `;
    }

    userActionsDesktop.innerHTML = desktopHTML;
    userActionsMobile.innerHTML = mobileHTML;

    // Añadir listener para el botón de logout (solo si el usuario está conectado)
    if (user) {
        $('#logout-button, #logout-button-mobile').on('click', () => {
            auth.signOut().then(() => {
                // El observador onAuthStateChanged se encargará de actualizar la UI.
                window.location.href = '/index.html'; // Redirigir a inicio por si acaso.
            });
        });
    }
};
