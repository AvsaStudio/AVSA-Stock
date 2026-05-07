import React from 'react';

export default function NewsFeed({ news }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>NEWS FEED</span>
        <span style={styles.count}>{news.length} articles</span>
      </div>
      <div style={styles.list}>
        {news.length === 0 && (
          <div style={styles.empty}>Loading news...</div>
        )}
        {news.map((item) => (
          <NewsItem key={item.id || item.timestamp} item={item} />
        ))}
      </div>
    </div>
  );
}

function NewsItem({ item }) {
  const sentimentColor = {
    positive: '#00d4a0',
    negative: '#ff4d4d',
    neutral: '#6c8ebf',
  }[item.sentiment] || '#6c7a8d';

  const sentimentIcon = {
    positive: '▲',
    negative: '▼',
    neutral: '●',
  }[item.sentiment] || '●';

  const timeStr = item.timestamp
    ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div style={styles.item}>
      <div style={styles.itemTop}>
        <span style={styles.symbolBadge}>{item.symbol}</span>
        <span style={{ ...styles.sentiment, color: sentimentColor }}>
          {sentimentIcon} {item.sentiment}
        </span>
        <span style={styles.source}>{item.source}</span>
        <span style={styles.time}>{timeStr}</span>
      </div>
      <p style={styles.headline}>{item.headline}</p>
      <div style={styles.scoreBar}>
        <span style={styles.scoreLabel}>Sentiment score</span>
        <div style={styles.barTrack}>
          <div
            style={{
              ...styles.barFill,
              width: `${Math.abs(item.score) * 100}%`,
              background: sentimentColor,
              marginLeft: item.score < 0 ? 'auto' : 0,
            }}
          />
        </div>
        <span style={{ ...styles.scoreVal, color: sentimentColor }}>
          {item.score > 0 ? '+' : ''}{item.score?.toFixed(2)}
        </span>
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
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 480,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #1e2a3a',
    flexShrink: 0,
  },
  title: { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#f0a500' },
  count: { fontSize: 10, color: '#6c7a8d' },
  list: { overflowY: 'auto', flex: 1 },
  empty: { padding: 20, color: '#4a5568', fontSize: 12, textAlign: 'center' },
  item: {
    padding: '10px 14px',
    borderBottom: '1px solid #0f1622',
  },
  itemTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 },
  symbolBadge: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1,
    color: '#f0a500',
    background: '#1a1f2e',
    padding: '1px 5px',
    borderRadius: 2,
  },
  sentiment: { fontSize: 10, fontWeight: 600, letterSpacing: 1 },
  source: { fontSize: 10, color: '#4a5568', marginLeft: 'auto' },
  time: { fontSize: 10, color: '#4a5568', fontFamily: 'monospace' },
  headline: { fontSize: 12, color: '#c9d6e3', lineHeight: 1.5, marginBottom: 6 },
  scoreBar: { display: 'flex', alignItems: 'center', gap: 8 },
  scoreLabel: { fontSize: 9, color: '#4a5568', whiteSpace: 'nowrap' },
  barTrack: {
    flex: 1,
    height: 3,
    background: '#1a2235',
    borderRadius: 2,
    overflow: 'hidden',
    display: 'flex',
  },
  barFill: { height: '100%', borderRadius: 2, transition: 'width 0.3s' },
  scoreVal: { fontSize: 10, fontFamily: 'monospace', whiteSpace: 'nowrap' },
};
