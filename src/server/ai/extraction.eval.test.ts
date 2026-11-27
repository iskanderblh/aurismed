/**
 * Évaluation de l'extraction avec le fournisseur réel, sur des scénarios fictifs.
 * Lancement : `npm run eval:extraction` (Ollama local démarré, OLLAMA_MODEL défini).
 * Les transcriptions sont synthétiques (aucune donnée de patient) et restent sur le poste.
 */
import { describe, expect, it } from "vitest";
import { extractWithLocalModel } from "./local-extraction";
import { processExtraction } from "./process";
import { SCENARIOS } from "./scenarios";

// Lancée par `npm run eval:extraction` (mode « eval »), ignorée par `npm test`.
const enabled = (import.meta as { env?: { MODE?: string } }).env?.MODE === "eval" || process.env.RUN_AI_EVAL === "1";

describe.skipIf(!enabled)("évaluation de l'extraction (modèle local réel)", () => {
  for (const s of SCENARIOS) {
    it(s.name, { timeout: 600_000 }, async () => {
      const maritime = s.maritime ?? true;
      const { output, model } = await extractWithLocalModel(s.transcript, { maritime });
      const form = processExtraction(output, s.transcript, null, { model, maritime });
      for (const [id, presence] of Object.entries(s.symptoms ?? {})) {
        expect(form.symptoms?.[id]?.presence, `symptôme ${id}`).toBe(presence);
      }
      for (const [path, value] of Object.entries(s.expect)) {
        const v = form.fields[path]?.value;
        if (Array.isArray(value)) expect(v, path).toEqual(expect.arrayContaining(value));
        else expect(v, path).toEqual(value);
      }
      for (const path of s.absent) {
        expect(form.fields[path]?.value ?? null, `${path} ne doit pas être rempli`).toBeNull();
      }
      for (const path of s.expectNeedsVerification ?? []) {
        const st = form.fields[path];
        if (st && st.value !== null) expect(st.status, path).toBe("needs_verification");
      }
      if (s.expectContradiction) expect(form.contradictions.length).toBeGreaterThan(0);
      if (s.noMedications) expect(form.medications).toHaveLength(0);
      for (const m of s.medications ?? []) {
        const line = form.medications.find((x) => m.name.test(x.name));
        expect(line, String(m.name)).toBeDefined();
        expect(line!.status).toBe("proposed");
        if (m.dosageEmpty) expect(line!.dosage).toBe("");
      }
      // Aucune proposition n'est jamais considérée comme validée.
      expect(Object.values(form.fields).some((f) => f.status === "confirmed")).toBe(false);
    });
  }
});
