/**
 * corte.js — Corte de caja por turno
 * Cada cajero tiene su propio turno. Al hacer corte, cierra su turno.
 * El nuevo cajero abre turno limpio.
 */
const Corte = {
  turnoActivo: null,
  _resumen: null,  // { totalVentas, numOrdenes, prodList } del turno actual

  async render(el) {
    // Verificar si hay turno activo del usuario actual
    const turnos = await SB.getN('taq_turnos', `usuario_id=eq.${Auth.user.id}&estado=eq.activo&limit=1`);
    this.turnoActivo = turnos.length ? turnos[0] : null;

    if (!this.turnoActivo) {
      this.renderSinTurno(el);
    } else {
      await this.renderConTurno(el);
    }
  },

  async renderSinTurno(el) {
    // Sin turno activo: mostrar ventas de hoy y permitir corte igual
    const desde = App.inicioDia(App.hoy());
    const ordenes = await SB.getN('taq_ordenes', `estado=eq.cobrada&cobrada_at=gte.${desde}&order=cobrada_at.desc&limit=200`);
    const canceladas = await SB.getN('taq_ordenes', `estado=eq.cancelada&created_at=gte.${desde}&select=id&limit=500`);

    let items = [];
    if (ordenes.length) {
      const ids = ordenes.map(o => o.id);
      items = await SB.get('taq_orden_items', `orden_id=in.(${ids.join(',')})&order=created_at&limit=1000`);
    }

    const totalVentas = ordenes.reduce((s, o) => s + parseFloat(o.total || 0), 0);

    // Desglose por método de pago
    const porMetodo = { efectivo: 0, tarjeta: 0, transferencia: 0 };
    ordenes.forEach(o => {
      const m = o.metodo_pago || 'efectivo';
      porMetodo[m] = (porMetodo[m] || 0) + parseFloat(o.total || 0);
    });

    const prodMap = {};
    items.forEach(i => {
      if (!prodMap[i.nombre_producto]) prodMap[i.nombre_producto] = { nombre: i.nombre_producto, cantidad: 0, total: 0 };
      prodMap[i.nombre_producto].cantidad += i.cantidad;
      prodMap[i.nombre_producto].total += i.cantidad * parseFloat(i.precio_unitario);
    });
    const prodList = Object.values(prodMap).sort((a, b) => b.cantidad - a.cantidad);

    this._resumen = { totalVentas, numOrdenes: ordenes.length, prodList };

    el.innerHTML = `
      <div class="view-header">
        <h1>Corte de Caja</h1>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-outline" onclick="Corte.exportarCSV()">⬇️ CSV</button>
          <button class="btn btn-sm btn-outline" onclick="Corte.iniciarTurno()">▶ Iniciar Turno</button>
        </div>
      </div>

      <p style="color:var(--muted);font-size:.82rem;margin-bottom:12px">
        Sin turno abierto — mostrando todas las ventas de hoy
      </p>

      <div class="corte-resumen">
        <div class="corte-stat corte-total">
          <span class="corte-stat-label">Ventas de Hoy</span>
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

      ${ordenes.length ? `
      <div class="corte-resumen" style="margin-top:8px">
        <div class="corte-stat">
          <span class="corte-stat-label">💵 Efectivo</span>
          <span class="corte-stat-value" style="color:var(--success)">$${(porMetodo.efectivo||0).toFixed(0)}</span>
        </div>
        <div class="corte-stat">
          <span class="corte-stat-label">💳 Tarjeta</span>
          <span class="corte-stat-value">$${(porMetodo.tarjeta||0).toFixed(0)}</span>
        </div>
        <div class="corte-stat">
          <span class="corte-stat-label">📱 Transferencia</span>
          <span class="corte-stat-value">$${(porMetodo.transferencia||0).toFixed(0)}</span>
        </div>
      </div>` : ''}

      <h2 style="margin:1.5rem 0 .8rem;">Productos Vendidos</h2>
      <table class="corte-table">
        <thead><tr><th>Producto</th><th>Cant.</th><th>Total</th></tr></thead>
        <tbody>
          ${prodList.map(p => `<tr><td>${p.nombre}</td><td>${p.cantidad}</td><td>$${p.total.toFixed(0)}</td></tr>`).join('')}
          ${!prodList.length ? '<tr><td colspan="3" style="text-align:center;opacity:.5">Sin ventas hoy</td></tr>' : ''}
        </tbody>
      </table>

      <h2 style="margin:1.5rem 0 .8rem;">Pedidos del Día</h2>
      <table class="corte-table">
        <thead><tr><th>#</th><th>Mesa</th><th>Total</th><th>Hora</th><th></th></tr></thead>
        <tbody>
          ${ordenes.map(o => `
            <tr>
              <td>${o.numero}</td>
              <td>${o.mesa || 'Llevar'}</td>
              <td>$${parseFloat(o.total).toFixed(0)}</td>
              <td>${new Date(o.cobrada_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
              <td>${o.cuenta_id ? `<button class="btn btn-sm btn-outline" onclick="Cobrar.imprimirTicketCerrado('${o.cuenta_id}')">🖨️</button>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${ordenes.length ? `
        <button class="btn btn-danger btn-block btn-lg" onclick="Corte.cerrarDia()" style="margin-top:1.5rem;">
          Registrar Corte de Hoy
        </button>
      ` : ''}

      <h2 style="margin:2rem 0 .8rem;">Historial de Cortes</h2>
      <div id="historialCortes"><p class="loading">Cargando...</p></div>
    `;
    this.loadHistorial();
  },

  async renderConTurno(el) {
    const turno = this.turnoActivo;
    // Convertir a formato Z para evitar que el + de +00:00 se interprete como espacio en URL
    const inicio = new Date(turno.inicio).toISOString();

    // Órdenes cobradas durante este turno
    const ordenes = await SB.getN('taq_ordenes', `estado=eq.cobrada&cobrada_at=gte.${inicio}&turno_id=eq.${turno.id}&order=cobrada_at.desc&limit=500`);
    // También órdenes cobradas sin turno_id en este período (compatibilidad)
    const ordenesSinTurno = await SB.getN('taq_ordenes', `estado=eq.cobrada&cobrada_at=gte.${inicio}&turno_id=is.null&order=cobrada_at.desc&limit=500`);
    const todasOrdenes = [...ordenes, ...ordenesSinTurno];

    const canceladas = await SB.getN('taq_ordenes', `estado=eq.cancelada&created_at=gte.${inicio}&select=id&limit=500`);

    let items = [];
    if (todasOrdenes.length) {
      const ids = todasOrdenes.map(o => o.id);
      items = await SB.getAll('taq_orden_items', `orden_id=in.(${ids.join(',')})&order=created_at`);
    }

    const totalVentas = todasOrdenes.reduce((s, o) => s + parseFloat(o.total || 0), 0);
    const horasActivo = ((Date.now() - new Date(inicio).getTime()) / 3600000).toFixed(1);

    // Desglose por método de pago
    const porMetodo = { efectivo: 0, tarjeta: 0, transferencia: 0 };
    todasOrdenes.forEach(o => {
      const m = o.metodo_pago || 'efectivo';
      porMetodo[m] = (porMetodo[m] || 0) + parseFloat(o.total || 0);
    });

    const prodMap = {};
    items.forEach(i => {
      const key = i.nombre_producto;
      if (!prodMap[key]) prodMap[key] = { nombre: key, cantidad: 0, total: 0 };
      prodMap[key].cantidad += i.cantidad;
      prodMap[key].total += i.cantidad * parseFloat(i.precio_unitario);
    });
    const prodList = Object.values(prodMap).sort((a, b) => b.cantidad - a.cantidad);

    // Guardar en instancia para que cerrarTurno() lo lea sin depender del HTML
    this._resumen = { totalVentas, numOrdenes: todasOrdenes.length, prodList };

    el.innerHTML = `
      <div class="view-header">
        <h1>Mi Turno</h1>
        <span class="corte-fecha">${Auth.user.avatar} ${Auth.user.nombre} — ${horasActivo}h activo</span>
        <button class="btn btn-sm btn-outline" onclick="Corte.exportarCSV()">⬇️ CSV</button>
      </div>

      <div class="corte-resumen">
        <div class="corte-stat corte-total">
          <span class="corte-stat-label">Mis Ventas</span>
          <span class="corte-stat-value">$${totalVentas.toFixed(0)}</span>
        </div>
        <div class="corte-stat">
          <span class="corte-stat-label">Pedidos Cobrados</span>
          <span class="corte-stat-value">${todasOrdenes.length}</span>
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
          <span class="corte-stat-value">$${todasOrdenes.length ? (totalVentas / todasOrdenes.length).toFixed(0) : 0}</span>
        </div>
      </div>

      ${todasOrdenes.length ? `
      <div class="corte-resumen" style="margin-top:8px">
        <div class="corte-stat">
          <span class="corte-stat-label">💵 Efectivo</span>
          <span class="corte-stat-value" style="color:var(--success)">$${(porMetodo.efectivo||0).toFixed(0)}</span>
        </div>
        <div class="corte-stat">
          <span class="corte-stat-label">💳 Tarjeta</span>
          <span class="corte-stat-value">$${(porMetodo.tarjeta||0).toFixed(0)}</span>
        </div>
        <div class="corte-stat">
          <span class="corte-stat-label">📱 Transferencia</span>
          <span class="corte-stat-value">$${(porMetodo.transferencia||0).toFixed(0)}</span>
        </div>
      </div>` : ''}

      <h2 style="margin:1.5rem 0 .8rem;">Productos Vendidos</h2>
      <table class="corte-table">
        <thead><tr><th>Producto</th><th>Cant.</th><th>Total</th></tr></thead>
        <tbody>
          ${prodList.map(p => `<tr><td>${p.nombre}</td><td>${p.cantidad}</td><td>$${p.total.toFixed(0)}</td></tr>`).join('')}
          ${!prodList.length ? '<tr><td colspan="3" style="text-align:center;opacity:.5">Sin ventas en este turno</td></tr>' : ''}
        </tbody>
      </table>

      <h2 style="margin:1.5rem 0 .8rem;">Historial de Pedidos</h2>
      <table class="corte-table">
        <thead><tr><th>#</th><th>Mesa</th><th>Total</th><th>Hora</th><th></th></tr></thead>
        <tbody>
          ${todasOrdenes.map(o => `
            <tr>
              <td>${o.numero}</td>
              <td>${o.mesa || 'Llevar'}</td>
              <td>$${parseFloat(o.total).toFixed(0)}</td>
              <td>${new Date(o.cobrada_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
              <td>${o.cuenta_id ? `<button class="btn btn-sm btn-outline" onclick="Cobrar.imprimirTicketCerrado('${o.cuenta_id}')">🖨️</button>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <button class="btn btn-danger btn-block btn-lg" onclick="Corte.cerrarTurno()" style="margin-top:1.5rem;">
        Cerrar Mi Turno y Hacer Corte
      </button>

      <h2 style="margin:2rem 0 .8rem;">Historial de Cortes</h2>
      <div id="historialCortes"><p class="loading">Cargando...</p></div>
    `;

    this.loadHistorial();
  },

  async iniciarTurno() {
    try {
      const [turno] = await SB.insertN('taq_turnos', { usuario_id: Auth.user.id });
      this.turnoActivo = turno;
      App.toast('Turno iniciado');
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Corte.iniciarTurno');
      App.toast('Error al iniciar turno: ' + e.message, 'error');
    }
  },

  _closing: false,

  async cerrarTurno() {
    if (this._closing) return;
    if (!confirm('¿Cerrar tu turno? Se guardará el corte con tus ventas.')) return;
    this._closing = true;

    const { totalVentas, numOrdenes, prodList } = this._resumen || {};
    const turno = this.turnoActivo;
    const ahora = new Date().toISOString();

    try {
      await SB.update('taq_turnos', `id=eq.${turno.id}`, {
        estado: 'cerrado',
        fin: ahora,
        total_ventas: totalVentas,
        total_ordenes: numOrdenes
      });

      await SB.insertN('taq_cortes', {
        fecha: App.hoy(),
        total_ventas: totalVentas,
        total_ordenes: numOrdenes,
        productos_vendidos: prodList,
        notas: `Turno de ${Auth.user.nombre}: ${new Date(turno.inicio).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})} — ${new Date(ahora).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}`
      });

      Auth.audit('corte_modificado', turno.id, {
        total_ventas: totalVentas,
        total_ordenes: numOrdenes,
        horas: ((Date.now() - new Date(turno.inicio).getTime()) / 3600000).toFixed(1)
      });

      this.turnoActivo = null;
      this._closing = false;
      App.toast('Turno cerrado. Corte guardado.');
      this.render(document.getElementById('main'));
    } catch (e) {
      this._closing = false;
      ErrorLogger?.capture(e, 'Corte.cerrarTurno');
      App.toast('Error al cerrar turno: ' + e.message, 'error');
    }
  },

  async loadHistorial() {
    const cortes = await SB.getN('taq_cortes', 'order=created_at.desc&limit=30');
    const el = document.getElementById('historialCortes');
    if (!el) return;

    if (!cortes.length) {
      el.innerHTML = '<p class="empty-state">Sin cortes guardados aún</p>';
      return;
    }

    el.innerHTML = `
      <table class="corte-table">
        <thead><tr><th>Fecha</th><th>Turno</th><th>Pedidos</th><th>Ventas</th><th></th></tr></thead>
        <tbody>
          ${cortes.map(c => {
            const fecha = new Date(c.created_at || c.fecha + 'T12:00:00');
            const dia = fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
            return `
              <tr>
                <td>${dia}</td>
                <td style="font-size:.75rem;color:var(--muted)">${c.notas || '—'}</td>
                <td>${c.total_ordenes}</td>
                <td><strong>$${parseFloat(c.total_ventas).toFixed(0)}</strong></td>
                <td><button class="btn btn-sm btn-outline" onclick="Corte.verDetalle('${c.id}')">Ver</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  async verDetalle(corteId) {
    const arr = await SB.get('taq_cortes', `id=eq.${corteId}`);
    if (!arr.length) return;
    const c = arr[0];
    const prods = c.productos_vendidos || [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h2>Detalle de Corte</h2>
          <button class="btn btn-sm btn-outline" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        ${c.notas ? `<p style="color:var(--muted);font-size:.85rem;margin-bottom:12px">${c.notas}</p>` : ''}
        <div class="corte-resumen" style="margin-bottom:12px;">
          <div class="corte-stat corte-total">
            <span class="corte-stat-label">Ventas</span>
            <span class="corte-stat-value">$${parseFloat(c.total_ventas).toFixed(0)}</span>
          </div>
          <div class="corte-stat">
            <span class="corte-stat-label">Pedidos</span>
            <span class="corte-stat-value">${c.total_ordenes}</span>
          </div>
        </div>
        <table class="corte-table">
          <thead><tr><th>Producto</th><th>Cant.</th><th>Total</th></tr></thead>
          <tbody>
            ${prods.map(p => `<tr><td>${p.nombre}</td><td>${p.cantidad}</td><td>$${parseFloat(p.total).toFixed(0)}</td></tr>`).join('')}
            ${!prods.length ? '<tr><td colspan="3" style="text-align:center;opacity:.5">Sin detalle</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async exportarCSV() {
    // Exportar órdenes cobradas del turno activo (o del día si no hay turno)
    const resumen = this._resumen;
    if (!resumen) { App.toast('Sin datos para exportar'); return; }

    const desde = this.turnoActivo?.inicio || App.inicioDia(App.hoy());
    const ordenes = await SB.getAllN('taq_ordenes',
      `estado=eq.cobrada&cobrada_at=gte.${desde}&order=cobrada_at`);

    if (!ordenes.length) { App.toast('Sin ventas para exportar'); return; }

    const ids = ordenes.map(o => o.id).join(',');
    const items = await SB.getAll('taq_orden_items', `orden_id=in.(${ids})&order=created_at`);

    // Construir CSV
    const enc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Fecha','Hora','#Orden','Mesa','Producto','Cant','Precio Unit','Subtotal','Método','Total Cuenta'];
    const rows = items.map(i => {
      const orden = ordenes.find(o => o.id === i.orden_id) || {};
      const fecha = new Date(orden.cobrada_at || orden.created_at);
      return [
        fecha.toLocaleDateString('es-MX'),
        fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        orden.numero || '',
        orden.mesa || '',
        i.nombre_producto,
        i.cantidad,
        parseFloat(i.precio_unitario || 0).toFixed(2),
        (i.cantidad * parseFloat(i.precio_unitario || 0)).toFixed(2),
        orden.metodo_pago || 'efectivo',
        parseFloat(orden.total || 0).toFixed(2)
      ].map(enc).join(',');
    });

    const csv = [header.map(enc).join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventas_${App.hoy()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    App.toast('CSV descargado');
  },

  // Corte sin turno: guarda un corte de las ventas del día sin cerrar turno
  async cerrarDia() {
    if (this._closing) return;
    if (!confirm('¿Registrar corte de hoy? Se guardará el resumen de ventas del día.')) return;
    this._closing = true;

    const { totalVentas, numOrdenes, prodList } = this._resumen || {};
    const hoy = App.hoy();
    const ahora = new Date().toISOString();

    try {
      await SB.insertN('taq_cortes', {
        fecha: hoy,
        total_ventas: totalVentas,
        total_ordenes: numOrdenes,
        productos_vendidos: prodList,
        notas: `Corte del día ${hoy} — sin turno asignado`
      });

      Auth.audit('corte_modificado', null, {
        total_ventas: totalVentas,
        total_ordenes: numOrdenes
      });

      this._closing = false;
      App.toast('Corte registrado correctamente');
      this.render(document.getElementById('main'));
    } catch (e) {
      this._closing = false;
      ErrorLogger?.capture(e, 'Corte.cerrarDia');
      App.toast('Error al registrar corte: ' + e.message, 'error');
    }
  }
};
