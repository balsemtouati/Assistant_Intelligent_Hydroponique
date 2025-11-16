// Configuration de l'API
const API_BASE = 'http://localhost:3000/api';

// Éléments DOM
const elements = {
    nouveauContratBtn: document.getElementById('nouveauContratBtn'),
    formulaireContrat: document.getElementById('formulaireContrat'),
    fermerFormulaire: document.getElementById('fermerFormulaire'),
    annulerContrat: document.getElementById('annulerContrat'),
    contratForm: document.getElementById('contratForm'),
    contratsListe: document.getElementById('contratsListe'),
    detailsContrat: document.getElementById('detailsContrat'),
    contratsActifs: document.getElementById('contratsActifs'),
    plantsTotal: document.getElementById('plantsTotal'),
    confirmationModal: document.getElementById('confirmationModal'),
    modalTitre: document.getElementById('modalTitre'),
    modalMessage: document.getElementById('modalMessage'),
    modalAnnuler: document.getElementById('modalAnnuler'),
    modalConfirmer: document.getElementById('modalConfirmer')
};

// État de l'application
let state = {
    contrats: [],
    contratSelectionne: null,
    actionEnCours: null
};

// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    initialiserApp();
});

function initialiserApp() {
    // Configuration des écouteurs d'événements
    configurerEcouteurs();
    
    // Charger les contrats
    chargerContrats();
    
    // Vérifier l'authentification
    verifierAuthentification();
}

function configurerEcouteurs() {
    // Gestion du formulaire
    elements.nouveauContratBtn.addEventListener('click', afficherFormulaire);
    elements.fermerFormulaire.addEventListener('click', cacherFormulaire);
    elements.annulerContrat.addEventListener('click', cacherFormulaire);
    elements.contratForm.addEventListener('submit', creerContrat);
    
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
        sessionStorage.setItem('hydrocare_redirect_msg', 'Veuillez vous connecter pour accéder aux contrats.');
        window.location.replace('./index.html');
    }
}

// ================= GESTION DES CONTRATS =================

async function chargerContrats() {
    try {
        afficherChargement();
        
        const response = await fetch(`${API_BASE}/contrats`);
        const data = await response.json();
        
        if (data.success) {
            state.contrats = data.contrats;
            afficherContrats();
            mettreAJourStats();
        } else {
            throw new Error(data.error || 'Erreur lors du chargement des contrats');
        }
    } catch (error) {
        console.error('Erreur:', error);
        afficherErreur('Impossible de charger les contrats. Vérifiez que le serveur est démarré.');
    }
}

function afficherContrats() {
    if (state.contrats.length === 0) {
        elements.contratsListe.innerHTML = `
            <div class="empty-state">
                <h3>Aucun contrat</h3>
                <p>Commencez par créer votre premier contrat</p>
                <button class="btn primary" onclick="afficherFormulaire()">
                    Créer un contrat
                </button>
            </div>
        `;
        return;
    }

    const contratsHTML = state.contrats.map(contrat => `
        <div class="contrat-card" onclick="afficherDetailsContrat('${contrat._id}')">
            <div class="contrat-header">
                <div class="contrat-info">
                    <h3>${contrat.plante} - ${contrat.quantite} plants</h3>
                    <div class="contrat-reference">${contrat.reference}</div>
                </div>
                <div class="contrat-statut ${contrat.statut === 'actif' ? 'statut-actif' : 'statut-termine'}">
                    ${contrat.statut}
                </div>
            </div>
            
            <div class="contrat-details">
                <div class="detail-item">
                    <span class="detail-label">Date semis</span>
                    <span class="detail-value">${formaterDate(contrat.dateSemis)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Livraison</span>
                    <span class="detail-value">${formaterDate(contrat.dateLivraison)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Systèmes</span>
                    <span class="detail-value">${contrat.systemesHydroponiques}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Nutriments</span>
                    <span class="detail-value">${contrat.nutrimentsTotaux}g</span>
                </div>
            </div>
            
            <div class="contrat-actions">
                <button class="btn ghost small" onclick="event.stopPropagation(); supprimerContrat('${contrat._id}')">
                    Supprimer
                </button>
                <button class="btn secondary small" onclick="event.stopPropagation(); marquerComplet('${contrat._id}')">
                    ${contrat.statut === 'actif' ? 'Terminer' : 'Réactiver'}
                </button>
            </div>
        </div>
    `).join('');

    elements.contratsListe.innerHTML = contratsHTML;
}

