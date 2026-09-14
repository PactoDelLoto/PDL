document.addEventListener('DOMContentLoaded', function () {
    const db = firebase.firestore();
    const auth = firebase.auth();

    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const AÑO_MIN = 2019;
    const CAMPOS_LISTA = ['gastosOrdinarios', 'ingresosOrdinarios', 'gastosExtraordinarios', 'ingresosExtraordinarios'];
    const LISTA_META = {
        gastosOrdinarios: { titulo: 'Gastos ordinarios', esGasto: true },
        ingresosOrdinarios: { titulo: 'Ingresos ordinarios', esGasto: false },
        gastosExtraordinarios: { titulo: 'Gastos extraordinarios', esGasto: true },
        ingresosExtraordinarios: { titulo: 'Ingresos extraordinarios', esGasto: false }
    };

    let currentYear = new Date().getFullYear();
    let monthDocs = {};                 // 'YYYY-MM' -> doc data | null
    let activeMonthKey = ym(currentYear, new Date().getMonth() + 1);
    let saldoVisibles = {};             // 'YYYY-MM' -> número (saldo mostrado)
    let renderedMonths = new Set();     // claves de mes cuyo pane ya se ha pintado (render perezoso)
    let eventosCache = [];
    let subeventosPorEvento = {};       // eventoId -> [subeventos]
    let editState = null;               // contexto para el modal de edición
    let statsCharts = {};               // año -> instancia Chart
    let eventoSectionModal, rowModal;
    let eventosLoadPromise = null;
    let totalYearsLoaded = new Set();

    if (document.getElementById('evento-section-modal')) eventoSectionModal = new bootstrap.Modal(document.getElementById('evento-section-modal'));
    if (document.getElementById('row-modal')) rowModal = new bootstrap.Modal(document.getElementById('row-modal'));

    // ---------- Helpers ----------

    const fmtEur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(isNaN(n) ? 0 : n);

    // Algunos registros antiguos pueden contener "false" como texto. Ese valor
    // es truthy en JavaScript y hacía que la interfaz mostrase factura marcada.
    function facturaMarcada(value) {
        return value === true || value === 1 || value === 'true';
    }

    function facturaEnlace(fila) {
        return String(fila && (fila.facturaEnlace || fila.enlaceFactura || fila.facturaUrl) || '').trim();
    }

    function tieneFactura(fila) {
        return Boolean(facturaEnlace(fila)) || facturaMarcada(fila && fila.factura);
    }

    function newId() {
        return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function ym(year, month) {
        return `${year}-${String(month).padStart(2, '0')}`;
    }

    function prevYm(key) {
        const [y, m] = key.split('-').map(Number);
        if (m === 1) return y - 1 >= AÑO_MIN ? ym(y - 1, 12) : null;
        return ym(y, m - 1);
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatFecha(iso) {
        if (!iso) return '';
        const p = String(iso).split('-');
        if (p.length !== 3) return iso;
        return `${p[2]}/${p[1]}/${p[0]}`;
    }

    function monthHasData(d) {
        if (!d) return false;
        if (d.saldoDisponible !== null && d.saldoDisponible !== undefined) return true;
        return CAMPOS_LISTA.some(c => Array.isArray(d[c]) && d[c].length > 0)
            || (Array.isArray(d.seccionesEvento) && d.seccionesEvento.length > 0);
    }

    function baseMes(key) {
        const [y, m] = key.split('-').map(Number);
        return {
            year: y,
            month: m,
            saldoDisponible: null,
            ingresosOrdinarios: [],
            gastosOrdinarios: [],
            ingresosExtraordinarios: [],
            gastosExtraordinarios: [],
            seccionesEvento: []
        };
    }

    async function getMesDoc(key, create = true, options = {}) {
        if (!options.force && key in monthDocs && monthDocs[key]) return monthDocs[key];
        const ref = db.collection('tesoreria').doc(key);
        let snap;
        try {
            snap = await ref.get(options.source ? { source: options.source } : undefined);
        } catch (e) {
            console.error('Error accediendo a tesoreria/' + key, e);
            throw new Error('No se pudo acceder a la colección "tesoreria". Comprueba que has desplegado las reglas de Firestore con: firebase deploy --only firestore:rules');
        }
        if (snap.exists) {
            monthDocs[key] = snap.data();
            return monthDocs[key];
        }
        if (!create) {
            monthDocs[key] = null;
            return null;
        }
        monthDocs[key] = baseMes(key);
        return monthDocs[key];
    }

    async function updateMes(key, fn) {
        let doc = await getMesDoc(key, true);
        if (!doc) {
            doc = baseMes(key);
            monthDocs[key] = doc;
        }
        CAMPOS_LISTA.forEach(c => { if (!Array.isArray(doc[c])) doc[c] = []; });
        if (!Array.isArray(doc.seccionesEvento)) doc.seccionesEvento = [];
        fn(doc);
        await db.collection('tesoreria').doc(key).set(doc);
        monthDocs[key] = doc;
        // Un cambio en un mes puede afectar los saldos automáticos de todos
        // los meses posteriores.
        saldoVisibles = {};
    }

    // Saldo mostrado: explícito, o el del mes anterior (caminando hacia atrás)
    async function computeSaldoMostrado(key) {
        if (key in saldoVisibles) return saldoVisibles[key];
        const doc = monthDocs[key];
        if (doc && doc.saldoDisponible !== null && doc.saldoDisponible !== undefined && !isNaN(doc.saldoDisponible)) {
            saldoVisibles[key] = Number(doc.saldoDisponible);
            return saldoVisibles[key];
        }
        const docReal = await getMesDoc(key, false);
        if (docReal && docReal.saldoDisponible !== null && docReal.saldoDisponible !== undefined && !isNaN(docReal.saldoDisponible)) {
            saldoVisibles[key] = Number(docReal.saldoDisponible);
            return saldoVisibles[key];
        }
        const prev = prevYm(key);
        if (!prev) { saldoVisibles[key] = 0; return 0; }
        if (prev in saldoVisibles) { saldoVisibles[key] = saldoVisibles[prev]; return saldoVisibles[prev]; }
        const prevDoc = await getMesDoc(prev, false);
        if (prevDoc && prevDoc.saldoDisponible !== null && prevDoc.saldoDisponible !== undefined && !isNaN(prevDoc.saldoDisponible)) {
            saldoVisibles[key] = Number(prevDoc.saldoDisponible);
            return saldoVisibles[key];
        }
        const val = await computeSaldoMostrado(prev);
        saldoVisibles[key] = val;
        return val;
    }

    async function computeSaldoCalculado(key, visitados = new Set()) {
        if (key in saldoVisibles) return saldoVisibles[key];
        if (visitados.has(key)) throw new Error('No se puede calcular el saldo por una referencia circular.');
        visitados.add(key);
        const doc = await getMesDoc(key, false);
        if (doc && doc.saldoDisponible !== null && doc.saldoDisponible !== undefined && !isNaN(doc.saldoDisponible)) {
            saldoVisibles[key] = Number(doc.saldoDisponible);
            return saldoVisibles[key];
        }
        const prev = prevYm(key);
        const saldoAnterior = prev ? await computeSaldoCalculado(prev, visitados) : 0;
        const saldoCalculado = saldoAnterior + totalesMes(key).balance;
        if (!isFinite(saldoCalculado)) throw new Error('Saldo no numÃ©rico.');
        saldoVisibles[key] = saldoCalculado;
        return saldoCalculado;
    }

    async function precomputeSaldos(year, months) {
        saldoVisibles = {};
        const keys = months.map(m => ym(year, m));
        for (const k of keys) {
            if (!(k in saldoVisibles)) await computeSaldoCalculado(k);
        }
    }

    // ---------- Totales ----------

    function totalesMes(key) {
        const doc = monthDocs[key] || baseMes(key);
        const sum = (arr, campo) => (Array.isArray(arr) ? arr.reduce((a, r) => a + (Number(r[campo]) || 0), 0) : 0);
        const gOrd = sum(doc.gastosOrdinarios, 'coste');
        const iOrd = sum(doc.ingresosOrdinarios, 'cuantia');
        const gExt = sum(doc.gastosExtraordinarios, 'coste');
        const iExt = sum(doc.ingresosExtraordinarios, 'cuantia');
        let gEvt = 0, iEvt = 0, cuotasSocios = 0, movs = 0, factSi = 0, factNo = 0, factSiImporte = 0, factNoImporte = 0;
        (Array.isArray(doc.gastosOrdinarios) ? doc.gastosOrdinarios : []).forEach(r => {
            movs++; if (tieneFactura(r)) { factSi++; factSiImporte += Number(r.coste) || 0; } else { factNo++; factNoImporte += Number(r.coste) || 0; }
        });
        (Array.isArray(doc.ingresosOrdinarios) ? doc.ingresosOrdinarios : []).forEach(r => {
            movs++;
            if (r.cuotasSocios === true || r.cuotasSocios === 1 || r.cuotasSocios === 'true') cuotasSocios += Number(r.cuantia) || 0;
        });
        (Array.isArray(doc.gastosExtraordinarios) ? doc.gastosExtraordinarios : []).forEach(r => {
            movs++; if (tieneFactura(r)) { factSi++; factSiImporte += Number(r.coste) || 0; } else { factNo++; factNoImporte += Number(r.coste) || 0; }
        });
        (Array.isArray(doc.ingresosExtraordinarios) ? doc.ingresosExtraordinarios : []).forEach(() => movs++);
        (Array.isArray(doc.seccionesEvento) ? doc.seccionesEvento : []).forEach(s => {
            (Array.isArray(s.gastos) ? s.gastos : []).forEach(r => {
                gEvt += Number(r.cantidad) || 0; movs++;
                if (tieneFactura(r)) { factSi++; factSiImporte += Number(r.cantidad) || 0; } else { factNo++; factNoImporte += Number(r.cantidad) || 0; }
            });
            (Array.isArray(s.ingresos) ? s.ingresos : []).forEach(r => { iEvt += Number(r.cantidad) || 0; movs++; });
        });
        const totalIngresos = iOrd + iExt + iEvt;
        const totalGastos = gOrd + gExt + gEvt;
        return {
            totalIngresos, totalGastos, balance: totalIngresos - totalGastos,
            gOrd, iOrd, gExt, iExt, gEvt, iEvt, cuotasSocios,
            movs, factSi, factNo, factSiImporte, factNoImporte
        };
    }

    // ---------- Inicialización ----------

    function accesoDenegado(mensaje) {
        document.querySelector('main').innerHTML = `<div class="alert alert-danger">${mensaje}</div>`;
    }

    async function loadEventosYSubeventos() {
        try {
            const [evSnap, subSnap] = await Promise.all([
                db.collection('eventos').get(),
                db.collection('subeventos').get()
            ]);
            eventosCache = evSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => (a.titulo || '').localeCompare(b.titulo || ''));
            subeventosPorEvento = {};
            subSnap.docs.forEach(doc => {
                const s = { id: doc.id, ...doc.data() };
                if (s.eventoId) {
                    (subeventosPorEvento[s.eventoId] = subeventosPorEvento[s.eventoId] || []).push(s);
                }
            });
            Object.keys(subeventosPorEvento).forEach(k => {
                subeventosPorEvento[k].sort((a, b) => (a.titulo || '').localeCompare(b.titulo || ''));
            });
        } catch (e) {
            console.error('Error al cargar eventos/actividades:', e);
        }
    }

    function initYearSelect() {
        const sel = document.getElementById('year-select');
        sel.innerHTML = '';
        const actual = new Date().getFullYear();
        for (let y = actual; y >= AÑO_MIN; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            opt.selected = y === currentYear;
            sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
            currentYear = parseInt(sel.value, 10);
            buildYear(currentYear);
        });
    }

    function mesesDelAño(year) {
        const actual = new Date().getFullYear();
        const mesActual = new Date().getMonth() + 1;
        return year === actual ? Array.from({ length: mesActual }, (_, i) => i + 1) : Array.from({ length: 12 }, (_, i) => i + 1);
    }

    async function buildYear(year) {
        const months = mesesDelAño(year);
        const tabs = document.getElementById('treasury-tabs');
        const content = document.getElementById('treasury-tabs-content');
        const loadingEl = document.getElementById('tesoreria-loading');
        if (loadingEl) loadingEl.classList.remove('d-none');

        // Resetear estado
        renderedMonths = new Set();
        saldoVisibles = {};
        Object.values(statsCharts).forEach(ch => { try { ch.destroy(); } catch (e) { } });
        statsCharts = {};

        // Pestañas
        let tabsHtml = '';
        tabsHtml += `<li class="nav-item"><button class="nav-link active" id="tab-total-${year}" data-bs-toggle="tab" data-bs-target="#pane-total-${year}" type="button" role="tab" aria-selected="true"><i class="fa-solid fa-chart-pie me-1"></i>Total del año</button></li>`;
        const defaultMonth = Math.min(new Date().getMonth() + 1, months.length);
        const defaultKey = ym(year, defaultMonth);
        const monthOptions = months.map(m => `<option value="${ym(year, m)}" ${m === defaultMonth ? 'selected' : ''}>${MESES[m - 1]}</option>`).join('');
        tabsHtml += `<li class="nav-item d-flex align-items-center gap-2"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-mes-activo" type="button" role="tab" aria-selected="false"><i class="fa-solid fa-calendar-days me-1"></i>Mes</button><select id="month-select" class="form-select form-select-sm" aria-label="Seleccionar mes">${monthOptions}</select></li>`;
        tabs.innerHTML = tabsHtml;
        const totalTab = tabs.querySelector(`#tab-total-${year}`);
        const monthTab = tabs.querySelector('#tab-mes-activo') || tabs.querySelector('[data-bs-target="#pane-mes-activo"]');
        if (totalTab) { totalTab.classList.remove('active'); totalTab.setAttribute('aria-selected', 'false'); }
        if (monthTab) {
            monthTab.classList.add('active');
            monthTab.setAttribute('aria-selected', 'true');
            monthTab.innerHTML = `<i class="fa-solid fa-calendar-days me-1"></i>${MESES[defaultMonth - 1]}`;
        }

        // Paneles
        let panesHtml = '';
        panesHtml += `<div class="tab-pane fade show active" id="pane-total-${year}" role="tabpanel"></div>`;
        panesHtml += `<div class="tab-pane fade" id="pane-mes-activo" role="tabpanel"></div>`;
        content.innerHTML = panesHtml;
        const totalPane = document.getElementById(`pane-total-${year}`);
        const monthPane = document.getElementById('pane-mes-activo');
        if (totalPane) totalPane.classList.remove('show', 'active');
        if (monthPane) monthPane.classList.add('show', 'active');

        // Arranque ligero: solo se consulta y se pinta el mes seleccionado.
        // El total anual se carga al abrir su pestaña, no bloquea la pantalla inicial.
        try {
            activeMonthKey = defaultKey;
            await getMesDoc(defaultKey, false, { force: defaultKey === ym(new Date().getFullYear(), new Date().getMonth() + 1) });
            const currentDoc = monthDocs[defaultKey];
            document.getElementById('no-data-banner').classList.toggle('d-none', monthHasData(currentDoc));
            const totalPane = document.getElementById(`pane-total-${year}`);
            if (totalPane) totalPane.innerHTML = '<div class="text-center text-muted py-4"><i class="fa-solid fa-chart-pie me-2"></i>Abre esta pestaña para cargar el total anual.</div>';
            await renderMes(defaultKey, { light: true });
        } catch (e) {
            const msg = e && e.message ? e.message : 'Error cargando el mes actual.';
            showAlert(msg, 'danger');
            const pane = document.getElementById('pane-mes-activo');
            if (pane) pane.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(msg)}</div>`;
        }

        if (loadingEl) loadingEl.classList.add('d-none');
    }

    // ---------- Pestaña Total del año ----------

    async function loadTotalYear(year) {
        if (totalYearsLoaded.has(year)) return;
        const pane = document.getElementById(`pane-total-${year}`);
        if (pane) pane.innerHTML = '<div class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm me-2"></span>Cargando el total anual...</div>';
        /*
        const months = mesesDelAÃ±o(year);
        */
        const months = Array.from({ length: year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12 }, (_, i) => i + 1);
        const currentKey = ym(new Date().getFullYear(), new Date().getMonth() + 1);
        try {
            await Promise.all(months.map(m => {
                const key = ym(year, m);
                return getMesDoc(key, false, { force: key === currentKey });
            }));
            await precomputeSaldos(year, months);
            totalYearsLoaded.add(year);
            const hayDatos = months.some(m => monthHasData(monthDocs[ym(year, m)]));
            document.getElementById('no-data-banner').classList.toggle('d-none', hayDatos);
            renderTotalPane(year);
        } catch (e) {
            console.error('Error cargando el total anual', e);
            if (pane) pane.innerHTML = '<div class="alert alert-danger mb-0">No se pudo cargar el total anual.</div>';
        }
    }

    function renderTotalPane(year) {
        const months = mesesDelAño(year);
        const pane = document.getElementById(`pane-total-${year}`);
        if (!pane) return;

        let tIng = 0, tGas = 0, tCuotas = 0, movs = 0, factSiN = 0, factNoN = 0, factSiI = 0, factNoI = 0;
        let mesMaxIng = null, mesMaxGas = null, mesMaxCuotas = null, mesMejor = null, mesPeor = null;
        months.forEach(m => {
            const k = ym(year, m);
            const t = totalesMes(k);
            tIng += t.totalIngresos; tGas += t.totalGastos; tCuotas += t.cuotasSocios; movs += t.movs;
            factSiN += t.factSi; factNoN += t.factNo; factSiI += t.factSiImporte; factNoI += t.factNoImporte;
            if (!mesMaxIng || t.totalIngresos > mesMaxIng.valor) mesMaxIng = { mes: m, valor: t.totalIngresos };
            if (!mesMaxGas || t.totalGastos > mesMaxGas.valor) mesMaxGas = { mes: m, valor: t.totalGastos };
            if (!mesMaxCuotas || t.cuotasSocios > mesMaxCuotas.valor) mesMaxCuotas = { mes: m, valor: t.cuotasSocios };
            if (!mesMejor || t.balance > mesMejor.valor) mesMejor = { mes: m, valor: t.balance };
            if (!mesPeor || t.balance < mesPeor.valor) mesPeor = { mes: m, valor: t.balance };
        });

        const saldoFinal = months.length ? saldoVisibles[ym(year, months[months.length - 1])] : 0;
        const balance = tIng - tGas;
        const sinDatos = tIng === 0 && tGas === 0 && movs === 0;
        const mesActual = new Date().getMonth() + 1;

        const card = (titulo, valor, clase, icono) => `
            <div class="col-6 col-lg-3">
                <div class="card shadow-sm h-100 text-center">
                    <div class="card-body">
                        <div class="text-muted small">${titulo}</div>
                        <h4 class="mb-0 ${clase}"><i class="${icono} me-1"></i>${fmtEur(valor)}</h4>
                    </div>
                </div>
            </div>`;

        pane.innerHTML = `
            ${sinDatos ? `
            <div class="alert alert-info d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div><i class="fa-solid fa-circle-plus me-2"></i>Aún no hay movimientos en ${year}. Los formularios para <strong>crear gastos e ingresos</strong> (ordinarios, extraordinarios y por evento) están en cada pestaña de mes, justo encima de cada tabla.</div>
                <button class="btn btn-sm btn-primary goto-month-btn" data-year="${year}"><i class="fa-solid fa-calendar-day me-1"></i>Ir a ${MESES[mesActual - 1]}</button>
            </div>` : ''}
            <div class="row g-3 mb-3">
                ${card('Total ingresos del año', tIng, 'text-success', 'fa-solid fa-arrow-trend-up')}
                ${card('Total gastos del año', tGas, 'text-danger', 'fa-solid fa-arrow-trend-down')}
                ${card('Balance anual', balance, balance >= 0 ? 'text-success' : 'text-danger', 'fa-solid fa-scale-balanced')}
                ${card('Saldo final', saldoFinal, 'text-primary', 'fa-solid fa-wallet')}
                ${card('Cuotas de socios', tCuotas, 'text-info', 'fa-solid fa-users')}
            </div>
            <div class="d-flex flex-wrap gap-2 mb-3">
                <button class="btn btn-info" id="btn-stats-total-${year}"><i class="fa-solid fa-chart-column me-1"></i>Ver estadísticas y gráficas anuales</button>
                <span class="align-self-center text-muted small"><i class="fa-solid fa-file-invoice me-1"></i>Gastos con factura: ${factSiN} (${fmtEur(factSiI)}) · Sin factura: ${factNoN} (${fmtEur(factNoI)})</span>
            </div>
            <div class="card shadow-sm d-none" id="stats-section-${year}">
                <div class="card-body">
                    <h6 class="card-title">Gastos vs Ingresos por mes</h6>
                    <div class="mt-3" style="height: 320px;">
                        <canvas id="stats-chart-${year}"></canvas>
                    </div>
                    <hr>
                    <div class="row g-2" id="stats-facts-${year}"></div>
                </div>
            </div>
        `;

        const fact = (label, value) => `
            <div class="col-6 col-md-4 col-xl-3">
                <div class="border rounded p-2 h-100">
                    <div class="text-muted small">${label}</div>
                    <div class="fw-bold">${value}</div>
                </div>
            </div>`;

        const factsEl = document.getElementById(`stats-facts-${year}`);
        if (factsEl) {
            if (tIng === 0 && tGas === 0) {
                factsEl.innerHTML = `<div class="col-12 text-muted"><i class="fa-solid fa-circle-info me-1"></i>Aún no hay datos que analizar para este año.</div>`;
            } else {
                const avgIng = tIng / (months.length || 1);
                const avgGas = tGas / (months.length || 1);
                let html = fact('Mes que más ingresa', `${MESES[mesMaxIng.mes - 1]} (${fmtEur(mesMaxIng.valor)})`);
                html += fact('Mes que más gasta', `${MESES[mesMaxGas.mes - 1]} (${fmtEur(mesMaxGas.valor)})`);
                html += fact('Mejor balance mensual', `${MESES[mesMejor.mes - 1]} (${fmtEur(mesMejor.valor)})`);
                html += fact('Peor balance mensual', `${MESES[mesPeor.mes - 1]} (${fmtEur(mesPeor.valor)})`);
                html += fact('Promedio ingresos/mes', fmtEur(avgIng));
                html += fact('Promedio gastos/mes', fmtEur(avgGas));
                html += fact('Ingresos medios de cuotas/mes', fmtEur(tCuotas / (months.length || 1)));
                html += fact('Mes con más cuotas', `${MESES[mesMaxCuotas.mes - 1]} (${fmtEur(mesMaxCuotas.valor)})`);
                html += fact('Nº de movimientos', movs);
                html += fact('Saldo con que cierra el año', fmtEur(saldoFinal));
                factsEl.innerHTML = html;
            }
        }

        document.getElementById(`btn-stats-total-${year}`).addEventListener('click', () => {
            const sec = document.getElementById(`stats-section-${year}`);
            const oculto = sec.classList.contains('d-none');
            sec.classList.toggle('d-none', !oculto);
            if (oculto) renderStatsChart(year);
        });
    }

    function renderStatsChart(year) {
        const canvas = document.getElementById(`stats-chart-${year}`);
        if (!canvas) return;
        const months = mesesDelAño(year);
        const labels = months.map(m => MESES[m - 1]);
        const ingresos = months.map(m => totalesMes(ym(year, m)).totalIngresos);
        const gastos = months.map(m => totalesMes(ym(year, m)).totalGastos);
        const cuotas = months.map(m => totalesMes(ym(year, m)).cuotasSocios);

        if (statsCharts[year]) { statsCharts[year].destroy(); statsCharts[year] = null; }

        if (ingresos.every(v => v === 0) && gastos.every(v => v === 0) && cuotas.every(v => v === 0)) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#6c757d';
            ctx.font = '600 16px "Roboto", sans-serif';
            ctx.fillText('Sin datos para este año.', canvas.width / 2, canvas.height / 2);
            return;
        }

        statsCharts[year] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Ingresos', data: ingresos, backgroundColor: 'rgba(25,135,84,0.6)', borderColor: 'rgba(25,135,84,1)', borderWidth: 1 },
                    { label: 'Gastos', data: gastos, backgroundColor: 'rgba(220,53,69,0.6)', borderColor: 'rgba(220,53,69,1)', borderWidth: 1 },
                    { label: 'Cuotas de socios', data: cuotas, backgroundColor: 'rgba(13,202,240,0.6)', borderColor: 'rgba(13,202,240,1)', borderWidth: 1 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    // ---------- Pestaña de mes ----------

    function optionsActividades(eventoId, selected) {
        const subs = subeventosPorEvento[eventoId] || [];
        let html = '<option value="">Sin actividad específica</option>';
        subs.forEach(s => {
            html += `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${escapeHtml(s.titulo || 'Actividad')}</option>`;
        });
        return html;
    }

    function filasDe(doc, opts) {
        if (opts.seccion) {
            const s = (doc.seccionesEvento || []).find(x => x.id === opts.seccion);
            return s ? s[opts.sub] : null;
        }
        return doc[opts.campo] || [];
    }

    function renderTabla(key, filaCfg, esGasto) {
        const campo = filaCfg.campo;
        const meta = LISTA_META[campo];
        const montoCampo = meta.esGasto ? 'coste' : 'cuantia';
        const montoLabel = meta.esGasto ? 'Coste' : 'Cuantía';
        const esCuotas = campo === 'ingresosOrdinarios';
        const filas = filaCfg.filas || [];
        const total = filas.reduce((a, r) => a + (Number(r[montoCampo]) || 0), 0);

        const colFactura = esGasto ? '<th class="text-center">¿Factura?</th>' : '';

        const filasHtml = filas.map(r => {
            const enlaceFactura = facturaEnlace(r);
            const facturaTd = esGasto
                ? `<td class="text-center"><button class="btn btn-sm btn-link p-0 factura-btn" data-url="${escapeHtml(enlaceFactura)}" title="${enlaceFactura ? 'Abrir factura' : (tieneFactura(r) ? 'Factura sin enlace' : 'Sin factura')}" style="font-size:1.1rem;">${enlaceFactura ? '<i class="fa-solid fa-file-invoice text-success"></i>' : '<i class="fa-regular fa-file text-muted"></i>'}</button></td>`
                : '';
            const cuotasTd = esCuotas
                ? `<td class="text-center">${r.cuotasSocios === true || r.cuotasSocios === 1 || r.cuotasSocios === 'true' ? '<i class="fa-solid fa-user text-primary" title="Cuota de socio"></i>' : '<span class="text-muted">—</span>'}</td>`
                : '';
            return `<tr>
                <td>${escapeHtml(r.concepto)}</td>
                <td>${formatFecha(r.fecha)}</td>
                <td class="text-end">${fmtEur(Number(r[montoCampo]) || 0)}</td>
                ${facturaTd}
                ${cuotasTd}
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-outline-secondary row-edit" data-key="${key}" data-campo="${campo}" data-id="${r.id}"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger row-del" data-key="${key}" data-campo="${campo}" data-id="${r.id}"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join('');

        const placeholder = filas.length === 0 ? `<tr><td colspan="${esGasto ? 5 : (esCuotas ? 5 : 4)}" class="text-center text-muted py-2">Sin movimientos</td></tr>` : '';

        const inputMonto = `<input type="number" step="0.01" min="0" name="monto" class="form-control form-control-sm" placeholder="${montoLabel}" required>`;
        const checkCuotas = campo === 'ingresosOrdinarios'
            ? '<div class="col-6 col-md-2 d-flex align-items-center"><div class="form-check my-0"><input class="form-check-input" type="checkbox" name="cuotasSocios"><label class="form-check-label small">Cuota</label></div></div>'
            : '';

        return `
            <div class="bg-light border rounded p-2 mb-2">
                <div class="small fw-bold text-primary mb-2"><i class="fa-solid fa-circle-plus me-1"></i>Añadir ${meta.titulo.toLowerCase()}</div>
                <form class="add-form row g-2" data-key="${key}" data-campo="${campo}" data-esgasto="${esGasto ? 1 : 0}">
                <div class="col-12 col-md-4"><input type="text" name="concepto" class="form-control form-control-sm" placeholder="Concepto" required></div>
                <div class="col-6 col-md-2"><input type="date" name="fecha" class="form-control form-control-sm"></div>
                <div class="col-6 col-md-2">${inputMonto}</div>
                ${checkCuotas}
                <div class="col-12 col-md-2 d-grid"><button class="btn btn-sm btn-primary"><i class="fa-solid fa-plus me-1"></i>Añadir</button></div>
            </form>
            </div>            
            <table class="table table-sm table-striped mb-2 tesoreria-table">
                <thead>
                    <tr>
                        <th>Concepto</th><th>Fecha</th><th class="text-end">${montoLabel}</th>${colFactura}${esCuotas ? '<th class="text-center"></th>' : ''}<th class="text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody>${filasHtml}${placeholder}</tbody>
                <tfoot>
                    <tr>
                        <th colspan="2" class="text-end">Total ${meta.titulo.toLowerCase()}</th>
                        <th class="text-end">${fmtEur(total)}</th>
                        <th${esGasto || esCuotas ? ' colspan="2"' : ''}></th>
                    </tr>
                </tfoot>
            </table>`;
    }

    function renderSeccionEvento(key, seccion) {
        const subs = subeventosPorEvento[seccion.eventoId] || [];
        const sGastos = seccion.gastos || [];
        const sIngresos = seccion.ingresos || [];
        const totalG = sGastos.reduce((a, r) => a + (Number(r.cantidad) || 0), 0);
        const totalI = sIngresos.reduce((a, r) => a + (Number(r.cantidad) || 0), 0);
        const balance = totalI - totalG;
        const esAnexo = !seccion.eventoId || seccion.personalizado;
        const tituloSeccion = esAnexo ? `Anexo: ${seccion.eventoNombre || 'Sin nombre'}` : `Evento: ${seccion.eventoNombre || 'Sin nombre'}`;
        const enlaceEvento = esAnexo ? '' : `<a href="/eventoDetalle.html?id=${seccion.eventoId}" target="_blank" class="btn btn-sm btn-outline-info"><i class="fa-regular fa-eye me-1"></i>Ver</a>`;

        const tablaG = `
            <table class="table table-sm table-striped mb-2 tesoreria-table">
                <thead><tr><th>Concepto</th><th>Actividad</th><th class="text-center">Nº jug.</th><th class="text-end">Cantidad</th><th class="text-end">En mano</th><th class="text-center">¿Factura?</th><th class="text-center">Acciones</th></tr></thead>
                <tbody>
                    ${sGastos.map(r => `
                        <tr>
                            <td>${escapeHtml(r.concepto)}</td>
                            <td>${escapeHtml(r.actividadNombre || '—')}</td>
                            <td class="text-center">${r.numJugadores != null ? r.numJugadores : ''}</td>
                            <td class="text-end">${fmtEur(Number(r.cantidad) || 0)}</td>
                            <td class="text-end">${r.enMano != null ? fmtEur(Number(r.enMano) || 0) : ''}</td>
                            <td class="text-center"><button class="btn btn-sm btn-link p-0 factura-btn" data-url="${escapeHtml(facturaEnlace(r))}" title="${facturaEnlace(r) ? 'Abrir factura' : (tieneFactura(r) ? 'Factura sin enlace' : 'Sin factura')}" style="font-size:1.1rem;">${facturaEnlace(r) ? '<i class="fa-solid fa-file-invoice text-success"></i>' : '<i class="fa-regular fa-file text-muted"></i>'}</button></td>
                            <td class="text-center text-nowrap">
                                <button class="btn btn-sm btn-outline-secondary row-edit" data-key="${key}" data-seccion="${seccion.id}" data-sub="gastos" data-id="${r.id}"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-sm btn-outline-danger row-del" data-key="${key}" data-seccion="${seccion.id}" data-sub="gastos" data-id="${r.id}"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>`).join('')}
                    ${sGastos.length === 0 ? '<tr><td colspan="7" class="text-center text-muted py-2">Sin gastos de evento</td></tr>' : ''}
                </tbody>
                <tfoot><tr><th colspan="3" class="text-end">Total gastos del evento</th><th class="text-end">${fmtEur(totalG)}</th><th colspan="3"></th></tr></tfoot>
            </table>`;

        const tablaI = `
            <table class="table table-sm table-striped mb-2 tesoreria-table">
                <thead><tr><th>Concepto</th><th>Actividad</th><th class="text-center">Nº jug.</th><th class="text-end">Cantidad</th><th class="text-end">En mano</th><th class="text-center">Acciones</th></tr></thead>
                <tbody>
                    ${sIngresos.map(r => `
                        <tr>
                            <td>${escapeHtml(r.concepto)}</td>
                            <td>${escapeHtml(r.actividadNombre || '—')}</td>
                            <td class="text-center">${r.numJugadores != null ? r.numJugadores : ''}</td>
                            <td class="text-end">${fmtEur(Number(r.cantidad) || 0)}</td>
                            <td class="text-end">${r.enMano != null ? fmtEur(Number(r.enMano) || 0) : ''}</td>
                            <td class="text-center text-nowrap">
                                <button class="btn btn-sm btn-outline-secondary row-edit" data-key="${key}" data-seccion="${seccion.id}" data-sub="ingresos" data-id="${r.id}"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-sm btn-outline-danger row-del" data-key="${key}" data-seccion="${seccion.id}" data-sub="ingresos" data-id="${r.id}"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>`).join('')}
                    ${sIngresos.length === 0 ? '<tr><td colspan="6" class="text-center text-muted py-2">Sin ingresos de evento</td></tr>' : ''}
                </tbody>
                <tfoot><tr><th colspan="4" class="text-end">Total ingresos del evento</th><th class="text-end">${fmtEur(totalI)}</th><th></th></tr></tfoot>
            </table>`;

        const formG = `
            <form class="add-evento-form row g-2 mb-2" data-key="${key}" data-seccion="${seccion.id}" data-sub="gastos">
                <div class="col-12 col-md-3"><input type="text" name="concepto" class="form-control form-control-sm" placeholder="Concepto" required></div>
                <div class="col-12 col-md-3"><select name="actividad" class="form-select form-select-sm">${optionsActividades(seccion.eventoId)}</select></div>
                <div class="col-4 col-md-2"><input type="number" min="0" name="numJugadores" class="form-control form-control-sm" placeholder="Nº jug."></div>
                <div class="col-4 col-md-2"><input type="number" step="0.01" min="0" name="cantidad" class="form-control form-control-sm" placeholder="Cantidad" required></div>
                <div class="col-4 col-md-2"><input type="number" step="0.01" min="0" name="enMano" class="form-control form-control-sm" placeholder="En mano"></div>
                <div class="col-6 col-md-2 d-grid"><button class="btn btn-sm btn-danger text-white"><i class="fa-solid fa-plus me-1"></i>Añadir gasto</button></div>
            </form>`;

        const formI = `
            <form class="add-evento-form row g-2 mb-2" data-key="${key}" data-seccion="${seccion.id}" data-sub="ingresos">
                <div class="col-12 col-md-3"><input type="text" name="concepto" class="form-control form-control-sm" placeholder="Concepto" required></div>
                <div class="col-12 col-md-3"><select name="actividad" class="form-select form-select-sm">${optionsActividades(seccion.eventoId)}</select></div>
                <div class="col-4 col-md-2"><input type="number" min="0" name="numJugadores" class="form-control form-control-sm" placeholder="Nº jug."></div>
                <div class="col-4 col-md-2"><input type="number" step="0.01" min="0" name="cantidad" class="form-control form-control-sm" placeholder="Cantidad" required></div>
                <div class="col-4 col-md-2"><input type="number" step="0.01" min="0" name="enMano" class="form-control form-control-sm" placeholder="En mano"></div>
                <div class="col-6 col-md-2 d-grid"><button class="btn btn-sm btn-success"><i class="fa-solid fa-plus me-1"></i>Añadir ingreso</button></div>
            </form>`;

        return `
            <div class="card border mb-3" data-evento-section-card>
                <div class="card-header bg-light d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <span class="fw-bold"><i class="fa-solid ${esAnexo ? 'fa-paperclip' : 'fa-calendar-days'} text-primary me-1"></i>${escapeHtml(tituloSeccion)}</span>
                    <span class="d-flex gap-2">
                        ${enlaceEvento}
                        <button class="btn btn-sm btn-outline-danger delete-evento-section" data-key="${key}" data-seccion="${seccion.id}" data-nombre="${escapeHtml(seccion.eventoNombre || '')}"><i class="fas fa-trash"></i></button>
                    </span>
                </div>
                <div class="card-body">
                    <div class="row g-3">
                        <div class="col-lg-6">
                            <h6 class="text-danger"><i class="fa-solid fa-arrow-trend-down me-1"></i>Gastos del evento</h6>
                            ${formG}${tablaG}
                        </div>
                        <div class="col-lg-6">
                            <h6 class="text-success"><i class="fa-solid fa-arrow-trend-up me-1"></i>Ingresos del evento</h6>
                            ${formI}${tablaI}
                        </div>
                    </div>
                    <div class="balance-strip bg-light border-top p-2 text-end fw-bold">
                        Balance del evento: <span class="${balance >= 0 ? 'text-success' : 'text-danger'}">${fmtEur(balance)}</span>
                    </div>
                </div>
            </div>`;
    }

    async function renderMes(key, options = {}) {
        const pane = document.getElementById('pane-mes-activo');
        if (!pane) return;
        const doc = monthDocs[key] || baseMes(key);
        const t = totalesMes(key);
        let saldoVisible = saldoVisibles[key] != null ? saldoVisibles[key] : null;
        let saldoPrev = 0;
        let saldoError = false;
        if (saldoVisible === null) {
            try { saldoVisible = await computeSaldoCalculado(key); }
            catch (e) { console.error(e); saldoError = true; saldoVisible = saldoVisibles[key] != null ? saldoVisibles[key] : 0; }
        }
        if (saldoVisible === null) saldoVisible = 0;
        const prev = prevYm(key);
        if (prev) {
            if (saldoVisibles[prev] != null) saldoPrev = saldoVisibles[prev];
            else {
                try { saldoPrev = await computeSaldoCalculado(prev); }
                catch (e) { console.error(e); saldoError = true; saldoPrev = 0; }
            }
        }
        const saldoExplicito = doc.saldoDisponible != null && doc.saldoDisponible !== undefined && !isNaN(doc.saldoDisponible);

        const seccionesHtml = (doc.seccionesEvento || []).map(s => renderSeccionEvento(key, s)).join('')
            || '<div class="text-muted small py-2"><i class="fa-solid fa-circle-info me-1"></i>No hay secciones por evento. Crea una para registrar gastos/ingresos ligados a un evento.</div>';

        const card = (titulo, valor, clase) => `
            <div class="col-6 col-lg-2">
                <div class="card shadow-sm h-100 text-center">
                    <div class="card-body py-3">
                        <div class="text-muted small">${titulo}</div>
                        <div class="fw-bold ${clase}">${valor}</div>
                    </div>
                </div>
            </div>`;

        pane.innerHTML = `
            <div class="row g-3 mb-3">
                ${card('Total ingresos', fmtEur(t.totalIngresos), 'text-success')}
                ${card('Total gastos', fmtEur(t.totalGastos), 'text-danger')}
                ${card('Balance mensual', fmtEur(t.balance), t.balance >= 0 ? 'text-success' : 'text-danger')}
                ${card('Mes anterior', fmtEur(saldoPrev), 'text-secondary')}
                <div class="col-12 col-lg-4">
                    <div class="card shadow-sm h-100 saldo-card">
                        <div class="card-body py-3">
                            <div class="text-muted small mb-1">Saldo disponible ${saldoExplicito ? '' : '<i class="fa-solid fa-circle-info ms-1 text-info" title="No fijado: se muestra el saldo autocalculado sobre el saldo del mes anterior"></i>'}</div>
                            <div class="input-group input-group-sm">
                                <input type="number" step="0.01" class="form-control" id="saldo-input-${key}" value="${saldoVisible}" placeholder="${fmtEur(saldoPrev)}">
                                <button class="btn btn-outline-primary save-saldo" data-key="${key}"><i class="fa-solid fa-floppy-disk"></i></button>
                                <button class="btn btn-outline-secondary reset-saldo" data-key="${key}" title="Borrar saldo manual y calcular automáticamente"><i class="fa-solid fa-rotate-left"></i></button>
                            </div>
                            ${saldoError ? '<div class="form-text text-warning"><i class="fa-solid fa-circle-exclamation me-1"></i>No se ha podido calcular, introdúzcalo manualmente.</div>' : '<div class="form-text">Si no hay saldo manual, se calcula con el saldo anterior y el balance del mes.</div>'}
                        </div>
                    </div>
                </div>
            </div>

            <div class="row g-3">
                <div class="col-lg-6">
                    <div class="card shadow-sm h-100">
                        <div class="card-header"><h6 class="mb-0 text-danger"><i class="fa-solid fa-arrow-trend-down me-1"></i>Gastos ordinarios</h6></div>
                        <div class="card-body">${renderTabla(key, { campo: 'gastosOrdinarios', filas: doc.gastosOrdinarios }, true)}</div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="card shadow-sm h-100">
                        <div class="card-header"><h6 class="mb-0 text-success"><i class="fa-solid fa-arrow-trend-up me-1"></i>Ingresos ordinarios</h6></div>
                        <div class="card-body">${renderTabla(key, { campo: 'ingresosOrdinarios', filas: doc.ingresosOrdinarios }, false)}</div>
                    </div>
                </div>
            </div>
            <div class="balance-strip bg-light border rounded p-2 mb-3 text-end fw-bold">
                Balance ordinario: <span class="${t.iOrd - t.gOrd >= 0 ? 'text-success' : 'text-danger'}">${fmtEur(t.iOrd - t.gOrd)}</span>
            </div>

            <div class="row g-3 mt-1">
                <div class="col-lg-6">
                    <div class="card shadow-sm h-100">
                        <div class="card-header"><h6 class="mb-0 text-danger"><i class="fa-solid fa-bolt me-1"></i>Gastos extraordinarios</h6></div>
                        <div class="card-body">${renderTabla(key, { campo: 'gastosExtraordinarios', filas: doc.gastosExtraordinarios }, true)}</div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="card shadow-sm h-100">
                        <div class="card-header"><h6 class="mb-0 text-success"><i class="fa-solid fa-bolt me-1"></i>Ingresos extraordinarios</h6></div>
                        <div class="card-body">${renderTabla(key, { campo: 'ingresosExtraordinarios', filas: doc.ingresosExtraordinarios }, false)}</div>
                    </div>
                </div>
            </div>
            <div class="balance-strip bg-light border rounded p-2 mb-3 text-end fw-bold">
                Balance extraordinario: <span class="${t.iExt - t.gExt >= 0 ? 'text-success' : 'text-danger'}">${fmtEur(t.iExt - t.gExt)}</span>
            </div>

            <div class="card shadow-sm mt-4">
                <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <h6 class="mb-0"><i class="fa-solid fa-calendar-days me-1"></i>Gastos e ingresos por evento</h6>
                    <button class="btn btn-sm btn-primary add-evento-section" data-key="${key}"><i class="fa-solid fa-square-plus me-1"></i>Nueva sección por evento</button>
                </div>
                <div class="card-body">${seccionesHtml}</div>
            </div>

            <div class="balance-strip bg-light border rounded p-2 mt-3 text-end fw-bold">
                Balance del mes (todos los tipos): <span class="${t.balance >= 0 ? 'text-success' : 'text-danger'}">${fmtEur(t.balance)}</span>
            </div>
        `;
    }

    async function recargarVista() {
        const loadingEl = document.getElementById('tesoreria-loading');
        if (loadingEl) loadingEl.classList.remove('d-none');
        try {
            const months = mesesDelAño(currentYear);
            const key = activeMonthKey || ym(currentYear, new Date().getMonth() + 1);
            await getMesDoc(key, false);
            document.getElementById('no-data-banner').classList.toggle('d-none', monthHasData(monthDocs[key]));
            if (totalYearsLoaded.has(currentYear)) renderTotalPane(currentYear);
            if (activeMonthKey && activeMonthKey.startsWith(`${currentYear}-`)) {
                await renderMes(key, { light: true });
            }
        } finally {
            if (loadingEl) loadingEl.classList.add('d-none');
        }
    }

    // ---------- Acciones CRUD ----------

    async function addFila(key, opts, fila) {
        const esEvento = !!opts.seccion;
        await updateMes(key, doc => {
            const arr = filasDe(doc, opts);
            if (arr) arr.push({ id: newId(), ...fila });
        });
    }

    async function updFila(key, opts, rowId, cambios) {
        await updateMes(key, doc => {
            const arr = filasDe(doc, opts);
            if (arr) {
                const idx = arr.findIndex(r => r.id === rowId);
                if (idx >= 0) Object.assign(arr[idx], cambios);
            }
        });
    }

    async function delFila(key, opts, rowId) {
        await updateMes(key, doc => {
            const arr = filasDe(doc, opts);
            if (arr) {
                const idx = arr.findIndex(r => r.id === rowId);
                if (idx >= 0) arr.splice(idx, 1);
            }
        });
    }

    async function handleAddForm(form) {
        const key = form.dataset.key;
        const concepto = (form.elements['concepto'].value || '').trim();
        if (!concepto) return showAlert('El concepto no puede estar vacío.', 'warning');
        const fecha = form.elements['fecha'].value || new Date().toISOString().slice(0, 10);
        const monto = parseFloat(form.elements['monto'].value) || 0;
        const esGasto = form.dataset.esgasto === '1';
        const meta = LISTA_META[form.dataset.campo];
        const fila = { concepto, fecha };
        if (esGasto) {
            fila.coste = monto;
            fila.factura = false;
            fila.facturaEnlace = '';
        } else {
            fila.cuantia = monto;
            fila.cuotasSocios = Boolean(form.elements['cuotasSocios']?.checked);
        }
        try {
            await addFila(key, { campo: form.dataset.campo }, fila);
            if (window.auditar) await window.auditar('tesoreria', 'crear', `Añadido ${meta.titulo.toLowerCase()}: "${concepto}" (${fmtEur(monto)})`);
            showAlert('Movimiento añadido.', 'success');
            await recargarVista();
        } catch (e) {
            console.error(e);
            showAlert('Error al añadir el movimiento.', 'danger');
        }
    }

    async function handleAddEventoForm(form) {
        const key = form.dataset.key;
        const seccion = form.dataset.seccion;
        const sub = form.dataset.sub;
        const concepto = (form.elements['concepto'].value || '').trim();
        if (!concepto) return showAlert('El concepto no puede estar vacío.', 'warning');
        const actividadId = form.elements['actividad'].value || '';
        let actividadNombre = '';
        if (actividadId && form.elements['actividad'].selectedOptions[0]) {
            actividadNombre = form.elements['actividad'].selectedOptions[0].textContent.trim();
        }
        const cantidad = parseFloat(form.elements['cantidad'].value) || 0;
        const numJugadores = form.elements['numJugadores'].value !== '' ? parseInt(form.elements['numJugadores'].value, 10) : null;
        const enMano = form.elements['enMano'].value !== '' ? parseFloat(form.elements['enMano'].value) : null;
        const esGasto = sub === 'gastos';
        const fila = { concepto, actividadId, actividadNombre, cantidad, numJugadores, enMano };
        if (esGasto) { fila.factura = false; fila.facturaEnlace = ''; }
        try {
            await addFila(key, { seccion, sub }, fila);
            if (window.auditar) await window.auditar('tesoreria', 'crear', `Añadido ${esGasto ? 'gasto' : 'ingreso'} de evento: "${concepto}" (${fmtEur(cantidad)})`);
            showAlert('Movimiento añadido.', 'success');
            await recargarVista();
        } catch (e) {
            console.error(e);
            showAlert('Error al añadir el movimiento.', 'danger');
        }
    }

    function modalFilas(opts) {
        const doc = monthDocs[opts.key];
        if (opts.seccion) {
            const s = (doc && doc.seccionesEvento || []).find(x => x.id === opts.seccion);
            return s ? s[opts.sub] || [] : [];
        }
        return (doc && doc[opts.campo]) || [];
    }

    function openEditRow(key, opts, rowId) {
        const filas = modalFilas(opts);
        const r = filas.find(x => x.id === rowId);
        if (!r) return;

        const esGasto = opts.sub ? opts.sub === 'gastos' : LISTA_META[opts.campo].esGasto;
        const esCuotas = !opts.seccion && opts.campo === 'ingresosOrdinarios';
        editState = { key, opts, rowId, esGasto, esCuotas };

        document.getElementById('row-modal-title').textContent = esGasto ? 'Editar gasto' : 'Editar ingreso';
        document.getElementById('row-concepto').value = r.concepto || '';
        document.getElementById('row-fecha').value = r.fecha || '';
        document.getElementById('row-monto-label').textContent = esGasto ? 'Coste' : 'Cuantía';
        const montoVal = esGasto ? r.coste : (r.cuantia != null ? r.cuantia : null);
        document.getElementById('row-monto').value = montoVal != null ? montoVal : '';
        document.getElementById('row-key').value = key;
        document.getElementById('row-campo').value = opts.campo || '';
        document.getElementById('row-seccion').value = opts.seccion || '';
        document.getElementById('row-sub').value = opts.sub || '';
        document.getElementById('row-id').value = rowId;

        const esEvento = !!opts.seccion;
        document.getElementById('row-actividad-container').style.display = esEvento ? 'block' : 'none';
        document.getElementById('row-extras-container').style.display = esEvento ? 'flex' : 'none';
        document.getElementById('row-numjug-container').style.display = esEvento ? 'block' : 'none';
        document.getElementById('row-enmano-container').style.display = esEvento ? 'block' : 'none';
        document.getElementById('row-factura-container').style.display = esGasto ? 'block' : 'none';
        document.getElementById('row-cuotas-container').style.display = esCuotas ? 'block' : 'none';

        if (esEvento) {
            const doc = monthDocs[key];
            const seccion = (doc.seccionesEvento || []).find(x => x.id === opts.seccion);
            const sel = document.getElementById('row-actividad');
            sel.innerHTML = optionsActividades(seccion ? seccion.eventoId : '', r.actividadId);
            document.getElementById('row-numjug').value = r.numJugadores != null ? r.numJugadores : '';
            document.getElementById('row-enmano').value = r.enMano != null ? r.enMano : '';
        }
        document.getElementById('row-factura-enlace').value = facturaEnlace(r);
        document.getElementById('row-cuotas-socios').checked = esCuotas && (r.cuotasSocios === true || r.cuotasSocios === 1 || r.cuotasSocios === 'true');
        rowModal.show();
    }

    function handleRowFormSubmit(e) {
        e.preventDefault();
        if (!editState) return;
        const { key, opts, rowId, esGasto, esCuotas } = editState;
        const concepto = (document.getElementById('row-concepto').value || '').trim();
        if (!concepto) return showAlert('El concepto no puede estar vacío.', 'warning');
        const fecha = document.getElementById('row-fecha').value || new Date().toISOString().slice(0, 10);
        const monto = parseFloat(document.getElementById('row-monto').value) || 0;

        const cambios = { concepto, fecha };
        if (opts.seccion) {
            cambios.cantidad = monto;
            cambios.actividadId = document.getElementById('row-actividad').value || '';
            const selAct = document.getElementById('row-actividad');
            cambios.actividadNombre = cambios.actividadId && selAct.selectedOptions[0] ? selAct.selectedOptions[0].textContent.trim() : '';
            const nj = document.getElementById('row-numjug').value;
            cambios.numJugadores = nj !== '' ? parseInt(nj, 10) : null;
            const em = document.getElementById('row-enmano').value;
            cambios.enMano = em !== '' ? parseFloat(em) : null;
            if (esGasto) {
                cambios.facturaEnlace = (document.getElementById('row-factura-enlace').value || '').trim();
                cambios.factura = Boolean(cambios.facturaEnlace);
            }
        } else {
            if (esGasto) {
                cambios.coste = monto;
                cambios.facturaEnlace = (document.getElementById('row-factura-enlace').value || '').trim();
                cambios.factura = Boolean(cambios.facturaEnlace);
            }
            else {
                cambios.cuantia = monto;
                if (esCuotas) cambios.cuotasSocios = document.getElementById('row-cuotas-socios').checked;
            }
        }

        updFila(key, opts, rowId, cambios).then(async () => {
            if (window.auditar) await window.auditar('tesoreria', 'editar', `Movimiento editado: "${concepto}"`);
            showAlert('Movimiento actualizado.', 'success');
            rowModal.hide();
            await recargarVista();
        }).catch(err => {
            console.error(err);
            showAlert('Error al actualizar el movimiento.', 'danger');
        });
    }

    async function handleSaveSaldo(key, btn) {
        const input = document.getElementById(`saldo-input-${key}`);
        if (!input) return;
        const val = input.value;
        let nuevo = null;
        if (val !== '') {
            nuevo = parseFloat(val);
            if (isNaN(nuevo)) return showAlert('Introduce un valor numérico válido.', 'warning');
        }
        try {
            // El saldo puede ser el primer dato del mes: updateMes crea el
            // documento base aunque Firestore todavía no tenga ese mes.
            const doc = monthDocs[key] || baseMes(key);
            doc.saldoDisponible = nuevo;
            await db.collection('tesoreria').doc(key).set(doc);
            monthDocs[key] = doc;
            if (nuevo === null) delete saldoVisibles[key];
            else saldoVisibles[key] = nuevo;
            activeMonthKey = key;
            if (window.auditar) await window.auditar('tesoreria', 'editar', `Saldo de ${key} ${nuevo === null ? 'restablecido (auto)' : 'fijado a ' + fmtEur(nuevo)}`);
            showAlert('Saldo guardado.', 'success');
            await renderMes(key, { light: true });
        } catch (e) {
            console.error(e);
            showAlert('Error al guardar el saldo.', 'danger');
        }
    }

    async function handleResetSaldo(key) {
        try {
            await updateMes(key, doc => { doc.saldoDisponible = null; });
            activeMonthKey = key;
            saldoVisibles = {};
            await renderMes(key);
            showAlert('Saldo manual borrado. Se ha recalculado automáticamente.', 'success');
        } catch (e) {
            console.error(e);
            showAlert('No se pudo borrar el saldo manual.', 'danger');
        }
    }

    async function handleAddEventoSection(key) {
        if (eventosLoadPromise) await eventosLoadPromise;
        const select = document.getElementById('evento-section-select');
        select.innerHTML = '';
        const blankOpt = document.createElement('option');
        blankOpt.value = '';
        blankOpt.textContent = 'Anexo personalizado (sin evento)';
        select.appendChild(blankOpt);
        if (eventosCache.length === 0) {
            select.options[0].textContent = 'Sin evento: anexo personalizado';
        } else {
            eventosCache.forEach(ev => {
                const opt = document.createElement('option');
                opt.value = ev.id;
                opt.textContent = ev.titulo || 'Sin título';
                select.appendChild(opt);
            });
        }
        document.getElementById('evento-section-nombre').value = '';
        document.getElementById('evento-section-select').dataset.key = key;
        eventoSectionModal.show();
    }

    async function confirmEventoSection() {
        const select = document.getElementById('evento-section-select');
        const key = select.dataset.key;
        const eventoId = select.value;
        const nombreAnexo = (document.getElementById('evento-section-nombre').value || '').trim();
        if (!eventoId && !nombreAnexo) return showAlert('Selecciona un evento o escribe un nombre para el anexo.', 'warning');
        const ev = eventosCache.find(x => x.id === eventoId);
        const nombre = eventoId ? (ev ? (ev.titulo || '') : '') : nombreAnexo;
        try {
            await updateMes(key, doc => {
                doc.seccionesEvento.push({
                    id: newId(),
                    eventoId: eventoId || null,
                    eventoNombre: nombre,
                    personalizado: !eventoId,
                    gastos: [],
                    ingresos: []
                });
            });
            if (window.auditar) await window.auditar('tesoreria', 'crear', `Sección por evento "${ev ? ev.titulo : ''}" creada en ${key}`);
            showAlert('Sección de evento creada.', 'success');
            eventoSectionModal.hide();
            await recargarVista();
        } catch (e) {
            console.error(e);
            showAlert('Error al crear la sección.', 'danger');
        }
    }

    async function handleDeleteEventoSection(key, seccionId) {
        const doc = monthDocs[key];
        const seccion = (doc && doc.seccionesEvento || []).find(x => x.id === seccionId);
        showConfirmationModal(
            'Eliminar sección de evento',
            `¿Eliminar la sección de "${seccion ? seccion.eventoNombre : ''}" junto con todos sus movimientos?`,
            () => {
                updateMes(key, d => { d.seccionesEvento = (d.seccionesEvento || []).filter(x => x.id !== seccionId); })
                    .then(async () => {
                        if (window.auditar) await window.auditar('tesoreria', 'eliminar', 'Sección por evento eliminada');
                        showAlert('Sección eliminada.', 'success');
                        return recargarVista();
                    })
                    .catch(err => {
                        console.error(err);
                        showAlert('Error al eliminar la sección.', 'danger');
                    });
            }
        );
    }

    // ---------- Event delegation ----------

    function setupGlobalEvents() {
        const content = document.getElementById('treasury-tabs-content');
        const tabs = document.getElementById('treasury-tabs');

        // Render perezoso: al abrir un mes que no está pintado, se pinta
        tabs.addEventListener('shown.bs.tab', function (e) {
            const target = e.target && e.target.getAttribute ? e.target.getAttribute('data-bs-target') : '';
            if (target === `#pane-total-${currentYear}`) loadTotalYear(currentYear);
        });

        tabs.addEventListener('change', async function (e) {
            if (!e.target || e.target.id !== 'month-select') return;
            const key = e.target.value;
            activeMonthKey = key;
            const monthNumber = parseInt(key.split('-')[1], 10);
            const monthTab = tabs.querySelector('[data-bs-target="#pane-mes-activo"]');
            if (monthTab && monthNumber >= 1 && monthNumber <= MESES.length) {
                monthTab.innerHTML = `<i class="fa-solid fa-calendar-days me-1"></i>${MESES[monthNumber - 1]}`;
            }
            try {
                await getMesDoc(key, false);
                await renderMes(key, { light: true });
                if (monthTab) new bootstrap.Tab(monthTab).show();
            } catch (err) {
                console.error('Error cargando el mes ' + key, err);
                showAlert('No se pudo cargar el mes seleccionado.', 'danger');
            }
        });

        content.addEventListener('submit', function (e) {
            const form = e.target.closest('.add-form');
            if (form) { e.preventDefault(); handleAddForm(form); return; }
            const fEv = e.target.closest('.add-evento-form');
            if (fEv) { e.preventDefault(); handleAddEventoForm(fEv); return; }
        });

        content.addEventListener('click', function (e) {
            const gotoBtn = e.target.closest('.goto-month-btn');
            if (gotoBtn) {
                const year = parseInt(gotoBtn.dataset.year, 10);
                const m = new Date().getMonth() + 1;
                const target = document.getElementById('month-select');
                if (target) { target.value = ym(year, m); target.dispatchEvent(new Event('change', { bubbles: true })); }
                else if (m > monthsDelAño(year).length) {
                    const ultimo = monthsDelAño(year)[monthsDelAño(year).length - 1];
                    const t2 = document.querySelector(`#treasury-tabs button[data-bs-target="#pane-mes-${ym(year, ultimo)}"]`);
                    if (t2) new bootstrap.Tab(t2).show();
                }
                return;
            }

            const editBtn = e.target.closest('.row-edit');
            if (editBtn) {
                const key = editBtn.dataset.key;
                const opts = { key };
                if (editBtn.dataset.seccion) { opts.seccion = editBtn.dataset.seccion; opts.sub = editBtn.dataset.sub; }
                else opts.campo = editBtn.dataset.campo;
                openEditRow(key, opts, editBtn.dataset.id);
                return;
            }

            const delBtn = e.target.closest('.row-del');
            if (delBtn) {
                const key = delBtn.dataset.key;
                const opts = { key };
                if (delBtn.dataset.seccion) { opts.seccion = delBtn.dataset.seccion; opts.sub = delBtn.dataset.sub; }
                else opts.campo = delBtn.dataset.campo;
                const esGasto = opts.sub ? opts.sub === 'gastos' : LISTA_META[opts.campo].esGasto;
                showConfirmationModal(
                    'Eliminar movimiento',
                    `¿Eliminar este ${esGasto ? 'gasto' : 'ingreso'}?`,
                    () => {
                        delFila(key, opts, delBtn.dataset.id).then(async () => {
                            if (window.auditar) await window.auditar('tesoreria', 'eliminar', 'Movimiento eliminado');
                            showAlert('Movimiento eliminado.', 'success');
                            return recargarVista();
                        }).catch(err => {
                            console.error(err);
                            showAlert('Error al eliminar el movimiento.', 'danger');
                        });
                    }
                );
                return;
            }

            const factBtn = e.target.closest('.factura-btn');
            if (factBtn) {
                const url = factBtn.dataset.url || '';
                try {
                    const parsed = url ? new URL(url, window.location.origin) : null;
                    if (parsed && ['http:', 'https:'].includes(parsed.protocol)) window.open(parsed.href, '_blank', 'noopener,noreferrer');
                    else if (!url) showAlert('Esta factura no tiene un enlace. Entra en editar para añadirlo.', 'info');
                    else showAlert('El enlace de la factura no es válido.', 'warning');
                } catch (err) {
                    showAlert('El enlace de la factura no es válido.', 'warning');
                }
                return;
            }

            const saldoBtn = e.target.closest('.save-saldo');
            if (saldoBtn) { handleSaveSaldo(saldoBtn.dataset.key, saldoBtn); return; }

            const resetSaldoBtn = e.target.closest('.reset-saldo');
            if (resetSaldoBtn) { handleResetSaldo(resetSaldoBtn.dataset.key); return; }

            const addSecBtn = e.target.closest('.add-evento-section');
            if (addSecBtn) { handleAddEventoSection(addSecBtn.dataset.key); return; }

            const delSecBtn = e.target.closest('.delete-evento-section');
            if (delSecBtn) { handleDeleteEventoSection(delSecBtn.dataset.key, delSecBtn.dataset.seccion); return; }
        });
    }

    // ---------- Arranque ----------

    auth.onAuthStateChanged(async user => {
        if (!user) {
            accesoDenegado('Acceso denegado. Por favor, inicia sesión para continuar.');
            return;
        }
        try {
            const isAdmin = await window.isUserAdmin();
            if (!isAdmin) {
                accesoDenegado('Acceso denegado. Solo los administradores pueden ver esta sección.');
                return;
            }
        } catch (e) {
            accesoDenegado('Error comprobando permisos.');
            return;
        }

        document.getElementById('row-form').addEventListener('submit', handleRowFormSubmit);
        document.getElementById('confirm-evento-section-btn').addEventListener('click', confirmEventoSection);

        // Los eventos solo son necesarios al crear una secciÃ³n; no deben bloquear
        // la carga inicial de TesorerÃ­a.
        eventosLoadPromise = loadEventosYSubeventos();
        initYearSelect();
        setupGlobalEvents();
        await buildYear(currentYear);
    });
});
