-- Directeur ou directrice de la direction : maître d'œuvre signataire par défaut des formulaires EXE.
alter table visibat.direction add column if not exists responsable text;
alter table visibat.direction add column if not exists responsable_fonction text;
