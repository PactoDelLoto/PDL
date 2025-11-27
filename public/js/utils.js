/**
 * Muestra una alerta de Bootstrap en el contenedor de alertas.
 * @param {string} message - El mensaje a mostrar.
 * @param {string} type - El tipo de alerta (e.g., 'success', 'danger', 'warning', 'info').
 */
function showAlert(message, type = 'success') {
    const alertContainer = document.getElementById('alert-container');
    if (!alertContainer) {
        console.error('El contenedor de alertas no se encontró en el DOM.');
        return;
    }

    const alertId = `alert-${Date.now()}`;
    const alertHTML = `
        <div id="${alertId}" class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;

    alertContainer.insertAdjacentHTML('beforeend', alertHTML);

    // Auto-eliminar la alerta después de 5 segundos
    const alertElement = document.getElementById(alertId);
    setTimeout(() => {
        const bsAlert = new bootstrap.Alert(alertElement);
        if (bsAlert) {
            bsAlert.close();
        }
    }, 5000);
}

/**
 * Muestra un modal de confirmación y ejecuta un callback al confirmar.
 * @param {string} title - El título del modal.
 * @param {string} bodyText - El texto del cuerpo del modal.
 * @param {function} onConfirm - La función a ejecutar si el usuario confirma.
 */
function showConfirmationModal(title, bodyText, onConfirm) {
    const confirmationModal = new bootstrap.Modal(document.getElementById('confirmation-modal'));
    document.getElementById('confirmationModalLabel').textContent = title;
    document.getElementById('confirmation-modal-body-text').textContent = bodyText;

    const confirmBtn = document.getElementById('confirm-action-btn');
    
    // Clonar y reemplazar el botón para evitar listeners duplicados
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', () => {
        onConfirm();
        confirmationModal.hide();
    });

    confirmationModal.show();
}
