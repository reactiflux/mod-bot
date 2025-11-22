export class NotFoundError extends Error {
  constructor() {
    super();
    this.cause = "NotFound";
  }
}
