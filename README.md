# Batiscope — appli bureau

Application web (installable, sans droits administrateur) de consultation et de pilotage du patrimoine bâti
de la Direction Études et Travaux Bâtiments, Ville de Cherbourg-en-Cotentin.

Elle lit les mêmes données que l'appli tablette « Relevés DETB » (base Supabase) : relevés d'état des bâtiments
et diagnostics d'accessibilité Ad'AP. Les statuts d'accessibilité sont recalculés avec le même moteur et le même
référentiel que la tablette (`src/moteur.ts`, `src/data/referentiel_accessibilite.json`).

**Adresse :** https://batiscope-detb.github.io/ (ancienne adresse redirigée) — connexion avec le compte de la tablette.

## Sécurité
- Le code est public ; les données ne le sont pas : chaque lecture exige la connexion d'un agent actif
  (règles d'accès RLS côté base). Seule la clé *publiable* Supabase figure dans le code.
- Les photos et plans sont servis par des liens temporaires (1 h).

## Version 0.9 (Visibat : plans avec pastilles et photos)
- Onglet **Plans** d'une opération : import d'un PDF ou d'une image (choix de la page d'un PDF), ou reprise des plans
  des niveaux du bâtiment Batiscope ; renommage, aperçu, retrait.
- Onglet **Plans** d'une réunion : pastilles des observations, à la couleur de leur statut et à leur numéro.
  Mode « Poser une remarque » : un toucher sur le plan ouvre la saisie d'une nouvelle observation, déjà positionnée.
  Toucher une pastille ouvre l'observation ; mode « Déplacer les pastilles ».
- **Photos** des observations (appareil photo sur téléphone et tablette, réduites à 1600 px comme sur la tablette),
  vignettes dans la liste, agrandissement, suppression.
- Compte rendu : photos sous chaque observation et plans avec pastilles en fin de document (options à cocher).

## Version 0.8 (module Visibat : comptes rendus de chantier)
- Nouvelle entrée **Visibat** dans le menu (loupe Visibat) : visites et comptes rendus de réunions de chantier, avec les
  réglages de Batiscope (thèmes, taille du texte…). Données dans le schéma `visibat` de la même base, mêmes comptes.
- Opérations (mes projets, projets du groupe, toute la DETB), rattachées si besoin à un bâtiment du patrimoine ;
  carnet d'adresses partagé avec le type d'intervenant ; intervenants et lots de chaque opération.
- Réunions numérotées, présences P / E / A / N au toucher, cumul des absences non excusées et pénalité CCAP.
- Observations avec 7 statuts en couleur, numérotation « n° de réunion.index » (0.x = points permanents), classement
  remarques générales / intervenants / lots, échéances, checklist, commentaires internes, historique ;
  **report automatique** des points non soldés d'une réunion à la suivante.
- Aperçu du CR au modèle DETB (impression / PDF) et brouillon Outlook (.eml, destinataires en copie cachée).
- Paramètres › Visibat : statuts et couleurs (administrateurs), groupes d'agents.

## Version 0.7 (notice au modèle DETB, exports Word)
- Notice d'accessibilité : tableau des dispositions réglementaires (articles 2 à 19, lignes du modèle DETB),
  colonne « Dispositions prévues » remplie automatiquement depuis le diagnostic (conforme, non conforme avec travaux
  ou dérogation, sans objet), retouchable ligne par ligne ; lignes à compléter signalées.
- Export Word (.docx) de tous les documents (relevé, diagnostic, notice, registre) depuis l'aperçu, pour l'ajustement final avant envoi.

## Version 0.6 (cycle de vie, registre, vérifications, listes)
- Archivage d'un bâtiment (fiche → Synthèse) : archive .zip (données et fichiers) avec empreinte SHA-256 à déposer sur OneDrive,
  libération de l'espace serveur par un administrateur après vérification de l'archive, réouverture depuis l'archive.
- Registre public d'accessibilité (arrêté du 19 avril 2017) : saisie des informations de l'établissement, niveau d'accessibilité
  et dérogations tirés du diagnostic, propositions de maintenance selon les équipements relevés, version imprimable avec la liste des pièces.
- Vérifications périodiques sur la fiche ERP : catalogue des contrôles courants, échéance calculée (dernière + périodicité),
  alertes « en retard » et « à prévoir sous 60 jours » au tableau de bord.
- Paramètres → Listes (administrateurs) : corps d'état, points de contrôle et types de locaux — renommer, ordonner, archiver, supprimer
  si inutilisé ; transmis aux tablettes à la synchronisation.

## Version 0.5 (rapports, notice d'accessibilité, veille réglementaire)
- Rapports imprimables A4 (bouton « Imprimer / enregistrer en PDF ») depuis la synthèse de la fiche :
  relevé d'état (synthèse, travaux par corps d'état, plans annotés, constats avec photos, récapitulatif) et
  diagnostic d'accessibilité (contexte, exigences, synthèse, plans, détail par élément, dérogations).
- Notice d'accessibilité à joindre à une AT (Cerfa 13824) : rubriques des articles 2 à 19 de l'arrêté du 8 décembre 2014,
  paragraphes générés depuis le diagnostic puis modifiables (texte retouché conservé lors des mises à jour), en-tête du dossier,
  aperçu et PDF.
- Veille réglementaire : vérification mensuelle automatique des textes du référentiel sur Légifrance (tâche planifiée, le 2 du mois),
  compte rendu dans Paramètres → Veille réglementaire, bandeau sur le tableau de bord en cas de nouveautés ; aussi affiché sur la tablette (v0.8).

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
npm run dev      # http://localhost:5173/
npm test
npm run build
```
La publication sur GitHub Pages est automatique à chaque envoi sur `main` (`.github/workflows/deploy.yml`).
