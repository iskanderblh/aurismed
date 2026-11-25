/**
 * Fuseau d'affichage des horodatages, identique côté serveur et navigateur
 * (sinon le serveur, souvent en UTC, afficherait d'autres heures que le client).
 */
export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE || "Europe/Paris";

export function formatInZone(iso: string | Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: APP_TIME_ZONE }).format(typeof iso === "string" ? new Date(iso) : iso);
}
