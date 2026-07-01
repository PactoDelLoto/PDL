
document.addEventListener('DOMContentLoaded', function () {
    // --- ELEMENTOS DEL DOM ---
    const form = document.getElementById('registro-form');
    const googleLoginButton = document.getElementById('google-login-button');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const errorDiv = document.getElementById('auth-error');
    const passwordErrorFeedback = document.getElementById('password-error-feedback');
    const togglePasswordIcon = document.getElementById('toggle-password');
    const toggleConfirmPasswordIcon = document.getElementById('toggle-confirm-password');

    // --- LÓGICA DE VISIBILIDAD DE CONTRASEÑA ---
    function togglePasswordVisibility(input, icon) {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        icon.classList.toggle('fa-eye-slash', !isHidden);
        icon.classList.toggle('fa-eye', isHidden);
    }

    if (togglePasswordIcon) {
        togglePasswordIcon.addEventListener('click', () => togglePasswordVisibility(passwordInput, togglePasswordIcon));
    }

    if (toggleConfirmPasswordIcon) {
        toggleConfirmPasswordIcon.addEventListener('click', () => togglePasswordVisibility(confirmPasswordInput, toggleConfirmPasswordIcon));
    }

    // --- LÓGICA DE VALIDACIÓN DE FORTALEZA DE CONTRASEÑA ---
    const strengthChecks = {
        length: document.getElementById('length-check'),
        case: document.getElementById('case-check'),
        number: document.getElementById('number-check'),
        symbol: document.getElementById('symbol-check')
    };
    const validations = {
        length: v => v.length >= 8,
        case: v => /[a-z]/.test(v) && /[A-Z]/.test(v),
        number: v => /[0-9]/.test(v),
        symbol: v => /[^A-Za-z0-9]/.test(v)
    };

    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            const password = passwordInput.value;
            for (const key in validations) {
                const checkElement = strengthChecks[key];
                const isValid = validations[key](password);
                if (checkElement) {
                    checkElement.classList.toggle('valid', isValid);
                    checkElement.classList.toggle('invalid', !isValid);
                    const icon = checkElement.querySelector('i');
                    if (icon) {
                        icon.className = isValid ? 'fas fa-check-circle' : 'fas fa-times-circle';
                    }
                }
            }
        });
    }

    // --- GESTIÓN DEL ENVÍO DEL FORMULARIO ---
    if (form) {
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            event.stopPropagation();

            if (!form.checkValidity() || passwordInput.value !== confirmPasswordInput.value) {
                if (passwordInput.value !== confirmPasswordInput.value) {
                    confirmPasswordInput.setCustomValidity('Las contraseñas no coinciden.');
                }
                form.classList.add('was-validated');
                return;
            }

            const email = document.getElementById('email').value;
            const password = passwordInput.value;
            const nombre = document.getElementById('nombre').value;
            const apellidos = document.getElementById('apellidos').value;
            const telefono = document.getElementById('telefono').value; // Asumiendo que tienes un input con id="telefono"

            auth.createUserWithEmailAndPassword(email, password)
                .then(userCredential => {
                    const user = userCredential.user;
                    // Guarda el documento del usuario en Firestore con la estructura correcta
                    return db.collection('usuarios').doc(user.uid).set({
                        UID: user.uid,
                        nombre: nombre,
                        apellidos: apellidos,
                        correo: email, // Corregido de 'email' a 'correo'
                        telefono: telefono,
                        isAdmin: false, // Por defecto, no es admin
                        isSocio: false, // Por defecto, no es socio
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    }).then(() => {
                        window.location.href = '/index.html';
                    });
                })
                .catch(error => {
                    const errorMessage = getFirebaseErrorMessage(error.code);
                    errorDiv.textContent = errorMessage;
                    errorDiv.classList.remove('d-none');
                });
        });
    }

    // --- MANEJO DEL LOGIN CON GOOGLE ---
    if (googleLoginButton) {
        googleLoginButton.addEventListener('click', function() {
            const googleProvider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(googleProvider)
                .then(result => {
                    const user = result.user;
                    const userRef = db.collection('usuarios').doc(user.uid);
                    return userRef.get().then(docSnapshot => {
                        if (!docSnapshot.exists) {
                            const profile = result.additionalUserInfo.profile;
                            // Guarda el documento del usuario de Google con la estructura correcta
                            return userRef.set({
                                UID: user.uid,
                                nombre: profile.given_name || user.displayName.split(' ')[0],
                                apellidos: profile.family_name || user.displayName.split(' ').slice(1).join(' '),
                                correo: user.email, // Corregido
                                telefono: user.phoneNumber || '', // Google no siempre provee teléfono
                                isAdmin: false,
                                isSocio: false,
                                timestamp: firebase.firestore.FieldValue.serverTimestamp()
                            });
                        }
                    }).then(() => {
                        window.location.href = '/index.html';
                    });
                }).catch(error => {
                    const errorMessage = getFirebaseErrorMessage(error.code);
                    errorDiv.textContent = errorMessage;
                    errorDiv.classList.remove('d-none');
                });
        });
    }

    // --- OTROS LISTENERS Y FUNCIONES DE ERROR (Sin cambios) ---
    if (confirmPasswordInput) confirmPasswordInput.addEventListener('input', () => confirmPasswordInput.setCustomValidity(''));
    if (passwordInput) passwordInput.addEventListener('input', () => { passwordInput.setCustomValidity(''); passwordErrorFeedback.textContent = ''; });
});

function getFirebaseErrorMessage(errorCode) {
    switch(errorCode){
        case 'auth/email-already-in-use': return 'Este correo electrónico ya está en uso por otro método de registro.';
        case 'auth/invalid-email': return 'El correo electrónico no es válido.';
        case 'auth/weak-password': return 'La contraseña es demasiado débil.';
        case 'auth/popup-closed-by-user': return 'El proceso de registro con Google fue cancelado.';
        case 'auth/account-exists-with-different-credential': return 'Ya existe una cuenta con este correo, pero con un método de inicio de sesión diferente.';
        default: return 'Error inesperado durante el registro.';
    }
}
