// The readable part of whatever a failed call threw, for a toast.
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
