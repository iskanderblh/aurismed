/**
 * Découpage de la parole pour la transcription en direct.
 *
 * L'audio du micro (16 kHz mono) est analysé par trames de 30 ms. Une
 * détection d'activité vocale (VAD) par énergie, avec un plancher de bruit
 * adaptatif, ouvre un morceau dès que la parole commence et le ferme après un
 * silence (fin de phrase). Pendant qu'un morceau est ouvert, des versions
 * provisoires sont émises à intervalle régulier ; à sa fermeture, la version
 * stable est émise. Un morceau trop long est coupé de force, et le suivant
 * reprend la dernière seconde (chevauchement) pour ne pas couper un mot :
 * les mots en double sont retirés ensuite par mergeOverlap.
 *
 * Fonctions pures, sans dépendance au navigateur (testées dans vad.test.ts).
 */

export const SAMPLE_RATE = 16_000;
export const FRAME_MS = 30;
const FRAME = (SAMPLE_RATE * FRAME_MS) / 1000;

export type ChunkerOptions = {
  /** Silence qui clôt un morceau (fin de phrase). */
  endSilenceMs: number;
  /** Durée maximale d'un morceau avant coupure forcée. */
  maxChunkMs: number;
  /** Audio conservé avant le début de la parole (pour ne pas couper la première syllabe). */
  prerollMs: number;
  /** Chevauchement repris au début du morceau suivant après une coupure forcée. */
  overlapMs: number;
  /** Intervalle entre deux versions provisoires. */
  partialEveryMs: number;
  /** En dessous, un morceau est considéré comme du bruit et ignoré. */
  minSpeechMs: number;
  /** Écart minimal (dB) au-dessus du bruit de fond pour parler de parole. */
  thresholdDb: number;
  /** Niveau absolu minimal (dBFS) d'une trame de parole. */
  minLevelDb: number;
};

export const DEFAULT_CHUNKER: ChunkerOptions = {
  endSilenceMs: 700,
  maxChunkMs: 20_000,
  prerollMs: 400,
  overlapMs: 1_000,
  partialEveryMs: 2_500,
  minSpeechMs: 300,
  thresholdDb: 12,
  minLevelDb: -50,
};

export type ChunkEvent = {
  kind: "partial" | "final";
  /** Numéro du morceau (les versions provisoires et la version stable d'un même morceau partagent ce numéro). */
  seq: number;
  /** Position dans l'enregistrement (temps enregistré, pauses exclues). */
  startMs: number;
  endMs: number;
  /** Durée de chevauchement avec le morceau précédent, au début de celui-ci. */
  overlapMs: number;
  samples: Float32Array;
};

/** Niveau d'une trame en dBFS. */
export function levelDb(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  const rms = Math.sqrt(sum / Math.max(1, frame.length));
  return rms > 0 ? 20 * Math.log10(rms) : -120;
}

