// Configuration de l'API
const API_BASE = 'http://localhost:3000/api';

// Base de données des plantes (identique à votre backend)
const PLANT_DATABASE = {
  'basilic': {
    nom: 'Basilic',
    pH_optimal: { min: 5.5, max: 6.5 },
    ec_optimal: { min: 1.0, max: 1.6 },
    ppm_optimal: { min: 500, max: 800 },
    temperature_optimal: { min: 20, max: 25 }
  },
  'laitue': {
    nom: 'Laitue',
    pH_optimal: { min: 5.5, max: 6.5 },
    ec_optimal: { min: 0.8, max: 1.2 },
    ppm_optimal: { min: 400, max: 600 },
    temperature_optimal: { min: 16, max: 20 }
  },
  'tomate': {
    nom: 'Tomate',
    pH_optimal: { min: 5.5, max: 6.5 },
    ec_optimal: { min: 2.0, max: 5.0 },
    ppm_optimal: { min: 1000, max: 2500 },
    temperature_optimal: { min: 18, max: 24 }
  },
  'fraisier': {
    nom: 'Fraisier',
    pH_optimal: { min: 5.5, max: 6.5 },
    ec_optimal: { min: 1.8, max: 2.2 },
    ppm_optimal: { min: 900, max: 1100 },
    temperature_optimal: { min: 18, max: 22 }
  },
  'concombre': {
    nom: 'Concombre',
    pH_optimal: { min: 5.5, max: 6.0 },
    ec_optimal: { min: 1.7, max: 2.5 },
    ppm_optimal: { min: 850, max: 1250 },
    temperature_optimal: { min: 20, max: 25 }
  },
  'poivron': {
    nom: 'Poivron',
    pH_optimal: { min: 5.8, max: 6.3 },
    ec_optimal: { min: 2.0, max: 3.0 },
    ppm_optimal: { min: 1000, max: 1500 },
    temperature_optimal: { min: 20, max: 25 }
  },
  'epinard': {
    nom: 'Épinard',
    pH_optimal: { min: 5.5, max: 6.6 },
    ec_optimal: { min: 1.8, max: 2.3 },
    ppm_optimal: { min: 900, max: 1150 },
    temperature_optimal: { min: 15, max: 20 }
  }
};

// Éléments DOM
const elements = {
    nouvelleMesureBtn: document.getElementById('nouvelleMesureBtn'),
    formulaireMesure: document.getElementById('formulaireMesure'),
    fermerFormulaire: document.getElementById('fermerFormulaire'),
    annulerMesure: document.getElementById('annulerMesure'),
    mesureForm: document.getElementById('mesureForm'),
    resultatsAnalyse: document.getElementById('resultatsAnalyse'),
    fermerResultats: document.getElementById('fermerResultats'),
    alertesContainer: document.getElementById('alertesContainer'),
    recommandationsContainer: document.getElementById('recommandationsContainer'),
    historiqueMesures: document.getElementById('historiqueMesures'),
    rafraichirHistorique: document.getElementById('rafraichirHistorique'),
    filtreSysteme: document.getElementById('filtreSysteme'),
    filtrePlante: document.getElementById('filtrePlante'),
    mesuresTotal: document.getElementById('mesuresTotal'),
    alertesActives: document.getElementById('alertesActives'),
    confirmationModal: document.getElementById('confirmationModal'),
    modalTitre: document.getElementById('modalTitre'),
    modalMessage: document.getElementById('modalMessage'),
    modalAnnuler: document.getElementById('modalAnnuler'),
    modalConfirmer: document.getElementById('modalConfirmer')
};

// État de l'application
let state = {
    mesures: [],
    mesureActuelle: null,
    actionEnCours: null
};

// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    initialiserApp();
});

function initialiserApp() {
    // Configuration des écouteurs d'événements
    configurerEcouteurs();
    
    // Charger l'historique des mesures
    chargerHistorique();
    
    // Vérifier l'authentification
    verifierAuthentification();
}

