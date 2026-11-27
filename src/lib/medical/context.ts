import { FIELD_BY_PATH, isMaritimeField } from "./catalog";
import { isEmptyValue, type ObservationFormData } from "./form-state";

/**
 * Contexte maritime (sections CCMM : BFV, bilan lésionnel, bilan médical,
 * décision, suivi) : choisi par le médecin. Pour une fiche antérieure à ce
 * choix, il reste affiché dès qu'une de ces sections contient des données.
 */
export function maritimeEnabled(form: ObservationFormData | null | undefined): boolean {
  if (!form) return false;
  if (form.maritime !== undefined) return form.maritime;
  const fieldData = Object.entries(form.fields).some(([path, s]) => {
    const def = FIELD_BY_PATH.get(path);
    return def && isMaritimeField(def) && !isEmptyValue(s.value);
  });
  return fieldData || form.followUps.length > 0 || form.careChart.columns.length > 0 || form.bodyMarks.length > 0;
}
