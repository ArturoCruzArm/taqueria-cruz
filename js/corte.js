/**
 * corte.js — Corte de caja y resumen de ventas del día
 */
const Corte = {
  async render(el) {
    const hoy = new Date().toISOString().split('T')[0];
    const inicio = hoy + 'T00:00:00';
    const fin = hoy + 'T23:59:59';

    const ordenes = await SB.get('taq_ordenes', `estado=eq.cobrada&cobrada_at=gte.${inicio}&cobrada_at=lte.${fin}&order=cobrada_at.desc`);
    const canceladas = await SB.get('taq_ordenes', `estado=eq.cancelada&created_at=gte.${inicio}&created_at=lte.${fin}&select=id`);

    let items = [];
    if (ordenes.length) {
      const ids = ordenes.map(o => o.id);
      items = await SB.get('taq_orden_items', `orden_id=in.(${ids.join(',')})&order=created_at`);
    }

    const totalVentas = ordenes.reduce((s, o) => s + parseFloat(o.total || 0), 0);

    // Productos vendidos agrupados
    const prodMap = {};
    items.forEach(i => {
      const key = i.nombre_producto;
      if (!prodMap[key]) prodMap[key] = { nombre: key, cantidad: 0, total: 0 };
      prodMap[key].cantidad += i.cantidad;
      prodMap[key].total += i.cantidad * parseFloat(i.precio_unitario);
    });
    const prodList = Object.values(prodMap).sort((a, b) => b.cantidad - a.cantidad);

    el.innerHTML = `
      <div class="view-header">
        <h1>Corte de Caja</h1>
        <span class="corte-fecha">${new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>

      <div class="corte-resumen">
        <div class="corte-stat corte-total">
          <span class="corte-stat-label">Total Ventas</span>
          <span class="corte-stat-value">$${totalVentas.toFixed(0)}</span>
        </div>
        <div class="corte-stat">
          <span class="corte-stat-label">Pedidos Cobrados</span>
          <span class="corte-stat-value">${ordenes.length}</span>
        </div>
        <div class="corte-stat">
          <span class="corte-stat-label">Productos Vendidos</span>
          <span class="corte-stat-value">${items.reduce((s, i) => s + i.cantidad, 0)}</span>
        </div>
        <div class="corte-stat">
          <span class="corte-stat-label">Cancelados</span>
          <span class="corte-stat-value">${canceladas.length}</span>
        </div>
        <div class="corte-stat">
          <span class="corte-stat-label">Ticket Promedio</span>
          <span class="corte-stat-value">$${ordenes.length ? (totalVentas / ordenes.length).toFixed(0) : 0}</span>
        </div>
      </div>

      <h2 style="margin:1.5rem 0 .8rem;">Productos Vendidos</h2>
      <table class="corte-table">
        <thead><tr><th>Producto</th><th>Cant.</th><th>Total</th></tr></thead>
        <tbody>
          ${prodList.map(p => `<tr><td>${p.nombre}</td><td>${p.cantidad}</td><td>$${p.total.toFixed(0)}</td></tr>`).join('')}
          ${!prodList.length ? '<tr><td colspan="3" style="text-align:center;opacity:.5">Sin ventas hoy</td></tr>' : ''}
        </tbody>
      </table>

      <h2 style="margin:1.5rem 0 .8rem;">Historial de Pedidos</h2>
      <table class="corte-table">
        <thead><tr><th>#</th><th>Mesa</th><th>Total</th><th>Hora</th></tr></thead>
        <tbody>
          ${ordenes.map(o => `
            <tr>
              <td>${o.numero}</td>
              <td>${o.mesa || 'Llevar'}</td>
              <td>$${parseFloat(o.total).toFixed(0)}</td>
              <td>${new Date(o.cobrada_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <button class="btn btn-primary btn-block" onclick="Corte.guardarCorte(${totalVentas}, ${ordenes.length}, '${encodeURIComponent(JSON.stringify(prodList))}')" style="margin-top:1.5rem;">
        Guardar Corte del Día
      </button>
    `;
  },

  async guardarCorte(total, numOrdenes, prodListEncoded) {
    const prodList = JSON.parse(decodeURIComponent(prodListEncoded));
    const hoy = new Date().toISOString().split('T')[0];

    // Verificar si ya existe corte de hoy
    const existing = await SB.get('taq_cortes', `fecha=eq.${hoy}`);
    if (existing.length) {
      await SB.update('taq_cortes', `fecha=eq.${hoy}`, {
        total_ventas: total,
        total_ordenes: numOrdenes,
        productos_vendidos: prodList
      });
    } else {
      await SB.insert('taq_cortes', {
        fecha: hoy,
        total_ventas: total,
        total_ordenes: numOrdenes,
        productos_vendidos: prodList
      });
    }
    App.toast('Corte guardado');
  }
};
