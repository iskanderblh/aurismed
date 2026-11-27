import { describe, expect, it } from "vitest";
import { encodeWav, mixDown, splitSamples } from "./wav";

describe("WAV pour whisper.cpp", () => {
  it("écrit un en-tête PCM 16 bits mono 16 kHz", () => {
    const wav = new DataView(encodeWav(new Float32Array([0, 1, -1, 0.5])));
    const tag = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => wav.getUint8(o + i)));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(wav.getUint16(22, true)).toBe(1);
    expect(wav.getUint32(24, true)).toBe(16000);
    expect(wav.getUint16(34, true)).toBe(16);
    expect(wav.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => wav.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 16383]);
  });

  it("mélange les canaux et découpe en segments", () => {
    expect(Array.from(mixDown([new Float32Array([1, 0]), new Float32Array([0, 0])]))).toEqual([0.5, 0]);
    const parts = splitSamples(new Float32Array(16000 * 25), 10);
    expect(parts.map((p) => p.length / 16000)).toEqual([10, 10, 5]);
  });
});
