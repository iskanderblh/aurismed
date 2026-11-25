/**
 * Évaluation de l'extraction avec le fournisseur réel, sur des scénarios fictifs.
 * Ignorée sans RUN_AI_EVAL=1 et OPENAI_API_KEY : `npm run eval:extraction`.
 * Les transcriptions envoyées sont synthétiques (aucune donnée de patient).
 */
import { describe, expect, it } from "vitest";
import { extractWithOpenAI } from "./openai-extraction";
import { processExtraction } from "./process";
import { SCENARIOS } from "./scenarios";

const enabled = process.env.RUN_AI_EVAL === "1" && Boolean(process.env.OPENAI_API_KEY);

describe.skipIf(!enabled)("évaluation de l'extraction (fournisseur réel)", () => {
  for (const s of SCENARIOS) {
    it(s.name, { timeout: 120_000 }, async () => {
      const { output, model } = await extractWithOpenAI(s.transcript);
      const form = processExtraction(output, s.transcript, null, { model });
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
