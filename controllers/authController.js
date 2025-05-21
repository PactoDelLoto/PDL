// Configura tus claves de Supabase
const SUPABASE_URL = 'https://pfoxsrkocufbqjimtuvh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmb3hzcmtvY3VmYnFqaW10dXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3Mjg0MjUsImV4cCI6MjA2MzMwNDQyNX0.6oJmysXYjoNLpN7H6Oa9_WQ8FTCVyRKXw7zsns2GvZc';

// Inicializa Supabase
const supabase = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Login
async function login(email, password) {
  const { error, user, session } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showAlert('Error de inicio de sesión: ' + error.message, 'danger');
    return false;
  }
  // Redirige al index directamente tras login exitoso
  window.location.href = "../../index.html";
  return true;
}

// Registro
async function register(email, password, name, surname) {
  const { error, user } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.APP_PROPERTIES.EMAIL_REDIRECT_TO,
      data: {
        name,
        surname
      }
    }
  });
  if (error) {
    showAlert('Error al registrar: ' + error.message, 'danger');
    return false;
  }
  showAlert('Registro exitoso. Ya puedes iniciar sesión.', 'success');
  return true;
}

// Confirmación de email desde enlace Supabase
window.handleEmailConfirmation = async function() {
  const url = new URL(window.location.href);
  const access_token = url.searchParams.get('access_token');
  const refresh_token = url.searchParams.get('refresh_token');
  const type = url.searchParams.get('type');
  if (type === 'signup' && access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token
    });
    if (error) {
      showAlert('Hubo un problema al confirmar tu correo: ' + error.message, 'danger');
    } else {
      showAlert('¡Correo confirmado correctamente! Ya puedes iniciar sesión.', 'success');
    }
  } else {
    // Si no hay token, muestra mensaje
    showAlert('No se ha podido confirmar el correo. Intenta de nuevo desde el enlace de tu email.', 'danger');
  }
}

// Ejemplo de uso con formularios
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = loginForm.email.value;
      const password = loginForm.password.value;
      await login(email, password);
    });
  }

  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = registerForm.email.value;
      const password = registerForm.password.value;
      const name = registerForm.name.value;
      const surname = registerForm.surname.value;
      await register(email, password, name, surname);
    });
  }
});

window.renderUserNavbarActions = async function() {
  const userActionsDesktop = document.getElementById('user-navbar-actions');
  const userActionsMobile = document.getElementById('user-navbar-actions-mobile');
  if (!window.supabase) return;

  const { data: { user } } = await supabase.auth.getUser();

  let html = '';
  if (user) {
    const name = user.user_metadata?.name || '';
    const surname = user.user_metadata?.surname || '';
    html = `
      <a href="#" class="me-2 text-white text-decoration-none user-email-link">
        <i class="fa fa-user-circle"></i> ${name} ${surname}
      </a>
      <button title="Cerrar sesión" class="btn btn-link text-white p-0 logout-link" style="vertical-align: middle;">
        <i class="fa fa-right-from-bracket"></i>
      </button>
    `;
  } else {
    html = `
      <a href="user-login.html" class="btn btn-primary">Registro/Iniciar sesión</a>
    `;
  }

  if (userActionsDesktop) userActionsDesktop.innerHTML = html;
  if (userActionsMobile) userActionsMobile.innerHTML = html;

  // Añade el evento logout en ambos
  setTimeout(() => {
    document.querySelectorAll('.logout-link').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await supabase.auth.signOut();
        location.reload();
      });
    });
  }, 0);
};

// Llama automáticamente a la función en cada carga de página
document.addEventListener('DOMContentLoaded', () => {
  window.renderUserNavbarActions();
});

// Login con Google
async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.APP_PROPERTIES.EMAIL_REDIRECT_TO // o la URL a la que quieres volver tras login
    }
  });
  if (error) {
    alert('Error con Google: ' + error.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Login con Google
  const googleLoginBtn = document.getElementById('google-login-btn');
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', signInWithGoogle);
  }
  // Registro con Google (opcional, puedes usar el mismo handler)
  const googleRegisterBtn = document.getElementById('google-register-btn');
  if (googleRegisterBtn) {
    googleRegisterBtn.addEventListener('click', signInWithGoogle);
  }
});

// Ejemplo de registro con redirección de correo electrónico
/*const { data, error } = await supabase.auth.signUp({
  email: 'usuario@correo.com',
  password: '123456',
  options: {
    emailRedirectTo: 'http://localhost:5500/resources/views/confirm-email.html'
  }
});*/

function showAlert(message, type = 'danger', timeout = 4000) {
  const container = document.getElementById('alert-container');
  if (!container) return;
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} alert-dismissible fade show`;
  alert.role = 'alert';
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
  `;
  container.appendChild(alert);
  setTimeout(() => {
    alert.classList.remove('show');
    alert.classList.add('hide');
    setTimeout(() => alert.remove(), 300);
  }, timeout);
}