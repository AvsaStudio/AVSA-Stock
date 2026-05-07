import React, { useState, useEffect, useRef } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export default function PriceChart({ symbol, prices }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const bufferRef = useRef([]);

  // Fetch history when symbol changes
  useEffect(() => {
    if (!symbol) {
      bufferRef.current = [];
      setHistory([]);
      return;
    }
    setLoading(true);
    fetch(`${API_URL}/api/stocks/${symbol}/history?limit=50`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const formatted = data.data.map((d) => ({
            time: new Date(d.timestamp).toLocaleTimeString(),
            price: d.price,
          })).reverse();
          bufferRef.current = formatted;
          setHistory(formatted);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [symbol]);

  // Append live ticks from the price feed
  useEffect(() => {
    if (!symbol || !prices.length) return;
    const tick = prices.find((p) => p.symbol === symbol);
    if (!tick) return;

    const newPoint = {
      time: new Date(tick.timestamp || Date.now()).toLocaleTimeString(),
      price: tick.price,
    };
    bufferRef.current = [...bufferRef.current.slice(-99), newPoint];
    setHistory([...bufferRef.current]);
  }, [prices, symbol]);

  if (!symbol) {
    return (
      <div style={{ ...styles.container, ...styles.empty }}>
        <span style={styles.emptyText}>Select a symbol to view price chart</span>
      </div>
    );
  }

  const currentPrice = prices.find((p) => p.symbol === symbol);
  const up = currentPrice ? currentPrice.changePct >= 0 : true;
  const chartColor = up ? '#00d4a0' : '#ff4d4d';
  const basePrice = history[0]?.price;

  const minY = history.length ? Math.min(...history.map((d) => d.price)) * 0.999 : 0;
  const maxY = history.length ? Math.max(...history.map((d) => d.price)) * 1.001 : 100;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <span style={styles.symbol}>{symbol}</span>
          {currentPrice && (
            <>
              <span style={{ ...styles.price, color: chartColor }}>
                ${currentPrice.price?.toFixed(2)}
              </span>
              <span style={{ ...styles.change, color: chartColor }}>
                {up ? '▲' : '▼'} {Math.abs(currentPrice.changePct)?.toFixed(2)}%
              </span>
            </>
          )}
        </div>
        <span style={styles.label}>PRICE HISTORY (INTRADAY)</span>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading chart...</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={history} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColor} stopOpacity={0.25} />
                <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 9, fill: '#4a5568' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minY, maxY]}
              tick={{ fontSize: 9, fill: '#4a5568' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v.toFixed(0)}`}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            {basePrice && (
              <ReferenceLine y={basePrice} stroke="#2d3748" strokeDasharray="4 4" />
            )}
            <Area
              type="monotone"
              dataKey="price"
              stroke={chartColor}
              strokeWidth={1.5}
              fill="url(#chartGrad)"
              dot={false}
              activeDot={{ r: 3, fill: chartColor }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0d1117',
      border: '1px solid #2d3748',
      borderRadius: 4,
      padding: '6px 10px',
      fontSize: 11,
    }}>
      <div style={{ color: '#6c7a8d', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700, color: '#e0e6f0' }}>
        ${payload[0].value?.toFixed(2)}
      </div>
    </div>
  );
}

const styles = {
  container: {
    background: '#0d1117',
    border: '1px solid #1e2a3a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 280,
  },
  emptyText: { color: '#4a5568', fontSize: 13 },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #1e2a3a',
  },
  titleGroup: { display: 'flex', alignItems: 'baseline', gap: 10 },
  symbol: { fontSize: 16, fontWeight: 800, color: '#e8edf5', letterSpacing: 1 },
  price: { fontSize: 20, fontWeight: 700, fontFamily: 'monospace' },
  change: { fontSize: 13, fontWeight: 600 },
  label: { fontSize: 9, letterSpacing: 2, color: '#4a5568' },
  loading: { height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5568', fontSize: 12 },
};
