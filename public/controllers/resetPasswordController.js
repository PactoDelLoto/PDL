document.addEventListener('DOMContentLoaded', function () {
    const auth = firebase.auth();
    const resetForm = document.getElementById('reset-password-form');
    const emailInput = document.getElementById('email');
    const feedbackContainer = document.getElementById('feedback-message');

    resetForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const email = emailInput.value;

        // Limpiar mensajes anteriores
        feedbackContainer.innerHTML = '';

        if (!email) {
            showAlert('Por favor, introduce tu correo electrónico.', 'warning');
            return;
        }

        try {
            await auth.sendPasswordResetEmail(email);
            // Mostrar mensaje de éxito
            showAlert('¡Correo enviado! Revisa tu bandeja de entrada (y la carpeta de spam) para encontrar el enlace de restablecimiento.', 'success');
            resetForm.reset(); // Limpiar el formulario
        } catch (error) {
            console.error("Error al enviar correo de restablecimiento:", error);
            let userMessage = 'Ocurrió un error. Por favor, inténtalo de nuevo.';
            // Firebase devuelve 'auth/user-not-found' si el correo no está registrado
            if (error.code === 'auth/user-not-found') {
                userMessage = 'No se ha encontrado ningún usuario con ese correo electrónico. Por favor, verifica la dirección.';
            }
            showAlert(userMessage, 'danger');
        }
    });

    /**
     * Muestra una alerta de Bootstrap en el contenedor de feedback.
     * @param {string} message El mensaje a mostrar.
     * @param {string} type El tipo de alerta (e.g., 'success', 'danger', 'warning').
     */
    function showAlert(message, type) {
        const alert = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        feedbackContainer.innerHTML = alert;
    }
});