function concat(parts: Float32Array[], total?: number): Float32Array {
  const out = new Float32Array(total ?? parts.reduce((s, p) => s + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const ms = (samples: number) => Math.round((samples / SAMPLE_RATE) * 1000);

export class SpeechChunker {
  private readonly o: ChunkerOptions;
  private pending = new Float32Array(0);
  /** Nombre d'échantillons déjà analysés (horloge de l'enregistrement). */
  private position = 0;
  private floorDb = -60;
  private preroll: Float32Array[] = [];
  private prerollLength = 0;
  private chunk: Float32Array[] | null = null;
  private chunkLength = 0;
  private chunkStart = 0;
  private chunkOverlap = 0;
  private speechMs = 0;
  private silenceMs = 0;
  private sincePartial = 0;
  private nextSeq: number;

  constructor(options: Partial<ChunkerOptions> = {}, firstSeq = 0) {
    this.o = { ...DEFAULT_CHUNKER, ...options };
    this.nextSeq = firstSeq;
  }

  /** Temps enregistré analysé, en millisecondes. */
  get elapsedMs() {
    return ms(this.position);
  }

  get speaking() {
    return this.chunk !== null;
  }

  /** Ajoute des échantillons (16 kHz mono) ; renvoie les morceaux prêts. */
  push(samples: Float32Array): ChunkEvent[] {
    const events: ChunkEvent[] = [];
    const data = this.pending.length ? concat([this.pending, samples]) : samples;
    let offset = 0;
    for (; offset + FRAME <= data.length; offset += FRAME) {
      this.frame(data.slice(offset, offset + FRAME), events);
    }
    this.pending = data.slice(offset);
    return events;
  }

  /** Clôt le morceau en cours (pause, arrêt) et renvoie sa version stable s'il contient de la parole. */
  flush(): ChunkEvent[] {
    const events: ChunkEvent[] = [];
    if (this.pending.length && this.chunk) {
      this.chunk.push(this.pending);
      this.chunkLength += this.pending.length;
    }
    this.position += this.pending.length;
    this.pending = new Float32Array(0);
    this.close(events, false);
    this.preroll = [];
    this.prerollLength = 0;
    return events;
  }

  private isSpeech(db: number) {
    const speech = db > this.floorDb + this.o.thresholdDb && db > this.o.minLevelDb;
    // Plancher de bruit : descend vite, remonte lentement (et pas pendant la parole).
    if (db < this.floorDb) this.floorDb = 0.8 * this.floorDb + 0.2 * db;
    else if (!speech) this.floorDb += 0.02 * (db - this.floorDb);
    else this.floorDb += 0.001 * (db - this.floorDb);
    return speech;
  }

  private frame(frame: Float32Array, events: ChunkEvent[]) {
    const speech = this.isSpeech(levelDb(frame));
    this.position += frame.length;

    if (!this.chunk) {
      if (speech) {
        this.open(concat([...this.preroll, frame]), this.position - this.prerollLength - frame.length, 0);
        this.speechMs = FRAME_MS;
      } else {
        this.preroll.push(frame);
        this.prerollLength += frame.length;
        while (this.prerollLength - this.preroll[0].length >= (this.o.prerollMs * SAMPLE_RATE) / 1000) {
          this.prerollLength -= this.preroll.shift()!.length;
        }
      }
      return;
    }

    this.chunk.push(frame);
    this.chunkLength += frame.length;
    this.sincePartial += FRAME_MS;
    if (speech) {
      this.speechMs += FRAME_MS;
      this.silenceMs = 0;
    } else {
      this.silenceMs += FRAME_MS;
    }

    if (this.silenceMs >= this.o.endSilenceMs) {
      this.close(events, false);
    } else if (ms(this.chunkLength) >= this.o.maxChunkMs) {
      this.close(events, true);
    } else if (this.sincePartial >= this.o.partialEveryMs && this.speechMs >= this.o.minSpeechMs) {
      this.sincePartial = 0;
      events.push(this.event("partial"));
    }
  }

  private open(head: Float32Array, start: number, overlap: number) {
    this.chunk = [head];
    this.chunkLength = head.length;
    this.chunkStart = Math.max(0, start);
    this.chunkOverlap = overlap;
    this.speechMs = 0;
    this.silenceMs = 0;
    this.sincePartial = 0;
    this.preroll = [];
    this.prerollLength = 0;
  }

  private event(kind: "partial" | "final"): ChunkEvent {
    return {
      kind,
      seq: this.nextSeq,
      startMs: ms(this.chunkStart),
      endMs: ms(this.chunkStart + this.chunkLength),
      overlapMs: ms(this.chunkOverlap),
      samples: concat(this.chunk!, this.chunkLength),
    };
  }

  private close(events: ChunkEvent[], forced: boolean) {
    if (!this.chunk) return;
    const keep = this.speechMs >= this.o.minSpeechMs;
    const all = keep || forced ? concat(this.chunk, this.chunkLength) : null;
    if (keep) {
      events.push(this.event("final"));
      this.nextSeq++;
    }
    this.chunk = null;
    if (forced && all) {
      // Coupure au milieu de la parole : le morceau suivant reprend la fin de celui-ci.
      const overlap = Math.min(all.length, (this.o.overlapMs * SAMPLE_RATE) / 1000);
      this.open(all.slice(all.length - overlap), this.position - overlap, overlap);
      this.speechMs = keep ? FRAME_MS : this.speechMs;
    }
  }
}

/**
 * Rééchantillonnage en continu vers 16 kHz (moyenne des échantillons de chaque
 * intervalle, ce qui atténue le repliement), utilisable bloc par bloc.
 */
export class Downsampler {
  private readonly ratio: number;
  private carry: number[] = [];
  private phase = 0;

  constructor(fromRate: number, toRate = SAMPLE_RATE) {
    this.ratio = fromRate / toRate;
  }

  push(input: Float32Array): Float32Array {
    if (this.ratio === 1) return input;
    const data = this.carry.length ? Float32Array.from([...this.carry, ...input]) : input;
    const out: number[] = [];
    let pos = this.phase;
    while (pos + this.ratio <= data.length) {
      const start = Math.floor(pos);
      const end = Math.floor(pos + this.ratio);
      let sum = 0;
      for (let i = start; i < end; i++) sum += data[i];
      out.push(sum / Math.max(1, end - start));
      pos += this.ratio;
    }
    const consumed = Math.floor(pos);
    this.carry = Array.from(data.subarray(consumed));
    this.phase = pos - consumed;
    return Float32Array.from(out);
  }
}

// -----------------------------------------------------------------------------
// Fusion des textes de morceaux qui se chevauchent
// -----------------------------------------------------------------------------

const normalizeWord = (w: string) =>
  w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/**
 * Retire du début de `next` les mots qui répètent la fin de `previous`
 * (jusqu'à maxWords mots), conséquence du chevauchement audio.
 */
export function mergeOverlap(previous: string, next: string, maxWords = 8): string {
  const prev = previous.trim().split(/\s+/).filter(Boolean).map(normalizeWord);
  const words = next.trim().split(/\s+/).filter(Boolean);
  const norm = words.map(normalizeWord);
  for (let k = Math.min(maxWords, prev.length, norm.length); k > 0; k--) {
    const tail = prev.slice(prev.length - k);
    if (tail.every((w, i) => w === norm[i] && w !== "")) return words.slice(k).join(" ");
  }
  return words.join(" ");
}
