/** cubic-bezier easing as a function of x, solved by bisection (ease-instrument 0.2,0,0,1; ease-in-out 0.4,0,0.2,1). */
export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const X = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const Y = (t: number): number => ((ay * t + by) * t + cy) * t;
  return (x) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      if (X(m) < x) lo = m;
      else hi = m;
    }
    return Y((lo + hi) / 2);
  };
}

export const easeInstrument = bezier(0.2, 0, 0, 1);
export const easeInOut = bezier(0.4, 0, 0.2, 1);
