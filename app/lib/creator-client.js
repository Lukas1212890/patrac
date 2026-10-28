'use client';
import { createAuthClient } from 'better-auth/client';
import { apiUrl } from './apiUrl.mjs';
const STORAGE = 'patrac-account-session-v2';
let pending;
function storedToken() { try { return localStorage.getItem(STORAGE) || ''; } catch { return ''; } }
export function notifyAccount() { window.dispatchEvent(new Event('patrac-account-change')); }
export function clearAccount() { localStorage.removeItem(STORAGE); notifyAccount(); }
export function creatorClient() {
  if (!pending) pending = fetch(apiUrl('/api/account/config'), { cache: 'no-store' }).then(async response => {
    const config = await response.json();
    if (!response.ok) throw Error(config.error || 'Přihlašování není dostupné.');
    const client = createAuthClient({ baseURL: apiUrl('/api/auth'), fetchOptions: {
      credentials: 'omit', auth: { type: 'Bearer', token: storedToken },
      onSuccess: ({ response }) => { const token = response.headers.get('set-auth-token'); if (token && token !== storedToken()) { localStorage.setItem(STORAGE, token); notifyAccount(); } },
    } });
    return { client, registrationReady: config.registrationReady };
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}
export async function creatorAccessToken() { return storedToken() || null; }
export async function creatorRequest(data) {
  const access = await creatorAccessToken();
  const response = await fetch(apiUrl('/api/account'), { method: data ? 'POST' : 'GET', cache: 'no-store', headers: { ...(access ? { 'X-Patrac-Account': access } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await response.json(); if (!response.ok) throw Error(result.error || 'Profil se nepodařilo načíst.'); return result;
}
