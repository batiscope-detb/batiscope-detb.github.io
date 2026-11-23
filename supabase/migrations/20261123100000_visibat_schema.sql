-- Visibat : comptes rendus de réunions de chantier (DETB)
-- Schéma « visibat » dans la base de Batiscope / Relevés DETB.
-- Mêmes conventions que releves : suppression logique (supprime_le), horodatage et journal par sync.equiper,
-- lecture et écriture réservées aux agents actifs (sync.est_agent_actif), pas de DELETE.

create schema if not exists visibat;
grant usage on schema visibat to authenticated;

-- Statuts des observations (paramétrables)
create table visibat.statut (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  couleur text not null,
  ordre integer not null default 0,
  reporte boolean not null default true,      -- reporté automatiquement au CR suivant
  soldant boolean not null default false,     -- clôt l'observation
  date_demandee text not null default 'aucune' check (date_demandee in ('aucune','echeance','intervention','constat'))
);

-- Groupes d'agents (projets de groupe)
create table visibat.groupe (
  id uuid primary key default gen_random_uuid(),
  nom text not null
);
create table visibat.groupe_membre (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid not null references visibat.groupe(id),
  agent_id uuid not null references releves.agent(id),
  unique (groupe_id, agent_id)
);

-- Carnet d'adresses partagé
create table visibat.contact (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prenom text,
  fonction text,
  societe text,
  type_intervenant text not null default 'entreprise'
    check (type_intervenant in ('entreprise','moa','moe','moa_moe','bureau_controle','csps','exploitant','support','autre')),
  telephone text,
  mobile text,
  email text,
  adresse text,
  notes text,
  cree_le timestamptz default now()
);

-- Opération (chantier)
create table visibat.operation (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  objet text,
  adresse text,
  projet_id uuid,                               -- bâtiment Batiscope (releves.projet), référence souple
  proprietaire_id uuid references releves.agent(id),
  groupe_id uuid references visibat.groupe(id), -- null = projet personnel
  debut_travaux date,
  objectif_reception date,
  photo_path text,
  penalite_absence numeric(10,2) default 200,
  clause_diffusion text,
  planning_actif boolean not null default false,
  planning jsonb,                               -- planning au format Planibat { version, projet, lots, taches }
  archive boolean not null default false,
  cree_le timestamptz default now()
);

create table visibat.lot (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references visibat.operation(id),
  code text not null,
  libelle text not null,
  couleur text,
  marche text,                                  -- n° et date du marché, engagement
  ordre integer not null default 0
);

-- Intervenant d'une opération (contact + rôle)
create table visibat.intervenant (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references visibat.operation(id),
  contact_id uuid not null references visibat.contact(id),
  categorie text not null default 'entreprise'
    check (categorie in ('entreprise','moa','moe','moa_moe','bureau_controle','csps','exploitant','support','autre')),
  lot_id uuid references visibat.lot(id),
  diffusion boolean not null default true,      -- reçoit le CR
  convoque_defaut boolean not null default true,
  ordre integer not null default 0
);

-- Réunion
create table visibat.reunion (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references visibat.operation(id),
  numero integer not null,
  date_reunion timestamptz not null,
  lieu text default 'Sur site',
  prochaine_date timestamptz,
  prochaine_lieu text,
  statut text not null default 'brouillon' check (statut in ('brouillon','cloturee','diffusee')),
  diffusee_le timestamptz,
  avancement jsonb,                             -- avancement par lot, effectifs, intempéries
  cree_le timestamptz default now(),
  unique (operation_id, numero)
);

create table visibat.presence (
  id uuid primary key default gen_random_uuid(),
  reunion_id uuid not null references visibat.reunion(id),
  intervenant_id uuid not null references visibat.intervenant(id),
  etat text check (etat in ('P','E','A','N')),  -- présent, excusé, absent, absent non excusé
  convoque boolean not null default true,
  unique (reunion_id, intervenant_id)
);

