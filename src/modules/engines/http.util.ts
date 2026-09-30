import { AppException } from '../../common/exceptions/app.exception';

export interface HttpRequestOptions {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  provider: string;
}

export interface HttpErrorBody {
  error?: { message?: string; status?: string; type?: string } | string;
  message?: string;
}

/**
 * Minimal JSON HTTP client built on the global `fetch` (Node 18+).
 * Provider errors are converted into readable `AppException`s and the raw body
 * is included in the server log so failures stay debuggable.
 */
export async function requestJson<T>(options: HttpRequestOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(options.url, {
      method: options.method,
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const rawBody = await response.text();
    let parsed: unknown = undefined;

    if (rawBody.length > 0) {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        parsed = rawBody;
      }
    }

    if (!response.ok) {
      const message = `${options.provider} responded with HTTP ${response.status}: ${extractErrorMessage(parsed, rawBody)}`;

      // 429 and 5xx are transient, everything else (bad request, unauthorized,
      // malformed payload, ...) will fail again on a retry.
      if (response.status === 429 || response.status >= 500) {
        throw AppException.serviceUnavailable(message);
      }

      throw AppException.badRequest(message);
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof AppException) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw AppException.serviceUnavailable(
        `${options.provider} did not respond within ${options.timeoutMs}ms`,
      );
    }

    throw AppException.serviceUnavailable(
      `${options.provider} request failed: ${(error as Error).message}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function extractErrorMessage(parsed: unknown, rawBody: string): string {
  if (parsed && typeof parsed === 'object') {
    const body = parsed as HttpErrorBody;

    if (typeof body.error === 'string') {
      return body.error;
    }

    if (body.error && typeof body.error === 'object' && body.error.message) {
      return body.error.message;
    }

    if (typeof body.message === 'string') {
      return body.message;
    }
  }

  const text = typeof parsed === 'string' ? parsed : rawBody;

  return text.slice(0, 300) || 'unknown error';
}

/** Minimal HTML entity decoder, the Google Translation API escapes its output. */
export function decodeHtmlEntities(value: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  return value
    .replace(
      /&(amp|lt|gt|quot|#39|apos|nbsp);/g,
      (match) => entities[match] ?? match,
    )
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
}

/** Removes the code fences an LLM sometimes adds around its answer. */
export function stripCodeFences(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/```$/, '')
    .trim();
}
