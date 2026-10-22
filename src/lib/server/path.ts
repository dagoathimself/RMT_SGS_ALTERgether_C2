import type { NextRequest } from "next/server";
/** Segment after `marker` in the URL path, e.g. pathSegment(req, "contributions") for /api/contributions/:id/... */
export function pathSegment(req: NextRequest, marker: string): string {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  const i = parts.indexOf(marker);
  return i >= 0 && parts[i + 1] ? decodeURIComponent(parts[i + 1]) : "";
}
