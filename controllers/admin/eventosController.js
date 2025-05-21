// Requiere que supabase esté inicializado globalmente (en authController.js)
let EVENTOS = [];
let search = "";
let page = 1;
let pageSize = 10;

// Lee eventos de la tabla "eventos" en Supabase
async function fetchEventos() {
  let { data, error } = await supabase
    .from('eventos')
    .select('*')
    .order('fecha', { ascending: true });

  console.log("EVENTOS DATA:", data);
  console.log("EVENTOS ERROR:", error);

  if (error) {
    showAlert('Error al cargar eventos: ' + error.message, 'danger');
    data = [];
  }
  EVENTOS = data || [];
  renderEventos();
}

function filtrarEventos() {
  const filtro = search.trim().toLowerCase();
  return EVENTOS.filter(ev =>
    (ev.titulo || '').toLowerCase().includes(filtro) ||
    (ev.tipo || '').toLowerCase().includes(filtro) ||
    (ev.fecha || '').includes(filtro) ||
    (ev.lugar || '').toLowerCase().includes(filtro)
  );
}

function renderEventos() {
  const eventosFiltrados = filtrarEventos();
  const total = eventosFiltrados.length;
  const totalPages = Math.ceil(total / pageSize);
  if (page > totalPages) page = totalPages || 1;

  const inicio = (page - 1) * pageSize;
  const fin = inicio + pageSize;
  const eventosPagina = eventosFiltrados.slice(inicio, fin);

  const catalogo = document.getElementById("eventos-catalogo");
  catalogo.innerHTML = eventosPagina.map(ev => `
    <div class="col-12 col-sm-6 col-md-4 col-lg-3 d-flex">
      <div class="event-card flex-fill position-relative">
        <img src="${ev.cartel_url || 'public/media/img/cartel.jpg'}" alt="Cartel de ${ev.titulo}" class="event-img">
        <div class="event-info">
          <div class="event-title">${ev.titulo}</div>
          <div class="event-date"><i class="fa-regular fa-calendar-days me-1"></i> ${ev.fecha} &middot; ${ev.hora || ''}</div>
          <div class="event-extra"><i class="fa-solid fa-location-dot me-1"></i> ${ev.lugar || ''}</div>
        </div>
        <div class="event-hover-details">
          <div><i class="fa-solid fa-circle-info me-1"></i> ${ev.descripcion || ''}</div>
          <div class="mt-2"><i class="fa-solid fa-users me-1"></i> Plazas: ${ev.plazas || ''}</div>
          <div class="mt-1"><span class="badge bg-primary">${ev.tipo || ''}</span></div>
        </div>
      </div>
    </div>
  `).join("");

  renderPaginacion(total, totalPages);
}

function renderPaginacion(total, totalPages) {
  const pag = document.getElementById("event-pagination");
  if (!pag) return;
  pag.innerHTML = "";

  if (totalPages <= 1) return;

  // Botón anterior
  pag.innerHTML += `
    <li class="page-item${page === 1 ? " disabled" : ""}">
      <a class="page-link" href="#" data-page="${page-1}">&laquo;</a>
    </li>
  `;

  // Páginas numeradas (máx 5)
  let start = Math.max(1, page - 2);
  let end = Math.min(totalPages, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);

  for (let i = start; i <= end; i++) {
    pag.innerHTML += `
      <li class="page-item${i === page ? " active" : ""}">
        <a class="page-link" href="#" data-page="${i}">${i}</a>
      </li>
    `;
  }

  // Botón siguiente
  pag.innerHTML += `
    <li class="page-item${page === totalPages ? " disabled" : ""}">
      <a class="page-link" href="#" data-page="${page+1}">&raquo;</a>
    </li>
  `;
}

// Eventos de UI
document.addEventListener("DOMContentLoaded", () => {
  fetchEventos();

  document.getElementById("event-search").addEventListener("input", e => {
    search = e.target.value;
    page = 1;
    renderEventos();
  });

  document.getElementById("event-page-size").addEventListener("change", e => {
    pageSize = Math.max(10, parseInt(e.target.value, 10) || 10);
    page = 1;
    renderEventos();
  });

  document.getElementById("event-pagination").addEventListener("click", e => {
    if (e.target.matches(".page-link")) {
      e.preventDefault();
      const newPage = parseInt(e.target.dataset.page, 10);
      if (!isNaN(newPage) && newPage !== page) {
        page = newPage;
        renderEventos();
      }
    }
  });
});