"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  CloudUpload,
  Loader2,
  Mic,
  PhoneCall,
  RotateCw,
  Ship,
  Trash2,
  User,
} from "lucide-react";
import { deleteConsultation, saveConsultationDraft } from "@/app/(app)/consultations/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  computeAge,
  type CallInformation,
  type ConsultationDraftInput,
  type PatientInformation,
  type VesselInformation,
} from "@/lib/consultation/schema";
import type { RecordingStageData, TranscriptionInfo } from "@/lib/recording/types";
import type { ObservationStageData } from "@/lib/data/recordings";
import { CheckboxField, ChoiceField, FormSection, TextField } from "./form-controls";
import { RecordingStage } from "./recording/recording-stage";
import { ObservationReview } from "./observation/observation-review";
import { PrescriptionEditor } from "./prescription/prescription-editor";
import type { PrescriptionStageData } from "@/lib/data/prescriptions";
import type { MedicationLine } from "@/lib/medical/form-state";
import type { PrescriptionLine } from "@/lib/prescription/schema";
import { useRouter } from "next/navigation";
import { WorkflowSteps } from "./workflow-steps";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
type PortKey = "originPort" | "destination" | "plannedCall" | "possibleCall";

const AUTOSAVE_DELAY_MS = 1200;

const PORTS: { key: PortKey; label: string }[] = [
  { key: "originPort", label: "Port d'origine" },
  { key: "destination", label: "Destination" },
  { key: "plannedCall", label: "Escale prévue" },
  { key: "possibleCall", label: "Escale possible" },
];

function hasContent(draft: ConsultationDraftInput) {
  const walk = (v: unknown): boolean =>
    typeof v === "string" ? v.trim() !== "" : v === true || (typeof v === "object" && v !== null && Object.values(v).some(walk));
  return walk(draft);
}

function filledCount(section: object) {
  const walk = (v: unknown): number =>
    typeof v === "string"
      ? Number(v.trim() !== "")
      : v === true
        ? 1
        : typeof v === "object" && v !== null
          ? Object.values(v).reduce<number>((n, x) => n + walk(x), 0)
          : 0;
  return walk(section);
}