function configurerEcouteurs() {
    // Gestion du formulaire
    elements.nouvelleMesureBtn.addEventListener('click', afficherFormulaire);
    elements.fermerFormulaire.addEventListener('click', cacherFormulaire);
    elements.annulerMesure.addEventListener('click', cacherFormulaire);
    elements.mesureForm.addEventListener('submit', analyserParametres);
    
    // Gestion des résultats
    elements.fermerResultats.addEventListener('click', cacherResultats);
    
    // Historique
    elements.rafraichirHistorique.addEventListener('click', chargerHistorique);
    elements.filtreSysteme.addEventListener('change', filtrerHistorique);
    elements.filtrePlante.addEventListener('change', filtrerHistorique);
    
    // Modal de confirmation
    elements.modalAnnuler.addEventListener('click', fermerModal);
    elements.modalConfirmer.addEventListener('click', executerAction);
    
    // Fermer modal en cliquant à l'extérieur
    elements.confirmationModal.addEventListener('click', function(e) {
        if (e.target === elements.confirmationModal) {
            fermerModal();
        }
    });
}

function verifierAuthentification() {
    const isAuth = localStorage.getItem('hydrocare_auth') === '1';
    if (!isAuth) {
        sessionStorage.setItem('hydrocare_redirect_msg', 'Veuillez vous connecter pour accéder au suivi des paramètres.');
        window.location.replace('./index.html');
    }
}

// ================= GESTION DES PARAMÈTRES =================

function analyserParametres(e) {
    e.preventDefault();
    
    const formData = new FormData(elements.mesureForm);
    const mesureData = {
        systemeNom: formData.get('systemeNom'),
        planteType: formData.get('planteType'),
        tailleBac: parseInt(formData.get('tailleBac')),
        nombrePlantes: parseInt(formData.get('nombrePlantes')),
        phMesure: parseFloat(formData.get('phMesure')),
        oxygeneMesure: parseFloat(formData.get('oxygeneMesure')),
        temperatureEau: parseFloat(formData.get('temperatureEau')),
        notes: formData.get('notes'),
        dateMesure: new Date().toISOString()
    };

    // Analyser les paramètres
    const analyse = analyserParametresPlante(mesureData);
    
    // Sauvegarder la mesure
    sauvegarderMesure(mesureData, analyse);
    
    // Afficher les résultats
    afficherResultatsAnalyse(mesureData, analyse);
}

