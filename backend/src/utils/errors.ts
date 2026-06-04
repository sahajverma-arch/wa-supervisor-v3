export function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedError | string;
};

export function serializeError(error: unknown, depth = 0): SerializedError | string {
  if (!(error instanceof Error)) {
    return typeof error === 'string' ? error : toErrorMessage(error);
  }

  const serialized: SerializedError = {
    name: error.name,
    message: error.message,
    stack: error.stack
  };

  if (depth < 3 && error.cause) {
    serialized.cause = serializeError(error.cause, depth + 1);
  }

  return serialized;
}
