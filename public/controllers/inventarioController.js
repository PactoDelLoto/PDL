document.addEventListener('DOMContentLoaded', function () {
    const itemModal = new bootstrap.Modal(document.getElementById('item-modal'));
    const infoModal = new bootstrap.Modal(document.getElementById('info-modal'));
    let inventarioTable, infoHistorialTable;
    let userIsAdmin = false;
    let userIsSocio = false;
    let currentItemHistory = [];

    auth.onAuthStateChanged(async user => {
        if (user) {
            userIsAdmin = await window.isUserAdmin();
            userIsSocio = await window.isUserSocio();

            if (userIsSocio || userIsAdmin) {
                initializeInventarioPage();
            } else {
                console.warn("Acceso denegado. El usuario no es socio ni administrador.");
                document.querySelector('main').innerHTML = '<div class="alert alert-danger">Acceso denegado. Debes ser socio o administrador para acceder a esta sección.</div>';
            }
        } else {
            document.querySelector('main').innerHTML = '<div class="alert alert-warning">Por favor, inicia sesión para continuar.</div>';
        }
    });

    // --- FUNCIÓN DE INICIALIZACIÓN (MODIFICADA) ---
    // Se ha movido la inicialización de DataTables a `loadInventoryData`
    function initializeInventarioPage() {
        const addItemBtn = document.getElementById('add-item-btn');
        if (!userIsAdmin) {
            addItemBtn.style.display = 'none';
        }
        
        loadInventoryData();
        if(userIsAdmin) loadAndPopulateCategories();
        setupEventListeners();
        
        // Inicializa la segunda tabla (historial) aquí si no lo has hecho
        if (!infoHistorialTable) {
            infoHistorialTable = $('#tabla-info-historial').DataTable({
                 language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                 responsive: true,
                 searching: false,
                 paging: false,
                 info: false,
                 columns: [
                    { data: "PersonaRecibe" },
                    { data: "fechaHoraPrestamo", render: data => data ? new Date(data).toLocaleString() : '' },
                    { data: "fechaHoraDevolucion", render: data => data ? new Date(data).toLocaleString() : 'N/A' },
                    { data: "Estado" },
                    { data: "Responsable" },
                    { data: "Evento" }
                ]
            });
        }
    }

    // --- LÓGICA DE CARGA DE DATOS (MODIFICADA) ---
    async function loadInventoryData() {
        try {
            const snapshot = await db.collection('inventario').get();
            const inventarioItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 1. Si la tabla ya es una DataTable, la destruimos para empezar de cero
            if ($.fn.DataTable.isDataTable('#inventario-table')) {
                $('#inventario-table').DataTable().destroy();
            }

            // 2. Llenamos el cuerpo de la tabla manualmente
            const tableBody = $('#inventario-table tbody');
            tableBody.empty(); // Limpiamos el contenido previo
            
            inventarioItems.forEach(item => {
                let buttons = '';
                if (userIsAdmin) {
                    buttons += `<button class="btn btn-sm btn-primary edit-btn" data-id="${item.id}" title="Editar"><i class="fas fa-edit"></i></button> `;
                    buttons += `<button class="btn btn-sm btn-danger delete-btn" data-id="${item.id}" title="Eliminar"><i class="fas fa-trash"></i></button> `;
                }
                if (userIsSocio || userIsAdmin) {
                    buttons += `<button class="btn btn-sm btn-secondary info-btn" data-id="${item.id}" data-name="${item.nombre}" title="Historial del Artículo"><i class="fas fa-info-circle"></i></button>`;
                }

                tableBody.append(`
                    <tr>
                        <td>${item.nombre || ''}</td>
                        <td>${item.categoria || ''}</td>
                        <td class="text-center">${item.cantidad || 0}</td>
                        <td class="text-center">${buttons}</td>
                    </tr>
                `);
            });

            // 3. Re-inicializamos DataTables sobre la tabla ya con los datos
            inventarioTable = $('#inventario-table').DataTable({
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
                pageLength: 10,
                // No se necesita la configuración de `columns` porque lee del HTML
            });

        } catch (error) {
            console.error("Error crítico al cargar el inventario: ", error);
            $('#inventario-table tbody').html('<tr><td colspan="4" class="text-center text-danger">No se pudo cargar el inventario. Verifique la consola para más detalles.</td></tr>');
        }
    }
    
    // --- OTRAS FUNCIONES (sin cambios significativos) ---

    async function loadAndPopulateCategories() {
       // ... (código existente)
    }

    function setupEventListeners() {
        if (userIsAdmin) {
            // ... (código para admin sin cambios)
        }

        $('#inventario-table tbody').on('click', '.info-btn', function () {
            const itemId = $(this).data('id');
            const itemName = $(this).data('name');
            openInfoModal(itemId, itemName);
        });
        
        // ... (resto de listeners)
    }

    async function openInfoModal(itemId, itemName) {
        // ... (código existente)
    }
    
    // ... (resto de funciones)
});
