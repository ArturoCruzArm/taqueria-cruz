/**
 * auth.js — Login por PIN, sesión y permisos dinámicos
 *
 * Los permisos vienen de taq_roles en la base de datos.
 * Cada negocio configura sus propios roles y permisos.
 */
const Auth = {
  user: null,
  rol: null,    // { id, nombre, permisos: [...], es_admin }
  negocio: null, // { id, nombre, slug, ... }

  SESSION_TTL_MS: 12 * 60 * 60 * 1000,  // 12 horas = un turno largo

  init() {
    const saved = localStorage.getItem('taq_user');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Sesión expirada O sin loginAt (versión antigua) → forzar re-login
        if (!data.loginAt || Date.now() - data.loginAt > this.SESSION_TTL_MS) {
          localStorage.removeItem('taq_user');
          return;
        }
        this.user = data.user;
        this.rol = data.rol;
        this.negocio = data.negocio;
        if (this.negocio) SB.negocioId = this.negocio.id;
      } catch (_) {
        this.user = null;
        this.rol = null;
        this.negocio = null;
      }
    }
  },

  isLoggedIn() {
    return !!this.user && !!this.negocio;
  },

  puede(vista) {
    if (!this.rol) return false;
    if (this.rol.es_admin) return true;
    const permisos = this.rol.permisos || [];
    return permisos.includes(vista);
  },

  esAdmin() {
    return this.rol && this.rol.es_admin;
  },

  // ── Rate limiting de login (client-side, disuasorio) ──
  _loginKey: 'taq_login_attempts',

  _loginAttempts() {
    try { return JSON.parse(localStorage.getItem(this._loginKey)) || { count: 0, until: 0 }; }
    catch (_) { return { count: 0, until: 0 }; }
  },

  _loginFailed() {
    const d = this._loginAttempts();
    d.count++;
    // Bloqueo progresivo: 5 intentos → 30s, 10 → 2min, 15 → 10min
    if (d.count >= 5) d.until = Date.now() + Math.min(d.count * 6000, 600000);
    localStorage.setItem(this._loginKey, JSON.stringify(d));
  },

  _loginOk() {
    localStorage.removeItem(this._loginKey);
  },

  async login(pin) {
    if (!SB.negocioId) return null;

    // Verificar bloqueo
    const attempts = this._loginAttempts();
    if (attempts.until > Date.now()) {
      const segs = Math.ceil((attempts.until - Date.now()) / 1000);
      throw new Error(`Demasiados intentos. Espera ${segs}s`);
    }

    const res = await SB.getN('taq_usuarios', `pin=eq.${pin}&activo=eq.true&limit=1`);
    if (!res.length) {
      this._loginFailed();
      return null;
    }

    const user = res[0];

    // Cargar rol del usuario
    let rol = null;
    if (user.rol_id) {
      const roles = await SB.get('taq_roles', `id=eq.${user.rol_id}&limit=1`);
      if (roles.length) rol = roles[0];
    }

    // Fallback: buscar rol por nombre si rol_id no existe
    if (!rol && user.rol) {
      const roles = await SB.getN('taq_roles', `nombre=eq.${user.rol}&limit=1`);
      if (roles.length) rol = roles[0];
    }

    if (!rol) return null;

    this.user = user;
    this.rol = rol;
    this._loginOk();  // limpiar contador de intentos

    localStorage.setItem('taq_user', JSON.stringify({
      user: this.user,
      rol: this.rol,
      negocio: this.negocio,
      loginAt: Date.now()   // para expiración de sesión
    }));

    return user;
  },

  logout() {
    this.user = null;
    this.rol = null;
    localStorage.removeItem('taq_user');
  },

  setNegocio(negocio) {
    this.negocio = negocio;
    SB.negocioId = negocio.id;
    // Actualizar localStorage si hay sesión — conservar loginAt para no expirar la sesión
    if (this.user) {
      const saved = localStorage.getItem('taq_user');
      let loginAt = Date.now();
      try { loginAt = JSON.parse(saved).loginAt || loginAt; } catch (_) {}
      localStorage.setItem('taq_user', JSON.stringify({
        user: this.user,
        rol: this.rol,
        negocio: this.negocio,
        loginAt
      }));
    }
  },

  // --- Auditoría ---

  async audit(tipo, referencia_id, meta, severidad) {
    return SB.insertN('taq_actividad', {
      usuario_id: this.user?.id || null,
      tipo,
      referencia_id: referencia_id || null,
      meta: meta || {},
      severidad: severidad || 'info'
    });
  },

  // --- UI de login ---

  renderLogin(el) {
    const nombreNegocio = this.negocio?.nombre || 'Punto de Venta';
    el.innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="login-logo">🌮</div>
          <h1 class="login-title">${nombreNegocio}</h1>
          <p class="login-sub">Ingresa tu PIN</p>
          <div class="pin-display" id="pinDisplay">
            <span class="pin-dot"></span>
            <span class="pin-dot"></span>
            <span class="pin-dot"></span>
            <span class="pin-dot"></span>
          </div>
          <div class="pin-error" id="pinError"></div>
          <div class="pin-pad">
            ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k =>
              k === '' ? '<button class="pin-key" disabled></button>' :
              k === '⌫' ? '<button class="pin-key pin-delete" onclick="Auth.pinKey(\'del\')">⌫</button>' :
              `<button class="pin-key" onclick="Auth.pinKey('${k}')">${k}</button>`
            ).join('')}
          </div>
        </div>
      </div>
    `;
    this._pin = '';
  },

  _pin: '',

  async pinKey(key) {
    const dots = document.querySelectorAll('.pin-dot');
    const errorEl = document.getElementById('pinError');

    if (key === 'del') {
      this._pin = this._pin.slice(0, -1);
    } else {
      if (this._pin.length >= 4) return;
      this._pin += key;
    }

    dots.forEach((d, i) => {
      d.classList.toggle('filled', i < this._pin.length);
    });

    if (this._pin.length === 4) {
      try {
        const user = await this.login(this._pin);
        if (user) {
          errorEl.textContent = '';
          App.init();
        } else {
          errorEl.textContent = 'PIN incorrecto';
          this._pin = '';
          dots.forEach(d => d.classList.remove('filled'));
          if (navigator.vibrate) navigator.vibrate(200);
          document.querySelector('.pin-display')?.classList.add('shake');
          setTimeout(() => document.querySelector('.pin-display')?.classList.remove('shake'), 500);
        }
      } catch (e) {
        // Error de rate limit u otro
        errorEl.textContent = e.message;
        this._pin = '';
        dots.forEach(d => d.classList.remove('filled'));
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
    }
  }
};
