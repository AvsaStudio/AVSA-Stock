import { useEffect, useState } from 'react';
import { WS_URL } from '../config';
import { getJson } from '../api';

export function useWebSocket() {
  const [state, setState] = useState({ prices: [], news: [], summary: null, connected: false, lastUpdate: null, error: null, source: null, simulated: null, newsError: null });
  useEffect(() => {
    let disposed = false, socket, reconnectTimer, pollTimer, pollController, polling = false;
    const update = (snapshot) => {
      if (!disposed) setState((prev) => ({ ...prev, ...snapshot, error: null, lastUpdate: new Date(snapshot.timestamp) }));
    };
    const poll = async () => {
      if (disposed || polling) return;
      polling = true;
      const controller = new AbortController();
      pollController = controller;
      try {
        const snapshot = await getJson('/api/snapshot', { signal: controller.signal });
        if (!controller.signal.aborted) update(snapshot);
      } catch (err) {
        if (!disposed && err.name !== 'AbortError') setState((prev) => ({ ...prev, error: err.message }));
      } finally { polling = false; }
    };
    const startPolling = () => {
      if (pollTimer) return;
      poll();
      pollTimer = setInterval(poll, 3000);
    };
    const stopPolling = () => { clearInterval(pollTimer); pollTimer = null; pollController?.abort(); };
    const reconnect = () => {
      if (!disposed && !reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 5000);
    };
    function connect() {
      if (disposed) return;
      try {
        const ws = new WebSocket(WS_URL);
        socket = ws;
        ws.onopen = () => { if (!disposed) setState((prev) => ({ ...prev, connected: true })); };
        ws.onmessage = ({ data }) => {
          if (disposed) return;
          try {
            const message = JSON.parse(data);
            if (message.type === 'snapshot') { stopPolling(); update(message); }
            if (message.type === 'feed_error') setState((prev) => ({ ...prev, error: message.error }));
          } catch { setState((prev) => ({ ...prev, error: 'Received an invalid market update.' })); }
        };
        ws.onclose = () => {
          if (disposed) return;
          setState((prev) => ({ ...prev, connected: false }));
          startPolling(); reconnect();
        };
        ws.onerror = () => ws.close();
      } catch { startPolling(); reconnect(); }
    }
    startPolling(); connect();
    return () => { disposed = true; clearTimeout(reconnectTimer); stopPolling(); socket?.close(); };
  }, []);
  return state;
}
