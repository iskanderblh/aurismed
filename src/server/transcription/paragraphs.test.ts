import { describe, expect, it } from "vitest";
import { joinSegments, toParagraphs } from "./paragraphs";
import { continuityPrompt, MEDICAL_VOCABULARY_HINT } from "./medical-prompt";

describe("toParagraphs", () => {
  it("ne modifie aucun mot", () => {
    const text = "Bonjour docteur. J'ai mal au ventre depuis hier soir. Où avez-vous mal ? En bas à droite. Avez-vous de la fièvre ? Trente-huit degrés.";
    const out = toParagraphs(text);
    expect(out.replace(/\s+/g, " ")).toBe(text);
  });
  it("coupe après une question", () => {
    expect(toParagraphs("Avez-vous vomi ? Non. Des nausées oui.")).toBe("Avez-vous vomi ?\n\nNon. Des nausées oui.");
  });
  it("limite la longueur des paragraphes", () => {
    const text = Array.from({ length: 9 }, (_, i) => `Phrase ${i + 1}.`).join(" ");
    expect(toParagraphs(text).split("\n\n")).toHaveLength(3);
  });
  it("gère un texte sans ponctuation et un texte vide", () => {
    expect(toParagraphs("douleur thoracique depuis ce matin")).toBe("douleur thoracique depuis ce matin");
    expect(toParagraphs("   ")).toBe("");
  });
});

describe("joinSegments", () => {
  it("assemble dans l'ordre et ignore les segments vides", () => {
    expect(joinSegments(["Premier.", null, " ", "Second."])).toBe("Premier.\n\nSecond.");
  });
});

describe("continuityPrompt", () => {
  it("ajoute la fin du segment précédent, coupée sur un mot", () => {
    const prompt = continuityPrompt("a".repeat(10) + " fin du segment précédent", 22);
    expect(prompt.startsWith(MEDICAL_VOCABULARY_HINT)).toBe(true);
    expect(prompt.endsWith("du segment précédent")).toBe(true);
  });
});

describe("continuityPrompt (coupe sur une limite de mot)", () => {
  it("garde un mot entier quand la coupe tombe juste avant", () => {
    expect(continuityPrompt("aaaaaaaaaa fin du segment précédent", 20).endsWith("\n\ndu segment précédent")).toBe(true);
  });
});
