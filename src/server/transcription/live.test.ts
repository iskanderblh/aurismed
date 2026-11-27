import { describe, expect, it } from "vitest";
import { assembleLiveTranscript, assignToRecordings, cleanLiveText } from "./live";

const seg = (seq: number, text: string, speaker: "doctor" | "patient" | "unknown" = "unknown", start = seq * 1000) => ({
  seq,
  start_ms: start,
  end_ms: start + 900,
  text,
  speaker,
});

describe("assembleLiveTranscript", () => {
  it("préfixe les tours de parole et regroupe les morceaux consécutifs", () => {
    const text = assembleLiveTranscript([
      seg(2, "Depuis trois jours.", "patient"),
      seg(0, "Bonjour, qu'est-ce qui vous amène ?", "doctor"),
      seg(1, "J'ai des brûlures en urinant.", "patient"),
      seg(3, "Avez-vous de la fièvre ?", "doctor"),
      seg(4, "", "doctor"),
    ]);
    expect(text).toBe(
      "Médecin : Bonjour, qu'est-ce qui vous amène ?\n\n" +
        "Patient : J'ai des brûlures en urinant. Depuis trois jours.\n\n" +
        "Médecin : Avez-vous de la fièvre ?",
    );
  });

  it("sans interlocuteur connu, met simplement en paragraphes", () => {
    expect(assembleLiveTranscript([seg(0, "Bonjour."), seg(1, "Bonjour docteur.")])).toBe("Bonjour. Bonjour docteur.");
  });

  it("garde les morceaux non identifiés comme tels", () => {
    expect(assembleLiveTranscript([seg(0, "Bonjour.", "doctor"), seg(1, "Oui.")])).toBe("Médecin : Bonjour.\n\nNon identifié : Oui.");
  });
});

describe("cleanLiveText", () => {
  it("écarte les hallucinations connues sur du silence", () => {
    expect(cleanLiveText("Sous-titres réalisés par la communauté d'Amara.org")).toBe("");
    expect(cleanLiveText(" Merci. ")).toBe("");
  });
  it("garde le contenu de consultation", () => {
    expect(cleanLiveText("Merci, et depuis quand avez-vous mal ?")).toBe("Merci, et depuis quand avez-vous mal ?");
  });
  it("retire les segments sans parole", () => {
    expect(
      cleanLiveText("x", [
        { start: 0, end: 1, text: "J'ai mal.", noSpeechProb: 0.1 },
        { start: 1, end: 2, text: "Musique", noSpeechProb: 0.95 },
      ]),
    ).toBe("J'ai mal.");
  });
});

describe("assignToRecordings", () => {
  it("répartit les morceaux selon la ligne de temps", () => {
    const recs = [
      { id: "b", segment_index: 1, duration: 10 },
      { id: "a", segment_index: 0, duration: 10 },
    ];
    const map = assignToRecordings(recs, [seg(0, "un", "unknown", 1000), seg(1, "deux", "unknown", 9000), seg(2, "trois", "unknown", 15000), seg(3, "quatre", "unknown", 25000)]);
    expect(map.get("a")).toBe("un deux");
    expect(map.get("b")).toBe("trois quatre");
  });
});
