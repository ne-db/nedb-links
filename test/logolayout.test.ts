/**
 * Logo studio math — the WYSIWYG guarantee: one function drives the
 * preview and the export, so framing is resolution-independent.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { clampPan, layoutCover } from "../src/lib/logoLayout";

test("layoutCover: cover-fits, centers, and scales resolution-independently", () => {
  // Wide image into a square stage: height rules the cover scale.
  const l = layoutCover(2000, 1000, 240, 1, 0, 0);
  assert.equal(l.dh, 240, "short edge fills the stage");
  assert.equal(l.dw, 480, "aspect preserved");
  assert.equal(l.dy, 0, "vertically flush");
  assert.equal(l.dx, (240 - 480) / 2, "horizontally centered");

  // Zoom scales around center.
  const z = layoutCover(2000, 1000, 240, 2, 0, 0);
  assert.equal(z.dh, 480);
  assert.equal(z.dx, (240 - 960) / 2);

  // The SAME fractional pan lands proportionally on any stage size —
  // this is what makes the 240px preview honest about the 512px export.
  const a = layoutCover(1000, 1000, 240, 1.5, 0.1, -0.2);
  const b = layoutCover(1000, 1000, 512, 1.5, 0.1, -0.2);
  assert.ok(Math.abs(a.dx / 240 - b.dx / 512) < 1e-9, "x fraction identical across stages");
  assert.ok(Math.abs(a.dy / 240 - b.dy / 512) < 1e-9, "y fraction identical across stages");
});

test("clampPan: bounded, zoom widens the range", () => {
  assert.equal(clampPan(9, 1), 0.5);
  assert.equal(clampPan(-9, 1), -0.5);
  assert.equal(clampPan(0.8, 2), 0.8, "zoomed in allows wider pan");
  assert.equal(clampPan(9, 2), 1, "still bounded");
});
