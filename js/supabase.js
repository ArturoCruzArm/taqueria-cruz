/**
 * supabase.js — Capa de acceso a datos para Taquería Cruz
 * Usa fetch directo contra la REST API de Supabase
 */
const SB = {
  url:  'https://nzpujmlienzfetqcgsxz.supabase.co',
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56cHVqbWxpZW56ZmV0cWNnc3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODYzMzYsImV4cCI6MjA5MDI2MjMzNn0.xl3lsb-KYj5tVLKTnzpbsdEGoV9ySnswH4eyRuyEH1s',

  headers() {
    return {
      apikey: this.anon,
      Authorization: 'Bearer ' + this.anon,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    };
  },

  async get(table, query) {
    const r = await fetch(`${this.url}/rest/v1/${table}?${query || ''}`, { headers: this.headers() });
    return r.json();
  },

  async insert(table, data) {
    const r = await fetch(`${this.url}/rest/v1/${table}`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(data)
    });
    return r.json();
  },

  async update(table, query, data) {
    const r = await fetch(`${this.url}/rest/v1/${table}?${query}`, {
      method: 'PATCH', headers: this.headers(), body: JSON.stringify(data)
    });
    return r.json();
  },

  async delete(table, query) {
    await fetch(`${this.url}/rest/v1/${table}?${query}`, {
      method: 'DELETE', headers: this.headers()
    });
  },

  /** Realtime via SSE (Supabase Realtime v2) */
  subscribe(table, callback) {
    // Polling fallback — simple y confiable para este caso
    const poll = async () => {
      try { callback(await this.get(table, 'order=created_at.desc')); } catch (_) {}
    };
    poll();
    return setInterval(poll, 3000);
  },

  unsubscribe(intervalId) {
    clearInterval(intervalId);
  }
};
