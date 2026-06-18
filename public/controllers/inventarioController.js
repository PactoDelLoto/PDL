document.addEventListener('DOMContentLoaded', function () {
    const db = firebase.firestore();
    const auth = firebase.auth();

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
    let statsChart = null;

    // Filtros de tiempo para estadísticas (por defecto últimos 30 días)
    let statsDateFilter = {
        days: 30
    };

    async function getUserName(userId) {
        if (!userId) {
            return 'Usuario desconocido';
        }
        try {
            const userDoc = await db.collection('usuarios').doc(userId).get();
            if (userDoc.exists) {
                return userDoc.data().nombre;
            } else {
                return 'Usuario desconocido';
            }
        } catch (error) {
            console.error("Error al obtener el nombre del usuario:", error);
            return 'Usuario desconocido';
        }
    }

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

    async function loadCategoriesForFilter(forceReload = false) {
        const categoryFilterSelect = document.getElementById('category-filter');
        const currentValue = categoryFilterSelect.value;
        if (forceReload) {
            categoryFilterSelect.innerHTML = '<option value="">Todas</option>';
        }
        try {
            const snapshot = await db.collection('categoriasInventario').orderBy('nombreCategoria').get();
            snapshot.forEach(doc => {
                const categoria = doc.data();
                if (![...categoryFilterSelect.options].some(o => o.value === categoria.nombreCategoria)) {
                    categoryFilterSelect.add(new Option(categoria.nombreCategoria, categoria.nombreCategoria));
                }
            });
            if (forceReload) categoryFilterSelect.value = currentValue;
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
        const categoryFormContainer = document.querySelector('#categorias-section .card-body > .card');
        if (userIsAdmin) {
            addItemBtn.style.display = 'block';
            if (categoryFormContainer) categoryFormContainer.style.display = 'block';
        } else {
            addItemBtn.style.display = 'none';
            if (categoryFormContainer) categoryFormContainer.style.display = 'none';
        }
        loadCategoriesForFilter();
        loadInventoryData();
        setupEventListeners();
        if (document.getElementById('stats-section')) renderLoanStats();
        loadAndPopulateCategoriesForModal();
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
                    {
                        data: null,
                        className: 'text-center',
                        orderable: false,
                        searchable: false,
                        render: function (data, type, row) {
                            const total = row.cantidad;
                            if (total === undefined || total === null || isNaN(total) || total < 1) {
                                return '';
                            }
                            const disponibles = (row.cantidadRestante === undefined || row.cantidadRestante === null) ? total : row.cantidadRestante;
                            const color = disponibles > 0 ? 'green' : 'red';
                            const style = `color: ${color}; font-weight: bold; font-size: 1.1rem;`;
                            return `<span style="${style}">${disponibles}/${total}</span>`;
                        }
                    },
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
                        orderable: false, searchable: false, className: 'text-center'
                    }
                ]
            });
        } catch (error) {
            console.error("Error al cargar inventario: ", error);
        }
    }

    async function loadAndInitCategoriasTable(forceReload = false) {
        if ($.fn.DataTable.isDataTable('#categorias-table') && !forceReload) return;

        try {
            const snapshot = await db.collection('categoriasInventario').orderBy('idCategoria').get();
            const categories = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));

            if ($.fn.DataTable.isDataTable('#categorias-table')) {
                categoriasTable.clear().rows.add(categories).draw();
            } else {
                categoriasTable = $('#categorias-table').DataTable({
                    language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                    responsive: true, pageLength: 10,
                    data: categories,
                    columns: [
                        { data: 'idCategoria' },
                        { data: 'nombreCategoria' },
                        {
                            data: null, // Data is not directly from a single property, we use the whole row
                            render: function (data, type, row) {
                                if (userIsAdmin) {
                                    // Use row.docId which is the unique document ID. This is the robust way.
                                    return `<button class="btn btn-sm btn-danger delete-category-btn" data-id="${row.docId}" data-name="${row.nombreCategoria}" title="Eliminar Categoria"><i class="fas fa-trash"></i></button>`;
                                }
                                return ''; // Return empty string for non-admins
                            },
                            orderable: false, searchable: false, className: 'text-center'
                        }
                    ]
                });
            }
        } catch (error) {
            console.error("Error al cargar categorías: ", error);
        }
    }

    // --- EVENT LISTENERS & HANDLERS ---

    function setupEventListeners() {
        $('#category-filter').on('change', function () { inventarioTable.column(1).search($(this).val()).draw(); });
        $('button[data-bs-target="#categorias-section"]').on('shown.bs.tab', () => loadAndInitCategoriasTable());
        $('#inventario-table tbody').on('click', '.info-btn', function () { openInfoModal($(this).data('id'), $(this).data('name')); });

        // Eventos para Estadísticas
        $('button[data-bs-target="#stats-section"]').on('shown.bs.tab', () => renderLoanStats());
        $(document).on('change', '#stats-time-filter', function () {
            statsDateFilter.days = parseInt($(this).val());
            renderLoanStats();
        });

        $('#info-filtro-responsable, #info-filtro-evento').on('change', applyInfoFilters);

        if (userIsAdmin) {
            const itemForm = document.getElementById('item-form');
            const categoryForm = document.getElementById('form-add-category');

            $('#add-item-btn').on('click', () => {
                itemForm.reset(); $('#item-id').val('');
                $('#modal-title').text('Añadir Artículo');
                loadAndPopulateCategoriesForModal();
                itemModal.show();
            });

            $('#inventario-table tbody').on('click', '.edit-btn', async function () {
                const docRef = await db.collection('inventario').doc($(this).data('id')).get();
                if (docRef.exists) {
                    const data = docRef.data();
                    itemForm.reset();
                    $('#modal-title').text('Editar Artículo');
                    $('#item-id').val(docRef.id);
                    $('#item-name').val(data.nombre);
                    $('#item-quantity').val(data.cantidad);
                    await loadAndPopulateCategoriesForModal();
                    $('#item-category').val(data.idCategoria); // This is the category's document ID
                    itemModal.show();
                }
            });

            $('#inventario-table tbody').on('click', '.delete-btn', function () {
                const docId = $(this).data('id');
                showConfirmationModal('Confirmar Eliminación', `¿Estás seguro de que quieres eliminar este artículo?`, async () => {
                    await db.collection('inventario').doc(docId).delete();
                    showAlert('Artículo eliminado con éxito.', 'success');
                    loadInventoryData();
                });
            });

            $('#categorias-table tbody').on('click', '.delete-category-btn', function () {
                const docId = $(this).data('id');
                const categoryName = $(this).data('name');
                handleDeleteCategory(docId, categoryName);
            });

            itemForm.addEventListener('submit', handleItemFormSubmit);
            categoryForm.addEventListener('submit', handleAddCategory);
        }
    }

    async function handleItemFormSubmit(e) {
        e.preventDefault();
        const categoriaSelect = document.getElementById('item-category');
        const itemId = $('#item-id').val();
        const itemData = {
            nombre: $('#item-name').val(),
            idCategoria: $('#item-category').val(), // This stores the category's document ID
            categoria: categoriaSelect.options[categoriaSelect.selectedIndex].text,
            cantidad: parseInt($('#item-quantity').val(), 10) || 0,
            cantidadRestante: parseInt($('#item-quantity').val(), 10) || 0
        };
        try {
            if (itemId) {
                await db.collection('inventario').doc(itemId).update(itemData);
                showAlert('Artículo actualizado con éxito.', 'success');
            } else {
                await db.collection('inventario').add(itemData);
                showAlert('Artículo añadido con éxito.', 'success');
            }
            itemModal.hide();
            loadInventoryData();
        } catch (error) {
            showAlert('Error al guardar el artículo.', 'danger');
            console.error("Error saving item: ", error);
        }
    }

    async function handleAddCategory(e) {
        e.preventDefault();
        const newCategoryInput = document.getElementById('new-category-name');
        const newCategoryName = newCategoryInput.value.trim();
        if (!newCategoryName) {
            showAlert('El nombre de la categoría no puede estar vacío.', 'warning');
            return;
        }

        try {
            const categoriesSnapshot = await db.collection('categoriasInventario').get();
            const existingCategories = categoriesSnapshot.docs.map(doc => doc.data());

            if (existingCategories.some(cat => cat.nombreCategoria.toLowerCase() === newCategoryName.toLowerCase())) {
                showAlert(`La categoría "${newCategoryName}" ya existe.`, 'warning');
                return;
            }

            let maxId = 0;
            existingCategories.forEach(cat => {
                if (cat.idCategoria > maxId) {
                    maxId = cat.idCategoria;
                }
            });
            const newNumericId = maxId + 1;

            await db.collection('categoriasInventario').add({
                idCategoria: newNumericId,
                nombreCategoria: newCategoryName
            });

            showAlert('Categoría añadida con éxito.', 'success');
            newCategoryInput.value = '';

            await loadAndInitCategoriasTable(true);
            await loadAndPopulateCategoriesForModal();
            await loadCategoriesForFilter(true);

        } catch (error) {
            showAlert('Error al añadir la categoría.', 'danger');
            console.error("Error adding category: ", error);
        }
    }

    async function handleDeleteCategory(docId, categoryName) {
        const inventorySnapshot = await db.collection('inventario').where('idCategoria', '==', docId).get();

        if (!inventorySnapshot.empty) {
            const itemNames = inventorySnapshot.docs.map(doc => doc.data().nombre).join(', ');
            showAlert(`No se puede eliminar "${categoryName}" porque está asignada a: ${itemNames}.`, 'danger', 10000);
            return;
        }

        showConfirmationModal(
            'Confirmar Eliminación',
            `¿Estás seguro de que quieres eliminar la categoría "${categoryName}"? Esta acción no se puede deshacer.`,
            async () => {
                try {
                    await db.collection('categoriasInventario').doc(docId).delete();
                    showAlert('Categoría eliminada con éxito.', 'success');
                    await loadAndInitCategoriasTable(true);
                    await loadAndPopulateCategoriesForModal();
                    await loadCategoriesForFilter(true);
                } catch (error) {
                    console.error("Error al eliminar la categoría: ", error);
                    showAlert('Error al eliminar la categoría.', 'danger');
                }
            }
        );
    }

    // --- INFO MODAL FUNCTIONS ---

    async function openInfoModal(itemId, itemName) {
        $('#info-modal-title').text(`Historial de: ${itemName}`);
        infoModal.show();
        try {
            const snapshot = await db.collection('prestamos').where('IdArticulo', '==', itemId).orderBy('fechaHoraPrestamo', 'desc').get();
            currentItemHistory = await Promise.all(snapshot.docs.map(async doc => {
                const prestamo = doc.data();
                const respName = await getUserName(prestamo.IdUsuarioResponsable);
                return { ...prestamo, Responsable: respName, fechaHoraPrestamo: prestamo.fechaHoraPrestamo.toDate(), fechaHoraDevolucion: prestamo.fechaHoraDevolucion ? prestamo.fechaHoraDevolucion.toDate() : null };
            }));
            if (!$.fn.DataTable.isDataTable('#tabla-info-historial')) {
                infoHistorialTable = $('#tabla-info-historial').DataTable({
                    language: { url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json" },
                    responsive: true, searching: false, paging: false, info: false,
                    order: [[1, 'desc']],
                    columns: [
                        { data: "PersonaRecibe" },
                        { data: "fechaHoraPrestamo", render: d => d ? d.toLocaleString() : '' },
                        { data: "fechaHoraDevolucion", render: d => d ? d.toLocaleString() : 'N/A' },
                        { data: "Estado", render: d => d === 'Devuelto' ? '<span class="badge bg-success">Devuelto</span>' : '<span class="badge bg-warning text-dark">Pendiente</span>' },
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
        const filtered = currentItemHistory.filter(item => (!respFiltro || item.Responsable === respFiltro) && (!eventFiltro || item.Evento === eventFiltro));
        infoHistorialTable.clear().rows.add(filtered).draw();
    }

    // --- STATISTICS FUNCTIONS ---

    async function renderLoanStats() {
        const canvas = document.getElementById('loansChart');
        if (!canvas) return;

        try {
            const now = new Date();
            const filterDate = new Date();
            filterDate.setDate(now.getDate() - statsDateFilter.days);

            // Consultar préstamos en el periodo
            const snapshot = await db.collection('prestamos')
                .where('fechaHoraPrestamo', '>=', filterDate)
                .get();

            const counts = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                const nombre = data.nombreArticulo || 'Desconocido';
                counts[nombre] = (counts[nombre] || 0) + 1;
            });

            // Ordenar y tomar los 10 mejores
            const sortedData = Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            const labels = sortedData.map(d => d[0]);
            const values = sortedData.map(d => d[1]);

            if (statsChart) statsChart.destroy();

            if (sortedData.length === 0) {
                const ctx = canvas.getContext('2d');
                ctx.font = "16px sans-serif";
                ctx.fillText("No hay datos de préstamos en este periodo.", 10, 50);
                return;
            }

            statsChart = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Número de préstamos',
                        data: values,
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: `Top Artículos Prestados (Últimos ${statsDateFilter.days} días)`
                        }
                    }
                }
            });

        } catch (error) {
            console.error("Error al generar estadísticas: ", error);
            showAlert('No se pudieron cargar las estadísticas.', 'danger');
        }
    }

    document.addEventListener('inventarioActualizado', () => {
        loadInventoryData();           // Refresca tabla de inventario
        loadAndPopulateCategoriesForModal(); // Refresca selects de categorías si se usan
    });

});
