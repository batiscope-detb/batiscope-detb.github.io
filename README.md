# Relevés DETB — appli bureau

Application web (installable, sans droits administrateur) de consultation et de pilotage du patrimoine bâti
de la Direction Études et Travaux Bâtiments, Ville de Cherbourg-en-Cotentin.

Elle lit les mêmes données que l'appli tablette « Relevés DETB » (base Supabase) : relevés d'état des bâtiments
et diagnostics d'accessibilité Ad'AP. Les statuts d'accessibilité sont recalculés avec le même moteur et le même
référentiel que la tablette (`src/moteur.ts`, `src/data/referentiel_accessibilite.json`).

**Adresse :** https://emmduval50-cell.github.io/releve-detb-web/ — connexion avec le compte de la tablette.

## Sécurité
- Le code est public ; les données ne le sont pas : chaque lecture exige la connexion d'un agent actif
  (règles d'accès RLS côté base). Seule la clé *publiable* Supabase figure dans le code.
- Les photos et plans sont servis par des liens temporaires (1 h).

## Version 0.4 (ergonomie et fiche ERP)
- Interrupteur « Modification » dans la barre du haut, toujours visible.
- Suppression d'un local avec ses constats et photos (confirmation, propagée aux tablettes).
- Plan : zoom à la molette et boutons, déplacement de la vue, panneau latéral repliable, export PDF A3 avec cartouche et légende.
- Fenêtres déplaçables (par le titre) et redimensionnables (coin inférieur droit).
- Corps d'état et points de contrôle personnalisés, interactions avec d'autres corps d'état (comme sur la tablette).
- Fiche ERP : activités secondaires, zone de travail (ERT), effectifs public/personnel par niveau et niveau d'accès,
  aide au calcul de l'effectif des étages (public seul ou public + personnel, au choix de l'agent).

## Version 0.3 (paramètres, comptes, annotations de plan)
- **Logo en haut à gauche → Paramètres** : mon compte (nom affiché, mot de passe), apparence (thème clair/sombre,
  taille du texte, mode modification par défaut), **utilisateurs** pour les administrateurs (créer un agent avec un mot
  de passe provisoire à changer à la première connexion, rôle, activer/désactiver, nouveau mot de passe), à propos.
  Les opérations sur les comptes passent par la fonction serveur `gerer-agents` (`supabase/functions`), seule à détenir
  la clé secrète. Un compte créé autrement (inscription spontanée) n'a aucun accès tant qu'un administrateur ne l'a pas activé.
- **Plans et repères** : 42 symboles (évacuation, sécurité incendie, accessibilité, relevé et désordres) et 6 outils
  (texte, flèche, cote, zone, tracé libre, nuage), avec valeur (UP et largeur calculée, pente, degré coupe-feu…),
  orientation, taille, couleur, rattachement à un local ou un élément, calques, légende automatique et export du plan
  annoté en image. Table `releves.annotation`, synchronisable (affichage sur la tablette dans une prochaine version).

## Version 0.2 (préparation et correction des relevés)
Avec le « Mode modification » (interrupteur en haut de chaque fiche) :
- **Préparer au bureau** : créer un bâtiment, ses niveaux et ses locaux (saisie enchaînée), importer un plan par niveau
  (PDF, ou image convertie en PDF), placer et déplacer les repères des locaux et des éléments sur le plan,
  créer le diagnostic accessibilité (contexte ERP) et les éléments à contrôler.
- **Corriger au retour** : constats (local, corps d'état, gravité, estimation € HT, observation, points de contrôle),
  photos (ajout depuis le PC, suppression), état général des locaux, saisies accessibilité (mesures, statuts,
  tolérances, commentaires) avec recalcul immédiat.
- **Compatibilité tablette** : écritures horodatées (maj_le) et suppressions douces, comme la tablette ; une donnée
  modifiée sur la tablette depuis son affichage déclenche une demande avant d'être écrasée. Identifiant de diagnostic
  commun bureau/tablette (tablette 0.6.1). Toutes les écritures sont tracées dans `sync.journal`.
- Règle d'usage : synchroniser la tablette avant de partir sur le terrain, et en rentrant avant de corriger au bureau.

## Version 0.1 (consultation)
- Tableau de bord : indicateurs, avancement, bâtiments filtrables et triables, alertes, travaux par corps d'état,
  espace serveur utilisé.
- Fiche bâtiment : synthèse, relevés par niveau et local (photos), diagnostic accessibilité (statuts, tolérances,
  dérogations), plans avec repères.
- Export Excel (bâtiments, constats, corps d'état, accessibilité).
- Consultation du référentiel accessibilité.

## Développement
```
npm ci
npm run dev      # http://localhost:5173/releve-detb-web/
npm test
npm run build
```
La publication sur GitHub Pages est automatique à chaque envoi sur `main` (`.github/workflows/deploy.yml`).
