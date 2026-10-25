// Where physical stock is kept. The stored value is the full path text (for example
// "Godown > First Floor > Lobby"). firestore.rules holds the SAME list - the server
// refuses any other value. If you ever change this list, change it in firestore.rules too
// (scripts/selftest.mjs checks that both lists match).

export const LOCATION_GROUPS = [
  {
    group: 'Godown',
    options: [
      { value: 'Godown > Ground Floor', label: 'Ground Floor' },
      { value: 'Godown > First Floor > Back Office Room', label: 'First Floor → Back Office Room' },
      { value: 'Godown > First Floor > Lobby', label: 'First Floor → Lobby' },
      { value: 'Godown > Back Gali Shop', label: 'Back Gali Shop' },
    ],
  },
  {
    group: 'Mayapuri Shop',
    options: [
      { value: 'Mayapuri Shop > W-82/2', label: 'W-82/2' },
      { value: 'Mayapuri Shop > W-82/3', label: 'W-82/3' },
      { value: 'Mayapuri Shop > W-82/3 Upper Ground', label: 'W-82/3 Upper Ground' },
      { value: 'Mayapuri Shop > W-82/4', label: 'W-82/4' },
    ],
  },
];

export const LOCATION_VALUES = LOCATION_GROUPS.flatMap((g) => g.options.map((o) => o.value));

/** '' (no location) or one of the allowed values. */
export const isValidLocation = (v) => v === '' || LOCATION_VALUES.includes(v);

/** Always returns a safe value to store: an allowed location, or ''. */
export const cleanLocation = (v) => (LOCATION_VALUES.includes(v) ? v : '');

/** Human text for a stored value: "Godown → First Floor → Lobby". '' when not set. */
export const locationText = (v) => (LOCATION_VALUES.includes(v) ? v.split(' > ').join(' → ') : '');
