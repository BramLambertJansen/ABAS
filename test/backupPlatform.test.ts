import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const { validateBackupConfig, backupProductImages, backupPlatform } = await import(pathToFileURL(`${process.cwd()}/scripts/backup-platform.mjs`).href);
const env = { BACKUP_PROJECT_REF: "project", BACKUP_SUPABASE_URL: "https://project.supabase.co", BACKUP_DB_URL: "postgresql://postgres:private@db.project.supabase.co/postgres", BACKUP_SECRET_KEY: "sb_secret_private", BACKUP_GPG_PUBLIC_KEY: "public-key", BACKUP_GPG_FINGERPRINT: "a".repeat(40), BACKUP_OUTPUT_DIR: "/tmp/abas-encrypted-test" };
test("backup config requires matching project, full recipient and output outside repository", () => {
  validateBackupConfig(env);
  assert.throws(() => validateBackupConfig({ ...env, BACKUP_PROJECT_REF: "other" }), /does not match/);
  assert.throws(() => validateBackupConfig({ ...env, BACKUP_DB_URL: "postgresql://postgres:private@db.other.supabase.co/postgres" }), /same project/);
  assert.throws(() => validateBackupConfig({ ...env, BACKUP_OUTPUT_DIR: process.cwd() }), /outside/);
  assert.throws(() => validateBackupConfig({ ...env, BACKUP_GPG_FINGERPRINT: "short" }), /fingerprint/);
});
test("storage backup recurses, hashes bytes and names local files independently of remote names", async () => {
  const directory = mkdtempSync(join(tmpdir(), "abas-images-test-"));
  try {
    const files = await backupProductImages(env.BACKUP_SUPABASE_URL, env.BACKUP_SECRET_KEY, directory, async (url: URL, options: RequestInit) => {
      assert.equal(options.redirect, "error"); assert.ok(options.signal);
      if (url.pathname.includes("object/list")) {
        const body = JSON.parse(options.body as string);
        return new Response(JSON.stringify(body.prefix === "" ? [{ name: "products", id: null }] : [{ name: "one image.webp", id: "id" }]));
      }
      assert.equal(url.pathname, "/storage/v1/object/product-images/products/one%20image.webp");
      return new Response("image bytes");
    });
    assert.equal(files.length, 1); assert.equal(files[0].file, "00000000.webp");
    assert.equal(files[0].name, "products/one image.webp"); assert.equal(files[0].sha256.length, 64);
    assert.equal(readFileSync(join(directory, files[0].file), "utf8"), "image bytes");
    assert.equal(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")).length, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("storage backup fails closed on errors and hostile names", async () => {
  const directory = mkdtempSync(join(tmpdir(), "abas-images-bad-"));
  try {
    await assert.rejects(backupProductImages(env.BACKUP_SUPABASE_URL, env.BACKUP_SECRET_KEY, directory, async () => new Response("private error", { status: 401 })), /HTTP 401/);
    await assert.rejects(backupProductImages(env.BACKUP_SUPABASE_URL, env.BACKUP_SECRET_KEY, directory, async () => new Response(JSON.stringify([{ name: "..", id: "id" }]))), /invalid Storage object name/);
    assert.deepEqual(readdirSync(directory), []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("command failure does not print passwords or leave an encrypted success artifact", async () => {
  await assert.rejects(backupPlatform(env, async () => { throw new Error(env.BACKUP_DB_URL); }), (error: Error) => {
    assert.match(error.message, /failed during roles.sql/); assert.equal(error.message.includes("private"), false); return true;
  });
});

test("complete backup publishes only ciphertext and checksum and forces database TLS", async () => {
  const output = mkdtempSync(join(tmpdir(), "abas-encrypted-pipeline-"));
  const commands: string[] = [];
  try {
    const result = await backupPlatform({ ...env, BACKUP_OUTPUT_DIR: output }, async (command: string, args: string[]) => {
      commands.push(command);
      if (command === "supabase") {
        assert.equal(new URL(args[args.indexOf("--db-url") + 1]).searchParams.get("sslmode"), "require");
        writeFileSync(args[args.indexOf("-f") + 1], "test SQL");
      }
      if (command === "gpg" && args.includes("--encrypt")) writeFileSync(args[args.indexOf("--output") + 1], "test ciphertext");
    }, async () => new Response("[]"));
    assert.equal(result.images, 0);
    assert.equal(readdirSync(output).length, 2);
    assert.equal(readFileSync(result.output, "utf8"), "test ciphertext");
    assert.match(readFileSync(`${result.output}.sha256`, "utf8"), /^[a-f0-9]{64}/);
    assert.equal(commands.filter((name) => name === "supabase").length, 6);
    assert.equal(commands.filter((name) => name === "gpg").length, 2);
  } finally { rmSync(output, { recursive: true, force: true }); }
});
