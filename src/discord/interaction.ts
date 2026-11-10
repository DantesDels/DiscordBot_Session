/**
 * Discord interaction payloads — only the fields this bot reads — plus
 * small extraction helpers shared by the handlers.
 */

export interface InteractionOption {
  name: string;
  value?: string | number;
  focused?: boolean;
}

export interface Interaction {
  type: number;
  data?: {
    name: string;
    options?: InteractionOption[];
    custom_id?: string;
  };
  member?: { user?: { id: string } };
  user?: { id: string };
  message?: { content: string };
}

/** Map of option name -> value for the interaction's top-level options. */
export function options(
  interaction: Interaction
): Map<string, string | number | undefined> {
  const map = new Map<string, string | number | undefined>();
  for (const option of interaction.data?.options ?? []) {
    map.set(option.name, option.value);
  }
  return map;
}

/** The option currently being typed into (autocomplete interactions only). */
export function focusedOption(interaction: Interaction): InteractionOption | undefined {
  return interaction.data?.options?.find((o) => o.focused);
}

/** Author of the interaction, whatever the context (guild member or user). */
export function userId(interaction: Interaction): string | undefined {
  return interaction.member?.user?.id ?? interaction.user?.id;
}
