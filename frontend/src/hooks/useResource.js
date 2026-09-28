import { useEffect, useState } from 'react';
import { getJson } from '../api';
export function useResource(path, interval = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const data = await getJson(path, { signal: controller.signal });
        if (!controller.signal.aborted) setState({ data, loading: false, error: null });
      } catch (err) {
        if (!controller.signal.aborted) setState((prev) => ({ ...prev, loading: false, error: err.message }));
      } finally { pending = false; }
    }
    load();
    const timer = interval ? setInterval(load, interval) : null;
    return () => { controller.abort(); clearInterval(timer); };
  }, [path, interval, attempt]);
  return { ...state, retry: () => retry((value) => value + 1) };
}
