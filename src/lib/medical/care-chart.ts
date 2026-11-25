/** Lignes du diagramme de soins et de surveillance (page 9 de la fiche de référence). */
export const SURVEILLANCE_ROWS = [
  { key: "ta", label: "Tension artérielle" },
  { key: "fc", label: "Fréquence cardiaque (/min)" },
  { key: "fr", label: "Fréquence respiratoire (/min)" },
  { key: "temp", label: "Température (°C)" },
  { key: "pain", label: "Douleur EN (/10)" },
  { key: "glycemia", label: "Glycémie (g/L)" },
  { key: "diuresis", label: "Diurèse (ml)" },
  { key: "stools", label: "Selles" },
] as const;

export const CARE_ROWS = [
  { key: "dressing", label: "Pansement / Désinfection" },
  { key: "suture", label: "Suture / Agrafes" },
  { key: "injection", label: "Injection" },
  { key: "ecg", label: "ECG" },
  { key: "bu", label: "Bandelette urinaire" },
  { key: "malaria", label: "Test paludisme" },
  { key: "photo", label: "Photo" },
  { key: "advice", label: "Consultation / Avis médical" },
] as const;
