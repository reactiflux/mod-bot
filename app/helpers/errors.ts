export class NotFoundError extends Error {
  constructor(resource: string, message?: string) {
    super(message, { cause: `'${resource}' not found` });
  }
}
