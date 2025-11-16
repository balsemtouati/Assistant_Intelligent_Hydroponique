// ------------------ Utilitaires Améliorés ------------------
const qs = sel => document.querySelector(sel);
const qsa = sel => Array.from(document.querySelectorAll(sel));

// Éléments principaux
const body = document.body;
const overlay = qs('#overlay');
const modal = qs('#authModal');
const openLoginBtn = qs('#openLogin');
const openLoginMobileBtn = qs('#openLoginMobile');
const ctaRegisterBtn = qs('#ctaRegister');
const yearSpan = qs('#year');
const burger = qs('#burger');
const mobileMenu = qs('#mobileMenu');
const siteHeader = qs('.site-header');

// Tabs & forms
const tabButtons = qsa('.tab');
const forms = qsa('.form');

// ------------------ Initialisation ------------------
document.addEventListener('DOMContentLoaded', function() {
  initApp();
});

function initApp() {
  // Année dynamique footer
  yearSpan.textContent = new Date().getFullYear();
  
  // Gestion du scroll du header
  initHeaderScroll();
  
  // Initialisation des composants
  initMobileMenu();
  initAuthModal();
  initForms();
  
  // Message de redirection
  showRedirectMessage();
}

// ------------------ Gestion du Header ------------------
function initHeaderScroll() {
  let lastScrollY = window.scrollY;
  
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    
    if (currentScrollY > 100) {
      siteHeader.classList.add('scrolled');
    } else {
      siteHeader.classList.remove('scrolled');
    }
    
    lastScrollY = currentScrollY;
  });
}

// ------------------ Menu Mobile Amélioré ------------------
function initMobileMenu() {
  if (!burger || !mobileMenu) return;

  burger.addEventListener('click', (e) => {
    e.stopPropagation();
    const expanded = burger.getAttribute('aria-expanded') === 'true';
    burger.setAttribute('aria-expanded', String(!expanded));
    mobileMenu.hidden = expanded;
    burger.classList.toggle('active');
    
    // Empêcher le scroll du body quand le menu est ouvert
    if (!expanded) {
      body.style.overflow = 'hidden';
    } else {
      body.style.overflow = '';
    }
  });

  // Fermer le menu en cliquant sur un lien
  mobileMenu.addEventListener('click', (e) => {
    if (e.target.matches('a') || e.target.matches('button')) {
      closeMobileMenu();
    }
  });

  // Fermer le menu en cliquant à l'extérieur
  document.addEventListener('click', (e) => {
    if (!mobileMenu.hidden && !burger.contains(e.target) && !mobileMenu.contains(e.target)) {
      closeMobileMenu();
    }
  });

  // Fermer le menu avec la touche Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mobileMenu.hidden) {
      closeMobileMenu();
    }
  });
}

function closeMobileMenu() {
  burger.setAttribute('aria-expanded', 'false');
  mobileMenu.hidden = true;
  burger.classList.remove('active');
  body.style.overflow = '';
}

// ------------------ Modal Auth Amélioré ------------------
function initAuthModal() {
  // Ouvrir modal
  ['#openLogin', '#openLoginMobile'].forEach(sel => {
    const btn = qs(sel);
    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal('login');
    });
  });

  ctaRegisterBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    openModal('register');
  });

  // Fermer modal
  modal?.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) {
      closeModal();
    }
  });

  overlay?.addEventListener('click', closeModal);

  // Fermer avec Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.open) {
      closeModal();
    }
  });

  // Empêcher la fermeture en cliquant dans le modal
  modal?.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

function openModal(mode = 'login') {
  body.classList.add('modal-open');
  overlay.classList.add('active');
  overlay.classList.remove('hidden');
  
  if (typeof modal.showModal === 'function') {
    modal.showModal();
  } else {
    modal.setAttribute('open', '');
  }
  
  switchMode(mode);
  
  // Focus sur le premier champ
  setTimeout(() => {
    const firstInput = modal.querySelector('.form.active input');
    firstInput?.focus();
  }, 100);
}