function analyserParametresPlante(mesure) {
    const plante = PLANT_DATABASE[mesure.planteType];
    const alertes = [];
    const recommandations = [];

    // Analyse du pH
    if (mesure.phMesure < plante.pH_optimal.min) {
        alertes.push({
            type: 'warning',
            titre: 'pH Trop Bas',
            description: `Le pH (${mesure.phMesure}) est en dessous de la plage optimale (${plante.pH_optimal.min}-${plante.pH_optimal.max})`,
            parametre: 'pH'
        });
        recommandations.push(`Augmenter le pH en ajoutant une solution basique (environ ${(plante.pH_optimal.min - mesure.phMesure).toFixed(1)} point)`);
    } else if (mesure.phMesure > plante.pH_optimal.max) {
        alertes.push({
            type: 'warning',
            titre: 'pH Trop Élevé',
            description: `Le pH (${mesure.phMesure}) est au-dessus de la plage optimale (${plante.pH_optimal.min}-${plante.pH_optimal.max})`,
            parametre: 'pH'
        });
        recommandations.push(`Diminuer le pH en ajoutant une solution acide (environ ${(mesure.phMesure - plante.pH_optimal.max).toFixed(1)} point)`);
    } else {
        alertes.push({
            type: 'success',
            titre: 'pH Optimal',
            description: `Le pH (${mesure.phMesure}) est dans la plage optimale`,
            parametre: 'pH'
        });
    }

    // Analyse de l'oxygène dissous
    const oxygeneOptimal = { min: 5.0, max: 8.0 }; // Plage générale pour l'oxygène
    if (mesure.oxygeneMesure < oxygeneOptimal.min) {
        alertes.push({
            type: 'critical',
            titre: 'Oxygène Insuffisant',
            description: `L'oxygène dissous (${mesure.oxygeneMesure} mg/L) est trop bas pour une croissance optimale`,
            parametre: 'oxygene'
        });
        recommandations.push(`Augmenter l'oxygénation : vérifier les pompes à air, augmenter le débit ou ajouter des pierres à air`);
    } else if (mesure.oxygeneMesure > oxygeneOptimal.max) {
        alertes.push({
            type: 'warning',
            titre: 'Oxygène Élevé',
            description: `L'oxygène dissous (${mesure.oxygeneMesure} mg/L) est au-dessus des niveaux typiques`,
            parametre: 'oxygene'
        });
        recommandations.push(`Surveiller l'oxygénation : niveau élevé mais généralement non problématique`);
    } else {
        alertes.push({
            type: 'success',
            titre: 'Oxygène Optimal',
            description: `L'oxygène dissous (${mesure.oxygeneMesure} mg/L) est dans la plage optimale`,
            parametre: 'oxygene'
        });
    }

    // Analyse de la température
    if (mesure.temperatureEau < plante.temperature_optimal.min) {
        alertes.push({
            type: 'warning',
            titre: 'Température Trop Basse',
            description: `La température (${mesure.temperatureEau}°C) est en dessous de l'optimal (${plante.temperature_optimal.min}-${plante.temperature_optimal.max}°C)`,
            parametre: 'temperature'
        });
        recommandations.push(`Augmenter la température de l'eau avec un chauffage d'aquarium`);
    } else if (mesure.temperatureEau > plante.temperature_optimal.max) {
        alertes.push({
            type: 'critical',
            titre: 'Température Trop Élevée',
            description: `La température (${mesure.temperatureEau}°C) est au-dessus de l'optimal (${plante.temperature_optimal.min}-${plante.temperature_optimal.max}°C)`,
            parametre: 'temperature'
        });
        recommandations.push(`Refroidir l'eau : ombrager le réservoir, utiliser un ventilateur ou un refroidisseur`);
    } else {
        alertes.push({
            type: 'success',
            titre: 'Température Optimale',
            description: `La température (${mesure.temperatureEau}°C) est dans la plage optimale`,
            parametre: 'temperature'
        });
    }

    // Calcul du statut global
    const alertesCritiques = alertes.filter(a => a.type === 'critical').length;
    const alertesWarning = alertes.filter(a => a.type === 'warning').length;
    
    let statutGlobal = 'optimal';
    if (alertesCritiques > 0) statutGlobal = 'critique';
    else if (alertesWarning > 0) statutGlobal = 'alerte';

    return {
        alertes: alertes,
        recommandations: recommandations,
        statutGlobal: statutGlobal,
        plante: plante
    };
}

function sauvegarderMesure(mesure, analyse) {
    // Sauvegarde dans le localStorage (simulation backend)
    const mesuresExistant = JSON.parse(localStorage.getItem('hydrocare_mesures') || '[]');
    
    const nouvelleMesure = {
        id: Date.now().toString(),
        ...mesure,
        analyse: analyse,
        dateCreation: new Date().toISOString()
    };
    
    mesuresExistant.unshift(nouvelleMesure);
    localStorage.setItem('hydrocare_mesures', JSON.stringify(mesuresExistant));
    
    state.mesureActuelle = nouvelleMesure;
}

function afficherResultatsAnalyse(mesure, analyse) {
    // Afficher les alertes
    const alertesHTML = analyse.alertes.map(alerte => `
        <div class="alerte-item alerte-${alerte.type}">
            <div class="alerte-icon">
                ${alerte.type === 'success' ? '✅' : alerte.type === 'warning' ? '⚠️' : '🚨'}
            </div>
            <div class="alerte-content">
                <div class="alerte-titre">${alerte.titre}</div>
                <div class="alerte-description">${alerte.description}</div>
            </div>
        </div>
    `).join('');
    
    elements.alertesContainer.innerHTML = alertesHTML;

    // Afficher les recommandations
    const recommandationsHTML = `
        <h4>Recommandations de Correction</h4>
        <ul class="recommandations-list">
            ${analyse.recommandations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
        ${mesure.notes ? `
            <div class="mesure-notes">
                <strong>Vos notes :</strong> ${mesure.notes}
            </div>
        ` : ''}
    `;
    
    elements.recommandationsContainer.innerHTML = recommandationsHTML;

    // Afficher les résultats
    cacherFormulaire();
    elements.resultatsAnalyse.classList.remove('hidden');
    
    // Mettre à jour les stats
    mettreAJourStats();
}

