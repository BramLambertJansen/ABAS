import { fakeProductImage } from "./productImageState.ts";

/**
 * Nep-vervanger van src/lib/supabase/admin.ts voor test/productImage.test.ts:
 * de service-role-client met alleen de Storage-aanroepen van
 * src/lib/productImage.ts.
 */
export function createAdminClient() {
  const state = fakeProductImage();
  return {
    storage: {
      from(bucket: string) {
        if (bucket !== "product-images") throw new Error(`onverwachte bucket ${bucket}`);
        return {
          async upload(path: string, body: Uint8Array, options: unknown) {
            state.calls.push(`upload:${path}`);
            if (state.uploadError) return { data: null, error: state.uploadError };
            state.uploads[path] = { body, options };
            return { data: { path }, error: null };
          },
          async remove(paths: string[]) {
            for (const path of paths) state.calls.push(`remove:${path}`);
            const error = paths.map((p) => state.removeError[p]).find(Boolean) ?? null;
            return { data: error ? null : [], error };
          },
        };
      },
    },
  };
}
