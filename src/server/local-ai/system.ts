import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { dataDir } from "@/server/db/config";

export type GpuInfo = { name: string; memoryTotalMb: number; memoryUsedMb: number };
export type SystemInfo = {
  platform: string;
  cpuModel: string;
  cpuCores: number;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  gpus: GpuInfo[];
  gpuDetection: "nvidia-smi" | "none";
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
  dataDir: string;
};

/** Cartes NVIDIA via nvidia-smi (installé avec le pilote) ; liste vide sinon. */
function nvidiaGpus(): Promise<GpuInfo[] | null> {
  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      ["--query-gpu=name,memory.total,memory.used", "--format=csv,noheader,nounits"],
      { timeout: 3000, windowsHide: true },
      (error, stdout) => {
        if (error) return resolve(null);
        resolve(
          stdout
            .trim()
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => {
              const [name, total, used] = line.split(",").map((s) => s.trim());
              return { name, memoryTotalMb: Number(total), memoryUsedMb: Number(used) };
            }),
        );
      },
    );
  });
}

export async function systemInfo(): Promise<SystemInfo> {
  const cpus = os.cpus();
  const gpus = await nvidiaGpus();
  let diskFreeBytes: number | null = null;
  let diskTotalBytes: number | null = null;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const s = fs.statfsSync(dataDir());
    diskFreeBytes = s.bavail * s.bsize;
    diskTotalBytes = s.blocks * s.bsize;
  } catch {
    // Espace disque inconnu.
  }
  return {
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    cpuModel: cpus[0]?.model?.trim() ?? "inconnu",
    cpuCores: cpus.length,
    memoryTotalBytes: os.totalmem(),
    memoryFreeBytes: os.freemem(),
    gpus: gpus ?? [],
    gpuDetection: gpus ? "nvidia-smi" : "none",
    diskFreeBytes,
    diskTotalBytes,
    dataDir: dataDir(),
  };
}
