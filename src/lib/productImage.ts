import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSessionErrorCode, type SessionErrorCode } from "./barSessie.ts";
import {
  PRODUCT_IMAGE_BUCKET,
  PRODUCT_IMAGE_MAX_UPLOAD_BYTES,
  isProductImageSizeAllowed,
} from "./productImageRules.ts";
import { reencodeProductImage } from "./productImageProcessing.ts";

/**
 * Server-actie voor productafbeeldingen (docs/features/productafbeeldingen.md
 * → Server-actie; ADR 0018, het patroon van ADR 0006 toegepast op Storage).
 * Uitsluitend aangeroepen vanuit src/app/(bar)/beheer/productafbeelding/
 * route.ts, nooit vanuit client-code: dit bestand importeert de
 * service-role-client (src/lib/supabase/admin.ts) en, via
 * productImageProcessing.ts, `sharp`.
 *
 * Volgorde (spec → Server-actie, genummerd zoals daar):
 *   1. verificatie met de sessie-gebonden client: getUser, actor-lid met rol
 *      beheerder, check_beheer_session — vóór er iets gelezen, gedecodeerd of
 *      geüpload wordt;
 *   2. invoer: bestand aanwezig, niet boven de uploadgrens;
 *   3. opnieuw coderen met `sharp` (productImageProcessing.ts);
 *   4. uploaden met de service-role-client naar een nieuw, willekeurig pad;
 *   5. set_product_image met de sessie-gebonden client (auth.uid() en
 *      session_id zijn die van de beheerder); faalt die, dan het nieuwe
 *      object weer weg (compenseren);
 *   6. het vorige object opruimen. Mislukt dat, dan blijft er een
 *      weesbestand: gelogd, en toch succes (Besluit 13).
 *
 * Een sessiecode gaat ongewijzigd terug, zodat de client de centrale
 * afhandeling (BarSessieProvider) kan laten doen wat die doet. Anders dan
 * inviteMember.ts, dat zo'n code `unknown` maakt.
 */

export type ProductImageErrorCode =
  | SessionErrorCode
  | "actor_not_found"
  | "no_admin_role"
  | "product_not_found"
  | "file_missing"
  | "file_too_large"
  | "unsupported_type"
  | "upload_failed"
  | "unknown";

export type ProductImageResult =
  | { ok: true; imagePath: string | null }
  | { ok: false; errorCode: ProductImageErrorCode };

/** Het deel van een `File` dat de actie gebruikt (ook een nep-bestand in
 *  test/productImage.test.ts). */
export type UploadedFile = { size: number; arrayBuffer(): Promise<ArrayBuffer> };

export type UploadInput = {
  /** `Content-Length` van de request, `null` als die ontbrak of onleesbaar
   *  was. */
  contentLength: number | null;
  /** Leest de multipart-body pas ná de verificatie. */
  readForm: () => Promise<{ productId: unknown; file: unknown }>;
};

/** Ruimte voor de multipart-omhulling (boundary, kopregels, productId) boven
 *  de bestandsgrens, voor de controle op `Content-Length`. De echte grens is
 *  `File.size`; dit weigert alleen wat zeker te groot is, zonder het te
 *  lezen. */
const MULTIPART_OVERHEAD_BYTES = 16 * 1024;

/** Lang en onveranderlijk: elk pad is uniek, een vervanging krijgt een
 *  nieuwe URL (ADR 0018 → punt 5). */
const CACHE_CONTROL_SECONDS = String(365 * 24 * 60 * 60);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionClient = Awaited<ReturnType<typeof createClient>>;

function fail(errorCode: ProductImageErrorCode): ProductImageResult {
  return { ok: false, errorCode };
}

/** Foutcode van set_product_image of check_beheer_session. `invalid_image_path`
 *  en `image_not_found` horen via deze route nooit voor te komen: `unknown`,
 *  en gelogd. */
function rpcErrorCode(context: string, error: { message?: string }): ProductImageErrorCode {
  const message = error.message;
  if (isSessionErrorCode(message)) return message;
  if (message === "actor_not_found" || message === "no_admin_role" || message === "product_not_found") {
    return message;
  }
  console.error(`${context}:`, error);
  return "unknown";
}

function isUploadedFile(value: unknown): value is UploadedFile {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as UploadedFile).size === "number" &&
    typeof (value as UploadedFile).arrayBuffer === "function"
  );
}

