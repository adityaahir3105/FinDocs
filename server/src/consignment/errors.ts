/** An extraction failure with a message safe to show the user and an HTTP status. */
export class ExtractionError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}
