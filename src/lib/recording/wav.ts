/**
 * Conversion audio pour le moteur de transcription local (whisper.cpp), qui
 * attend du WAV PCM 16 bits, mono, 16 kHz. Faite dans le navigateur : aucune
 * dépendance (ffmpeg) à installer sur le poste.
 */

export const WHISPER_SAMPLE_RATE = 16_000;
export const WAV_MIME = "audio/wav";

/** Encode des échantillons [-1, 1] en WAV PCM 16 bits mono. */
export function encodeWav(samples: Float32Array, sampleRate = WHISPER_SAMPLE_RATE): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // taille du bloc fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // octets par seconde
  view.setUint16(32, 2, true); // octets par échantillon
  view.setUint16(34, 16, true); // bits par échantillon
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/** Moyenne des canaux. */
export function mixDown(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Découpe en morceaux de maxSeconds au plus. */
export function splitSamples(samples: Float32Array, maxSeconds: number, sampleRate = WHISPER_SAMPLE_RATE): Float32Array[] {
  const size = Math.max(1, Math.floor(maxSeconds * sampleRate));
  const parts: Float32Array[] = [];
  for (let start = 0; start < samples.length; start += size) parts.push(samples.subarray(start, start + size));
  return parts.length ? parts : [samples];
}

/**
 * Décode n'importe quel format lu par le navigateur (webm, ogg, mp3, m4a,
 * wav, flac), rééchantillonne à 16 kHz mono et renvoie des segments WAV.
 */
export async function toWavSegments(blob: Blob, maxSeconds: number): Promise<{ blob: Blob; duration: number }[]> {
  // decodeAudioData rééchantillonne à la fréquence du contexte.
  const ctx = new OfflineAudioContext(1, 1, WHISPER_SAMPLE_RATE);
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
  return splitSamples(mixDown(channels), maxSeconds).map((part) => ({
    blob: new Blob([encodeWav(part)], { type: WAV_MIME }),
    duration: part.length / WHISPER_SAMPLE_RATE,
  }));
}
