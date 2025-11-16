// --------- Initialisation ---------
document.addEventListener('DOMContentLoaded', function() {
  // Elements DOM
  const yearDash = document.getElementById('yearDash');
  const userBadge = document.getElementById('userBadge');
  const userGreeting = document.getElementById('userGreeting');
  const logoutBtn = document.getElementById('logoutBtn');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const viewTitle = document.getElementById('viewTitle');
  const viewContent = document.getElementById('viewContent');
  const dashSidebar = document.querySelector('.dash-sidebar');

  // --------- Configuration de base ---------
  yearDash.textContent = new Date().getFullYear();

  // Récupération et affichage des infos utilisateur
  const username = localStorage.getItem('hydrocare_user') || 'benhendaimen10';
  const userNameElement = userBadge.querySelector('.user-name');
  const userGreetingElement = document.getElementById('userGreeting');
  
  if (userNameElement) userNameElement.textContent = username;
  if (userGreetingElement) userGreetingElement.textContent = username;

  // --------- Navigation interne ---------
  const links = Array.from(document.querySelectorAll('.dash-nav a'));
  const sections = Array.from(viewContent.querySelectorAll('[data-view]'));

  function activateView(view) {
    // Mise à jour des liens de navigation
    links.forEach(a => {
      a.classList.toggle('active', a.dataset.view === view);
    });

    // Affichage de la section correspondante
    sections.forEach(sec => {
      const match = sec.dataset.view === view || (view === 'home' && sec.dataset.view === 'home');
      sec.classList.toggle('hidden', !match);
    });

    // Mise à jour du titre
    const activeLink = links.find(a => a.classList.contains('active'));
    viewTitle.textContent = activeLink ? activeLink.textContent.trim() : 'Tableau de bord';

    // Redirection automatique pour contrats
    if (view === 'contrats') {
      setTimeout(() => {
        window.location.href = 'contrats.html';
      }, 1500);
    }
  }

  // Gestion des clics sur les liens de navigation
  links.forEach(a => {
    a.addEventListener('click', e => {
      const view = a.dataset.view;
      
      if (view === 'contrats') {
        e.preventDefault();
        activateView('contrats');
        return;
      }
      
      if (view === 'chatbot') {
        e.preventDefault();
        window.location.href = 'chat.html';
        return;
      }
      
      e.preventDefault();
      activateView(view);
    });
  });

  // Activation de la vue par défaut
  activateView('home');

  // --------- Gestion de la sidebar ---------
  sidebarToggle?.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      dashSidebar.classList.toggle('active');
    }
  });

  // Fermer la sidebar en cliquant à l'extérieur (mobile)
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && 
        dashSidebar.classList.contains('active') && 
        !dashSidebar.contains(e.target) && 
        e.target !== sidebarToggle) {
      dashSidebar.classList.remove('active');
    }
  });

  // --------- Déconnexion ---------
  logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem('hydrocare_auth');
    localStorage.removeItem('hydrocare_user');
    window.location.replace('./index.html');
  });

  // --------- Simulation des données en temps réel ---------
  const sensorsCount = document.getElementById('sensorsCount');
  const plantsCount = document.getElementById('plantsCount');
  const humidityAlert = document.getElementById('humidityAlert');

  function randomizeStats() {
    if (sensorsCount) {
      const newSensors = 10 + Math.floor(Math.random() * 5);
      sensorsCount.textContent = newSensors;
    }
    
    if (plantsCount) {
      const newPlants = 30 + Math.floor(Math.random() * 10);
      plantsCount.textContent = newPlants;
    }
    
    if (humidityAlert) {
      const newAlerts = Math.floor(Math.random() * 3);
      humidityAlert.textContent = newAlerts;
    }
  }

  // Mise à jour périodique des stats
  setInterval(randomizeStats, 8000);

  console.log('Dashboard HydroCare initialisé avec succès');
});
