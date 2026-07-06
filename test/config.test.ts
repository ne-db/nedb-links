/**
 * Deployment knobs — brand + default theme resolve safely from env.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { loadConfig } from "../src/server/config";

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prior = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    prior.set(k, process.env[k]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of prior) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("brand + default theme: defaults, overrides, junk falls back", () => {
  const defaults = withEnv(
    { LINKS_BRAND_NAME: undefined, LINKS_DEFAULT_THEME: undefined },
    loadConfig,
  );
  assert.equal(defaults.brandName, "NEDB Links");
  assert.equal(defaults.defaultTheme, "pro");

  const branded = withEnv(
    { LINKS_BRAND_NAME: "ne-db", LINKS_DEFAULT_THEME: "mach" },
    loadConfig,
  );
  assert.equal(branded.brandName, "ne-db");
  assert.equal(branded.defaultTheme, "mach");

  const junk = withEnv(
    { LINKS_BRAND_NAME: "x".repeat(100), LINKS_DEFAULT_THEME: "hotdog-stand" },
    loadConfig,
  );
  assert.equal(junk.brandName.length, 40, "brand names are capped");
  assert.equal(junk.defaultTheme, "pro", "unknown themes fall back to pro");
});
