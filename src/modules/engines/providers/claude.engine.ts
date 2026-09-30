import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../../common/exceptions/app.exception';
import { requestJson, stripCodeFences } from '../http.util';
import { PromptBuilder } from '../prompt.builder';
import {
  TranslationContext,
  TranslationEngine,
  TranslationResult,
} from '../translation-engine.interface';

interface ClaudeResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  error?: { message?: string; type?: string };
}

/** Anthropic Claude (Messages API) engine. Driver id prefix: `claude-*`. */
@Injectable()
export class ClaudeEngine implements TranslationEngine {
  static readonly PROVIDER = 'claude';

  readonly provider = ClaudeEngine.PROVIDER;

  constructor(
    private readonly configService: ConfigService,
    private readonly promptBuilder: PromptBuilder,
  ) {}

  async translate(context: TranslationContext): Promise<TranslationResult> {
    const baseUrl = this.configService.getOrThrow<string>(
      'translation.engines.claude.baseUrl',
    );
    const model = this.configService.getOrThrow<string>(
      'translation.engines.claude.model',
    );
    const version = this.configService.getOrThrow<string>(
      'translation.engines.claude.version',
    );
    const maxTokens = this.configService.getOrThrow<number>(
      'translation.engines.claude.maxTokens',
    );
    const timeoutMs = this.configService.getOrThrow<number>(
      'translation.timeoutMs',
    );

    const response = await requestJson<ClaudeResponse>({
      method: 'POST',
      url: `${baseUrl}/messages`,
      headers: {
        'x-api-key': context.secretKey,
        'anthropic-version': version,
      },
      body: {
        model,
        max_tokens: maxTokens,
        temperature: 0.2,
        system: this.promptBuilder.buildSystemPrompt(context),
        messages: [
          {
            role: 'user',
            content: this.promptBuilder.buildUserPrompt(context),
          },
        ],
      },
      timeoutMs,
      provider: 'Claude',
    });

    const text = (response.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim();

    if (text.length === 0) {
      throw AppException.serviceUnavailable(
        `Claude returned an empty translation${response.stop_reason ? ` (${response.stop_reason})` : ''}`,
      );
    }

    return {
      text: stripCodeFences(text),
      provider: this.provider,
      model,
      raw: response,
    };
  }
}