function closeModal() {
  body.classList.remove('modal-open');
  overlay.classList.remove('active');
  setTimeout(() => overlay.classList.add('hidden'), 350);
  
  if (typeof modal.close === 'function') {
    modal.close();
  } else {
    modal.removeAttribute('open');
  }
  
  // Réinitialiser les forms
  forms.forEach(form => form.reset());
  clearAllErrors();
}

// ------------------ Gestion des Tabs ------------------
function switchMode(mode) {
  // Mettre à jour les tabs
  tabButtons.forEach(btn => {
    const isActive = btn.dataset.tab === mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  // Mettre à jour les forms
  forms.forEach(f => {
    const isActive = f.id.toLowerCase().includes(mode);
    f.classList.toggle('active', isActive);
    f.setAttribute('aria-hidden', String(!isActive));
  });

  // Mettre à jour le titre
  const title = qs('#authTitle');
  title.textContent = mode === 'login' ? 'Connexion' : 'Créer un compte';
  title.setAttribute('data-mode', mode);
}

// Événements des tabs
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    switchMode(btn.dataset.tab);
    // Annoncer le changement pour les lecteurs d'écran
    announceToScreenReader(`Onglet ${btn.textContent} activé`);
  });
});

// Switch via liens inline
modal?.addEventListener('click', (e) => {
  const switchBtn = e.target.closest('[data-switch]');
  if (switchBtn) {
    switchMode(switchBtn.dataset.switch);
  }
});

// ------------------ Révéler mot de passe ------------------
modal?.addEventListener('click', (e) => {
  const revealBtn = e.target.closest('.reveal');
  if (revealBtn) {
    const input = revealBtn.parentElement.querySelector('input');
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
    revealBtn.textContent = type === 'password' ? '👁️' : '🙈';
    revealBtn.setAttribute('aria-label', 
      type === 'password' ? 'Afficher le mot de passe' : 'Masquer le mot de passe'
    );
  }
});

// ------------------ Validation des Forms Améliorée ------------------
function initForms() {
  forms.forEach(form => {
    form.addEventListener('submit', handleFormSubmit);
    
    // Validation en temps réel
    const inputs = form.querySelectorAll('input[required]');
    inputs.forEach(input => {
      input.addEventListener('blur', () => validateField(input));
      input.addEventListener('input', () => {
        clearError(input);
        updateFieldHelp(input);
      });
    });
  });
}

function handleFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  
  if (!validateForm(form)) {
    // Focus sur le premier champ en erreur
    const firstError = form.querySelector('[aria-invalid="true"]');
    firstError?.focus();
    return;
  }

  // Simulation d'envoi
  const data = Object.fromEntries(new FormData(form));
  console.log('[Form submit]', form.id, data);
  
  // Feedback visuel
  showFormSuccess(form);
  
  // Stockage auth simulée
  localStorage.setItem('hydrocare_auth', '1');
  if (data.username) {
    localStorage.setItem('hydrocare_user', data.username);
  } else if (data.email) {
    const pseudo = data.email.split('@')[0];
    localStorage.setItem('hydrocare_user', pseudo);
  }
  
  // Redirection vers dashboard
  setTimeout(() => {
    window.location.href = 'dashboard.html';
  }, 1500);
}

function validateForm(form) {
  let valid = true;
  const inputs = form.querySelectorAll('input[required]');
  
  inputs.forEach(inp => {
    if (!validateField(inp)) {
      valid = false;
    }
  });

  // Validation spécifique pour les checkboxes
  const terms = form.querySelector('input[name="terms"][required]');
  if (terms && !terms.checked) {
    showError(terms, 'Vous devez accepter les conditions pour continuer');
    valid = false;
  }

  return valid;
}

