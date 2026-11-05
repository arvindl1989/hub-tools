// ── KONE brand theme ───────────────────────────────────────────────────────────
// Core: KONE blue #1450f5 + black/white ink.
// Accents (surfaces/tints): sand #f3eee6 · yellow #ffe141 · light blue #d2f5ff
//                           pink #ffcdd7 · mint #aae1c8
// Chart marks are darker steps derived from the accent hues so they stay
// readable on white — the accent tints themselves are for backgrounds only.

export const KONE = {
  blue:      '#1450f5',
  blueDark:  '#0d3ac2',
  ink:       '#141414',
  white:     '#ffffff',
  sand:      '#f3eee6',
  yellow:    '#ffe141',
  lightblue: '#d2f5ff',
  pink:      '#ffcdd7',
  mint:      '#aae1c8',
}

// Dark, mark-safe steps of each accent, for text sitting on a tint. The chart
// marks come from chartTheme's SERIES instead; these two sets used to disagree.
export const KONE_DARK = {
  gold:  '#b87d00',
  green: '#0f9c52',
  cyan:  '#0d7f9e',
  rose:  '#a8336b',
}

// Sub-category colours and the categorical order both live in
// kone/chartTheme.js now — one definition, validated there. Re-exported here
// so the modules that already import from this path keep working.
export {
  SERIES as PALETTE, SUB_CATEGORY as SUB_CAT_COLORS, seriesColor,
} from '../kone/chartTheme'

import { SUB_CATEGORY, seriesColor as _seriesColor } from '../kone/chartTheme'

export const scColor = (name, idx) => SUB_CATEGORY[name] ?? _seriesColor(idx)
