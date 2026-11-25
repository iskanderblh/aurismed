"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCheck, CheckCircle2, Info, Loader2, RotateCw, ShieldCheck, Sparkles } from "lucide-react";
import { saveObservationForm, validateObservationForm } from "@/app/(app)/consultations/observation-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FIELD_BY_PATH, FIELDS, SECTIONS, type FieldDef, type SectionKey } from "@/lib/medical/catalog";
import { emptyFormData, isEmptyValue, pendingReview, type FieldState, type FieldValue, type ObservationFormData } from "@/lib/medical/form-state";
import type { ObservationStageData } from "@/lib/data/recordings";
import type { TranscriptionInfo } from "@/lib/recording/types";
import type { ObservationValidationStatus } from "@/types/database";
import { cn } from "@/lib/utils";
import { FormSection } from "../form-controls";
import { FieldEditor } from "./field-editor";
import { MedicationsEditor } from "./medications-editor";
import { BodyMap } from "./body-map";
import { CareChart } from "./care-chart";
import { FollowUps } from "./follow-ups";
import type { PrescriptionLine } from "@/lib/prescription/schema";
import { formatInZone } from "@/lib/time";

type SaveState = "saved" | "dirty" | "saving" | "error";
type View = "relevant" | "pending" | "all";

const VALIDATION_LABEL: Record<ObservationValidationStatus, string> = {
  draft: "Brouillon",
  ai_extracted: "Analysée par l'IA, à vérifier",
  in_review: "En cours de vérification",
  validated: "Validée par le médecin",
};

/**
 * Revue de la fiche d'observation : l'IA propose, le médecin accepte, corrige
 * ou rejette chaque valeur, puis valide. Rien n'est finalisé automatiquement.
 */
