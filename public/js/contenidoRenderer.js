// Contenido dinámico gestionado desde el Panel de control.
// Las páginas públicas renderizan sus secciones desde Firestore (colección 'contenido').
// Los valores por defecto sirven de plantilla inicial y de "restaurar" en el panel.

window.CONTENIDO_DEFAULT = {
    quienesSomos: { secciones: [
        { tipo: 'hero', datos: { titulo: '¿Quiénes somos?', subtitulo: 'Un lugar donde la imaginación, la estrategia y la amistad se dan la mano.', icono: 'fa-solid fa-dragon', imagenFondo: '/media/img/carrusel1.jpg', modo: 'oscuro' } },
        { tipo: 'textoImagen', datos: { titulo: 'Nuestra historia', imagen: '/media/img/carrusel1.jpg', alt: 'Nuestra asociación', imagenDerecha: false, parrafos: [
            'Pacto del Loto nació de la pasión de un grupo de amigos por los juegos de cartas, miniaturas y rol. Desde nuestros humildes inicios en una pequeña sala, hemos crecido hasta convertirnos en una comunidad vibrante y diversa, donde cada miembro aporta su chispa única.',
            'Creemos en el poder del juego para unir personas, fomentar la creatividad y crear recuerdos inolvidables. Organizamos eventos, torneos y jornadas temáticas donde la diversión y el respeto son las reglas principales.'
        ] } },
        { tipo: 'tarjetas', datos: { titulo: '', items: [
            { icono: 'fa-solid fa-people-group', titulo: 'Comunidad', texto: 'Un espacio seguro y abierto para todos los jugadores.', enlace: '' },
            { icono: 'fa-solid fa-lightbulb', titulo: 'Creatividad', texto: 'Fomentamos la imaginación y la innovación en cada partida.', enlace: '' },
            { icono: 'fa-solid fa-handshake-angle', titulo: 'Colaboración', texto: 'El trabajo en equipo y la amistad son nuestro motor.', enlace: '' },
            { icono: 'fa-solid fa-trophy', titulo: 'Superación', texto: 'Nos retamos a mejorar y celebrar cada logro juntos.', enlace: '' }
        ] } }
    ] },
    hazteSocio: { secciones: [
        { tipo: 'textoCentrado', datos: { titulo: '¡Hazte socio de Pacto del Loto!', subtitulo: 'Disfruta de todas estas ventajas exclusivas para socios:', parrafos: [], fondoClaro: true } },
        { tipo: 'tarjetas', datos: { titulo: '', items: [
            { icono: 'fa-solid fa-users', titulo: 'Comunidad', texto: 'Forma parte de una comunidad activa de jugadores y aficionados.', enlace: 'https://www.instagram.com/pacto_del_loto/?next=%2F' },
            { icono: 'fa-solid fa-dice-d20', titulo: 'Eventos exclusivos', texto: 'Participa en torneos, ligas y eventos solo para socios.', enlace: '/eventos.html' },
            { icono: 'fa-solid fa-chess-knight', titulo: 'Juegos de mesa y rol', texto: 'Acceso a una amplia ludoteca y partidas organizadas.', enlace: '' },
            { icono: 'fa-brands fa-whatsapp', titulo: 'Grupo de WhatsApp', texto: 'Entra en nuestro grupo de WhatsApp de noticias.', enlace: 'https://chat.whatsapp.com/C7DqoaYuEaY0tZq66yjJ3m' }
        ] } },
        { tipo: 'cta', datos: { botonTexto: '¡Quiero registrarme!', botonEnlace: '/registro.html', avisoTexto: 'Ser socio tiene una cuota de <strong>2€ al mes</strong>. Si tienes dudas, <a href="/contacto.html" class="alert-link">contáctanos</a>.' } },
        { tipo: 'pdf', datos: { url: 'https://drive.google.com/file/d/1SoE6oyRhkHxHnPhvLTtLSy0mdm79iTnT/preview', altura: '1000', titulo: 'Información de socio', descripcion: 'Consulta toda la información sobre cómo hacerte socio de Pacto del Loto:' } }
    ] },
    home: { globalDuracion: 5, carrusel: [
        { url: '/media/img/carrusel1.jpg', titulo: 'Pacto del Loto', texto: 'Asociación gaditana de juegos de cartas TCG, miniaturas y Rol' },
        { url: '/media/img/carrusel2.jpg', titulo: 'Pacto del Loto', texto: 'Asociación gaditana de juegos de cartas TCG, miniaturas y Rol' },
        { url: '/media/img/carrusel3.jpg', titulo: 'Pacto del Loto', texto: 'Asociación gaditana de juegos de cartas TCG, miniaturas y Rol' }
    ] },
    config: { emailContacto: 'pactodellotocadiz@gmail.com', instagramUrl: 'https://www.instagram.com/pacto_del_loto/', whatsappUrl: 'https://chat.whatsapp.com/C7DqoaYuEaY0tZq66yjJ3m', cuotaMensualEur: '2' }
};

