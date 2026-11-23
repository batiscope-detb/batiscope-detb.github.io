-- Un plan Visibat peut être déposé dans Visibat ou repris d'un niveau du bâtiment (plans de Relevés DETB).
alter table visibat.plan add column if not exists bucket text not null default 'visibat'
  check (bucket in ('visibat', 'plans-releves'));
alter table visibat.plan add column if not exists niveau_id uuid;  -- niveau du bâtiment d'origine (référence souple)
notify pgrst, 'reload schema';
