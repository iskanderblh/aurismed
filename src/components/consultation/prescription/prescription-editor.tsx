"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, ClipboardPlus, Info, Loader2, Plus, RotateCw, ShieldCheck, Trash2 } from "lucide-react";
import { savePrescription, validatePrescription } from "@/app/(app)/consultations/prescription-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PrescriptionStageData } from "@/lib/data/prescriptions";
import type { MedicationLine } from "@/lib/medical/form-state";
import {
  emptyPrescription,
  linesFromMedications,
  prescriptionIssues,
  type PrescriptionData,
  type PrescriptionLine,
} from "@/lib/prescription/schema";
import type { ConsultationStatus } from "@/types/database";
import { cn } from "@/lib/utils";
import { useAutosave } from "../use-autosave";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `p-${Date.now()}-${Math.random()}`);
const blankLine = (): PrescriptionLine => ({ id: newId(), name: "", dosage: "", posology: "", durationDays: null, problem: "" });

/**
 * Ordonnance rédigée par le médecin. Aucun dosage, posologie ni durée n'est
 * proposé par l'application ; la validation exige que le médecin les saisisse.
 */
export function PrescriptionEditor({
  consultationId,
  initial,
  medications,
  patientName,
  patientAge,
  allergy,
  onLinesChange,
  onStatusChange,
}: {
  consultationId: string | null;
  initial: PrescriptionStageData;
  medications: MedicationLine[];
  patientName: string;
  patientAge?: number;
  allergy: string | null;
  onLinesChange?: (lines: PrescriptionLine[]) => void;
  onStatusChange?: (s: ConsultationStatus | null, validated: boolean) => void;
}) {
  const [data, setData] = useState<PrescriptionData>(initial.data ?? emptyPrescription());
  const [validation, setValidation] = useState(initial.validationStatus);
  const [validating, setValidating] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const autosave = useAutosave<PrescriptionData>(async (value) => {
    const result = await savePrescription(consultationId!, value);
    if (result.ok) {
      setValidation(result.validationStatus);
      onStatusChange?.(result.consultationStatus, false);
    }
    return result;
  });

  const apply = (next: PrescriptionData) => {
    setData(next);
    onLinesChange?.(next.lines);
    autosave.changed(next);
  };
  const updateLine = (id: string, patch: Partial<PrescriptionLine>) => apply({ ...data, lines: data.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const importable = linesFromMedications(medications, data.lines, newId);
  const issues = prescriptionIssues(data);
  const p = initial.prescriber;

  if (!consultationId) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="size-4" /> Renseignez d&apos;abord le patient : l&apos;ordonnance sera rattachée à la consultation.
      </p>
    );
  }

  const validate = async () => {
    setShowIssues(true);
    if (issues.length) return;
    setValidating(true);
    try {
      const result = await autosave.run((v) => validatePrescription(consultationId, v), data);
      if (!result.ok) autosave.setError(result.error);
      else {
        setValidation(result.validationStatus);
        onStatusChange?.(result.consultationStatus, true);
      }
    } catch {
      autosave.setError("Connexion au serveur impossible. L'ordonnance n'a pas été validée.");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* En-tête de l'ordonnance */}
      <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="font-semibold">{p.fullName || "Nom du médecin non renseigné"}</p>
          {p.specialty && <p>{p.specialty}</p>}
          {p.rpps && <p className="text-muted-foreground">RPPS {p.rpps}</p>}
          {p.institutionName && <p className="mt-1">{p.institutionName}</p>}
          {p.institutionAddress && <p className="whitespace-pre-line text-muted-foreground">{p.institutionAddress}</p>}
          {!p.fullName && (
            <Link href="/parametres" className="text-xs text-primary underline">
              Compléter le profil dans Paramètres
            </Link>
          )}
        </div>
        <div className="sm:text-right">
          <p className="font-semibold">{patientName || "Patient non renseigné"}</p>
          {patientAge !== undefined && <p>{patientAge} ans</p>}
          <p className="text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date())}</p>
        </div>
      </div>

      {allergy && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Allergie médicamenteuse signalée</AlertTitle>
          <AlertDescription>{allergy}</AlertDescription>
        </Alert>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        AurisMED ne propose ni médicament, ni dosage, ni posologie : ces informations sont saisies et vérifiées par le médecin.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[var(--primary)]"
          checked={data.noPrescription}
          onChange={(e) => apply({ ...data, noPrescription: e.target.checked })}
        />
        Aucun médicament prescrit
      </label>

      {!data.noPrescription && (
        <>
          {importable.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
              <span className="min-w-0 flex-1 text-muted-foreground">
                {importable.length} médicament(s) accepté(s) dans la fiche : {importable.map((l) => l.name).join(", ")}. Les champs non dits restent vides.
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => apply({ ...data, lines: [...data.lines, ...importable] })}>
                <ClipboardPlus /> Reprendre dans l&apos;ordonnance
              </Button>
            </div>
          )}
          <div className="space-y-2" data-testid="prescription-lines">
            {data.lines.map((l, i) => (
              <div key={l.id} data-line={i + 1} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_2fr_7rem_1.5fr_auto] sm:items-end">
                <Field label="Nom / DCI">
                  <Input value={l.name} maxLength={200} onChange={(e) => updateLine(l.id, { name: e.target.value })} />
                </Field>
                <Field label="Dosage">
                  <Input value={l.dosage} maxLength={200} placeholder="ex. 500 mg" aria-invalid={showIssues && !l.dosage.trim() ? true : undefined} onChange={(e) => updateLine(l.id, { dosage: e.target.value })} />
                </Field>
                <Field label="Posologie">
                  <Input value={l.posology} maxLength={500} aria-invalid={showIssues && !l.posology.trim() ? true : undefined} onChange={(e) => updateLine(l.id, { posology: e.target.value })} />
                </Field>
                <Field label="Durée (jours)">
                  <Input
                    inputMode="numeric"
                    value={l.durationDays ?? ""}
                    aria-invalid={showIssues && l.durationDays === null ? true : undefined}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                      updateLine(l.id, { durationDays: v ? Number(v) : null });
                    }}
                  />
                </Field>
                <Field label="Problème">
                  <Input value={l.problem} maxLength={300} onChange={(e) => updateLine(l.id, { problem: e.target.value })} />
                </Field>
                <Button type="button" size="sm" variant="ghost" aria-label={`Retirer la ligne ${i + 1}`} onClick={() => apply({ ...data, lines: data.lines.filter((x) => x.id !== l.id) })}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" size="sm" variant="outline" disabled={data.lines.length >= 30} onClick={() => apply({ ...data, lines: [...data.lines, blankLine()] })}>
            <Plus /> Ajouter un médicament
          </Button>
        </>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium">Consignes complémentaires</span>
        <Textarea rows={2} maxLength={4000} value={data.notes} onChange={(e) => apply({ ...data, notes: e.target.value })} />
      </label>

      {showIssues && issues.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Ordonnance incomplète</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {issues.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <div className="min-w-0 flex-1 text-sm" role="status" aria-live="polite">
          {autosave.state === "saving" && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Enregistrement de l&apos;ordonnance…
            </span>
          )}
          {autosave.state === "dirty" && <span className="text-muted-foreground">Modifications non enregistrées…</span>}
          {autosave.error && (
            <span className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" /> {autosave.error}
            </span>
          )}
          {autosave.state === "saved" && !autosave.error && (
            <span className={cn("flex items-center gap-2", validation === "validated" ? "text-success" : "text-muted-foreground")}>
              {validation === "validated" ? (
                <>
                  <ShieldCheck className="size-4" /> Ordonnance validée par le médecin. Toute modification annulera la validation.
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" /> {validation ? "Brouillon enregistré." : "Ordonnance non commencée."}
                </>
              )}
            </span>
          )}
        </div>
        {validation && <Badge variant={validation === "validated" ? "success" : "outline"}>{validation === "validated" ? "Validée" : "Brouillon"}</Badge>}
        {autosave.state === "error" && (
          <Button size="sm" variant="outline" onClick={() => void autosave.flush()}>
            <RotateCw /> Réessayer
          </Button>
        )}
        <Button size="sm" disabled={validating || (validation === "validated" && autosave.state === "saved")} onClick={() => void validate()}>
          {validating ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Valider l&apos;ordonnance
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
