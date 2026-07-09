document.addEventListener('DOMContentLoaded', () => {
    window.initializeModernController = function (canManage) {
        const db = firebase.firestore();
        const auth = firebase.auth();

        // --- STATE ---
        let torneosCache = [];
        let ligasCache = [];
        let usuariosCache = [];
        let eventosCache = [];
        let subeventosCache = [];
        let tempJugadores = [];
        let _jugadoresPrevios = [];
        let _previosPage = 1;
        const PREVIOS_PER_PAGE = 10;
        let selectedTournament = null;

        const JUEGO = 'mtg-modern';
        const PT_WIN = 3;
        const PT_DRAW = 1;
        const PT_LOSS = 0;
        const PT_BYE = 3;

        // --- DOM REFS ---
        const $id = (id) => document.getElementById(id);

        // --- UTILITY ---
        function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
        function genId() { return Math.random().toString(36).substr(2, 9); }
        function generateLeagueCode() {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let code = '';
            for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
            return code;
        }
        function showAlert(msg, type, dur) {
            if (window.showAlert) window.showAlert(msg, type, dur);
        }

        // --- INIT ---
        async function init() {
            await loadInitialData();
            setupEventListeners();
        }

        async function loadInitialData() {
            try {
                const now = firebase.firestore.Timestamp.now();
                const [evSnap, subSnap, ligSnap, torSnap] = await Promise.all([
                    db.collection('eventos').orderBy('fecha', 'desc').get(),
                    db.collection('subeventos').get(),
                    db.collection('ligas').where('juego', '==', JUEGO).get(),
                    db.collection('torneos').where('juego', '==', JUEGO).orderBy('fecha', 'desc').get(),
                ]);
                eventosCache = evSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                subeventosCache = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                ligasCache = ligSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                torneosCache = torSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                if (canManage) {
                    const uSnap = await db.collection('usuarios').get();
                    usuariosCache = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                }

                renderTournamentsList();
                renderLigaSelectors();
                renderEventSelector();
                renderLigaClasificacion();
                if (canManage) populateDatalist();
            } catch (e) {
                console.error('Error loading initial data:', e);
                showAlert('Error al cargar datos.', 'danger');
            }
        }

        // --- TOURNAMENT LIST ---
        function renderTournamentsList(filterLigaId) {
            const container = $id('lista-torneos-modern');
            if (!container) return;
            const showFinalized = $id('filter-show-finalized-modern')?.checked || false;

            let filtered = [...torneosCache];
            if (filterLigaId) filtered = filtered.filter(t => t.ligaId === filterLigaId);
            if (!showFinalized) filtered = filtered.filter(t => t.estado !== 'finalizado');

            if (filtered.length === 0) {
                container.innerHTML = '<div class="col-12"><p class="text-center text-muted py-4">No hay torneos.</p></div>';
                return;
            }

            container.innerHTML = filtered.map(t => {
                const badge = t.estado === 'borrador' ? 'badge-draft' : t.estado === 'en_curso' ? 'badge-progress' : 'badge-finished';
                const label = t.estado === 'borrador' ? 'Borrador' : t.estado === 'en_curso' ? 'En curso' : 'Finalizado';
                const liga = t.ligaId ? ligasCache.find(l => l.id === t.ligaId) : null;
                const fecha = t.fecha ? new Date(t.fecha + 'T' + (t.hora || '00:00')).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                const ligaMatchBadge = liga ? `<span class="badge bg-purple ms-2" style="background-color:#6c5ce7;">Liga</span>` : '';

                const ev = t.eventoId ? eventosCache.find(e => e.id === t.eventoId) : null;
                const sub = t.subeventoId ? subeventosCache.find(s => s.id === t.subeventoId) : null;
                let asociacionText = 'Independiente';
                if (ev) {
                    asociacionText = ev.titulo;
                    if (sub) asociacionText += ` (${sub.titulo})`;
                } else if (liga) {
                    asociacionText = liga.nombre;
                }

                let buttons = '';
                if (canManage) {
                    if (t.estado === 'borrador') {
                        buttons += `
                            <button class="btn btn-sm btn-outline-primary btn-add-players-torneo-modern" data-id="${t.id}"><i class="fa-solid fa-users-gear"></i> Jugadores</button>
                            <button class="btn btn-sm btn-success btn-iniciar-modern" data-id="${t.id}"><i class="fa-solid fa-play"></i> Iniciar</button>
                            <button class="btn btn-sm btn-outline-secondary btn-editar-torneo-modern" data-id="${t.id}"><i class="fa-solid fa-edit"></i></button>
                        `;
                    } else if (t.estado === 'en_curso') {
                        buttons += `<button class="btn btn-sm btn-primary btn-gestionar-modern" data-id="${t.id}"><i class="fa-solid fa-gears"></i> Gestionar</button>`;
                    } else {
                        buttons += `<button class="btn btn-sm btn-outline-info btn-ver-detalles-torneo-modern" data-id="${t.id}"><i class="fa-solid fa-eye"></i> Resultados</button>`;
                    }
                    buttons += `<button class="btn btn-sm btn-outline-danger btn-eliminar-torneo-modern" data-id="${t.id}"><i class="fa-solid fa-trash"></i></button>`;
                } else {
                    if (t.estado === 'en_curso') {
                        buttons += `<button class="btn btn-sm btn-primary btn-gestionar-modern" data-id="${t.id}"><i class="fa-solid fa-eye"></i> Ver Rondas</button>`;
                    } else if (t.estado === 'finalizado') {
                        buttons += `<button class="btn btn-sm btn-outline-info btn-ver-detalles-torneo-modern" data-id="${t.id}"><i class="fa-solid fa-eye"></i> Clasificación</button>`;
                    } else {
                        buttons += `<span class="text-muted small">No disponible</span>`;
                    }
                }

                return `
                    <div class="col-md-6 col-lg-4">
                        <div class="card card-custom h-100 p-3">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <span class="badge ${badge}">${label}</span>
                                <span class="small text-muted">${fecha}</span>
                            </div>
                            <h5 class="fw-bold text-dark mb-1">${escapeHtml(t.nombre)} ${ligaMatchBadge}</h5>
                            <p class="small text-muted mb-3"><i class="fa-solid fa-calendar-day me-2"></i>${asociacionText}</p>
                            <div class="d-flex justify-content-between align-items-center mt-auto border-top pt-2">
                                <span class="small text-muted"><i class="fa-solid fa-user-group me-1"></i> ${(t.jugadores || []).length} jugadores</span>
                                <div class="d-flex gap-1">
                                    ${buttons}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // --- STANDINGS (INTERNAL) ---
        function calculateStandings(torneo) {
            const pts = {};
            const jugMap = {};
            (torneo.jugadores || []).forEach(j => { jugMap[j.id] = j.nombre; pts[j.id] = { puntos: 0, progresivo: 0, bh: 0, rivales: [] }; });
            (torneo.rondas || []).forEach(r => {
                (r.mesas || []).forEach(m => {
                    if (m.bye) {
                        if (!pts[m.bye]) pts[m.bye] = { puntos: 0, progresivo: 0, bh: 0, rivales: [] };
                        pts[m.bye].puntos += PT_BYE;
                        return;
                    }
                    const [p1, p2] = m.jugadores;
                    if (!pts[p1]) pts[p1] = { puntos: 0, progresivo: 0, bh: 0, rivales: [] };
                    if (!pts[p2]) pts[p2] = { puntos: 0, progresivo: 0, bh: 0, rivales: [] };
                    pts[p1].rivales.push(p2);
                    pts[p2].rivales.push(p1);

                    if (m.empate) {
                        pts[p1].puntos += PT_DRAW;
                        pts[p2].puntos += PT_DRAW;
                    } else if (m.ganador) {
                        const perdedor = m.ganador === p1 ? p2 : p1;
                        pts[m.ganador].puntos += PT_WIN;
                        pts[perdedor].puntos += PT_LOSS;
                    }
                });
                // Progresivo: sumar puntos acumulados tras cada ronda
                Object.keys(pts).forEach(id => {
                    pts[id].progresivo += pts[id].puntos;
                });
            });

            // Buchholz
            Object.keys(pts).forEach(id => {
                pts[id].bh = pts[id].rivales.reduce((sum, rid) => sum + (pts[rid]?.puntos || 0), 0);
            });

            return Object.entries(pts).map(([id, data]) => ({
                id, nombre: jugMap[id] || '?',
                puntos: data.puntos, progresivo: data.progresivo, bh: data.bh, rivales: data.rivales,
            })).sort((a, b) => b.puntos - a.puntos || b.progresivo - a.progresivo || b.bh - a.bh);
        }

        function renderStandings(torneo) {
            const tbody = $id('tabla-clasificacion-modern');
            if (!tbody) return;
            const list = calculateStandings(torneo);
            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Sin datos</td></tr>';
                return;
            }
            tbody.innerHTML = list.map((r, i) => `
                <tr><td class="fw-bold">${i + 1}</td>
                    <td>${escapeHtml(r.nombre)}</td>
                    <td class="text-center fw-bold text-primary">${r.puntos}</td>
                    <td class="text-center">${(r.progresivo / 10).toFixed(1)}</td>
                    <td class="text-center">${r.bh}</td>
                </tr>
            `).join('');
        }

        // --- SWISS PAIRING ---
        function generatePairings(jugadores, rondas) {
            if (jugadores.length < 2) return [];

            // Primera ronda: emparejamiento aleatorio
            if (!rondas || rondas.length === 0) {
                const shuffled = [...jugadores].sort(() => Math.random() - 0.5);
                const pairings = [];
                for (let i = 0; i < shuffled.length; i += 2) {
                    if (i + 1 < shuffled.length) {
                        pairings.push({ player1: shuffled[i].id, player2: shuffled[i + 1].id });
                    } else {
                        pairings.push({ player1: shuffled[i].id, player2: null });
                    }
                }
                return pairings;
            }

            const standings = calculateStandings({ jugadores, rondas });
            const sorted = [...standings].sort((a, b) => b.puntos - a.puntos || b.bh - a.bh);

            // Build match history
            const played = {};
            rondas.forEach(r => {
                (r.mesas || []).forEach(m => {
                    if (m.jugadores && m.jugadores.length === 2 && !m.bye) {
                        const [p1, p2] = m.jugadores;
                        if (!played[p1]) played[p1] = new Set();
                        if (!played[p2]) played[p2] = new Set();
                        played[p1].add(p2);
                        played[p2].add(p1);
                    }
                });
            });

            const paired = new Set();
            const pairings = [];

            for (let i = 0; i < sorted.length; i++) {
                if (paired.has(sorted[i].id)) continue;
                let opp = null;
                for (let j = i + 1; j < sorted.length; j++) {
                    if (paired.has(sorted[j].id)) continue;
                    if (!played[sorted[i].id]?.has(sorted[j].id)) {
                        opp = sorted[j];
                        break;
                    }
                }
                if (!opp) {
                    for (let j = i + 1; j < sorted.length; j++) {
                        if (paired.has(sorted[j].id)) continue;
                        opp = sorted[j]; break;
                    }
                }
                if (opp) {
                    paired.add(sorted[i].id);
                    paired.add(opp.id);
                    pairings.push({ player1: sorted[i].id, player2: opp.id });
                }
            }

            // Bye for odd player
            if (paired.size < sorted.length) {
                for (const p of sorted) {
                    if (!paired.has(p.id)) {
                        pairings.push({ player1: p.id, player2: null });
                        break;
                    }
                }
            }
            return pairings;
        }

        // --- ROUND GENERATION ---
        async function handleGenerateRound() {
            if (!selectedTournament) return;
            const torneo = selectedTournament;
            const jugadores = torneo.jugadores || [];
            if (jugadores.length < 2) { showAlert('Se necesitan al menos 2 jugadores.', 'warning'); return; }

            const rondas = torneo.rondas || [];
            const pairings = generatePairings(jugadores, rondas);
            if (pairings.length === 0) { showAlert('No se pudieron generar los emparejamientos.', 'warning'); return; }

            const mesas = pairings.map((p, i) => {
                const m = { numero: i + 1, jugadores: [], resultados: {}, empate: false, bye: false };
                if (p.player2 === null) {
                    m.jugadores = [p.player1];
                    m.bye = p.player1;
                    m.resultados = {};
                } else {
                    m.jugadores = [p.player1, p.player2];
                    m.resultados = {};
                }
                return m;
            });

            const nuevaRonda = { numero: rondas.length + 1, mesas };

            try {
                const torneoRef = db.collection('torneos').doc(torneo.id);
                await db.runTransaction(async t => {
                    const doc = await t.get(torneoRef);
                    if (!doc.exists) throw new Error('Torneo no encontrado');
                    const data = doc.data();
                    const updatedRondas = [...(data.rondas || []), nuevaRonda];
                    const update = { rondas: updatedRondas };
                    if (data.estado === 'borrador') update.estado = 'en_curso';
                    t.update(torneoRef, update);
                });

                // Recargar
                await loadInitialData();
                const updated = torneosCache.find(t => t.id === torneo.id);
                if (updated) { selectedTournament = updated; openTournamentManagement(updated.id); }
                showAlert(`Ronda ${nuevaRonda.numero} generada.`, 'success');
            } catch (e) {
                console.error(e);
                showAlert('Error al generar ronda: ' + e.message, 'danger');
            }
        }

        // --- UNDO ROUND ---
        async function handleUndoRound() {
            if (!selectedTournament || !selectedTournament.rondas || selectedTournament.rondas.length === 0) return;
            const torneo = selectedTournament;
            try {
                const torneoRef = db.collection('torneos').doc(torneo.id);
                const rondas = [...(torneo.rondas || [])];
                rondas.pop();
                await torneoRef.update({ rondas });
                await loadInitialData();
                const updated = torneosCache.find(t => t.id === torneo.id);
                if (updated) { selectedTournament = updated; openTournamentManagement(updated.id); }
                showAlert('Última ronda eliminada.', 'success');
            } catch (e) {
                showAlert('Error: ' + e.message, 'danger');
            }
        }

        // --- UNDO TOP CUT ---
        async function handleUndoTopCut() {
            if (!selectedTournament || !selectedTournament.topCut) return;
            const torneo = selectedTournament;
            const bracket = torneo.topCut.bracket || [];

            // Buscar si alguna ronda del bracket tiene resultados
            const ultimaRonda = bracket[bracket.length - 1];
            const tieneResultados = bracket.some(br =>
                (br.mesas || []).some(m => m.ganador || m.empate)
            );

            if (!tieneResultados) {
                // No hay resultados en el top cut → eliminar top cut completo
                if (!confirm('¿Deshacer el top cut completo? Las rondas suizas volverán a estar disponibles.')) return;
                try {
                    await db.collection('torneos').doc(torneo.id).update({
                        topCut: firebase.firestore.FieldValue.delete()
                    });
                    await loadInitialData();
                    const updated = torneosCache.find(t => t.id === torneo.id);
                    if (updated) { selectedTournament = updated; openTournamentManagement(updated.id); }
                    showAlert('Top cut eliminado.', 'success');
                } catch (e) {
                    showAlert('Error: ' + e.message, 'danger');
                }
            } else {
                // Hay resultados → preguntar si deshacer la última ronda del bracket
                const label = bracket.length > 1 ? `la última ronda (${bracket.length - 1})` : 'la única ronda del top cut';
                if (!confirm(`¿Deshacer ${label} del top cut? Se borrarán los resultados de esa ronda.`)) return;

                if (ultimaRonda && ultimaRonda.mesas.some(m => m.ganador || m.empate)) {
                    // Limpiar resultados de la última ronda
                    ultimaRonda.mesas.forEach(m => {
                        m.resultados = {};
                        m.empate = false;
                        m.ganador = null;
                    });
                    try {
                        await db.collection('torneos').doc(torneo.id).update({ topCut: torneo.topCut });
                        await loadInitialData();
                        const updated = torneosCache.find(t => t.id === torneo.id);
                        if (updated) { selectedTournament = updated; openTournamentManagement(updated.id); }
                        showAlert('Resultados de la última ronda del top cut eliminados.', 'success');
                    } catch (e) {
                        showAlert('Error: ' + e.message, 'danger');
                    }
                } else {
                    // La última ronda no tiene resultados, eliminar la última ronda del bracket
                    if (bracket.length <= 1) {
                        if (!confirm('No quedan rondas en el bracket. ¿Eliminar el top cut completo?')) return;
                        try {
                            await db.collection('torneos').doc(torneo.id).update({
                                topCut: firebase.firestore.FieldValue.delete()
                            });
                            await loadInitialData();
                            const updated = torneosCache.find(t => t.id === torneo.id);
                            if (updated) { selectedTournament = updated; openTournamentManagement(updated.id); }
                            showAlert('Top cut eliminado.', 'success');
                        } catch (e) {
                            showAlert('Error: ' + e.message, 'danger');
                        }
                    } else {
                        bracket.pop();
                        try {
                            await db.collection('torneos').doc(torneo.id).update({ topCut: torneo.topCut });
                            await loadInitialData();
                            const updated = torneosCache.find(t => t.id === torneo.id);
                            if (updated) { selectedTournament = updated; openTournamentManagement(updated.id); }
                            showAlert('Última ronda del top cut eliminada.', 'success');
                        } catch (e) {
                            showAlert('Error: ' + e.message, 'danger');
                        }
                    }
                }
            }
        }

        // --- TOURNAMENT MANAGEMENT VIEW ---
        function openTournamentManagement(torneoId) {
            const torneo = torneosCache.find(t => t.id === torneoId);
            if (!torneo) return;
            selectedTournament = torneo;

            $id('lista-torneos-modern-container').style.display = 'none';
            $id('gestion-torneo-modern-container').style.display = 'block';
            $id('gt-modern-nombre').textContent = torneo.nombre || '';
            const fechaStr = torneo.fecha ? new Date(torneo.fecha + 'T' + (torneo.hora || '00:00')).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            const eventoTxt = torneo.eventoId ? (eventosCache.find(e => e.id === torneo.eventoId)?.titulo || '') : '';
            const ligaTxt = torneo.ligaId ? (ligasCache.find(l => l.id === torneo.ligaId)?.nombre || '') : '';
            const asociacionTxt = [eventoTxt, ligaTxt].filter(Boolean).join(' — ');
            $id('gt-modern-detalles').textContent = `${fechaStr}${asociacionTxt ? ' | ' + asociacionTxt : ''} | Formato: Modern`;
            const badge = $id('gt-modern-status');
            if (torneo.estado === 'borrador') { badge.className = 'badge badge-draft'; badge.textContent = 'Borrador'; }
            else if (torneo.estado === 'en_curso') { badge.className = 'badge badge-progress'; badge.textContent = 'En curso'; }
            else { badge.className = 'badge badge-finished'; badge.textContent = 'Finalizado'; }

            const isFinalized = torneo.estado === 'finalizado';
            const isBorrador = torneo.estado === 'borrador';
            const hasRondas = (torneo.rondas || []).length > 0;
            const hasTopCut = !!torneo.topCut && !torneo.ligaId;
            const btnIniciar = $id('btn-iniciar-torneo-modern-gestion');
            if (btnIniciar) btnIniciar.style.display = canManage && isBorrador ? 'inline-block' : 'none';
            // Bloquear rondas suizas si el top cut está activo
            $id('btn-generar-ronda-modern').style.display = canManage && !isFinalized && !isBorrador && !hasTopCut ? 'inline-block' : 'none';
            $id('btn-deshacer-ronda-modern').style.display = canManage && !isFinalized && hasRondas && !hasTopCut ? 'inline-block' : 'none';
            $id('btn-finalizar-torneo-modern').style.display = canManage && !isFinalized && hasRondas ? 'inline-block' : 'none';
            $id('btn-deshacer-topcut-modern').style.display = canManage && !isFinalized && hasTopCut ? 'inline-block' : 'none';

            renderJugadoresList(torneo);
            renderRondas(torneo);
            renderStandings(torneo);
            renderTopCut(torneo);
        }

        function renderJugadoresList(torneo) {
            const ul = $id('gt-modern-jugadores');
            if (!ul) return;
            const jugs = torneo.jugadores || [];
            $id('gt-modern-count').textContent = jugs.length;
            if (jugs.length === 0) { ul.innerHTML = '<li class="list-group-item text-muted">Sin jugadores</li>'; return; }
            ul.innerHTML = jugs.map(j => `
                <li class="list-group-item d-flex justify-content-between">
                    <span>${escapeHtml(j.nombre)}</span>
                    <small class="text-muted">${j.id.startsWith('invitado_') ? '<span class="badge bg-secondary">Invitado</span>' : '<span class="badge bg-primary">Registrado</span>'}</small>
                </li>
            `).join('');
        }

        // --- ROUND RENDERING ---
        function renderRondas(torneo) {
            const container = $id('rondas-container');
            if (!container) return;
            const rondas = torneo.rondas || [];
            if (rondas.length === 0) {
                container.innerHTML = '<p class="text-muted text-center py-3">No hay rondas todavía.</p>';
                return;
            }
            const maxRonda = Math.max(...rondas.map(r => r.numero), 0);
            const hasTopCut = !!torneo.topCut;
            container.innerHTML = [...rondas].reverse().map(r => `
                <div class="bg-white p-3 mb-4 rounded-3 border-0 shadow-sm">
                    <h5 class="fw-bold text-dark border-bottom pb-2 mb-3">Ronda ${r.numero}</h5>
                    ${r.mesas.map(m => {
                        if (m.bye) {
                            const p = torneo.jugadores?.find(j => j.id === m.bye);
                            return `<div class="match-card bye p-2 mb-1 d-flex justify-content-between align-items-center">
                                <span>${escapeHtml(p?.nombre || m.bye)}</span>
                                <span class="badge bg-secondary">BYE (+${PT_BYE} pts)</span>
                            </div>`;
                        }
                        const [p1, p2] = m.jugadores.map(id => torneo.jugadores?.find(j => j.id === id));
                        const r1 = m.resultados?.[m.jugadores[0]];
                        const r2 = m.resultados?.[m.jugadores[1]];
                        const win1 = r1?.wins || 0;
                        const win2 = r2?.wins || 0;
                        const tieneResultado = r1 && r2 && (win1 > 0 || win2 > 0 || m.empate);
                        // Bloquear edición si hay top cut, torneo finalizado, o ya existe ronda siguiente
                        const resultadosBloqueados = hasTopCut || torneo.estado === 'finalizado' || r.numero < maxRonda;
                        return `<div class="match-card p-2 mb-1 d-flex justify-content-between align-items-center">
                            <div>
                                <strong>${escapeHtml(p1?.nombre || m.jugadores[0])}</strong>
                                vs <strong>${escapeHtml(p2?.nombre || m.jugadores[1])}</strong>${tieneResultado ? ` <span class="badge bg-primary">${win1} - ${win2}</span>` : ''}
                            </div>
                            ${canManage && !resultadosBloqueados ? `<button class="btn btn-sm btn-outline-primary btn-resultados-modern" data-ronda="${r.numero}" data-mesa="${m.numero}"><i class="fa-solid fa-table-tennis"></i></button>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            `).join('');
        }

        // --- TOP CUT ---
        function getTopCutOptions(numJugadores) {
            const opts = [];
            let size = 4;
            while (size <= numJugadores && size <= 32) {
                if (size < numJugadores) opts.push(size);
                size *= 2;
            }
            return opts;
        }

        function renderTopCut(torneo) {
            const container = $id('topcut-container');
            if (!container) return;

            // League tournaments: no top cut
            if (torneo.ligaId) {
                container.innerHTML = '<p class="text-muted text-center py-3 mb-0">Los torneos de liga no usan top cut. La clasificación final se define por las rondas suizas.</p>';
                return;
            }

            const numJugadores = (torneo.jugadores || []).length;
            const topCut = torneo.topCut;
            if (!topCut) {
                if (numJugadores >= 4 && torneo.estado !== 'borrador') {
                    const opts = getTopCutOptions(numJugadores);
                    const optsHtml = opts.map(s => `<option value="${s}">Top ${s}</option>`).join('');
                    container.innerHTML = `<div class="text-center py-3">
                        <p class="text-muted">Top cut no generado.</p>
                        ${canManage ? `
                            <div class="d-flex justify-content-center gap-2 align-items-center flex-wrap">
                                <select id="select-topcut-size" class="form-select form-select-sm" style="width:auto;">${optsHtml}</select>
                                <button class="btn btn-sm btn-outline-primary" id="btn-generar-topcut-modern">Generar Top Cut</button>
                            </div>` : ''}
                    </div>`;
                } else {
                    container.innerHTML = '<p class="text-muted text-center py-3">El top cut estará disponible cuando el torneo esté en curso con 4+ jugadores.</p>';
                }
                return;
            }

            const numRondas = topCut.bracket?.length || 0;
            const labels = ['Final', 'Semifinales', 'Cuartos de Final'];

            // Check if we can advance to next round
            let canShowAvanzar = false;
            if (canManage && torneo.estado !== 'finalizado') {
                for (let bi = 0; bi < numRondas - 1; bi++) {
                    const allDone = topCut.bracket[bi].mesas.every(m => m.ganador || m.empate);
                    const nextHasPlayers = topCut.bracket[bi + 1].mesas.some(m => m.jugadores[0]);
                    if (allDone && !nextHasPlayers) {
                        canShowAvanzar = true;
                        break;
                    }
                }
            }

            container.innerHTML = `<div class="top-cut-header mb-3">Top ${topCut.topSize}</div>
                <div class="d-flex gap-3 overflow-auto">
                    ${(topCut.bracket || []).map((br, bi) => `
                        <div class="bracket-col">
                            <small class="text-muted d-block mb-2 fw-bold">${labels[numRondas - 1 - bi] || `Ronda ${bi + 1}`}</small>
                            ${br.mesas.map(m => {
                                const p1 = torneo.jugadores?.find(j => j.id === m.jugadores?.[0]);
                                const p2 = torneo.jugadores?.find(j => j.id === m.jugadores?.[1]);
                                const g1 = m.resultados?.[m.jugadores?.[0]]?.wins || 0;
                                const g2 = m.resultados?.[m.jugadores?.[1]]?.wins || 0;
                                const done = m.ganador;
                                return `<div class="bracket-match ${done ? 'border-success' : ''}">
                                    <div class="d-flex justify-content-between">${escapeHtml(p1?.nombre || '?')} ${done ? (m.ganador === m.jugadores?.[0] ? '✅' : '') : `<small class="text-muted">${g1}</small>`}</div>
                                    <div class="d-flex justify-content-between">${escapeHtml(p2?.nombre || '?')} ${done ? (m.ganador === m.jugadores?.[1] ? '✅' : '') : `<small class="text-muted">${g2}</small>`}</div>
                                    ${canManage && !done && torneo.estado !== 'finalizado' ? `<button class="btn btn-sm btn-outline-primary mt-1 btn-resultados-topcut-modern" data-ronda="${bi}" data-mesa="${m.numero}"><i class="fa-solid fa-table-tennis"></i></button>` : ''}
                                </div>`;
                            }).join('')}
                        </div>
                    `).join('')}
                </div>
                ${canShowAvanzar ? `<div class="text-center mt-3"><button class="btn btn-primary" id="btn-avanzar-topcut-modern"><i class="fa-solid fa-forward"></i> Avanzar a siguiente ronda</button></div>` : ''}`;
        }

        // --- MESA RESULTS MODAL (Bo3) ---
        function openMesaResultsModal(rondaNum, mesaNum, isTopCut = false) {
            if (!selectedTournament) return;
            const torneo = selectedTournament;
            let mesa, ronda;
            if (isTopCut) {
                const br = torneo.topCut?.bracket?.[rondaNum];
                if (!br) return;
                mesa = br.mesas.find(m => m.numero === mesaNum);
            } else {
                ronda = (torneo.rondas || []).find(r => r.numero === rondaNum);
                if (!ronda) return;
                mesa = ronda.mesas.find(m => m.numero === mesaNum);
            }
            if (!mesa || mesa.bye) return;

            $id('modal-res-modern-mesa').textContent = `${rondaNum}.${mesaNum}`;
            const body = $id('modal-resultados-modern-body');
            const [id1, id2] = mesa.jugadores;
            const p1 = torneo.jugadores?.find(j => j.id === id1);
            const p2 = torneo.jugadores?.find(j => j.id === id2);
            const r1 = mesa.resultados?.[id1] || { wins: 0, loss: 0 };
            const r2 = mesa.resultados?.[id2] || { wins: 0, loss: 0 };

            // Determinar resultado previo para preseleccionar
            const prevWins1 = r1.wins;
            const prevWins2 = r2.wins;
            let prevResult = '';
            if (mesa.empate) prevResult = 'draw';
            else if (prevWins1 > 0 || prevWins2 > 0) {
                if (prevWins1 === 1 && prevWins2 === 0) prevResult = 'p1_w1';
                else if (prevWins1 === 2 && prevWins2 === 0) prevResult = 'p1_w2';
                else if (prevWins1 === 2 && prevWins2 === 1) prevResult = 'p1_w21';
                else if (prevWins2 === 1 && prevWins1 === 0) prevResult = 'p2_w1';
                else if (prevWins2 === 2 && prevWins1 === 0) prevResult = 'p2_w2';
                else if (prevWins2 === 2 && prevWins1 === 1) prevResult = 'p2_w21';
            }

            const n1 = escapeHtml(p1?.nombre || id1);
            const n2 = escapeHtml(p2?.nombre || id2);

            body.innerHTML = `
                <input type="hidden" id="res-modern-ronda" value="${rondaNum}">
                <input type="hidden" id="res-modern-mesa" value="${mesaNum}">
                <input type="hidden" id="res-modern-topcut" value="${isTopCut ? '1' : '0'}">

                <div class="text-center mb-3">
                    <label class="fw-bold d-block mb-2">${n1}</label>
                    <div class="btn-group" role="group">
                        <input type="radio" class="btn-check" name="res-modern-result" id="res-p1_2-0" value="p1_w2" autocomplete="off" ${prevResult === 'p1_w2' ? 'checked' : ''}>
                        <label class="btn btn-outline-success btn-sm" for="res-p1_2-0" title="Gana 2-0">2-0</label>
                        <input type="radio" class="btn-check" name="res-modern-result" id="res-p1_2-1" value="p1_w21" autocomplete="off" ${prevResult === 'p1_w21' ? 'checked' : ''}>
                        <label class="btn btn-outline-success btn-sm" for="res-p1_2-1" title="Gana 2-1">2-1</label>
                        <input type="radio" class="btn-check" name="res-modern-result" id="res-p1_1-0" value="p1_w1" autocomplete="off" ${prevResult === 'p1_w1' ? 'checked' : ''}>
                        <label class="btn btn-outline-success btn-sm" for="res-p1_1-0" title="Gana 1-0 (tiempo)">1-0</label>
                    </div>
                </div>

                <div class="text-center mb-3">
                    <div class="btn-group" role="group">
                        <input type="radio" class="btn-check" name="res-modern-result" id="res-draw" value="draw" autocomplete="off" ${prevResult === 'draw' ? 'checked' : ''}>
                        <label class="btn btn-outline-warning btn-sm" for="res-draw" title="Empate 1-1">Empate 1-1</label>
                    </div>
                </div>

                <div class="text-center mb-3">
                    <label class="fw-bold d-block mb-2">${n2}</label>
                    <div class="btn-group" role="group">
                        <input type="radio" class="btn-check" name="res-modern-result" id="res-p2_1-0" value="p2_w1" autocomplete="off" ${prevResult === 'p2_w1' ? 'checked' : ''}>
                        <label class="btn btn-outline-success btn-sm" for="res-p2_1-0" title="Gana 1-0 (tiempo)">1-0</label>
                        <input type="radio" class="btn-check" name="res-modern-result" id="res-p2_2-1" value="p2_w21" autocomplete="off" ${prevResult === 'p2_w21' ? 'checked' : ''}>
                        <label class="btn btn-outline-success btn-sm" for="res-p2_2-1" title="Gana 2-1">2-1</label>
                        <input type="radio" class="btn-check" name="res-modern-result" id="res-p2_2-0" value="p2_w2" autocomplete="off" ${prevResult === 'p2_w2' ? 'checked' : ''}>
                        <label class="btn btn-outline-success btn-sm" for="res-p2_2-0" title="Gana 2-0">2-0</label>
                    </div>
                </div>

                <small class="text-muted d-block text-center">Ganar da 3 pts, empatar da 1 pt. Perder 2-1 es mejor desempate que 2-0.</small>
            `;
            const modal = new bootstrap.Modal($id('modal-resultados-modern'));
            modal.show();
        }

        function parseResultadoModern(resultValue) {
            // Retorna { wins1, loss1, wins2, loss2, empate, ganador }
            if (resultValue === 'draw') return { wins1: 1, loss1: 1, wins2: 1, loss2: 1, empate: true, ganador: null };
            const [side, record] = resultValue.split('_'); // side: 'p1' or 'p2', record: 'w2','w21','w1'
            if (side === 'p1') {
                if (record === 'w2') return { wins1: 2, loss1: 0, wins2: 0, loss2: 2, empate: false, ganador: true };
                if (record === 'w21') return { wins1: 2, loss1: 1, wins2: 1, loss2: 2, empate: false, ganador: true };
                if (record === 'w1') return { wins1: 1, loss1: 0, wins2: 0, loss2: 1, empate: false, ganador: true };
            } else {
                if (record === 'w2') return { wins1: 0, loss1: 2, wins2: 2, loss2: 0, empate: false, ganador: false };
                if (record === 'w21') return { wins1: 1, loss1: 2, wins2: 2, loss2: 1, empate: false, ganador: false };
                if (record === 'w1') return { wins1: 0, loss1: 1, wins2: 1, loss2: 0, empate: false, ganador: false };
            }
            return null;
        }

        async function handleResultadosSubmit(e) {
            e.preventDefault();
            if (!selectedTournament) return;
            const rondaNum = parseInt($id('res-modern-ronda').value);
            const mesaNum = parseInt($id('res-modern-mesa').value);
            const isTopCut = $id('res-modern-topcut').value === '1';

            const selectedResult = document.querySelector('input[name="res-modern-result"]:checked')?.value;
            if (!selectedResult) { showAlert('Selecciona un resultado.', 'warning'); return; }

            const parsed = parseResultadoModern(selectedResult);
            if (!parsed) { showAlert('Resultado no válido.', 'danger'); return; }

            const { wins1, loss1, wins2, loss2, empate, ganador } = parsed;
            const torneo = selectedTournament;
            const torneoRef = db.collection('torneos').doc(torneo.id);

            try {
                await db.runTransaction(async t => {
                    const doc = await t.get(torneoRef);
                    if (!doc.exists) throw new Error('Torneo no encontrado');
                    const data = doc.data();

                    if (isTopCut) {
                        const bracket = data.topCut?.bracket || [];
                        const br = bracket[rondaNum];
                        if (!br) throw new Error('Ronda de top cut no encontrada');
                        const me = br.mesas.find(m => m.numero === mesaNum);
                        if (!me) throw new Error('Mesa no encontrada');
                        me.resultados = {};
                        me.resultados[me.jugadores[0]] = { wins: wins1, loss: loss1 };
                        me.resultados[me.jugadores[1]] = { wins: wins2, loss: loss2 };
                        me.empate = empate;
                        me.ganador = empate ? null : (ganador ? me.jugadores[0] : me.jugadores[1]);
                        t.update(torneoRef, { topCut: data.topCut });
                    } else {
                        const rondas = data.rondas || [];
                        const r = rondas.find(x => x.numero === rondaNum);
                        if (!r) throw new Error('Ronda no encontrada');
                        const m = r.mesas.find(x => x.numero === mesaNum);
                        if (!m) throw new Error('Mesa no encontrada');
                        m.resultados = {};
                        m.resultados[m.jugadores[0]] = { wins: wins1, loss: loss1 };
                        m.resultados[m.jugadores[1]] = { wins: wins2, loss: loss2 };
                        m.empate = empate;
                        m.ganador = empate ? null : (ganador ? m.jugadores[0] : m.jugadores[1]);
                        t.update(torneoRef, { rondas });
                    }
                });

                bootstrap.Modal.getInstance($id('modal-resultados-modern'))?.hide();
                await loadInitialData();
                const updated = torneosCache.find(t => t.id === torneo.id);
                if (updated) { selectedTournament = updated; openTournamentManagement(updated.id); }
                showAlert('Resultados guardados.', 'success');
            } catch (e) {
                showAlert('Error: ' + e.message, 'danger');
            }
        }

        // --- PLAYER MANAGEMENT ---
        function openJugadoresModal(torneoId) {
            const torneo = torneosCache.find(t => t.id === torneoId);
            if (!torneo) return;
            selectedTournament = torneo;
            tempJugadores = torneo.jugadores ? [...torneo.jugadores] : [];
            updateImportarInscritosButton();
            renderTempJugadoresList();
            loadJugadoresPrevios().catch(e => console.error(e));
            const fActuales = document.getElementById('filter-jugadores-actuales-modern');
            if (fActuales) fActuales.value = '';
            const fPrevios = document.getElementById('filter-jugadores-previos-modern');
            if (fPrevios) fPrevios.value = '';
            const modal = new bootstrap.Modal($id('modal-jugadores-modern'));
            modal.show();
        }

        function renderTempJugadoresList() {
            const ul = $id('lista-jugadores-modern');
            if (!ul) return;
            const filterInput = document.getElementById('filter-jugadores-actuales-modern');
            const term = filterInput ? filterInput.value.trim().toLowerCase() : '';
            const filtered = term ? tempJugadores.filter(j => j.nombre.toLowerCase().includes(term)) : tempJugadores;
            $id('count-jugadores-modern').textContent = tempJugadores.length;
            ul.innerHTML = filtered.map((j, i) => {
                const isGuest = j.id.startsWith('invitado_') || j.id.startsWith('temp_');
                const codigoHtml = isGuest && j.leagueCode ? `<span class="badge bg-dark ms-2">Cod: ${j.leagueCode}</span>` : '';
                return `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${escapeHtml(j.nombre)} ${isGuest ? '<span class="badge bg-secondary">Invitado</span>' : '<span class="badge bg-primary">Registrado</span>'} ${codigoHtml}</span>
                    <button class="btn btn-sm btn-outline-danger btn-quitar-jugador-modern" data-id="${j.id}"><i class="fa-solid fa-times"></i></button>
                </li>`;
            }).join('');
        }

        function handleAgregarUsuario() {
            const input = $id('input-buscar-usuario-modern');
            const val = input?.value.trim();
            if (!val) return;
            const user = usuariosCache.find(u => u.id === val || u.correo === val || `${u.nombre} ${u.apellidos || ''}`.trim().toLowerCase() === val.toLowerCase());
            if (!user) { showAlert('Usuario no encontrado. Usa el email o selecciónalo de la lista.', 'warning'); return; }
            if (tempJugadores.some(j => j.id === user.id)) { showAlert('Ya está en la lista.', 'warning'); return; }
            tempJugadores.push({ id: user.id, nombre: `${user.nombre} ${user.apellidos || ''}`.trim() });
            input.value = '';
            renderTempJugadoresList();
        }

        function handleAgregarInvitado() {
            const nombre = $id('input-nombre-invitado-modern')?.value.trim();
            if (!nombre) { showAlert('Introduce un nombre.', 'warning'); return; }
            const esLiga = selectedTournament && selectedTournament.ligaId;
            if (!esLiga) {
                // Standalone tournament: no league code needed
                const idTemp = `temp_${genId()}`;
                if (tempJugadores.some(j => j.id === idTemp)) { showAlert('Ya existe.', 'warning'); return; }
                tempJugadores.push({ id: idTemp, nombre });
                $id('input-nombre-invitado-modern').value = '';
                renderTempJugadoresList();
                return;
            }
            let codigo = $id('input-codigo-invitado-modern')?.value.trim().toUpperCase();
            if (!codigo) codigo = generateLeagueCode();
            const id = `invitado_${codigo}`;
            if (tempJugadores.some(j => j.id === id)) { showAlert('Ya existe.', 'warning'); return; }
            tempJugadores.push({ id, nombre, leagueCode: codigo });
            $id('input-nombre-invitado-modern').value = '';
            $id('input-codigo-invitado-modern').value = '';
            renderTempJugadoresList();
        }

        function handleRemoveJugadorTemp(id) {
            tempJugadores = tempJugadores.filter(j => j.id !== id);
            renderTempJugadoresList();
        }

        function updateImportarInscritosButton() {
            const btn = document.getElementById('btn-importar-inscritos-modern');
            if (btn) {
                btn.style.display = selectedTournament && selectedTournament.subeventoId ? 'block' : 'none';
            }
        }

        // --- PREVIOUS PLAYERS ---
        async function loadJugadoresPrevios() {
            _jugadoresPrevios = [];
            _previosPage = 1;
            if (!selectedTournament || !selectedTournament.ligaId) {
                renderJugadoresPrevios();
                return;
            }
            let mergedMap = {};
            try {
                const ligaDoc = await db.collection('ligas').doc(selectedTournament.ligaId).get();
                if (ligaDoc.exists) {
                    const clasificacion = ligaDoc.data().clasificacion || {};
                    for (const [key, entry] of Object.entries(clasificacion)) {
                        if (key.startsWith('invitado_') && entry.userId) {
                            mergedMap[key] = entry.userId;
                        }
                    }
                }
            } catch (e) {
                console.warn('No se pudo cargar la clasificación de la liga:', e);
            }
            const torneosLiga = torneosCache.filter(t =>
                t.ligaId === selectedTournament.ligaId &&
                t.id !== selectedTournament.id &&
                t.jugadores && t.jugadores.length > 0
            );
            const seen = new Set();
            torneosLiga.forEach(t => {
                (t.jugadores || []).forEach(j => {
                    if (tempJugadores.some(tj => tj.id === j.id)) return;
                    if (j.id.startsWith('invitado_') && mergedMap[j.id]) {
                        const userId = mergedMap[j.id];
                        if (!seen.has(userId)) {
                            seen.add(userId);
                            const user = usuariosCache.find(u => u.id === userId);
                            if (user) {
                                _jugadoresPrevios.push({
                                    id: userId,
                                    nombre: `${user.nombre || ''} ${user.apellidos || ''}`.trim() || user.correo,
                                    leagueCode: j.id.split('_')[1]
                                });
                            } else {
                                seen.add(j.id);
                                _jugadoresPrevios.push({ ...j });
                            }
                        }
                        return;
                    }
                    if (!seen.has(j.id)) {
                        seen.add(j.id);
                        _jugadoresPrevios.push({ ...j });
                    }
                });
            });
            renderJugadoresPrevios();
        }

        function renderJugadoresPrevios() {
            const tbody = document.getElementById('lista-jugadores-previos-modern');
            const paginationNav = document.getElementById('pagination-jugadores-previos-modern');
            const filterInput = document.getElementById('filter-jugadores-previos-modern');
            if (!tbody) return;
            const term = filterInput ? filterInput.value.trim().toLowerCase() : '';
            const filtered = term
                ? _jugadoresPrevios.filter(j => j.nombre.toLowerCase().includes(term))
                : _jugadoresPrevios;
            const totalPages = Math.ceil(filtered.length / PREVIOS_PER_PAGE) || 1;
            if (_previosPage > totalPages) _previosPage = totalPages;
            const start = (_previosPage - 1) * PREVIOS_PER_PAGE;
            const page = filtered.slice(start, start + PREVIOS_PER_PAGE);
            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">${term ? 'No hay coincidencias.' : 'No hay jugadores de jornadas anteriores.'}</td></tr>`;
                if (paginationNav) paginationNav.innerHTML = '';
                return;
            }
            tbody.innerHTML = page.map((j, i) => {
                const code = j.id.startsWith('invitado_') ? j.id.split('_')[1] : (j.leagueCode || '—');
                const badge = j.id.startsWith('invitado_')
                    ? '<span class="badge bg-secondary">Invitado</span>'
                    : '<span class="badge bg-primary">Registrado</span>';
                return `<tr>
                    <td>${start + i + 1}</td>
                    <td>${escapeHtml(j.nombre)} ${badge}</td>
                    <td><code>${code}</code></td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-success btn-add-previo" data-id="${j.id}" data-nombre="${j.nombre.replace(/"/g, '&quot;')}" data-leaguecode="${j.leagueCode || ''}">
                            <i class="fa-solid fa-plus"></i> Añadir
                        </button>
                    </td>
                </tr>`;
            }).join('');
            if (paginationNav) {
                if (totalPages <= 1) {
                    paginationNav.innerHTML = '';
                } else {
                    let html = '<ul class="pagination pagination-sm justify-content-center mb-0">';
                    html += `<li class="page-item ${_previosPage === 1 ? 'disabled' : ''}"><button class="page-link" data-page-prev="${_previosPage - 1}">&laquo;</button></li>`;
                    for (let i = 1; i <= totalPages; i++) {
                        html += `<li class="page-item ${i === _previosPage ? 'active' : ''}"><button class="page-link" data-page-prev="${i}">${i}</button></li>`;
                    }
                    html += `<li class="page-item ${_previosPage === totalPages ? 'disabled' : ''}"><button class="page-link" data-page-prev="${_previosPage + 1}">&raquo;</button></li>`;
                    html += '</ul>';
                    paginationNav.innerHTML = html;
                }
            }
        }

        function addJugadorPrevio(id, nombre, leagueCode) {
            if (tempJugadores.some(j => j.id === id)) {
                if (window.showAlert) window.showAlert('Este jugador ya está en la lista.', 'warning');
                return;
            }
            tempJugadores.push({ id, nombre, leagueCode: leagueCode || null });
            renderTempJugadoresList();
            _jugadoresPrevios = _jugadoresPrevios.filter(j => j.id !== id);
            renderJugadoresPrevios();
        }

        async function handleImportarInscritosJornada() {
            if (!selectedTournament || !selectedTournament.subeventoId) {
                if (window.showAlert) window.showAlert('Este torneo no tiene una actividad asociada.', 'warning');
                return;
            }
            try {
                const snapshot = await db.collection('subeventos')
                    .doc(selectedTournament.subeventoId)
                    .collection('inscripciones')
                    .where('pagado', '==', true)
                    .get();
                const inscritos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if (!inscritos.length) {
                    if (window.showAlert) window.showAlert('No hay inscritos pagados en la actividad asociada.', 'info');
                    return;
                }
                let addedCount = 0;
                const ligaAsociada = selectedTournament.ligaId ? ligasCache.find(l => l.id === selectedTournament.ligaId) : null;
                inscritos.forEach(inscripcion => {
                    const playerIdToCheck = inscripcion.userId || (inscripcion.leagueCode ? `invitado_${inscripcion.leagueCode}` : null);
                    if (playerIdToCheck && tempJugadores.some(j => j.id === playerIdToCheck)) return;
                    if (inscripcion.userId) {
                        tempJugadores.push({ id: inscripcion.userId, nombre: inscripcion.nombreCompleto || 'Sin nombre' });
                        addedCount++;
                    } else {
                        const email = inscripcion.correo ? inscripcion.correo.toLowerCase() : '';
                        let existingCode = inscripcion.leagueCode || '';
                        if (!existingCode && ligaAsociada && ligaAsociada.clasificacion) {
                            const found = Object.entries(ligaAsociada.clasificacion).find(([id, data]) => (data.email || '').toLowerCase() === email);
                            if (found) existingCode = found[0].replace('invitado_', '');
                        }
                        if (ligaAsociada) {
                            if (!existingCode) existingCode = generateLeagueCode();
                            tempJugadores.push({
                                id: `invitado_${existingCode}`,
                                nombre: inscripcion.nombreCompleto || 'Invitado',
                                leagueCode: existingCode,
                            });
                        } else {
                            tempJugadores.push({
                                id: `temp_${Date.now()}_${addedCount}`,
                                nombre: inscripcion.nombreCompleto || 'Invitado',
                            });
                        }
                        addedCount++;
                    }
                });
                renderTempJugadoresList();
                if (window.showAlert) {
                    const msg = addedCount
                        ? `${addedCount} jugador(es) importado(s) desde la actividad.`
                        : 'Los inscritos de la actividad ya estaban en el torneo.';
                    window.showAlert(msg, addedCount ? 'success' : 'info');
                }
            } catch (error) {
                console.error('Error importando inscritos:', error);
                if (window.showAlert) window.showAlert('No se pudieron importar los inscritos de la actividad.', 'danger');
            }
        }

        async function handleConfirmJugadores() {
            if (!selectedTournament) return;
            try {
                await db.collection('torneos').doc(selectedTournament.id).update({ jugadores: tempJugadores });
                await loadInitialData();
                const updated = torneosCache.find(t => t.id === selectedTournament.id);
                if (updated) { selectedTournament = updated; openTournamentManagement(updated.id); }
                bootstrap.Modal.getInstance($id('modal-jugadores-modern'))?.hide();
                showAlert('Jugadores actualizados.', 'success');
            } catch (e) {
                showAlert('Error: ' + e.message, 'danger');
            }
        }

        // --- TOURNAMENT CRUD ---
        function openTournamentModal(torneoId = null) {
            $id('form-torneo-modern').reset();
            $id('torneo-modern-id').value = '';
            $id('modal-torneo-modern-title').textContent = 'Crear Torneo Modern';
            $id('liga-bloque-modern').style.display = 'none';
            $id('independiente-bloque-modern').style.display = 'block';
            $id('torneo-modern-es-liga').checked = false;

            if (torneoId) {
                const t = torneosCache.find(x => x.id === torneoId);
                if (t) {
                    $id('modal-torneo-modern-title').textContent = 'Editar Torneo Modern';
                    $id('torneo-modern-id').value = t.id;
                    $id('torneo-modern-nombre').value = t.nombre || '';
                    $id('torneo-modern-fecha').value = (t.fecha && t.hora) ? `${t.fecha}T${t.hora}` : (t.fecha || '');
                    $id('torneo-modern-es-liga').checked = t.esJornadaLiga || false;
                    $id('liga-bloque-modern').style.display = t.esJornadaLiga ? 'block' : 'none';
                    $id('independiente-bloque-modern').style.display = t.esJornadaLiga ? 'none' : 'block';
                    if (t.esJornadaLiga) {
                        $id('select-torneo-liga-modern').value = t.ligaId || '';
                        handleTorneoLigaChange(t.ligaId);
                    } else {
                        $id('select-torneo-evento-modern').value = t.eventoId || '';
                        handleEventoChange(t.eventoId);
                    }
                    setTimeout(() => { $id('select-torneo-subevento-modern').value = t.subeventoId || ''; }, 300);
                }
            }
            new bootstrap.Modal($id('modal-torneo-modern')).show();
        }

        async function handleTorneoFormSubmit(e) {
            e.preventDefault();
            const id = $id('torneo-modern-id').value;
            const dt = $id('torneo-modern-fecha').value;
            const [fecha, hora] = dt ? dt.split('T') : ['', ''];
            const esLiga = $id('torneo-modern-es-liga').checked;
            let finalEventoId = null;
            let finalLigaId = null;
            if (esLiga) {
                finalLigaId = $id('select-torneo-liga-modern').value || null;
                const ligaObj = ligasCache.find(l => l.id === finalLigaId);
                finalEventoId = ligaObj ? ligaObj.eventoId : null;
            } else {
                finalEventoId = $id('select-torneo-evento-modern').value || null;
            }
            const baseData = {
                nombre: $id('torneo-modern-nombre').value.trim(),
                fecha: fecha,
                hora: hora || '',
                juego: JUEGO,
                esJornadaLiga: esLiga,
                ligaId: finalLigaId,
                eventoId: finalEventoId,
                subeventoId: $id('select-torneo-subevento-modern').value || null,
            };
            if (!baseData.nombre || !baseData.fecha) { showAlert('Nombre y fecha obligatorios.', 'warning'); return; }

            try {
                if (id) {
                    await db.collection('torneos').doc(id).update(baseData);
                    if (window.auditar) window.auditar('torneos', 'editar', 'Torneo editado en Modern');
                    showAlert('Torneo actualizado.', 'success');
                } else {
                    const data = { ...baseData, estado: 'borrador', jugadores: [], rondas: [] };
                    await db.collection('torneos').add(data);
                    if (window.auditar) window.auditar('torneos', 'crear', 'Torneo creado en Modern');
                    showAlert('Torneo creado.', 'success');
                }
                bootstrap.Modal.getInstance($id('modal-torneo-modern'))?.hide();
                await loadInitialData();
            } catch (e) {
                showAlert('Error: ' + e.message, 'danger');
            }
        }

        async function handleIniciarTorneo(torneoId) {
            const torneo = torneosCache.find(t => t.id === torneoId);
            if (!torneo) return;
            if (!torneo.jugadores || torneo.jugadores.length < 2) {
                showAlert('Necesitas agregar al menos 2 jugadores antes de iniciar el torneo.', 'warning');
                return;
            }
            try {
                await db.collection('torneos').doc(torneoId).update({ estado: 'en_curso' });
                if (window.auditar) window.auditar('torneos', 'iniciar', 'Torneo iniciado en Modern');
                await loadInitialData();
                showAlert('Torneo iniciado.', 'success');
                if (selectedTournament?.id === torneoId) openTournamentManagement(torneoId);
            } catch (e) { showAlert('Error: ' + e.message, 'danger'); }
        }

        async function handleEliminarTorneo(torneoId) {
            if (!confirm('¿Eliminar este torneo? Esta acción no se puede deshacer.')) return;
            try {
                const torneo = torneosCache.find(t => t.id === torneoId);
                if (torneo.estado === 'finalizado' && torneo.ligaId && torneo.posiciones) {
                    await db.runTransaction(async t => {
                        const ligaRef = db.collection('ligas').doc(torneo.ligaId);
                        const ligaDoc = await t.get(ligaRef);
                        if (ligaDoc.exists) {
                            const clasif = { ...(ligaDoc.data().clasificacion || {}) };
                            torneo.posiciones.forEach(pos => {
                                const key = pos.id;
                                if (clasif[key]) {
                                    clasif[key].puntos = (clasif[key].puntos || 0) - (pos.puntos || 0);
                                    if (clasif[key].puntos <= 0) delete clasif[key];
                                }
                            });
                            t.update(ligaRef, { clasificacion: clasif });
                        }
                    });
                }
                await db.collection('torneos').doc(torneoId).delete();
                if (window.auditar) window.auditar('torneos', 'eliminar', 'Torneo eliminado de Modern');
                await loadInitialData();
                showAlert('Torneo eliminado.', 'success');
            } catch (e) { showAlert('Error: ' + e.message, 'danger'); }
        }

        // --- FINALIZATION ---
        async function handleFinalizarTorneo() {
            if (!selectedTournament) return;
            const torneo = selectedTournament;

            // Standalone tournament with incomplete top cut cannot be finalized
            if (!torneo.ligaId && torneo.topCut) {
                const bracket = torneo.topCut.bracket || [];
                const allDone = bracket.every(br => br.mesas.every(m => m.ganador || m.empate));
                if (!allDone) {
                    showAlert('El top cut no está completo. Debes terminarlo o deshacerlo antes de finalizar.', 'warning');
                    return;
                }
            }

            const standings = calculateStandings(torneo);
            const posiciones = standings.map((s, i) => ({ id: s.id, nombre: s.nombre, puntos: s.puntos, posicion: i + 1 }));

            try {
                await db.runTransaction(async t => {
                    const torneoRef = db.collection('torneos').doc(torneo.id);
                    const doc = await t.get(torneoRef);
                    if (!doc.exists) throw new Error('Torneo no encontrado');

                    const update = { estado: 'finalizado', posiciones };

                    if (torneo.ligaId) {
                        const ligaRef = db.collection('ligas').doc(torneo.ligaId);
                        const ligaDoc = await t.get(ligaRef);
                        if (ligaDoc.exists) {
                            const clasif = { ...(ligaDoc.data().clasificacion || {}) };
                            posiciones.forEach(pos => {
                                const key = pos.id;
                                if (clasif[key]) {
                                    clasif[key].puntos = (clasif[key].puntos || 0) + pos.puntos;
                                } else {
                                    clasif[key] = { nombre: pos.nombre, puntos: pos.puntos };
                                }
                            });
                            t.update(ligaRef, { clasificacion: clasif });
                        }
                    }
                    t.update(torneoRef, update);
                });

                if (window.auditar) window.auditar('torneos', 'finalizar', 'Torneo finalizado en Modern');
                await loadInitialData();
                const updated = torneosCache.find(t => t.id === torneo.id);
                if (updated) { selectedTournament = updated; openTournamentManagement(updated.id); }
                showAlert('Torneo finalizado.', 'success');
            } catch (e) {
                showAlert('Error: ' + e.message, 'danger');
            }
        }

        // --- LIGA ---
        function renderLigaSelectors() {
            const selects = ['filter-liga-modern', 'select-liga-modern', 'select-torneo-liga-modern'];
            selects.forEach(sid => {
                const sel = $id(sid);
                if (!sel) return;
                const current = sel.value;
                sel.innerHTML = `<option value="">-- ${sid.includes('filter') ? 'Todas las ligas' : 'Selecciona una liga'} --</option>`
                    + ligasCache.map(l => `<option value="${l.id}">${escapeHtml(l.nombre)}</option>`).join('');
                sel.value = current;
            });
            updateEliminarLigaButton();
        }

        function renderEventSelector() {
            ['select-torneo-evento-modern', 'liga-modern-evento'].forEach(sid => {
                const sel = $id(sid);
                if (sel) sel.innerHTML = '<option value="">-- Selecciona un evento --</option>'
                    + eventosCache.map(e => `<option value="${e.id}">${escapeHtml(e.titulo)}</option>`).join('');
            });
        }

        function renderLigaClasificacion(ligaId) {
            const tbody = $id('tabla-clasificacion-liga-modern');
            if (!tbody) return;
            if (!ligaId) ligaId = $id('select-liga-modern')?.value || '';
            if (!ligaId) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Selecciona una liga</td></tr>';
                return;
            }
            const liga = ligasCache.find(l => l.id === ligaId);
            if (!liga || !liga.clasificacion || Object.keys(liga.clasificacion).length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Sin jugadores</td></tr>';
                return;
            }
            const arr = Object.entries(liga.clasificacion).map(([k, v]) => ({ id: k, ...v })).sort((a, b) => (b.puntos || 0) - (a.puntos || 0));
            tbody.innerHTML = arr.map((r, i) => `
                <tr><td class="fw-bold">${i + 1}</td>
                    <td>${escapeHtml(r.nombre)}${r.mergedFromGuest ? ' <i class="fas fa-user-check text-success ms-1"></i>' : ''}</td>
                    <td class="text-center">${r.id.startsWith('invitado_') ? `<span class="badge bg-${r.mergedFromGuest ? 'primary' : 'secondary'}">${r.id.split('_')[1]}</span>` : `<span class="badge bg-primary">Socio</span>`}</td>
                    <td class="text-center fw-bold">${r.puntos || 0}</td>
                </tr>
            `).join('');
        }

        async function handleLigaFormSubmit(e) {
            e.preventDefault();
            const data = {
                nombre: $id('liga-modern-nombre').value.trim(),
                eventoId: $id('liga-modern-evento').value,
                juego: JUEGO,
                activa: true,
                creado: firebase.firestore.FieldValue.serverTimestamp(),
                clasificacion: {},
            };
            if (!data.nombre || !data.eventoId) { showAlert('Nombre y evento obligatorios.', 'warning'); return; }
            try {
                await db.collection('ligas').add(data);
                bootstrap.Modal.getInstance($id('modal-liga-modern'))?.hide();
                await loadInitialData();
                showAlert('Liga creada.', 'success');
            } catch (e) { showAlert('Error: ' + e.message, 'danger'); }
        }

        function updateEliminarLigaButton() {
            const btn = $id('btn-eliminar-liga-modern');
            const sel = $id('select-liga-modern');
            if (btn && sel) btn.disabled = !sel.value;
        }

        async function handleEliminarLiga() {
            const id = $id('select-liga-modern')?.value;
            const liga = ligasCache.find(l => l.id === id);
            if (!id || !liga) return;
            const torneosAsociados = torneosCache.filter(t => t.ligaId === id);
            const detalle = torneosAsociados.length === 1
                ? '1 torneo asociado'
                : `${torneosAsociados.length} torneos asociados`;
            if (!confirm(`Eliminar la liga "${liga.nombre}" y sus ${detalle}? Esta acción no se puede deshacer.`)) return;
            try {
                const batch = db.batch();
                torneosAsociados.forEach(t => batch.delete(db.collection('torneos').doc(t.id)));
                batch.delete(db.collection('ligas').doc(id));
                await batch.commit();
                await loadInitialData();
                showAlert('Liga y torneos asociados eliminados.', 'success');
            } catch (e) { showAlert('Error: ' + e.message, 'danger'); }
        }

        function populateDatalist() {
            const dl = $id('datalist-usuarios-modern');
            if (!dl) return;
            dl.innerHTML = usuariosCache.map(u => `<option value="${escapeHtml(u.nombre)} ${escapeHtml(u.apellidos || '')}">`).join('');
        }

        // --- TOP CUT GENERATION ---
        async function handleGenerateTopCut() {
            if (!selectedTournament || selectedTournament.estado === 'borrador') return;
            const torneo = selectedTournament;
            const sel = $id('select-topcut-size');
            const topSize = sel ? parseInt(sel.value) : 0;
            if (!topSize || topSize < 4) { showAlert('Selecciona un tamaño de top cut válido.', 'warning'); return; }
            const num = (torneo.jugadores || []).length;
            if (topSize >= num) { showAlert(`El top cut debe ser menor a ${num} jugadores.`, 'warning'); return; }

            const standings = calculateStandings(torneo);
            const top = standings.slice(0, topSize);
            // Seeds: 1 vs N, 2 vs N-1, etc.
            const mesas = [];
            for (let i = 0; i < topSize / 2; i++) {
                mesas.push({
                    numero: i + 1,
                    jugadores: [top[i].id, top[topSize - 1 - i].id],
                    resultados: {},
                    empate: false,
                    ganador: null,
                });
            }
            const bracket = [{ mesas }];
            // Subsequent rounds
            let remaining = topSize / 2;
            while (remaining > 1) {
                const nextMesas = [];
                for (let i = 0; i < remaining / 2; i++) {
                    nextMesas.push({
                        numero: i + 1,
                        jugadores: [],
                        resultados: {},
                        empate: false,
                        ganador: null,
                    });
                }
                bracket.push({ mesas: nextMesas });
                remaining /= 2;
            }

            try {
                await db.collection('torneos').doc(torneo.id).update({ topCut: { topSize, bracket } });
                await loadInitialData();
                const updated = torneosCache.find(t => t.id === torneo.id);
                if (updated) { selectedTournament = updated; openTournamentManagement(updated.id); }
                showAlert(`Top ${topSize} generado.`, 'success');
            } catch (e) { showAlert('Error: ' + e.message, 'danger'); }
        }

        // --- ADVANCE TOP CUT ---
        async function handleAvanzarTopCut() {
            if (!selectedTournament || !selectedTournament.topCut) return;
            const torneo = selectedTournament;
            const bracket = torneo.topCut.bracket;
            if (!bracket || bracket.length < 2) { showAlert('No hay siguiente ronda.', 'warning'); return; }

            // Find first round with all matches done and next round not yet populated
            let fromRound = -1;
            for (let bi = 0; bi < bracket.length - 1; bi++) {
                const allDone = bracket[bi].mesas.every(m => m.ganador || m.empate);
                const nextHasPlayers = bracket[bi + 1].mesas.some(m => m.jugadores[0]);
                if (allDone && !nextHasPlayers) {
                    fromRound = bi;
                    break;
                }
            }
            if (fromRound === -1) { showAlert('Completa todos los resultados de la ronda actual primero.', 'warning'); return; }

            const fromMesas = bracket[fromRound].mesas;
            const toMesas = bracket[fromRound + 1].mesas;
            for (let mi = 0; mi < fromMesas.length; mi++) {
                const winner = fromMesas[mi].ganador;
                if (!winner) continue;
                const targetMesa = Math.floor(mi / 2);
                const targetSlot = mi % 2;
                toMesas[targetMesa].jugadores[targetSlot] = winner;
            }

            try {
                await db.collection('torneos').doc(torneo.id).update({ topCut: torneo.topCut });
                await loadInitialData();
                const updated = torneosCache.find(t => t.id === torneo.id);
                if (updated) { selectedTournament = updated; openTournamentManagement(updated.id); }
                showAlert('Siguiente ronda del top cut generada.', 'success');
            } catch (e) { showAlert('Error: ' + e.message, 'danger'); }
        }

        // --- EVENT LISTENERS ---
        function setupEventListeners() {
            // Filter changes
            $id('filter-liga-modern')?.addEventListener('change', (e) => renderTournamentsList(e.target.value));
            $id('filter-show-finalized-modern')?.addEventListener('change', () => renderTournamentsList($id('filter-liga-modern')?.value));

            // Liga selector
            $id('select-liga-modern')?.addEventListener('change', (e) => {
                renderLigaClasificacion(e.target.value);
                updateEliminarLigaButton();
            });

            // Es liga toggle
            $id('torneo-modern-es-liga')?.addEventListener('change', (e) => {
                const isLiga = e.target.checked;
                $id('liga-bloque-modern').style.display = isLiga ? 'block' : 'none';
                $id('independiente-bloque-modern').style.display = isLiga ? 'none' : 'block';
                if (isLiga) {
                    $id('select-torneo-evento-modern').value = '';
                    handleTorneoLigaChange($id('select-torneo-liga-modern').value);
                } else {
                    $id('select-torneo-liga-modern').value = '';
                    handleEventoChange($id('select-torneo-evento-modern').value);
                }
            });

            // Liga change populates subeventos via the liga's linked evento
            $id('select-torneo-liga-modern')?.addEventListener('change', (e) => {
                handleTorneoLigaChange(e.target.value);
            });

            // Evento change for subevento cascade
            $id('select-torneo-evento-modern')?.addEventListener('change', (e) => handleEventoChange(e.target.value));

            // Buttons
            $id('btn-nuevo-torneo-modern')?.addEventListener('click', () => openTournamentModal());
            $id('btn-volver-lista-modern')?.addEventListener('click', () => {
                selectedTournament = null;
                $id('gestion-torneo-modern-container').style.display = 'none';
                $id('lista-torneos-modern-container').style.display = 'block';
                renderTournamentsList($id('filter-liga-modern')?.value);
            });
            $id('btn-generar-ronda-modern')?.addEventListener('click', handleGenerateRound);
            $id('btn-deshacer-ronda-modern')?.addEventListener('click', handleUndoRound);
            $id('btn-deshacer-topcut-modern')?.addEventListener('click', handleUndoTopCut);
            $id('btn-finalizar-torneo-modern')?.addEventListener('click', handleFinalizarTorneo);
            $id('btn-iniciar-torneo-modern-gestion')?.addEventListener('click', () => {
                if (selectedTournament) handleIniciarTorneo(selectedTournament.id);
            });
            $id('btn-gestionar-jugadores-modern')?.addEventListener('click', () => {
                if (selectedTournament) openJugadoresModal(selectedTournament.id);
            });
            $id('btn-crear-liga-modern')?.addEventListener('click', () => {
                $id('form-liga-modern').reset();
                new bootstrap.Modal($id('modal-liga-modern')).show();
            });
            $id('btn-eliminar-liga-modern')?.addEventListener('click', handleEliminarLiga);
            $id('btn-confirmar-fusion-modern')?.addEventListener('click', handleFusionarPuntos);
            $id('btn-generar-codigo-modern')?.addEventListener('click', () => {
                $id('input-codigo-invitado-modern').value = generateLeagueCode();
            });

            // Forms
            $id('form-torneo-modern')?.addEventListener('submit', handleTorneoFormSubmit);
            $id('form-liga-modern')?.addEventListener('submit', handleLigaFormSubmit);
            $id('form-resultados-modern')?.addEventListener('submit', handleResultadosSubmit);

            // Player management
            $id('btn-agregar-usuario-modern')?.addEventListener('click', handleAgregarUsuario);
            $id('input-buscar-usuario-modern')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAgregarUsuario(); } });
            $id('btn-agregar-invitado-modern')?.addEventListener('click', handleAgregarInvitado);
            $id('btn-confirmar-jugadores-modern')?.addEventListener('click', handleConfirmJugadores);

            // Import inscritos
            $id('btn-importar-inscritos-modern')?.addEventListener('click', handleImportarInscritosJornada);

            // Filter current players
            const filterActuales = document.getElementById('filter-jugadores-actuales-modern');
            if (filterActuales) {
                filterActuales.addEventListener('input', () => renderTempJugadoresList());
            }

            // Filter previous players
            const filterPrevios = document.getElementById('filter-jugadores-previos-modern');
            if (filterPrevios) {
                filterPrevios.addEventListener('input', () => {
                    _previosPage = 1;
                    renderJugadoresPrevios();
                });
            }

            // Document delegation
            $(document).on('click', (e) => {
                const target = $(e.target).closest('button');
                if (!target.length) return;

                const id = target.data('id');

                // Tournament list actions
                if (target.is('.btn-gestionar-modern')) openTournamentManagement(id);
                if (target.is('.btn-iniciar-modern')) handleIniciarTorneo(id);
                if (target.is('.btn-editar-torneo-modern')) openTournamentModal(id);
                if (target.is('.btn-eliminar-torneo-modern')) handleEliminarTorneo(id);
                if (target.is('.btn-add-players-torneo-modern')) openJugadoresModal(id);
                if (target.is('.btn-ver-detalles-torneo-modern')) openTournamentManagement(id);
                if (target.is('.btn-quitar-jugador-modern')) handleRemoveJugadorTemp(id);
                if (target.is('.btn-resultados-modern')) {
                    openMesaResultsModal(parseInt(target.data('ronda')), parseInt(target.data('mesa')), false);
                }
                if (target.is('#btn-generar-topcut-modern')) handleGenerateTopCut();
                if (target.is('#btn-avanzar-topcut-modern')) handleAvanzarTopCut();
            });

            // Fusion modal - populate dropdowns
            $id('btn-fusionar-puntos-modern')?.addEventListener('click', () => {
                const ligaId = $id('select-liga-modern')?.value;
                if (!ligaId) { showAlert('Selecciona una liga primero.', 'warning'); return; }
                const liga = ligasCache.find(l => l.id === ligaId);
                if (!liga || !liga.clasificacion) { showAlert('La liga no tiene clasificación.', 'warning'); return; }

                const invitados = Object.entries(liga.clasificacion).filter(([k]) => k.startsWith('invitado_'));
                const selInv = $id('select-invitado-fusion-modern');
                selInv.innerHTML = invitados.map(([k, v]) => `<option value="${k}">${escapeHtml(v.nombre)} (${k.split('_')[1]})</option>`).join('') || '<option value="">No hay invitados</option>';

                const selUsr = $id('select-usuario-fusion-modern');
                selUsr.innerHTML = usuariosCache.map(u => `<option value="${u.id}">${escapeHtml(u.nombre)} ${escapeHtml(u.apellidos || '')} (${u.correo})</option>`).join('');

                new bootstrap.Modal($id('modal-fusion-modern')).show();
            });

            // Top cut bracket delegate
            $(document).on('click', '.btn-resultados-topcut-modern', function () {
                const ronda = parseInt($(this).data('ronda'));
                const mesa = parseInt($(this).data('mesa'));
                openMesaResultsModal(ronda, mesa, true);
            });

            // Previous player add
            $(document).on('click', '.btn-add-previo', function () {
                const id = this.dataset.id;
                const nombre = this.dataset.nombre;
                const leagueCode = this.dataset.leaguecode || '';
                addJugadorPrevio(id, nombre, leagueCode);
            });

            // Previous player pagination
            $(document).on('click', '[data-page-prev]', function () {
                _previosPage = parseInt(this.dataset.pagePrev);
                renderJugadoresPrevios();
            });
        }

        async function handleFusionarPuntos() {
            const ligaId = $id('select-liga-modern')?.value;
            const invitedId = $id('select-invitado-fusion-modern')?.value;
            const userId = $id('select-usuario-fusion-modern')?.value;
            if (!ligaId || !invitedId || !userId) { showAlert('Completa todos los campos.', 'warning'); return; }

            const user = usuariosCache.find(u => u.id === userId);
            if (!user) { showAlert('Usuario no encontrado.', 'danger'); return; }
            if (!confirm(`¿Fusionar puntos de "${invitedId.split('_')[1]}" con "${user.nombre}"?`)) return;

            try {
                await db.runTransaction(async t => {
                    const ligaRef = db.collection('ligas').doc(ligaId);
                    const ligaDoc = await t.get(ligaRef);
                    if (!ligaDoc.exists) throw new Error('Liga no encontrada');
                    const clasif = { ...(ligaDoc.data().clasificacion || {}) };
                    const entry = clasif[invitedId];
                    if (!entry) throw new Error('Invitado no encontrado');
                    const existing = clasif[userId];
                    if (existing) {
                        entry.puntos += existing.puntos;
                        delete clasif[userId];
                    }
                    entry.nombre = `${user.nombre} ${user.apellidos || ''}`.trim();
                    entry.userId = userId;
                    entry.mergedFromGuest = true;
                    clasif[invitedId] = entry;
                    t.update(ligaRef, { clasificacion: clasif });
                });
                bootstrap.Modal.getInstance($id('modal-fusion-modern'))?.hide();
                await loadInitialData();
                showAlert('Puntos fusionados.', 'success');
            } catch (e) {
                showAlert('Error: ' + e.message, 'danger');
            }
        }

        // When a liga is selected, find its linked evento and populate subeventos
        function handleTorneoLigaChange(ligaId) {
            const sel = $id('select-torneo-subevento-modern');
            if (!sel) return;
            if (!ligaId) {
                sel.innerHTML = '<option value="">Selecciona una liga primero</option>';
                sel.disabled = true;
                return;
            }
            const liga = ligasCache.find(l => l.id === ligaId);
            if (liga && liga.eventoId) {
                handleEventoChange(liga.eventoId);
            } else {
                sel.innerHTML = '<option value="">Esta liga no tiene un evento válido asignado</option>';
                sel.disabled = true;
            }
        }

        function handleEventoChange(eventoId) {
            const sel = $id('select-torneo-subevento-modern');
            if (!sel) return;
            if (!eventoId) {
                sel.innerHTML = '<option value="">Selecciona un evento o liga primero</option>';
                sel.disabled = true;
                return;
            }
            const subs = subeventosCache.filter(s => s.eventoId === eventoId);
            sel.innerHTML = '<option value="">-- Sin actividad --</option>'
                + subs.map(s => `<option value="${s.id}">${escapeHtml(s.titulo)}</option>`).join('');
            sel.disabled = false;
        }

        // --- START ---
        init();
    };
});
