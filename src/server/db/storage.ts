import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { filesDir, keyPath } from "./config";

/**
 * Stockage local des fichiers (audio, PDF), chiffrés en AES-256-GCM.
 *
 * Arborescence : <données>/fichiers/<compartiment>/<user_id>/<consultation_id>/<fichier>.enc
 * Format d'un fichier : "AMF1" | IV (12 octets) | tag (16 octets) | chiffré de
 *   [longueur de l'en-tête sur 2 octets | en-tête JSON { contentType } | contenu].
 *
 * La clé (32 octets) vient de AURISMED_ENCRYPTION_KEY (base64) ou, à défaut,
 * d'un fichier créé au premier lancement dans <données>/cle/. Sans cette clé,
 * les fichiers sont illisibles : elle doit être sauvegardée à part.
 */

export const BUCKETS = ["recordings", "documents"] as const;
export type Bucket = (typeof BUCKETS)[number];

const MAGIC = Buffer.from("AMF1");
const LIMITS: Record<Bucket, number> = { recordings: 50 * 1024 * 1024, documents: 20 * 1024 * 1024 };
const SEGMENT = /^[A-Za-z0-9._-]+$/;

let cachedKey: { file: string; key: Buffer } | null = null;

/** Clé maîtresse : variable d'environnement, sinon fichier local (créé si absent). */
export function masterKey(): Buffer {
  const fromEnv = process.env.AURISMED_ENCRYPTION_KEY;
  if (fromEnv) {
    const key = Buffer.from(fromEnv, "base64");
    if (key.length !== 32) throw new Error("AURISMED_ENCRYPTION_KEY doit contenir 32 octets encodés en base64.");
    return key;
  }
  const file = keyPath();
  if (cachedKey?.file === file) return cachedKey.key;
  let key: Buffer;
  if (fs.existsSync(file)) {
    key = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
    if (key.length !== 32) throw new Error(`Clé de chiffrement invalide : ${file}`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    key = crypto.randomBytes(32);
    // wx : n'écrase jamais une clé existante.
    fs.writeFileSync(file, key.toString("base64"), { mode: 0o600, flag: "wx" });
  }
  cachedKey = { file, key };
  return key;
}

/** Sous-clé dérivée pour un usage donné (chiffrement des fichiers, signature des liens). */
export function derivedKey(purpose: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", masterKey(), Buffer.alloc(0), `aurismed:${purpose}`, 32));
}

export function encrypt(content: Buffer, contentType: string): Buffer {
  const header = Buffer.from(JSON.stringify({ contentType }));
  const len = Buffer.alloc(2);
  len.writeUInt16BE(header.length);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey("files"), iv);
  const body = Buffer.concat([cipher.update(Buffer.concat([len, header, content])), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decrypt(file: Buffer): { content: Buffer; contentType: string } {
  if (!file.subarray(0, 4).equals(MAGIC)) throw new Error("Fichier non reconnu.");
  const iv = file.subarray(4, 16);
  const tag = file.subarray(16, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey("files"), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(file.subarray(32)), decipher.final()]);
  const len = plain.readUInt16BE(0);
  const header = JSON.parse(plain.subarray(2, 2 + len).toString("utf8")) as { contentType?: string };
  return { content: plain.subarray(2 + len), contentType: header.contentType ?? "application/octet-stream" };
}

/** Écrase le fichier avec des octets aléatoires avant de le supprimer (au mieux : voir README pour les SSD). */
export function secureUnlink(file: string) {
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, "r+");
    try {
      const chunk = 1024 * 1024;
      for (let offset = 0; offset < size; offset += chunk) {
        fs.writeSync(fd, crypto.randomBytes(Math.min(chunk, size - offset)), 0, Math.min(chunk, size - offset), offset);
      }
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  fs.rmSync(file, { force: true });
}

type StorageError = { message: string };
type StorageResult<D> = { data: D; error: null } | { data: null; error: StorageError };

const fail = (message: string): { data: null; error: StorageError } => ({ data: null, error: { message } });

/** Lien signé : /api/fichiers/<jeton>, jeton = charge utile base64url + HMAC. */
export function signFileToken(payload: { b: Bucket; p: string; exp: number; dl?: string }) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", derivedKey("signed-url")).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyFileToken(token: string): { b: Bucket; p: string; exp: number; dl?: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", derivedKey("signed-url")).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (!BUCKETS.includes(payload.b) || typeof payload.p !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Accès aux fichiers d'un utilisateur. Comme les règles de stockage Supabase :
 * le premier dossier du chemin doit être l'identifiant de l'utilisateur, et le
 * second une consultation qui lui appartient (à l'écriture).
 */
export class BucketApi {
  constructor(
    private readonly db: DatabaseSync,
    private readonly bucket: Bucket,
    private readonly userId: string | null,
  ) {}

  /** Résout un chemin relatif en chemin disque, ou null s'il n'appartient pas à l'utilisateur. */
  private resolve(objectPath: string, kind: "file" | "folder" = "file"): string | null {
    if (!this.userId) return null;
    const parts = objectPath.split("/").filter((p) => p.length > 0);
    if (!parts.length || parts[0] !== this.userId) return null;
    if (!parts.every((p) => SEGMENT.test(p) && p !== "." && p !== "..")) return null;
    if (kind === "file" && parts.length < 3) return null;
    const base = path.join(filesDir(), this.bucket);
    const full = path.join(base, ...parts);
    if (!full.startsWith(base + path.sep)) return null;
    return kind === "file" ? `${full}.enc` : full;
  }

  async upload(
    objectPath: string,
    body: Blob | Buffer | Uint8Array,
    options: { contentType?: string; upsert?: boolean } = {},
  ): Promise<StorageResult<{ path: string }>> {
    const file = this.resolve(objectPath);
    if (!file) return fail("Chemin non autorisé.");
    const consultationId = objectPath.split("/")[1];
    const owned = this.db
      .prepare("select 1 from consultations where id = ? and user_id = ?")
      .get(consultationId, this.userId);
    if (!owned) return fail("Consultation introuvable pour cet utilisateur.");
    const content = body instanceof Blob ? Buffer.from(await body.arrayBuffer()) : Buffer.from(body);
    if (content.length > LIMITS[this.bucket]) return fail("Fichier trop volumineux.");
    const contentType = options.contentType ?? (body instanceof Blob ? body.type : "") ?? "application/octet-stream";
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // Écriture atomique : fichier temporaire puis renommage.
      const tmp = `${file}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tmp, encrypt(content, contentType || "application/octet-stream"), { mode: 0o600 });
      if (!options.upsert && fs.existsSync(file)) {
        fs.rmSync(tmp, { force: true });
        return fail("Le fichier existe déjà.");
      }
      fs.renameSync(tmp, file);
      return { data: { path: objectPath }, error: null };
    } catch (e) {
      console.error("[stockage] écriture", (e as Error).message);
      return fail("Écriture du fichier impossible.");
    }
  }

  /** Contenu déchiffré, ou erreur si le fichier n'existe pas ou n'appartient pas à l'utilisateur. */
  async read(objectPath: string): Promise<StorageResult<{ content: Buffer; contentType: string }>> {
    const file = this.resolve(objectPath);
    if (!file) return fail("Chemin non autorisé.");
    try {
      return { data: decrypt(fs.readFileSync(file)), error: null };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") console.error("[stockage] lecture", (e as Error).message);
      return fail(code === "ENOENT" ? "Fichier introuvable." : "Fichier illisible.");
    }
  }

  async download(objectPath: string): Promise<StorageResult<Blob>> {
    const res = await this.read(objectPath);
    if (res.error) return res;
    return { data: new Blob([new Uint8Array(res.data.content)], { type: res.data.contentType }), error: null };
  }

  async list(prefix: string, options?: { limit?: number }): Promise<StorageResult<{ name: string }[]>> {
    const dir = this.resolve(prefix, "folder");
    if (!dir) return fail("Chemin non autorisé.");
    try {
      const names = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isFile() && d.name.endsWith(".enc"))
        .map((d) => ({ name: d.name.slice(0, -4) }));
      return { data: names.slice(0, options?.limit ?? 100), error: null };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { data: [], error: null };
      return fail("Lecture du dossier impossible.");
    }
  }

  async remove(paths: string[]): Promise<StorageResult<{ name: string }[]>> {
    const files = paths.map((p) => this.resolve(p));
    if (files.some((f) => !f)) return fail("Chemin non autorisé.");
    try {
      for (const f of files as string[]) secureUnlink(f);
      return { data: paths.map((name) => ({ name })), error: null };
    } catch (e) {
      console.error("[stockage] suppression", (e as Error).message);
      return fail("Suppression impossible.");
    }
  }

  async createSignedUrl(
    objectPath: string,
    expiresInSeconds: number,
    options?: { download?: string | boolean },
  ): Promise<StorageResult<{ signedUrl: string }>> {
    const file = this.resolve(objectPath);
    if (!file) return fail("Chemin non autorisé.");
    if (!fs.existsSync(file)) return fail("Fichier introuvable.");
    const dl = typeof options?.download === "string" ? options.download : undefined;
    const token = signFileToken({ b: this.bucket, p: objectPath, exp: Date.now() + expiresInSeconds * 1000, dl });
    return { data: { signedUrl: `/api/fichiers/${token}` }, error: null };
  }
}
