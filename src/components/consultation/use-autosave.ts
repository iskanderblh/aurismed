"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

export type AutosaveState = "saved" | "dirty" | "saving" | "error";

/**
 * Enregistrement automatique sérialisé : une requête à la fois, la dernière
 * version gagne, et un avertissement empêche de quitter la page avant l'envoi.
 */
export function useAutosave<T>(save: (value: T) => Promise<{ ok: true } | { ok: false; error: string }>, delay = 1200) {
  const [state, setState] = useState<AutosaveState>("saved");
  const [error, setError] = useState<string>();
  const [changes, setChanges] = useState(0);
  const latest = useRef<T | null>(null);
  const version = useRef(0);
  const savedVersion = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);

  const flush = async (): Promise<boolean> => {
    while (inFlight.current) await inFlight.current;
    if (version.current === savedVersion.current || latest.current === null) return true;
    const sent = version.current;
    const run = (async () => {
      setState("saving");
      try {
        const result = await save(latest.current as T);
        if (!result.ok) {
          setError(result.error);
          setState("error");
          return false;
        }
        savedVersion.current = sent;
        setError(undefined);
        setState(version.current === sent ? "saved" : "dirty");
        return true;
      } catch {
        setError("Connexion au serveur impossible. Vos modifications sont conservées à l'écran.");
        setState("error");
        return false;
      }
    })();
    inFlight.current = run;
    const ok = await run;
    inFlight.current = null;
    return ok;
  };

  /** Signale une nouvelle version à enregistrer. */
  const changed = (value: T) => {
    latest.current = value;
    version.current += 1;
    setState("dirty");
    setChanges((c) => c + 1);
  };

  /** Exécute une opération qui enregistre elle-même la version courante (ex. validation). */
  const run = async <R extends { ok: boolean }>(op: (value: T) => Promise<R>, value: T): Promise<R> => {
    while (inFlight.current) await inFlight.current;
    latest.current = value;
    const sent = version.current;
    const result = await op(value);
    if (result.ok) {
      savedVersion.current = sent;
      setError(undefined);
      setState(version.current === sent ? "saved" : "dirty");
    }
    return result;
  };

  const tick = useEffectEvent(() => void flush());
  useEffect(() => {
    if (!changes) return;
    const t = setTimeout(tick, delay);
    return () => clearTimeout(t);
  }, [changes, delay]);

  useEffect(() => {
    if (state === "saved") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state]);

  return { state, error, setError, changed, flush, run };
}
