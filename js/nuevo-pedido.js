/**
 * nuevo-pedido.js — Crear o editar un pedido
 */
const NuevoPedido = {
  orden: null,
  items: [], // { producto_id, nombre, precio, cantidad, notas }
  mesa: '',

  async render(el, ordenId) {
    this.items = [];
    this.mesa = '';
    this.orden = null;

    // Si estamos editando una orden existente
    if (ordenId) {
      const arr = await SB.get('taq_ordenes', `id=eq.${ordenId}`);
      if (arr.length) {
        this.orden = arr[0];
        this.mesa = this.orden.mesa || '';
        const existingItems = await SB.get('taq_orden_items', `orden_id=eq.${ordenId}&order=created_at`);
        this.items = existingItems.map(i => ({
          producto_id: i.producto_id,
          nombre: i.nombre_producto,
          precio: parseFloat(i.precio_unitario),
          cantidad: i.cantidad,
          notas: i.notas || ''
        }));
      }
    }

    el.innerHTML = `
      <div class="view-header">
        <button class="btn btn-outline" onclick="location.hash='pedidos'">&larr; Volver</button>
        <h1>${this.orden ? 'Editar Pedido #' + this.orden.numero : 'Nuevo Pedido'}</h1>
      </div>

      <div class="nuevo-pedido-layout">
        <div class="menu-panel">
          <div class="mesa-selector">
            <label>Mesa:</label>
            <div class="mesa-options">
              ${[1,2,3,4,5,6,7,8].map(n => `<button class="mesa-btn ${this.mesa === 'Mesa ' + n ? 'active' : ''}" onclick="NuevoPedido.setMesa('Mesa ${n}')">${n}</button>`).join('')}
              <button class="mesa-btn ${this.mesa === 'Para llevar' ? 'active' : ''}" onclick="NuevoPedido.setMesa('Para llevar')">Llevar</button>
            </div>
          </div>

          <div class="cat-tabs" id="catTabs"></div>
          <div class="productos-grid" id="productosGrid"></div>
        </div>

        <div class="ticket-panel">
          <h2 class="ticket-title">${this.mesa || 'Selecciona mesa'}</h2>
          <div id="ticketItems" class="ticket-items"></div>
          <div class="ticket-footer">
            <div class="ticket-total">Total: $<span id="ticketTotal">0</span></div>
            <button class="btn btn-primary btn-block" onclick="NuevoPedido.guardar()" id="btnGuardar" disabled>
              ${this.orden ? 'Actualizar Pedido' : 'Crear Pedido'}
            </button>
          </div>
        </div>
      </div>
    `;

    this.renderCategorias();
    this.renderTicket();
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
      if (!p) return;
      this.items.push({
        producto_id: p.id,
        nombre: p.nombre,
        precio: parseFloat(p.precio),
        cantidad: 1,
        notas: ''
      });
    }
    this.renderTicket();
    // Re-render productos para mostrar badge
    const activeCat = document.querySelector('.cat-tab.active');
    if (activeCat) this.renderProductos(activeCat.dataset.cat);
  },

  removeItem(idx) {
    this.items.splice(idx, 1);
    this.renderTicket();
    const activeCat = document.querySelector('.cat-tab.active');
    if (activeCat) this.renderProductos(activeCat.dataset.cat);
  },

  changeQty(idx, delta) {
    this.items[idx].cantidad += delta;
    if (this.items[idx].cantidad < 1) this.items.splice(idx, 1);
    this.renderTicket();
    const activeCat = document.querySelector('.cat-tab.active');
    if (activeCat) this.renderProductos(activeCat.dataset.cat);
  },

  setNota(idx, nota) {
    this.items[idx].notas = nota;
  },

  setMesa(mesa) {
    this.mesa = mesa;
    document.querySelectorAll('.mesa-btn').forEach(b => b.classList.toggle('active', b.textContent.trim() === mesa || 'Mesa ' + b.textContent.trim() === mesa));
    const title = document.querySelector('.ticket-title');
    if (title) title.textContent = mesa;
    this.updateGuardarBtn();
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
    if (btn) btn.disabled = !this.mesa || !this.items.length;
  },

  async guardar() {
    if (!this.mesa || !this.items.length) return;

    const total = this.items.reduce((s, i) => s + i.precio * i.cantidad, 0);

    try {
      if (this.orden) {
        // Actualizar orden existente
        await SB.update('taq_ordenes', `id=eq.${this.orden.id}`, { mesa: this.mesa, total, subtotal: total });
        await SB.delete('taq_orden_items', `orden_id=eq.${this.orden.id}`);
        await SB.insert('taq_orden_items', this.items.map(i => ({
          orden_id: this.orden.id,
          producto_id: i.producto_id,
          nombre_producto: i.nombre,
          cantidad: i.cantidad,
          precio_unitario: i.precio,
          notas: i.notas || null
        })));
        App.toast('Pedido actualizado');
      } else {
        // Crear orden nueva
        const [orden] = await SB.insert('taq_ordenes', { mesa: this.mesa, total, subtotal: total });
        await SB.insert('taq_orden_items', this.items.map(i => ({
          orden_id: orden.id,
          producto_id: i.producto_id,
          nombre_producto: i.nombre,
          cantidad: i.cantidad,
          precio_unitario: i.precio,
          notas: i.notas || null
        })));
        App.toast('Pedido #' + orden.numero + ' creado');
      }
      location.hash = 'pedidos';
    } catch (e) {
      App.toast('Error al guardar: ' + e.message, 'error');
    }
  }
};
