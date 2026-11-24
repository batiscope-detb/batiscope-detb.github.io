-- Module Réception (OPR) de Visibat : formulaires EXE de la DAJ (EXE3 à EXE9), CCAG Travaux / FCS 2021.
-- Une « réception » = un marché (lot) d'une opération ; ses réserves sont des observations rattachées (reception_id),
-- ce qui leur donne pastilles sur plan et photos. Les choix des formulaires sont dans `donnees` (jsonb).
create table visibat.reception (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references visibat.operation(id),
  lot_id uuid references visibat.lot(id),
  genre text not null default 'travaux' check (genre in ('travaux', 'fcs')),
  titulaire_contact_id uuid references visibat.contact(id),
  moe_agent_id uuid references releves.agent(id),
  moe_nom text,                     -- maître d'œuvre saisi librement (sinon l'agent)
  numero_marche text,
  objet_marche text,
  partielle boolean not null default false,
  prestations text,                 -- prestations concernées par la réception
  donnees jsonb not null default '{}'::jsonb,
  ordre int not null default 0,
  cree_le timestamptz not null default now()
);
create index on visibat.reception (operation_id);

-- Modèles Word importés (remplacent les modèles DAJ intégrés à l'application).
create table visibat.modele_exe (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code in ('EXE3','EXE4','EXE5','EXE6','EXE7','EXE8','EXE9')),
  chemin text not null,
  nom_fichier text,
  cree_le timestamptz not null default now()
);

alter table visibat.observation add column if not exists reception_id uuid references visibat.reception(id);
alter table visibat.observation add column if not exists categorie_reserve text
  check (categorie_reserve in ('epreuve', 'travaux', 'malfacon', 'pose', 'installations', 'lieux'));
create index on visibat.observation (reception_id);
alter table visibat.operation add column if not exists reception_actif boolean not null default false;
alter table visibat.contact add column if not exists siret text;
alter table visibat.direction add column if not exists adresse text;
alter table visibat.direction add column if not exists code_postal text;
alter table visibat.affectation add column if not exists telephone text;

grant select, insert, update on visibat.reception, visibat.modele_exe to authenticated;
call visibat.equiper('reception');
call visibat.equiper('modele_exe');
