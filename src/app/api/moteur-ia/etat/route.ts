import { NextResponse } from "next/server";
import { localMedicalAI } from "@/server/local-ai/service";
import { requireUser } from "../guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ ok: true, status: await localMedicalAI.status() });
}
