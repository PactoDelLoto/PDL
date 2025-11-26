document.addEventListener('DOMContentLoaded', function () {
  const tabla = document.getElementById('tablaSocios').getElementsByTagName('tbody')[0];
  const buscador = document.getElementById('buscadorSocios');
  const filtroAnio = document.getElementById('filtroAnio');
  const filtroMes = document.getElementById('filtroMes');
  const btnSociosActuales = document.getElementById('btnSociosActuales');
  const btnLimpiarFiltros = document.getElementById('btnLimpiarFiltros');

  // Guarda los datos originales
  const filasOriginales = Array.from(tabla.rows).map(row => Array.from(row.cells).map(cell => cell.textContent));

  function filtrarTabla() {
    const texto = buscador.value.toLowerCase();
    const anio = filtroAnio.value;
    const mes = filtroMes.value;

    // Limpia la tabla
    tabla.innerHTML = '';

    filasOriginales.forEach(fila => {
      // [numero, nombre, apellido, telefono, mesPagado, anioPagado]
      const [numero, nombre, apellido, telefono, mesPagado, anioPagado] = fila;
      const coincideTexto = nombre.toLowerCase().includes(texto) || apellido.toLowerCase().includes(texto);
      const coincideAnio = !anio || anioPagado === anio;
      const coincideMes = !mes || mesPagado.toLowerCase() === mes.toLowerCase();

      if (coincideTexto && coincideAnio && coincideMes) {
        const tr = document.createElement('tr');
        fila.forEach(dato => {
          const td = document.createElement('td');
          td.textContent = dato;
          tr.appendChild(td);
        });
        tabla.appendChild(tr);
      }
    });
  }

  buscador.addEventListener('input', filtrarTabla);
  filtroAnio.addEventListener('change', filtrarTabla);
  filtroMes.addEventListener('change', filtrarTabla);

  btnSociosActuales.addEventListener('click', function () {
    const fecha = new Date();
    const mesActual = fecha.toLocaleString('es-ES', { month: 'long' }).toLowerCase();
    const anioActual = fecha.getFullYear().toString();

    tabla.innerHTML = '';
    filasOriginales.forEach(fila => {
      const [numero, nombre, apellido, telefono, mesPagado, anioPagado] = fila;
      const meses = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
      ];
      const indiceMesPagado = meses.indexOf(mesPagado.toLowerCase());
      const indiceMesActual = meses.indexOf(mesActual);

      // Al corriente: año actual y mes pagado >= mes actual (incluye pagos adelantados)
      const alCorriente = (anioPagado === anioActual && indiceMesPagado >= indiceMesActual);

      if (alCorriente) {
        const tr = document.createElement('tr');
        fila.forEach(dato => {
          const td = document.createElement('td');
          td.textContent = dato;
          tr.appendChild(td);
        });
        tabla.appendChild(tr);
      }
    });
  });

  btnLimpiarFiltros.addEventListener('click', function () {
    buscador.value = '';
    filtroAnio.value = '';
    filtroMes.value = '';
    filtrarTabla();
  });
});