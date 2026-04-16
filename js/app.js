/**
 * app.js — Router SPA y lógica principal
 * Multi-tenant: carga negocio por slug, nav dinámico por permisos del rol
 */

const App = {
  currentView: null,
  menuData: { categorias: [], productos: [] },

  // Todas las vistas posibles con su config de nav
  vistas: {
    pedidos:   { icon: '📋', label: 'Pedidos' },
    nuevo:     { icon: '➕', label: 'Nuevo' },
    cocina:    { icon: '🔥', label: 'Cocina' },
    tareas:    { icon: '📋', label: 'Tareas' },
    cobrar:    { icon: '💰', label: 'Cobrar', hideNav: true },
    corte:     { icon: '📊', label: 'Corte' },
    inventario:{ icon: '📦', label: 'Inventario' },
    menu:      { icon: '🍽️', label: 'Menú' },
    equipo:    { icon: '👥', label: 'Equipo' },
    negocio:   { icon: '⚙️', label: 'Config' },
    auditoria: { icon: '🔍', label: 'Auditoría' },
    desempeno: { icon: '📈', label: 'Desempeño' },
    horarios:  { icon: '📅', label: 'Horarios' }
  },

  async init() {
    try {
    // 1. Resolver negocio por slug de la URL
    if (!Auth.negocio) {
      const slug = this.getSlugFromUrl();
      if (slug) {
        const negocio = await SB.loadNegocio(slug);
        if (negocio) {
          Auth.setNegocio(negocio);
        } else {
          document.getElementById('main').innerHTML = `
            <div class="login-screen">
              <div class="login-card">
                <div class="login-logo">❌</div>
                <h1 class="login-title">Negocio no encontrado</h1>
                <p class="login-sub">Verifica la URL</p>
              </div>
            </div>`;
          return;
        }
      } else {
        // Sin slug en URL, usar default para desarrollo
        const negocio = await SB.loadNegocio('tacos-cruz');
        if (negocio) Auth.setNegocio(negocio);
      }
    }

    Auth.init();

    // Personalizar título con nombre del negocio
    document.title = Auth.negocio?.nombre || 'Punto de Venta';

    // 2. Si no hay sesión, mostrar login
    if (!Auth.isLoggedIn()) {
      document.getElementById('bottomNav').style.display = 'none';
      document.querySelector('.top-bar')?.remove();
      Auth.renderLogin(document.getElementById('main'));
      return;
    }

    // 3. Mostrar nav y top bar
    document.getElementById('bottomNav').style.display = '';
    this.renderTopBar();
    this.renderNav();

    await this.loadMenu();
    this.requestNotifPermission();
    this.startSolicitudesWatch();
    this.startOrdenListaWatch();
    this.startProgramadosWatch();
    window.removeEventListener('hashchange', this._routeHandler);
    this._routeHandler = () => this.route();
    window.addEventListener('hashchange', this._routeHandler);
    this.route();
    } catch (e) {
      ErrorLogger?.capture(e, 'App.init');
      // En cualquier error de arranque, mostrar login limpio
      document.getElementById('bottomNav').style.display = 'none';
      document.querySelector('.top-bar')?.remove();
      const main = document.getElementById('main');
      if (main) {
        if (Auth.negocio) {
          Auth.renderLogin(main);
        } else {
          main.innerHTML = `<div class="login-screen"><div class="login-card"><div class="login-logo">⚠️</div><h1 class="login-title">Error al cargar</h1><p class="login-sub">Verifica tu conexión e intenta de nuevo</p><button class="btn btn-primary" onclick="location.reload()">Reintentar</button></div></div>`;
        }
      }
    }
  },

  // ── NOTIFICACIONES DEL SISTEMA ──

  async requestNotifPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      // Pedir permiso después de una interacción del usuario (se llama desde init post-login)
      await Notification.requestPermission();
    }
  },

  async showNotif(titulo, cuerpo, tag) {
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(titulo, {
        body: cuerpo,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: tag || 'taq-notif',
        renotify: true,
        vibrate: [200, 100, 200, 100, 400],
        requireInteraction: true  // No desaparece hasta que el usuario la toca
      });
    } catch (_) {
      // Fallback a notificación básica si el SW no está listo
      if (Notification.permission === 'granted') {
        new Notification(titulo, { body: cuerpo });
      }
    }
  },

  // ── ALERTA VISUAL (para ambientes ruidosos) ──

  flashAlert(tipo) {
    // Evitar múltiples flashes simultáneos
    if (document.getElementById('flashOverlay')) return;

    const colors = {
      solicitud: '#e94560',  // rojo — pedido de cliente
      cocina: '#f39c12',     // naranja — comida lista
      tarea: '#2ecc71'       // verde — tarea
    };
    const color = colors[tipo] || colors.solicitud;

    const overlay = document.createElement('div');
    overlay.id = 'flashOverlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;pointer-events:none;
      background:${color};opacity:0;
      animation:taq-flash 1.2s ease-out forwards;
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('animationend', () => overlay.remove());
  },

  // ── VIGILANCIA GLOBAL DE SOLICITUDES ──

  // ── ALERTA CUANDO ORDEN ESTÁ LISTA (cocina → mesero) ──
  _ordenListaSub: null,
  startOrdenListaWatch() {
    // Solo para roles que entregan pedidos (no cocina, sí mesero/admin)
    if (!Auth.puede('pedidos')) return;
    this._ordenListaSub && SB.unsubscribe(this._ordenListaSub);
    this._ordenListaSub = SB.subscribeN('taq_ordenes', (change) => {
      if (change?.eventType !== 'UPDATE') return;
      if (change.new?.estado !== 'lista') return;
      // Sonar y flashear — orden lista para entregar
      this.playSolicAlert();
      this.flashAlert('cocina');
      const mesa = change.new?.mesa || 'una mesa';
      this.showNotif('🍽️ Orden lista', `${mesa} — lista para entregar`, 'lista-' + change.new?.id);
      if (this.currentView !== 'pedidos') {
        this.toast('🍽️ Orden lista: ' + mesa);
      }
    });
  },

  // ── ALERTA DE PEDIDOS PROGRAMADOS PRÓXIMOS ──
  _progCheckTimer: null,
  _progAlertados: new Set(),  // IDs ya alertados para no repetir

  startProgramadosWatch() {
    if (!Auth.puede('pedidos')) return;
    clearInterval(this._progCheckTimer);
    this._progCheckTimer = setInterval(() => this._checkProgramados(), 60000);
    this._checkProgramados(); // verificar al iniciar
  },

  async _checkProgramados() {
    if (!Auth.puede('pedidos')) return;
    const ahora = new Date();
    const en30 = new Date(ahora.getTime() + 30 * 60000).toISOString();
    const cuentas = await SB.getN('taq_cuentas',
      `hora_programada=gte.${ahora.toISOString()}&hora_programada=lte.${en30}&estado=eq.abierta&select=id,nombre_cliente,hora_programada,tipo_pedido&limit=10`);

    for (const c of cuentas) {
      if (this._progAlertados.has(c.id)) continue;
      this._progAlertados.add(c.id);
      const hora = new Date(c.hora_programada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const mins = Math.round((new Date(c.hora_programada) - ahora) / 60000);
      const tipoIcon = c.tipo_pedido === 'domicilio' ? '🛵' : '🛍️';
      this.playSolicAlert();
      this.flashAlert('solicitud');
      this.showNotif(`${tipoIcon} Pedido programado`, `${c.nombre_cliente || 'Cliente'} a las ${hora} (${mins} min)`, 'prog-' + c.id);
      if (this.currentView !== 'pedidos') {
        this.toast(`${tipoIcon} Pedido para las ${hora}: ${c.nombre_cliente || 'Cliente'}`, 'warning');
      }
    }
  },

  _solicSub: null,
  startSolicitudesWatch() {
    if (!Auth.puede('pedidos')) return;
    this._solicSub && SB.unsubscribe(this._solicSub);
    this._solicSub = SB.subscribeN('taq_solicitudes', async (change) => {
      if (change?.eventType !== 'INSERT') return;
      this.playSolicAlert();
      this.flashAlert('solicitud');

      // Notificación del sistema (funciona con pantalla bloqueada en Android/iOS PWA)
      const tipoLabel = { pedido: 'Pedido nuevo', llamar_mesero: 'Llamada de mesero', pedir_cuenta: 'Solicitud de cuenta' };
      const payload = change.new || {};
      const titulo = tipoLabel[payload.tipo] || '📱 Solicitud de cliente';
      const cuerpo = payload.nombre_cliente
        ? `${payload.nombre_cliente}${payload.total ? ' — $' + parseFloat(payload.total).toFixed(0) : ''}`
        : 'Toca para ver';
      this.showNotif(titulo, cuerpo, 'solic-' + (payload.id || Date.now()));

      // Actualizar badge
      const pendientes = await SB.getN('taq_solicitudes', 'estado=eq.pendiente&select=id&limit=100');
      this.updateSolicBadge(pendientes.length);
      // Toast si no está en pedidos
      if (this.currentView !== 'pedidos') {
        this.toast('📱 Nueva solicitud de cliente', 'warning');
      }
    });
    // Badge inicial
    SB.getN('taq_solicitudes', 'estado=eq.pendiente&select=id&limit=100').then(p => this.updateSolicBadge(p.length));
  },

  // AudioContext compartido — se crea una sola vez en el primer gesto del usuario.
  // Crear uno nuevo por llamada resulta en contextos suspendidos en móvil.
  _audioCtx: null,

  _ensureAudio() {
    if (!this._audioCtx) {
      try { this._audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
    }
    // Reactivar si el navegador lo suspendió (ej. al volver de background)
    if (this._audioCtx?.state === 'suspended') {
      this._audioCtx.resume().catch(() => {});
    }
    return this._audioCtx;
  },

  playSolicAlert() {
    try {
      const ctx = this._ensureAudio();
      if (!ctx || ctx.state === 'suspended') return;
      const now = ctx.currentTime;
      [0, 0.25, 0.5].forEach(d => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 660;
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.3, now + d);
        gain.gain.exponentialRampToValueAtTime(0.001, now + d + 0.18);
        osc.start(now + d);
        osc.stop(now + d + 0.2);
      });
      if (navigator.vibrate) navigator.vibrate([100, 80, 100, 80, 200]);
    } catch (_) {}
  },

  updateSolicBadge(count) {
    const navItem = document.querySelector('.nav-item[data-view="pedidos"]');
    if (!navItem) return;
    let badge = navItem.querySelector('.nav-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        navItem.appendChild(badge);
      }
      badge.textContent = count;
    } else {
      badge?.remove();
    }
  },

  getSlugFromUrl() {
    // Soporta: /n/tacos-cruz o ?n=tacos-cruz
    const path = location.pathname;
    const match = path.match(/\/n\/([a-z0-9-]+)/);
    if (match) return match[1];
    const params = new URLSearchParams(location.search);
    return params.get('n') || null;
  },

  renderTopBar() {
    let bar = document.querySelector('.top-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'top-bar';
      document.body.prepend(bar);
    }
    const u = Auth.user;
    const rolNombre = Auth.rol?.nombre || '';
    const negocioNombre = Auth.negocio?.nombre || '';
    bar.innerHTML = `
      <span class="top-bar-negocio">${negocioNombre}</span>
      <span class="top-bar-user">${u.avatar} ${u.nombre}</span>
      <span class="top-bar-rol">${rolNombre}</span>
      <button class="btn btn-sm btn-outline top-bar-logout" onclick="App.logout()">Salir</button>
    `;
  },

  renderNav() {
    const nav = document.getElementById('bottomNav');
    const items = [];

    for (const [key, config] of Object.entries(this.vistas)) {
      if (config.hideNav) continue;
      if (!Auth.puede(key)) continue;
      items.push(`
        <a href="#${key}" class="nav-item" data-view="${key}">
          <span class="nav-icon">${config.icon}</span>
          <span>${config.label}</span>
        </a>
      `);
    }

    nav.innerHTML = items.join('');
  },

  logout() {
    Auth.logout();
    location.hash = '';
    this.init();
  },

  async loadMenu() {
    const [cats, prods] = await Promise.all([
      SB.getN('taq_categorias', 'activa=eq.true&order=orden&limit=200'),
      SB.getN('taq_productos', 'disponible=eq.true&order=orden&limit=500')
    ]);
    // Solo actualizar si llegaron datos reales — evita borrar el menú por un error de red
    if (cats.length)  this.menuData.categorias = cats;
    if (prods.length) this.menuData.productos   = prods;

    // Suscribirse a cambios del menú via Realtime
    this._menuSub && SB.unsubscribe(this._menuSub);
    this._menuSub = SB.subscribeN('taq_productos', () => this.loadMenu());
  },

  route() {
    if (!Auth.isLoggedIn()) { this.init(); return; }

    const hash = location.hash.slice(1) || this.defaultView();
    const [view, ...params] = hash.split('/');

    // Verificar permisos
    if (!Auth.puede(view)) {
      location.hash = this.defaultView();
      return;
    }

    // Marcar nav activo
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.view === view);
    });

    const main = document.getElementById('main');
    this.currentView = view;

    switch (view) {
      case 'pedidos':   Pedidos.render(main); break;
      case 'nuevo':     NuevoPedido.render(main, params[0], params[1]); break;
      case 'cocina':    Cocina.render(main); break;
      case 'cobrar':    Cobrar.render(main, params[0], params[1]); break;
      case 'tareas':    Tareas.render(main); break;
      case 'corte':     Corte.render(main); break;
      case 'inventario': Inventario.render(main); break;
      case 'menu':      MenuAdmin.render(main); break;
      case 'equipo':    Equipo.render(main); break;
      case 'negocio':   NegocioAdmin.render(main); break;
      case 'auditoria': Auditoria.render(main); break;
      case 'desempeno': Desempeno.render(main); break;
      case 'horarios':  Horarios.render(main); break;
      default:          location.hash = this.defaultView();
    }
  },

  renderPlaceholder(el, titulo, icon) {
    el.innerHTML = `
      <div class="view-header"><h1>${this.esc(icon)} ${this.esc(titulo)}</h1></div>
      <div class="empty-state"><p>Próximamente</p></div>
    `;
  },

  defaultView() {
    if (Auth.puede('pedidos')) return 'pedidos';
    if (Auth.puede('cocina')) return 'cocina';
    if (Auth.puede('corte')) return 'corte';
    return 'pedidos';
  },

  toast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (type || '');
    setTimeout(() => t.className = 'toast', 2500);
  },

  // Escape de HTML para datos de usuarios no confiables (solicitudes de clientes)
  esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  // ── DINERO ──
  // Redondea a centavos antes de mostrar para evitar 59.9999... por float IEEE 754
  // Uso: App.fmt(total) → "59.00" | App.fmt(total, true) → "$59"
  fmt(amount, sinCentavos = false) {
    const n = Math.round(parseFloat(amount || 0) * 100) / 100;
    return sinCentavos ? '$' + Math.round(n) : n.toFixed(2);
  },

  // ── FECHAS CON TIMEZONE DEL NEGOCIO ──
  // Supabase está en UTC. La taquería puede estar en UTC-6 (CDMX) u otro.
  // Uso: App.hoy() → "2026-04-14" en la zona del negocio
  //      App.inicioDia(fecha) → ISO string al inicio del día en zona del negocio
  _tz() {
    return Auth.negocio?.config?.timezone || 'America/Mexico_City';
  },

  hoy() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: this._tz() });
  },

  ayer() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('sv-SE', { timeZone: this._tz() });
  },

  // Convierte la fecha y hora del timezone local en un ISO offset usando
  // formatToParts() — evita depender del formato de string del locale
  // (iOS Safari sv-SE usa ':' como separador de fracción de segundos en .format()).
  _tzOffset(fecha, tz) {
    const noonUTC = new Date(`${fecha}T12:00:00Z`);
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(noonUTC);
    const get = t => p.find(x => x.type === t)?.value?.padStart(2, '0') || '00';
    const localStr = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
    return noonUTC.getTime() - new Date(localStr + 'Z').getTime();
  },

  inicioDia(fechaStr) {
    const fecha = fechaStr || this.hoy();
    const offsetMs = this._tzOffset(fecha, this._tz());
    return new Date(new Date(`${fecha}T00:00:00Z`).getTime() + offsetMs).toISOString();
  },

  finDia(fechaStr) {
    const fecha = fechaStr || this.hoy();
    const offsetMs = this._tzOffset(fecha, this._tz());
    return new Date(new Date(`${fecha}T23:59:59Z`).getTime() + offsetMs).toISOString();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
  // Inicializar AudioContext en el primer gesto — único momento en que los
  // navegadores móviles permiten crear un contexto de audio sin suspenderlo.
  const initAudio = () => { App._ensureAudio(); };
  document.addEventListener('touchend', initAudio, { once: true, passive: true });
  document.addEventListener('click',    initAudio, { once: true, passive: true });
});
