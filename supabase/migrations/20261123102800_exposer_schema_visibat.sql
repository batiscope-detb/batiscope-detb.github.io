-- Les schémas exposés de l'API sont fixés par le rôle authenticator (le réglage du tableau de bord est ignoré).
alter role authenticator set pgrst.db_schemas = 'public, releves, accessibilite, sync, visibat';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
