import { useEffect, useRef, useState } from "react";

/**
 * Animates from the previous value to `target` whenever `target` changes
 * (ease-out cubic). Jumps straight to the final value under
 * prefers-reduced-motion instead of animating.
 */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      prevTarget.current = target;
      return;
    }

    const from = prevTarget.current;
    const to = target;
    const start = performance.now();
    let frame = 0;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      setValue(to);
      prevTarget.current = to;
    };

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (to - from) * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        finish();
      }
    };
    frame = requestAnimationFrame(tick);
    // Safety net: rAF can be throttled or fully suspended (backgrounded tab,
    // headless/non-visible browser) — never leave the UI stuck on a stale
    // number past `duration` just because the animation loop didn't tick.
    const timeout = window.setTimeout(finish, duration + 100);

    return () => {
      done = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [target, duration]);

  return value;
}
