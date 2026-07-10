/**
 * Muestra una alerta de Bootstrap en el contenedor de alertas.
 * @param {string} message - El mensaje a mostrar.
 * @param {string} type - El tipo de alerta (e.g., 'success', 'danger', 'warning', 'info').
 */
function showAlert(message, type = 'success') {
    let alertContainer = document.getElementById('alert-container');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'alert-container';
        document.body.appendChild(alertContainer);
    }
    // Asegurar que esté fijo en esquina superior derecha y fuera del flujo
    if (!alertContainer.classList.contains('position-fixed')) {
        alertContainer.className = 'position-fixed top-0 end-0 p-3';
        alertContainer.style.zIndex = '1055';
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
    let modalEl = document.getElementById('confirmation-modal');
    if (!modalEl) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
<div class="modal fade" id="confirmation-modal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="confirmationModalLabel"></h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <p id="confirmation-modal-body-text"></p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-danger" id="confirm-action-btn">Confirmar</button>
            </div>
        </div>
    </div>
</div>`;
        document.body.appendChild(wrapper.firstElementChild);
        modalEl = document.getElementById('confirmation-modal');
    }
    const confirmationModal = new bootstrap.Modal(modalEl);
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

/**
 * Actualiza las etiquetas Open Graph para previsualización en redes sociales.
 * @param {string} title - Título del evento/actividad.
 * @param {string} description - Descripción.
 * @param {string} imageUrl - URL de la imagen del cartel.
 */
window.auditar = async function (section, action, description, metadata) {
    try {
        const user = firebase.auth().currentUser;
        if (!user) return;
        await firebase.firestore().collection('auditoria').add({
            timestamp: firebase.firestore.Timestamp.fromDate(new Date()),
            userId: user.uid,
            section: section,
            action: action,
            description: description,
            metadata: metadata || {}
        });
    } catch (e) {
        console.error('Error al registrar auditoría:', e);
    }
};

function updateOGTags(title, description, imageUrl) {
    const setMeta = (property, content) => {
        let el = document.querySelector(`meta[property="${property}"]`);
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute('property', property);
            document.head.appendChild(el);
        }
        el.setAttribute('content', content || '');
    };

    const origin = window.location.origin;
    const defaultTitle = 'Pacto del Loto';
    const defaultDesc = 'Asociación de juegos de mesa y rol';
    const defaultImage = origin + '/media/img/logo.png';

    setMeta('og:title', title || defaultTitle);
    setMeta('og:description', description || defaultDesc);
    setMeta('og:image', imageUrl || defaultImage);
    setMeta('og:url', window.location.href);
    setMeta('og:type', 'website');
    document.title = title || defaultTitle;
}
