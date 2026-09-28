import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useWebSocket } from './useWebSocket';
import { getJson } from '../api';
jest.mock('../api', () => ({ getJson: jest.fn() }));
let container, root, sockets, state;
const originalSocket = window.WebSocket;
class FakeSocket {
  constructor() { sockets.push(this); }
  close() { this.onclose?.(); }
  message(value) { this.onmessage({ data: JSON.stringify(value) }); }
}
function Probe() { state = useWebSocket(); return <div>{state.error || state.prices.length}</div>; }
const snapshot = { prices: [{ symbol: 'AAPL', price: 100 }], news: [{ id: '1' }], summary: {}, timestamp: '2026-09-27T12:00:00Z', simulated: true };
beforeEach(() => {
  jest.useFakeTimers(); sockets = []; window.WebSocket = FakeSocket;
  getJson.mockReset().mockResolvedValue(snapshot);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); window.WebSocket = originalSocket; jest.useRealTimers(); });
test('receives snapshots without duplicate news and recovers from feed errors', async () => {
  await act(async () => { root.render(<Probe />); });
  expect(state.prices).toHaveLength(1);
  act(() => { sockets[0].onopen(); sockets[0].message({ type: 'snapshot', ...snapshot }); sockets[0].message({ type: 'snapshot', ...snapshot }); });
  expect(state.connected).toBe(true); expect(state.news).toHaveLength(1);
  act(() => sockets[0].message({ type: 'feed_error', error: 'Pipeline unavailable' }));
  expect(state.error).toBe('Pipeline unavailable'); expect(state.prices).toHaveLength(1);
  act(() => sockets[0].message({ type: 'snapshot', ...snapshot })); expect(state.error).toBeNull();
});
test('polls on disconnect, reconnects once and cancels reconnect on unmount', async () => {
  await act(async () => root.render(<Probe />));
  act(() => { sockets[0].onopen(); sockets[0].message({ type: 'snapshot', ...snapshot }); });
  await act(async () => sockets[0].close()); expect(state.connected).toBe(false);
  await act(async () => jest.advanceTimersByTime(5000)); expect(sockets).toHaveLength(2);
  act(() => sockets[1].close()); act(() => root.unmount()); root = { unmount() {} };
  await act(async () => jest.advanceTimersByTime(10000)); expect(sockets).toHaveLength(2);
});
