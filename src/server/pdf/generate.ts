import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { rowToDraft } from "@/lib/consultation/mapping";
import { computeAge } from "@/lib/consultation/schema";
import { formDataSchema, type ObservationFormData } from "@/lib/medical/form-state";
import { prescriptionIssues, prescriptionSchema } from "@/lib/prescription/schema";
import { getPrescriptionStageData } from "@/lib/data/prescriptions";
import type { createClient } from "@/server/db/client";
import type { DocumentType } from "@/types/database";
import { documentFileName, formatInstant, printableLines } from "./model";
import { ObservationDocument } from "./observation-document";
import { PrescriptionDocument } from "./prescription-document";

type Client = Awaited<ReturnType<typeof createClient>>;

export class DocumentError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

/**
 * Génère le PDF à partir des seules données validées par le médecin, l'enregistre
 * dans le bucket privé « documents » et crée une nouvelle version.
 */
export async function generateDocument(db: Client, userId: string, consultationId: string, type: DocumentType, timeZone: string) {
  const [{ data: consultation }, { data: obs }, { data: rx }, { data: last }] = await Promise.all([
    db.from("consultations").select("*").eq("id", consultationId).maybeSingle(),
    db.from("observation_forms").select("form_data, validation_status, validated_at").eq("consultation_id", consultationId).maybeSingle(),
    db.from("prescriptions").select("prescription_data, validation_status, validated_at").eq("consultation_id", consultationId).maybeSingle(),
    db
      .from("generated_documents")
      .select("version")
      .eq("consultation_id", consultationId)
      .eq("document_type", type)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!consultation) throw new DocumentError("Consultation introuvable.", 404);
  const draft = rowToDraft(consultation);
  const version = (last?.version ?? 0) + 1;
  const consultationDate = new Date(consultation.consultation_date);
  const prescriptionStage = await getPrescriptionStageData(userId, null);
  const prescriber = prescriptionStage.prescriber;

  const parsedRx = rx ? prescriptionSchema.safeParse(rx.prescription_data) : null;
  const validRx = rx?.validation_status === "validated" && parsedRx?.success ? parsedRx.data : null;

  let buffer: Buffer;
  if (type === "observation") {
    if (obs?.validation_status !== "validated") throw new DocumentError("Validez d'abord la fiche d'observation.");
    const parsed = formDataSchema.safeParse(obs.form_data);
    if (!parsed.success) throw new DocumentError("La fiche enregistrée est illisible. Ouvrez-la et enregistrez-la à nouveau.", 422);
    buffer = await renderToBuffer(
      ObservationDocument({
        draft,
        form: parsed.data as ObservationFormData,
        prescription: validRx,
        consultationDate,
        validatedAtLabel: formatInstant(obs.validated_at, timeZone),
        doctorName: prescriber.fullName,
        version,
      }),
    );
  } else {
    if (!validRx) throw new DocumentError("Validez d'abord l'ordonnance.");
    if (prescriptionIssues(validRx).length) throw new DocumentError("L'ordonnance est incomplète.");
    if (!printableLines(validRx).length) throw new DocumentError("Aucun médicament prescrit : pas d'ordonnance à imprimer.");
    const form = obs ? formDataSchema.safeParse(obs.form_data) : null;
    const detail = form?.success ? form.data.fields["history.drugAllergyDetail"]?.value : null;
    const flag = form?.success ? form.data.fields["history.drugAllergy"]?.value : null;
    const p = draft.patient;
    const age = p.age !== undefined && p.age !== "" ? Number(p.age) : p.dateOfBirth ? computeAge(p.dateOfBirth, consultationDate) : undefined;
    buffer = await renderToBuffer(
      PrescriptionDocument({
        prescription: validRx,
        prescriber,
        patientName: [p.firstName, p.lastName?.toUpperCase()].filter(Boolean).join(" "),
        patientAge: age !== undefined && Number.isFinite(age) ? age : undefined,
        allergy: typeof detail === "string" && detail ? detail : flag === "oui" ? "oui (médicament non précisé)" : null,
        dateLabel: formatInstant(rx!.validated_at, timeZone).split(" à ")[0],
        validatedAtLabel: formatInstant(rx!.validated_at, timeZone),
        version,
      }),
    );
  }

  const fileName = documentFileName(type, draft.patient.lastName, consultation.consultation_date, version);
  const path = `${userId}/${consultationId}/${type}-v${version}-${Date.now()}.pdf`;
  const { error: uploadError } = await db.storage.from("documents").upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error("[pdf] envoi", uploadError.message);
    throw new DocumentError("Le PDF a été généré mais n'a pas pu être enregistré. Réessayez.", 500);
  }
  const { data: doc, error } = await db
    .from("generated_documents")
    .insert({ consultation_id: consultationId, user_id: userId, document_type: type, storage_path: path, version })
    .select("id, document_type, version, created_at")
    .single();
  if (error || !doc) {
    // Pas de fichier orphelin : on retire le PDF si la ligne n'a pas pu être créée.
    await db.storage.from("documents").remove([path]);
    console.error("[pdf] enregistrement", error?.code, error?.message);
    throw new DocumentError(error?.code === "23505" ? "Une génération est déjà en cours. Réessayez." : "Le document n'a pas pu être enregistré.", 500);
  }
  await db.from("audit_logs").insert({
    user_id: userId,
    consultation_id: consultationId,
    action: "document.generated",
    entity_type: "generated_document",
    entity_id: doc.id,
    metadata: { type, version },
  });
  return { ...doc, fileName, size: buffer.length };
}
