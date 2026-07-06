/**
 * App theme machinery — the pure parts.
 *
 * getTheme/applyTheme touch localStorage and the DOM (browser-only);
 * the cycle and the validator are pure and tested here.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { isThemeName, nextTheme, THEME_LABELS, THEME_ORDER } from "../src/lib/theme";

test("theme cycle visits all three registers and wraps", () => {
  assert.deepEqual(THEME_ORDER, ["pro", "native", "v3"]);
  assert.equal(nextTheme("pro"), "native");
  assert.equal(nextTheme("native"), "v3");
  assert.equal(nextTheme("v3"), "pro", "cycle wraps back to pro");

  // Every theme has a switcher label.
  for (const t of THEME_ORDER) {
    assert.ok(THEME_LABELS[t].length > 0, `label for ${t}`);
  }
});

test("isThemeName gates persisted values (v2 storage stays valid, junk falls back)", () => {
  assert.equal(isThemeName("pro"), true);
  assert.equal(isThemeName("native"), true);
  assert.equal(isThemeName("v3"), true);
  assert.equal(isThemeName("midnight"), false, "renderer palettes are not app themes");
  assert.equal(isThemeName(""), false);
  assert.equal(isThemeName(null), false);
  assert.equal(isThemeName("V3"), false, "case-sensitive — attribute selectors are");
});
