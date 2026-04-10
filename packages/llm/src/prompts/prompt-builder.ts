import type { LlmMessage, LlmMessageRole } from "../clients/openai.client";

export interface PromptSection {
  readonly title: string;
  readonly content: string;
}

export interface PromptBuilderOptions {
  readonly instructions?: string;
  readonly sections?: readonly PromptSection[];
}

export interface ChatPromptOptions {
  readonly developerInstructions?: string;
  readonly userPrompt: string;
  readonly contextSections?: readonly PromptSection[];
  readonly history?: readonly LlmMessage[];
  readonly developerRole?: Extract<LlmMessageRole, "developer" | "system">;
}

function normalizeSection(section: PromptSection): string {
  return `## ${section.title}\n${section.content.trim()}`;
}

export function buildPrompt(options: PromptBuilderOptions): string {
  const parts: string[] = [];

  if (
    options.instructions !== undefined &&
    options.instructions.trim().length > 0
  ) {
    parts.push(options.instructions.trim());
  }

  if (options.sections !== undefined) {
    for (const section of options.sections) {
      parts.push(normalizeSection(section));
    }
  }

  return parts.join("\n\n");
}

export function buildChatPrompt(
  options: ChatPromptOptions,
): readonly LlmMessage[] {
  const messages: LlmMessage[] = [];
  const developerRole = options.developerRole ?? "developer";

  if (
    options.developerInstructions !== undefined &&
    options.developerInstructions.trim().length > 0
  ) {
    const sections =
      options.contextSections !== undefined
        ? { sections: options.contextSections }
        : {};

    messages.push({
      role: developerRole,
      content: buildPrompt({
        instructions: options.developerInstructions,
        ...sections,
      }),
    });
  }

  if (options.history !== undefined) {
    messages.push(...options.history);
  }

  messages.push({
    role: "user",
    content: options.userPrompt.trim(),
  });

  return messages;
}
