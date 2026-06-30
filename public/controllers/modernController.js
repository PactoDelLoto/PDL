document.addEventListener('DOMContentLoaded', () => {
    window.initializeModernController = function (isAdmin) {
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

                if (isAdmin) {
                    const uSnap = await db.collection('usuarios').get();
                    usuariosCache = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                }

                renderTournamentsList();
                renderLigaSelectors();
                renderEventSelector();
                renderLigaClasificacion();
                if (isAdmin) populateDatalist();
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
                return `
                    <div class="col-lg-4 col-md-6">
                        <div class="card h-100 shadow-sm">
                            <div class="card-body">
                                <div class="d-flex justify-content-between">
                                    <span class="badge ${badge}">${label}</span>
                                    ${liga ? '<span class="badge bg-info">Liga</span>' : ''}
                                </div>
                                <h6 class="card-title mt-2 mb-1">${escapeHtml(t.nombre)}</h6>
                                <small class="text-muted">${fecha}</small>
                                <p class="mt-2 mb-0"><i class="fa-solid fa-users"></i> ${(t.jugadores || []).length} jugadores</p>
                                ${liga ? `<small class="text-muted">${escapeHtml(liga.nombre)}</small>` : ''}
                            </div>
                            <div class="card-footer bg-transparent d-flex justify-content-between">
                                <button class="btn btn-sm btn-outline-info btn-gestionar-modern" data-id="${t.id}"><i class="fa-solid fa-eye"></i> Gestionar</button>
                                ${isAdmin && t.estado === 'borrador' ? `<button class="btn btn-sm btn-outline-success btn-iniciar-modern admin-controls" data-id="${t.id}"><i class="fa-solid fa-play"></i></button>` : ''}
                                ${isAdmin && t.estado === 'borrador' ? `<button class="btn btn-sm btn-outline-primary btn-editar-torneo-modern admin-controls" data-id="${t.id}"><i class="fa-solid fa-edit"></i></button>` : ''}
                                ${isAdmin ? `<button class="btn btn-sm btn-outline-danger btn-eliminar-torneo-modern admin-controls" data-id="${t.id}"><i class="fa-solid fa-trash"></i></button>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // --- STANDINGS (INTERNAL) ---
        function calculateStandings(torneo) {
            const pts = {};
            const opps = {};
            const jugMap = {};
            (torneo.jugadores || []).forEach(j => { jugMap[j.id] = j.nombre; });
            (torneo.rondas || []).forEach(r => {
                (r.mesas || []).forEach(m => {
                    if (m.bye) {
                        const p = m.bye;
                        if (!pts[p]) pts[p] = { puntos: 0, bh: 0, rivales: [] };
                        pts[p].puntos += PT_BYE;
                        return;
                    }
                    const [p1, p2] = m.jugadores;
                    if (!pts[p1]) pts[p1] = { puntos: 0, bh: 0, rivales: [] };
                    if (!pts[p2]) pts[p2] = { puntos: 0, bh: 0, rivales: [] };
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
            });

            // Buchholz
            Object.keys(pts).forEach(id => {
                pts[id].bh = pts[id].rivales.reduce((sum, rid) => sum + (pts[rid]?.puntos || 0), 0);
            });

            return Object.entries(pts).map(([id, data]) => ({
                id, nombre: jugMap[id] || '?',
                puntos: data.puntos, bh: data.bh, rivales: data.rivales,
            })).sort((a, b) => b.puntos - a.puntos || b.bh - a.bh);
        }

        function renderStandings(torneo) {
            const tbody = $id('tabla-clasificacion-modern');
            if (!tbody) return;
            const list = calculateStandings(torneo);
            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Sin datos</td></tr>';
                return;
            }
            tbody.innerHTML = list.map((r, i) => `
                <tr><td class="fw-bold">${i + 1}</td>
                    <td>${escapeHtml(r.nombre)}</td>
                    <td class="text-center fw-bold text-primary">${r.puntos}</td>
                    <td class="text-center">${r.bh}</td>
                </tr>
            `).join('');
        }

        // --- SWISS PAIRING ---
        function generatePairings(jugadores, rondas) {
            if (jugadores.length < 2) return [];

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
            $id('gt-modern-detalles').textContent = [fechaStr, eventoTxt, ligaTxt].filter(Boolean).join(' — ');
            const badge = $id('gt-modern-status');
            if (torneo.estado === 'borrador') { badge.className = 'badge badge-draft'; badge.textContent = 'Borrador'; }
            else if (torneo.estado === 'en_curso') { badge.className = 'badge badge-progress'; badge.textContent = 'En curso'; }
            else { badge.className = 'badge badge-finished'; badge.textContent = 'Finalizado'; }

            const isFinalized = torneo.estado === 'finalizado';
            const hasRondas = (torneo.rondas || []).length > 0;
            $id('btn-generar-ronda-modern').style.display = isAdmin && !isFinalized ? 'inline-block' : 'none';
            $id('btn-deshacer-ronda-modern').style.display = isAdmin && !isFinalized && hasRondas ? 'inline-block' : 'none';
            $id('btn-finalizar-torneo-modern').style.display = isAdmin && !isFinalized && hasRondas ? 'inline-block' : 'none';

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
            container.innerHTML = rondas.map(r => `
                <div class="card mb-3">
                    <div class="card-header py-2 fw-bold">Ronda ${r.numero}</div>
                    <div class="card-body py-2">
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
                            const isComplete = r1 && r2 && (win1 > 0 || win2 > 0 || m.empate);
                            return `<div class="match-card p-2 mb-1 d-flex justify-content-between align-items-center ${isComplete ? '' : 'border-start border-warning'}">
                                <div>
                                    <strong>${escapeHtml(p1?.nombre || m.jugadores[0])}</strong>
                                    ${isComplete ? ` <span class="badge ${win1 > win2 ? 'bg-success' : m.empate ? 'bg-warning text-dark' : 'bg-danger'}">${win1} - ${win2}</span>` : ' <span class="badge bg-warning text-dark">Pendiente</span>'}
                                    vs <strong>${escapeHtml(p2?.nombre || m.jugadores[1])}</strong>
                                </div>
                                ${isAdmin && !isComplete && torneo.estado !== 'finalizado' ? `<button class="btn btn-sm btn-outline-primary btn-resultados-modern" data-ronda="${r.numero}" data-mesa="${m.numero}"><i class="fa-solid fa-table-tennis"></i></button>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            `).join('');
        }

        // --- TOP CUT ---
        function renderTopCut(torneo) {
            const container = $id('topcut-container');
            if (!container) return;
            const topCut = torneo.topCut;
            if (!topCut) {
                if (torneo.estado === 'finalizado' && (torneo.jugadores || []).length >= 4) {
                    container.innerHTML = `<div class="text-center py-3">
                        <p class="text-muted">Top cut no generado.</p>
                        ${isAdmin ? `<button class="btn btn-sm btn-outline-dark" id="btn-generar-topcut-modern">Generar Top ${torneo.jugadores.length >= 8 ? '8' : '4'}</button>` : ''}
                    </div>`;
                } else {
                    container.innerHTML = '<p class="text-muted text-center py-3">El top cut estará disponible al finalizar el torneo con 4+ jugadores.</p>';
                }
                return;
            }

            const numRondas = topCut.bracket?.length || 0;
            const labels = ['Final', 'Semifinales', 'Cuartos de Final'];
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
                                    ${isAdmin && !done && torneo.estado !== 'finalizado' ? `<button class="btn btn-sm btn-outline-primary mt-1 btn-resultados-topcut-modern" data-ronda="${bi}" data-mesa="${m.numero}"><i class="fa-solid fa-table-tennis"></i></button>` : ''}
                                </div>`;
                            }).join('')}
                        </div>
                    `).join('')}
                </div>`;
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

            // Store metadata for submit
            body.innerHTML = `
                <input type="hidden" id="res-modern-ronda" value="${rondaNum}">
                <input type="hidden" id="res-modern-mesa" value="${mesaNum}">
                <input type="hidden" id="res-modern-topcut" value="${isTopCut ? '1' : '0'}">
                <div class="mb-3">
                    <label class="fw-bold">${escapeHtml(p1?.nombre || id1)}</label>
                    <div class="d-flex gap-2 mt-1">
                        <label class="form-label mb-0">Games ganados:</label>
                        <input type="number" class="form-control form-control-sm" style="width:80px" id="res-wins-1" value="${r1.wins}" min="0" max="2">
                        <label class="form-label mb-0">Perdidos:</label>
                        <input type="number" class="form-control form-control-sm" style="width:80px" id="res-loss-1" value="${r1.loss}" min="0" max="2">
                    </div>
                </div>
                <div class="mb-3">
                    <label class="fw-bold">${escapeHtml(p2?.nombre || id2)}</label>
                    <div class="d-flex gap-2 mt-1">
                        <label class="form-label mb-0">Games ganados:</label>
                        <input type="number" class="form-control form-control-sm" style="width:80px" id="res-wins-2" value="${r2.wins}" min="0" max="2">
                        <label class="form-label mb-0">Perdidos:</label>
                        <input type="number" class="form-control form-control-sm" style="width:80px" id="res-loss-2" value="${r2.loss}" min="0" max="2">
                    </div>
                </div>
                <div class="form-check mb-2">
                    <input class="form-check-input" type="checkbox" id="res-empate-modern" ${mesa.empate ? 'checked' : ''}>
                    <label class="form-check-label" for="res-empate-modern">Empate (tiempo)</label>
                </div>
                <small class="text-muted">El ganador es quien gane 2 de 3 partidas. Si hay empate, ambos reciben 1 punto.</small>
            `;
            const modal = new bootstrap.Modal($id('modal-resultados-modern'));
            modal.show();
        }

        async function handleResultadosSubmit(e) {
            e.preventDefault();
            if (!selectedTournament) return;
            const rondaNum = parseInt($id('res-modern-ronda').value);
            const mesaNum = parseInt($id('res-modern-mesa').value);
            const isTopCut = $id('res-modern-topcut').value === '1';

            const wins1 = parseInt($id('res-wins-1').value) || 0;
            const loss1 = parseInt($id('res-loss-1').value) || 0;
            const wins2 = parseInt($id('res-wins-2').value) || 0;
            const loss2 = parseInt($id('res-loss-2').value) || 0;
            const empate = $id('res-empate-modern').checked;

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
                        if (!empate) {
                            me.ganador = wins1 >= 2 ? me.jugadores[0] : me.jugadores[1];
                        }
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
                        if (!empate) {
                            m.ganador = wins1 >= 2 ? m.jugadores[0] : m.jugadores[1];
                        }
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
            ul.innerHTML = filtered.map((j, i) => `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${escapeHtml(j.nombre)} ${j.id.startsWith('invitado_') ? '<span class="badge bg-secondary">Invitado</span>' : '<span class="badge bg-primary">Registrado</span>'}</span>
                    <button class="btn btn-sm btn-outline-danger btn-quitar-jugador-modern" data-id="${j.id}"><i class="fa-solid fa-times"></i></button>
                </li>
            `).join('');
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
            const codigo = $id('input-codigo-invitado-modern')?.value.trim().toUpperCase();
            if (!nombre) { showAlert('Introduce un nombre.', 'warning'); return; }
            const id = codigo ? `invitado_${codigo}` : `temp_${genId()}`;
            if (tempJugadores.some(j => j.id === id)) { showAlert('Ya existe.', 'warning'); return; }
            tempJugadores.push({ id, nombre, leagueCode: codigo || undefined });
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
            tempJugadores.push({ id, nombre, leagueCode: leagueCode || undefined });
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
                        let existingCode = '';
                        if (ligaAsociada && ligaAsociada.clasificacion) {
                            const found = Object.entries(ligaAsociada.clasificacion).find(([id, data]) => (data.email || '').toLowerCase() === email);
                            if (found) existingCode = found[0].replace('invitado_', '');
                        }
                        tempJugadores.push({
                            id: existingCode ? `invitado_${existingCode}` : `temp_${Date.now()}_${addedCount}`,
                            nombre: inscripcion.nombreCompleto || 'Invitado',
                            leagueCode: existingCode,
                            needsCode: !existingCode
                        });
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
                    if (t.esJornadaLiga) {
                        $id('liga-bloque-modern').style.display = 'block';
                        $id('independiente-bloque-modern').style.display = 'none';
                        $id('select-torneo-liga-modern').value = t.ligaId || '';
                    } else {
                        $id('select-torneo-evento-modern').value = t.eventoId || '';
                        handleEventoChange(t.eventoId);
                        setTimeout(() => { $id('select-torneo-subevento-modern').value = t.subeventoId || ''; }, 300);
                    }
                }
            }
            new bootstrap.Modal($id('modal-torneo-modern')).show();
        }

        async function handleTorneoFormSubmit(e) {
            e.preventDefault();
            const id = $id('torneo-modern-id').value;
            const dt = $id('torneo-modern-fecha').value;
            const [fecha, hora] = dt ? dt.split('T') : ['', ''];
            const data = {
                nombre: $id('torneo-modern-nombre').value.trim(),
                fecha: fecha,
                hora: hora || '',
                juego: JUEGO,
                esJornadaLiga: $id('torneo-modern-es-liga').checked,
                ligaId: $id('torneo-modern-es-liga').checked ? ($id('select-torneo-liga-modern').value || null) : null,
                eventoId: $id('torneo-modern-es-liga').checked ? null : ($id('select-torneo-evento-modern').value || null),
                subeventoId: $id('torneo-modern-es-liga').checked ? null : ($id('select-torneo-subevento-modern').value || null),
                estado: id ? undefined : 'borrador',
            };
            if (!data.nombre || !data.fecha) { showAlert('Nombre y fecha obligatorios.', 'warning'); return; }

            try {
                if (id) {
                    await db.collection('torneos').doc(id).update(data);
                    showAlert('Torneo actualizado.', 'success');
                } else {
                    data.estado = 'borrador';
                    data.jugadores = [];
                    data.rondas = [];
                    await db.collection('torneos').add(data);
                    showAlert('Torneo creado.', 'success');
                }
                bootstrap.Modal.getInstance($id('modal-torneo-modern'))?.hide();
                await loadInitialData();
            } catch (e) {
                showAlert('Error: ' + e.message, 'danger');
            }
        }

        async function handleIniciarTorneo(torneoId) {
            try {
                await db.collection('torneos').doc(torneoId).update({ estado: 'en_curso' });
                await loadInitialData();
                showAlert('Torneo iniciado.', 'success');
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
                await loadInitialData();
                showAlert('Torneo eliminado.', 'success');
            } catch (e) { showAlert('Error: ' + e.message, 'danger'); }
        }

        // --- FINALIZATION ---
        async function handleFinalizarTorneo() {
            if (!selectedTournament) return;
            const torneo = selectedTournament;
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
                            update['ligas/' + torneo.ligaId + '/clasificacion'] = clasif;
                            // Use liga ref update separately
                            t.update(ligaRef, { clasificacion: clasif });
                        }
                    }
                    t.update(torneoRef, update);
                });

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
        }

        function renderEventSelector() {
            ['select-torneo-evento-modern', 'liga-modern-evento'].forEach(sid => {
                const sel = $id(sid);
                if (!sel) sel.innerHTML = '<option value="">-- Selecciona un evento --</option>'
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

        async function handleEliminarLiga() {
            const id = $id('select-liga-modern')?.value;
            if (!id || !confirm('¿Eliminar esta liga? Se perderán todos los puntos.')) return;
            try {
                await db.collection('ligas').doc(id).delete();
                await loadInitialData();
                showAlert('Liga eliminada.', 'success');
            } catch (e) { showAlert('Error: ' + e.message, 'danger'); }
        }

        function populateDatalist() {
            const dl = $id('datalist-usuarios-modern');
            if (!dl) return;
            dl.innerHTML = usuariosCache.map(u => `<option value="${u.id}">${escapeHtml(u.nombre)} ${escapeHtml(u.apellidos || '')} (${u.correo})</option>`).join('');
        }

        // --- TOP CUT GENERATION ---
        async function handleGenerateTopCut() {
            if (!selectedTournament || selectedTournament.estado !== 'finalizado') return;
            const torneo = selectedTournament;
            const num = (torneo.jugadores || []).length;
            const topSize = num >= 8 ? 8 : num >= 4 ? 4 : 0;
            if (topSize === 0) { showAlert('Se necesitan al menos 4 jugadores.', 'warning'); return; }

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

        // --- EVENT LISTENERS ---
        function setupEventListeners() {
            // Filter changes
            $id('filter-liga-modern')?.addEventListener('change', (e) => renderTournamentsList(e.target.value));
            $id('filter-show-finalized-modern')?.addEventListener('change', () => renderTournamentsList($id('filter-liga-modern')?.value));

            // Liga selector
            $id('select-liga-modern')?.addEventListener('change', (e) => renderLigaClasificacion(e.target.value));

            // Es liga toggle
            $id('torneo-modern-es-liga')?.addEventListener('change', (e) => {
                $id('liga-bloque-modern').style.display = e.target.checked ? 'block' : 'none';
                $id('independiente-bloque-modern').style.display = e.target.checked ? 'none' : 'block';
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
            $id('btn-finalizar-torneo-modern')?.addEventListener('click', handleFinalizarTorneo);
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
                if (target.is('.btn-quitar-jugador-modern')) handleRemoveJugadorTemp(id);
                if (target.is('.btn-resultados-modern')) {
                    openMesaResultsModal(parseInt(target.data('ronda')), parseInt(target.data('mesa')), false);
                }
                if (target.is('#btn-generar-topcut-modern')) handleGenerateTopCut();
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

        function handleEventoChange(eventoId) {
            const sel = $id('select-torneo-subevento-modern');
            if (!sel) return;
            const subs = subeventosCache.filter(s => s.eventoId === eventoId);
            sel.innerHTML = '<option value="">-- Sin actividad --</option>'
                + subs.map(s => `<option value="${s.id}">${escapeHtml(s.titulo)}</option>`).join('');
        }

        // --- START ---
        init();
    };
});
