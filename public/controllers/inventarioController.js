document.addEventListener('DOMContentLoaded', function () {
    // Modals
    const itemModal = new bootstrap.Modal(document.getElementById('item-modal'));
    const infoModal = new bootstrap.Modal(document.getElementById('info-modal'));

    // DataTables instances
    let inventarioTable, infoHistorialTable, categoriasTable;

    // User permissions
    let userIsAdmin = false;
    let userIsSocio = false;

    // Data cache
    let currentItemHistory = [];

    // --- CATEGORY LOADING FUNCTIONS ---

    async function loadAndPopulateCategoriesForModal() {
        const categorySelects = document.querySelectorAll('.item-category-select');
        try {
            const snapshot = await db.collection('categoriasInventario').orderBy('nombreCategoria').get();
            categorySelects.forEach(select => {
                const currentValue = select.value;
                select.innerHTML = '<option value="" disabled>Seleccione una categoría</option>';
                snapshot.forEach(doc => {
                    const categoria = doc.data();
                    select.add(new Option(categoria.nombreCategoria, doc.id));
                });
                if (currentValue) select.value = currentValue;
            });
        } catch (error) {
            console.error("Error al cargar categorías para el modal: ", error);
        }
    }

    async function loadCategoriesForFilter() {
        const categoryFilterSelect = document.getElementById('category-filter');
        try {
            const snapshot = await db.collection('categoriasInventario').orderBy('nombreCategoria').get();
            snapshot.forEach(doc => {
                const categoria = doc.data();
                categoryFilterSelect.add(new Option(categoria.nombreCategoria, categoria.nombreCategoria));
            });
        } catch (error) {
            console.error("Error al cargar categorías para el filtro: ", error);
        }
    }

    // --- AUTHENTICATION ---

    auth.onAuthStateChanged(async user => {
        if (user) {
            userIsAdmin = await window.isUserAdmin();
            userIsSocio = await window.isUserSocio();
            if (userIsSocio || userIsAdmin) {
                initializeInventarioPage();
            } else {
                document.querySelector('main').innerHTML = '<div class="alert alert-danger">Acceso denegado.</div>';
            }
        } else {
            document.querySelector('main').innerHTML = '<div class="alert alert-warning">Por favor, inicia sesión.</div>';
        }
    });

    // --- INITIALIZATION ---

    function initializeInventarioPage() {
        const addItemBtn = document.getElementById('add-item-btn');
        if (userIsAdmin) {
            addItemBtn.style.display = 'block';
            loadAndPopulateCategoriesForModal();
        } else {
            addItemBtn.style.display = 'none';
        }
        loadCategoriesForFilter();
        loadInventoryData();
        setupEventListeners();
    }

    // --- DATA LOADING & TABLE RENDERING ---

    async function loadInventoryData() {
        try {
            const snapshot = await db.collection('inventario').get();
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if ($.fn.DataTable.isDataTable('#inventario-table')) {
                $('#inventario-table').DataTable().destroy();
            }
            
            inventarioTable = $('#inventario-table').DataTable({
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
                pageLength: 10,
                data: items,
                columns: [
                    { data: 'nombre' },
                    { data: 'categoria' },
                    { data: 'cantidad', className: 'text-center' },
                    {
                        data: 'id',
                        render: (data, type, row) => {
                            let buttons = '';
                            if (userIsAdmin) {
                                buttons += `<button class="btn btn-sm btn-primary edit-btn" data-id="${data}" title="Editar"><i class="fas fa-edit"></i></button> `;
                                buttons += `<button class="btn btn-sm btn-danger delete-btn" data-id="${data}" title="Eliminar"><i class="fas fa-trash"></i></button> `;
                            }
                            buttons += `<button class="btn btn-sm btn-secondary info-btn" data-id="${data}" data-name="${row.nombre}" title="Historial"><i class="fas fa-info-circle"></i></button>`;
                            return buttons;
                        },
                        className: 'text-center'
                    }
                ]
            });
        } catch (error) {
            console.error("Error al cargar inventario: ", error);
        }
    }

    async function loadAndInitCategoriasTable() {
        if ($.fn.DataTable.isDataTable('#categorias-table')) return;

        try {
            const snapshot = await db.collection('categoriasInventario').orderBy('nombreCategoria').get();
            const categories = snapshot.docs.map(doc => ({ id: doc.id, nombre: doc.data().nombreCategoria }));
            
            categoriasTable = $('#categorias-table').DataTable({
                language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                responsive: true,
                pageLength: 10,
                data: categories,
                columns: [
                    { data: 'id' },
                    { data: 'nombre' }
                ]
            });
        } catch (error) {
            console.error("Error al cargar categorías: ", error);
        }
    }

    function setupEventListeners() {
        const itemForm = document.getElementById('item-form');

        $('#category-filter').on('change', function() {
            inventarioTable.column(1).search($(this).val()).draw();
        });

        // Tab listeners for on-demand table initialization
        $('button[data-bs-target="#categorias-section"]').on('shown.bs.tab', loadAndInitCategoriasTable);
        
        // Nota: Las tablas de préstamos se inicializan en prestamosController.js.
        // Para convertirlas en DataTables, se deberían aplicar cambios similares en ese archivo.

        if (userIsAdmin) {
            $('#add-item-btn').on('click', () => {
                itemForm.reset();
                $('#item-modal-title').text('Añadir Artículo');
                itemForm.dataset.mode = 'add';
                loadAndPopulateCategoriesForModal();
                itemModal.show();
            });

            $('#inventario-table tbody').on('click', '.edit-btn', async function () {
                const id = $(this).data('id');
                const doc = await db.collection('inventario').doc(id).get();
                if (doc.exists) {
                    const data = doc.data();
                    itemForm.reset();
                    $('#item-modal-title').text('Editar Artículo');
                    $('#item-name').val(data.nombre);
                    $('#item-quantity').val(data.cantidad);
                    await loadAndPopulateCategoriesForModal();
                    $('#item-category').val(data.idCategoria);
                    itemForm.dataset.id = id;
                    itemForm.dataset.mode = 'edit';
                    itemModal.show();
                }
            });

            $('#inventario-table tbody').on('click', '.delete-btn', async function () {
                if (confirm('¿Seguro?')) {
                    await db.collection('inventario').doc($(this).data('id')).delete();
                    loadInventoryData();
                }
            });

            itemForm.addEventListener('submit', async e => {
                e.preventDefault();
                const categoriaSelect = document.getElementById('item-category');
                const itemData = {
                    nombre: $('#item-name').val(),
                    idCategoria: $('#item-category').val(),
                    categoria: categoriaSelect.options[categoriaSelect.selectedIndex].text,
                    cantidad: parseInt($('#item-quantity').val(), 10) || 0
                };

                if (itemForm.dataset.mode === 'add') {
                    await db.collection('inventario').add(itemData);
                } else {
                    await db.collection('inventario').doc(itemForm.dataset.id).update(itemData);
                }
                itemModal.hide();
                loadInventoryData();
            });
        }

        $('#inventario-table tbody').on('click', '.info-btn', function () {
            openInfoModal($(this).data('id'), $(this).data('name'));
        });

        $('#info-filtro-responsable, #info-filtro-evento').on('change', applyInfoFilters);
    }

    async function openInfoModal(itemId, itemName) {
        $('#info-modal-title').text(`Historial de: ${itemName}`);
        infoModal.show();

        try {
            const snapshot = await db.collection('prestamos').where('IdArticulo', '==', itemId).orderBy('fechaHoraPrestamo', 'desc').get();
            currentItemHistory = await Promise.all(snapshot.docs.map(async doc => {
                const prestamo = doc.data();
                const respName = await window.getUserName(prestamo.IdUsuarioResponsable);
                return {
                    ...prestamo,
                    Responsable: respName,
                    fechaHoraPrestamo: prestamo.fechaHoraPrestamo.toDate(),
                    fechaHoraDevolucion: prestamo.fechaHoraDevolucion ? prestamo.fechaHoraDevolucion.toDate() : null
                };
            }));

            if (!$.fn.DataTable.isDataTable('#tabla-info-historial')) {
                infoHistorialTable = $('#tabla-info-historial').DataTable({
                    language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                    responsive: true, searching: false, paging: false, info: false,
                    columns: [
                        { data: "PersonaRecibe" },
                        { data: "fechaHoraPrestamo", render: d => d ? d.toLocaleString() : '' },
                        { data: "fechaHoraDevolucion", render: d => d ? d.toLocaleString() : 'N/A' },
                        {
                            data: "Estado",
                            render: d => d === 'Devuelto' ? '<span class="badge bg-success">Devuelto</span>' : '<span class="badge bg-warning text-dark">Pendiente</span>'
                        },
                        { data: "Responsable" },
                        { data: "Evento" }
                    ]
                });
            }
            populateInfoFilters(currentItemHistory);
            applyInfoFilters();
        } catch (error) {
            console.error("Error al cargar historial: ", error);
        }
    }

    function populateInfoFilters(history) {
        const responsables = [...new Set(history.map(item => item.Responsable))].filter(Boolean);
        const eventos = [...new Set(history.map(item => item.Evento))].filter(Boolean);
        $('#info-filtro-responsable').html('<option value="">Todos</option>' + responsables.map(r => `<option value="${r}">${r}</option>`).join(''));
        $('#info-filtro-evento').html('<option value="">Todos</option>' + eventos.map(e => `<option value="${e}">${e}</option>`).join(''));
    }

    function applyInfoFilters() {
        const respFiltro = $('#info-filtro-responsable').val();
        const eventFiltro = $('#info-filtro-evento').val();
        const filtered = currentItemHistory.filter(item => 
            (!respFiltro || item.Responsable === respFiltro) && 
            (!eventFiltro || item.Evento === eventFiltro)
        );
        infoHistorialTable.clear().rows.add(filtered).draw();
    }
});
