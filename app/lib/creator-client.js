'use client';
import { apiUrl } from './apiUrl.mjs';

import { createClient } from '@supabase/supabase-js';
let pending;
export function creatorClient() {
  if (!pending) pending = fetch(apiUrl('/api/account/config'), { cache: 'no-store' }).then(async response => {
    const config = await response.json();
    if (!response.ok) throw Error(config.error || 'Přihlašování není dostupné.');
    return { client: createClient(config.url, config.key, { auth: { storageKey: 'patrac-creator-auth-v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } }), registrationReady: config.registrationReady };
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}
export async function creatorAccessToken() {
  if (!pending) return null;
  try {
    const { client } = await pending;
    const { data, error } = await client.auth.getSession();
    if (error) return null;
    return data.session?.access_token || null;
  } catch { return null; }
}
export async function creatorRequest(data) {
  const access = await creatorAccessToken();
  const response = await fetch(apiUrl('/api/account'), { method: data ? 'POST' : 'GET', cache: 'no-store', headers: { ...(access ? { 'X-Patrac-Account': access } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await response.json(); if (!response.ok) throw Error(result.error || 'Profil se nepodařilo načíst.'); return result;
}