-- Observation (remarque)
create table visibat.observation (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references visibat.operation(id),
  reunion_id uuid references visibat.reunion(id),   -- réunion de création (null = permanente « 0.x »)
  numero text not null,                             -- « 93.2 », « 0.18 »
  rubrique text not null default 'lot' check (rubrique in ('generale','intervenant','lot')),
  texte text not null default '',                   -- HTML simple (gras, listes, tableau)
  statut_code text not null default 'nouvelle',
  date_statut date default current_date,
  echeance date,
  date_intervention date,
  a_charge_de uuid references visibat.intervenant(id),
  soldee_le date,
  ordre integer not null default 0,
  cree_le timestamptz default now()
);
create table visibat.observation_lot (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references visibat.observation(id),
  lot_id uuid not null references visibat.lot(id),
  unique (observation_id, lot_id)
);
create table visibat.observation_intervenant (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references visibat.observation(id),
  intervenant_id uuid not null references visibat.intervenant(id),
  unique (observation_id, intervenant_id)
);
-- État de l'observation à chaque réunion (historique et report)
create table visibat.observation_suivi (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references visibat.observation(id),
  reunion_id uuid not null references visibat.reunion(id),
  statut_code text not null,
  complement text,
  unique (observation_id, reunion_id)
);
create table visibat.observation_photo (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references visibat.observation(id),
  storage_path text not null,
  legende text,
  annotations jsonb,
  ordre integer not null default 0
);
create table visibat.observation_checklist (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references visibat.observation(id),
  libelle text not null,
  fait boolean not null default false,
  ordre integer not null default 0
);
create table visibat.observation_commentaire (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references visibat.observation(id),
  agent_id uuid references releves.agent(id),
  texte text not null,
  cree_le timestamptz default now()
);

-- Plans et pastilles
create table visibat.plan (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references visibat.operation(id),
  libelle text not null,
  storage_path text not null,
  page_index integer not null default 0,
  ordre integer not null default 0
);
create table visibat.plan_annotation (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references visibat.plan(id),
  donnees jsonb not null                          -- même format que releves.annotation (symboles, textes, flèches…)
);
create table visibat.observation_position (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references visibat.observation(id),
  plan_id uuid not null references visibat.plan(id),
  x numeric not null,                             -- coordonnées relatives (0 à 1) sur la page
  y numeric not null
);

-- Modèles d'export (personnels, de groupe, pré-configurés)
create table visibat.modele_export (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  portee text not null default 'perso' check (portee in ('systeme','groupe','perso','dernier')),
  proprietaire_id uuid references releves.agent(id),
  groupe_id uuid references visibat.groupe(id),
  reglages jsonb not null default '{}'::jsonb,
  ordre integer not null default 0
);

-- Horodatage, journal, suppression logique et règles d'accès (agents actifs)
do $$
declare t text;
begin
  foreach t in array array['statut','groupe','groupe_membre','contact','operation','lot','intervenant','reunion','presence',
    'observation','observation_lot','observation_intervenant','observation_suivi','observation_photo','observation_checklist',
    'observation_commentaire','plan','plan_annotation','observation_position','modele_export']
  loop
    call sync.equiper('visibat', t);
    execute format('grant select, insert, update on visibat.%I to authenticated', t);
  end loop;
end $$;

-- Index des clés étrangères
create index on visibat.groupe_membre (agent_id);
create index on visibat.operation (proprietaire_id);
create index on visibat.operation (groupe_id);
create index on visibat.lot (operation_id);
create index on visibat.intervenant (operation_id);
create index on visibat.intervenant (contact_id);
create index on visibat.intervenant (lot_id);
create index on visibat.presence (intervenant_id);
create index on visibat.observation (operation_id);
create index on visibat.observation (reunion_id);
create index on visibat.observation (a_charge_de);
create index on visibat.observation_lot (lot_id);
create index on visibat.observation_intervenant (intervenant_id);
create index on visibat.observation_suivi (reunion_id);
create index on visibat.observation_photo (observation_id);
create index on visibat.observation_checklist (observation_id);
create index on visibat.observation_commentaire (observation_id);
create index on visibat.observation_commentaire (agent_id);
create index on visibat.plan (operation_id);
create index on visibat.plan_annotation (plan_id);
create index on visibat.observation_position (observation_id);
create index on visibat.observation_position (plan_id);
create index on visibat.modele_export (proprietaire_id);
create index on visibat.modele_export (groupe_id);

