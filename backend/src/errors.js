export class AppError extends Error {
  constructor(status, code, message, retryable = false, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export function errorBody(error, requestId) {
  return {
    error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: error.message ?? 'Unexpected server error.',
      retryable: error.retryable ?? false,
      requestId,
      ...(error.details ? { details: error.details } : {})
    }
  };
}

