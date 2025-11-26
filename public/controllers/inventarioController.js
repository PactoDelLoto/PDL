document.addEventListener('DOMContentLoaded', function () {
    const itemModal = new bootstrap.Modal(document.getElementById('item-modal'));
    const infoModal = new bootstrap.Modal(document.getElementById('info-modal'));
    let inventarioTable, infoHistorialTable;
    let userIsAdmin = false;
    let userIsSocio = false;
    let currentItemHistory = [];

    // Función para cargar categorías, ahora en el ámbito principal del DOMContentLoaded
    async function loadAndPopulateCategories() {
        const categorySelects = document.querySelectorAll('.item-category-select'); // Usamos una clase para seleccionar ambos desplegables
        try {
            const snapshot = await db.collection('categoriasInventario').orderBy('nombreCategoria').get();
            
            categorySelects.forEach(select => {
                const currentValue = select.value; // Guardar el valor actual si lo hubiera
                select.innerHTML = '<option value="" disabled>Seleccione una categoría</option>'; // No autoseleccionar
                snapshot.forEach(doc => {
                    const categoria = doc.data();
                    const option = new Option(categoria.nombreCategoria, doc.id);
                    select.add(option);
                });
                if (currentValue) { // Si había un valor previo (en modo edición), intentar restaurarlo
                    select.value = currentValue;
                }
            });
        } catch (error) {
            console.error("Error al cargar categorías: ", error);
            categorySelects.forEach(select => {
                select.innerHTML = '<option value="">Error al cargar</option>';
            });
        }
    }

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

    function initializeInventarioPage() {
        const addItemBtn = document.getElementById('add-item-btn');
        if (userIsAdmin) {
            addItemBtn.style.display = 'block';
            loadAndPopulateCategories(); // Carga inicial para el formulario principal (si existiera)
        } else {
            addItemBtn.style.display = 'none';
        }
        
        loadInventoryData();
        setupEventListeners();
        
        if (!infoHistorialTable) {
            infoHistorialTable = $('#tabla-info-historial').DataTable({
                 language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                 responsive: true, searching: false, paging: false, info: false,
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

    async function loadInventoryData() {
        try {
            const snapshot = await db.collection('inventario').get();
            const inventarioItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if ($.fn.DataTable.isDataTable('#inventario-table')) {
                $('#inventario-table').DataTable().destroy();
            }

            const tableBody = $('#inventario-table tbody');
            tableBody.empty();
            
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

            inventarioTable = $('#inventario-table').DataTable({
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
                pageLength: 10,
            });

        } catch (error) {
            console.error("Error crítico al cargar el inventario: ", error);
            $('#inventario-table tbody').html('<tr><td colspan="4" class="text-center text-danger">No se pudo cargar el inventario. Verifique la consola para más detalles.</td></tr>');
        }
    }

    function setupEventListeners() {
        const itemForm = document.getElementById('item-form');

        // --- LISTENERS PARA ADMIN -- -
        if (userIsAdmin) {
            $('#add-item-btn').on('click', function () {
                itemForm.reset();
                $('#item-modal-title').text('Añadir Nuevo Artículo');
                itemForm.dataset.mode = 'add';
                delete itemForm.dataset.id;
                loadAndPopulateCategories(); // Cargar categorías al abrir para añadir
                itemModal.show();
            });

            $('#inventario-table tbody').on('click', '.edit-btn', async function () {
                const itemId = $(this).data('id');
                try {
                    const doc = await db.collection('inventario').doc(itemId).get();
                    if (doc.exists) {
                        const data = doc.data();
                        itemForm.reset();
                        $('#item-modal-title').text('Editar Artículo');
                        $('#item-name').val(data.nombre);
                        $('#item-quantity').val(data.cantidad);
                        
                        // Cargar categorías y luego seleccionar la correcta
                        await loadAndPopulateCategories(); 
                        $('#item-category').val(data.idCategoria);

                        itemForm.dataset.mode = 'edit';
                        itemForm.dataset.id = itemId;
                        itemModal.show();
                    }
                } catch (error) {
                    console.error("Error al obtener datos para editar: ", error);
                }
            });
            
            $('#inventario-table tbody').on('click', '.delete-btn', async function () {
                const itemId = $(this).data('id');
                if (confirm('¿Estás seguro de que quieres eliminar este artículo?')) {
                    try {
                        await db.collection('inventario').doc(itemId).delete();
                        loadInventoryData(); // Recargar la tabla
                    } catch (error) {
                        console.error("Error al eliminar el artículo: ", error);
                    }
                }
            });

            itemForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                const mode = itemForm.dataset.mode;
                const itemId = itemForm.dataset.id;
                
                const categoriaSelect = document.getElementById('item-category');
                const categoriaTexto = categoriaSelect.options[categoriaSelect.selectedIndex].text;

                const itemData = {
                    nombre: $('#item-name').val(),
                    idCategoria: $('#item-category').val(),
                    categoria: categoriaTexto,
                    cantidad: parseInt($('#item-quantity').val(), 10) || 0
                };

                try {
                    if (mode === 'add') {
                        await db.collection('inventario').add(itemData);
                    } else {
                        await db.collection('inventario').doc(itemId).update(itemData);
                    }
                    itemModal.hide();
                    loadInventoryData(); // Recargar tabla
                } catch (error) {
                    console.error("Error al guardar el artículo: ", error);
                }
            });
        }

        // --- LISTENER PARA TODOS (SOCIOS Y ADMIN) ---
        $('#inventario-table tbody').on('click', '.info-btn', function () {
            const itemId = $(this).data('id');
            const itemName = $(this).data('name');
            openInfoModal(itemId, itemName);
        });

        $('#info-filtro-responsable').on('change', applyInfoFilters);
        $('#info-filtro-evento').on('change', applyInfoFilters);
    }

    async function openInfoModal(itemId, itemName) {
        $('#info-modal-title').text(`Historial de: ${itemName}`);
        infoModal.show();
        
        try {
            const prestamosSnapshot = await db.collection('prestamos').where('IdArticulo', '==', itemId).orderBy('fechaHoraPrestamo', 'desc').get();
            const prestamosData = await Promise.all(prestamosSnapshot.docs.map(async doc => {
                const prestamo = doc.data();
                const responsableName = await window.getUserName(prestamo.IdUsuarioResponsable);
                return {
                    ...prestamo,
                    Responsable: responsableName,
                    fechaHoraPrestamo: prestamo.fechaHoraPrestamo.toDate(),
                    fechaHoraDevolucion: prestamo.fechaHoraDevolucion ? prestamo.fechaHoraDevolucion.toDate() : null
                };
            }));
            
            currentItemHistory = prestamosData;
            populateInfoFilters(currentItemHistory);
            applyInfoFilters();

        } catch (error) {
            console.error("Error al cargar el historial del artículo: ", error);
            if (infoHistorialTable) {
                infoHistorialTable.clear().draw();
            }
        }
    }
    
    function populateInfoFilters(history) {
        const responsables = [...new Set(history.map(item => item.Responsable))].filter(Boolean);
        const eventos = [...new Set(history.map(item => item.Evento))].filter(Boolean);

        const respSelect = document.getElementById('info-filtro-responsable');
        const eventSelect = document.getElementById('info-filtro-evento');

        respSelect.innerHTML = '<option value="">Todos</option>' + responsables.map(r => `<option value="${r}">${r}</option>`).join('');
        eventSelect.innerHTML = '<option value="">Todos</option>' + eventos.map(e => `<option value="${e}">${e}</option>`).join('');
    }

    function applyInfoFilters() {
        const respFiltro = $('#info-filtro-responsable').val();
        const eventFiltro = $('#info-filtro-evento').val();

        const filteredHistory = currentItemHistory.filter(item => {
            const respMatch = !respFiltro || item.Responsable === respFiltro;
            const eventMatch = !eventFiltro || item.Evento === eventFiltro;
            return respMatch && eventMatch;
        });

        if (infoHistorialTable) {
            infoHistorialTable.clear().rows.add(filteredHistory).draw();
        }
    }
});
