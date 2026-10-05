#!/usr/bin/env node
// Produces only encrypted output; uploads and retention belong to the scheduler.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, renameSync, copyFileSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

export function validateBackupConfig(env, repo = process.cwd()) {
  for (const name of ["BACKUP_DB_URL", "BACKUP_SUPABASE_URL", "BACKUP_SECRET_KEY", "BACKUP_PROJECT_REF", "BACKUP_OUTPUT_DIR", "BACKUP_GPG_PUBLIC_KEY", "BACKUP_GPG_FINGERPRINT"]) {
    if (!env[name]) throw new Error(`${name} is required`);
  }
  let api, db;
  try { api = new URL(env.BACKUP_SUPABASE_URL); db = new URL(env.BACKUP_DB_URL); }
  catch { throw new Error("invalid backup connection configuration"); }
  if (api.origin !== `https://${env.BACKUP_PROJECT_REF}.supabase.co` || api.username || api.password) throw new Error("backup API URL does not match project ref");
  if (!["postgres:", "postgresql:"].includes(db.protocol) ||
      !(db.hostname === `db.${env.BACKUP_PROJECT_REF}.supabase.co` ||
        (db.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(db.username) === `postgres.${env.BACKUP_PROJECT_REF}` && db.port === "5432"))) {
    throw new Error("backup database must be the same project's direct connection or session pooler");
  }
  if (!/^[a-f0-9]{40}$/i.test(env.BACKUP_GPG_FINGERPRINT)) throw new Error("a full GPG fingerprint is required");
  if (!isAbsolute(env.BACKUP_OUTPUT_DIR)) throw new Error("backup output directory must be absolute");
  const rel = relative(resolve(repo), resolve(env.BACKUP_OUTPUT_DIR));
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) throw new Error("backup output must be outside the repository");
}

export async function backupProductImages(base, key, directory, request = fetch) {
  const headers = { apikey: key };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const files = [], prefixes = [""], seen = new Set();
  async function get(path, options = {}) {
    let response;
    try { response = await request(new URL(path, base), { ...options, headers: { ...headers, ...options.headers }, redirect: "error", signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error("Storage backup request failed"); }
    if (!response.ok) throw new Error(`Storage backup request returned HTTP ${response.status}`);
    return response;
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (let i = 0; i < prefixes.length; i++) {
    const prefix = prefixes[i];
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    for (let offset = 0; ; offset += 100) {
      const response = await get("/storage/v1/object/list/product-images", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, offset, limit: 100, sortBy: { column: "name", order: "asc" } }),
      });
      let entries;
      try { entries = await response.json(); } catch { throw new Error("invalid Storage inventory"); }
      if (!Array.isArray(entries)) throw new Error("invalid Storage inventory");
      for (const entry of entries) {
        if (typeof entry.name !== "string" || !entry.name || entry.name.includes("/") || [".", ".."].includes(entry.name)) throw new Error("invalid Storage object name");
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id == null) { prefixes.push(name); continue; }
        const object = await get(`/storage/v1/object/product-images/${name.split("/").map(encodeURIComponent).join("/")}`);
        const data = Buffer.from(await object.arrayBuffer());
        if (data.length > 1048576) throw new Error("product image exceeds bucket limit");
        const file = `${String(files.length).padStart(8, "0")}.webp`;
        writeFileSync(join(directory, file), data, { mode: 0o600 });
        files.push({ bucket: "product-images", name, file, bytes: data.length, sha256: sha256(data) });
      }
      if (entries.length < 100) break;
    }
  }
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(files, null, 2), { mode: 0o600 });
  return files;
}

export async function backupPlatform(env = process.env, run = exec, request = fetch) {
  validateBackupConfig(env);
  const work = mkdtempSync(join(tmpdir(), "abas-backup-"));
  const bundle = join(work, "bundle"); mkdirSync(bundle, { mode: 0o700 });
  async function command(name, args, label) {
    try { await run(name, args, { env, maxBuffer: 16 * 1024 * 1024 }); }
    catch { throw new Error(`backup failed during ${label}`); } // Never expose command arguments / DB password.
  }
  try {
    const dbUrl = new URL(env.BACKUP_DB_URL);
    dbUrl.searchParams.set("sslmode", "require");
    const dumps = [
      ["roles.sql", "--role-only"], ["schema.sql"],
      ["data.sql", "--data-only", "--use-copy", "-x", "storage.buckets_vectors", "-x", "storage.vector_indexes"],
      ["history_schema.sql", "--schema", "supabase_migrations"],
      ["history_data.sql", "--schema", "supabase_migrations", "--data-only", "--use-copy"],
      ["managed_schema_reference.sql", "--schema", "auth,storage"],
    ];
    for (const [file, ...flags] of dumps) {
      await command("supabase", ["db", "dump", "--db-url", dbUrl.href, "-f", join(bundle, file), ...flags], file);
    }
    const images = await backupProductImages(env.BACKUP_SUPABASE_URL, env.BACKUP_SECRET_KEY, join(bundle, "product-images"), request);
    writeFileSync(join(bundle, "backup.json"), JSON.stringify({ version: 1, projectRef: env.BACKUP_PROJECT_REF, createdAt: new Date().toISOString(), images: images.length,
      files: dumps.map(([file]) => ({ file, sha256: sha256(readFileSync(join(bundle, file))) })),
      restoreNote: "managed_schema_reference.sql is for review, not blind execution on a managed target; follow the restore runbook",
    }, null, 2), { mode: 0o600 });
    await command("tar", ["-czf", join(work, "bundle.tar.gz"), "-C", bundle, "."], "archive");
    const keyring = join(work, "keyring"); mkdirSync(keyring, { mode: 0o700 });
    const key = join(work, "recipient.asc"); writeFileSync(key, env.BACKUP_GPG_PUBLIC_KEY, { mode: 0o600 });
    await command("gpg", ["--homedir", keyring, "--batch", "--import", key], "public key import");
    await command("gpg", ["--homedir", keyring, "--batch", "--trust-model", "always", "--recipient", env.BACKUP_GPG_FINGERPRINT, "--output", join(work, "encrypted.gpg"), "--encrypt", join(work, "bundle.tar.gz")], "encryption");
    mkdirSync(env.BACKUP_OUTPUT_DIR, { recursive: true, mode: 0o700 });
    const filename = `abas-${new Date().toISOString().replaceAll(":", "-")}.tar.gz.gpg`;
    const output = join(env.BACKUP_OUTPUT_DIR, filename);
    // NAS/output may use a different filesystem. Publish only complete ciphertext.
    try {
      copyFileSync(join(work, "encrypted.gpg"), `${output}.partial`);
      renameSync(`${output}.partial`, output);
    } finally { rmSync(`${output}.partial`, { force: true }); }
    writeFileSync(`${output}.sha256`, `${sha256(readFileSync(output))}  ${filename}\n`, { mode: 0o600 });
    return { output, images: images.length };
  } finally { rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result = await backupPlatform(); console.log(`encrypted backup: ${result.output} (${result.images} images)`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