-- Données de départ : statuts validés
insert into visibat.statut (code, libelle, couleur, ordre, reporte, soldant, date_demandee) values
  ('memoire',  'Pour mémoire', '#2e7d4f', 1, true,  false, 'aucune'),
  ('nouvelle', 'Nouvelle',     '#1d5fa8', 2, true,  false, 'echeance'),
  ('aprog',    'À programmer', '#b26b00', 3, true,  false, 'aucune'),
  ('prog',     'Programmée',   '#6b3fa0', 4, true,  false, 'intervention'),
  ('attente',  'En attente',   '#c2560f', 5, true,  false, 'echeance'),
  ('urgent',   'Urgent',       '#b3261e', 6, true,  false, 'echeance'),
  ('soldee',   'Soldée',       '#5f6b76', 7, false, true,  'constat');

-- Modèles d'export pré-configurés
insert into visibat.modele_export (nom, description, portee, ordre, reglages) values
  ('Compte rendu de chantier (complet)', 'Remarques de la visite et remarques non levées des visites précédentes.', 'systeme', 1,
   '{"remarques":"courante_et_non_levees","classement":"intervenant_puis_lot","planning":"aucun","photos":"vignettes","garde":true,"presences":true,"generales":true,"plans":true,"documents":true}'),
  ('Compte rendu de chantier (visite courante)', 'Remarques de la visite, par intervenant puis par lot.', 'systeme', 2,
   '{"remarques":"courante","classement":"intervenant_puis_lot","planning":"aucun","photos":"vignettes","garde":true,"presences":true,"generales":true,"plans":false,"documents":false}'),
  ('Synthèse hiérarchie / élus', 'Points ouverts et urgents seulement, sans les « pour mémoire ».', 'systeme', 3,
   '{"remarques":"ouvertes","classement":"statut","planning":"extrait_4_semaines","photos":"aucune","garde":true,"presences":false,"generales":false,"plans":false,"documents":false}'),
  ('Extraits par entreprise', 'Un PDF par entreprise : ses remarques et les remarques générales.', 'systeme', 4,
   '{"remarques":"courante_et_non_levees","classement":"lot","par_entreprise":true,"planning":"aucun","photos":"vignettes","garde":false,"presences":true,"generales":true,"plans":false,"documents":false}'),
  ('Compte rendu OPR, classement par lot', 'Remarques de la visite courante, par lot.', 'systeme', 5,
   '{"remarques":"courante","classement":"lot","planning":"aucun","photos":"vignettes","garde":true,"presences":true,"generales":false,"plans":true,"documents":false}'),
  ('Compte rendu OPR, classement par plan', 'Remarques de la visite courante, plan par plan avec pastilles.', 'systeme', 6,
   '{"remarques":"courante","classement":"plan","planning":"aucun","photos":"vignettes","garde":true,"presences":true,"generales":false,"plans":true,"documents":false}'),
  ('Mosaïque de photos', 'Les images du CR, avec la description de la remarque dessous.', 'systeme', 7,
   '{"remarques":"courante","classement":"mosaique","planning":"aucun","photos":"mosaique","garde":false,"presences":false,"generales":false,"plans":false,"documents":false}');

-- Stockage : photos, plans et documents de Visibat
insert into storage.buckets (id, name, public, file_size_limit)
values ('visibat', 'visibat', false, 52428800)
on conflict (id) do nothing;

create policy "visibat_lecture" on storage.objects for select to authenticated
  using (bucket_id = 'visibat' and sync.est_agent_actif());
create policy "visibat_ecriture" on storage.objects for insert to authenticated
  with check (bucket_id = 'visibat' and sync.est_agent_actif());
create policy "visibat_maj" on storage.objects for update to authenticated
  using (bucket_id = 'visibat' and sync.est_agent_actif());
create policy "visibat_suppression_admin" on storage.objects for delete to authenticated
  using (bucket_id = 'visibat' and sync.est_admin());
