// PF Label only accepts named palette colors, so the hex stored in the tag
// description maps to the nearest PF name; anything unrecognized (or no
// color at all) falls back to grey:
//   #C9190B → red, #0066CC → blue, #3E8635 → green, #F0AB00 → yellow
export type LabelPaletteColor = 'red' | 'blue' | 'green' | 'yellow' | 'grey'

// Grey carries no hex on purpose: it is the default, stored as "no color"
// (the tag manager leaves the description unset for grey labels).
export const LABEL_PALETTE: { color: LabelPaletteColor; hex?: string }[] = [
  { color: 'grey' },
  { color: 'red', hex: '#C9190B' },
  { color: 'blue', hex: '#0066CC' },
  { color: 'green', hex: '#3E8635' },
  { color: 'yellow', hex: '#F0AB00' },
]

export function pfLabelColor(hex: string | undefined): LabelPaletteColor {
  if (hex === undefined) return 'grey'
  const match = LABEL_PALETTE.find((entry) => entry.hex?.toLowerCase() === hex.toLowerCase())
  return match?.color ?? 'grey'
}

// Chip text for the palette pickers — the color names are user-facing, so
// they go through the catalogs like any other interface string. A record
// (not template-built ids) keeps t() on literal MessageIds so typos still
// fail typecheck.
export const COLOR_LABEL_IDS = {
  grey: 'tags.color.grey',
  red: 'tags.color.red',
  blue: 'tags.color.blue',
  green: 'tags.color.green',
  yellow: 'tags.color.yellow',
} as const satisfies Record<LabelPaletteColor, string>
