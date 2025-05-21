(function(global) {
  function getBasePath() {
    const path = window.location.pathname;
    // Cambia 'PDL' si tu carpeta raíz tiene otro nombre
    const match = path.match(/PDL(\/|\\)(.*)/);
    if (!match) return '';
    const subPath = match[2] || '';
    const depth = subPath.split('/').length - 1;
    return '../'.repeat(depth);
  }

  // Devuelve la ruta absoluta a un recurso desde cualquier vista
  function resourcePath(relativePath) {
    return getBasePath() + relativePath;
  }

  // Exporta las funciones globalmente
  global.pathHelper = {
    getBasePath,
    resourcePath
  };
})(window);