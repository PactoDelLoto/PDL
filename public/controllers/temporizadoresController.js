document.addEventListener('DOMContentLoaded', function () {
    const COLORES = [
        { id: 'negro', nombre: 'Negro', hex: '#000000' },
        { id: 'rojo', nombre: 'Rojo', hex: '#dc3545' },
        { id: 'azul', nombre: 'Azul', hex: '#0d6efd' },
        { id: 'verde', nombre: 'Verde', hex: '#198754' },
        { id: 'amarillo', nombre: 'Amarillo', hex: '#ffc107' },
        { id: 'naranja', nombre: 'Naranja', hex: '#fd7e14' },
        { id: 'morado', nombre: 'Morado', hex: '#6f42c1' },
        { id: 'rosa', nombre: 'Rosa', hex: '#d63384' }
    ];

    const form = document.getElementById('temporizador-form');
    if (!form) return;

    const auth = firebase.auth();

    const inputNombre = document.getElementById('tmp-nombre');
    const inputHoras = document.getElementById('tmp-horas');
    const inputMinutos = document.getElementById('tmp-minutos');
    const inputSegundos = document.getElementById('tmp-segundos');
    const colorPicker = document.getElementById('color-picker');

    const ANCHO_VENTANA = 800;
    const ALTO_VENTANA = 500;

    let ventanas = 0;
    let inited = false;

    auth.onAuthStateChanged(async user => {
        if (!user) {
            accesoDenegado('Acceso denegado. Por favor, inicie sesión.');
            return;
        }
        const [isAdmin, isColaborador] = await Promise.all([
            window.isUserAdmin(),
            window.isUserColaborador()
        ]);
        if (!isAdmin && !isColaborador) {
            accesoDenegado('Acceso denegado. Solo los administradores y colaboradores pueden acceder a esta sección.');
            return;
        }
        if (inited) return;
        inited = true;
        initTemporizadores();
    });

    function accesoDenegado(mensaje) {
        document.querySelector('main').innerHTML = `<div class="alert alert-danger">${mensaje}</div>`;
    }

    function initTemporizadores() {
        pintarColores();
        form.addEventListener('submit', onSubmit);
    }

    function pintarColores() {
        colorPicker.innerHTML = COLORES.map((c, i) => `
            <div class="col-6 col-md-4 color-swatch">
                <input type="radio" name="tmp-color" id="tmp-color-${c.id}" value="${c.id}"${i === 0 ? ' checked' : ''}>
                <label class="swatch-inner" for="tmp-color-${c.id}">
                    <span class="color-chip" style="background:${c.hex}"></span>
                    <span>${c.nombre}</span>
                </label>
            </div>
        `).join('');
    }

    function colorElegido() {
        const marcado = colorPicker.querySelector('input[name="tmp-color"]:checked');
        return COLORES.find(c => c.id === marcado.value) || COLORES[0];
    }

    function onSubmit(e) {
        e.preventDefault();

        const nombre = inputNombre.value.trim();
        if (!nombre) {
            showAlert('Escribe un nombre para el temporizador.', 'warning');
            inputNombre.focus();
            return;
        }

        const horas = clampNum(inputHoras.value, 0, 99);
        const minutos = clampNum(inputMinutos.value, 0, 59);
        const segundos = clampNum(inputSegundos.value, 0, 59);
        const total = horas * 3600 + minutos * 60 + segundos;

        if (total <= 0) {
            showAlert('El tiempo tiene que ser mayor que cero.', 'warning');
            inputHoras.focus();
            return;
        }

        const color = colorElegido();
        const url = `/temporizador.html?nombre=${encodeURIComponent(nombre)}&segundos=${total}&color=${encodeURIComponent(color.hex)}`;

        const izquierda = Math.max(0, Math.round((window.screen.availWidth - ANCHO_VENTANA) / 2));
        const arriba = Math.max(0, Math.round((window.screen.availHeight - ALTO_VENTANA) / 2));
        const opciones = [
            'popup=yes',
            `width=${ANCHO_VENTANA}`,
            `height=${ALTO_VENTANA}`,
            `left=${izquierda}`,
            `top=${arriba}`,
            'menubar=no',
            'toolbar=no',
            'location=no',
            'status=no',
            'scrollbars=no',
            'resizable=yes'
        ].join(',');

        const nuevaVentana = window.open(url, `pdl-temporizador-${++ventanas}`, opciones);

        if (!nuevaVentana) {
            showAlert('El navegador ha bloqueado la ventana emergente. Permite los pop-ups para este sitio.', 'warning');
            return;
        }

        showAlert(`Temporizador "${nombre}" abierto en una ventana nueva.`, 'success');
        form.reset();
        const marcado = colorPicker.querySelector('input[name="tmp-color"]:checked');
        if (marcado) marcado.checked = true;
        inputNombre.focus();
    }

    function clampNum(valor, min, max) {
        const n = parseInt(valor, 10);
        if (isNaN(n)) return 0;
        return Math.min(max, Math.max(min, n));
    }
});
