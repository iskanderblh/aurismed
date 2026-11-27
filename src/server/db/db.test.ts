import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticate, createUser, setPassword } from "@/server/auth/accounts";
import { createSession, readSession } from "@/server/auth/session";
import { clientForUser } from "./client";
import { getDb } from "./sqlite";

// Données synthétiques uniquement.
let dir: string;
let alice: { id: string; email: string };
let bob: { id: string; email: string };

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "aurismed-db-"));
  process.env.AURISMED_DATA_DIR = dir;
  delete process.env.AURISMED_ENCRYPTION_KEY;
  const db = getDb();
  alice = await createUser(db, { email: "Alice@Example.test", password: "motdepasse-alice-123", fullName: "Dr Alice" });
  bob = await createUser(db, { email: "bob@example.test", password: "motdepasse-bob-1234" });
});

afterAll(() => {
  getDb().close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("comptes et sessions", () => {
  it("authentifie avec le bon mot de passe uniquement", async () => {
    const db = getDb();
    expect(await authenticate(db, "alice@example.test", "motdepasse-alice-123")).toMatchObject({ id: alice.id });
    expect(await authenticate(db, "alice@example.test", "faux")).toBeNull();
    expect(await authenticate(db, "inconnu@example.test", "x")).toBeNull();
  });

  it("ouvre une session, puis la ferme au changement de mot de passe", async () => {
    const db = getDb();
    const { token } = createSession(db, bob.id);
    expect(readSession(db, token)).toMatchObject({ id: bob.id });
    expect(readSession(db, "jeton-inconnu")).toBeNull();
    await setPassword(db, bob.id, "nouveau-mot-de-passe-1");
    expect(readSession(db, token)).toBeNull();
    expect(await authenticate(db, "bob@example.test", "nouveau-mot-de-passe-1")).not.toBeNull();
  });

  it("crée le profil et les paramètres avec le compte", async () => {
    const { data } = await clientForUser(alice).from("profiles").select("full_name, email").eq("id", alice.id).single();
    expect(data).toEqual({ full_name: "Dr Alice", email: "alice@example.test" });
    const { data: s } = await clientForUser(alice).from("user_settings").select("*").maybeSingle();
    expect(s?.audio_retention_days).toBe(30);
  });
});

describe("requêtes limitées au propriétaire", () => {
  let consultationId: string;

  it("insère, relit et décode le JSON", async () => {
    const db = clientForUser(alice);
    const { data, error } = await db
      .from("consultations")
      .insert({ patient_name: "TEST", patient_first_name: "Synthétique", patient_information: { age: 42 } })
      .select("id, patient_information, status")
      .single();
    expect(error).toBeNull();
    expect(data?.patient_information).toEqual({ age: 42 });
    expect(data?.status).toBe("draft");
    consultationId = data!.id;
  });

  it("n'expose pas les lignes d'un autre utilisateur", async () => {
    const asBob = clientForUser(bob);
    const { data } = await asBob.from("consultations").select("*").eq("id", consultationId).maybeSingle();
    expect(data).toBeNull();
    const upd = await asBob.from("consultations").update({ patient_name: "PIRATE" }).eq("id", consultationId).select("id");
    expect(upd.data).toEqual([]);
    const del = await asBob.from("consultations").delete().eq("id", consultationId).select("id");
    expect(del.data).toEqual([]);
    const child = await asBob.from("transcriptions").insert({ consultation_id: consultationId, user_id: bob.id });
    expect(child.error?.code).toBe("42501");
    const spoof = await asBob.from("consultations").insert({ user_id: alice.id });
    expect(spoof.error?.code).toBe("42501");
  });

  it("refuse tout accès sans session", async () => {
    const { error } = await clientForUser(null).from("consultations").select("*");
    expect(error?.code).toBe("42501");
  });

  it("filtre, trie, compte et recherche", async () => {
    const db = clientForUser(alice);
    await db.from("consultations").insert([
      { patient_name: "DURAND", patient_first_name: "Élise" },
      { patient_name: "MARTIN", patient_first_name: "Paul" },
    ]);
    const { count } = await db.from("consultations").select("id", { count: "exact", head: true });
    expect(count).toBe(3);
    const { data } = await db.from("consultations").select("patient_name").or("patient_name.ilike.*dur*,patient_first_name.ilike.*dur*");
    expect(data?.map((r) => r.patient_name)).toEqual(["DURAND"]);
    const { data: sorted } = await db.from("consultations").select("patient_name").order("patient_name", { ascending: false }).limit(2);
    expect(sorted?.map((r) => r.patient_name)).toEqual(["TEST", "MARTIN"]);
    const { data: none } = await db.from("consultations").select("id").in("id", []);
    expect(none).toEqual([]);
  });

  it("traduit la contrainte d'unicité en 23505", async () => {
    const db = clientForUser(alice);
    expect((await db.from("transcriptions").insert({ consultation_id: consultationId, user_id: alice.id })).error).toBeNull();
    const dup = await db.from("transcriptions").insert({ consultation_id: consultationId, user_id: alice.id });
    expect(dup.error?.code).toBe("23505");
  });

  it("refuse une colonne inconnue", async () => {
    const { error } = await clientForUser(alice).from("consultations").select("id, mot_de_passe");
    expect(error?.code).toBe("42703");
  });

  it("garde le journal d'audit en ajout seul, même à la suppression d'une consultation", async () => {
    const db = clientForUser(alice);
    await db.from("audit_logs").insert({ user_id: alice.id, consultation_id: consultationId, action: "test.event" });
    expect((await db.from("audit_logs").delete().eq("action", "test.event")).error?.code).toBe("42501");
    expect(() => getDb().prepare("update audit_logs set action = 'x'").run()).toThrow(/append-only/);
    const del = await db.from("consultations").delete().eq("id", consultationId).select("id");
    expect(del.data).toHaveLength(1);
    const { data } = await db.from("audit_logs").select("consultation_id").eq("action", "test.event").single();
    expect(data?.consultation_id).toBeNull();
  });
});

describe("stockage chiffré", () => {
  it("chiffre sur le disque, relit, liste, signe et supprime", async () => {
    const db = clientForUser(alice);
    const { data: c } = await db.from("consultations").insert({ patient_name: "AUDIO" }).select("id").single();
    const p = `${alice.id}/${c!.id}/seg-0000.webm`;
    const content = Buffer.from("contenu audio synthétique ".repeat(50));
    expect((await db.storage.from("recordings").upload(p, content, { contentType: "audio/webm" })).error).toBeNull();

    const onDisk = fs.readFileSync(path.join(dir, "fichiers", "recordings", alice.id, c!.id, "seg-0000.webm.enc"));
    expect(onDisk.includes(Buffer.from("contenu audio"))).toBe(false);

    const { data: blob } = await db.storage.from("recordings").download(p);
    expect(Buffer.from(await blob!.arrayBuffer()).equals(content)).toBe(true);
    expect(blob!.type).toBe("audio/webm");
    expect((await db.storage.from("recordings").list(`${alice.id}/${c!.id}`)).data).toEqual([{ name: "seg-0000.webm" }]);
    expect((await db.storage.from("recordings").createSignedUrl(p, 60)).data?.signedUrl).toMatch(/^\/api\/fichiers\//);

    // Bob ne peut ni lire ni écrire chez Alice.
    const asBob = clientForUser(bob);
    expect((await asBob.storage.from("recordings").download(p)).error).not.toBeNull();
    expect((await asBob.storage.from("recordings").upload(`${bob.id}/${c!.id}/x.webm`, content)).error).not.toBeNull();
    expect((await db.storage.from("recordings").upload(`${alice.id}/../x/y.webm`, content)).error).not.toBeNull();

    expect((await db.storage.from("recordings").remove([p])).error).toBeNull();
    expect((await db.storage.from("recordings").list(`${alice.id}/${c!.id}`)).data).toEqual([]);
  });
});