export function ConsultationWorkspace({
  initialId,
  initialDraft,
  lastSavedAt,
  recordingData,
  observationData,
  prescriptionData,
}: {
  initialId: string | null;
  initialDraft: ConsultationDraftInput;
  lastSavedAt?: string;
  recordingData: RecordingStageData;
  observationData: ObservationStageData;
  prescriptionData: PrescriptionStageData;
}) {
  const router = useRouter();
  const [medications, setMedications] = useState<MedicationLine[]>(observationData.form?.medications ?? []);
  const [allergy, setAllergy] = useState(() => allergyText(observationData.form));
  const [rxLines, setRxLines] = useState<PrescriptionLine[]>(prescriptionData.data?.lines ?? []);
  const [transcription, setTranscription] = useState<TranscriptionInfo | null>(recordingData.transcription);
  const [step, setStep] = useState(() => {
    if (prescriptionData.validationStatus === "validated") return 6;
    if (observationData.validationStatus === "validated") return 5;
    if (observationData.form?.extractedAt) return 4;
    if (recordingData.transcription?.confirmedAt) return 3;
    if (recordingData.recordings.length) return 2;
    if (recordingData.consent.recordingConsentAt) return 1;
    return 0;
  });
  const [id, setId] = useState(initialId);
  const [draft, setDraft] = useState(initialDraft);
  const [state, setState] = useState<SaveState>(initialId ? "saved" : "idle");
  const [savedAt, setSavedAt] = useState(lastSavedAt);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();

  // Sauvegarde sérialisée : une seule requête à la fois, la dernière version gagne.
  const latest = useRef(draft);
  const idRef = useRef(id);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const version = useRef(0);

  const saveOnce = async () => {
    const sentVersion = version.current;
    setState("saving");
    try {
      const result = await saveConsultationDraft(idRef.current, latest.current);
      if (result.ok) {
        if (!idRef.current) {
          idRef.current = result.id;
          setId(result.id);
          // Met l'URL à jour sans recharger la page (le brouillon reste à l'écran).
          window.history.replaceState(null, "", `/consultations/${result.id}`);
        }
        setSavedAt(result.savedAt);
        setError(undefined);
        setFieldErrors({});
        setState(version.current === sentVersion ? "saved" : "dirty");
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        setState("error");
      }
    } catch {
      setError("Connexion au serveur impossible. Vos saisies sont conservées à l'écran.");
      setState("error");
    }
  };

  const save = async (force = false) => {
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    if (!idRef.current && !force && !hasContent(latest.current)) return;
    inFlight.current = true;
    try {
      do {
        pending.current = false;
        await saveOnce();
      } while (pending.current);
    } finally {
      inFlight.current = false;
    }
  };

  const autosave = useEffectEvent(() => void save());

  /** Crée le brouillon s'il n'existe pas encore (avant le premier enregistrement). */
  const ensureId = async () => {
    if (idRef.current) return idRef.current;
    while (inFlight.current) await new Promise((r) => setTimeout(r, 100));
    if (!idRef.current) await save(true);
    return idRef.current;
  };

  // Sauvegarde automatique après une pause dans la saisie.
  useEffect(() => {
    if (state !== "dirty") return;
    const timer = setTimeout(autosave, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, draft]);

  // Avertit avant de quitter la page si des modifications ne sont pas enregistrées.
  useEffect(() => {
    if (state !== "dirty" && state !== "saving" && state !== "error") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state]);

  const update = (updater: (d: ConsultationDraftInput) => ConsultationDraftInput) => {
    setDraft((d) => {
      const next = updater(d);
      latest.current = next;
      return next;
    });
    version.current += 1;
    setState("dirty");
  };

  const setCall = <K extends keyof CallInformation>(key: K, value: CallInformation[K]) =>
    update((d) => ({ ...d, call: { ...d.call, [key]: value } }));
  const setPatient = <K extends keyof PatientInformation>(key: K, value: PatientInformation[K]) =>
    update((d) => ({ ...d, patient: { ...d.patient, [key]: value } }));
  const setVessel = <K extends keyof VesselInformation>(key: K, value: VesselInformation[K]) =>
    update((d) => ({ ...d, vessel: { ...d.vessel, [key]: value } }));
  const setPort = (port: PortKey, key: "name" | "dateOrDelay", value: string) =>
    update((d) => ({ ...d, vessel: { ...d.vessel, [port]: { ...d.vessel[port], [key]: value } } }));

  const onDateOfBirth = (value: string) =>
    update((d) => {
      const at = d.call.callDate ? new Date(`${d.call.callDate}T12:00:00`) : new Date();
      const age = computeAge(value, at);
      return { ...d, patient: { ...d.patient, dateOfBirth: value, age: age === undefined ? d.patient.age : String(age) } };
    });

  const err = (path: string) => fieldErrors[path];
  const p = draft.patient;
  const v = draft.vessel;
  const c = draft.call;

  return (
    <div className="space-y-6 pb-28">
      <WorkflowSteps current={step} completed={Array.from({ length: step }, (_, i) => i)} />

      <FormSection
        title="Appel"
        description="Date, heure d'appel locale, ATU, médecin CCMM, responsable de soins"
        icon={<PhoneCall className="size-4" />}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label="Date" type="date" value={c.callDate ?? ""} onChange={(x) => setCall("callDate", x)} error={err("call.callDate")} />
          <TextField label="Heure d'appel locale" type="time" value={c.callTime ?? ""} onChange={(x) => setCall("callTime", x)} error={err("call.callTime")} />
          <TextField label="ATU" value={c.atu ?? ""} onChange={(x) => setCall("atu", x)} error={err("call.atu")} />
          <TextField label="Médecin CCMM" value={c.ccmmDoctor ?? ""} onChange={(x) => setCall("ccmmDoctor", x)} error={err("call.ccmmDoctor")} />
          <TextField label="Responsable de soins" value={c.careManager ?? ""} onChange={(x) => setCall("careManager", x)} error={err("call.careManager")} />
        </div>
      </FormSection>

      <FormSection
        title="Patient"
        description="Identité et fonction à bord"
        icon={<User className="size-4" />}
        badge={<Badge variant="secondary">{filledCount(p)}/8</Badge>}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="Nom" value={p.lastName ?? ""} onChange={(x) => setPatient("lastName", x)} error={err("patient.lastName")} autoComplete="off" className="lg:col-span-2" />
          <TextField label="Prénom" value={p.firstName ?? ""} onChange={(x) => setPatient("firstName", x)} error={err("patient.firstName")} autoComplete="off" className="lg:col-span-2" />
          <TextField label="Date de naissance" type="date" value={p.dateOfBirth ?? ""} onChange={onDateOfBirth} error={err("patient.dateOfBirth")} />
          <TextField
            label="Âge"
            type="number"
            inputMode="numeric"
            min={0}
            max={130}
            value={String(p.age ?? "")}
            onChange={(x) => setPatient("age", x)}
            error={err("patient.age")}
            hint={p.dateOfBirth ? "Calculé depuis la date de naissance" : undefined}
          />
          <TextField label="Nationalité" value={p.nationality ?? ""} onChange={(x) => setPatient("nationality", x)} error={err("patient.nationality")} />
          <ChoiceField
            label="Sexe"
            value={(p.gender ?? "") as "M" | "F" | ""}
            options={[
              { value: "M", label: "M" },
              { value: "F", label: "F" },
            ]}
            onChange={(x) => setPatient("gender", x)}
          />
          <TextField label="N° d'immatriculation" value={p.registrationNumber ?? ""} onChange={(x) => setPatient("registrationNumber", x)} error={err("patient.registrationNumber")} className="lg:col-span-2" />
          <TextField label="Fonction" value={p.role ?? ""} onChange={(x) => setPatient("role", x)} error={err("patient.role")} className="lg:col-span-2" />
        </div>
      </FormSection>

      <FormSection
        title="Navire"
        description="Tous les champs sont facultatifs"
        defaultOpen={false}
        icon={<Ship className="size-4" />}
        badge={<Badge variant="secondary">{filledCount(v)} renseigné{filledCount(v) > 1 ? "s" : ""}</Badge>}
      >
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField label="Nom du navire" value={v.name ?? ""} onChange={(x) => setVessel("name", x)} error={err("vessel.name")} />
            <TextField label="Pavillon" value={v.flag ?? ""} onChange={(x) => setVessel("flag", x)} error={err("vessel.flag")} />
            <TextField label="Type" value={v.type ?? ""} onChange={(x) => setVessel("type", x)} error={err("vessel.type")} />
            <div className="flex flex-wrap items-end gap-4">
              <ChoiceField
                label="Dotation"
                value={(v.allocation ?? "") as "A" | "B" | "C" | ""}
                options={[
                  { value: "A", label: "A" },
                  { value: "B", label: "B" },
                  { value: "C", label: "C" },
                ]}
                onChange={(x) => setVessel("allocation", x)}
              />
              <div className="pb-2">
                <CheckboxField label="B ou C restreinte" checked={Boolean(v.allocationRestricted)} onChange={(x) => setVessel("allocationRestricted", x)} />
              </div>
            </div>
            <TextField label="Armement" value={v.owner ?? ""} onChange={(x) => setVessel("owner", x)} error={err("vessel.owner")} />
            <TextField label="Indicatif radio / MMSI" value={v.callSignMmsi ?? ""} onChange={(x) => setVessel("callSignMmsi", x)} error={err("vessel.callSignMmsi")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField label="Tél. passerelle" type="tel" value={v.bridgePhone ?? ""} onChange={(x) => setVessel("bridgePhone", x)} error={err("vessel.bridgePhone")} />
            <TextField label="Tél. infirmerie" type="tel" value={v.infirmaryPhone ?? ""} onChange={(x) => setVessel("infirmaryPhone", x)} error={err("vessel.infirmaryPhone")} />
            <TextField label="Fax" type="tel" value={v.fax ?? ""} onChange={(x) => setVessel("fax", x)} error={err("vessel.fax")} />
            <TextField label="E-mail" type="email" value={v.email ?? ""} onChange={(x) => setVessel("email", x)} error={err("vessel.email")} />
            <TextField label="Telex" value={v.telex ?? ""} onChange={(x) => setVessel("telex", x)} error={err("vessel.telex")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Coordonnées GPS" placeholder="ex. 43°17'N / 005°22'E" value={v.gpsCoordinates ?? ""} onChange={(x) => setVessel("gpsCoordinates", x)} error={err("vessel.gpsCoordinates")} />
            <TextField label="Position" value={v.position ?? ""} onChange={(x) => setVessel("position", x)} error={err("vessel.position")} />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Route et escales</p>
            <div className="divide-y rounded-lg border">
              {PORTS.map((port) => (
                <div key={port.key} className="grid gap-3 p-3 sm:grid-cols-[1fr_14rem] sm:items-end">
                  <TextField label={port.label} value={v[port.key]?.name ?? ""} onChange={(x) => setPort(port.key, "name", x)} error={err(`vessel.${port.key}.name`)} />
                  <TextField label="Date ou délai" value={v[port.key]?.dateOrDelay ?? ""} onChange={(x) => setPort(port.key, "dateOrDelay", x)} error={err(`vessel.${port.key}.dateOrDelay`)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Enregistrement et transcription"
        description="Consentement, enregistrement de la consultation, transcription et correction"
        icon={<Mic className="size-4" />}
      >
        <RecordingStage
          consultationId={id}
          ensureId={ensureId}
          data={recordingData}
          onProgress={(n) => setStep((s) => Math.max(s, n))}
          onTranscriptionChange={setTranscription}
        />
      </FormSection>

      <FormSection
        title="Fiche d'observation médicale"
        description="Propositions de l'IA à vérifier, corriger ou rejeter, puis validation par le médecin"
        icon={<ClipboardCheck className="size-4" />}
      >
        <ObservationReview
          consultationId={id}
          transcription={transcription}
          providerConfigured={recordingData.providerConfigured}
          providerLabel={recordingData.providerLabel}
          initial={observationData}
          onProgress={(n) => setStep((s) => Math.max(s, n))}
          onFormChange={(f) => {
            setMedications(f.medications);
            setAllergy(allergyText(f));
          }}
          prescriptionLines={rxLines}
          defaultDoctor={prescriptionData.prescriber.fullName}
          onStatusChange={() => router.refresh()}
        />
      </FormSection>

      <FormSection
        title="Ordonnance"
        description="Rédigée et validée par le médecin"
        icon={<FileSignature className="size-4" />}
      >
        <PrescriptionEditor
          consultationId={id}
          initial={prescriptionData}
          medications={medications}
          patientName={[draft.patient.firstName, draft.patient.lastName].filter(Boolean).join(" ")}
          patientAge={draft.patient.age === undefined || draft.patient.age === "" ? computeAge(draft.patient.dateOfBirth ?? "") : Number(draft.patient.age)}
          allergy={allergy}
          onLinesChange={setRxLines}
          onStatusChange={(_, validated) => {
            if (validated) setStep((s) => Math.max(s, 6));
            router.refresh();
          }}
        />
      </FormSection>

      {/* Barre d'actions fixe */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <SaveIndicator state={state} savedAt={savedAt} error={error} />
          <div className="ml-auto flex items-center gap-2">
            {id &&
              (confirmDelete ? (
                <>
                  <span className="hidden text-sm text-destructive sm:inline">Supprimer définitivement ?</span>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                    Annuler
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleting}
                    onClick={() =>
                      startDelete(async () => {
                        const result = await deleteConsultation(id);
                        if (result && !result.ok) {
                          setError(result.error);
                          setState("error");
                          setConfirmDelete(false);
                        }
                      })
                    }
                  >
                    {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    Confirmer
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} aria-label="Supprimer la consultation">
                  <Trash2 /> <span className="hidden sm:inline">Supprimer</span>
                </Button>
              ))}
            {state === "error" ? (
              <Button size="sm" onClick={() => void save()}>
                <RotateCw /> Réessayer
              </Button>
            ) : (
              <Button size="sm" onClick={() => void save()} disabled={state === "saving" || state === "saved" || state === "idle"}>
                <CloudUpload /> Enregistrer
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ state, savedAt, error }: { state: SaveState; savedAt?: string; error?: string }) {
  const time = savedAt
    ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(savedAt))
    : null;
  const content = {
    idle: <span className="text-muted-foreground">Commencez la saisie : le brouillon sera créé automatiquement.</span>,
    dirty: <span className="text-muted-foreground">Modifications non enregistrées…</span>,
    saving: (
      <span className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Enregistrement…
      </span>
    ),
    saved: (
      <span className="flex items-center gap-2 text-success">
        <CheckCircle2 className="size-4" /> Brouillon enregistré{time ? ` à ${time}` : ""}
      </span>
    ),
    error: (
      <span className="flex items-center gap-2 text-destructive">
        <AlertCircle className="size-4" /> {error ?? "Échec de l'enregistrement."}
      </span>
    ),
  }[state];
  return (
    <div className="min-w-0 text-sm" role="status" aria-live="polite">
      {content}
    </div>
  );
}

/** Allergie médicamenteuse renseignée dans la fiche (affichée sur l'ordonnance). */
function allergyText(form: ObservationStageData["form"]): string | null {
  const flag = form?.fields["history.drugAllergy"]?.value;
  const detail = form?.fields["history.drugAllergyDetail"]?.value;
  if (flag !== "oui" && !detail) return null;
  return typeof detail === "string" && detail ? detail : "Allergie signalée, médicament non précisé.";
}