export function ObservationReview({
  consultationId,
  transcription,
  providerConfigured,
  providerLabel,
  initial,
  onProgress,
  onFormChange,
  prescriptionLines,
  defaultDoctor,
  onStatusChange,
  onValidationChange,
}: {
  consultationId: string | null;
  transcription: TranscriptionInfo | null;
  providerConfigured: boolean;
  providerLabel: string;
  initial: ObservationStageData;
  onProgress?: (step: number) => void;
  onFormChange?: (form: ObservationFormData) => void;
  prescriptionLines: PrescriptionLine[];
  defaultDoctor: string;
  onStatusChange?: () => void;
  onValidationChange?: (v: ObservationValidationStatus | null) => void;
}) {
  const [form, setForm] = useState<ObservationFormData | null>(initial.form);
  const [validation, setValidationState] = useState<ObservationValidationStatus | null>(initial.validationStatus);
  const setValidation = (v: ObservationValidationStatus | null) => {
    setValidationState(v);
    onValidationChange?.(v);
  };
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string>();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<{ message: string; retryable: boolean }>();
  const [confirmReanalyze, setConfirmReanalyze] = useState(false);
  const [validating, setValidating] = useState(false);
  const [view, setView] = useState<View>("relevant");
  const [changes, setChanges] = useState(0);

  const latest = useRef(form);
  const version = useRef(0);
  const savedVersion = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);

  const transcript = transcription ? transcription.corrected || transcription.original : "";
  const confirmed = Boolean(transcription?.confirmedAt);
  const pending = useMemo(() => (form ? pendingReview(form) : { fields: [], medications: [], total: 0 }), [form]);

  const apply = (next: ObservationFormData) => {
    latest.current = next;
    version.current += 1;
    setForm(next);
    onFormChange?.(next);
    setSaveState("dirty");
    setChanges((c) => c + 1);
  };

  /** Enregistre la dernière version ; une seule requête à la fois. */
  const persist = async (): Promise<boolean> => {
    if (!consultationId || !latest.current) return true;
    while (inFlight.current) await inFlight.current;
    if (version.current === savedVersion.current) return true;
    const sent = version.current;
    const run = (async () => {
      setSaveState("saving");
      try {
        const result = await saveObservationForm(consultationId, latest.current!);
        if (!result.ok) {
          setError(result.error);
          setSaveState("error");
          return false;
        }
        savedVersion.current = sent;
        setValidation(result.validationStatus);
        setError(undefined);
        setSaveState(version.current === sent ? "saved" : "dirty");
        return true;
      } catch {
        setError("Connexion au serveur impossible. Vos modifications sont conservées à l'écran.");
        setSaveState("error");
        return false;
      }
    })();
    inFlight.current = run;
    const ok = await run;
    inFlight.current = null;
    return ok;
  };

  const autosave = useEffectEvent(() => void persist());
  useEffect(() => {
    if (!changes) return;
    const t = setTimeout(autosave, 1200);
    return () => clearTimeout(t);
  }, [changes]);

  // Avertit avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    if (saveState !== "dirty" && saveState !== "error" && saveState !== "saving") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

  const analyze = async () => {
    if (!consultationId) return;
    setConfirmReanalyze(false);
    setAnalysisError(undefined);
    setAnalyzing(true);
    try {
      // La fusion côté serveur part de la fiche enregistrée : on enregistre d'abord.
      if (!(await persist())) {
        setAnalysisError({ message: "Enregistrez d'abord vos modifications (échec de la sauvegarde).", retryable: true });
        return;
      }
      const res = await fetch(`/api/consultations/${consultationId}/extraction`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; form: ObservationFormData; validationStatus: ObservationValidationStatus }
        | { ok: false; error: string; retryable?: boolean }
        | null;
      if (!body || !body.ok) {
        setAnalysisError({ message: body?.error ?? "L'analyse a échoué. Aucune donnée n'a été modifiée.", retryable: body?.retryable ?? true });
        return;
      }
      latest.current = body.form;
      version.current += 1;
      savedVersion.current = version.current;
      setForm(body.form);
      onFormChange?.(body.form);
      setValidation(body.validationStatus);
      setSaveState("saved");
      setView("relevant");
      onProgress?.(4);
    } catch {
      setAnalysisError({ message: "Connexion au serveur impossible. Réessayez.", retryable: true });
    } finally {
      setAnalyzing(false);
    }
  };

  const validate = async () => {
    if (!consultationId || !latest.current) return;
    setValidating(true);
    setError(undefined);
    while (inFlight.current) await inFlight.current;
    const sent = version.current;
    try {
      const result = await validateObservationForm(consultationId, latest.current);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      savedVersion.current = sent;
      setValidation(result.validationStatus);
      setSaveState(version.current === sent ? "saved" : "dirty");
      onProgress?.(5);
      onStatusChange?.();
    } catch {
      setError("Connexion au serveur impossible. La fiche n'a pas été validée.");
    } finally {
      setValidating(false);
    }
  };

  // --- Opérations de revue ---------------------------------------------------
  const base = form ?? emptyFormData();
  const setField = (path: string, next: FieldState | undefined) => {
    const fields = { ...base.fields };
    if (next) fields[path] = next;
    else delete fields[path];
    apply({ ...base, fields });
  };
  const change = (path: string, value: FieldValue | null) => {
    const prev = base.fields[path];
    const fromAi = prev && (prev.status === "extracted" || prev.status === "needs_verification");
    const aiValue = prev?.aiValue !== undefined ? prev.aiValue : fromAi ? prev.value : undefined;
    if (isEmptyValue(value) && aiValue === undefined) return setField(path, undefined);
    setField(path, {
      value: isEmptyValue(value) ? null : value,
      status: "manual",
      ...(aiValue !== undefined && { aiValue, source: prev?.source, confidence: prev?.confidence }),
    });
  };
  const accept = (path: string) => {
    const prev = base.fields[path];
    if (prev) setField(path, { ...prev, status: "confirmed", aiValue: prev.value, notes: undefined });
  };
  const reject = (path: string) => {
    const prev = base.fields[path];
    if (prev) setField(path, { value: null, status: "manual", rejected: true, aiValue: prev.value, source: prev.source, confidence: prev.confidence });
  };
  const restore = (path: string) => {
    const prev = base.fields[path];
    if (prev?.aiValue !== undefined) setField(path, { ...prev, value: prev.aiValue, status: "needs_verification", rejected: undefined });
  };
  const highConfidence = Object.entries(base.fields).filter(([, s]) => s.status === "extracted" && s.confidence === "high" && !s.notes?.length);
  const acceptAllHigh = () => {
    const fields = { ...base.fields };
    for (const [p, s] of highConfidence) fields[p] = { ...s, status: "confirmed", aiValue: s.value };
    apply({ ...base, fields });
  };

  // --- Rendu -----------------------------------------------------------------
  if (!consultationId) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="size-4" /> Renseignez d&apos;abord le patient : la fiche sera créée avec la consultation.
      </p>
    );
  }

  const counts = Object.values(base.fields).reduce(
    (acc, s) => {
      if (s.status === "needs_verification") acc.verify += 1;
      else if (s.status === "extracted") acc.extracted += 1;
      else if (s.status === "not_mentioned") acc.notMentioned += 1;
      else if (!isEmptyValue(s.value)) acc.doctor += 1;
      return acc;
    },
    { verify: 0, extracted: 0, notMentioned: 0, doctor: 0 },
  );

  const visible = (f: FieldDef) => {
    const s = base.fields[f.path];
    // Les champs réservés au médecin sont toujours affichés.
    if (view === "all" || f.ai === false) return true;
    const isPending = s?.status === "extracted" || s?.status === "needs_verification";
    if (view === "pending") return isPending;
    return isPending || (s && (!isEmptyValue(s.value) || s.aiValue !== undefined));
  };

  return (
    <div className="space-y-5">
      {/* Lancement de l'analyse */}
      <div className="rounded-lg border bg-muted/40 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <Sparkles className="mt-0.5 size-5 text-primary" />
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <p className="font-medium">{form?.extractedAt ? "Analyse IA effectuée" : "Analyse de la transcription par l'IA"}</p>
            <p className="text-muted-foreground">
              La transcription confirmée sera envoyée à {providerLabel} pour proposer des valeurs. Chaque proposition reste à vérifier :
              l&apos;IA n&apos;établit pas de diagnostic, ne prescrit pas et ne valide rien.
            </p>
            {form?.extractedAt && (
              <p className="text-xs text-muted-foreground">
                Dernière analyse : {formatInZone(form.extractedAt, { dateStyle: "short", timeStyle: "short" })}
                {form.model ? ` · ${form.model}` : ""}
              </p>
            )}
          </div>
          {confirmReanalyze ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Vos saisies et confirmations seront conservées.</span>
              <Button size="sm" variant="ghost" onClick={() => setConfirmReanalyze(false)}>
                Annuler
              </Button>
              <Button size="sm" onClick={() => void analyze()}>
                Relancer
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              disabled={analyzing || !providerConfigured || !confirmed}
              onClick={() => (form?.extractedAt ? setConfirmReanalyze(true) : void analyze())}
            >
              {analyzing ? <Loader2 className="animate-spin" /> : form?.extractedAt ? <RotateCw /> : <Sparkles />}
              {analyzing ? "Analyse en cours…" : form?.extractedAt ? "Relancer l'analyse" : "Analyser avec l'IA"}
            </Button>
          )}
        </div>
        {!confirmed && (
          <p className="mt-3 text-sm text-muted-foreground">
            Confirmez la transcription pour lancer l&apos;analyse. Vous pouvez aussi remplir la fiche manuellement (« Tous les champs »).
          </p>
        )}
        {!providerConfigured && (
          <p className="mt-3 text-sm text-warning">Aucun fournisseur d&apos;IA configuré (OPENAI_API_KEY absente). Vous pouvez remplir la fiche manuellement.</p>
        )}
        {analyzing && <p className="mt-3 text-sm text-muted-foreground">Cela peut prendre jusqu&apos;à une minute pour une longue consultation.</p>}
        {analysisError && (
          <Alert variant="destructive" className="mt-3">
            <AlertCircle />
            <AlertTitle>Analyse impossible</AlertTitle>
            <AlertDescription>
              {analysisError.message}
              {analysisError.retryable && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => void analyze()}>
                  <RotateCw /> Réessayer
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Synthèse */}
      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="review-summary">
        {validation && <Badge variant={validation === "validated" ? "success" : "outline"}>{VALIDATION_LABEL[validation]}</Badge>}
        <Badge variant="warning">{counts.verify} à vérifier</Badge>
        <Badge variant="default">{counts.extracted} extraits</Badge>
        <Badge variant="secondary">{counts.doctor} saisis ou confirmés</Badge>
        <Badge variant="outline">{counts.notMentioned} non mentionnés</Badge>
        <div className="ml-auto flex rounded-md border p-0.5" role="group" aria-label="Champs affichés">
          {(
            [
              ["relevant", "Renseignés"],
              ["pending", `À revoir (${pending.fields.length})`],
              ["all", "Tous les champs"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={view === k}
              onClick={() => setView(k)}
              className={cn("rounded px-2.5 py-1 text-xs", view === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {highConfidence.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
          <span className="min-w-0 flex-1 text-muted-foreground">
            {highConfidence.length} proposition(s) à confiance élevée, avec citation vérifiée. Relisez-les avant de les accepter en bloc.
          </span>
          <Button size="sm" variant="outline" onClick={acceptAllHigh}>
            <CheckCheck /> Accepter ces {highConfidence.length} propositions
          </Button>
        </div>
      )}

      {/* Alertes */}
      {base.contradictions.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Contradictions relevées dans la transcription</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {base.contradictions.map((c, i) => (
                <li key={i}>
                  {c.description}
                  {c.paths.length > 0 && (
                    <span className="text-muted-foreground"> ({c.paths.map((p) => FIELD_BY_PATH.get(p)?.label ?? p).join(", ")})</span>
                  )}
                  {c.quotes.map((q) => (
                    <span key={q} className="block text-xs italic">
                      « {q} »
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {base.missing.length > 0 && (
        <Alert>
          <Info />
          <AlertTitle>Informations importantes non mentionnées</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {base.missing.map((m) => (
                <li key={m.path}>
                  <span className="font-medium">{FIELD_BY_PATH.get(m.path)?.label ?? m.path}</span> : {m.reason}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {base.discarded.length > 0 && (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">{base.discarded.length} proposition(s) de l&apos;IA écartée(s) par les contrôles</summary>
          <ul className="mt-2 space-y-1">
            {base.discarded.map((d, i) => (
              <li key={i}>
                <span className="font-medium">{FIELD_BY_PATH.get(d.path)?.label ?? d.path}</span> : « {d.value} », {d.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Sections de la fiche */}
      <div className="space-y-3">
        {SECTIONS.filter((x) => x.key !== "decision").map((section) => (
          <ReviewSection
            key={section.key + (base.extractedAt ?? "")}
            sectionKey={section.key}
            title={section.title}
            description={section.description}
            form={base}
            visible={visible}
            transcript={transcript}
            onChange={change}
            onAccept={accept}
            onReject={reject}
            onRestore={restore}
            showEmptyHint={view !== "all"}
            extra={
              section.key === "trauma" ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schéma des lésions</h4>
                  <BodyMap marks={base.bodyMarks} onChange={(bodyMarks) => apply({ ...base, bodyMarks })} />
                </div>
              ) : undefined
            }
          />
        ))}
        <FormSection
          title="Médicaments mentionnés"
          description="Uniquement ceux cités explicitement : aucune posologie n'est déduite"
          key={"meds" + (base.extractedAt ?? "")}
          defaultOpen={base.medications.length > 0}
          badge={pending.medications.length ? <Badge variant="warning">{pending.medications.length} à vérifier</Badge> : undefined}
        >
          <MedicationsEditor items={base.medications} onChange={(medications) => apply({ ...base, medications })} />
        </FormSection>
        {SECTIONS.filter((x) => x.key === "decision").map((section) => (
          <ReviewSection
            key={section.key}
            sectionKey={section.key}
            title={section.title}
            description={section.description}
            form={base}
            visible={visible}
            transcript={transcript}
            onChange={change}
            onAccept={accept}
            onReject={reject}
            onRestore={restore}
            showEmptyHint={false}
            forceOpen
          />
        ))}
        <FormSection
          title="Fiche de suivi"
          description="Appels suivants : constantes, décision, prochain rendez-vous"
          defaultOpen={base.followUps.length > 0}
          badge={base.followUps.length ? <Badge variant="secondary">{base.followUps.length} appel(s)</Badge> : undefined}
        >
          <FollowUps calls={base.followUps} defaultDoctor={defaultDoctor} onChange={(followUps) => apply({ ...base, followUps })} />
        </FormSection>
        <FormSection
          title="Diagramme de soins et de surveillance"
          description="Relevés horodatés : prescriptions, paramètres, soins réalisés"
          defaultOpen={base.careChart.columns.length > 0}
        >
          <CareChart chart={base.careChart} prescriptionLines={prescriptionLines} onChange={(careChart) => apply({ ...base, careChart })} />
        </FormSection>
      </div>

      {/* Validation */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <div className="min-w-0 flex-1 text-sm" role="status" aria-live="polite">
          {saveState === "saving" && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Enregistrement de la fiche…
            </span>
          )}
          {saveState === "dirty" && <span className="text-muted-foreground">Modifications non enregistrées…</span>}
          {saveState === "error" && (
            <span className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" /> {error}
            </span>
          )}
          {saveState === "saved" && error && (
            <span className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" /> {error}
            </span>
          )}
          {saveState === "saved" && !error && validation === "validated" && (
            <span className="flex items-center gap-2 text-success">
              <ShieldCheck className="size-4" /> Fiche validée par le médecin. Toute modification la repassera en vérification.
            </span>
          )}
          {!base.fields["decision.choice"]?.value && (
            <span className="mb-1 flex items-center gap-2 text-warning">
              <Info className="size-4" /> Aucune décision renseignée.
            </span>
          )}
          {saveState === "saved" && !error && validation !== "validated" && (
            <span className="flex items-center gap-2 text-muted-foreground">
              {pending.total > 0 ? (
                <>
                  <AlertTriangle className="size-4 text-warning" /> {pending.total} proposition(s) à accepter, corriger ou rejeter avant validation.
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4 text-success" /> Fiche enregistrée. Relisez-la puis validez-la.
                </>
              )}
            </span>
          )}
        </div>
        {saveState === "error" && (
          <Button size="sm" variant="outline" onClick={() => void persist()}>
            <RotateCw /> Réessayer
          </Button>
        )}
        <Button size="sm" disabled={validating || pending.total > 0 || validation === "validated" && saveState === "saved"} onClick={() => void validate()}>
          {validating ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Valider la fiche
        </Button>
      </div>
    </div>
  );
}

function ReviewSection({
  sectionKey,
  title,
  description,
  form,
  visible,
  transcript,
  onChange,
  onAccept,
  onReject,
  onRestore,
  showEmptyHint,
  extra,
  forceOpen,
}: {
  extra?: React.ReactNode;
  forceOpen?: boolean;
  sectionKey: SectionKey;
  title: string;
  description: string;
  form: ObservationFormData;
  visible: (f: FieldDef) => boolean | undefined;
  transcript: string;
  onChange: (path: string, v: FieldValue | null) => void;
  onAccept: (path: string) => void;
  onReject: (path: string) => void;
  onRestore: (path: string) => void;
  showEmptyHint: boolean;
}) {
  const fields = FIELDS.filter((f) => f.section === sectionKey);
  const shown = fields.filter(visible);
  const pendingCount = fields.filter((f) => ["extracted", "needs_verification"].includes(form.fields[f.path]?.status ?? "")).length;
  const groups = [...new Set(shown.map((f) => f.group))];

  return (
    <FormSection
      title={title}
      description={description}
      defaultOpen={forceOpen || pendingCount > 0 || shown.length > 0 || Boolean(extra && form.bodyMarks.length)}
      badge={pendingCount ? <Badge variant="warning">{pendingCount} à vérifier</Badge> : undefined}
    >
      {shown.length === 0 && extra ? null : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun champ renseigné.{showEmptyHint && " Choisissez « Tous les champs » pour compléter manuellement."}
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</h4>
              <div className="grid gap-2 md:grid-cols-2">
                {shown
                  .filter((f) => f.group === g)
                  .map((f) => (
                    <div key={f.path} className={cn(f.type === "longtext" && "md:col-span-2")}>
                      <FieldEditor
                        field={f}
                        state={form.fields[f.path]}
                        transcript={transcript}
                        onChange={(v) => onChange(f.path, v)}
                        onAccept={() => onAccept(f.path)}
                        onReject={() => onReject(f.path)}
                        onRestore={() => onRestore(f.path)}
                      />
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {extra && <div className={cn(shown.length > 0 && "mt-5")}>{extra}</div>}
    </FormSection>
  );
}
