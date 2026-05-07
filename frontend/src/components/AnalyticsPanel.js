import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export default function AnalyticsPanel() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/analytics/daily`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setReport(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ ...styles.container, ...styles.center }}>
        <span style={styles.loading}>Generating daily report...</span>
      </div>
    );
  }

  if (!report) return null;

  const chartData = report.symbolAnalytics?.map((s) => ({
    symbol: s.symbol,
    change: parseFloat(((s.close - s.open) / s.open * 100).toFixed(2)),
  }));

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>DAILY ANALYTICS</span>
        <span style={styles.date}>{report.date}</span>
      </div>

      {/* Market summary pills */}
      {report.marketSummary && (
        <div style={styles.pills}>
          <Stat label="Gainers" value={report.marketSummary.gainers} color="#00d4a0" />
          <Stat label="Losers" value={report.marketSummary.losers} color="#ff4d4d" />
          <Stat label="Sentiment" value={report.marketSummary.marketSentiment?.toUpperCase()} color="#f0a500" />
          <Stat label="Top Gainer" value={report.marketSummary.topGainer} color="#00d4a0" />
          <Stat label="Top Loser" value={report.marketSummary.topLoser} color="#ff4d4d" />
        </div>
      )}

      {/* Daily % change chart */}
      <div style={styles.chartWrap}>
        <div style={styles.chartLabel}>DAILY % CHANGE BY SYMBOL</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <XAxis dataKey="symbol" tick={{ fontSize: 9, fill: '#4a5568' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: '#4a5568' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              formatter={(v) => [`${v > 0 ? '+' : ''}${v}%`, 'Change']}
              contentStyle={{ background: '#0d1117', border: '1px solid #2d3748', fontSize: 11 }}
            />
            <Bar dataKey="change" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {chartData?.map((entry, i) => (
                <Cell key={i} fill={entry.change >= 0 ? '#00d4a0' : '#ff4d4d'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top headlines */}
      <div style={styles.headlines}>
        <div style={styles.hlHeader}>TOP HEADLINES TODAY</div>
        {report.topHeadlines?.map((h, i) => (
          <div key={i} style={styles.headline}>
            <span style={styles.hlNum}>{i + 1}</span>
            <span style={styles.hlText}>{h}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={styles.stat}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{ ...styles.statValue, color }}>{value}</span>
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
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  loading: { color: '#4a5568', fontSize: 12 },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #1e2a3a',
  },
  title: { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#f0a500' },
  date: { fontSize: 10, color: '#6c7a8d', fontFamily: 'monospace' },
  pills: {
    display: 'flex',
    gap: 0,
    borderBottom: '1px solid #1e2a3a',
  },
  stat: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '10px 8px',
    borderRight: '1px solid #1e2a3a',
    gap: 3,
  },
  statLabel: { fontSize: 9, color: '#4a5568', letterSpacing: 1 },
  statValue: { fontSize: 13, fontWeight: 700 },
  chartWrap: { padding: '10px 14px', borderBottom: '1px solid #1e2a3a' },
  chartLabel: { fontSize: 9, color: '#4a5568', letterSpacing: 1, marginBottom: 6 },
  headlines: {},
  hlHeader: { padding: '8px 14px', fontSize: 9, color: '#4a5568', letterSpacing: 1, borderBottom: '1px solid #0f1622' },
  headline: {
    display: 'flex',
    gap: 8,
    padding: '7px 14px',
    borderBottom: '1px solid #0a0e1a',
    alignItems: 'flex-start',
  },
  hlNum: { fontSize: 10, color: '#4a5568', flexShrink: 0 },
  hlText: { fontSize: 11, color: '#8b9ab0', lineHeight: 1.4 },
};
