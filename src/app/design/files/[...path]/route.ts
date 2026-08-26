import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Live file server for the design bundle (see src/app/design/page.tsx).
 * Reads straight from disk on every request — no caching, no build-time
 * copy — so the /design route always shows whatever is currently checked
 * out in project/, chats/, README.md. That's the "live, not static" part:
 * drop a fresh Claude Design export in and it shows up on refresh, no
 * rebuild needed.
 *
 * Only these three repo paths are reachable, and only to reproduce the
 * asset layout the prototype's own relative imports expect (Bar
 * App.dc.html does `<script src="./support.js">`, so support.js has to be
 * a sibling under files/project/ too, not hoisted elsewhere).
 */
const ALLOWED_ROOTS = ["project", "chats"];
const ALLOWED_SINGLE_FILES = ["README.md"];

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = (await params).path ?? [];
  const repoRoot = process.cwd();
  const requested = path.join(repoRoot, ...segments);
  const resolved = path.resolve(requested);

  const isAllowed =
    ALLOWED_ROOTS.some(
      (dir) => resolved === path.join(repoRoot, dir) || resolved.startsWith(path.join(repoRoot, dir) + path.sep),
    ) || ALLOWED_SINGLE_FILES.some((file) => resolved === path.join(repoRoot, file));

  if (!isAllowed) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const data = await readFile(resolved);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
