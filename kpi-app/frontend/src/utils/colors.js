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

// Dark, mark-safe steps of each accent (for text on tints and chart marks)
export const KONE_DARK = {
  gold:  '#b87d00',   // from yellow
  green: '#1e8a5e',   // from mint
  cyan:  '#0077a8',   // from light blue
  rose:  '#c0305a',   // from pink
}

// Sub-category colours — brand-aligned, dark enough for chart bars
export const SUB_CAT_COLORS = {
  'Website Content Management':          '#1450f5',  // brand primary
  'Demand Creation – Global':            '#b87d00',  // dark gold (from brand yellow)
  'Retention – Activations':             '#1e8a5e',  // dark mint (from brand mint)
  'Email – Local':                       '#0077a8',  // deep cyan (from brand lightblue)
  'Content Production – Graphic Design': '#c0305a',  // deep rose (from brand pink)
}

// Fixed categorical order — validated for lightness band, chroma floor,
// CVD separation and contrast on white. Never cycle or reshuffle.
export const PALETTE = [
  '#1450f5', '#b87d00', '#1e8a5e', '#0077a8', '#c0305a',
  '#e86427', '#0aa08f', '#a63d5f', '#6b8f00', '#5c66c2',
]

export const scColor = (name, idx) =>
  SUB_CAT_COLORS[name] ?? PALETTE[idx % PALETTE.length]
