import { describe, expect, it } from "vitest";
import { Downsampler, SAMPLE_RATE, SpeechChunker, mergeOverlap, type ChunkEvent } from "./vad";

/** Signal synthétique : bruit faible (silence) ou sinusoïde (parole). */
function signal(parts: Array<["silence" | "speech", number]>): Float32Array {
  const total = parts.reduce((s, [, ms]) => s + (ms * SAMPLE_RATE) / 1000, 0);
  const out = new Float32Array(total);
  let i = 0;
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.002;
  for (const [kind, ms] of parts) {
    const n = (ms * SAMPLE_RATE) / 1000;
    for (let k = 0; k < n; k++, i++) {
      out[i] = kind === "speech" ? 0.3 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) : noise();
    }
  }
  return out;
}

function feed(chunker: SpeechChunker, data: Float32Array, block = 2048): ChunkEvent[] {
  const events: ChunkEvent[] = [];
  for (let i = 0; i < data.length; i += block) events.push(...chunker.push(data.subarray(i, i + block)));
  return events;
}

describe("SpeechChunker", () => {
  it("découpe aux silences et ignore le silence pur", () => {
    const c = new SpeechChunker();
    const events = feed(c, signal([["silence", 1000], ["speech", 1500], ["silence", 1000], ["speech", 1200], ["silence", 1000]]));
    const finals = events.filter((e) => e.kind === "final");
    expect(finals).toHaveLength(2);
    expect(finals.map((e) => e.seq)).toEqual([0, 1]);
    // Début avec pré-roll (≈ 400 ms avant 1000 ms).
    expect(finals[0].startMs).toBeGreaterThanOrEqual(550);
    expect(finals[0].startMs).toBeLessThanOrEqual(1000);
    expect(finals[0].endMs).toBeGreaterThan(2500);
    expect(finals[0].endMs).toBeLessThan(3400);
    expect(finals[1].startMs).toBeGreaterThan(3000);
    expect(finals[0].samples.length).toBe(((finals[0].endMs - finals[0].startMs) * SAMPLE_RATE) / 1000);
  });

  it("n'émet rien pour du silence", () => {
    const c = new SpeechChunker();
    expect(feed(c, signal([["silence", 5000]]))).toHaveLength(0);
    expect(c.flush()).toHaveLength(0);
  });

  it("ignore un bruit bref", () => {
    const c = new SpeechChunker();
    expect(feed(c, signal([["silence", 1000], ["speech", 120], ["silence", 1500]]))).toHaveLength(0);
  });

  it("émet des versions provisoires pendant une longue phrase", () => {
    const c = new SpeechChunker({ partialEveryMs: 1000 });
    const events = feed(c, signal([["silence", 500], ["speech", 4000], ["silence", 1000]]));
    const partials = events.filter((e) => e.kind === "partial");
    expect(partials.length).toBeGreaterThanOrEqual(3);
    expect(partials.every((p) => p.seq === 0)).toBe(true);
    expect(events.at(-1)!.kind).toBe("final");
  });

  it("coupe de force les morceaux trop longs avec chevauchement", () => {
    const c = new SpeechChunker({ maxChunkMs: 5000, overlapMs: 1000 });
    const events = feed(c, signal([["silence", 500], ["speech", 12000], ["silence", 1000]]));
    const finals = events.filter((e) => e.kind === "final");
    expect(finals.length).toBe(3);
    expect(finals[1].overlapMs).toBe(1000);
    expect(finals[1].startMs).toBe(finals[0].endMs - 1000);
    expect(finals[0].endMs - finals[0].startMs).toBeLessThanOrEqual(5030);
  });

  it("flush clôt la phrase en cours (pause, arrêt)", () => {
    const c = new SpeechChunker();
    const events = feed(c, signal([["silence", 500], ["speech", 1500]]));
    expect(events.filter((e) => e.kind === "final")).toHaveLength(0);
    const flushed = c.flush();
    expect(flushed).toHaveLength(1);
    expect(flushed[0].kind).toBe("final");
  });

  it("continue la numérotation à partir de firstSeq", () => {
    const c = new SpeechChunker({}, 7);
    const events = feed(c, signal([["silence", 500], ["speech", 1000], ["silence", 1000]]));
    expect(events.at(-1)!.seq).toBe(7);
  });
});

describe("Downsampler", () => {
  it("48 kHz → 16 kHz par blocs, sans perte de longueur", () => {
    const d = new Downsampler(48_000);
    let total = 0;
    for (let i = 0; i < 100; i++) total += d.push(new Float32Array(480).fill(0.5)).length;
    expect(Math.abs(total - 16_000)).toBeLessThanOrEqual(1);
  });

  it("44,1 kHz → 16 kHz conserve l'amplitude", () => {
    const d = new Downsampler(44_100);
    const out = d.push(new Float32Array(44_100).fill(0.25));
    expect(Math.abs(out.length - 16_000)).toBeLessThanOrEqual(1);
    expect(out.every((v) => Math.abs(v - 0.25) < 1e-6)).toBe(true);
  });
});

describe("mergeOverlap", () => {
  it("retire les mots répétés par le chevauchement", () => {
    expect(mergeOverlap("le patient a des brûlures mictionnelles", "Mictionnelles depuis trois jours")).toBe(
      "depuis trois jours",
    );
    expect(mergeOverlap("depuis trois jours.", "trois jours, sans fièvre")).toBe("sans fièvre");
  });

  it("ne touche pas un texte sans répétition", () => {
    expect(mergeOverlap("bonjour docteur", "j'ai mal au dos")).toBe("j'ai mal au dos");
    expect(mergeOverlap("", "texte")).toBe("texte");
  });
});
