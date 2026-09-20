/** Error validasi dengan daftar pesan Bahasa Indonesia. */
export class ValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(errors.join(' '));
    this.name = 'ValidationError';
    this.errors = errors;
  }
}