async function creerContrat(e) {
    e.preventDefault();
    
    const formData = new FormData(elements.contratForm);
    const contratData = {
        plante: formData.get('plante'),
        quantite: parseInt(formData.get('quantite')),
        dateLivraison: formData.get('dateLivraison'),
        systemesHydroponiques: parseInt(formData.get('systemesHydroponiques')) || 1,
        agriculteur: formData.get('agriculteur') || 'Agriculteur Principal'
    };

    try {
        afficherChargement('Création du contrat...');
        
        const response = await fetch(`${API_BASE}/contrats`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(contratData)
        });

        const data = await response.json();

        if (data.success) {
            cacherFormulaire();
            elements.contratForm.reset();
            await chargerContrats(); // Recharger la liste
            afficherNotification('Contrat créé avec succès !', 'success');
        } else {
            throw new Error(data.error || 'Erreur lors de la création du contrat');
        }
    } catch (error) {
        console.error('Erreur:', error);
        afficherNotification('Erreur lors de la création du contrat', 'error');
    }
}

async function afficherDetailsContrat(contratId) {
    try {
        const response = await fetch(`${API_BASE}/contrats/${contratId}`);
        const data = await response.json();

        if (data.success) {
            state.contratSelectionne = data.contrat;
            afficherDetailsContratHTML(data.contrat);
        } else {
            throw new Error(data.error || 'Erreur lors du chargement des détails');
        }
    } catch (error) {
        console.error('Erreur:', error);
        afficherNotification('Erreur lors du chargement des détails', 'error');
    }
}

function afficherDetailsContratHTML(contrat) {
    const detailsHTML = `
        <div class="details-header">
            <h2 class="details-title">${contrat.plante} - Planning de Culture</h2>
            <button class="btn ghost" onclick="cacherDetails()">✕ Fermer</button>
        </div>

        <div class="details-grid">
            <div class="detail-card">
                <h4>Référence</h4>
                <p>${contrat.reference}</p>
            </div>
            <div class="detail-card">
                <h4>Quantité</h4>
                <p>${contrat.quantite} plants</p>
            </div>
            <div class="detail-card">
                <h4>Date Semis</h4>
                <p>${formaterDate(contrat.dateSemis)}</p>
            </div>
            <div class="detail-card">
                <h4>Date Livraison</h4>
                <p>${formaterDate(contrat.dateLivraison)}</p>
            </div>
            <div class="detail-card">
                <h4>Durée Totale</h4>
                <p>${contrat.dureeTotale} jours</p>
            </div>
            <div class="detail-card">
                <h4>Nutriments Totaux</h4>
                <p>${contrat.nutrimentsTotaux}g</p>
            </div>
        </div>

        <div class="planning-section">
            <h3 class="planning-title">📅 Planning Hebdomadaire</h3>
            <div class="semaines-grid">
                ${contrat.planning.map((semaine, index) => `
                    <div class="semaine-card ${semaine.completed ? 'completed' : ''}">
                        <div class="semaine-header">
                            <div class="semaine-info">
                                <h4>Semaine ${semaine.semaine} - ${semaine.phase}</h4>
                                <div class="semaine-date">${formaterDate(semaine.dateDebut)}</div>
                            </div>
                            <div class="semaine-phase">${semaine.phase}</div>
                        </div>
                        
                        <ul class="taches-list">
                            ${semaine.taches.map(tache => `<li>${tache}</li>`).join('')}
                        </ul>
                        
                        ${semaine.nutriments > 0 ? `
                            <div class="detail-item">
                                <span class="detail-label">Nutriments</span>
                                <span class="detail-value">${semaine.nutriments}g</span>
                            </div>
                        ` : ''}
                        
                        ${semaine.notes ? `
                            <div class="semaine-notes">
                                <strong>Notes:</strong> ${semaine.notes}
                            </div>
                        ` : ''}
                        
                        <div class="contrat-actions">
                            <button class="btn small ${semaine.completed ? 'secondary' : 'primary'}" 
                                    onclick="toggleTacheSemaine('${contrat._id}', ${index}, ${!semaine.completed})">
                                ${semaine.completed ? '✗ Marquer non terminée' : '✓ Marquer terminée'}
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    elements.detailsContrat.innerHTML = detailsHTML;
    elements.detailsContrat.classList.remove('hidden');
    
    // Scroll vers les détails
    elements.detailsContrat.scrollIntoView({ behavior: 'smooth' });
}

