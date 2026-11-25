-- Tests d'isolation RLS entre deux médecins (données synthétiques).
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'dr.a@example.test', '{"full_name":"Dr A (test)"}'),
  ('22222222-2222-2222-2222-222222222222', 'dr.b@example.test', '{}');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'trigger profils';
  assert (select count(*) from public.user_settings) = 2, 'trigger paramètres';
end $$;

-- Médecin A crée une consultation et des données associées.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.consultations (id, patient_name, patient_first_name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST', 'Patient');
insert into public.observation_forms (consultation_id, form_data)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '{"x":1}');
insert into public.generated_documents (consultation_id, document_type, storage_path)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'observation', '1111/aaaa/obs.pdf');
insert into public.audit_logs (consultation_id, action) values ('aaaaaaaa-0000-0000-0000-000000000001', 'consultation.created');
insert into storage.objects (bucket_id, name)
  values ('recordings', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/seg0.webm');

-- Médecin B ne voit rien et ne peut rien rattacher à la consultation de A.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from public.consultations) = 0, 'B voit les consultations de A';
  assert (select count(*) from public.observation_forms) = 0, 'B voit les fiches de A';
  assert (select count(*) from public.generated_documents) = 0, 'B voit les documents de A';
  assert (select count(*) from public.audit_logs) = 0, 'B voit le journal de A';
  assert (select count(*) from public.profiles) = 1, 'B voit d''autres profils';
  assert (select count(*) from storage.objects) = 0, 'B voit les fichiers de A';
end $$;

do $$ begin
  begin
    insert into public.transcriptions (consultation_id, original_transcript)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'intrusion');
    raise exception 'B a pu ajouter une transcription à la consultation de A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name)
      values ('recordings', '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000001/x.webm');
    raise exception 'B a pu déposer un fichier sur la consultation de A';
  exception when insufficient_privilege then null;
  end;
end $$;

update public.consultations set patient_name = 'pirate' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- A : vérifier que la mise à jour de B n'a rien changé, que le journal est en ajout seul
-- et qu'on ne peut pas céder une consultation.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select patient_name from public.consultations) = 'TEST', 'B a modifié la consultation de A';
  assert (select count(*) from storage.objects) = 1, 'A ne voit pas son fichier';
end $$;
update public.audit_logs set action = 'falsifié';
delete from public.audit_logs;
do $$ begin
  assert (select action from public.audit_logs) = 'consultation.created', 'journal d''audit modifiable';
  begin
    update public.consultations set user_id = '22222222-2222-2222-2222-222222222222';
    raise exception 'changement de propriétaire possible';
  exception when raise_exception or insufficient_privilege or check_violation then
    if sqlerrm like 'changement de propriétaire possible' then raise; end if;
  end;
end $$;

-- Utilisateur anonyme : aucun accès.
reset request.jwt.claim.sub;
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from public.consultations;
    raise exception 'anon peut lire les consultations';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'RLS OK' as resultat;
