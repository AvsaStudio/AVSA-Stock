import React, { useState, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export default function TrendingPanel({ onSelectSymbol }) {
  const [trending, setTrending] = useState([]);
  const [sentiment, setSentiment] = useState(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [trendRes, sentRes] = await Promise.all([
          fetch(`${API_URL}/api/stocks/trending`),
          fetch(`${API_URL}/api/analytics/sentiment`),
        ]);
        const [td, sd] = await Promise.all([trendRes.json(), sentRes.json()]);
        if (td.success) setTrending(td.data);
        if (sd.success) setSentiment(sd.data);
      } catch {}
    };

    fetchAll();
    const iv = setInterval(fetchAll, 15000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={styles.container}>
      {/* Trending Symbols */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.title}>TRENDING</span>
        </div>
        {trending.map((t, i) => (
          <div
            key={t.symbol}
            style={styles.trendRow}
            onClick={() => onSelectSymbol(t.symbol)}
          >
            <span style={styles.rank}>#{i + 1}</span>
            <div style={styles.trendInfo}>
              <span style={styles.trendSymbol}>{t.symbol}</span>
              <span style={styles.trendName}>{t.name?.split(' ')[0]}</span>
            </div>
            <div style={styles.trendRight}>
              <span style={styles.trendPrice}>${t.price?.toFixed(2)}</span>
              <span style={styles.trendVol}>{(t.volume / 1e6).toFixed(1)}M vol</span>
            </div>
          </div>
        ))}
      </div>

      {/* Sentiment Overview */}
      {sentiment && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.title}>MARKET SENTIMENT</span>
          </div>
          <div style={styles.overallBox}>
            <span style={styles.overallLabel}>Overall</span>
            <span style={{
              ...styles.overallValue,
              color: sentiment.overall > 0.1 ? '#00d4a0' : sentiment.overall < -0.1 ? '#ff4d4d' : '#6c8ebf',
            }}>
              {sentiment.overallLabel}
            </span>
            <span style={styles.overallScore}>
              score: {sentiment.overall > 0 ? '+' : ''}{sentiment.overall?.toFixed(3)}
            </span>
          </div>

          <div style={styles.sentimentList}>
            {Object.values(sentiment.bySymbol || {}).slice(0, 8).map((s) => (
              <div key={s.symbol} style={styles.sentimentRow}>
                <span style={styles.sentSymbol}>{s.symbol}</span>
                <div style={styles.sentBarWrap}>
                  <div style={styles.sentBarTrack}>
                    <div style={{
                      ...styles.sentBarFill,
                      width: `${Math.abs(s.score) * 100}%`,
                      background: s.score > 0.1 ? '#00d4a0' : s.score < -0.1 ? '#ff4d4d' : '#6c8ebf',
                      marginLeft: s.score < 0 ? 'auto' : 0,
                    }} />
                  </div>
                </div>
                <span style={{
                  ...styles.sentScore,
                  color: s.score > 0.1 ? '#00d4a0' : s.score < -0.1 ? '#ff4d4d' : '#6c8ebf',
                }}>
                  {s.score > 0 ? '+' : ''}{s.score?.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
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
  section: { borderBottom: '1px solid #1e2a3a' },
  sectionHeader: {
    padding: '10px 14px',
    borderBottom: '1px solid #1e2a3a',
  },
  title: { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#f0a500' },
  trendRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 14px',
    borderBottom: '1px solid #0f1622',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  rank: { fontSize: 10, color: '#4a5568', width: 20, flexShrink: 0 },
  trendInfo: { flex: 1, display: 'flex', flexDirection: 'column' },
  trendSymbol: { fontSize: 13, fontWeight: 800, color: '#e8edf5', letterSpacing: 1 },
  trendName: { fontSize: 10, color: '#6c7a8d' },
  trendRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
  trendPrice: { fontSize: 12, fontWeight: 700, color: '#c9d6e3', fontFamily: 'monospace' },
  trendVol: { fontSize: 10, color: '#4a5568' },
  overallBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 14px',
    gap: 4,
    borderBottom: '1px solid #0f1622',
  },
  overallLabel: { fontSize: 9, color: '#4a5568', letterSpacing: 2 },
  overallValue: { fontSize: 18, fontWeight: 800, letterSpacing: 2 },
  overallScore: { fontSize: 10, color: '#4a5568', fontFamily: 'monospace' },
  sentimentList: { padding: '4px 0' },
  sentimentRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '5px 14px',
    gap: 8,
  },
  sentSymbol: { fontSize: 10, fontWeight: 700, color: '#8b9ab0', width: 36 },
  sentBarWrap: { flex: 1 },
  sentBarTrack: { height: 4, background: '#1a2235', borderRadius: 2, overflow: 'hidden', display: 'flex' },
  sentBarFill: { height: '100%', borderRadius: 2 },
  sentScore: { fontSize: 10, fontFamily: 'monospace', width: 36, textAlign: 'right' },
};
