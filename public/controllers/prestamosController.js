document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    const articuloSelect = document.getElementById('articulo');
    const personaInput = document.getElementById('persona');
    const eventoSelect = document.getElementById('evento');
    const formPrestamo = document.getElementById('form-prestamo');
    const tablaPrestamosActivos = document.getElementById('tabla-prestamos-activos').getElementsByTagName('tbody')[0];
    const tablaPrestamosHistorial = document.getElementById('tabla-prestamos-historial').getElementsByTagName('tbody')[0];
    const filtroArticulo = document.getElementById('filtro-articulo');
    const filtroResponsable = document.getElementById('filtro-responsable');
    const filtroEvento = document.getElementById('filtro-evento');

    let currentUser = null;
    let userCache = {}; // Caché para nombres de usuario

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            loadArticulos();
            loadEventos();
            loadPrestamos();
            loadResponsablesFilter(); // Esta función ahora existirá
        } else {
            console.log("Usuario no autenticado.");
        }
    });

    async function loadArticulos() {
        try {
            const snapshot = await db.collection("inventario").orderBy('nombre').get();
            articuloSelect.innerHTML = '<option value="">Seleccione un artículo</option>';
            filtroArticulo.innerHTML = '<option value="">Todos</option>';
            snapshot.forEach(doc => {
                const item = doc.data();
                articuloSelect.innerHTML += `<option value="${doc.id}">${item.nombre}</option>`;
                filtroArticulo.innerHTML += `<option value="${doc.id}">${item.nombre}</option>`;
            });
        } catch (error) {
            console.error("Error cargando artículos: ", error);
        }
    }
    async function loadEventos() {
        try {
            const snapshot = await db.collection("eventos").orderBy('nombre').get();
            eventoSelect.innerHTML = '<option value="">Desconocido/Ninguno</option>';
            snapshot.forEach(doc => {
                const evento = doc.data();
                eventoSelect.innerHTML += `<option value="${evento.nombre}">${evento.nombre}</option>`;
            });
        } catch (error) {
            console.error("Error cargando eventos: ", error);
        }
    }

    formPrestamo.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idArticulo = articuloSelect.value;
        const nombreArticulo = articuloSelect.options[articuloSelect.selectedIndex].text;
        const personaPrestamo = personaInput.value;
        const eventoPrestamo = eventoSelect.value;

        if (!idArticulo || !personaPrestamo) {
            alert('Por favor, complete todos los campos requeridos.');
            return;
        }

        try {
            await db.collection("prestamos").add({
                IdArticulo: idArticulo,
                nombreArticulo: nombreArticulo,
                PersonaRecibe: personaPrestamo,
                IdUsuarioResponsable: currentUser.uid,
                fechaHoraPrestamo: new Date(),
                fechaHoraDevolucion: null,
                Evento: eventoPrestamo || "N/A",
                Estado: "Pendiente"
            });
            formPrestamo.reset();
            loadPrestamos(); // Recargar las tablas
            alert('Préstamo registrado con éxito.');
        } catch (error) {
            console.error("Error al registrar el préstamo: ", error);
            alert('Hubo un error al registrar el préstamo.');
        }
    });

    async function getUserName(userId) {
        if (!userId) return "Desconocido";
        if (userCache[userId]) return userCache[userId];
        try {
            const userDoc = await db.collection("usuarios").doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                const fullName = `${userData.nombre} ${userData.apellidos}`.trim();
                userCache[userId] = fullName;
                return fullName;
            } else {
                userCache[userId] = "Desconocido";
                return "Desconocido";
            }
        } catch (error) {
            console.error(`Error obteniendo nombre de usuario para ID ${userId}:`, error);
            return "Desconocido";
        }
    }

    async function loadPrestamos() {
        userCache = {};
        loadPrestamosActivos();
        loadHistorialPrestamos();
    }

    async function loadPrestamosActivos() {
        try {
            const querySnapshot = await db.collection("prestamos").where("Estado", "==", "Pendiente").orderBy("fechaHoraPrestamo", "desc").get();
            const htmlPromises = querySnapshot.docs.map(async doc => {
                const prestamo = doc.data();
                const responsable = await getUserName(prestamo.IdUsuarioResponsable);
                return `
                    <tr>
                        <td>${prestamo.nombreArticulo}</td>
                        <td>${prestamo.PersonaRecibe}</td>
                        <td>${prestamo.fechaHoraPrestamo.toDate().toLocaleString()}</td>
                        <td><span class="badge bg-warning text-dark">${prestamo.Estado}</span></td>
                        <td>${responsable}</td>
                        <td><button class="btn btn-success btn-sm btn-devolver" data-id="${doc.id}">Devolver</button></td>
                    </tr>`;
            });
            tablaPrestamosActivos.innerHTML = (await Promise.all(htmlPromises)).join('');
            addEventListenersToDevolverButtons(); // Esta función ahora existirá
        } catch (error) {
            console.error("Error cargando préstamos activos: ", error);
        }
    }

    async function loadHistorialPrestamos() {
        try {
            let query = db.collection("prestamos").where("Estado", "==", "Devuelto");
            if (filtroArticulo.value) query = query.where("IdArticulo", "==", filtroArticulo.value);
            if (filtroResponsable.value) query = query.where("IdUsuarioResponsable", "==", filtroResponsable.value);
            if (filtroEvento.value) query = query.where("Evento", "==", filtroEvento.value);

            const querySnapshot = await query.orderBy("fechaHoraDevolucion", "desc").get();
            const htmlPromises = querySnapshot.docs.map(async doc => {
                const prestamo = doc.data();
                const responsable = await getUserName(prestamo.IdUsuarioResponsable);
                return `
                    <tr>
                        <td>${prestamo.nombreArticulo}</td>
                        <td>${prestamo.PersonaRecibe}</td>
                        <td>${prestamo.fechaHoraPrestamo.toDate().toLocaleString()}</td>
                        <td>${prestamo.fechaHoraDevolucion ? prestamo.fechaHoraDevolucion.toDate().toLocaleString() : ''}</td>
                        <td><span class="badge bg-success">${prestamo.Estado}</span></td>
                        <td>${responsable}</td>
                        <td><button class="btn btn-warning btn-sm btn-cancelar-devolucion" data-id="${doc.id}">Cancelar Devolución</button></td>
                    </tr>`;
            });
            tablaPrestamosHistorial.innerHTML = (await Promise.all(htmlPromises)).join('');
            addEventListenersToCancelarDevolucionButtons(); // Esta función ahora existirá
        } catch (error) {
            console.error("Error cargando historial de préstamos: ", error);
        }
    }
    
    filtroArticulo.addEventListener('change', loadHistorialPrestamos);
    filtroResponsable.addEventListener('change', loadHistorialPrestamos);
    filtroEvento.addEventListener('change', loadHistorialPrestamos);

    function addEventListenersToDevolverButtons() {
        document.querySelectorAll('.btn-devolver').forEach(button => {
            button.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                if (confirm('¿Confirmar la devolución de este artículo?')) {
                    try {
                        await db.collection("prestamos").doc(id).update({
                            Estado: 'Devuelto',
                            fechaHoraDevolucion: new Date()
                        });
                        loadPrestamos();
                    } catch (error) {
                        console.error('Error al devolver el artículo:', error);
                    }
                }
            });
        });
    }

    function addEventListenersToCancelarDevolucionButtons() {
        document.querySelectorAll('.btn-cancelar-devolucion').forEach(button => {
            button.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                if (confirm('¿Está seguro de que desea cancelar la devolución?')) {
                    try {
                        await db.collection("prestamos").doc(id).update({
                            Estado: 'Pendiente',
                            fechaHoraDevolucion: null
                        });
                        loadPrestamos();
                    } catch (error) {
                        console.error('Error al cancelar la devolución:', error);
                    }
                }
            });
        });
    }

    async function loadResponsablesFilter() {
        try {
            const querySnapshot = await db.collection("usuarios").where('isSocio', '==', true).get();
            filtroResponsable.innerHTML = '<option value="">Todos</option>';
            querySnapshot.forEach((doc) => {
                const user = doc.data();
                const option = document.createElement('option');
                option.value = doc.id; // Usar el UID del documento como value
                option.textContent = `${user.nombre} ${user.apellidos}`.trim();
                filtroResponsable.appendChild(option);
            });
        } catch (error) {
            console.error("Error cargando responsables: ", error);
        }
    }
});
