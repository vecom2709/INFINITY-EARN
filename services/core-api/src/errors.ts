export class WorkflowError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ? `${code}: ${message}` : code);
    this.code = code;
    this.name = 'WorkflowError';
  }
}
