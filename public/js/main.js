const db = firebase.firestore();
const auth = firebase.auth();

// Caché para almacenar los datos de los usuarios y evitar lecturas repetidas
const userCache = {};

/**
 * Obtiene los datos de un usuario desde Firestore o desde la caché.
 * @param {string} uid - El ID del usuario.
 * @returns {Promise<Object|null>} - Los datos del usuario o null si no se encuentra.
 */
async function getUserData(uid) {
    if (!uid) return null;
    if (userCache[uid]) {
        return userCache[uid];
    }
    try {
        const userDoc = await db.collection('usuarios').doc(uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            userCache[uid] = userData; // Guardar en caché
            return userData;
        }
        console.warn(`No se encontraron datos para el usuario con UID: ${uid}`);
        return null;
    } catch (error) {
        console.error("Error obteniendo datos de usuario: ", error);
        return null;
    }
}

/**
 * Comprueba si el usuario actualmente autenticado es un administrador.
 * @returns {Promise<boolean>} - True si es administrador, false en caso contrario.
 */
window.isUserAdmin = async () => {
    const user = auth.currentUser;
    if (!user) return false;

    const userData = await getUserData(user.uid);
    return userData ? userData.isAdmin === true : false;
};

/**
 * Comprueba si el usuario actualmente autenticado es un socio.
 * @returns {Promise<boolean>} - True si es socio, false en caso contrario.
 */
window.isUserSocio = async () => {
    const user = auth.currentUser;
    if (!user) return false;

    const userData = await getUserData(user.uid);
    return userData ? userData.isSocio === true : false;
};

/**
 * Comprueba si el usuario actualmente autenticado es un colaborador.
 * @returns {Promise<boolean>} - True si es colaborador, false en caso contrario.
 */
window.isUserColaborador = async () => {
    const user = auth.currentUser;
    if (!user) return false;

    const userData = await getUserData(user.uid);
    return userData ? userData.isColaborador === true : false;
};

/**
 * Obtiene el nombre completo de un usuario a partir de su UID.
 * @param {string} uid - El ID del usuario.
 * @returns {Promise<string>} - El nombre completo o 'Desconocido'.
 */
window.getUserName = async (uid) => {
    if (!uid) return 'Desconocido';

    const userData = await getUserData(uid);
    if (userData && userData.nombre) {
        return `${userData.nombre} ${userData.apellidos || ''}`.trim();
    }
    return 'Desconocido';
};

// Lógica para mostrar/ocultar elementos de navegación según el rol del usuario
document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(async user => {
        const adminNav = document.getElementById('admin-nav-link');
        const inventarioNav = document.getElementById('inventario-nav-link');
        const prestamosNav = document.getElementById('prestamos-nav-link');
        const logoutBtn = document.getElementById('logout-btn');
        const loginBtn = document.getElementById('login-btn');

        if (user) {
            const isAdmin = await window.isUserAdmin();
            const isSocio = await window.isUserSocio();
            const isColaborador = await window.isUserColaborador();

            if (adminNav) adminNav.style.display = isAdmin ? 'block' : 'none';
            if (inventarioNav) inventarioNav.style.display = (isAdmin || isColaborador) ? 'block' : 'none';
            if (prestamosNav) prestamosNav.style.display = (isAdmin || isColaborador) ? 'block' : 'none';
            
            if (loginBtn) loginBtn.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'block';

        } else {
            // Ocultar enlaces si el usuario no está logueado
            if (adminNav) adminNav.style.display = 'none';
            if (inventarioNav) inventarioNav.style.display = 'none';
            if (prestamosNav) prestamosNav.style.display = 'none';

            if (loginBtn) loginBtn.style.display = 'block';
            if (logoutBtn) logoutBtn.style.display = 'none';
        }
    });

    // Evento para el botón de logout
    const logoutButton = document.getElementById('logout-btn');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            auth.signOut().then(() => {
                window.location.href = 'index.html';
            }).catch(error => {
                console.error("Error al cerrar sesión: ", error);
            });
        });
    }
});
