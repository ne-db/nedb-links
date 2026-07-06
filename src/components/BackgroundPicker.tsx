import React from "react";
import { Check, Plus, X } from "lucide-react";

import {
  BG_PRESETS,
  MAX_STOPS,
  MIN_STOPS,
  bgCss,
  presetBackground,
  GRADIENT_DIRECTIONS,
  type BackgroundConfig,
  type GradientBackground,
  type GradientDirection,
} from "../lib/background";

/**
 * The Background section — visual, not configuration-heavy. Users pick,
 * they don't imagine: preset cards ARE the gradients, hovering one tries
 * it on the live phone, clicking applies it. Custom expands only when
 * asked for, keeping the default path fast.
 *
 * Backgrounds are chrome over the theme: the canvas changes, cards and
 * accents stay put. "Theme" mode = no override at all.
 */

interface Props {
  value?: BackgroundConfig;
  onChange: (bg: BackgroundConfig | undefined) => void;
  /** Transient try-on for the live preview; null = back to committed. */
  onHover: (bg: BackgroundConfig | null) => void;
}

const DIRECTION_LABELS: Record<GradientDirection, string> = {
  vertical: "Vertical ↓",
  horizontal: "Horizontal →",
  diagonal: "Diagonal ↘",
  radial: "Radial ◎",
};

const SOLID_SWATCHES = ["#0F172A", "#111114", "#1E1B4B", "#052E16", "#FDF2F8", "#F8FAFC"];

const DEFAULT_CUSTOM: GradientBackground = {
  kind: "gradient",
  direction: "diagonal",
  stops: ["#2563EB", "#06B6D4", "#10B981"],
};

