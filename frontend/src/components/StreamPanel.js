import React from 'react';
import { useResource } from '../hooks/useResource';
export default function StreamPanel() {
  const { data, error, loading, retry } = useResource('/api/analytics/stream', 15000);
  return <section className="stream-panel" aria-label="Pipeline analytics">
    <h2>PIPELINE ANALYTICS</h2>
    {loading && <p>Loading pipeline analytics…</p>}
    {error && <p role="alert">{error} <button onClick={retry}>Retry</button></p>}
    {data && !data.available && <p>Waiting for finalized market windows. Averages appear after five minutes of ticks plus the lateness allowance.</p>}
    {data?.movingAverages?.map((row) => <p key={row.symbol}>{row.symbol}: 5-minute average ${row.avg_price.toFixed(2)}</p>)}
    {data?.alerts?.slice(0, 5).map((row, i) => <p key={`${row.symbol}-${row.timestamp}-${i}`}>{row.alert}</p>)}
  </section>;
}
