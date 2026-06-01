const prefix = '[wa-supervisor-v3]';

export const logger = {
  info(message: string, meta?: unknown) {
    console.log(prefix, message, meta ?? '');
  },
  warn(message: string, meta?: unknown) {
    console.warn(prefix, message, meta ?? '');
  },
  error(message: string, meta?: unknown) {
    console.error(prefix, message, meta ?? '');
  }
};
