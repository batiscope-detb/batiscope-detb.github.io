# Relevés DETB — appli bureau

Application web (installable, sans droits administrateur) de consultation et de pilotage du patrimoine bâti
de la Direction de l'entretien et des travaux du bâtiment, Ville de Cherbourg-en-Cotentin.

Elle lit les mêmes données que l'appli tablette « Relevés DETB » (base Supabase) : relevés d'état des bâtiments
et diagnostics d'accessibilité Ad'AP. Les statuts d'accessibilité sont recalculés avec le même moteur et le même
référentiel que la tablette (`src/moteur.ts`, `src/data/referentiel_accessibilite.json`).

**Adresse :** https://emmduval50-cell.github.io/releve-detb-web/ — connexion avec le compte de la tablette.

## Sécurité
- Le code est public ; les données ne le sont pas : chaque lecture exige la connexion d'un agent actif
  (règles d'accès RLS côté base). Seule la clé *publiable* Supabase figure dans le code.
- Les photos et plans sont servis par des liens temporaires (1 h).

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
