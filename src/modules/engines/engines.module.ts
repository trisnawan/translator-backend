import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EngineRegistry } from './engine.registry';
import { PromptBuilder } from './prompt.builder';
import { ClaudeEngine } from './providers/claude.engine';
import { DeepSeekEngine } from './providers/deepseek.engine';
import { GeminiEngine } from './providers/gemini.engine';
import { GoogleTranslateEngine } from './providers/google-translate.engine';

/**
 * Container of every translator provider implementation.
 * Consumed by the worker through `EngineRegistry.resolve(driverId)`.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    PromptBuilder,
    GeminiEngine,
    ClaudeEngine,
    DeepSeekEngine,
    GoogleTranslateEngine,
    EngineRegistry,
  ],
  exports: [EngineRegistry],
})
export class EnginesModule {}
