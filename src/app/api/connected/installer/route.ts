// Connected Mode installer artifact contract.
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOCAL_INSTALLER_URL = "/api/connected/installer" as const;
const INSTALLER_DOWNLOAD_FILENAME = "TenaxConnectorSetup.exe" as const;

const installerUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
    } catch {
      return false;
    }
  });

function unavailableResponse(): Response {
  return Response.json({ ok: false, code: "INSTALLER_UNAVAILABLE" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

function localInstallerPath(): string {
  return resolve(process.cwd(), "release", "tenax-connector", "tenax-connector-setup.exe");
}

function wantsMetadata(request?: Request): boolean {
  return request?.headers.get("accept")?.toLowerCase().includes("application/json") ?? false;
}

async function readLocalInstaller(): Promise<Buffer | null> {
  try {
    const artifact = localInstallerPath();
    const stats = await lstat(artifact);
    if (!stats.isFile()) return null;
    return await readFile(artifact);
  } catch {
    return null;
  }
}

function installerDownloadResponse(content: Buffer): Response {
  return new Response(new Uint8Array(content), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename=\"${INSTALLER_DOWNLOAD_FILENAME}\"`,
      "Content-Length": String(content.byteLength),
      "Content-Type": "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request?: Request) {
  if (process.env.NODE_ENV === "development") {
    const installer = await readLocalInstaller();
    if (!installer) return unavailableResponse();
    if (!wantsMetadata(request)) return installerDownloadResponse(installer);
    return Response.json({ ok: true, available: true, url: LOCAL_INSTALLER_URL }, { headers: { "Cache-Control": "no-store" } });
  }

  const configured = process.env.TENAX_CONNECTOR_INSTALLER_URL;
  if (!configured) return unavailableResponse();
  const parsed = installerUrlSchema.safeParse(configured);
  if (!parsed.success) return unavailableResponse();
  return Response.json({ ok: true, available: true, url: parsed.data }, { headers: { "Cache-Control": "no-store" } });
}
