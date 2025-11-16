# Digital Code Hub - Démo Interface Auth

Interface front-end statique (HTML/CSS/JS) inspirée de la capture demandée : une page avec un hero plein écran, une barre de navigation, un bouton **Login** ouvrant une modal verre (glassmorphism) permettant de basculer entre **Register** et **Login**.

## Structure
```
frontend/
├── index.html        # Page principale
├── css/
│   └── style.css     # Styles (responsive + modal + hero)
└── js/
    └── app.js        # Logique d'interaction
```

## Fonctionnalités
- Navigation fixe semi-transparente avec effet blur
- Section hero avec image plein écran (Unsplash) + CTA
- Sections About & Contact basiques
- Modal d'authentification (dialog) avec :
  - Onglets Register / Login
  - Validation front simple (email/password/username/terms)
  - Affichage / masquage mot de passe
  - Fermeture par overlay, bouton X, touche ESC, ou après soumission simulée
- Menu mobile (burger) < 820px
- Styles modernes : glassmorphism, transitions, responsive, scrollbar custom
- Accessible (attributs aria de base, focus initial sur le premier champ)
- Redirection vers un **dashboard interne** après login / register (simulation)

## Dashboard (simulation d'app)
Fichiers ajoutés : `dashboard.html` + `js/dashboard.js`.

Composants :
- Sidebar avec : Dashboard, Contrats, Chatbot, Détection de maladie, Analytique, Paramètres, Logout.
- Topbar (titre dynamique + badge utilisateur).
- Cartes statistiques qui se mettent à jour aléatoirement (simulation).
- Mini chatbot local (messages en mémoire, réponse simulée).
- Vues placeholder pour futures fonctionnalités.

Logique d'auth simulée :
1. Soumission réussie du formulaire Login ou Register ⇒ `localStorage.hydrocare_auth = '1'` et pseudo stocké.
2. Redirection automatique vers `dashboard.html`.
3. Si on accède au dashboard sans être authentifié ⇒ redirection vers l'accueil.
4. Bouton Logout ⇒ supprime les clés et revient à `index.html`.

Pour intégrer un vrai backend ultérieurement :
```
fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password})})
  .then(r => r.ok ? r.json() : Promise.reject(r))
  .then(data => { localStorage.setItem('token', data.token); window.location.href='dashboard.html'; })
  .catch(()=> showError(...));
```

## Lancer le projet
Ouvrez simplement `index.html` dans votre navigateur.
Pour bénéficier d'un rechargement automatique pendant l'édition, vous pouvez utiliser un petit serveur local (exemples) :

### PowerShell (Windows)
```
# Python 3
python -m http.server 8080
# Puis ouvrez http://localhost:8080/frontend/
```
Ou via VS Code extension "Live Server".

## Personnalisation rapide
| Élément | Où modifier | Notes |
|---------|-------------|-------|
| Image de fond hero | `.hero` dans `style.css` | Remplacer l'URL Unsplash |
| Couleur principale | variable `--accent` dans `:root` | Ajuste boutons / focus |
| Rayon des coins | `--radius` | Affecte inputs & modal |
| Titre / texte hero | `index.html` section `#hero` | — |
| Social icons | Footer `index.html` | Remplacer par <svg> si besoin |

## Ajouter une vraie authentification
Cette démo n'envoie rien au serveur. Pour l'intégrer à un backend :
1. Remplacer dans `app.js` la partie `console.log` + `alert` après validation.
2. Utiliser `fetch('/api/register', { method:'POST', body: FormData ... })` ou JSON.
3. Gérer erreurs serveur et les afficher via `showError(input, message)`.
4. Ajouter une gestion de tokens (JWT, session cookie, etc.).

## Améliorations possibles
- Animation de transition entre onglets (fade/slide)
- Indicateur de robustesse du mot de passe
- Validation asynchrone (email déjà utilisé ?)
- Focus trap complet dans la modal (déjà partiel via dialog natif)
- Thème clair/sombre switch
- Internationalisation (i18n)

## Licence
Libre d'utilisation pour l'apprentissage / prototypage. Remplacez la marque "Digital Code Hub" par la vôtre.
