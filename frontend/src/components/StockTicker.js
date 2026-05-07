import React, { useRef, useEffect } from 'react';

export default function StockTicker({ prices }) {
  const tickerRef = useRef(null);

  // Auto-scroll ticker
  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    let frame;
    let pos = 0;
    const speed = 0.4;

    const animate = () => {
      pos -= speed;
      if (Math.abs(pos) >= el.scrollWidth / 2) pos = 0;
      el.style.transform = `translateX(${pos}px)`;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [prices]);

  const items = [...prices, ...prices]; // duplicate for seamless loop

  return (
    <div style={styles.wrapper}>
      <div style={styles.label}>MARKETS</div>
      <div style={styles.viewport}>
        <div ref={tickerRef} style={styles.track}>
          {items.map((p, i) => (
            <TickerItem key={`${p.symbol}-${i}`} price={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TickerItem({ price }) {
  const up = price.changePct >= 0;
  const color = up ? '#00d4a0' : '#ff4d4d';
  const arrow = up ? '▲' : '▼';

  return (
    <span style={styles.item}>
      <span style={styles.symbol}>{price.symbol}</span>
      <span style={{ ...styles.priceVal, color }}>
        ${price.price?.toFixed(2)}
      </span>
      <span style={{ ...styles.change, color }}>
        {arrow} {Math.abs(price.changePct)?.toFixed(2)}%
      </span>
      <span style={styles.divider}>|</span>
    </span>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    background: '#0d1117',
    borderBottom: '1px solid #1e2a3a',
    height: 32,
    overflow: 'hidden',
  },
  label: {
    padding: '0 12px',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 2,
    color: '#f0a500',
    borderRight: '1px solid #1e2a3a',
    whiteSpace: 'nowrap',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
  },
  viewport: { flex: 1, overflow: 'hidden', position: 'relative' },
  track: { display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' },
  item: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 8px', fontSize: 11 },
  symbol: { fontWeight: 700, color: '#c9d6e3', letterSpacing: 1 },
  priceVal: { fontWeight: 600 },
  change: { fontSize: 10 },
  divider: { color: '#2d3748', marginLeft: 4 },
};
