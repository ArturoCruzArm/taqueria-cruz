/**
 * cliente-app.js — App pública para clientes
 * URL: /cliente.html?n=tacos-cruz&mesa=abc123
 *
 * Flujo:
 * 1. Carga negocio por slug (param n=)
 * 2. Identifica mesa por qr_token (param mesa=)
 * 3. Muestra menú (sin login)
 * 4. Cliente arma pedido → ingresa nombre + código del día → envía solicitud
 * 5. Espera confirmación del mesero
 * 6. Ve su cuenta en tiempo real, puede agregar más, llamar mesero, pedir cuenta
 */

const ClienteApp = {
  negocio: null,
  mesa: null,          // { id, nombre, qr_token }
  carrito: [],
  sesion: null,        // { nombre, device_id, orden_id, cuenta_id }
  _subOrdenes: null,
  _catActiva: null,

  // ── INIT ──

  async init() {
    const params = new URLSearchParams(location.search);
    const slug = params.get('n');
    const qrToken = params.get('mesa');

    // Cargar negocio — si no hay slug, tomar el primer negocio activo (instalación de un solo negocio)
    let res;
    if (slug) {
      res = await SB.get('taq_negocios', `slug=eq.${slug}&activo=eq.true&limit=1`);
    } else {
      res = await SB.get('taq_negocios', 'activo=eq.true&order=created_at&limit=1');
    }
    if (!res.length) {
      this.renderError('Menú no disponible', 'El negocio no existe o está inactivo');
      return;
    }
    this.negocio = res[0];
    SB.negocioId = this.negocio.id;

    // Aplicar color del negocio
    if (this.negocio.color_primario) {
      document.documentElement.style.setProperty('--primary', this.negocio.color_primario);
    }
    document.title = this.negocio.nombre || 'Menú';

    // Identificar mesa
    if (qrToken) {
      const mesas = await SB.getN('taq_mesas', `qr_token=eq.${qrToken}&activa=eq.true&limit=1`);
      if (mesas.length) this.mesa = mesas[0];
    }

    // Modo ver-cuenta por QR (sin sesión propia)
    const cuentaParam = params.get('cuenta');
    if (cuentaParam) {
      await this.renderCuentaPublica(cuentaParam);
      return;
    }

    // Recuperar sesión guardada (si el cliente ya hizo un pedido hoy)
    const saved = localStorage.getItem(`cli_sesion_${this.negocio.id}`);
    if (saved) {
      try {
        this.sesion = JSON.parse(saved);
        // Verificar que la orden sigue activa
        if (this.sesion.orden_id) {
          const ord = await SB.get('taq_ordenes', `id=eq.${this.sesion.orden_id}&estado=neq.cobrada&estado=neq.cancelada`);
          if (!ord.length) {
            this.sesion = null;
            localStorage.removeItem(`cli_sesion_${this.negocio.id}`);
          }
        }
      } catch (_) { this.sesion = null; }
    }

    if (this.sesion?.orden_id) {
      this.renderCuenta();
    } else {
      this.renderMenu();
    }
  },

  // ── MENÚ ──

  async renderMenu() {
    const [cats, prods] = await Promise.all([
      SB.getN('taq_categorias', 'activa=eq.true&order=orden&limit=200'),
      SB.getN('taq_productos', 'disponible=eq.true&order=orden&limit=500')
    ]);

    const root = document.getElementById('cli-root');
    root.innerHTML = `
      <div class="cli-topbar">
        <div>
          <div class="cli-negocio">${this.negocio.nombre}</div>
          ${this.mesa ? `<div class="cli-mesa">📍 ${this.mesa.nombre}</div>` : ''}
        </div>
      </div>

      <div class="cli-cats" id="cliCats">
        ${cats.map((c, i) => `
          <button class="cli-cat-btn ${i === 0 ? 'active' : ''}"
            onclick="ClienteApp.selectCat('${c.id}', this)">
            ${c.icono} ${c.nombre}
          </button>
        `).join('')}
      </div>

      <div class="cli-prods" id="cliProds"></div>

      <button class="cli-carrito-fab oculto" id="cliFab" onclick="ClienteApp.abrirCarrito()">
        🛒 <span id="cliFabCount">0</span> — $<span id="cliFabTotal">0</span>
      </button>
    `;

    this._cats = cats;
    this._prods = prods;

    if (cats.length) {
      this._catActiva = cats[0].id;
      this.renderProds();
    }
  },

  selectCat(catId, btn) {
    this._catActiva = catId;
    document.querySelectorAll('.cli-cat-btn').forEach(b => b.classList.toggle('active', b === btn));
    this.renderProds();
  },

  renderProds() {
    const prods = this._prods.filter(p => p.categoria_id === this._catActiva);
    const el = document.getElementById('cliProds');
    if (!el) return;

    el.innerHTML = prods.map(p => {
      const en = this.carrito.find(i => i.producto_id === p.id);
      return `
        <div class="cli-prod-card">
          <div class="cli-prod-info">
            <div class="cli-prod-nombre">${p.nombre}</div>
            ${p.descripcion ? `<div class="cli-prod-desc">${p.descripcion}</div>` : ''}
            <div class="cli-prod-precio">$${parseFloat(p.precio).toFixed(0)}</div>
          </div>
          <div class="cli-prod-ctrl">
            ${en ? `
              <button class="cli-qty-btn" onclick="ClienteApp.cambiarQty('${p.id}', -1)">−</button>
              <span class="cli-qty-num">${en.cantidad}</span>
            ` : ''}
            <button class="cli-qty-btn add" onclick="ClienteApp.cambiarQty('${p.id}', 1)">+</button>
          </div>
        </div>
      `;
    }).join('');
  },

  cambiarQty(prodId, delta) {
    const prod = this._prods.find(p => p.id === prodId);
    if (!prod) return;

    const idx = this.carrito.findIndex(i => i.producto_id === prodId);
    if (idx >= 0) {
      this.carrito[idx].cantidad += delta;
      if (this.carrito[idx].cantidad <= 0) this.carrito.splice(idx, 1);
    } else if (delta > 0) {
      this.carrito.push({
        producto_id: prod.id,
        nombre: prod.nombre,
        precio: parseFloat(prod.precio),
        cantidad: 1,
        notas: ''
      });
    }

    this.renderProds();
    this.actualizarFab();
  },

  actualizarFab() {
    const fab = document.getElementById('cliFab');
    const count = document.getElementById('cliFabCount');
    const total = document.getElementById('cliFabTotal');
    if (!fab) return;

    const totalItems = this.carrito.reduce((s, i) => s + i.cantidad, 0);
    const totalPrecio = this.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);

    fab.classList.toggle('oculto', totalItems === 0);
    if (count) count.textContent = totalItems;
    if (total) total.textContent = totalPrecio.toFixed(0);
  },

  // ── CARRITO ──

  abrirCarrito() {
    const total = this.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);

    const overlay = document.createElement('div');
    overlay.className = 'cli-carrito-overlay';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
      <div class="cli-carrito-panel">
        <div class="cli-carrito-header">
          <h2>Tu pedido</h2>
          <button class="cli-btn cli-btn-outline" style="width:auto;padding:8px 14px" onclick="this.closest('.cli-carrito-overlay').remove()">✕</button>
        </div>

        <div class="cli-carrito-items">
          ${this.carrito.map((item, i) => `
            <div>
              <div class="cli-carrito-item">
                <span class="cli-carrito-item-nombre">${item.cantidad}x ${item.nombre}</span>
                <div class="cli-prod-ctrl">
                  <button class="cli-qty-btn" onclick="ClienteApp.cambiarQtyCarrito(${i}, -1)">−</button>
                  <span class="cli-qty-num">${item.cantidad}</span>
                  <button class="cli-qty-btn add" onclick="ClienteApp.cambiarQtyCarrito(${i}, 1)">+</button>
                </div>
                <span class="cli-carrito-item-precio">$${(item.precio * item.cantidad).toFixed(0)}</span>
              </div>
              <input type="text" class="cli-nota-input" placeholder="Nota (sin cebolla, extra salsa...)"
                value="${item.notas}" onchange="ClienteApp.setNota(${i}, this.value)">
            </div>
          `).join('')}
        </div>

        <div class="cli-carrito-total">Total: $${total.toFixed(0)}</div>

        <div class="cli-form">
          <label>Tu nombre</label>
          <input type="text" id="cliNombre" placeholder="Ej: Juan" value="${this.sesion?.nombre || ''}"
            style="letter-spacing:0">
          <label>Código del día</label>
          <input type="tel" id="cliCodigo" placeholder="3 dígitos" maxlength="3" inputmode="numeric">
        </div>

        <button class="cli-btn cli-btn-primary" onclick="ClienteApp.enviarPedido()">
          Enviar pedido →
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
  },

  cambiarQtyCarrito(idx, delta) {
    this.carrito[idx].cantidad += delta;
    if (this.carrito[idx].cantidad <= 0) this.carrito.splice(idx, 1);
    this.actualizarFab();
    // Reconstruir overlay
    document.querySelector('.cli-carrito-overlay')?.remove();
    if (this.carrito.length) this.abrirCarrito();
  },

  setNota(idx, nota) {
    this.carrito[idx].notas = nota;
  },

  // ── ENVIAR PEDIDO ──

  async enviarPedido() {
    const nombre = document.getElementById('cliNombre')?.value.trim();
    const codigoIngresado = document.getElementById('cliCodigo')?.value.trim();

    if (!nombre) { this.toast('Escribe tu nombre'); return; }
    if (!codigoIngresado) { this.toast('Ingresa el código del día'); return; }

    // Verificar código del día
    const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: this.negocio?.config?.timezone || 'America/Mexico_City' });
    const codigos = await SB.getN('taq_codigos_dia', `fecha=eq.${hoy}&limit=1`);
    if (!codigos.length || codigos[0].codigo !== codigoIngresado) {
      this.toast('Código incorrecto — pídelo al mesero');
      if (navigator.vibrate) navigator.vibrate(300);
      return;
    }

    // Verificar que el dispositivo no esté bloqueado
    const deviceId = this.getDeviceId();
    const bloqueado = await SB.getN('taq_dispositivos_bloqueados', `device_id=eq.${deviceId}&limit=1`);
    if (bloqueado.length) {
      this.toast('Este dispositivo no puede hacer pedidos');
      return;
    }

    const total = this.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const items = this.carrito.map(i => ({
      producto_id: i.producto_id,
      nombre: i.nombre,
      cantidad: i.cantidad,
      precio: i.precio,
      notas: i.notas || null
    }));

    // Crear solicitud
    await SB.insertN('taq_solicitudes', {
      mesa_id: this.mesa?.id || null,
      tipo: 'pedido',
      nombre_cliente: nombre,
      device_id: deviceId,
      items,
      total
    });

    document.querySelector('.cli-carrito-overlay')?.remove();
    this.carrito = [];
    this.actualizarFab();

    // Guardar nombre en sesión temporal (sin orden_id aún, mesero la asignará)
    this.sesion = { nombre, device_id: deviceId };
    localStorage.setItem(`cli_sesion_${this.negocio.id}`, JSON.stringify(this.sesion));

    this.renderEspera(nombre);
  },

  // ── PANTALLA DE ESPERA ──

  renderEspera(nombre) {
    const root = document.getElementById('cli-root');
    root.innerHTML = `
      <div class="cli-topbar">
        <div class="cli-negocio">${this.negocio.nombre}</div>
      </div>
      <div class="cli-estado">
        <div class="cli-estado-icon">⏳</div>
        <h2>Pedido enviado, ${this.esc(nombre)}</h2>
        <p>El mesero confirmará tu pedido en un momento.<br>Permanece en tu lugar.</p>
      </div>
    `;

    // Suscribirse a solicitudes para detectar cuando se acepta
    this._subSolicitudes && SB.unsubscribe(this._subSolicitudes);
    this._subSolicitudes = SB.subscribeN('taq_solicitudes', async () => {
      // Buscar solicitud aceptada de este device
      const deviceId = this.getDeviceId();
      const solic = await SB.getN('taq_solicitudes', `device_id=eq.${deviceId}&estado=eq.aceptada&orden_id=not.is.null&limit=1`);
      if (solic.length) {
        const s = solic[0];
        this.sesion = {
          nombre: s.nombre_cliente,
          device_id: deviceId,
          orden_id: s.orden_id,
          cuenta_id: null
        };
        // Obtener cuenta_id de la orden
        const ord = await SB.get('taq_ordenes', `id=eq.${s.orden_id}&limit=1`);
        if (ord.length) this.sesion.cuenta_id = ord[0].cuenta_id;

        localStorage.setItem(`cli_sesion_${this.negocio.id}`, JSON.stringify(this.sesion));
        SB.unsubscribe(this._subSolicitudes);
        this.renderCuenta();
      }
    });
  },

  // ── CUENTA EN TIEMPO REAL ──

  async renderCuenta() {
    if (!this.sesion?.orden_id) return;

    const root = document.getElementById('cli-root');

    const renderCuentaHTML = async () => {
      const orden = await SB.get('taq_ordenes', `id=eq.${this.sesion.orden_id}&limit=1`);
      if (!orden.length || orden[0].estado === 'cobrada' || orden[0].estado === 'cancelada') {
        this.sesion = null;
        localStorage.removeItem(`cli_sesion_${this.negocio.id}`);
        this.renderFin(orden[0]?.estado);
        return;
      }

      const items = await SB.get('taq_orden_items', `orden_id=eq.${this.sesion.orden_id}&order=created_at`);
      const total = items.reduce((s, i) => s + i.cantidad * parseFloat(i.precio_unitario), 0);

      const estadoLabel = { pendiente: 'Preparando...', listo: '¡Listo! 🍽️', entregado: 'Entregado ✓' };

      root.innerHTML = `
        <div class="cli-topbar">
          <div>
            <div class="cli-negocio">${this.negocio.nombre}</div>
            <div class="cli-mesa">Hola, ${this.esc(this.sesion.nombre)}</div>
          </div>
        </div>
        <div class="cli-cuenta">
          <div class="cli-cuenta-titulo">Tu pedido</div>
          <div class="cli-cuenta-items">
            ${items.map(i => `
              <div class="cli-cuenta-item">
                <span>${i.cantidad}x ${this.esc(i.nombre_producto)}${i.notas ? ` <small>(${this.esc(i.notas)})</small>` : ''}</span>
                <div style="text-align:right">
                  <div>$${(i.cantidad * parseFloat(i.precio_unitario)).toFixed(0)}</div>
                  <div class="cli-cuenta-item-estado ${i.estado || ''}">${estadoLabel[i.estado] || 'Preparando...'}</div>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="cli-cuenta-total">Total: $${total.toFixed(0)}</div>

          <div class="cli-acciones">
            <button class="cli-accion-btn" onclick="ClienteApp.agregarMas()">
              <span class="cli-accion-icon">➕</span>
              <div>
                <div>Agregar más</div>
                <div style="font-size:.75rem;color:var(--muted);font-weight:400">Pedir más productos</div>
              </div>
            </button>
            <button class="cli-accion-btn" onclick="ClienteApp.llamarMesero()">
              <span class="cli-accion-icon">🙋</span>
              <div>
                <div>Llamar mesero</div>
                <div style="font-size:.75rem;color:var(--muted);font-weight:400">Te atendemos de inmediato</div>
              </div>
            </button>
            <button class="cli-accion-btn" onclick="ClienteApp.pedirCuenta()">
              <span class="cli-accion-icon">🧾</span>
              <div>
                <div>Pedir la cuenta</div>
                <div style="font-size:.75rem;color:var(--muted);font-weight:400">Solicitar cobro</div>
              </div>
            </button>
          </div>
        </div>
      `;
    };

    await renderCuentaHTML();

    // Suscribir a cambios en items de la orden
    this._subOrdenes && SB.unsubscribe(this._subOrdenes);
    this._subOrdenes = SB.subscribe('taq_orden_items', () => renderCuentaHTML(),
      `orden_id=eq.${this.sesion.orden_id}`);
  },

  // ── ACCIONES DESDE LA CUENTA ──

  async agregarMas() {
    // Ir al menú, conservar sesión
    await this.renderMenu();
    // Sobrescribir el botón FAB para que "enviar" cree una nueva solicitud adicional
    const fab = document.getElementById('cliFab');
    if (fab) fab.onclick = () => this.abrirCarritoAdicional();
  },

  abrirCarritoAdicional() {
    const total = this.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);

    const overlay = document.createElement('div');
    overlay.className = 'cli-carrito-overlay';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
      <div class="cli-carrito-panel">
        <div class="cli-carrito-header">
          <h2>Agregar más</h2>
          <button class="cli-btn cli-btn-outline" style="width:auto;padding:8px 14px" onclick="this.closest('.cli-carrito-overlay').remove()">✕</button>
        </div>
        <div class="cli-carrito-items">
          ${this.carrito.map((item, i) => `
            <div class="cli-carrito-item">
              <span class="cli-carrito-item-nombre">${item.cantidad}x ${item.nombre}</span>
              <span class="cli-carrito-item-precio">$${(item.precio * item.cantidad).toFixed(0)}</span>
            </div>
          `).join('')}
        </div>
        <div class="cli-carrito-total">Total adicional: $${total.toFixed(0)}</div>
        <div class="cli-form">
          <label>Código del día</label>
          <input type="tel" id="cliCodigoAd" placeholder="3 dígitos" maxlength="3" inputmode="numeric">
        </div>
        <button class="cli-btn cli-btn-primary" onclick="ClienteApp.enviarAdicional()">
          Enviar adición →
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
  },

  async enviarAdicional() {
    const codigoIngresado = document.getElementById('cliCodigoAd')?.value.trim();
    if (!codigoIngresado) { this.toast('Ingresa el código del día'); return; }

    const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: this.negocio?.config?.timezone || 'America/Mexico_City' });
    const codigos = await SB.getN('taq_codigos_dia', `fecha=eq.${hoy}&limit=1`);
    if (!codigos.length || codigos[0].codigo !== codigoIngresado) {
      this.toast('Código incorrecto');
      return;
    }

    const total = this.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const items = this.carrito.map(i => ({
      producto_id: i.producto_id,
      nombre: i.nombre,
      cantidad: i.cantidad,
      precio: i.precio,
      notas: i.notas || null
    }));

    await SB.insertN('taq_solicitudes', {
      mesa_id: this.mesa?.id || null,
      tipo: 'pedido',
      nombre_cliente: this.sesion.nombre,
      device_id: this.getDeviceId(),
      items,
      total,
      orden_id: this.sesion.orden_id
    });

    this.carrito = [];
    document.querySelector('.cli-carrito-overlay')?.remove();
    this.toast('Adición enviada al mesero');
    this.renderCuenta();
  },

  async llamarMesero() {
    await SB.insertN('taq_solicitudes', {
      mesa_id: this.mesa?.id || null,
      tipo: 'llamar_mesero',
      nombre_cliente: this.sesion.nombre,
      device_id: this.getDeviceId(),
      orden_id: this.sesion.orden_id
    });
    this.toast('Mesero notificado ✓');
  },

  async pedirCuenta() {
    if (!confirm('¿Pedir la cuenta? El mesero se acercará a cobrar.')) return;
    await SB.insertN('taq_solicitudes', {
      mesa_id: this.mesa?.id || null,
      tipo: 'pedir_cuenta',
      nombre_cliente: this.sesion.nombre,
      device_id: this.getDeviceId(),
      orden_id: this.sesion.orden_id
    });
    this.toast('Solicitud de cuenta enviada ✓');
  },

  // ── PANTALLA FINAL ──

  renderFin(estado) {
    const root = document.getElementById('cli-root');
    const cobrada = estado === 'cobrada';
    root.innerHTML = `
      <div class="cli-topbar">
        <div class="cli-negocio">${this.negocio.nombre}</div>
      </div>
      <div class="cli-estado">
        <div class="cli-estado-icon">${cobrada ? '✅' : '👋'}</div>
        <h2>${cobrada ? '¡Gracias por tu visita!' : 'Pedido finalizado'}</h2>
        <p>${cobrada ? 'El pago ha sido registrado. Vuelve pronto.' : 'Tu pedido ha sido cerrado.'}</p>
        <button class="cli-btn cli-btn-primary" style="margin-top:16px" onclick="location.reload()">
          Nuevo pedido
        </button>
      </div>
    `;
  },

  // ── UTILIDADES ──

  renderError(titulo, subtitulo) {
    document.getElementById('cli-root').innerHTML = `
      <div class="cli-estado">
        <div class="cli-estado-icon">❌</div>
        <h2>${titulo}</h2>
        <p>${subtitulo}</p>
      </div>
    `;
  },

  getDeviceId() {
    let id = localStorage.getItem('cli_device_id');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('cli_device_id', id);
    }
    return id;
  },

  esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  toast(msg) {
    const t = document.getElementById('cliToast');
    t.textContent = msg;
    t.className = 'cli-toast show';
    setTimeout(() => t.className = 'cli-toast', 2500);
  },

  // Vista pública de cuenta por QR — solo lectura, tiempo real
  async renderCuentaPublica(cuentaId) {
    const root = document.getElementById('cli-root');
    const negocio = this.negocio?.nombre || 'Taquería';

    const cargar = async () => {
      const [cuentaArr, ordenes] = await Promise.all([
        SB.get('taq_cuentas', `id=eq.${cuentaId}`),
        SB.getN('taq_ordenes', `cuenta_id=eq.${cuentaId}&estado=neq.cancelada&order=created_at`)
      ]);

      if (!cuentaArr.length) {
        root.innerHTML = `<div style="text-align:center;padding:40px;color:#888">Cuenta no encontrada</div>`;
        return;
      }
      const cuenta = cuentaArr[0];

      if (cuenta.estado === 'cobrada') {
        root.innerHTML = `
          <div class="cli-topbar"><div class="cli-negocio">${negocio}</div></div>
          <div style="text-align:center;padding:48px 16px">
            <div style="font-size:3rem">✅</div>
            <p style="font-size:1.1rem;margin-top:8px">Esta cuenta ya fue cobrada</p>
            <p style="color:#888;font-size:.85rem">Total: $${parseFloat(cuenta.total||0).toFixed(0)}</p>
          </div>`;
        return;
      }

      let items = [];
      if (ordenes.length) {
        items = await SB.get('taq_orden_items',
          `orden_id=in.(${ordenes.map(o => o.id).join(',')})&order=created_at`);
      }
      const total = parseFloat(cuenta.total || 0);

      root.innerHTML = `
        <div class="cli-topbar">
          <div>
            <div class="cli-negocio">${negocio}</div>
            <div class="cli-mesa">🧾 Cuenta de ${this.esc(cuenta.nombre_cliente || 'Cliente')}</div>
          </div>
        </div>
        <div style="padding:16px;max-width:480px;margin:0 auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:1px solid #ddd">
                <th style="text-align:left;padding:8px 4px;font-size:.85rem">Producto</th>
                <th style="text-align:center;padding:8px 4px;font-size:.85rem">Cant</th>
                <th style="text-align:right;padding:8px 4px;font-size:.85rem">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(i => `
                <tr style="border-bottom:1px solid #f0f0f0">
                  <td style="padding:8px 4px">
                    ${this.esc(i.nombre_producto)}
                    ${i.notas ? `<br><small style="color:#888">${this.esc(i.notas)}</small>` : ''}
                    ${i.estado === 'entregado' ? ' <small style="color:#22c55e">✓</small>' : i.estado === 'listo' ? ' <small>🍽️</small>' : ''}
                  </td>
                  <td style="text-align:center;padding:8px 4px">${i.cantidad}</td>
                  <td style="text-align:right;padding:8px 4px">$${(i.cantidad * parseFloat(i.precio_unitario||0)).toFixed(0)}</td>
                </tr>
              `).join('')}
              ${!items.length ? '<tr><td colspan="3" style="text-align:center;padding:20px;color:#888">Sin productos aún</td></tr>' : ''}
            </tbody>
          </table>
          <div style="border-top:2px solid var(--primary,#e94560);margin-top:12px;padding-top:12px;text-align:right;font-size:1.3rem;font-weight:700">
            Total: $${total.toFixed(0)}
          </div>
          <p style="text-align:center;margin-top:20px;color:#888;font-size:.82rem">
            Esta página se actualiza automáticamente
          </p>
        </div>
      `;
    };

    await cargar();

    // Realtime: actualizar cuando cambian los ítems de esta cuenta
    SB.subscribeN('taq_orden_items', cargar);
    SB.subscribeN('taq_cuentas', cargar);
  }
};

document.addEventListener('DOMContentLoaded', () => ClienteApp.init());
