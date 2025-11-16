(function(){
  const API_BASE = window.HC_API_BASE || 'http://localhost:8000';
  const chatBox = document.getElementById('chatBox');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const resetBtn = document.getElementById('resetSession');
  const suggestionBtns = document.querySelectorAll('.suggestion-btn');
  const logoutBtn = document.getElementById('logoutBtn');

  let sessionId = localStorage.getItem('hc_session_id') || '';
  let isWaitingForResponse = false;

  // Fonction pour formater l'heure actuelle
  function getCurrentTime() {
    return new Date().toLocaleTimeString('fr-FR', { 
      hour: '2-digit', minute: '2-digit' 
    });
  }

  // Fonction pour ajouter un message
  function appendMessage(role, text, metadata = {}) {
    const msgEl = document.createElement('div');
    msgEl.className = `msg ${role}`;
    
    const avatar = role === 'user' ? '👤' : '🌱';
    const sender = role === 'user' ? 'Vous' : 'Assistant HydroCare';
    
    let additionalHTML = '';
    
    // Ajouter les métriques d'évaluation si disponibles
    if (metadata.faithfulness !== undefined || metadata.completeness !== undefined) {
      additionalHTML += `
        <div class="evaluation-metrics">
          <small>Évaluation: Fidélité ${metadata.faithfulness || 'N/A'}/5 | Complétude ${metadata.completeness || 'N/A'}/5</small>
        </div>
      `;
    }
    
    // Ajouter les sources si disponibles
    if (metadata.sources && metadata.sources.length > 0) {
      const sourcesText = metadata.sources.map(p => `p. ${p}`).join(', ');
      additionalHTML += `<div class="sources"><small>📚 Sources: ${sourcesText}</small></div>`;
    }

    msgEl.innerHTML = `
      <div class="msg-avatar">${avatar}</div>
      <div class="msg-content">
        <div class="msg-sender">${sender}</div>
        <div class="msg-text">${text}</div>
        ${additionalHTML}
        <div class="msg-time">${getCurrentTime()}</div>
      </div>
    `;
    
    chatBox.appendChild(msgEl);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // Fonction pour afficher l'indicateur de frappe
  function showTypingIndicator() {
    const typingEl = document.createElement('div');
    typingEl.className = 'msg bot typing';
    typingEl.innerHTML = `
      <div class="msg-avatar">🌱</div>
      <div class="msg-content">
        <div class="msg-sender">Assistant HydroCare</div>
        <div class="typing-indicator">
          <div class="typing-dots">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
          </div>
          <span>Assistant écrit...</span>
        </div>
      </div>
    `;
    chatBox.appendChild(typingEl);
    chatBox.scrollTop = chatBox.scrollHeight;
    return typingEl;
  }

  // Fonction pour envoyer un message
  async function sendMessage(question) {
    if (!question.trim() || isWaitingForResponse) return;
    
    isWaitingForResponse = true;
    input.disabled = true;
    
    // Afficher le message de l'utilisateur
    appendMessage('user', question);
    
    // Afficher l'indicateur de frappe
    const typingEl = showTypingIndicator();
    
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          question: question, 
          session_id: sessionId 
        })
      });
      
      if (!res.ok) {
        throw new Error(`Erreur HTTP: ${res.status}`);
      }
      
      const data = await res.json();
      
      // Mettre à jour la session ID
      sessionId = data.session_id || sessionId;
      localStorage.setItem('hc_session_id', sessionId);
      
      let answer = data.answer || 'Désolé, je n\'ai pas pu traiter votre demande.';
      
      // Préparer les métadonnées pour l'affichage
      const metadata = {
        faithfulness: data.faithfulness,
        completeness: data.completeness,
        decision: data.decision,
        sources: data.sources || []
      };
      
      // Supprimer l'indicateur de frappe
      typingEl.remove();
      
      // Afficher la réponse du bot avec les métadonnées
      appendMessage('bot', answer, metadata);
      
    } catch (err) {
      // Supprimer l'indicateur de frappe en cas d'erreur
      typingEl.remove();
      
      console.error('Erreur chat:', err);
      
      let errorMsg = 'Désolé, une erreur est survenue. ';
      
      if (err.message.includes('Failed to fetch') || err.message.includes('Network')) {
        errorMsg += 'Vérifiez que le serveur API est démarré sur ' + API_BASE;
      } else if (err.message.includes('500')) {
        errorMsg += 'Erreur interne du serveur.';
      } else {
        errorMsg += 'Veuillez réessayer.';
      }
      
      appendMessage('error', errorMsg);
    } finally {
      isWaitingForResponse = false;
      input.disabled = false;
      input.focus();
    }
  }

  // Gestion du formulaire
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    
    input.value = '';
    await sendMessage(question);
  });

  // Gestion des boutons de suggestion
  suggestionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const question = btn.getAttribute('data-question');
      if (question) {
        sendMessage(question);
      }
    });
  });

  // Réinitialisation de la session
  resetBtn?.addEventListener('click', async () => {
    if (sessionId) {
      try {
        await fetch(`${API_BASE}/api/reset-session`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ session_id: sessionId })
        });
      } catch (err) {
        console.log('Note: API non disponible pour la réinitialisation de session');
      }
    }
    
    // Réinitialiser localement
    sessionId = '';
    localStorage.removeItem('hc_session_id');
    
    // Vider la zone des messages
    chatBox.innerHTML = '';
    
    // Réafficher le mini welcome (s'il était caché)
    const miniWelcome = document.querySelector('.mini-welcome');
    if (miniWelcome) {
      miniWelcome.style.display = 'block';
    }
    
    // Remettre le focus sur l'input
    input.focus();
    
    console.log('Session réinitialisée');
  });

  // Déconnexion
  logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem('hydrocare_auth');
    localStorage.removeItem('hydrocare_user');
    localStorage.removeItem('hc_session_id');
    window.location.replace('./index.html');
  });

  // Raccourci clavier : Ctrl + Enter ou Enter pour envoyer
  input?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey && e.key === 'Enter') || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });

  // Vérification de l'authentification
  function verifierAuthentification() {
    const isAuth = localStorage.getItem('hydrocare_auth') === '1';
    if (!isAuth) {
      sessionStorage.setItem('hydrocare_redirect_msg', 'Veuillez vous connecter pour accéder au chatbot.');
      window.location.replace('./index.html');
    }
  }

  // Initialisation
  document.addEventListener('DOMContentLoaded', function() {
    verifierAuthentification();
    
    // Récupération du nom d'utilisateur
    const username = localStorage.getItem('hydrocare_user') || 'Utilisateur';
    const userBadge = document.getElementById('userBadge');
    if (userBadge) {
      userBadge.querySelector('.user-name').textContent = username;
    }
    
    // Focus automatique sur l'input
    input?.focus();
  });

})();