function validateField(input) {
  const value = input.value.trim();
  let isValid = true;
  let message = '';

  if (!value) {
    isValid = false;
    message = 'Ce champ est requis';
  } else if (input.name === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    isValid = false;
    message = 'Adresse email invalide';
  } else if (input.name === 'password' && value.length < 6) {
    isValid = false;
    message = 'Le mot de passe doit contenir au moins 6 caractères';
  } else if (input.name === 'username' && value.length < 3) {
    isValid = false;
    message = 'Le nom d\'utilisateur doit contenir au moins 3 caractères';
  }

  if (!isValid) {
    showError(input, message);
  } else {
    clearError(input);
    showSuccess(input);
  }

  return isValid;
}

function showError(input, message) {
  const field = input.closest('.field');
  const errorElement = field.querySelector('.error');
  
  input.setAttribute('aria-invalid', 'true');
  input.classList.add('error');
  
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
  
  // Annoncer l'erreur pour les lecteurs d'écran
  announceToScreenReader(message);
}

function clearError(input) {
  const field = input.closest('.field');
  const errorElement = field?.querySelector('.error');
  
  input.removeAttribute('aria-invalid');
  input.classList.remove('error');
  
  if (errorElement) {
    errorElement.textContent = '';
    errorElement.style.display = 'none';
  }
}

function clearAllErrors() {
  const errorElements = qsa('.error[data-error-for]');
  errorElements.forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });
  
  const invalidInputs = qsa('[aria-invalid="true"]');
  invalidInputs.forEach(input => {
    input.removeAttribute('aria-invalid');
    input.classList.remove('error');
  });
}

function showSuccess(input) {
  input.classList.add('success');
  setTimeout(() => input.classList.remove('success'), 2000);
}

function updateFieldHelp(input) {
  // Implémentation pour mettre à jour les messages d'aide en temps réel
  // (optionnel - à développer selon les besoins)
}

function showFormSuccess(form) {
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  
  submitBtn.innerHTML = '✅ Envoi en cours...';
  submitBtn.disabled = true;
  
  setTimeout(() => {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }, 1500);
}

// ------------------ Message de Redirection ------------------
function showRedirectMessage() {
  const redirectMsg = sessionStorage.getItem('hydrocare_redirect_msg');
  if (redirectMsg) {
    sessionStorage.removeItem('hydrocare_redirect_msg');
    
    const bar = document.createElement('div');
    bar.className = 'notice-bar';
    bar.textContent = redirectMsg;
    bar.setAttribute('role', 'alert');
    bar.setAttribute('aria-live', 'polite');
    
    document.body.prepend(bar);
    
    setTimeout(() => bar.classList.add('visible'), 30);
    setTimeout(() => {
      bar.classList.remove('visible');
      setTimeout(() => bar.remove(), 600);
    }, 5000);
  }
}

// ------------------ Accessibilité ------------------
function announceToScreenReader(message) {
  const announcer = document.getElementById('a11y-announcer') || createA11yAnnouncer();
  announcer.textContent = message;
}

function createA11yAnnouncer() {
  const announcer = document.createElement('div');
  announcer.id = 'a11y-announcer';
  announcer.className = 'sr-only';
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  document.body.appendChild(announcer);
  return announcer;
}

// ------------------ Empêcher les Comportements Indésirables ------------------
// Empêcher le scroll de l'arrière-plan sur mobile
modal?.addEventListener('wheel', e => e.stopPropagation());
modal?.addEventListener('touchmove', e => e.stopPropagation());

// Exposer les fonctions globales
window.openModal = openModal;
window.closeModal = closeModal;
window.scrollToSection = function(sectionId) {
  document.getElementById(sectionId)?.scrollIntoView({ 
    behavior: 'smooth' 
  });
};

console.log('🚀 HydroCare - Interface initialisée avec succès');
 // --------- Déconnexion ---------
  logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem('hydrocare_auth');
    localStorage.removeItem('hydrocare_user');
    window.location.replace('./index.html');
  });