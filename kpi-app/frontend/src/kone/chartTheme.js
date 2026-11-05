// ── One palette for every chart and table ────────────────────────────────────
// Each chart used to carry its own copy of a colour list. They had drifted:
// one array named #1450f5 twice and #c0305a twice, so two different series on
// the same chart came out the same colour, and the list ran through teals that
// a reader with normal colour vision cannot separate.
//
// This is the single definition. It is KONE's palette, stepped to where a data
// mark can live.
//
// On the stepping: the brand's secondaries — sand, yellow, light blue, pink,
// mint — are pastels. They are right behind black text, which is what the
// segment cards use them for, but a thin bar or a 2px line in #aae1c8 on white
// is barely there: run through the validator they fail the lightness band, the
// chroma floor and contrast. So each series colour here is the brand hue taken
// to a step that carries. The hue is KONE's; the lightness is what the chart
// needs.
//
// Checked rather than judged — scripts/validate_palette.js from the dataviz
// skill, light surface:
//
//   Lightness band      PASS   all 8 inside L 0.43–0.77
//   Chroma floor        PASS   all 8 >= 0.1
//   CVD separation      PASS   worst adjacent pair ΔE 11.1 (deutan)
//   Normal-vision floor PASS   worst adjacent pair ΔE 22.8
//   Contrast vs surface PASS   all 8 >= 3:1
//
// The order matters and is fixed. Colour follows the entity, not its rank, so
// filtering a series out must never repaint the ones that remain, and the
// adjacent pairs are the ones the validator separated.

export const SERIES = [
  '#1450f5',  // KONE Blue — the brand, and always series one
  '#d9400a',  // accent red #ff5f28, stepped
  '#0d7f9e',  // light blue #d2f5ff, stepped
  '#b87d00',  // accent orange #ffa023, stepped
  '#a8336b',  // pink #ffcdd7, stepped
  '#0f9c52',  // accent green #1ed273, stepped
  '#4373f7',  // blue-80, straight from the tints
  '#6b7a00',  // yellow #ffe141, stepped
]

// Past the eighth series, grey. A ninth hue would be one the validator never
// saw, and cycling back to blue would give two series the same colour — which
// is the bug this file exists to end.
export const OVERFLOW = '#a1a1a1'
export const seriesColor = (i) => SERIES[i] ?? OVERFLOW

// The five sub-categories, each kept near the hue it has always had so nobody
// has to relearn a chart, and ordered as they stack. Validated as its own set,
// because these five appear together on every stacked column:
//
//   CVD separation      PASS   worst adjacent pair ΔE 11.1 (deutan)
//   Normal-vision floor PASS   worst adjacent pair ΔE 16.4
export const SUB_CATEGORY = {
  'Website Content Management':          SERIES[0],  // blue
  'Demand Creation – Global':            SERIES[3],  // gold
  'Email – Local':                       SERIES[2],  // cyan
  'Retention – Activations':             SERIES[5],  // green
  'Content Production – Graphic Design': SERIES[4],  // rose
}

// Reserved. Never used as "series 9" — a reader who has learnt that green means
// healthy should not meet it as a category.
export const STATUS = {
  success: '#1ed273',
  warning: '#ffa023',
  error: '#ff5f28',
}

// The three fixed roles on the flow chart, named rather than positional so the
// legend and the bars cannot disagree.
export const FLOW = {
  inflow: '#1450f5',
  outflow: '#0f9c52',
  net: '#b87d00',
}

// Ink, from the brand's black tints. Text wears these, never the series colour.
export const INK = {
  primary: '#141414',
  secondary: '#727272',
  muted: '#a1a1a1',
}

// Hairlines and plot furniture. The warm hairline matches the sand surfaces the
// app is built on; the grid is lighter still, because it should be read past.
export const RULE = '#e8e2d6'
export const GRID = '#f1ede3'
export const SURFACE = '#ffffff'
export const SAND = '#f3eee6'
export const SAND_SOFT = '#faf8f3'

// Inter for anything that is words, KONE Information for anything that is a
// figure. The brand rule, applied to axes and table cells as much as headings.
export const INTER = "'Inter', sans-serif"
export const KONE_FONT = "'KONE Information', 'Inter', sans-serif"
