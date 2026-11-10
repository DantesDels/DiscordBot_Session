/** One entry of a Discord autocomplete menu (type-8 interaction response). */
export interface AutocompleteChoice {
  /** Human-readable label shown in the menu. */
  name: string;
  /** Value sent back to the bot when the user picks this choice. */
  value: string;
}

/** Discord hard limit on the number of autocomplete choices per response. */
export const MAX_AUTOCOMPLETE_CHOICES = 25;
