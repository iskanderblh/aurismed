"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { acknowledgeConsent } from "@/app/(app)/consultations/recording-actions";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "../form-controls";

/**
 * Consentement explicite avant tout enregistrement, et information sur le
 * traitement de l'audio et de la transcription par l'IA locale du poste.
 */
export function ConsentPanel({
  providerLabel,
  ensureId,
  onAccepted,
}: {
  providerLabel: string;
  ensureId: () => Promise<string | null>;
  onAccepted: (consent: { recordingConsentAt: string; aiAcknowledgedAt: string }) => void;
}) {
  const [patientConsent, setPatientConsent] = useState(false);
  const [aiNotice, setAiNotice] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-lg bg-secondary/60 p-4 text-sm text-secondary-foreground">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" />
        <div className="space-y-2">
          <p className="font-medium">Avant d&apos;enregistrer</p>
          <p>
            L&apos;audio est chiffré et stocké sur ce poste, dans un espace lié à votre compte. La transcription et
            l&apos;analyse sont faites par <strong>{providerLabel}</strong> : aucune donnée n&apos;est envoyée en ligne.
            N&apos;enregistrez que des patients informés et consentants.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <CheckboxField
          label="Le patient (ou son représentant à bord) a été informé et accepte l'enregistrement de la consultation."
          checked={patientConsent}
          onChange={setPatientConsent}
        />
        <CheckboxField
          label="J'ai pris connaissance que l'audio et la transcription seront analysés par l'IA locale de ce poste, sans envoi en ligne."
          checked={aiNotice}
          onChange={setAiNotice}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        disabled={!patientConsent || !aiNotice || pending}
        onClick={() =>
          start(async () => {
            setError(undefined);
            const id = await ensureId();
            if (!id) {
              setError("La consultation n'a pas pu être créée. Vérifiez votre connexion puis réessayez.");
              return;
            }
            const result = await acknowledgeConsent(id);
            if (result.ok) onAccepted(result);
            else setError(result.error);
          })
        }
      >
        {pending && <Loader2 className="animate-spin" />}
        Valider et passer à l&apos;enregistrement
      </Button>
    </div>
  );
}
