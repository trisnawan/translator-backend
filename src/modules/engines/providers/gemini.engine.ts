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

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }>; role?: string };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

/** Google Gemini (Generative Language API) engine. Driver id prefix: `gemini-*`. */
@Injectable()
export class GeminiEngine implements TranslationEngine {
  static readonly PROVIDER = 'gemini';

  readonly provider = GeminiEngine.PROVIDER;

  constructor(
    private readonly configService: ConfigService,
    private readonly promptBuilder: PromptBuilder,
  ) {}

  async translate(context: TranslationContext): Promise<TranslationResult> {
    const baseUrl = this.configService.getOrThrow<string>(
      'translation.engines.gemini.baseUrl',
    );
    const model = this.configService.getOrThrow<string>(
      'translation.engines.gemini.model',
    );
    const timeoutMs = this.configService.getOrThrow<number>(
      'translation.timeoutMs',
    );

    const prompt = [
      this.promptBuilder.buildSystemPrompt(context),
      '',
      this.promptBuilder.buildUserPrompt(context),
    ].join('\n');

    const response = await requestJson<GeminiResponse>({
      method: 'POST',
      url: `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(context.secretKey)}`,
      headers: { 'x-goog-api-key': context.secretKey },
      body: {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.95,
        },
      },
      timeoutMs,
      provider: 'Gemini',
    });

    if (response.promptFeedback?.blockReason) {
      throw AppException.serviceUnavailable(
        `Gemini blocked the request (${response.promptFeedback.blockReason})`,
      );
    }

    const candidate = response.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('')
      .trim();

    if (text.length === 0) {
      throw AppException.serviceUnavailable(
        `Gemini returned an empty translation${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}`,
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
