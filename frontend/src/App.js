import React, { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import Header from './components/Header';
import StockTicker from './components/StockTicker';
import StockGrid from './components/StockGrid';
import PriceChart from './components/PriceChart';
import NewsFeed from './components/NewsFeed';
import TrendingPanel from './components/TrendingPanel';
import AnalyticsPanel from './components/AnalyticsPanel';

export default function App() {
  const { prices, news, summary, connected, lastUpdate } = useWebSocket();
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard | analytics

  return (
    <div style={styles.app}>
      <Header connected={connected} lastUpdate={lastUpdate} summary={summary} />
      <StockTicker prices={prices} />

      {/* Tab bar */}
      <div style={styles.tabBar}>
        <Tab label="DASHBOARD" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <Tab label="ANALYTICS" active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} />
        <div style={styles.tabSpacer} />
        {selectedSymbol && (
          <button style={styles.clearBtn} onClick={() => setSelectedSymbol(null)}>
            Clear selection: {selectedSymbol} ×
          </button>
        )}
      </div>

      {activeTab === 'dashboard' && (
        <div style={styles.grid}>
          {/* Left column: stock table */}
          <div style={styles.colLeft}>
            <StockGrid
              prices={prices}
              selectedSymbol={selectedSymbol}
              onSelectSymbol={setSelectedSymbol}
            />
          </div>

          {/* Center column: chart + news */}
          <div style={styles.colCenter}>
            <PriceChart symbol={selectedSymbol} prices={prices} />
            <NewsFeed news={news} />
          </div>

          {/* Right column: trending + sentiment */}
          <div style={styles.colRight}>
            <TrendingPanel onSelectSymbol={setSelectedSymbol} />
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div style={styles.analyticsView}>
          <AnalyticsPanel />
        </div>
      )}

      <footer style={styles.footer}>
        <span>Bloomberg Financial Data Pipeline Dashboard &nbsp;|&nbsp; React · Node.js · Kafka · Redis · Cassandra · Spark · Airflow · S3</span>
      </footer>
    </div>
  );
}

function Tab({ label, active, onClick }) {
  return (
    <button
      style={{
        ...styles.tab,
        color: active ? '#f0a500' : '#4a5568',
        borderBottom: active ? '2px solid #f0a500' : '2px solid transparent',
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

const styles = {
  app: {
    minHeight: '100vh',
    background: '#0a0e1a',
    display: 'flex',
    flexDirection: 'column',
  },
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    borderBottom: '1px solid #1e2a3a',
    background: '#0d1117',
    gap: 0,
  },
  tab: {
    background: 'none',
    border: 'none',
    padding: '10px 16px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 0.15s',
  },
  tabSpacer: { flex: 1 },
  clearBtn: {
    background: '#1a2235',
    border: '1px solid #2d3748',
    color: '#f0a500',
    padding: '4px 10px',
    borderRadius: 3,
    fontSize: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: 1,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '380px 1fr 260px',
    gap: 12,
    padding: 12,
    flex: 1,
    alignItems: 'start',
  },
  colLeft: { display: 'flex', flexDirection: 'column', gap: 12 },
  colCenter: { display: 'flex', flexDirection: 'column', gap: 12 },
  colRight: { display: 'flex', flexDirection: 'column', gap: 12 },
  analyticsView: { padding: 12, maxWidth: 900, margin: '0 auto', width: '100%' },
  footer: {
    padding: '8px 20px',
    borderTop: '1px solid #1e2a3a',
    fontSize: 9,
    color: '#2d3748',
    letterSpacing: 1,
    textAlign: 'center',
  },
};
