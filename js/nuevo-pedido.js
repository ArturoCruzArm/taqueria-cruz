/**
 * nuevo-pedido.js — Crear/editar pedido con sistema de cuentas
 * Rutas:
 *   #nuevo           → Nuevo pedido, crea cuenta nueva
 *   #nuevo/cuenta/ID → Agregar pedido a cuenta existente
 *   #nuevo/ID        → Editar pedido existente
 */
const NuevoPedido = {
  orden: null,
  cuenta: null,
  items: [],
  mesa: '',
  tipo: 'mesa',        // 'mesa' | 'llevar' | 'domicilio'
  telefono: '',
  direccion: '',
  notasEntrega: '',
  horaProgramada: null,
  _working: false,

  // ── BORRADOR EN LOCALSTORAGE ──────────────────────────────────────────────
  // Persiste el pedido en progreso para sobrevivir cambios de vista.
  // Solo aplica a pedidos nuevos (no a editar orden existente).

  _draftKey() {
    return `taq_draft_${SB.negocioId || 'default'}`;
  },

  saveDraft() {
    if (this.orden) return; // Edición ya está en DB, no necesita borrador
    if (!this.items.length && !this.mesa) {
      this.clearDraft();
      return;
    }
    try {
      localStorage.setItem(this._draftKey(), JSON.stringify({
        mesa:     this.mesa,
        items:    this.items,
        cuentaId: this.cuenta?.id || null,
        savedAt:  Date.now()
      }));
    } catch (_) {}
  },

  loadDraft() {
    try {
      const raw = localStorage.getItem(this._draftKey());
      if (!raw) return null;
      const d = JSON.parse(raw);
      // Expirar borradores de más de 6 horas
      if (Date.now() - d.savedAt > 6 * 3600 * 1000) { this.clearDraft(); return null; }
      return d;
    } catch (_) { return null; }
  },

  clearDraft() {
    try { localStorage.removeItem(this._draftKey()); } catch (_) {}
  },

  async render(el, param1, param2) {
    this.items = [];
    this.mesa = '';
    this.tipo = 'mesa';
    this.telefono = '';
    this.direccion = '';
    this.notasEntrega = '';
    this.horaProgramada = null;
    this.orden = null;
    this.cuenta = null;
    this._working = false;

    // Detectar modo: editar orden, agregar a cuenta, o nuevo
    if (param1 === 'cuenta' && param2) {
      // Agregar a cuenta existente
      const cuentas = await SB.get('taq_cuentas', `id=eq.${param2}`);
      if (cuentas.length) {
        this.cuenta = cuentas[0];
        this.mesa = this.cuenta.nombre_cliente || this.cuenta.mesa || '';
      }
    } else if (param1 && param1 !== 'cuenta') {
      // Editar orden existente
      const arr = await SB.get('taq_ordenes', `id=eq.${param1}`);
      if (arr.length) {
        this.orden = arr[0];
        this.mesa = this.orden.mesa || '';
        const existingItems = await SB.get('taq_orden_items', `orden_id=eq.${param1}&order=created_at`);
        this.items = existingItems.map(i => ({
          producto_id: i.producto_id,
          nombre: i.nombre_producto,
          precio: parseFloat(i.precio_unitario),
          cantidad: i.cantidad,
          notas: i.notas || ''
        }));
      }
    } else {
      // Pedido nuevo — restaurar borrador si existe
      const draft = this.loadDraft();
      if (draft && (draft.items?.length || draft.mesa)) {
        this.items = draft.items || [];
        this.mesa = draft.mesa || '';
        if (draft.cuentaId) {
          const cs = await SB.get('taq_cuentas', `id=eq.${draft.cuentaId}&estado=eq.abierta`);
          if (cs.length) this.cuenta = cs[0];
        }
        setTimeout(() => App.toast('Pedido anterior restaurado', 'info'), 300);
      }
    }

    const titulo = this.orden
      ? 'Editar Pedido #' + this.orden.numero
      : this.cuenta
        ? 'Agregar a cuenta de ' + this.mesa
        : 'Nuevo Pedido';

    el.innerHTML = `
      <div class="view-header">
        <button class="btn btn-outline" onclick="location.hash='pedidos'">&larr; Volver</button>
        <h1>${titulo}</h1>
      </div>

      <div class="nuevo-pedido-layout">
        <div class="menu-panel">
          ${!this.cuenta ? `
          <div class="cliente-selector">
            <label>Cliente:</label>
            <div class="cliente-row">
              <input type="text" id="clienteInput" class="cliente-input" placeholder="Nombre del cliente..."
                value="${this.mesa}" oninput="NuevoPedido.setMesa(this.value)" autocomplete="off">
            </div>
            <div class="tipo-selector" style="display:flex;gap:6px;margin:8px 0">
              <button class="btn btn-sm ${this.tipo==='mesa'?'btn-primary':'btn-outline'} tipo-btn" onclick="NuevoPedido.setTipo('mesa',this)">🪑 Mesa</button>
              <button class="btn btn-sm ${this.tipo==='llevar'?'btn-primary':'btn-outline'} tipo-btn" onclick="NuevoPedido.setTipo('llevar',this)">🛍️ Llevar</button>
              <button class="btn btn-sm ${this.tipo==='domicilio'?'btn-primary':'btn-outline'} tipo-btn" onclick="NuevoPedido.setTipo('domicilio',this)">🛵 Domicilio</button>
            </div>
            <div id="camposEntrega" style="${this.tipo==='domicilio'?'':'display:none'};display:flex;flex-direction:column;gap:6px">
              <input type="tel" id="telefonoInput" class="cliente-input" placeholder="Teléfono..."
                value="${this.telefono}" oninput="NuevoPedido.telefono=this.value" inputmode="tel">
              <input type="text" id="direccionInput" class="cliente-input" placeholder="Dirección de entrega..."
                value="${this.direccion}" oninput="NuevoPedido.direccion=this.value">
              <input type="text" id="notasEntregaInput" class="cliente-input" placeholder="Referencia (color de puerta, entre calles...)"
                value="${this.notasEntrega}" oninput="NuevoPedido.notasEntrega=this.value">
            </div>
            <div style="margin-top:6px">
              <label style="font-size:.82rem;color:var(--muted);display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="checkbox" id="chkProgramado" ${this.horaProgramada?'checked':''} onchange="NuevoPedido.toggleProgramado(this.checked)">
                Programar para hora específica
              </label>
              <div id="campoProgramado" style="${this.horaProgramada?'':'display:none'};margin-top:6px">
                <input type="datetime-local" id="horaInput" class="cliente-input"
                  value="${this.horaProgramada||''}" onchange="NuevoPedido.horaProgramada=this.value||null">
              </div>
            </div>
            <div class="clientes-rapidos" id="clientesRapidos"></div>
          </div>
          ` : `
          <div class="cliente-selector">
            <div class="cuenta-info">📍 ${this.mesa} — Agregando a cuenta abierta</div>
          </div>
          `}

          <div class="cat-tabs" id="catTabs"></div>
          <div class="productos-grid" id="productosGrid"></div>
        </div>

        <div class="ticket-panel">
          <h2 class="ticket-title">${this.mesa || 'Nombre del cliente'}</h2>
          <div id="ticketItems" class="ticket-items"></div>
          <div class="ticket-footer">
            <div class="ticket-total">Total: $<span id="ticketTotal">0</span></div>
            <button class="btn btn-primary btn-block" onclick="NuevoPedido.guardar()" id="btnGuardar" disabled>
              ${this.orden ? 'Actualizar Pedido' : this.cuenta ? 'Agregar a Cuenta' : 'Crear Pedido'}
            </button>
          </div>
        </div>
      </div>
    `;

    this.renderCategorias();
    this.renderTicket();
    if (!this.cuenta) this.loadClientesRecientes();
  },

  renderCategorias() {
    const cats = App.menuData.categorias;
    const tabs = document.getElementById('catTabs');
    tabs.innerHTML = cats.map((c, i) => `
      <button class="cat-tab ${i === 0 ? 'active' : ''}" data-cat="${c.id}" onclick="NuevoPedido.selectCat('${c.id}', this)">
        ${c.icono} ${c.nombre}
      </button>
    `).join('');
    if (cats.length) this.renderProductos(cats[0].id);
  },

  selectCat(catId, btn) {
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    this.renderProductos(catId);
  },

  renderProductos(catId) {
    const prods = App.menuData.productos.filter(p => p.categoria_id === catId);
    const grid = document.getElementById('productosGrid');
    grid.innerHTML = prods.map(p => {
      const enTicket = this.items.find(i => i.producto_id === p.id);
      return `
        <button class="producto-btn ${enTicket ? 'in-ticket' : ''}" onclick="NuevoPedido.addItem('${p.id}')">
          <span class="prod-name">${p.nombre}</span>
          <span class="prod-price">$${parseFloat(p.precio).toFixed(0)}</span>
          ${enTicket ? `<span class="prod-qty">${enTicket.cantidad}</span>` : ''}
        </button>
      `;
    }).join('');
  },

  addItem(prodId) {
    const existing = this.items.find(i => i.producto_id === prodId);
    if (existing) {
      existing.cantidad++;
    } else {
      const p = App.menuData.productos.find(p => p.id === prodId);
      if (!p) {
        // El producto no está en el menú cargado en memoria — loguear y recargar
        ErrorLogger?.capture(
          new Error(`Producto ${prodId} no encontrado en menuData (${App.menuData.productos.length} productos cargados)`),
          'NuevoPedido.addItem'
        );
        App.loadMenu().then(() => App.toast('Menú actualizado, intenta de nuevo'));
        return;
      }
      this.items.push({
        producto_id: p.id,
        nombre: p.nombre,
        precio: parseFloat(p.precio),
        cantidad: 1,
        notas: ''
      });
    }
    this.renderTicket();
    this.saveDraft();
    const activeCat = document.querySelector('.cat-tab.active');
    if (activeCat) this.renderProductos(activeCat.dataset.cat);
  },

  removeItem(idx) {
    this.items.splice(idx, 1);
    this.renderTicket();
    this.saveDraft();
    const activeCat = document.querySelector('.cat-tab.active');
    if (activeCat) this.renderProductos(activeCat.dataset.cat);
  },

  changeQty(idx, delta) {
    this.items[idx].cantidad += delta;
    if (this.items[idx].cantidad < 1) this.items.splice(idx, 1);
    this.renderTicket();
    this.saveDraft();
    const activeCat = document.querySelector('.cat-tab.active');
    if (activeCat) this.renderProductos(activeCat.dataset.cat);
  },

  setNota(idx, nota) {
    this.items[idx].notas = nota;
    this.saveDraft();
  },

  setMesa(mesa) {
    this.mesa = mesa;
    document.querySelectorAll('.mesa-btn').forEach(b => b.classList.toggle('active', b.textContent.trim() === mesa));
    const title = document.querySelector('.ticket-title');
    if (title) title.textContent = mesa || 'Nombre del cliente';
    this.updateGuardarBtn();
    this.saveDraft();
  },

  async loadClientesRecientes() {
    const hoy = App.hoy();
    // Mostrar cuentas abiertas primero (para agregar a cuenta existente)
    const cuentasAbiertas = await SB.getN('taq_cuentas', `estado=eq.abierta&order=created_at.desc&limit=10`);
    const el = document.getElementById('clientesRapidos');
    if (!el) return;

    let html = '';
    if (cuentasAbiertas.length) {
      html += cuentasAbiertas.map(c =>
        `<button class="cliente-chip cliente-chip-cuenta" onclick="location.hash='nuevo/cuenta/${c.id}'">🔄 ${c.nombre_cliente || c.mesa}</button>`
      ).join('');
    }

    // También nombres recientes
    const recientes = await SB.getN('taq_ordenes', `created_at=gte.${App.inicioDia(hoy)}&select=mesa&order=created_at.desc&limit=20`);
    const nombres = [...new Set(recientes.map(o => o.mesa).filter(m => m && m !== 'Para llevar'))];
    const cuentaNombres = new Set(cuentasAbiertas.map(c => c.nombre_cliente || c.mesa));
    const nuevos = nombres.filter(n => !cuentaNombres.has(n));

    if (nuevos.length) {
      html += nuevos.slice(0, 5).map(n =>
        `<button class="cliente-chip" onclick="NuevoPedido.setMesa('${n.replace(/'/g,"\\'")}'); document.getElementById('clienteInput').value='${n.replace(/'/g,"\\'")}'">${n}</button>`
      ).join('');
    }

    el.innerHTML = html;
  },

  renderTicket() {
    const container = document.getElementById('ticketItems');
    const totalEl = document.getElementById('ticketTotal');

    if (!this.items.length) {
      container.innerHTML = '<p class="ticket-empty">Agrega productos del menú</p>';
      totalEl.textContent = '0';
      this.updateGuardarBtn();
      return;
    }

    container.innerHTML = this.items.map((item, i) => `
      <div class="ticket-item">
        <div class="ticket-item-top">
          <span class="ticket-item-name">${item.nombre}</span>
          <span class="ticket-item-subtotal">$${(item.precio * item.cantidad).toFixed(0)}</span>
        </div>
        <div class="ticket-item-controls">
          <button class="qty-btn" onclick="NuevoPedido.changeQty(${i}, -1)">&minus;</button>
          <span class="qty-num">${item.cantidad}</span>
          <button class="qty-btn" onclick="NuevoPedido.changeQty(${i}, 1)">+</button>
          <input type="text" class="nota-input" placeholder="Nota..." value="${item.notas}" onchange="NuevoPedido.setNota(${i}, this.value)">
          <button class="btn-remove" onclick="NuevoPedido.removeItem(${i})">✕</button>
        </div>
      </div>
    `).join('');

    const total = this.items.reduce((s, i) => s + i.precio * i.cantidad, 0);
    totalEl.textContent = total.toFixed(0);
    this.updateGuardarBtn();
  },

  updateGuardarBtn() {
    const btn = document.getElementById('btnGuardar');
    if (btn) btn.disabled = (!this.mesa && !this.cuenta) || !this.items.length;
  },

  setTipo(tipo, btn) {
    this.tipo = tipo;
    document.querySelectorAll('.tipo-btn').forEach(b => {
      b.classList.toggle('btn-primary', b === btn);
      b.classList.toggle('btn-outline', b !== btn);
    });
    const campos = document.getElementById('camposEntrega');
    if (campos) campos.style.display = tipo === 'domicilio' ? 'flex' : 'none';
    // Llevar: limpiar nombre si era la mesa actual y poner "Para llevar"
    if (tipo === 'llevar' && !this.mesa) {
      this.setMesa('Para llevar');
      const inp = document.getElementById('clienteInput');
      if (inp) inp.value = 'Para llevar';
    }
  },

  toggleProgramado(checked) {
    const campo = document.getElementById('campoProgramado');
    if (campo) campo.style.display = checked ? '' : 'none';
    if (!checked) this.horaProgramada = null;
  },

  async guardar() {
    if (this._working || (!this.mesa && !this.cuenta) || !this.items.length) return;

    this._working = true;
    const btn = document.getElementById('btnGuardar');
    if (btn) btn.disabled = true;

    const total = this.items.reduce((s, i) => s + i.precio * i.cantidad, 0);

    try {
      if (this.orden) {
        // Editar orden existente — diff inteligente para preservar historial de cocina
        const dbItems = await SB.get('taq_orden_items', `orden_id=eq.${this.orden.id}&order=created_at`);
        const itemsNuevos = [];

        // Procesar items del ticket actual
        for (const item of this.items) {
          const dbItem = dbItems.find(d => d.producto_id === item.producto_id);
          if (!dbItem) {
            // Item nuevo: insertar como pendiente
            itemsNuevos.push({
              orden_id: this.orden.id,
              producto_id: item.producto_id,
              nombre_producto: item.nombre,
              cantidad: item.cantidad,
              precio_unitario: item.precio,
              notas: item.notas || null
            });
          } else if (!dbItem.estado || dbItem.estado === 'pendiente') {
            // Pendiente: solo actualizar cantidad y notas
            await SB.update('taq_orden_items', `id=eq.${dbItem.id}`, {
              cantidad: item.cantidad,
              notas: item.notas || null
            });
          } else {
            // listo o entregado: no tocar; si aumentó cantidad, insertar la diferencia
            const extra = item.cantidad - dbItem.cantidad;
            if (extra > 0) {
              itemsNuevos.push({
                orden_id: this.orden.id,
                producto_id: item.producto_id,
                nombre_producto: item.nombre,
                cantidad: extra,
                precio_unitario: item.precio,
                notas: item.notas || null
              });
            }
          }
        }

        // Borrar items que se quitaron del ticket, solo si están pendientes
        for (const dbItem of dbItems) {
          const enTicket = this.items.find(i => i.producto_id === dbItem.producto_id);
          if (!enTicket && (!dbItem.estado || dbItem.estado === 'pendiente')) {
            await SB.delete('taq_orden_items', `id=eq.${dbItem.id}`);
          }
        }

        // Insertar items nuevos
        if (itemsNuevos.length) {
          await SB.insertN('taq_orden_items', itemsNuevos);
        }

        // Si había items nuevos y la orden ya estaba lista → volver a en_cocina
        const actualizarOrden = { mesa: this.mesa, total, subtotal: total };
        if (itemsNuevos.length > 0 && this.orden.estado === 'lista') {
          actualizarOrden.estado = 'en_cocina';
        }
        await SB.update('taq_ordenes', `id=eq.${this.orden.id}`, actualizarOrden);

        Auth.audit('orden_modificada', this.orden.id, {
          numero: this.orden.numero, total, items_nuevos: itemsNuevos.length
        }, 'warning');
        App.toast(itemsNuevos.length
          ? `Pedido actualizado — ${itemsNuevos.length} nuevo(s) a cocina`
          : 'Pedido actualizado');

      } else if (this.cuenta) {
        // Agregar orden a cuenta existente
        const [orden] = await SB.insertN('taq_ordenes', {
          mesa: this.cuenta.nombre_cliente || this.cuenta.mesa,
          total, subtotal: total,
          usuario_id: Auth.user?.id || null,
          cuenta_id: this.cuenta.id
        });
        await SB.insertN('taq_orden_items', this.items.map(i => ({
          orden_id: orden.id,
          producto_id: i.producto_id,
          nombre_producto: i.nombre,
          cantidad: i.cantidad,
          precio_unitario: i.precio,
          notas: i.notas || null
        })));
        // Actualizar total de la cuenta
        const totalCuenta = parseFloat(this.cuenta.total || 0) + total;
        await SB.update('taq_cuentas', `id=eq.${this.cuenta.id}`, { total: totalCuenta });

        Auth.audit('pedido_creado', orden.id, { numero: orden.numero, cuenta_id: this.cuenta.id, mesa: this.mesa, total });
        App.toast('Pedido #' + orden.numero + ' agregado a cuenta');

      } else {
        // Nuevo pedido → crear cuenta + orden
        const [cuenta] = await SB.insertN('taq_cuentas', {
          mesa: this.tipo === 'mesa' ? this.mesa : (this.tipo === 'llevar' ? 'Para llevar' : 'Domicilio'),
          nombre_cliente: this.mesa,
          total,
          tipo_pedido: this.tipo,
          telefono: this.telefono || null,
          direccion: this.direccion || null,
          notas_entrega: this.notasEntrega || null,
          hora_programada: this.horaProgramada || null
        });

        const [orden] = await SB.insertN('taq_ordenes', {
          mesa: this.mesa, total, subtotal: total,
          usuario_id: Auth.user?.id || null,
          cuenta_id: cuenta.id
        });
        await SB.insertN('taq_orden_items', this.items.map(i => ({
          orden_id: orden.id,
          producto_id: i.producto_id,
          nombre_producto: i.nombre,
          cantidad: i.cantidad,
          precio_unitario: i.precio,
          notas: i.notas || null
        })));
        Auth.audit('pedido_creado', orden.id, { numero: orden.numero, cuenta_id: cuenta.id, mesa: this.mesa, total });
        App.toast('Pedido #' + orden.numero + ' creado');
      }
      this.clearDraft();
      location.hash = 'pedidos';
    } catch (e) {
      ErrorLogger?.capture(e, 'NuevoPedido.guardar');
      App.toast('Error al guardar: ' + e.message, 'error');
      this._working = false;
      const btn = document.getElementById('btnGuardar');
      if (btn) btn.disabled = false;
    }
  }
};
