import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../../common/exceptions/app.exception';
import { decodeHtmlEntities, requestJson } from '../http.util';
import {
  TranslationContext,
  TranslationEngine,
  TranslationResult,
} from '../translation-engine.interface';

interface GoogleTranslateResponse {
  data?: {
    translations?: Array<{
      translatedText?: string;
      detectedSourceLanguage?: string;
    }>;
  };
  error?: { message?: string; status?: string };
}

/**
 * Google Cloud Translation API (v2) engine. Driver id prefix: `api-google-translate`.
 *
 * Unlike the LLM engines this one is a dedicated translation API, so no prompt
 * is involved: the driver `secret_key` is the Google API key.
 */
@Injectable()
export class GoogleTranslateEngine implements TranslationEngine {
  static readonly PROVIDER = 'google-translate';

  readonly provider = GoogleTranslateEngine.PROVIDER;

  constructor(private readonly configService: ConfigService) {}

  async translate(context: TranslationContext): Promise<TranslationResult> {
    const baseUrl = this.configService.getOrThrow<string>(
      'translation.engines.googleTranslate.baseUrl',
    );
    const format = this.configService.getOrThrow<string>(
      'translation.engines.googleTranslate.format',
    );
    const timeoutMs = this.configService.getOrThrow<number>(
      'translation.timeoutMs',
    );

    const response = await requestJson<GoogleTranslateResponse>({
      method: 'POST',
      url: `${baseUrl}?key=${encodeURIComponent(context.secretKey)}`,
      body: {
        q: [context.text],
        source: context.from,
        target: context.to,
        format,
      },
      timeoutMs,
      provider: 'Google Translate',
    });

    const translated = response.data?.translations?.[0]?.translatedText;

    if (!translated) {
      throw AppException.serviceUnavailable(
        'Google Translate returned an empty translation',
      );
    }

    return {
      text: format === 'text' ? decodeHtmlEntities(translated) : translated,
      provider: this.provider,
      model: `google-translate/${context.from}-${context.to}`,
      raw: response,
    };
  }
}
