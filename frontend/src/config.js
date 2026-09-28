export const API_URL = (process.env.REACT_APP_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
export const WS_URL = process.env.REACT_APP_WS_URL || `${API_URL.replace(/^http/, 'ws')}/ws`;
