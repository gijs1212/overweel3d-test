/** Accept the minimum supported release and all newer semantic versions. */
export function isVersionAtLeast(actual: unknown, minimum: string): boolean {
  if (typeof actual !== "string" || !/^\d+\.\d+\.\d+$/.test(actual)) return false;
  const current = actual.split(".").map(Number);
  const required = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (current[index] !== required[index]) return current[index] > required[index];
  }
  return true;
}
