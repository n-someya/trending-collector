export type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface RawApiResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
}

export type RawCapture = (response: RawApiResponse) => void | Promise<void>;

export class ApiHttpError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${provider} API ${status}: ${body}`);
    this.name = "ApiHttpError";
  }
}

interface JsonRequestOptions {
  provider: string;
  url: string;
  headers: Headers;
  fetch: FetchFunction;
  acquireRequest: () => boolean;
  retryDelayMilliseconds: number;
  maxAttempts?: number;
  capture?: RawCapture;
}

export async function requestJson<T>(
  options: JsonRequestOptions,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (!options.acquireRequest()) {
      throw new Error("request budget exhausted");
    }
    try {
      const response = await options.fetch(options.url, {
        headers: options.headers,
      });
      const body = await response.text();
      await options.capture?.({
        url: safeUrl(options.url),
        status: response.status,
        headers: safeResponseHeaders(response.headers),
        body,
      });
      if (response.ok) {
        return JSON.parse(body) as T;
      }
      const error = new ApiHttpError(
        options.provider,
        response.status,
        body,
      );
      if (!isRetryable(response.status) || attempt === maxAttempts) {
        throw error;
      }
      lastError = error;
      await sleep(retryDelay(response, options.retryDelayMilliseconds, attempt));
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      if (isTerminalHttpError(normalized) || attempt === maxAttempts) {
        throw normalized;
      }
      lastError = normalized;
      await sleep(backoff(options.retryDelayMilliseconds, attempt));
    }
  }

  throw lastError ?? new Error(`${options.provider} API request failed`);
}

const sensitiveHeaders = new Set([
  "authorization",
  "cookie",
  "proxy-authenticate",
  "proxy-authorization",
  "set-cookie",
  "www-authenticate",
]);

function safeResponseHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [...headers.entries()].filter(
      ([name]) => !sensitiveHeaders.has(name.toLowerCase()),
    ),
  );
}

function safeUrl(value: string): string {
  const url = new URL(value);
  for (const name of ["access_token", "api_key", "token"]) {
    if (url.searchParams.has(name)) {
      url.searchParams.set(name, "[REDACTED]");
    }
  }
  return url.toString();
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function isTerminalHttpError(error: Error): boolean {
  return error instanceof ApiHttpError ? !isRetryable(error.status) : false;
}

function retryDelay(
  response: Response,
  baseMilliseconds: number,
  attempt: number,
): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return Math.max(0, seconds * 1_000);
    }
  }
  return backoff(baseMilliseconds, attempt);
}

function backoff(baseMilliseconds: number, attempt: number): number {
  const exponential = baseMilliseconds * 2 ** (attempt - 1);
  const jitter = baseMilliseconds * 0.2 * Math.random();
  return exponential + jitter;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
