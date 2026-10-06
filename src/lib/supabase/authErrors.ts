// Pure functie, geen client: re-export zodat hooks Supabase-packages niet
// rechtstreeks importeren (check:arch). supabase-js re-exporteert auth-js.
export { isAuthRetryableFetchError } from "@supabase/supabase-js";
