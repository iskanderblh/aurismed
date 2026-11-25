import { z } from "zod";

const text = (max = 200) => z.string().trim().max(max, `${max} caractères maximum`);

export const settingsSchema = z.object({
  fullName: text(120),
  specialty: text(120),
  rpps: text(20).refine((v) => v === "" || /^\d{11}$/.test(v), "Le n° RPPS comporte 11 chiffres"),
  phone: text(40),
  institutionName: text(),
  institutionAddress: text(400),
  institutionPhone: text(40),
  audioRetentionDays: z.coerce
    .number({ error: "Nombre de jours requis" })
    .int("Nombre entier attendu")
    .min(0, "0 jour minimum")
    .max(3650, "3650 jours maximum"),
});

export type SettingsValues = z.output<typeof settingsSchema>;
