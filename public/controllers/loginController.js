document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('login-form');
    const passwordInput = document.getElementById('password');
    const togglePasswordIcon = document.getElementById('toggle-password');
    const googleLoginButton = document.getElementById('google-login-button');
    const errorDiv = document.getElementById('auth-error');

    function togglePasswordVisibility(input, icon) {
        const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
        input.setAttribute('type', type);
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    }

    if (togglePasswordIcon) {
        togglePasswordIcon.addEventListener('click', function () {
            togglePasswordVisibility(passwordInput, togglePasswordIcon);
        });
    }

    loginForm.addEventListener('submit', function (event) {
        event.preventDefault();
        event.stopPropagation();

        errorDiv.classList.add('d-none');
        loginForm.classList.add('was-validated');

        if (!loginForm.checkValidity()) {
            return;
        }

        const email = document.getElementById('email').value;
        const password = passwordInput.value;

        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                window.location.href = '/index.html';
            })
            .catch((error) => {
                const errorMessage = getFirebaseErrorMessage(error.code);
                errorDiv.textContent = errorMessage;
                errorDiv.classList.remove('d-none');
                loginForm.classList.remove('was-validated');
            });
    });

    googleLoginButton.addEventListener('click', function() {
        const googleProvider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(googleProvider)
            .then((result) => {
                window.location.href = '/index.html';
            }).catch((error) => {
                const errorMessage = getFirebaseErrorMessage(error.code);
                errorDiv.textContent = errorMessage;
                errorDiv.classList.remove('d-none');
            });
    });
});

function getFirebaseErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
            return 'Credenciales incorrectas. Por favor, revisa tu correo y contraseña.';
        case 'auth/invalid-email':
            return 'El formato del correo electrónico no es válido.';
        case 'auth/user-disabled':
            return 'Este usuario ha sido deshabilitado.';
        case 'auth/popup-closed-by-user':
            return 'El proceso de inicio de sesión de Google fue cancelado.';
        case 'auth/account-exists-with-different-credential':
            return 'Ya existe una cuenta con este correo electrónico pero con un método de inicio de sesión diferente.';
        default:
            return 'Ha ocurrido un error inesperado. Por favor, inténtalo de nuevo.';
    }
}