/** Stap 1. `null` betekent: deze aanroeper mag verder. */
async function verifyCaller(supabase: SessionClient): Promise<ProductImageErrorCode | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "actor_not_found";

  const { data: actor, error: actorError } = await supabase
    .from("members")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .eq("archived", false)
    .maybeSingle();

  if (actorError) {
    console.error("productImage (actorcheck):", actorError);
    return "unknown";
  }
  if (!actor) return "actor_not_found";
  if (actor.role !== "beheerder") return "no_admin_role";

  // Dezelfde voorwaarde als require_beheer_session() in set_product_image
  // (modus beheer, aal2), maar vóór er iets geüpload wordt.
  const { error: sessionError } = await supabase.rpc("check_beheer_session");
  if (sessionError) return rpcErrorCode("productImage (check_beheer_session)", sessionError);

  return null;
}

/** Stap 5 en 6: de verwijzing zetten en het vorige object opruimen. */
async function setReference(
  supabase: SessionClient,
  productId: string,
  imagePath: string | null
): Promise<{ ok: true } | { ok: false; errorCode: ProductImageErrorCode }> {
  const { data: previous, error } = await supabase.rpc("set_product_image", {
    p_product_id: productId,
    p_image_path: imagePath,
  });
  if (error) {
    return { ok: false, errorCode: rpcErrorCode("productImage (set_product_image)", error) };
  }

  if (typeof previous === "string" && previous !== imagePath) {
    const { error: removeError } = await createAdminClient()
      .storage.from(PRODUCT_IMAGE_BUCKET)
      .remove([previous]);
    if (removeError) {
      // Het product klopt; er blijft alleen een weesbestand (Besluit 13).
      console.error(`productImage: vorig object ${previous} niet opgeruimd (weesbestand):`, removeError);
    }
  }
  return { ok: true };
}

/** `POST /beheer/productafbeelding`: uploaden of vervangen. */
export async function uploadProductImage(input: UploadInput): Promise<ProductImageResult> {
  // 1. Verificatie.
  const supabase = await createClient();
  const denied = await verifyCaller(supabase);
  if (denied) return fail(denied);

  // 2. Invoer. Eerst Content-Length (zonder de body te lezen), dan het
  //    bestand zelf.
  if (
    input.contentLength !== null &&
    input.contentLength > PRODUCT_IMAGE_MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES
  ) {
    return fail("file_too_large");
  }

  let form: { productId: unknown; file: unknown };
  try {
    form = await input.readForm();
  } catch (err) {
    console.error("productImage (multipart):", err);
    return fail("unknown");
  }
  const { productId, file } = form;
  if (typeof productId !== "string" || !UUID_RE.test(productId)) {
    // Een id dat geen uuid is, bestaat niet als product.
    return fail("product_not_found");
  }
  if (!isUploadedFile(file) || file.size === 0) return fail("file_missing");
  if (!isProductImageSizeAllowed(file.size)) return fail("file_too_large");

  // 3. Decoderen en opnieuw coderen.
  const processed = await reencodeProductImage(new Uint8Array(await file.arrayBuffer()));
  if (!processed.ok) return fail(processed.errorCode);

  // 4. Uploaden naar een nieuw pad, nooit overschrijven.
  const imagePath = `products/${productId.toLowerCase()}/${randomUUID()}.webp`;
  const bucket = createAdminClient().storage.from(PRODUCT_IMAGE_BUCKET);
  const { error: uploadError } = await bucket.upload(imagePath, processed.webp, {
    contentType: "image/webp",
    upsert: false,
    cacheControl: CACHE_CONTROL_SECONDS,
  });
  if (uploadError) {
    console.error("productImage (upload):", uploadError);
    return fail("upload_failed");
  }

  // 5 en 6.
  const result = await setReference(supabase, productId.toLowerCase(), imagePath);
  if (!result.ok) {
    // Compenseren: het nieuwe object hoort bij niets.
    const { error: compensateError } = await bucket.remove([imagePath]);
    if (compensateError) {
      console.error(`productImage: nieuw object ${imagePath} niet verwijderd (weesbestand):`, compensateError);
    }
    return fail(result.errorCode);
  }

  return { ok: true, imagePath };
}

/** `DELETE /beheer/productafbeelding`: weghalen. Zonder afbeelding is dit
 *  een no-op met `imagePath: null` (idempotent). */
export async function removeProductImage(productId: unknown): Promise<ProductImageResult> {
  // 1. Verificatie.
  const supabase = await createClient();
  const denied = await verifyCaller(supabase);
  if (denied) return fail(denied);

  if (typeof productId !== "string" || !UUID_RE.test(productId)) {
    return fail("product_not_found");
  }

  // 5 en 6, met p_image_path = null.
  const result = await setReference(supabase, productId.toLowerCase(), null);
  if (!result.ok) return fail(result.errorCode);
  return { ok: true, imagePath: null };
}
