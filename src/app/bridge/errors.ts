import { EngineError } from './engineClient';

/** Player-facing description of an engine error, including the first validation issue. */
export function describeError(error: unknown): string {
  if (error instanceof EngineError) {
    const issue = error.issues?.[0];
    return issue ? `${error.message} (${issue.path}: ${issue.message})` : error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function errorCode(error: unknown): string | null {
  return error instanceof EngineError ? error.code : null;
}
