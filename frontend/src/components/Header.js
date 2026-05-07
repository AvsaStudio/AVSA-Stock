import React from 'react';

export default function Header({ connected, lastUpdate, summary }) {
  const now = lastUpdate ? lastUpdate.toLocaleTimeString() : '--:--:--';

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <span style={styles.logo}>▐ BLOOMBERG</span>
        <span style={styles.subtitle}>Financial Data Pipeline Dashboard</span>
      </div>

      <div style={styles.center}>
        {summary && (
          <>
            <Pill
              label="Market"
              value={summary.marketSentiment?.toUpperCase()}
              color={summary.marketSentiment === 'bullish' ? '#00d4a0' : '#ff4d4d'}
            />
            <Pill label="Gainers" value={summary.gainers} color="#00d4a0" />
            <Pill label="Losers" value={summary.losers} color="#ff4d4d" />
            <Pill label="Symbols" value={summary.totalSymbolsTracked} color="#6c8ebf" />
          </>
        )}
      </div>

      <div style={styles.right}>
        <span style={{ ...styles.dot, background: connected ? '#00d4a0' : '#ff4d4d' }} />
        <span style={styles.status}>{connected ? 'LIVE' : 'POLLING'}</span>
        <span style={styles.time}>{now}</span>
      </div>
    </header>
  );
}

function Pill({ label, value, color }) {
  return (
    <div style={styles.pill}>
      <span style={styles.pillLabel}>{label}</span>
      <span style={{ ...styles.pillValue, color }}>{value}</span>
    </div>
  );
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    background: '#0d1117',
    borderBottom: '1px solid #1e2a3a',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  left: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    color: '#f0a500',
    letterSpacing: 2,
  },
  subtitle: { fontSize: 11, color: '#6c7a8d', letterSpacing: 1 },
  center: { display: 'flex', gap: 16 },
  pill: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
  },
  pillLabel: { fontSize: 9, color: '#6c7a8d', letterSpacing: 1 },
  pillValue: { fontSize: 13, fontWeight: 700 },
  right: { display: 'flex', alignItems: 'center', gap: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
  },
  status: { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#8b9ab0' },
  time: { fontSize: 12, color: '#6c7a8d', fontFamily: 'monospace' },
};
