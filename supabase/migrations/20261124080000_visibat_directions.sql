-- Visibat ouvert à d'autres directions de la Ville.
-- 1. Rôle « visibat » : compte limité à Visibat (pas d'accès au patrimoine Batiscope / Relevés / accessibilité).
-- 2. Directions (DETB, …) configurables : en-tête et pied de page du CR, rattachement des agents, opérations et groupes.
-- Pas de cloisonnement : tout agent actif (y compris « visibat ») lit et modifie tout Visibat.

alter table releves.agent drop constraint if exists agent_role_check;
alter table releves.agent add constraint agent_role_check check (role in ('agent', 'admin', 'tablette', 'visibat'));

-- Tout agent actif, quel que soit son rôle : accès à Visibat.
create or replace function sync.est_agent_visibat() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from releves.agent a where a.id = auth.uid() and a.actif)
$$;
grant execute on function sync.est_agent_visibat() to authenticated;

-- Agents « complets » (patrimoine, relevés, accessibilité) : tous sauf le rôle visibat.
create or replace function sync.est_agent_actif() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from releves.agent a where a.id = auth.uid() and a.actif and a.role <> 'visibat')
$$;

-- Équipement d'une table Visibat : comme sync.equiper, mais ouverte aux comptes visibat.
create or replace procedure visibat.equiper(p_table text)
language plpgsql set search_path = '' as $$
begin
  call sync.equiper('visibat', p_table);
  execute format('drop policy if exists lecture_agents on visibat.%I', p_table);
  execute format('create policy lecture_agents on visibat.%I for select to authenticated using (sync.est_agent_visibat())', p_table);
  execute format('drop policy if exists insertion_agents on visibat.%I', p_table);
  execute format('create policy insertion_agents on visibat.%I for insert to authenticated with check (sync.est_agent_visibat())', p_table);
  execute format('drop policy if exists modification_agents on visibat.%I', p_table);
  execute format('create policy modification_agents on visibat.%I for update to authenticated using (sync.est_agent_visibat()) with check (sync.est_agent_visibat())', p_table);
end $$;

-- Directions et rattachement des agents.
create table visibat.direction (
  id uuid primary key default gen_random_uuid(),
  nom text not null,          -- « Direction Études et Travaux Bâtiments »
  sigle text not null,        -- « DETB »
  pole text,                  -- ligne au-dessus du nom dans l'en-tête, ex. « Pôle Patrimoine et Cadre de vie »
  pied text,                  -- pied de page du CR (adresse, téléphone…)
  ordre int not null default 0,
  cree_le timestamptz not null default now()
);
create table visibat.affectation (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references releves.agent(id),
  direction_id uuid not null references visibat.direction(id),
  cree_le timestamptz not null default now(),
  unique (agent_id)
);
alter table visibat.operation add column if not exists direction_id uuid references visibat.direction(id);
alter table visibat.groupe add column if not exists direction_id uuid references visibat.direction(id);
create index on visibat.operation (direction_id);
create index on visibat.groupe (direction_id);
create index on visibat.affectation (direction_id);
grant select, insert, update on visibat.direction, visibat.affectation to authenticated;

-- Toutes les tables Visibat ouvertes aux comptes visibat.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'visibat' loop
    call visibat.equiper(t);
  end loop;
end $$;

-- Liste des agents (noms dans les CR, groupes) et profil de l'agent connecté.
drop policy if exists agents_lecture on releves.agent;
create policy agents_lecture on releves.agent for select to authenticated using (sync.est_agent_visibat() or id = auth.uid());

-- Lecture seule des bâtiments (rattachement d'une opération, photo de couverture) et de leurs fichiers.
create policy lecture_visibat on releves.projet for select to authenticated using (sync.est_agent_visibat());
create policy "photos-releves_lecture_visibat" on storage.objects for select to authenticated using (bucket_id = 'photos-releves' and sync.est_agent_visibat());
create policy "plans-releves_lecture_visibat" on storage.objects for select to authenticated using (bucket_id = 'plans-releves' and sync.est_agent_visibat());

-- Fichiers Visibat.
drop policy if exists visibat_ecriture on storage.objects;
drop policy if exists visibat_lecture on storage.objects;
drop policy if exists visibat_maj on storage.objects;
create policy visibat_ecriture on storage.objects for insert to authenticated with check (bucket_id = 'visibat' and sync.est_agent_visibat());
create policy visibat_lecture on storage.objects for select to authenticated using (bucket_id = 'visibat' and sync.est_agent_visibat());
create policy visibat_maj on storage.objects for update to authenticated using (bucket_id = 'visibat' and sync.est_agent_visibat());

-- Reprise de l'existant : la DETB, tous les agents actuels, toutes les opérations et groupes.
do $$ declare d uuid; begin
  insert into visibat.direction (nom, sigle, pole, ordre)
  values ('Direction Études et Travaux Bâtiments', 'DETB', 'Pôle Patrimoine et Cadre de vie', 1) returning id into d;
  insert into visibat.affectation (agent_id, direction_id) select id, d from releves.agent on conflict do nothing;
  update visibat.operation set direction_id = d where direction_id is null;
  update visibat.groupe set direction_id = d where direction_id is null;
end $$;
