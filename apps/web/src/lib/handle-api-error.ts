export interface ApiErrorPayload {
  code: string;
  message: string;
  redirect?: string;
  status: number;
  details?: unknown;
}

interface HandleApiErrorOptions {
  defaultCode?: string;
  fallbackMessage?: string;
  status?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function handleApiError(
  error: unknown,
  options: HandleApiErrorOptions = {},
): ApiErrorPayload {
  const {
    defaultCode = 'UNKNOWN',
    fallbackMessage = 'An error occurred. Please try again.',
    status: fallbackStatus,
  } = options;

  if (!isRecord(error)) {
    return {
      code: defaultCode,
      message: fallbackMessage,
      status: fallbackStatus ?? 500,
    };
  }

  const nestedError = isRecord(error.error) ? error.error : undefined;
  const code = getString(nestedError?.code) ?? getString(error.code) ?? defaultCode;
  const message = getString(nestedError?.message) ?? getString(error.message) ?? fallbackMessage;
  const redirect = getString(nestedError?.redirect) ?? getString(error.redirect);
  const status = getNumber(error.status) ?? fallbackStatus ?? 500;
  const details =
    nestedError && 'details' in nestedError
      ? nestedError.details
      : 'details' in error
        ? error.details
        : undefined;

  return {
    code,
    message,
    redirect,
    status,
    details,
  };
}
