// ── Everything the illustrated world is built to ─────────────────────────────
// Targets, thresholds and geometry in one file, so a number that appears on
// screen can be changed without reading the scene graph, and so the tests can
// assert against the same constants the page draws from.

// KONE's own tokens. Secondaries are limited to two per layout, and this
// layout spends them on light blue (glass) and sand (the closed lane).
export const KONE = {
  blue: '#1450f5',
  white: '#ffffff',
  black: '#141414',
  sand: '#f3eee6',
  lightBlue: '#d2f5ff',
  blue80: '#4373f7',
  blue60: '#7296f9',
  blue40: '#a1b9fb',
  blue20: '#d0dcfd',
  black60: '#727272',
  black40: '#a1a1a1',
  hairline: '#e6e6e6',
  red: '#ff5f28',
  orange: '#ffa023',
  green: '#1ed273',
}

export const INTER = "'Inter', sans-serif"
export const KONE_INFO = "'KONE Information', 'Inter', sans-serif"

// ── Targets ──────────────────────────────────────────────────────────────────
// Each KPI keeps its own unit. Converting a 4.3-out-of-5 score into "86%" so it
// could share a scale with the other two was the single most misleading thing
// about the first build: it implied the three are commensurable, and they are
// not. A score rides its own shaft against its own target.
export const TARGETS = {
  ontime: { value: 90, unit: '%', max: 100 },
  engaged: { value: 60, unit: '%', max: 100 },
  score: { value: 4.2, unit: '', max: 5 },   // max is replaced by the sheet's scale
}

// Under this many responses the score is drawn hollow and labelled "Low
// sample": a mean over nine answers is not a reading.
export const LOW_SAMPLE = 20

// "Within 5 points" of target is measured in each KPI's own units — 5
// percentage points, or 5% of the scale for a score.
export function statusOf(value, target, max) {
  if (value == null || target == null) return { key: 'none', color: KONE.black60, label: '' }
  const near = max > 10 ? 5 : max * 0.05
  if (value >= target) return { key: 'at', color: KONE.green, label: 'At or above target' }
  if (value >= target - near) return { key: 'near', color: KONE.orange, label: 'Just below target' }
  return { key: 'below', color: KONE.red, label: 'Below target' }
}

// ── Geometry ─────────────────────────────────────────────────────────────────
// An orthographic isometric camera: no perspective foreshortening, so a block
// of the same size reads the same wherever it sits in the scene. That is the
// whole reason for the projection — the first build's perspective camera made
// near bars look bigger than equal far ones.
export const ISO = {
  // 35.264° above the horizon at 45° round is the classic isometric station
  // point: the three axes then project at exactly 120° to each other.
  position: [18, 14.7, 18],
  zoom: 23,
  azimuthSwing: Math.PI / 7.2,     // ±25°
}

export const TOWER = {
  storey: 2.2,
  width: 7.2,
  depth: 5.0,
  slab: 0.22,
  minBlock: 0.6,
  x: 0,
  z: 0,
}

// The hero ribbon: a diagonal rising to the tower's top, then a flat run over
// it — the "7" of the brand illustration.
export const RIBBON = {
  x: -6.6,
  width: 1.7,
  // The foot stands well out from the building so the ribbon leans at about
  // 45° rather than rearing up past the roof, which is what a run shorter than
  // the rise does.
  footZ: 11.4,
  headZ: -0.6,
  topRun: 5.2,
  lanes: 2,
  steps: 13,
}

// Three zones set apart from each other, not a bank of shafts side by side.
// Standing them in a row at equal heights was an invitation to read one
// against another, which is exactly the comparison that is not available.
export const ZONES = [
  { key: 'ontime', at: [8.4, 1.2] },
  { key: 'engaged', at: [6.2, 7.4] },
  { key: 'score', at: [-1.6, 9.2] },
]

export const ZONE = {
  footprint: 2.6,
  shaftW: 1.1,
  shaftH: 5.4,
  carH: 0.8,
}
