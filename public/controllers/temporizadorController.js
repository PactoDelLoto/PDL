document.addEventListener('DOMContentLoaded', function () {
    const nombreEl = document.getElementById('tmp-nombre');
    const cajaEl = document.querySelector('.temporizador-caja');
    const cifraEl = document.getElementById('tmp-cifra');
    if (!nombreEl || !cajaEl || !cifraEl) return;

    const auth = firebase.auth();
    const main = document.querySelector('main');
    const params = new URLSearchParams(window.location.search);

    const nombre = (params.get('nombre') || 'Temporizador').slice(0, 60);
    const color = leerColor(params.get('color'));
    const inicial = leerSegundos(params.get('segundos'));
    const claro = esColorClaro(color);

    let restante = inicial;
    let intervalo = null;
    let ultimoMomento = null;
    let finalizado = false;
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
        initTemporizador();
    });

    function accesoDenegado(mensaje) {
        main.innerHTML = `<div class="alert alert-danger">${mensaje}</div>`;
    }

    function initTemporizador() {
        document.body.style.setProperty('--tmp-color', color);
        document.body.style.setProperty('--tmp-on', claro ? '#12121e' : '#ffffff');
        document.title = `${nombre} - Temporizador`;

        nombreEl.textContent = nombre;

        document.addEventListener('click', e => {
            const btn = e.target.closest('[data-accion]');
            if (!btn) return;
            switch (btn.dataset.accion) {
                case 'toggle':
                    intervalo ? pausar() : arrancar();
                    break;
                case 'reiniciar':
                    reiniciar();
                    break;
                case 'mas':
                    ajustar(60);
                    break;
                case 'menos':
                    ajustar(-60);
                    break;
            }
        });

        document.addEventListener('keydown', e => {
            if (e.code === 'Space') {
                e.preventDefault();
                intervalo ? pausar() : arrancar();
            }
        });

        let pendiente = null;
        window.addEventListener('resize', () => {
            if (pendiente) return;
            pendiente = requestAnimationFrame(() => {
                pendiente = null;
                ajustarCifra();
            });
        });
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => ajustarCifra(true));
        }

        pintar();
        pintarBoton();
    }

    /* Escala la cifra para que ocupe el máximo espacio posible de la ventana */
    let ultimaClave = '';

    function ajustarCifra(forzar) {
        const dispW = cajaEl.clientWidth - 4;
        const dispH = cajaEl.clientHeight - 4;
        if (dispW <= 0 || dispH <= 0) return;

        const clave = `${cifraEl.textContent}|${dispW}|${dispH}`;
        if (!forzar && clave === ultimaClave) return;
        ultimaClave = clave;

        cifraEl.style.fontSize = '100px';
        const escala = Math.min(dispW / cifraEl.scrollWidth, dispH / cifraEl.scrollHeight);
        cifraEl.style.fontSize = Math.floor(escala * 100) + 'px';
    }

    function pintar() {
        cifraEl.textContent = formatear(restante);
        ajustarCifra();
    }

    function pintarBoton() {
        const btn = document.querySelector('[data-accion="toggle"]');
        if (!btn) return;
        const icon = btn.querySelector('i');
        const texto = btn.querySelector('span');
        if (finalizado) {
            icon.className = 'fa-solid fa-flag me-1';
            texto.textContent = 'Finalizado';
            btn.disabled = true;
            return;
        }
        btn.disabled = false;
        if (intervalo) {
            icon.className = 'fa-solid fa-pause me-1';
            texto.textContent = 'Pausar';
        } else {
            icon.className = 'fa-solid fa-play me-1';
            texto.textContent = 'Iniciar';
        }
    }

    function tick() {
        const ahora = Date.now();
        if (ultimoMomento === null) ultimoMomento = ahora;
        restante -= (ahora - ultimoMomento) / 1000;
        ultimoMomento = ahora;

        if (restante <= 0) {
            restante = 0;
            clearInterval(intervalo);
            intervalo = null;
            finalizado = true;
            document.body.classList.add('temporizador-fin');
            pintar();
            pintarBoton();
            sonar();
        } else {
            pintar();
        }
    }

    function arrancar() {
        if (intervalo || finalizado) return;
        ultimoMomento = Date.now();
        intervalo = setInterval(tick, 200);
        pintarBoton();
    }

    function pausar() {
        if (!intervalo) return;
        clearInterval(intervalo);
        intervalo = null;
        pintarBoton();
    }

    function reiniciar() {
        clearInterval(intervalo);
        intervalo = null;
        restante = inicial;
        finalizado = false;
        document.body.classList.remove('temporizador-fin');
        pintar();
        pintarBoton();
    }

    function ajustar(delta) {
        restante = Math.max(0, restante + delta);
        if (restante === 0) {
            clearInterval(intervalo);
            intervalo = null;
            finalizado = true;
            document.body.classList.add('temporizador-fin');
            sonar();
        } else if (finalizado) {
            finalizado = false;
            document.body.classList.remove('temporizador-fin');
        }
        pintar();
        pintarBoton();
    }

    function leerSegundos(valor) {
        const n = parseInt(valor, 10);
        if (isNaN(n) || n <= 0) return 300;
        return Math.min(n, 99 * 3600 + 59 * 60 + 59);
    }

    function leerColor(valor) {
        return /^#[0-9a-f]{6}$/i.test(valor || '') ? valor.toLowerCase() : '#000000';
    }

    function formatear(segundos) {
        const s = Math.max(0, Math.ceil(segundos));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const seg = s % 60;
        const mm = String(m).padStart(2, '0');
        const ss = String(seg).padStart(2, '0');
        return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    }

    function esColorClaro(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const lin = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        return (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)) > 0.35;
    }

    function sonar() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [0, 300].forEach(delay => {
                setTimeout(() => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = 880;
                    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.45);
                }, delay);
            });
            setTimeout(() => ctx.close(), 1200);
        } catch (e) {
            /* sin audio disponible */
        }
    }
});
