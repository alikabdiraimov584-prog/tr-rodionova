export type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Что-то пошло не так. Попробуйте ещё раз.";
}
