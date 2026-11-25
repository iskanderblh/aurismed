-- En-tête de la fiche d'observation : date et heure d'appel, ATU, médecin CCMM,
-- responsable de soins.
alter table public.consultations
  add column call_information jsonb not null default '{}'::jsonb;
