import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { reset, render, runEffect, unmount, writes, requests, reports } from "./fakes/queryRace.ts";
register("./fakes/query-race-resolve.mjs", import.meta.url);
const names = ["useMembers", "useProducts", "useAppSettings", "useAlleLeden", "useAlleProducten", "useActiviteitTypes", "useAlleActiviteitTypes"];
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const data = (name: string, value: number) => name === "useAppSettings" ? { negative_limit_cents: value, low_balance_threshold_cents: value } : [{ id: `${value}`, name: `${value}`, balance_cents: value, price_cents: value, category: "x", image_path: null, archived: false }];

for (const name of names) {
  const hooksModule = await import(`../src/hooks/queries/${name}.ts`);
  const hook: () => { refetch: () => void; status: string } = hooksModule[name];
  for (const stale of ["data", "error", "throw"] as const) {
    test(`${name}: oude ${stale} overschrijft vernieuwde data niet`, async () => {
      reset();
      const first = render(hook); runEffect();
      first.refetch(); render(hook); runEffect();
      assert.equal(requests.length, 2);
      requests[1].resolve({ data: data(name, 2000), error: null });
      await flush();
      const current = render(hook);
      assert.equal(current.status, "ready");
      const count = writes.length;
      if (stale === "throw") requests[0].reject(new Error("offline"));
      else requests[0].resolve({ data: data(name, 1000), error: stale === "error" ? { message: "old" } : null });
      await flush();
      assert.equal(writes.length, count);
      assert.equal(JSON.stringify(render(hook)), JSON.stringify(current));
      assert.deepEqual(reports, []);
    });
  }
  test(`${name}: unmount blokkeert late state en logging; actuele fout blijft zichtbaar`, async () => {
    reset(); render(hook); runEffect(); unmount();
    const count = writes.length;
    requests[0].reject(new Error("late")); await flush();
    assert.equal(writes.length, count); assert.deepEqual(reports, []);
    reset(); render(hook); runEffect();
    requests[0].resolve({ data: null, error: { message: "current" } }); await flush();
    assert.equal(render(hook).status, "error"); assert.equal(reports.length, 1);
  });
}
