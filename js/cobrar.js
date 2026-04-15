/**
 * cobrar.js — Cobrar cuenta o pedido individual
 * Rutas:
 *   #cobrar/cuenta/ID  → Cobrar toda la cuenta
 *   #cobrar/ID         → Cobrar pedido individual (compatibilidad)
 */
const Cobrar = {
  cuenta: null,
  ordenes: [],
  items: [],
  total: 0,
  descuento: 0,
  _working: false,

  async render(el, param1, param2) {
    this.cuenta = null;
    this.ordenes = [];
    this.items = [];

    if (param1 === 'cuenta' && param2) {
      // Cobrar cuenta completa
      const cuentas = await SB.get('taq_cuentas', `id=eq.${param2}`);
      if (!cuentas.length) { location.hash = 'pedidos'; return; }
      this.cuenta = cuentas[0];
      this.ordenes = await SB.getN('taq_ordenes', `cuenta_id=eq.${param2}&estado=neq.cancelada&order=created_at`);
      if (this.ordenes.length) {
        const ids = this.ordenes.map(o => o.id);
        this.items = await SB.get('taq_orden_items', `orden_id=in.(${ids.join(',')})&order=created_at`);
      }
      this.total = this.ordenes.reduce((s, o) => s + parseFloat(o.total || 0), 0);

    } else if (param1 && param1 !== 'cuenta') {
      // Cobrar pedido individual (compatibilidad)
      const arr = await SB.get('taq_ordenes', `id=eq.${param1}`);
      if (!arr.length) { location.hash = 'pedidos'; return; }
      this.ordenes = [arr[0]];
      this.items = await SB.get('taq_orden_items', `orden_id=eq.${param1}&order=created_at`);
      this.total = parseFloat(arr[0].total) || 0;
    } else {
      location.hash = 'pedidos';
      return;
    }

    const nombre = this.cuenta
      ? (this.cuenta.nombre_cliente || this.cuenta.mesa || 'Cliente')
      : (this.ordenes[0]?.mesa || 'Para llevar');

    el.innerHTML = `
      <div class="view-header">
        <button class="btn btn-outline" onclick="location.hash='pedidos'">&larr; Volver</button>
        <h1>Cobrar${this.cuenta ? ' Cuenta' : ' #' + this.ordenes[0]?.numero}</h1>
        <button class="btn btn-sm btn-outline" onclick="Cobrar.imprimirTicket()">🖨️ Ticket</button>
      </div>

      <div class="cobrar-layout">
        <div class="cobrar-ticket" id="ticket-imprimible">
          <div class="ticket-header-print" style="display:none">
            <strong>${App.esc(Auth.negocio?.nombre || 'Taquería')}</strong>
            <div>${new Date().toLocaleString('es-MX')}</div>
          </div>
          <h2>${nombre}</h2>
          ${this.ordenes.length > 1 ? `<p style="color:var(--text2);font-size:.85rem">${this.ordenes.length} pedidos</p>` : ''}
          <table class="cobrar-table">
            <thead><tr><th>Cant</th><th>Producto</th><th>Precio</th><th>Subtotal</th></tr></thead>
            <tbody>
              ${this.items.map(i => `
                <tr>
                  <td>${i.cantidad}</td>
                  <td>${App.esc(i.nombre_producto)}${i.notas ? '<br><small>' + App.esc(i.notas) + '</small>' : ''}</td>
                  <td>$${parseFloat(i.precio_unitario).toFixed(0)}</td>
                  <td>$${(i.cantidad * parseFloat(i.precio_unitario)).toFixed(0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="cobrar-total-line">
            <strong>TOTAL: $${this.total.toFixed(0)}</strong>
          </div>
        </div>

        <div class="cobrar-pago">
          <h3>Pago</h3>

          <!-- Método de pago -->
          <div class="pago-metodo">
            <label class="pago-metodo-btn active" id="met-efectivo">
              <input type="radio" name="metodo" value="efectivo" checked onchange="Cobrar.calcCambio()"> 💵 Efectivo
            </label>
            <label class="pago-metodo-btn" id="met-tarjeta">
              <input type="radio" name="metodo" value="tarjeta" onchange="Cobrar.calcCambio()"> 💳 Tarjeta
            </label>
            <label class="pago-metodo-btn" id="met-transferencia">
              <input type="radio" name="metodo" value="transferencia" onchange="Cobrar.calcCambio()"> 📱 Transferencia
            </label>
          </div>

          <!-- Descuento -->
          <div class="pago-descuento">
            <label>Descuento:</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="number" id="descuentoInput" class="pago-input" placeholder="0" min="0"
                style="width:90px" oninput="Cobrar.calcCambio()" inputmode="numeric">
              <select id="descuentoTipo" onchange="Cobrar.calcCambio()" style="flex:1;padding:8px;background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:8px">
                <option value="pct">%</option>
                <option value="monto">$</option>
              </select>
              <input type="text" id="descuentoMotivo" placeholder="Motivo"
                style="flex:2;padding:8px;background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:8px">
            </div>
          </div>

          <div class="pago-rapido">
            ${[50, 100, 200, 500].map(v => `<button class="pago-btn" onclick="Cobrar.setPago(${v})">$${v}</button>`).join('')}
          </div>
          <div class="pago-custom">
            <label>Recibido:</label>
            <input type="number" id="pagoInput" class="pago-input" placeholder="$0" oninput="Cobrar.calcCambio()" inputmode="numeric">
          </div>
          <div class="pago-cambio" id="pagoCambio"></div>
          <button class="btn btn-success btn-block btn-lg" onclick="Cobrar.cobrar()" id="btnCobrar">
            Cobrar $${this.total.toFixed(0)}
          </button>
          <button class="btn btn-outline btn-block" onclick="Cobrar.cancelar()" style="margin-top:8px;">
            Cancelar
          </button>
        </div>
      </div>
    `;
  },

  setPago(val) {
    document.getElementById('pagoInput').value = val;
    this.calcCambio();
  },

  calcCambio() {
    // Calcular descuento
    const descVal  = parseFloat(document.getElementById('descuentoInput')?.value) || 0;
    const descTipo = document.getElementById('descuentoTipo')?.value || 'pct';
    this.descuento = descTipo === 'pct'
      ? Math.round(this.total * descVal / 100 * 100) / 100
      : Math.min(descVal, this.total);

    const totalConDesc = Math.round((this.total - this.descuento) * 100) / 100;

    // Resaltar botón de método activo
    const metodo = document.querySelector('input[name="metodo"]:checked')?.value || 'efectivo';
    document.querySelectorAll('.pago-metodo-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('met-' + metodo)?.classList.add('active');

    const pago  = parseFloat(document.getElementById('pagoInput')?.value) || 0;
    const cambio = pago - totalConDesc;
    const el = document.getElementById('pagoCambio');

    let html = this.descuento > 0
      ? `<div class="descuento-resumen">Descuento: -$${this.descuento.toFixed(0)} → Total: <strong>$${totalConDesc.toFixed(0)}</strong></div>`
      : '';

    if (metodo !== 'efectivo') {
      html += `<span class="cambio-ok">Total a cobrar: $${totalConDesc.toFixed(0)}</span>`;
    } else if (pago === 0) {
      // no mostrar nada aún
    } else if (cambio >= 0) {
      html += `<span class="cambio-ok">Cambio: $${cambio.toFixed(0)}</span>`;
    } else {
      html += `<span class="cambio-falta">Faltan: $${Math.abs(cambio).toFixed(0)}</span>`;
    }
    el.innerHTML = html;
  },

  async cobrar() {
    if (this._working) return;  // guard contra doble tap

    const pago = parseFloat(document.getElementById('pagoInput')?.value) || 0;
    if (pago === 0 && !confirm('No se registró monto de pago. ¿Continuar de todas formas?')) return;

    const btn = document.getElementById('btnCobrar');
    this._working = true;
    if (btn) btn.disabled = true;

    try {
      const turnoActivo = await this.getTurnoActivo();

      // Un solo RPC = una sola transacción Postgres.
      // Si falla a medias, Postgres revierte todo automáticamente.
      const metodo  = document.querySelector('input[name="metodo"]:checked')?.value || 'efectivo';
      const descMot = document.getElementById('descuentoMotivo')?.value || null;
      const totalFinal = Math.round((this.total - (this.descuento || 0)) * 100) / 100;

      await SB.rpc('cobrar_cuenta', {
        p_cuenta_id:    this.cuenta?.id || null,
        p_orden_ids:    this.ordenes.map(o => o.id),
        p_usuario_id:   Auth.user?.id || null,
        p_turno_id:     turnoActivo?.id || null,
        p_metodo_pago:  metodo,
        p_descuento:    this.descuento || 0,
        p_descuento_mot: descMot
      });

      // Inventario se descuenta aparte (no bloquea el cobro si hay error)
      await this.descontarInventario();

      Auth.audit('cobrado', this.cuenta?.id || this.ordenes[0]?.id, {
        total: totalFinal,
        descuento: this.descuento || 0,
        pago,
        cambio: metodo === 'efectivo' ? pago - totalFinal : 0,
        metodo,
        ordenes: this.ordenes.map(o => o.numero),
        turno_id: turnoActivo?.id
      });

      App.toast('Cobrado $' + this.total.toFixed(0));
      location.hash = 'pedidos';
    } catch (e) {
      App.toast('Error al cobrar: ' + e.message, 'error');
      if (btn) btn.disabled = false;
      this._working = false;
    }
  },

  async cancelar() {
    if (!confirm('¿Cancelar?')) return;

    for (const o of this.ordenes) {
      await SB.update('taq_ordenes', `id=eq.${o.id}`, { estado: 'cancelada' });
    }
    if (this.cuenta) {
      await SB.update('taq_cuentas', `id=eq.${this.cuenta.id}`, { estado: 'cancelada' });
    }

    Auth.audit('cancelado', this.cuenta?.id || this.ordenes[0]?.id, {
      total: this.total
    }, 'warning');

    App.toast('Cancelado');
    location.hash = 'pedidos';
  },

  async descontarInventario() {
    try {
      const recetas = await SB.getN('taq_recetas', '');
      if (!recetas.length) return;

      // Acumular consumo total por ingrediente (varios items pueden usar el mismo)
      const consumo = {};
      for (const item of this.items) {
        for (const r of recetas.filter(r => r.producto_id === item.producto_id)) {
          consumo[r.ingrediente_id] = (consumo[r.ingrediente_id] || 0) + r.cantidad * item.cantidad;
        }
      }

      // Registrar cada descuento via función Postgres (atómico, con rastro completo)
      const cuentaId = this.ordenes[0]?.cuenta_id || this.ordenes[0]?.id || null;
      for (const [ingId, cantidad] of Object.entries(consumo)) {
        await SB.rpc('registrar_movimiento', {
          p_negocio_id:     SB.negocioId,
          p_ingrediente_id: ingId,
          p_tipo:           'venta',
          p_cantidad:       -cantidad,   // negativo = salida
          p_notas:          null,
          p_referencia_id:  cuentaId,
          p_usuario_id:     Auth.user?.id || null
        });
      }
    } catch (e) {
      console.warn('Error descontando inventario:', e);
    }
  },

  imprimirTicket() {
    // Mostrar encabezado de impresión y lanzar print
    const header = document.querySelector('.ticket-header-print');
    if (header) header.style.display = 'block';
    window.print();
    if (header) header.style.display = 'none';
  },

  async getTurnoActivo() {
    if (!Auth.user?.id) return null;
    const turnos = await SB.getN('taq_turnos', `usuario_id=eq.${Auth.user.id}&estado=eq.activo&limit=1`);
    return turnos.length ? turnos[0] : null;
  }
};
