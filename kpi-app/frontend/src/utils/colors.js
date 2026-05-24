// Sub-category colours — brand-aligned, dark enough for chart bars
export const SUB_CAT_COLORS = {
  'Website Content Management':          '#1450f5',  // brand primary
  'Demand Creation – Global':            '#b87d00',  // dark gold (from brand yellow)
  'Retention – Activations':             '#1e8a5e',  // dark mint (from brand mint)
  'Email – Local':                       '#0077a8',  // deep cyan (from brand lightblue)
  'Content Production – Graphic Design': '#c0305a',  // deep rose (from brand pink)
}

export const PALETTE = [
  '#1450f5', '#b87d00', '#1e8a5e', '#0077a8', '#c0305a',
  '#7c3aed', '#ea580c', '#0f766e', '#db2777', '#65a30d',
]

export const scColor = (name, idx) =>
  SUB_CAT_COLORS[name] ?? PALETTE[idx % PALETTE.length]
