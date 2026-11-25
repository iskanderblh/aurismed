"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Barres de niveau audio en direct (AnalyserNode), calmes quand l'enregistrement est en pause. */
export function Waveform({ analyser, active }: { analyser: RefObject<AnalyserNode | null>; active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    let frame = 0;
    const bars = 48;
    const data = new Uint8Array(256);
    const color = getComputedStyle(el).color;

    const draw = () => {
      const { width, height } = el;
      ctx.clearRect(0, 0, width, height);
      const node = analyser.current;
      if (node && active) node.getByteTimeDomainData(data);
      const step = Math.floor(data.length / bars);
      const barWidth = width / bars;
      ctx.fillStyle = color;
      for (let i = 0; i < bars; i++) {
        let peak = 0;
        if (node && active) {
          for (let j = 0; j < step; j++) peak = Math.max(peak, Math.abs(data[i * step + j] - 128) / 128);
        }
        const h = Math.max(3, Math.min(1, peak * 2.2) * height);
        ctx.globalAlpha = active ? 0.9 : 0.3;
        ctx.beginPath();
        ctx.roundRect(i * barWidth + barWidth * 0.2, (height - h) / 2, barWidth * 0.6, h, 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [analyser, active]);

  return <canvas ref={canvas} width={480} height={64} className="h-16 w-full text-sky-600" aria-hidden />;
}
