import React, { useState } from 'react';

export default function StockGrid({ prices, onSelectSymbol, selectedSymbol }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>EQUITIES</span>
        <span style={styles.count}>{prices.length} symbols</span>
      </div>
      <table style={styles.table}>
        <thead>
          <tr style={styles.thead}>
            {['Symbol', 'Name', 'Price', 'Change', 'Chg %', 'Volume'].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {prices.map((p) => (
            <StockRow
              key={p.symbol}
              price={p}
              selected={selectedSymbol === p.symbol}
              onClick={() => onSelectSymbol(p.symbol === selectedSymbol ? null : p.symbol)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StockRow({ price, selected, onClick }) {
  const up = price.changePct >= 0;
  const color = up ? '#00d4a0' : '#ff4d4d';

  return (
    <tr
      style={{
        ...styles.row,
        background: selected ? '#161e2e' : 'transparent',
        borderLeft: selected ? '2px solid #f0a500' : '2px solid transparent',
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      <td style={styles.td}>
        <span style={styles.symbolBadge}>{price.symbol}</span>
      </td>
      <td style={{ ...styles.td, color: '#8b9ab0', fontSize: 11 }}>
        {price.name?.split(' ').slice(0, 2).join(' ')}
      </td>
      <td style={{ ...styles.td, fontWeight: 700, fontFamily: 'monospace' }}>
        ${price.price?.toFixed(2)}
      </td>
      <td style={{ ...styles.td, color, fontFamily: 'monospace' }}>
        {up ? '+' : ''}{price.change?.toFixed(2)}
      </td>
      <td style={{ ...styles.td, color, fontWeight: 700, fontFamily: 'monospace' }}>
        {up ? '▲' : '▼'} {Math.abs(price.changePct)?.toFixed(2)}%
      </td>
      <td style={{ ...styles.td, color: '#6c7a8d', fontFamily: 'monospace', fontSize: 11 }}>
        {price.volume ? (price.volume / 1e6).toFixed(1) + 'M' : '--'}
      </td>
    </tr>
  );
}

const styles = {
  container: {
    background: '#0d1117',
    border: '1px solid #1e2a3a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #1e2a3a',
  },
  title: { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#f0a500' },
  count: { fontSize: 10, color: '#6c7a8d' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { borderBottom: '1px solid #1e2a3a' },
  th: {
    padding: '8px 14px',
    textAlign: 'left',
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 1,
    color: '#6c7a8d',
  },
  row: {
    borderBottom: '1px solid #0f1622',
    transition: 'background 0.15s',
  },
  td: { padding: '9px 14px', fontSize: 13, color: '#c9d6e3' },
  symbolBadge: {
    fontWeight: 800,
    letterSpacing: 1,
    fontSize: 12,
    color: '#e8edf5',
  },
};
