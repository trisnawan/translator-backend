/** Everything an engine needs to translate one piece of content. */
export interface TranslationContext {
  /** Content that must be translated. */
  text: string;
  /** Source language code (`languages.id`), e.g. `id`. */
  from: string;
  /** Human readable source language name, e.g. `Bahasa Indonesia`. */
  fromName: string;
  /** Target language code (`languages.id`), e.g. `en`. */
  to: string;
  /** Human readable target language name, e.g. `English`. */
  toName: string;
  /** Decrypted credential of the driver. */
  secretKey: string;
  /** `drivers.id` currently in use. */
  driverId: string;
  /** `drivers.name` currently in use. */
  driverName: string;
}

/** Normalized engine result. */
export interface TranslationResult {
  /** Translated content. */
  text: string;
  /** Provider identifier resolved by the registry, e.g. `gemini`. */
  provider: string;
  /** Upstream model / endpoint used for the request. */
  model: string;
  /** Optional raw provider payload, only kept for debugging. */
  raw?: unknown;
}

/**
 * Contract implemented by every translator provider.
 *
 * Adding a new provider means:
 * 1. implement this interface;
 * 2. register it inside `EngineRegistry`;
 * 3. map a `drivers.id` prefix to the provider in `DRIVER_ENGINE_PREFIXES`.
 */
export interface TranslationEngine {
  readonly provider: string;

  translate(context: TranslationContext): Promise<TranslationResult>;
}
