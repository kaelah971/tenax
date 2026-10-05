// Connected Mode installer artifact contract.
// Development is intentionally unavailable unless a real release URL is configured.
import { z } from "zod";

export const dynamic = "force-dynamic";

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

export async function GET() {
  const configured = process.env.TENAX_CONNECTOR_INSTALLER_URL;
  if (!configured) {
    return Response.json({ ok: false, code: "INSTALLER_UNAVAILABLE" }, { status: 404 });
  }
  const parsed = installerUrlSchema.safeParse(configured);
  if (!parsed.success) {
    return Response.json({ ok: false, code: "INSTALLER_UNAVAILABLE" }, { status: 404 });
  }
  return Response.json({ ok: true, available: true, url: parsed.data }, { headers: { "Cache-Control": "no-store" } });
}
