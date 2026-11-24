-- Les suppressions sont logiques (supprime_le) : une contrainte d'unicité classique empêchait de recréer un lien supprimé
-- (lot ou intervenant d'une observation, membre d'un groupe, réunion de même numéro…). L'unicité ne porte plus que sur
-- les lignes actives. `affectation (agent_id)` reste une contrainte : elle sert à l'upsert de la création de compte.
alter table visibat.statut drop constraint statut_code_key;
create unique index statut_code_actif on visibat.statut (code) where supprime_le is null;
alter table visibat.groupe_membre drop constraint groupe_membre_groupe_id_agent_id_key;
create unique index groupe_membre_actif on visibat.groupe_membre (groupe_id, agent_id) where supprime_le is null;
alter table visibat.reunion drop constraint reunion_operation_id_numero_key;
create unique index reunion_numero_actif on visibat.reunion (operation_id, numero) where supprime_le is null;
alter table visibat.presence drop constraint presence_reunion_id_intervenant_id_key;
create unique index presence_actif on visibat.presence (reunion_id, intervenant_id) where supprime_le is null;
alter table visibat.observation_lot drop constraint observation_lot_observation_id_lot_id_key;
create unique index observation_lot_actif on visibat.observation_lot (observation_id, lot_id) where supprime_le is null;
alter table visibat.observation_intervenant drop constraint observation_intervenant_observation_id_intervenant_id_key;
create unique index observation_intervenant_actif on visibat.observation_intervenant (observation_id, intervenant_id) where supprime_le is null;
alter table visibat.observation_suivi drop constraint observation_suivi_observation_id_reunion_id_key;
create unique index observation_suivi_actif on visibat.observation_suivi (observation_id, reunion_id) where supprime_le is null;
