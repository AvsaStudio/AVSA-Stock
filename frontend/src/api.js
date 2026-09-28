import { API_URL } from './config';
export async function getJson(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error || 'Request failed. Please try again.');
  return body.data;
}
