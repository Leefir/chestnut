/**
 * CLI Error - Custom error class for CLI commands
 *
 * Allows commands to throw errors with exit codes,
 * which are then handled uniformly at the top level.
 */

export class CliError extends Error {
  code: number;

  constructor(message: string, code?: number);
  constructor(message: string, options?: { cause?: unknown; code?: number });
  constructor(
    message: string,
    optionsOrCode?: number | { cause?: unknown; code?: number },
  ) {
    if (typeof optionsOrCode === 'number' || optionsOrCode === undefined) {
      super(message);
      this.code = optionsOrCode ?? 1;
    } else {
      super(message, optionsOrCode);
      this.code = optionsOrCode.code ?? 1;
    }
    this.name = 'CliError';
  }
}

/**
 * Handle CLI errors uniformly
 * Returns exit code for process.exitCode assignment
 */
export function handleCliError(error: unknown): number {
  if (error instanceof CliError) {
    console.error(error.message);
    return error.code;
  }
  if (error instanceof Error) {
    console.error('Error:', error.message);
    return 1;
  }
  console.error('Error:', String(error));
  return 1;
}
