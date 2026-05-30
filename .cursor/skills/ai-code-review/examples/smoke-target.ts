/** Intentional smoke target — division by zero when value is 0. */
export function unsafeRatio(numerator: number, value: number): number {
  return numerator / value;
}
