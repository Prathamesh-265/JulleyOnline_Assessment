// Throw this from anywhere; the error handler turns it into a JSON response.
// `extra` is merged into the body (e.g. the current task on a 409).
export class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
