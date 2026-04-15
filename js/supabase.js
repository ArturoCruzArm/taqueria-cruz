/**
 * supabase.js — Capa de acceso a datos para Taquería Cruz
 * Usa fetch para REST + WebSocket para Realtime (no polling)
 */
const SB = {
  url:  'https://nzpujmlienzfetqcgsxz.supabase.co',
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56cHVqbWxpZW56ZmV0cWNnc3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODYzMzYsImV4cCI6MjA5MDI2MjMzNn0.xl3lsb-KYj5tVLKTnzpbsdEGoV9ySnswH4eyRuyEH1s',

  // Negocio actual (se establece al cargar la app)
  negocioId: null,

  headers() {
    return {
      apikey: this.anon,
      Authorization: 'Bearer ' + this.anon,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    };
  },

  // --- REST API ---

  async get(table, query) {
    try {
      const r = await fetch(`${this.url}/rest/v1/${table}?${query || ''}`, { headers: this.headers() });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        ErrorLogger?.dbError(table, query, r.status, err.message);
        return [];
      }
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      ErrorLogger?.dbError(table, query, 0, e.message);
      return [];
    }
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

  async deleteN(table, query) {
    return this.delete(table, this.nq(query));
  },

  // --- Helpers con negocio_id ---

  nq(extra) {
    // Construye query con negocio_id como filtro base
    const base = `negocio_id=eq.${this.negocioId}`;
    return extra ? `${base}&${extra}` : base;
  },

  async getN(table, query) {
    return this.get(table, this.nq(query));
  },

  async insertN(table, data) {
    // Inyecta negocio_id automáticamente
    if (Array.isArray(data)) {
      data = data.map(d => ({ ...d, negocio_id: this.negocioId }));
    } else {
      data = { ...data, negocio_id: this.negocioId };
    }
    return this.insert(table, data);
  },

  // --- REALTIME (WebSocket) ---

  _ws: null,
  _channels: {},
  _channelCounter: 0,
  _heartbeatTimer: null,
  _ref: 0,

  _nextRef() {
    return String(++this._ref);
  },

  _connectWs() {
    if (this._ws && this._ws.readyState <= 1) return; // CONNECTING or OPEN

    const wsUrl = this.url.replace('https://', 'wss://') +
      '/realtime/v1/websocket?apikey=' + this.anon + '&vsn=1.0.0';

    this._ws = new WebSocket(wsUrl);

    this._ws.onopen = () => {
      // Re-suscribir canales existentes
      Object.values(this._channels).forEach(ch => this._joinChannel(ch));
      // Heartbeat cada 30s para mantener conexión viva
      this._heartbeatTimer = setInterval(() => {
        this._wsSend({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: this._nextRef() });
      }, 30000);
    };

    this._ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const ch = this._channels[msg.topic];
        if (ch && msg.event === 'postgres_changes') {
          const payload = msg.payload;
          if (ch.callback) ch.callback(payload);
        }
      } catch (_) {}
    };

    this._ws.onclose = () => {
      clearInterval(this._heartbeatTimer);
      // Reconectar después de 2 segundos
      setTimeout(() => this._connectWs(), 2000);
    };

    this._ws.onerror = () => {
      this._ws.close();
    };
  },

  _wsSend(msg) {
    if (this._ws && this._ws.readyState === 1) {
      this._ws.send(JSON.stringify(msg));
    }
  },

  _joinChannel(ch) {
    this._wsSend({
      topic: ch.topic,
      event: 'phx_join',
      payload: {
        config: {
          broadcast: { self: false },
          postgres_changes: ch.pgChanges
        }
      },
      ref: this._nextRef()
    });
  },

  /**
   * Suscribirse a cambios en una tabla via Realtime
   * @param {string} table - nombre de la tabla
   * @param {function} callback - recibe { eventType, new, old, ... }
   * @param {string} filter - filtro opcional (ej: 'negocio_id=eq.xxx')
   * @returns {string} channelId para desuscribirse
   */
  subscribe(table, callback, filter) {
    this._connectWs();

    const id = ++this._channelCounter;
    const topic = `realtime:taq-${table}-${id}`;

    const pgChange = {
      event: '*',
      schema: 'public',
      table: table
    };
    if (filter) pgChange.filter = filter;

    const ch = {
      id,
      topic,
      pgChanges: [pgChange],
      callback
    };

    this._channels[topic] = ch;

    // Si ya está conectado, unirse ahora
    if (this._ws && this._ws.readyState === 1) {
      this._joinChannel(ch);
    }

    return topic;
  },

  unsubscribe(topic) {
    if (this._channels[topic]) {
      this._wsSend({
        topic: topic,
        event: 'phx_leave',
        payload: {},
        ref: this._nextRef()
      });
      delete this._channels[topic];
    }

    // Si no quedan canales, cerrar WS
    if (Object.keys(this._channels).length === 0 && this._ws) {
      this._ws.close();
      this._ws = null;
    }
  },

  /**
   * Helper: suscribirse a tabla filtrada por negocio_id actual
   */
  subscribeN(table, callback) {
    return this.subscribe(table, callback, `negocio_id=eq.${this.negocioId}`);
  },

  // --- Llamadas a funciones Postgres (RPC) ---

  async rpc(fn, params = {}) {
    const r = await fetch(`${this.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(params)
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.message || `RPC ${fn} falló: ${r.status}`);
    }
    return r.json();
  },

  // --- Cargar negocio por slug ---

  async loadNegocio(slug) {
    const res = await this.get('taq_negocios', `slug=eq.${slug}&activo=eq.true&limit=1`);
    if (res.length) {
      this.negocioId = res[0].id;
      return res[0];
    }
    return null;
  }
};
