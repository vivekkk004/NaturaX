import { useEffect, useState } from 'react';

/** Returns `value` only after it stopped changing for `delay` ms (search boxes: one request, not one per key). */
export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
