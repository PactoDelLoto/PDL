
document.addEventListener('DOMContentLoaded', function () {
    const itemModal = new bootstrap.Modal(document.getElementById('item-modal'));
    let inventarioTable;

    auth.onAuthStateChanged(user => {
        if (user) {
            window.isUserSocio().then(isSocio => {
                if (isSocio) {
                    initializeInventarioPage();
                } else {
                    console.warn("Acceso denegado. El usuario no es socio.");
                    document.querySelector('main').innerHTML = '<div class="alert alert-danger">Acceso denegado. Debes ser socio para acceder a esta sección.</div>';
                }
            });
        } else {
            console.log("Usuario no autenticado. Redirigiendo a login.");
            window.location.href = '/login.html';
        }
    });

    function initializeInventarioPage() {
        inventarioTable = $('#inventario-table').DataTable({
            language: {
                url: "//cdn.datatables.net/plug-ins/1.11.3/i18n/es_es.json"
            },
            responsive: true,
            pageLength: 10,
            columns: [
                { data: "nombre" },
                { data: "categoria" },
                { data: "cantidad", className: "text-center" },
                {
                    data: "id",
                    render: function (data, type, row) {
                        return `
                            <button class="btn btn-sm btn-info edit-btn" data-id="${data}" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger delete-btn" data-id="${data}" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        `;
                    },
                    orderable: false,
                    className: "text-center"
                }
            ]
        });

        loadInventoryData();
        loadAndPopulateCategories(); // Cargar categorías para el selector
        setupEventListeners();
    }

    async function loadAndPopulateCategories() {
        const categorySelect = document.getElementById('item-category');
        try {
            const snapshot = await db.collection('categoriasInventario').orderBy('nombreCategoria').get();
            if (snapshot.empty) {
                categorySelect.innerHTML = '<option value="" disabled selected>No hay categorías definidas</option>';
                return;
            }
            let optionsHTML = '<option value="" disabled selected>Selecciona una categoría</option>';
            snapshot.forEach(doc => {
                const category = doc.data();
                optionsHTML += `<option value="${category.nombreCategoria}" data-id-cat="${category.idCategoria}">${category.nombreCategoria}</option>`;
            });
            categorySelect.innerHTML = optionsHTML;
        } catch (error) {
            console.error("Error al cargar categorías: ", error);
            categorySelect.innerHTML = '<option value="" disabled selected>Error al cargar categorías</option>';
        }
    }

    function loadInventoryData() {
        db.collection('inventario').onSnapshot(querySnapshot => {
            const inventoryData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            inventarioTable.clear().rows.add(inventoryData).draw();
        }, error => {
            console.error("Error al cargar el inventario: ", error);
        });
    }

    function setupEventListeners() {
        document.getElementById('add-item-btn').addEventListener('click', () => {
            document.getElementById('item-form').reset();
            document.getElementById('item-id').value = '';
            document.getElementById('modal-title').textContent = 'Añadir Artículo';
            // Asegurarse de que el selector de categoría se reinicie
            document.getElementById('item-category').selectedIndex = 0;
            itemModal.show();
        });

        document.getElementById('item-form').addEventListener('submit', (event) => {
            event.preventDefault();
            saveItem();
        });

        $('#inventario-table tbody').on('click', '.edit-btn', function () {
            const itemId = $(this).data('id');
            openEditModal(itemId);
        });

        $('#inventario-table tbody').on('click', '.delete-btn', function () {
            const itemId = $(this).data('id');
            deleteItem(itemId);
        });
    }

    function saveItem() {
        const itemId = document.getElementById('item-id').value;
        const categorySelect = document.getElementById('item-category');
        const selectedOption = categorySelect.options[categorySelect.selectedIndex];

        if (!selectedOption || selectedOption.disabled) {
            alert('Por favor, selecciona una categoría.');
            return;
        }

        const item = {
            nombre: document.getElementById('item-name').value,
            cantidad: document.getElementById('item-quantity').value,
            categoria: selectedOption.value, // Guardar el nombre de la categoría (string)
            idCategoria: parseInt(selectedOption.getAttribute('data-id-cat')) // Guardar el ID de la categoría (number)
        };

        const promise = itemId
            ? db.collection('inventario').doc(itemId).update(item)
            : db.collection('inventario').add(item);

        promise.then(() => {
            itemModal.hide();
        }).catch(error => {
            console.error("Error al guardar el artículo: ", error);
        });
    }

    function openEditModal(itemId) {
        db.collection('inventario').doc(itemId).get().then(doc => {
            if (doc.exists) {
                const item = doc.data();
                document.getElementById('item-id').value = doc.id;
                document.getElementById('item-name').value = item.nombre;
                document.getElementById('item-quantity').value = item.cantidad;
                document.getElementById('modal-title').textContent = 'Editar Artículo';
                
                // Preseleccionar la categoría correcta
                document.getElementById('item-category').value = item.categoria;

                itemModal.show();
            } else {
                console.error("No se encontró el artículo para editar.");
            }
        }).catch(error => {
            console.error("Error al obtener el artículo: ", error);
        });
    }

    function deleteItem(itemId) {
        if (confirm('¿Estás seguro de que quieres eliminar este artículo?')) {
            db.collection('inventario').doc(itemId).delete().catch(error => {
                console.error("Error al eliminar el artículo: ", error);
            });
        }
    }
});
