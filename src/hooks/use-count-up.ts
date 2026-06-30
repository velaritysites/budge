import { useEffect, useRef, useState } from "react";

export function useCountUp(target: number, duration = 800): number {
  const [val, setVal] = useState(target);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(target);
  useEffect(() => {
    fromRef.current = val;
    startRef.current = null;
    let raf = 0;
    const animate = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(fromRef.current + (target - fromRef.current) * eased);
      if (p < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return val;
}
