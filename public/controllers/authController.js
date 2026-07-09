
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
 * Checks if the currently logged-in user is a "socio".
 * @returns {Promise<boolean>} A promise that resolves to true if the user is a socio, false otherwise.
 */
window.isUserSocio = function() {
    return new Promise((resolve) => {
        const user = auth.currentUser;
        if (!user) {
            resolve(false);
            return;
        }

        const userRef = db.collection('usuarios').doc(user.uid);
        userRef.get().then(doc => {
            // Un socio puede ser admin o no, así que solo verificamos isSocio
            if (doc.exists && doc.data().isSocio === true) {
                resolve(true);
            } else {
                resolve(false);
            }
        }).catch(error => {
            console.error("Error al verificar el estado de socio:", error);
            resolve(false); // Resolve to false on error to prevent unauthorized access
        });
    });
};

/**
 * Checks if the currently logged-in user is a colaborador.
 * @returns {Promise<boolean>}
 */
window.isUserColaborador = function() {
    return new Promise((resolve) => {
        const user = auth.currentUser;
        if (!user) { resolve(false); return; }
        db.collection('usuarios').doc(user.uid).get().then(doc => {
            resolve(doc.exists && doc.data().isColaborador === true);
        }).catch(error => {
            console.error("Error al verificar el estado de colaborador:", error);
            resolve(false);
        });
    });
};

window.isUserDesactivado = function() {
    return new Promise((resolve) => {
        const user = auth.currentUser;
        if (!user) { resolve(false); return; }
        db.collection('usuarios').doc(user.uid).get().then(doc => {
            resolve(doc.exists && doc.data().desactivado === true);
        }).catch(error => {
            console.error("Error al verificar estado de desactivación:", error);
            resolve(false);
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

// Bloquear acceso a usuarios desactivados
auth.onAuthStateChanged(user => {
    const existingOverlay = document.getElementById('deactivation-overlay');
    if (!user) {
        if (existingOverlay) existingOverlay.remove();
        return;
    }
    db.collection('usuarios').doc(user.uid).get().then(doc => {
        if (doc.exists && doc.data().desactivado === true) {
            if (document.getElementById('deactivation-overlay')) return;
            const overlay = document.createElement('div');
            overlay.id = 'deactivation-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.88);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;color:white;text-align:center;padding:2rem;';
            overlay.innerHTML = `
                <h2 class="mb-4">Cuenta desactivada</h2>
                <p style="max-width:500px;font-size:1.1rem;">Su perfil ha sido desactivado, si considera que esto es un error contáctenos a través de nuestro correo <a href="mailto:pactodellotocadiz@gmail.com" style="color:#f8c291;font-weight:bold;">pactodellotocadiz@gmail.com</a></p>
                <button onclick="firebase.auth().signOut();" class="btn btn-warning mt-4">Cerrar sesión</button>
            `;
            document.body.appendChild(overlay);
        } else {
            if (existingOverlay) existingOverlay.remove();
        }
    }).catch(() => {});
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
