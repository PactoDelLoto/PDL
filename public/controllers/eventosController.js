$(document).ready(function() {
    // --- DATOS DE EJEMPLO ---
    const eventosDeEjemplo = [
        {
            id: 1,
            nombre: 'Torneo de Magic: The Gathering',
            fecha: '2024-08-10',
            tipo: 'TCG',
            descripcion: 'Clásico torneo de formato Modern. ¡Premios para el Top 8!',
            imagen_url: '/media/img/image1.jpg'
        },
        {
            id: 2,
            nombre: 'Partida de Iniciación a D&D 5e',
            fecha: '2024-08-12',
            tipo: 'Rol',
            descripcion: '¿Nunca has jugado rol? ¡Esta es tu oportunidad! Plazas limitadas.',
            imagen_url: '/media/img/image2.jpg'
        },
        {
            id: 3,
            nombre: 'Tarde de Juegos de Mesa',
            fecha: '2024-08-15',
            tipo: 'Juegos de Mesa',
            descripcion: 'Trae tus juegos o descubre los de nuestra ludoteca. Actividad abierta.',
            imagen_url: '/media/img/image3.jpg'
        },
        {
            id: 4,
            nombre: 'Liga de Warhammer 40k',
            fecha: '2024-08-20',
            tipo: 'Miniaturas',
            descripcion: 'Comienza la liga de verano. ¡Demuestra quién manda en el campo de batalla!',
            imagen_url: '/media/img/image1.jpg'
        },
        {
            id: 5,
            nombre: 'Presentación de la nueva expansión de Lorcana',
            fecha: '2024-08-25',
            tipo: 'TCG',
            descripcion: 'Juega con las nuevas cartas antes que nadie. Kit de presentación incluido.',
            imagen_url: '/media/img/image2.jpg'
        }
    ];

    const catalogo = $('#eventos-catalogo');

    if (catalogo.length) {
        console.log('Cargando eventos de ejemplo...');
        let eventosHTML = '';
        eventosDeEjemplo.forEach(evento => {
            eventosHTML += `
                <div class="col-lg-3 col-md-4 col-sm-6 mb-4">
                    <div class="card h-100 shadow-sm event-card">
                        <img src="${evento.imagen_url}" class="card-img-top event-img" alt="${evento.nombre}">
                        <div class="card-body event-info">
                            <h5 class="card-title event-title">${evento.nombre}</h5>
                            <p class="card-text event-date">${new Date(evento.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}</p>
                            <p class="card-text event-extra">${evento.tipo}</p>
                        </div>
                        <div class="event-hover-details">
                            ${evento.descripcion}
                        </div>
                    </div>
                </div>
            `;
        });
        catalogo.html(eventosHTML);
        console.log('Eventos cargados.');
    } else {
        console.error('Error: El contenedor #eventos-catalogo no fue encontrado.');
    }
});
