/**
 * useWebSocket hook
 * Connects to the backend WebSocket and delivers real-time updates.
 * Falls back to polling when WebSocket is unavailable.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:4000/ws';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';
const POLL_INTERVAL = 3000;

export function useWebSocket() {
  const [prices, setPrices] = useState([]);
  const [news, setNews] = useState([]);
  const [summary, setSummary] = useState(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchViaRest = useCallback(async () => {
    try {
      const [priceRes, newsRes, summaryRes] = await Promise.all([
        fetch(`${API_URL}/api/stocks/latest`),
        fetch(`${API_URL}/api/news`),
        fetch(`${API_URL}/api/analytics/summary`),
      ]);
      const [pd, nd, sd] = await Promise.all([
        priceRes.json(),
        newsRes.json(),
        summaryRes.json(),
      ]);
      if (!mountedRef.current) return;
      if (pd.success) setPrices(pd.data);
      if (nd.success) setNews(nd.data);
      if (sd.success) setSummary(sd.data);
      setLastUpdate(new Date());
    } catch (err) {
      console.warn('[useWebSocket] REST poll error:', err.message);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    fetchViaRest();
    pollRef.current = setInterval(fetchViaRest, POLL_INTERVAL);
  }, [fetchViaRest]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) return;
          setConnected(true);
          stopPolling();
          console.log('[WS] Connected');
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'snapshot') {
              setPrices(msg.prices || []);
              setNews(msg.news || []);
              setSummary(msg.summary || null);
            } else if (msg.type === 'price_update') {
              setPrices(msg.data || []);
            } else if (msg.type === 'news_update') {
              setNews((prev) => [...(msg.data || []), ...prev].slice(0, 30));
            }
            setLastUpdate(new Date());
          } catch {}
        };

        ws.onclose = () => {
          if (!mountedRef.current) return;
          setConnected(false);
          console.warn('[WS] Disconnected, falling back to polling');
          startPolling();
          // Reconnect after 5s
          setTimeout(() => { if (mountedRef.current) connect(); }, 5000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        startPolling();
      }
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (wsRef.current) wsRef.current.close();
      stopPolling();
    };
  }, [startPolling, stopPolling]);

  return { prices, news, summary, connected, lastUpdate };
}
