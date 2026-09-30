import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranslationContext } from './translation-engine.interface';

/**
 * Builds the prompt sent to the LLM based engines.
 *
 * The rules are intentionally explicit: LLMs love to prepend
 * "Here is the translation:" or to wrap the answer in markdown fences, which
 * would then be delivered to the client as part of the translation.
 */
@Injectable()
export class PromptBuilder {
  private readonly extra: string;

  constructor(private readonly configService: ConfigService) {
    this.extra = this.configService.getOrThrow<string>(
      'translation.promptExtra',
    );
  }

  buildSystemPrompt(context: TranslationContext): string {
    const rules = [
      'You are a professional translator.',
      `Translate the user content from ${context.fromName} (${context.from}) into ${context.toName} (${context.to}).`,
      'Rules:',
      '- Return ONLY the translated content.',
      '- Never add explanations, notes, introductions, apologies or markdown code fences.',
      '- Preserve the original line breaks, punctuation, numbers, URLs, e-mail addresses and emoji.',
      '- Preserve placeholders and markup exactly as they are: HTML/XML tags, {{variables}}, {variables}, %s, %d, ${...}, \\n escapes.',
      '- Keep proper nouns, brand names and technical terms in their original form when they have no established translation.',
      '- If a fragment is already in the target language, keep it unchanged.',
    ];

    if (this.extra.length > 0) {
      rules.push(`- ${this.extra}`);
    }

    return rules.join('\n');
  }

  buildUserPrompt(context: TranslationContext): string {
    return [
      'Translate the content between the <content> tags.',
      '<content>',
      context.text,
      '</content>',
    ].join('\n');
  }
}
