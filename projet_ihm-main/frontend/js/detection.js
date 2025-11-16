(function(){
  const API_BASE = window.HC_API_BASE || 'http://localhost:8003';
  const HEALTH_ENDPOINT = API_BASE + '/health';
  const ANALYZE_ENDPOINT = API_BASE + '/analyze';
  
  const imageInput = document.getElementById('imageInput');
  const uploadZone = document.getElementById('uploadZone');
  const uploadPreview = document.getElementById('uploadPreview');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const resultsPlaceholder = document.getElementById('resultsPlaceholder');
  const resultsContent = document.getElementById('resultsContent');
  const confidenceFill = document.getElementById('confidenceFill');
  const confidenceValue = document.getElementById('confidenceValue');
  const diseaseName = document.getElementById('diseaseName');
  const diseaseDescription = document.getElementById('diseaseDescription');
  const recommendationsList = document.getElementById('recommendationsList');
  const diagnosisIcon = document.getElementById('diagnosisIcon');
  const diagnosisTitle = document.getElementById('diagnosisTitle');
  const saveReportBtn = document.getElementById('saveReportBtn');
  const shareBtn = document.getElementById('shareBtn');
  const historyBtn = document.getElementById('historyBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  let currentImageFile = null;

  // Initialisation
  function init() {
    setupEventListeners();
    verifierAuthentification();
    checkBackendHealth();
  }

  async function checkBackendHealth(){
    try {
      const response = await fetch(HEALTH_ENDPOINT, { method: 'GET' });
      if(!response.ok) throw new Error('Statut ' + response.status);
      
      const data = await response.json();
      if (!data.model_loaded) {
        throw new Error('Modèle non chargé');
      }
      
      console.log('Backend de détection connecté avec succès');
    } catch (error) {
      analyzeBtn.disabled = true;
      analyzeBtn.innerHTML = '<span class="btn-icon">❌</span> API indisponible';
      showError('Le backend de détection est indisponible. Vérifiez qu\'il est lancé sur le port 8003.');
      console.error('Health check failed:', error);
    }
  }

  function setupEventListeners() {
    // Gestion de l'upload d'image
    imageInput.addEventListener('change', handleImageSelect);
    
    // Drag and drop
    uploadZone.addEventListener('dragover', handleDragOver);
    uploadZone.addEventListener('dragleave', handleDragLeave);
    uploadZone.addEventListener('drop', handleDrop);
    
    // Clic sur la zone d'upload
    uploadZone.addEventListener('click', () => imageInput.click());
    
    // Bouton d'analyse
    analyzeBtn.addEventListener('click', analyzeImage);
    
    // Boutons d'action
    saveReportBtn.addEventListener('click', saveReport);
    shareBtn.addEventListener('click', shareReport);
    historyBtn.addEventListener('click', showHistory);
    
    // Déconnexion
    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleLogout);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  }

  function handleDragLeave(e) {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
  }

  function handleDrop(e) {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      handleImageFile(files[0]);
    }
  }

  function handleImageSelect(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      handleImageFile(file);
    }
  }

  function handleImageFile(file) {
    // Vérifier la taille du fichier (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showError('L\'image est trop volumineuse. Maximum 10MB.');
      return;
    }
    
    currentImageFile = file;
    
    // Afficher la prévisualisation
    const reader = new FileReader();
    reader.onload = function(e) {
      uploadPreview.innerHTML = `<img src="${e.target.result}" alt="Image à analyser" />`;
      uploadPreview.style.display = 'block';
      uploadZone.querySelector('.upload-placeholder').style.display = 'none';
      
      // Activer le bouton d'analyse
      analyzeBtn.disabled = false;
    };
    reader.readAsDataURL(file);
  }

  async function analyzeImage() {
    if (!currentImageFile) {
      showError('Veuillez d\'abord sélectionner une image.');
      return;
    }
    
    // Afficher l'indicateur de chargement
    analyzeBtn.innerHTML = '<span class="btn-icon">⏳</span>Analyse en cours...';
    analyzeBtn.disabled = true;
    
    try {
      const formData = new FormData();
      formData.append('image', currentImageFile);
      
      console.log('Envoi de la requête à l API...');
      const response = await fetch(ANALYZE_ENDPOINT, {
        method: 'POST',
        body: formData
      });
      
      console.log('Réponse reçue:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur API: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log('Résultat de l API:', result);
      displayResults(result);
      
    } catch (error) {
      console.error('Erreur analyse:', error);
      showError('Erreur lors de l\'analyse: ' + error.message);
    } finally {
      analyzeBtn.innerHTML = '<span class="btn-icon">🔍</span>Analyser l\'image';
      analyzeBtn.disabled = false;
    }
  }

  function displayResults(result) {
    console.log('Affichage des résultats:', result);
    
    // Masquer le placeholder et afficher les résultats
    resultsPlaceholder.style.display = 'none';
    resultsContent.style.display = 'block';
    
    // Mettre à jour la confiance
    const confidence = result.confidence || 0;
    confidenceFill.style.width = `${confidence}%`;
    confidenceValue.textContent = `${confidence}%`;
    
    // Mettre à jour le diagnostic
    const disease = result.disease || 'Inconnu';
    const description = result.description || 'Aucune description disponible.';
    
    diseaseName.textContent = formatDiseaseName(disease); // CORRECTION : enlevé "this."
    diseaseDescription.textContent = description;
    
    // Mettre à jour l'icône et le style selon le diagnostic
    updateDiagnosisStyle(result.severity || 'healthy'); // CORRECTION : enlevé "this."
    
    // Afficher les recommandations
    displayRecommendations(result.recommendations || []); // CORRECTION : enlevé "this."
  }

  function formatDiseaseName(disease) {
    // Formater le nom de la maladie pour un affichage plus lisible
    return disease
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/bell/g, 'bell ')
      .trim();
  }

  function updateDiagnosisStyle(severity) {
    // Retirer toutes les classes de diagnostic
    resultsContent.classList.remove('diagnosis-healthy', 'diagnosis-warning', 'diagnosis-danger');
    
    switch(severity) {
      case 'healthy':
        diagnosisIcon.textContent = '✅';
        diagnosisTitle.textContent = 'Plante Saine';
        resultsContent.classList.add('diagnosis-healthy');
        confidenceFill.style.background = 'var(--success, #4CAF50)';
        break;
      case 'warning':
        diagnosisIcon.textContent = '⚠️';
        diagnosisTitle.textContent = 'Attention Requise';
        resultsContent.classList.add('diagnosis-warning');
        confidenceFill.style.background = 'var(--warning, #FF9800)';
        break;
      case 'danger':
        diagnosisIcon.textContent = '🚨';
        diagnosisTitle.textContent = 'Maladie Détectée';
        resultsContent.classList.add('diagnosis-danger');
        confidenceFill.style.background = 'var(--error, #F44336)';
        break;
      default:
        diagnosisIcon.textContent = '❓';
        diagnosisTitle.textContent = 'Diagnostic';
        confidenceFill.style.background = 'var(--info, #2196F3)';
    }
  }

  function displayRecommendations(recommendations) {
    recommendationsList.innerHTML = '';
    
    if (recommendations.length === 0) {
      recommendationsList.innerHTML = `
        <div class="recommendation-item">
          <span class="recommendation-icon">💡</span>
          <span class="recommendation-text">Continuez les bonnes pratiques de culture</span>
        </div>
      `;
      return;
    }
    
    recommendations.forEach(rec => {
      const item = document.createElement('div');
      item.className = 'recommendation-item';
      item.innerHTML = `
        <span class="recommendation-icon">📝</span>
        <span class="recommendation-text">${rec}</span>
      `;
      recommendationsList.appendChild(item);
    });
  }

  function showError(message) {
    // Afficher un message d'erreur dans les résultats
    resultsPlaceholder.style.display = 'none';
    resultsContent.style.display = 'block';
    
    diseaseName.textContent = 'Erreur';
    diseaseDescription.textContent = message;
    diagnosisIcon.textContent = '❌';
    diagnosisTitle.textContent = 'Erreur';
    
    confidenceFill.style.width = '0%';
    confidenceValue.textContent = '0%';
    
    recommendationsList.innerHTML = `
      <div class="recommendation-item">
        <span class="recommendation-icon">🔄</span>
        <span class="recommendation-text">Veuillez réessayer avec une autre image</span>
      </div>
    `;
  }

  function saveReport() {
    if (!currentImageFile) {
      alert('Aucune analyse à sauvegarder.');
      return;
    }
    
    // Simuler la sauvegarde du rapport
    const report = {
      date: new Date().toLocaleString('fr-FR'),
      disease: diseaseName.textContent,
      confidence: confidenceValue.textContent,
      image: currentImageFile ? currentImageFile.name : 'N/A',
      timestamp: new Date().getTime()
    };
    
    // Sauvegarder dans le localStorage
    const history = JSON.parse(localStorage.getItem('hc_analysis_history') || '[]');
    history.unshift(report);
    localStorage.setItem('hc_analysis_history', JSON.stringify(history.slice(0, 10))); // Garder les 10 derniers
    
    // Feedback visuel
    const originalText = saveReportBtn.innerHTML;
    saveReportBtn.innerHTML = '<span class="btn-icon">✅</span>Sauvegardé !';
    setTimeout(() => {
      saveReportBtn.innerHTML = originalText;
    }, 2000);
  }

  function shareReport() {
    if (!navigator.share) {
      alert('Fonction de partage non supportée sur ce navigateur. Copiez le lien manuellement.');
      return;
    }
    
    navigator.share({
      title: 'Rapport d\'analyse HydroCare',
      text: `Diagnostic: ${diseaseName.textContent} (${confidenceValue.textContent} de confiance)`,
      url: window.location.href
    }).catch(error => {
      console.log('Partage annulé ou erreur:', error);
    });
  }

  function showHistory() {
    const history = JSON.parse(localStorage.getItem('hc_analysis_history') || '[]');
    if (history.length === 0) {
      alert('Aucun historique d\'analyse disponible');
      return;
    }
    
    const historyText = history.map((item, index) => 
      `${index + 1}. ${item.date} - ${item.disease} (${item.confidence})`
    ).join('\n');
    
    alert('Historique des analyses:\n\n' + historyText);
  }

  function verifierAuthentification() {
    const isAuth = localStorage.getItem('hydrocare_auth') === '1';
    if (!isAuth) {
      sessionStorage.setItem('hydrocare_redirect_msg', 'Veuillez vous connecter pour accéder à la détection de maladies.');
      window.location.replace('./index.html');
    }
  }

  function handleLogout() {
    localStorage.removeItem('hydrocare_auth');
    localStorage.removeItem('hydrocare_user');
    localStorage.removeItem('hc_session_id');
    window.location.replace('./index.html');
  }

  // Initialisation au chargement
  document.addEventListener('DOMContentLoaded', init);

})();