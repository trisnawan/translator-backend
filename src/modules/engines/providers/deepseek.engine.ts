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

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  error?: { message?: string };
}

/** DeepSeek (OpenAI compatible chat completions) engine. Driver id prefix: `deepseek-*`. */
@Injectable()
export class DeepSeekEngine implements TranslationEngine {
  static readonly PROVIDER = 'deepseek';

  readonly provider = DeepSeekEngine.PROVIDER;

  constructor(
    private readonly configService: ConfigService,
    private readonly promptBuilder: PromptBuilder,
  ) {}

  async translate(context: TranslationContext): Promise<TranslationResult> {
    const baseUrl = this.configService.getOrThrow<string>(
      'translation.engines.deepseek.baseUrl',
    );
    const model = this.configService.getOrThrow<string>(
      'translation.engines.deepseek.model',
    );
    const timeoutMs = this.configService.getOrThrow<number>(
      'translation.timeoutMs',
    );

    const response = await requestJson<ChatCompletionResponse>({
      method: 'POST',
      url: `${baseUrl}/chat/completions`,
      headers: { authorization: `Bearer ${context.secretKey}` },
      body: {
        model,
        temperature: 0.2,
        stream: false,
        messages: [
          {
            role: 'system',
            content: this.promptBuilder.buildSystemPrompt(context),
          },
          {
            role: 'user',
            content: this.promptBuilder.buildUserPrompt(context),
          },
        ],
      },
      timeoutMs,
      provider: 'DeepSeek',
    });

    const choice = response.choices?.[0];
    const text = (choice?.message?.content ?? '').trim();

    if (text.length === 0) {
      throw AppException.serviceUnavailable(
        `DeepSeek returned an empty translation${choice?.finish_reason ? ` (${choice.finish_reason})` : ''}`,
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