// ================= GESTION DE L'HISTORIQUE =================

function chargerHistorique() {
    try {
        afficherChargementHistorique();
        
        // Simulation chargement depuis localStorage
        setTimeout(() => {
            const mesures = JSON.parse(localStorage.getItem('hydrocare_mesures') || '[]');
            state.mesures = mesures;
            afficherHistoriqueMesures(mesures);
            mettreAJourFiltresSystemes(mesures);
            mettreAJourStats();
        }, 500);
        
    } catch (error) {
        console.error('Erreur:', error);
        afficherErreurHistorique('Impossible de charger l\'historique des mesures.');
    }
}

function afficherHistoriqueMesures(mesures) {
    if (mesures.length === 0) {
        elements.historiqueMesures.innerHTML = `
            <div class="empty-state">
                <h3>Aucune mesure enregistrée</h3>
                <p>Commencez par saisir vos premières mesures</p>
                <button class="btn primary" onclick="afficherFormulaire()">
                    Première mesure
                </button>
            </div>
        `;
        return;
    }

    const mesuresHTML = mesures.map(mesure => {
        const date = new Date(mesure.dateCreation);
        const parametres = [
            { label: 'pH', valeur: mesure.phMesure, unite: 'pH', optimal: mesure.analyse.plante.pH_optimal },
            { label: 'O₂', valeur: mesure.oxygeneMesure, unite: 'mg/L', optimal: { min: 5.0, max: 8.0 } },
            { label: 'Temp', valeur: mesure.temperatureEau, unite: '°C', optimal: mesure.analyse.plante.temperature_optimal }
        ];

        const parametresHTML = parametres.map(param => {
            const isOptimal = param.valeur >= param.optimal.min && param.valeur <= param.optimal.max;
            const isAlerte = !isOptimal && Math.abs(param.valeur - (param.optimal.min + param.optimal.max) / 2) < 1;
            const classe = isOptimal ? 'optimal' : isAlerte ? 'alerte' : 'critique';
            
            return `
                <div class="parametre-item parametre-${classe}">
                    <div class="parametre-valeur">${param.valeur}</div>
                    <div class="parametre-label">${param.label}</div>
                    <div class="parametre-unite">${param.unite}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="mesure-card">
                <div class="mesure-header">
                    <div class="mesure-info">
                        <h4>${mesure.systemeNom} - ${mesure.analyse.plante.nom}</h4>
                        <div class="mesure-date">${date.toLocaleDateString('fr-FR')} à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div class="mesure-statut statut-${mesure.analyse.statutGlobal}">
                        ${mesure.analyse.statutGlobal}
                    </div>
                </div>
                
                <div class="mesure-parametres">
                    ${parametresHTML}
                </div>
                
                <div class="mesure-details">
                    <div class="mesure-infos-supp">
                        <span class="indicateur indicateur-${mesure.analyse.alertes.filter(a => a.type === 'success').length === mesure.analyse.alertes.length ? 'optimal' : 'alerte'}">
                            ${mesure.analyse.alertes.filter(a => a.type === 'success').length}/${mesure.analyse.alertes.length} paramètres optimaux
                        </span>
                        <span>•</span>
                        <span>${mesure.nombrePlantes} plants</span>
                        <span>•</span>
                        <span>${mesure.tailleBac}L</span>
                    </div>
                </div>
                
                <div class="mesure-actions">
                    <button class="btn ghost small" onclick="voirDetailsMesure('${mesure.id}')">
                        📊 Détails
                    </button>
                    <button class="btn ghost small" onclick="supprimerMesure('${mesure.id}')">
                        🗑️ Supprimer
                    </button>
                </div>
            </div>
        `;
    }).join('');

    elements.historiqueMesures.innerHTML = mesuresHTML;
}

function filtrerHistorique() {
    const systemeFiltre = elements.filtreSysteme.value;
    const planteFiltre = elements.filtrePlante.value;
    
    const mesuresFiltrees = state.mesures.filter(mesure => {
        const matchSysteme = !systemeFiltre || mesure.systemeNom === systemeFiltre;
        const matchPlante = !planteFiltre || mesure.planteType === planteFiltre;
        return matchSysteme && matchPlante;
    });
    
    afficherHistoriqueMesures(mesuresFiltrees);
}

function mettreAJourFiltresSystemes(mesures) {
    const systemes = [...new Set(mesures.map(m => m.systemeNom))];
    
    elements.filtreSysteme.innerHTML = `
        <option value="">Tous les systèmes</option>
        ${systemes.map(sys => `<option value="${sys}">${sys}</option>`).join('')}
    `;
}

// ================= FONCTIONS D'AFFICHAGE =================

function afficherFormulaire() {
    elements.formulaireMesure.classList.remove('hidden');
    elements.nouvelleMesureBtn.style.display = 'none';
    elements.resultatsAnalyse.classList.add('hidden');
}

function cacherFormulaire() {
    elements.formulaireMesure.classList.add('hidden');
    elements.nouvelleMesureBtn.style.display = 'flex';
    elements.mesureForm.reset();
}

function cacherResultats() {
    elements.resultatsAnalyse.classList.add('hidden');
}

function afficherChargementHistorique() {
    elements.historiqueMesures.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Chargement de l'historique...</p>
        </div>
    `;
}

function afficherErreurHistorique(message) {
    elements.historiqueMesures.innerHTML = `
        <div class="error-state">
            <h3>Erreur</h3>
            <p>${message}</p>
            <button class="btn primary" onclick="chargerHistorique()">
                Réessayer
            </button>
        </div>
    `;
}

function mettreAJourStats() {
    const mesures = state.mesures;
    const alertesActives = mesures.filter(m => 
        m.analyse.statutGlobal === 'alerte' || m.analyse.statutGlobal === 'critique'
    ).length;
    
    elements.mesuresTotal.textContent = mesures.length;
    elements.alertesActives.textContent = alertesActives;
}

function voirDetailsMesure(mesureId) {
    const mesure = state.mesures.find(m => m.id === mesureId);
    if (mesure) {
        state.mesureActuelle = mesure;
        afficherResultatsAnalyse(mesure, mesure.analyse);
    }
}

function supprimerMesure(mesureId) {
    state.actionEnCours = { type: 'supprimerMesure', id: mesureId };
    
    elements.modalTitre.textContent = 'Supprimer la mesure';
    elements.modalMessage.textContent = 'Êtes-vous sûr de vouloir supprimer cette mesure ? Cette action est irréversible.';
    elements.confirmationModal.classList.remove('hidden');
}

function executerAction() {
    if (!state.actionEnCours) return;

    try {
        switch (state.actionEnCours.type) {
            case 'supprimerMesure':
                const mesures = JSON.parse(localStorage.getItem('hydrocare_mesures') || '[]');
                const nouvellesMesures = mesures.filter(m => m.id !== state.actionEnCours.id);
                localStorage.setItem('hydrocare_mesures', JSON.stringify(nouvellesMesures));
                afficherNotification('Mesure supprimée avec succès', 'success');
                break;
        }

        fermerModal();
        chargerHistorique(); // Recharger l'historique
        
    } catch (error) {
        console.error('Erreur:', error);
        afficherNotification('Erreur lors de l\'opération', 'error');
    }
}

function fermerModal() {
    elements.confirmationModal.classList.add('hidden');
    state.actionEnCours = null;
}

function afficherNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? 'var(--success-soft)' : type === 'error' ? 'var(--warning-soft)' : 'var(--bg-card)'};
        color: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--warning)' : 'var(--text-primary)'};
        border: 1px solid ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--warning)' : 'var(--border)'};
        border-radius: var(--radius-sm);
        z-index: 1000;
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
        font-weight: 500;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Ajouter les animations CSS pour les notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
 // --------- Déconnexion ---------
  logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem('hydrocare_auth');
    localStorage.removeItem('hydrocare_user');
    window.location.replace('./index.html');
  });