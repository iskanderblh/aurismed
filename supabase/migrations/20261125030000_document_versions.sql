-- Phase 6 : un numéro de version par type de document et par consultation.
-- Empêche deux générations simultanées de produire la même version.
drop index if exists public.generated_documents_consultation_idx;
create unique index generated_documents_version_key
  on public.generated_documents (consultation_id, document_type, version);
