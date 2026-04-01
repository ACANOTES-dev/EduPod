export interface ApiErrorObject {
  code: string;
  details?: unknown;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiErrorObject;
}

export function apiError(code: string, message: string, details?: unknown): ApiErrorResponse {
  if (details === undefined) {
    return {
      error: {
        code,
        message,
      },
    };
  }

  return {
    error: {
      code,
      details,
      message,
    },
  };
}