export function BackgroundPicker({ value, onChange, onHover }: Props): React.ReactElement {
  const mode: "theme" | "solid" | "gradient" = value?.kind ?? "theme";
  const isCustom = value?.kind === "gradient" && !value.preset;

  const setMode = (m: "theme" | "solid" | "gradient") => {
    onHover(null);
    if (m === "theme") onChange(undefined);
    else if (m === "solid") onChange({ kind: "solid", color: "#0F172A" });
    else onChange(presetBackground(BG_PRESETS[0]));
  };

  const seg = (m: "theme" | "solid" | "gradient", label: string) => (
    <button
      key={m}
      onClick={() => setMode(m)}
      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
        mode === m ? "bg-accent/15 text-accent-soft" : "text-fg-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="mb-3 px-1">
        <h2 className="section-title">Background</h2>
        <p className="section-desc">
          The canvas behind your page — rides over any theme. Hover a preset to try it on.
        </p>
      </div>

      <div className="panel p-5 grid gap-4">
        {/* Mode — Theme default / Solid / Gradient / Image (soon) */}
        <div className="flex items-center gap-1 flex-wrap">
          {seg("theme", "Theme")}
          {seg("solid", "Solid")}
          {seg("gradient", "Gradient")}
          <span
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-fg-subtle opacity-50 cursor-not-allowed select-none"
            title="Image backgrounds are coming"
          >
            Image <span className="chip !py-0 !px-1.5 !text-[9px] ml-1">soon</span>
          </span>
        </div>

        {mode === "theme" && (
          <p className="text-xs text-fg-subtle">
            Using your theme's own canvas. Pick Solid or Gradient to override it —
            cards, accents, and type stay with the theme either way.
          </p>
        )}

        {/* ── Solid ─────────────────────────────────────────────────────── */}
        {mode === "solid" && value?.kind === "solid" && (
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="color"
              value={value.color}
              onChange={(e) => onChange({ kind: "solid", color: e.target.value })}
              className="h-11 w-16 rounded-xl border border-ink-700 bg-ink-850 cursor-pointer"
              title="Pick any color"
            />
            <div className="flex items-center gap-2">
              {SOLID_SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => onChange({ kind: "solid", color: c })}
                  onMouseEnter={() => onHover({ kind: "solid", color: c })}
                  onMouseLeave={() => onHover(null)}
                  className={`w-8 h-8 rounded-lg border transition hover:scale-110 ${
                    value.color.toLowerCase() === c.toLowerCase()
                      ? "ring-2 ring-accent border-accent/40"
                      : "border-ink-700"
                  }`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
            <span className="font-mono text-xs text-fg-subtle">{value.color.toLowerCase()}</span>
          </div>
        )}

        {/* ── Gradient presets — pick, don't imagine ────────────────────── */}
        {mode === "gradient" && value?.kind === "gradient" && (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {BG_PRESETS.map((p) => {
                const selected = value.preset === p.id;
                const css = bgCss(presetBackground(p));
                return (
                  <button
                    key={p.id}
                    onClick={() => onChange(presetBackground(p))}
                    onMouseEnter={() => onHover(presetBackground(p))}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover(presetBackground(p))}
                    onBlur={() => onHover(null)}
                    className={`group relative rounded-xl overflow-hidden border text-left transition hover:-translate-y-0.5 ${
                      selected
                        ? "ring-2 ring-accent border-accent/40 shadow-card-hover"
                        : "border-ink-700 hover:border-accent/40"
                    }`}
                    title={p.blurb}
                  >
                    <span className="block h-16" style={{ background: css }} />
                    {selected && (
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-accent text-white inline-flex items-center justify-center shadow">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                    <span className="block px-2 py-1.5 text-[11px] font-semibold">{p.name}</span>
                  </button>
                );
              })}

              {/* The sixth card: + Custom */}
              <button
                onClick={() => onChange({ ...DEFAULT_CUSTOM, stops: [...DEFAULT_CUSTOM.stops] })}
                className={`rounded-xl border border-dashed text-fg-muted transition hover:-translate-y-0.5 hover:text-accent-soft hover:border-accent/50 ${
                  isCustom ? "ring-2 ring-accent border-accent/40 text-accent-soft" : "border-ink-700"
                }`}
                title="Build your own gradient"
              >
                <span className="h-16 flex items-center justify-center">
                  <Plus size={20} />
                </span>
                <span className="block px-2 py-1.5 text-[11px] font-semibold text-center">Custom</span>
              </button>
            </div>

            {/* ── Custom editor — only when Custom is live ───────────────── */}
            {isCustom && (
              <div className="grid gap-4 pt-1 border-t border-ink-800">
                <div>
                  <label className="label">Direction</label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {GRADIENT_DIRECTIONS.map((d) => (
                      <button
                        key={d}
                        onClick={() => onChange({ ...value, direction: d, preset: undefined })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                          value.direction === d
                            ? "bg-accent/15 text-accent-soft"
                            : "text-fg-muted hover:text-fg bg-ink-850"
                        }`}
                      >
                        {DIRECTION_LABELS[d]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label">Stops</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {value.stops.map((s, i) => (
                      <span key={i} className="relative inline-flex">
                        <input
                          type="color"
                          value={s}
                          onChange={(e) => {
                            const stops = [...value.stops];
                            stops[i] = e.target.value;
                            onChange({ ...value, stops, preset: undefined });
                          }}
                          className="h-10 w-12 rounded-xl border border-ink-700 bg-ink-850 cursor-pointer"
                          title={s}
                        />
                        {value.stops.length > MIN_STOPS && (
                          <button
                            onClick={() => {
                              const stops = value.stops.filter((_, j) => j !== i);
                              onChange({ ...value, stops, preset: undefined });
                            }}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-ink-800 text-fg-muted hover:text-signal-red inline-flex items-center justify-center"
                            title="Remove this stop"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </span>
                    ))}
                    {value.stops.length < MAX_STOPS && (
                      <button
                        onClick={() =>
                          onChange({
                            ...value,
                            stops: [...value.stops, value.stops[value.stops.length - 1]],
                            preset: undefined,
                          })
                        }
                        className="btn btn-secondary !py-2 !px-3 text-xs"
                      >
                        <Plus size={13} /> Add color
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="label">Preview</label>
                  <div
                    className="h-10 rounded-xl border border-ink-700"
                    style={{ background: bgCss(value) }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
