/**
 * error-logger.js — Captura global de errores JS y errores de BD
 * Se carga PRIMERO en index.html para capturar errores desde el inicio.
 * Guarda en taq_errores (Supabase) para análisis remoto.
 */
const ErrorLogger = {

  // Cola local por si Supabase no está listo aún
  _queue: [],
  _sending: false,

  _send(record) {
    // Encolar siempre — despachar cuando SB esté listo
    this._queue.push(record);
    this._flush();
  },

  async _flush() {
    if (this._sending || !this._queue.length) return;
    // Esperar a que SB.url exista (puede que error-logger se cargue antes)
    if (typeof SB === 'undefined' || !SB.url) {
      setTimeout(() => this._flush(), 1000);
      return;
    }
    this._sending = true;

    while (this._queue.length) {
      const rec = this._queue.shift();
      try {
        // Llama la función RPC que hace dedup automático (agrupa repetidos)
        await fetch(`${SB.url}/rest/v1/rpc/registrar_error`, {
          method: 'POST',
          headers: {
            apikey: SB.anon,
            Authorization: 'Bearer ' + SB.anon,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            p_negocio_id: rec.negocio_id,
            p_usuario_id: rec.usuario_id,
            p_vista:      rec.vista,
            p_tipo:       rec.tipo,
            p_mensaje:    rec.mensaje,
            p_stack:      rec.stack,
            p_extra:      rec.extra,
            p_url:        rec.url,
            p_user_agent: rec.user_agent
          })
        });
      } catch (_) {
        // Sin red — se pierde, no reintentar
      }
    }
    this._sending = false;
  },

  _record(tipo, mensaje, stack, extra) {
    return {
      negocio_id:  (typeof SB !== 'undefined' ? SB.negocioId : null) || null,
      usuario_id:  (typeof Auth !== 'undefined' ? Auth.user?.id : null) || null,
      vista:       location.hash || location.pathname,
      tipo,
      mensaje:     String(mensaje || '').slice(0, 2000),
      stack:       String(stack || '').slice(0, 5000),
      extra:       extra || null,
      url:         location.href.slice(0, 500),
      user_agent:  navigator.userAgent.slice(0, 300)
    };
  },

  // Captura manual desde cualquier parte del código
  capture(error, contexto) {
    const msg = error?.message || String(error);
    const stack = error?.stack || '';
    console.error('[ErrorLogger]', contexto, msg);
    this._send(this._record('manual', `${contexto}: ${msg}`, stack, { contexto }));
  },

  // Error de BD (llamado desde SB.get cuando hay 400/500)
  dbError(tabla, query, status, mensaje) {
    if (status === 400 || status >= 500) {
      this._send(this._record('db',
        `${tabla} → ${status}: ${mensaje}`,
        null,
        { tabla, query: String(query || '').slice(0, 500), status }
      ));
    }
  },

  // Inicializar capturadores globales
  init() {
    // Errores JS síncronos
    window.onerror = (msg, src, line, col, error) => {
      this._send(this._record('js', msg, error?.stack, { src, line, col }));
      return false; // no suprimir el error en consola
    };

    // Promesas rechazadas sin catch
    window.addEventListener('unhandledrejection', (e) => {
      const msg = e.reason?.message || String(e.reason);
      const stack = e.reason?.stack || '';
      this._send(this._record('promise', msg, stack, null));
    });

    // Errores de carga de recursos (imágenes, scripts, etc.)
    window.addEventListener('error', (e) => {
      if (e.target && e.target !== window) {
        const src = e.target.src || e.target.href || '';
        if (src) {
          this._send(this._record('resource', `No se pudo cargar: ${src}`, null, { tag: e.target.tagName }));
        }
      }
    }, true);
  }
};

// Iniciar capturadores inmediatamente
ErrorLogger.init();
