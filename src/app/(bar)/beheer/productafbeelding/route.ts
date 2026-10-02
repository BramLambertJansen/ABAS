import { NextResponse, type NextRequest } from "next/server";
import { removeProductImage, uploadProductImage } from "@/lib/productImage";

/**
 * Route Handler achter het afbeeldingsblok in Product beheren
 * (ProductBeherenOverlay.tsx → useProductAfbeelding.ts) —
 * docs/features/productafbeeldingen.md → Server-actie, ADR 0018. `POST`
 * (multipart: `productId`, `file`) uploadt of vervangt, `DELETE` (JSON
 * `{ productId }`) haalt weg.
 *
 * Bewust een Route Handler en geen Server Action (bodylimiet van 1 MB). Geen
 * `.from()`/`.rpc()`/`.storage`-aanroep hier zelf (check:policy): alles zit in
 * src/lib/productImage.ts, inclusief de verificatie vóór de body gelezen
 * wordt. `sharp` draait alleen in de Node-runtime.
 */
export const runtime = "nodejs";

function contentLengthOf(request: NextRequest): number | null {
  const header = request.headers.get("content-length");
  if (header === null) return null;
  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function POST(request: NextRequest) {
  try {
    const result = await uploadProductImage({
      contentLength: contentLengthOf(request),
      readForm: async () => {
        const form = await request.formData();
        return { productId: form.get("productId"), file: form.get("file") };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /beheer/productafbeelding:", err);
    return NextResponse.json({ ok: false, errorCode: "unknown" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let productId: unknown;
  try {
    const body = await request.json();
    productId = (body as { productId?: unknown } | null)?.productId;
  } catch {
    return NextResponse.json({ ok: false, errorCode: "unknown" }, { status: 400 });
  }

  try {
    const result = await removeProductImage(productId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("DELETE /beheer/productafbeelding:", err);
    return NextResponse.json({ ok: false, errorCode: "unknown" }, { status: 500 });
  }
}
