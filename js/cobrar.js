/**
 * cobrar.js — Cobrar una orden y calcular cambio
 */
const Cobrar = {
  orden: null,
  items: [],

  async render(el, ordenId) {
    if (!ordenId) { location.hash = 'pedidos'; return; }

    const arr = await SB.get('taq_ordenes', `id=eq.${ordenId}`);
    if (!arr.length) { location.hash = 'pedidos'; return; }
    this.orden = arr[0];
    this.items = await SB.get('taq_orden_items', `orden_id=eq.${ordenId}&order=created_at`);

    const total = parseFloat(this.orden.total) || 0;

    el.innerHTML = `
      <div class="view-header">
        <button class="btn btn-outline" onclick="location.hash='pedidos'">&larr; Volver</button>
        <h1>Cobrar Pedido #${this.orden.numero}</h1>
      </div>

      <div class="cobrar-layout">
        <div class="cobrar-ticket">
          <h2>${this.orden.mesa || 'Para llevar'}</h2>
          <table class="cobrar-table">
            <thead><tr><th>Cant</th><th>Producto</th><th>Precio</th><th>Subtotal</th></tr></thead>
            <tbody>
              ${this.items.map(i => `
                <tr>
                  <td>${i.cantidad}</td>
                  <td>${i.nombre_producto}${i.notas ? '<br><small>' + i.notas + '</small>' : ''}</td>
                  <td>$${parseFloat(i.precio_unitario).toFixed(0)}</td>
                  <td>$${(i.cantidad * parseFloat(i.precio_unitario)).toFixed(0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="cobrar-total-line">
            <strong>TOTAL: $${total.toFixed(0)}</strong>
          </div>
        </div>

        <div class="cobrar-pago">
          <h3>Pago</h3>
          <div class="pago-rapido">
            ${[50, 100, 200, 500].map(v => `<button class="pago-btn" onclick="Cobrar.setPago(${v})">$${v}</button>`).join('')}
          </div>
          <div class="pago-custom">
            <label>Recibido:</label>
            <input type="number" id="pagoInput" class="pago-input" placeholder="$0" oninput="Cobrar.calcCambio()" inputmode="numeric">
          </div>
          <div class="pago-cambio" id="pagoCambio"></div>
          <button class="btn btn-success btn-block btn-lg" onclick="Cobrar.cobrar()" id="btnCobrar">
            Cobrar $${total.toFixed(0)}
          </button>
          <button class="btn btn-outline btn-block" onclick="Cobrar.cancelar()" style="margin-top:8px;">
            Cancelar Pedido
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
    const pago = parseFloat(document.getElementById('pagoInput').value) || 0;
    const total = parseFloat(this.orden.total) || 0;
    const cambio = pago - total;
    const el = document.getElementById('pagoCambio');

    if (pago === 0) {
      el.innerHTML = '';
    } else if (cambio >= 0) {
      el.innerHTML = `<span class="cambio-ok">Cambio: $${cambio.toFixed(0)}</span>`;
    } else {
      el.innerHTML = `<span class="cambio-falta">Faltan: $${Math.abs(cambio).toFixed(0)}</span>`;
    }
  },

  async cobrar() {
    await SB.update('taq_ordenes', `id=eq.${this.orden.id}`, {
      estado: 'cobrada',
      cobrada_at: new Date().toISOString()
    });
    App.toast('Pedido #' + this.orden.numero + ' cobrado');
    location.hash = 'pedidos';
  },

  async cancelar() {
    if (!confirm('¿Cancelar este pedido?')) return;
    await SB.update('taq_ordenes', `id=eq.${this.orden.id}`, { estado: 'cancelada' });
    App.toast('Pedido cancelado');
    location.hash = 'pedidos';
  }
};
