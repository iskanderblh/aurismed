-- Transcription par segment : chaque enregistrement (segment de la consultation ou
-- fichier importé) garde son texte, puis les segments sont assemblés dans
-- public.transcriptions.
alter table public.recordings
  add column source text not null default 'microphone' check (source in ('microphone', 'upload')),
  add column original_filename text,
  add column transcript text;

-- Une seule transcription « courante » par consultation pour le MVP.
create unique index transcriptions_one_per_consultation on public.transcriptions (consultation_id);