window.contenidoRenderer = (function () {
    'use strict';

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function escAttr(v) { return esc(v); }

    function whenDbReady(fn, tries) {
        tries = tries || 0;
        try {
            if (window.db || (window.firebase && firebase.apps && firebase.apps.length > 0)) { fn(); return; }
        } catch (e) { /* sigue esperando */ }
        if (tries > 50) { console.error('Firebase no disponible para el contenido.'); return; }
        setTimeout(function () { whenDbReady(fn, tries + 1); }, 100);
    }

    // Renderers de secciones --------------------------------------------
    function heroHtml(d) {
        const modo = d.modo === 'claro' ? 'claro' : 'oscuro';
        const bg = d.imagenFondo ? `background-image: linear-gradient(rgba(30,30,30,0.7),rgba(30,30,30,0.7)), url('${escAttr(d.imagenFondo)}');` : '';
        return `<section class="din-hero din-hero-${modo}" style="${bg}">
            <div class="container py-5">
                ${d.icono ? `<i class="${esc(d.icono)} din-hero-icon"></i>` : ''}
                <h2 class="fw-bold display-3 mb-3">${esc(d.titulo)}</h2>
                <p class="lead fs-4 mb-0">${esc(d.subtitulo)}</p>
            </div>
        </section>`;
    }

    function textoImagenHtml(d) {
        const parrafos = Array.isArray(d.parrafos) ? d.parrafos : [];
        const colImagen = `<div class="col-lg-6"><img src="${escAttr(d.imagen)}" alt="${escAttr(d.alt || '')}" class="img-fluid rounded-4 shadow-lg"></div>`;
        const colTexto = `<div class="col-lg-6">
            <h2 class="fw-bold mb-3">${esc(d.titulo)}</h2>
            ${parrafos.map(p => `<p class="fs-5">${esc(p)}</p>`).join('')}
        </div>`;
        return `<section class="din-sec">
            <div class="container">
                <div class="row align-items-center g-5 ${d.imagenDerecha ? 'flex-row-reverse' : ''}">
                    ${colImagen}
                    ${colTexto}
                </div>
            </div>
        </section>`;
    }

    function tarjetasHtml(d) {
        const items = Array.isArray(d.items) ? d.items : [];
        const n = items.length;
        const col = n >= 4 ? 3 : n === 3 ? 4 : n === 2 ? 6 : 12;
        return `<section class="din-sec">
            <div class="container">
                ${d.titulo ? `<h2 class="text-center fw-bold mb-4">${esc(d.titulo)}</h2>` : ''}
                <div class="row g-4 justify-content-center din-tarjetas-col">
                    ${items.map(it => {
                        const interno = `<div class="card h-100 border-0 shadow-sm text-center py-4">
                            <div class="mb-3"><i class="${esc(it.icono)} fa-2x text-primary"></i></div>
                            <h5 class="fw-bold">${esc(it.titulo)}</h5>
                            <p class="small mb-0">${esc(it.texto)}</p>
                        </div>`;
                        const externo = /^https?:\/\//.test(it.enlace || '');
                        const inner = it.enlace
                            ? `<a href="${escAttr(it.enlace)}" class="card-link-wrapper d-block h-100"${externo ? ' target="_blank" rel="noopener noreferrer"' : ''}>${interno}</a>`
                            : `<div class="h-100">${interno}</div>`;
                        return `<div class="col-12 col-sm-6 col-md-${col}">${inner}</div>`;
                    }).join('')}
                </div>
            </div>
        </section>`;
    }

    function textoCentradoHtml(d) {
        const parrafos = Array.isArray(d.parrafos) ? d.parrafos : [];
        return `<section class="din-sec ${d.fondoClaro ? 'bg-light' : ''}">
            <div class="container text-center">
                <h1 class="display-5 fw-bold mb-3">${esc(d.titulo)}</h1>
                ${d.subtitulo ? `<p class="lead">${esc(d.subtitulo)}</p>` : ''}
                ${parrafos.map(p => `<p>${esc(p)}</p>`).join('')}
            </div>
        </section>`;
    }

    function ctaHtml(d) {
        return `<section class="din-sec py-4 bg-white">
            <div class="container text-center">
                <a class="btn btn-primary btn-lg mb-3" id="hazte-socio-cta-btn" href="${escAttr(d.botonEnlace)}">
                    <i class="fa-solid fa-user-plus me-2"></i>${esc(d.botonTexto)}
                </a>
                <div id="hazte-socio-info" class="alert alert-warning small mt-2 mb-0 mx-auto text-start d-none" role="alert" style="max-width:600px;">
                    ${d.avisoTexto || ''}
                </div>
            </div>
        </section>`;
    }

    function pdfHtml(d) {
        return `<section class="din-sec bg-white">
            <div class="container">
                ${d.titulo ? `<div class="text-center mb-4">
                    <h2 class="fw-bold">${esc(d.titulo)}</h2>
                    ${d.descripcion ? `<p>${esc(d.descripcion)}</p>` : ''}
                </div>` : ''}
                <div class="row justify-content-center">
                    <div class="col-12 col-md-10 col-lg-8">
                        <iframe src="${escAttr(d.url)}" width="100%" height="${escAttr(d.altura || 800)}" frameborder="0" allowfullscreen style="border-radius:6px;"></iframe>
                    </div>
                </div>
            </div>
        </section>`;
    }

    function htmlLibreHtml(d) {
        return `<section class="din-sec">
            <div class="container">${d.html || ''}</div>
        </section>`;
    }

    function renderSeccion(sec) {
        const d = sec.datos || {};
        switch (sec.tipo) {
            case 'hero': return heroHtml(d);
            case 'textoImagen': return textoImagenHtml(d);
            case 'tarjetas': return tarjetasHtml(d);
            case 'textoCentrado': return textoCentradoHtml(d);
            case 'cta': return ctaHtml(d);
            case 'pdf': return pdfHtml(d);
            case 'html': return htmlLibreHtml(d);
            default: return '';
        }
    }

    // Cargadores públicos -------------------------------------------------
    function cargarPagina(containerId, docKey) {
        whenDbReady(async function () {
            const container = document.getElementById(containerId);
            if (!container) return;
            try {
                const dbRef = window.db || firebase.firestore();
                const snap = await dbRef.collection('contenido').doc(docKey).get();
                if (snap.exists) {
                    const data = snap.data();
                    if (Array.isArray(data.secciones) && data.secciones.length) {
                        container.innerHTML = data.secciones.map(renderSeccion).join('');
                    }
                }
            } catch (e) {
                console.error('No se pudo cargar el contenido de ' + docKey + ':', e);
            }
            notificar();
        });
        return this;
    }

    function cargarCarrusel() {
        // Seguridad: si Firebase no está disponible, se muestra el contenido
        // (estático o ya renderizado) pasados unos segundos.
        setTimeout(function () {
            revelarCarrusel(document.getElementById('carouselExampleIndicators'));
        }, 3500);
        whenDbReady(async function () {
            try {
                const dbRef = window.db || firebase.firestore();
                const snap = await dbRef.collection('contenido').doc('home').get();
                if (snap.exists) {
                    const data = snap.data();
                    if (Array.isArray(data.carrusel) && data.carrusel.length) renderCarrusel(data.carrusel, data.globalDuracion);
                }
            } catch (e) {
                console.error('No se pudo cargar el carrusel:', e);
            }
            revelarCarrusel(document.getElementById('carouselExampleIndicators'));
            notificar();
        });
        return this;
    }

    // Muestra las imágenes del carrusel (desde el fondo gris inicial).
    function revelarCarrusel(carouselEl) {
        if (!carouselEl) return;
        carouselEl.classList.add('carrusel-listo');
    }

    function renderCarrusel(carrusel, globalDuracion) {
        const ind = document.querySelector('#carouselExampleIndicators .carousel-indicators');
        const inner = document.querySelector('#carouselExampleIndicators .carousel-inner');
        const carouselEl = document.getElementById('carouselExampleIndicators');
        if (!inner || !carouselEl) return;
        const visibles = (carrusel || []).filter(s => s.oculto !== true);
        if (!visibles.length) return;
        const defaultDur = Number(globalDuracion) || 5;
        if (ind) {
            ind.innerHTML = visibles.map((s, i) => `<button type="button" data-bs-target="#carouselExampleIndicators" data-bs-slide-to="${i}" ${i === 0 ? 'class="active" aria-current="true"' : ''} aria-label="Slide ${i + 1}"></button>`).join('');
        }
        inner.innerHTML = visibles.map((s, i) => {
            const dur = Number(s.duracion) || defaultDur;
            return `<div class="carousel-item${i === 0 ? ' active' : ''}" data-titulo="${escAttr(s.titulo || '')}" data-texto="${escAttr(s.texto || '')}" data-bs-interval="${dur * 1000}">
            <img class="d-block w-100" src="${escAttr(s.url)}" alt="${escAttr(s.titulo || '')}">
        </div>`;
        }).join('');
        asegurarCaption(carouselEl);
        setupCaptions(carouselEl);
        try {
            const C = window.bootstrap && bootstrap.Carousel;
            if (C) {
                const inst = C.getOrCreateInstance ? C.getOrCreateInstance(carouselEl) : (C.getInstance(carouselEl) || new C(carouselEl));
                if (inst && inst.to) inst.to(0);
            }
        } catch (e) { /* el carrusel sigue funcionando sin resetear a la primera imagen */ }
    }

    // Superpone un mensaje fijo sobre el carrusel: solo la imagen se desliza
    // y el texto cambia con un fade al pasar de diapositiva.
    function asegurarCaption(carouselEl) {
        if (carouselEl.querySelector('.din-caption')) return;
        const cap = document.createElement('div');
        cap.className = 'din-caption';
        cap.id = 'carrusel-caption';
        cap.innerHTML = '<div class="caption-box"><div class="caption-texto"><h2 class="fw-bold display-5" id="carrusel-caption-titulo"></h2><p class="lead mt-2 mb-0" id="carrusel-caption-texto"></p></div></div>';
        const inner = carouselEl.querySelector('.carousel-inner');
        if (inner) inner.insertAdjacentElement('afterend', cap);
    }

    function setupCaptions(carouselEl) {
        if (carouselEl.dataset.captionBound) { actualizarCaption(carouselEl); return; }
        carouselEl.dataset.captionBound = '1';
        carouselEl.addEventListener('slide.bs.carousel', function () {
            const cap = carouselEl.querySelector('.din-caption');
            if (cap) cap.classList.add('din-caption-fade');
        });
        carouselEl.addEventListener('slid.bs.carousel', function () {
            actualizarCaption(carouselEl);
            const cap = carouselEl.querySelector('.din-caption');
            if (cap) cap.classList.remove('din-caption-fade');
        });
        actualizarCaption(carouselEl);
    }

    function actualizarCaption(carouselEl) {
        const cap = carouselEl.querySelector('.din-caption');
        if (!cap) return;
        const active = carouselEl.querySelector('.carousel-item.active');
        const titulo = active ? (active.dataset.titulo || '') : '';
        const texto = active ? (active.dataset.texto || '') : '';
        const t = document.getElementById('carrusel-caption-titulo');
        const p = document.getElementById('carrusel-caption-texto');
        if (t) t.textContent = titulo;
        if (p) p.textContent = texto;
        cap.classList.toggle('d-none', !titulo && !texto);
    }

    function setupCarruselCaptions() {
        const carouselEl = document.getElementById('carouselExampleIndicators');
        if (!carouselEl) return;
        asegurarCaption(carouselEl);
        setupCaptions(carouselEl);
    }

    // Callbacks tras renderizar (ej: reconectar el CTA de "hazte socio")
    const callbacks = [];
    function alRenderizar(fn) { callbacks.push(fn); }
    function notificar() { callbacks.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

    return {
        cargarPagina: cargarPagina,
        cargarCarrusel: cargarCarrusel,
        renderSeccion: renderSeccion,
        renderCarrusel: renderCarrusel,
        setupCarruselCaptions: setupCarruselCaptions,
        alRenderizar: alRenderizar,
        esc: esc
    };
})();