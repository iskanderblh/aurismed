import type { Json, Tables, TablesUpdate } from "@/types/database";
import {
  emptyDraft,
  emptyPort,
  type ConsultationDraft,
  type ConsultationDraftInput,
} from "./schema";

type Row = Pick<
  Tables<"consultations">,
  | "patient_name"
  | "patient_first_name"
  | "patient_date_of_birth"
  | "patient_gender"
  | "patient_information"
  | "vessel_information"
  | "call_information"
>;

const obj = (v: Json): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Ligne SQL -> valeurs du formulaire (chaînes vides pour les champs absents). */
export function rowToDraft(row: Row): ConsultationDraftInput {
  const base = emptyDraft();
  const p = obj(row.patient_information);
  const v = obj(row.vessel_information);
  const c = obj(row.call_information);
  const port = (x: unknown) => {
    const o = obj(x as Json);
    return { ...emptyPort, name: str(o.name), dateOrDelay: str(o.dateOrDelay) };
  };
  return {
    call: {
      callDate: str(c.callDate),
      callTime: str(c.callTime),
      atu: str(c.atu),
      ccmmDoctor: str(c.ccmmDoctor),
      careManager: str(c.careManager),
    },
    patient: {
      ...base.patient,
      lastName: row.patient_name ?? "",
      firstName: row.patient_first_name ?? "",
      dateOfBirth: row.patient_date_of_birth ?? "",
      gender: row.patient_gender ?? "",
      age: typeof p.age === "number" ? String(p.age) : "",
      nationality: str(p.nationality),
      registrationNumber: str(p.registrationNumber),
      role: str(p.role),
    },
    vessel: {
      ...base.vessel,
      name: str(v.name),
      flag: str(v.flag),
      type: str(v.type),
      allocation: (["A", "B", "C"].includes(str(v.allocation)) ? str(v.allocation) : "") as "A" | "B" | "C" | "",
      allocationRestricted: v.allocationRestricted === true,
      owner: str(v.owner),
      callSignMmsi: str(v.callSignMmsi),
      bridgePhone: str(v.bridgePhone),
      infirmaryPhone: str(v.infirmaryPhone),
      fax: str(v.fax),
      email: str(v.email),
      telex: str(v.telex),
      gpsCoordinates: str(v.gpsCoordinates),
      position: str(v.position),
      originPort: port(v.originPort),
      destination: port(v.destination),
      plannedCall: port(v.plannedCall),
      possibleCall: port(v.possibleCall),
    },
  };
}

/** Supprime les clés undefined (et les objets devenus vides) avant stockage en JSONB. */
function compact(value: unknown): Json | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") return value as Json;
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const c = compact(v);
    if (c !== undefined && !(typeof c === "object" && c !== null && Object.keys(c).length === 0)) out[k] = c;
  }
  return out;
}

/** Valeurs validées -> colonnes SQL. */
export function draftToRow(draft: ConsultationDraft): TablesUpdate<"consultations"> {
  const { lastName, firstName, dateOfBirth, gender, ...otherPatient } = draft.patient;
  const vessel = { ...draft.vessel, allocationRestricted: draft.vessel.allocationRestricted || undefined };
  return {
    patient_name: lastName ?? null,
    patient_first_name: firstName ?? null,
    patient_date_of_birth: dateOfBirth ?? null,
    patient_gender: gender ?? null,
    patient_information: compact(otherPatient) ?? {},
    vessel_information: compact(vessel) ?? {},
    call_information: compact(draft.call) ?? {},
  };
}
