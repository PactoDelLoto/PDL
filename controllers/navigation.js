window.NAVIGATION_LINKS = [
  //{ label: "Inicio", href: "index.html", external: false },
  { label: "Hazte socio", href: "hazte-socio.html", external: false },
  { label: "Actividades", href: "actividades.html", external: false },
  { label: "Eventos", href: "eventos.html", external: false },
  { label: "Quiénes somos", href: "quienes-somos.html", external: false }
];

window.FOOTER_LINKS = [
  { label: "Aviso legal", href: "aviso-legal.html", external: false },
  { label: "Política de privacidad", href: "privacidad.html", external: false },
  { label: "Contacto", href: "contacto.html", external: false },
  { label: "Instagram", href: "https://www.instagram.com/pacto_del_loto/", external: true }
];



// Navbar dinámico
    const navbarLinks = window.NAVIGATION_LINKS || [];
    const navbarUl = document.getElementById('navbar-links');
    if (navbarUl) {
      navbarUl.innerHTML = navbarLinks.map(link => `
        <li class="nav-item">
          <a class="nav-link${window.location.pathname.endsWith(link.href) ? ' active' : ''}" 
             href="${link.external ? link.href : link.href}"${link.external ? ' target="_blank"' : ''}>
            ${link.label}
          </a>
        </li>
      `).join('');
    }

    // Footer dinámico
    const footerLinks = window.FOOTER_LINKS || [];
    const footerUl = document.getElementById('footer-links');
    if (footerUl) {
      footerUl.innerHTML = footerLinks.map(link => `
        <li class="list-inline-item mx-2">
          <a class="text-light text-decoration-none" 
             href="${link.external ? link.href : link.href}"${link.external ? ' target="_blank"' : ''}>
            ${link.label}
          </a>
        </li>
      `).join('');
    }