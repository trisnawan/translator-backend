import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { ClaudeEngine } from './providers/claude.engine';
import { DeepSeekEngine } from './providers/deepseek.engine';
import { GeminiEngine } from './providers/gemini.engine';
import { GoogleTranslateEngine } from './providers/google-translate.engine';
import { TranslationEngine } from './translation-engine.interface';

interface EnginePrefix {
  prefix: string;
  provider: string;
}

/**
 * Maps a `drivers.id` prefix to the engine that is able to execute it.
 *
 * The driver id acts as the "model/API name" (`gemini-3.8-flash`,
 * `api-google-translate`, ...) so the routing is purely declarative: a new
 * driver only needs a prefix listed here.
 */
export const DRIVER_ENGINE_PREFIXES: EnginePrefix[] = [
  { prefix: 'api-google-translate', provider: GoogleTranslateEngine.PROVIDER },
  { prefix: 'google-translate', provider: GoogleTranslateEngine.PROVIDER },
  { prefix: 'gemini', provider: GeminiEngine.PROVIDER },
  { prefix: 'claude', provider: ClaudeEngine.PROVIDER },
  { prefix: 'deepseek', provider: DeepSeekEngine.PROVIDER },
];

/** Resolves the engine responsible for a driver. */
@Injectable()
export class EngineRegistry implements OnModuleInit {
  private readonly logger = new Logger(EngineRegistry.name);
  private readonly engines = new Map<string, TranslationEngine>();
  private readonly prefixes: EnginePrefix[];

  constructor(
    geminiEngine: GeminiEngine,
    claudeEngine: ClaudeEngine,
    deepSeekEngine: DeepSeekEngine,
    googleTranslateEngine: GoogleTranslateEngine,
  ) {
    for (const engine of [
      geminiEngine,
      claudeEngine,
      deepSeekEngine,
      googleTranslateEngine,
    ]) {
      this.engines.set(engine.provider, engine);
    }

    // Longest prefix first so `api-google-translate` wins over `google-translate`.
    this.prefixes = [...DRIVER_ENGINE_PREFIXES].sort(
      (a, b) => b.prefix.length - a.prefix.length,
    );
  }

  onModuleInit(): void {
    this.logger.log(
      `Translation engines ready: ${[...this.engines.keys()].join(', ')}`,
    );
  }

  /** Returns the provider name for a driver id, or `null` when unsupported. */
  resolveProvider(driverId: string): string | null {
    const match = this.prefixes.find((item) =>
      driverId.toLowerCase().startsWith(item.prefix.toLowerCase()),
    );

    if (!match || !this.engines.has(match.provider)) {
      return null;
    }

    return match.provider;
  }

  /** Returns the engine that must execute the given driver. */
  resolve(driverId: string): TranslationEngine {
    const provider = this.resolveProvider(driverId);

    if (!provider) {
      throw AppException.badRequest(
        `Driver "${driverId}" is not supported by any translation engine. Supported id prefixes: ${this.prefixes.map((item) => item.prefix).join(', ')}`,
      );
    }

    const engine = this.engines.get(provider);

    if (!engine) {
      throw AppException.serviceUnavailable(
        `Translation engine "${provider}" is not available`,
      );
    }

    return engine;
  }

  /** Supported driver id prefixes, exposed for validation messages. */
  get supportedPrefixes(): string[] {
    return this.prefixes.map((item) => item.prefix);
  }
}
