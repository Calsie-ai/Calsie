// Index arithmetic for the overview template carousel. Pure and separate
// from the component so the wrap-around and guard behaviour can be tested
// directly (see tests/carousel.test.mts), matching how the other lib
// modules in this project are structured.

/** Wraps an index into [0, length). Returns 0 for an empty/invalid list. */
export function wrapIndex(index: number, length: number): number {
  if (!Number.isFinite(length) || length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  const whole = Math.trunc(index);
  return ((whole % length) + length) % length;
}

/** The next slide in a direction, wrapping at both ends. */
export function stepIndex(current: number, length: number, direction: 1 | -1): number {
  if (length <= 0) return 0;
  return wrapIndex(current + direction, length);
}

/**
 * Whether the carousel should be advancing itself right now.
 *
 * Auto-advance is suppressed for a single slide (nothing to rotate to),
 * while the user is hovering or focused inside it (they are reading or
 * about to click), and when the OS asks for reduced motion.
 */
export function shouldAutoAdvance(state: {
  slideCount: number;
  interacting: boolean;
  reducedMotion: boolean;
  paused?: boolean;
}): boolean {
  if (state.slideCount <= 1) return false;
  if (state.interacting) return false;
  if (state.reducedMotion) return false;
  return !state.paused;
}

/** Slide n of m, phrased for a screen reader. */
export function slideLabel(index: number, length: number): string {
  if (length <= 0) return "No templates";
  return `Slide ${wrapIndex(index, length) + 1} of ${length}`;
}
