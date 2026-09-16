/**
 * Sistema de cargos.
 *
 * Un cargo es un puesto nombrado que otorga un badge visible y permisos sobre
 * módulos de la web. Las DEFINICIONES (nombre, color, permisos) viven en este
 * archivo; la ASIGNACIÓN se guarda en Firestore en la colección 'cargos':
 *   cargos/{cargoId} = { usuarioIds: [uid, ...] }
 *
 * Un usuario puede tener varios cargos. Sus permisos efectivos son la unión de
 * los permisos de todos sus cargos.
 */
(function () {
    // ============================= DEFINICIONES =============================
    // Para añadir un cargo nuevo basta con añadir una entrada aquí (y, si abre
    // módulos nuevos, la regla correspondiente en firestore.rules).
    var DEFINICIONES = {
        superadmin: {
            nombre: 'Perfil superadmin',
            color: 'danger',
            icono: 'fa-solid fa-crown',
            descripcion: 'Acceso total a toda la administración de la web.',
            permisos: null // null = acceso total a todos los módulos
        },
        tesorero: {
            nombre: 'Tesorero',
            color: 'warning',
            icono: 'fa-solid fa-coins',
            descripcion: 'Gestiona la tesorería de la asociación.',
            permisos: {
                tesoreria: { acceso: 'edicion', crear: true, editar: true, eliminar: true }
            }
        }
    };

    // Módulos del sistema (mismo conjunto que se usa en firestore.rules).
    var MODULOS = [
        'torneos', 'eventos', 'actividades', 'tiposActividad', 'inventario',
        'tesoreria', 'contenido', 'usuarios', 'contrasenas', 'solicitudes',
        'auditoria', 'buzon', 'roles'
    ];

    // Acceso total (para superadmin).
    function accesoTotal() {
        var out = {};
        MODULOS.forEach(function (m) {
            out[m] = { acceso: 'edicion', crear: true, editar: true, eliminar: true };
        });
        return out;
    }

    // Permisos efectivos de una lista de ids de cargo.
    function permisosDeCargos(ids) {
        var out = {};
        (ids || []).forEach(function (id) {
            var def = DEFINICIONES[id];
            if (!def) return;
            var perms = def.permisos || accesoTotal();
            Object.keys(perms).forEach(function (mod) {
                var p = perms[mod];
                var actual = out[mod] || { acceso: 'ninguno', crear: false, editar: false, eliminar: false };
                var jerarquia = { 'ninguno': 0, 'lectura': 1, 'edicion': 2 };
                var nuevo = jerarquia[p.acceso] > jerarquia[actual.acceso] ? p.acceso : actual.acceso;
                out[mod] = {
                    acceso: nuevo,
                    crear: actual.crear || !!p.crear,
                    editar: actual.editar || !!p.editar,
                    eliminar: actual.eliminar || !!p.eliminar
                };
            });
        });
        return out;
    }

    // ============================= ESTADO =============================
    var estado = {
        cargado: false,
        asignaciones: {},     // cargoId -> [uid, ...]
        usuario: null,
        uid: null,            // uid del usuario actual
        misCargos: [],        // ids de cargo del usuario actual
        permisos: {}          // permisos efectivos del usuario actual
    };

    // ============================= CARGA =============================
    function cargarAsignaciones() {
        return window.db.collection('cargos').get().then(function (snap) {
            estado.asignaciones = {};
            snap.docs.forEach(function (doc) {
                var data = doc.data();
                estado.asignaciones[doc.id] = Array.isArray(data.usuarioIds) ? data.usuarioIds : [];
            });
        });
    }

    async function listo() {
        if (estado.cargado) return;
        estado.usuario = firebase.auth().currentUser;
        estado.uid = estado.usuario ? estado.usuario.uid : null;
        try {
            await cargarAsignaciones();
        } catch (e) {
            // Si se cae la lectura (p. ej. no autenticado), asignaciones vacías
            console.warn('No se pudieron cargar los cargos:', e);
        }
        estado.misCargos = [];
        if (estado.uid) {
            Object.keys(estado.asignaciones).forEach(function (id) {
                if (estado.asignaciones[id].indexOf(estado.uid) !== -1) estado.misCargos.push(id);
            });
        }
        estado.permisos = permisosDeCargos(estado.misCargos);
        estado.cargado = true;
    }

    function uidTieneCargo(uid, cargoId) {
        var lista = estado.asignaciones[cargoId];
        return !!lista && lista.indexOf(uid) !== -1;
    }

    function tieneCargo(cargoId) {
        return estado.misCargos.indexOf(cargoId) !== -1;
    }

    // ============================= CONSULTAS =============================
    function esSuperAdmin() { return tieneCargo('superadmin'); }
    function esTesorero() { return tieneCargo('tesorero'); }

    function acceso(modulo) {
        var p = estado.permisos[modulo];
        return p ? p.acceso : 'ninguno';
    }

    function puede(modulo, accion) {
        var p = estado.permisos[modulo] || { acceso: 'ninguno', crear: false, editar: false, eliminar: false };
        if (accion === 'acceder') return p.acceso === 'lectura' || p.acceso === 'edicion';
        if (p.acceso !== 'edicion') return false;
        if (accion === 'crear') return !!p.crear;
        if (accion === 'editar') return !!p.editar;
        if (accion === 'eliminar') return !!p.eliminar;
        return false;
    }

    function superadminAsignado() {
        var lista = estado.asignaciones['superadmin'];
        return !!lista && lista.length > 0;
    }

    // ids de los cargos asignados a un uid (inverso de asignaciones)
    function cargosDe(uid) {
        var out = [];
        Object.keys(estado.asignaciones).forEach(function (id) {
            if (estado.asignaciones[id].indexOf(uid) !== -1) out.push(id);
        });
        return out;
    }

    window.C = {
        DEFINICIONES: DEFINICIONES,
        MODULOS: MODULOS,
        listo: listo,
        acceso: acceso,
        puede: puede,
        tieneCargo: tieneCargo,
        uidTieneCargo: uidTieneCargo,
        esSuperAdmin: esSuperAdmin,
        esTesorero: esTesorero,
        superadminAsignado: superadminAsignado,
        cargosDe: cargosDe,
        get cargado() { return estado.cargado; },
        get asignaciones() { return estado.asignaciones; },
        get misCargos() { return estado.misCargos; },
        get permisos() { return estado.permisos; }
    };
})();