async function toggleTacheSemaine(contratId, semaineIndex, completed) {
    try {
        const response = await fetch(`${API_BASE}/contrats/${contratId}/taches/${semaineIndex}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ completed })
        });

        const data = await response.json();

        if (data.success) {
            // Mettre à jour l'affichage
            await afficherDetailsContrat(contratId);
            afficherNotification(`Tâche ${completed ? 'marquée comme terminée' : 'réactivée'}`, 'success');
        } else {
            throw new Error(data.error || 'Erreur lors de la mise à jour');
        }
    } catch (error) {
        console.error('Erreur:', error);
        afficherNotification('Erreur lors de la mise à jour', 'error');
    }
}

async function supprimerContrat(contratId) {
    state.actionEnCours = { type: 'supprimer', id: contratId };
    
    elements.modalTitre.textContent = 'Supprimer le contrat';
    elements.modalMessage.textContent = 'Êtes-vous sûr de vouloir supprimer ce contrat ? Cette action est irréversible.';
    elements.confirmationModal.classList.remove('hidden');
}

async function marquerComplet(contratId) {
    const contrat = state.contrats.find(c => c._id === contratId);
    const nouveauStatut = contrat.statut === 'actif' ? 'termine' : 'actif';
    
    state.actionEnCours = { type: 'changerStatut', id: contratId, statut: nouveauStatut };
    
    elements.modalTitre.textContent = 'Changer le statut';
    elements.modalMessage.textContent = `Êtes-vous sûr de vouloir ${nouveauStatut === 'termine' ? 'terminer' : 'réactiver'} ce contrat ?`;
    elements.confirmationModal.classList.remove('hidden');
}

async function executerAction() {
    if (!state.actionEnCours) return;

    try {
        switch (state.actionEnCours.type) {
            case 'supprimer':
                await fetch(`${API_BASE}/contrats/${state.actionEnCours.id}`, {
                    method: 'DELETE'
                });
                afficherNotification('Contrat supprimé avec succès', 'success');
                break;
                
            case 'changerStatut':
                await fetch(`${API_BASE}/contrats/${state.actionEnCours.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        statut: state.actionEnCours.statut 
                    })
                });
                afficherNotification(`Statut du contrat modifié`, 'success');
                break;
        }

        fermerModal();
        await chargerContrats(); // Recharger la liste
        
        // Si on était en train de voir les détails, les cacher
        if (state.contratSelectionne && state.contratSelectionne._id === state.actionEnCours.id) {
            cacherDetails();
        }
        
    } catch (error) {
        console.error('Erreur:', error);
        afficherNotification('Erreur lors de l\'opération', 'error');
    }
}

// ================= FONCTIONS D'AFFICHAGE =================

function afficherFormulaire() {
    elements.formulaireContrat.classList.remove('hidden');
    elements.nouveauContratBtn.style.display = 'none';
}

function cacherFormulaire() {
    elements.formulaireContrat.classList.add('hidden');
    elements.nouveauContratBtn.style.display = 'flex';
    elements.contratForm.reset();
}

function cacherDetails() {
    elements.detailsContrat.classList.add('hidden');
    state.contratSelectionne = null;
}

function fermerModal() {
    elements.confirmationModal.classList.add('hidden');
    state.actionEnCours = null;
}

function afficherChargement(message = 'Chargement...') {
    elements.contratsListe.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>${message}</p>
        </div>
    `;
}

function afficherErreur(message) {
    elements.contratsListe.innerHTML = `
        <div class="error-state">
            <h3>Erreur</h3>
            <p>${message}</p>
            <button class="btn primary" onclick="chargerContrats()">
                Réessayer
            </button>
        </div>
    `;
}

function mettreAJourStats() {
    const contratsActifs = state.contrats.filter(c => c.statut === 'actif').length;
    const totalPlants = state.contrats.reduce((sum, contrat) => sum + contrat.quantite, 0);
    
    elements.contratsActifs.textContent = contratsActifs;
    elements.plantsTotal.textContent = totalPlants;
}

function formaterDate(dateString) {
    return new Date(dateString).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function afficherNotification(message, type = 'info') {
    // Créer une notification simple
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