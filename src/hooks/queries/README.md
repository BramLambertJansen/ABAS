# hooks/queries/

The only layer (besides `src/lib/`) allowed to call Supabase
(`supabase.from()`/`.rpc()`). Feature and shell components call a hook from
here, never the client directly — enforced by `npm run check:policy`.
