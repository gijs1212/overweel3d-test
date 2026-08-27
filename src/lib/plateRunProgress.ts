export function getPlateRunProgress(required: number, completed: number, printed: boolean) {
  const safeRequired = Number.isInteger(required) && required >= 1 ? required : 1;
  const safeCompleted = Number.isInteger(completed) && completed >= 0
    ? Math.min(safeRequired, completed)
    : printed ? safeRequired : 0;

  return {
    required: safeRequired,
    completed: safeCompleted,
    remaining: Math.max(0, safeRequired - safeCompleted),
  };
}
