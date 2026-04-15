/**
 * pedidos.js — Vista de pedidos agrupados por cuenta
 * Una cuenta = un cliente/mesa con N pedidos
 */
const Pedidos = {
  _sub: null,
  _subSolic: null,
  _lastSolicCount: -1,

  playAlert() { App.playSolicAlert(); },

  _tab: 'activos',

  render(el) {
    el.innerHTML = `
      <div class="view-header">
        <h1>Pedidos</h1>
        <button class="btn btn-primary btn-lg" onclick="location.hash='nuevo'">+ Nuevo</button>
      </div>
      <div id="solicitudes-panel"></div>
      <div class="inv-tabs" style="margin-bottom:12px">
        <button class="inv-tab active" id="tab-activos" onclick="Pedidos.showTab('activos',this)">Activos</button>
        <button class="inv-tab" id="tab-historial" onclick="Pedidos.showTab('historial',this)">Historial hoy</button>
      </div>
      <input type="search" id="pedidosBuscar" placeholder="Buscar mesa o cliente…"
        style="width:100%;padding:8px 12px;margin-bottom:10px;background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:.9rem"
        oninput="Pedidos.filtrar(this.value)">
      <div id="pedidos-list" class="pedidos-grid">
        <p class="loading">Cargando...</p>
      </div>
    `;
    this._tab = 'activos';
    this.load();
    this.loadSolicitudes();

    this._sub && SB.unsubscribe(this._sub);
    this._sub = SB.subscribeN('taq_ordenes', () => {
      if (App.currentView === 'pedidos') this.load();
    });

    this._subSolic && SB.unsubscribe(this._subSolic);
    this._subSolic = SB.subscribeN('taq_solicitudes', (change) => {
      if (App.currentView === 'pedidos') {
        this.loadSolicitudes();
        if (change?.eventType === 'INSERT') App.toast('Nueva solicitud de cliente 📱');
      }
    });
  },

  filtrar(texto) {
    const q = texto.toLowerCase().trim();
    document.querySelectorAll('#pedidos-list .pedido-card').forEach(card => {
      const mesa = card.querySelector('.pedido-mesa')?.textContent.toLowerCase() || '';
      card.style.display = (!q || mesa.includes(q)) ? '' : 'none';
    });
  },

  showTab(tab, btn) {
    this._tab = tab;
    document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
    btn?.classList.add('active');
    if (tab === 'activos') this.load();
    else this.loadHistorial();
  },

  async loadHistorial() {
    const container = document.getElementById('pedidos-list');
    if (!container) return;
    container.innerHTML = '<p class="loading">Cargando...</p>';

    const desde = App.inicioDia(App.hoy());
    const cuentas = await SB.getN('taq_cuentas', `estado=eq.cobrada&cobrada_at=gte.${desde}&order=cobrada_at.desc&limit=50`);

    if (!cuentas.length) {
      container.innerHTML = '<p class="empty-state">Sin cobros hoy</p>';
      return;
    }

    const metodoIcon = { efectivo: '💵', tarjeta: '💳', transferencia: '📱' };
    let totalDia = 0;

    const rows = cuentas.map(c => {
      const hora = new Date(c.cobrada_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const total = parseFloat(c.total || 0);
      totalDia += total;
      return `
        <div class="pedido-card" style="opacity:.85">
          <div class="pedido-header">
            <span class="pedido-mesa">${App.esc(c.nombre_cliente || c.mesa || 'Cliente')}</span>
            <span class="pedido-estado" style="color:var(--success)">✓ Cobrada</span>
          </div>
          <div class="pedido-time">${hora}</div>
          <div class="pedido-total">$${total.toFixed(0)} ${metodoIcon[c.metodo_pago] || ''}</div>
          ${c.descuento > 0 ? `<div style="font-size:.75rem;color:var(--text2)">Desc: -$${parseFloat(c.descuento).toFixed(0)}</div>` : ''}
        </div>
      `;
    });

    container.innerHTML = `
      <div style="padding:8px 4px 12px;font-size:.9rem;color:var(--text2)">
        ${cuentas.length} cobros · Total del día: <strong style="color:var(--success)">$${totalDia.toFixed(0)}</strong>
      </div>
      ${rows.join('')}
    `;
  },

  async loadSolicitudes() {
    const panel = document.getElementById('solicitudes-panel');
    if (!panel) return;

    const solicitudes = await SB.getN('taq_solicitudes', 'estado=eq.pendiente&order=created_at.asc');

    // Sonar si llegaron solicitudes nuevas
    if (this._lastSolicCount >= 0 && solicitudes.length > this._lastSolicCount) {
      this.playAlert();
    }
    this._lastSolicCount = solicitudes.length;
    App.updateSolicBadge(solicitudes.length);

    if (!solicitudes.length) {
      panel.innerHTML = '';
      return;
    }

    const tipoLabel = { pedido: '📱 Pedido', llamar_mesero: '🙋 Llamar mesero', pedir_cuenta: '🧾 Pedir cuenta' };

    panel.innerHTML = `
      <div class="solic-panel">
        <h3 class="solic-titulo">📱 Solicitudes de clientes (${solicitudes.length})</h3>
        ${solicitudes.map(s => {
          const mins = Math.floor((Date.now() - new Date(s.created_at).getTime()) / 60000);
          const items = s.items ? s.items.map(i => `${i.cantidad}x ${App.esc(i.nombre)}`).join(', ') : '';
          return `
            <div class="solic-card">
              <div class="solic-header">
                <span class="solic-tipo">${tipoLabel[s.tipo] || s.tipo}</span>
                <span class="solic-cliente">${App.esc(s.nombre_cliente)}</span>
                <span class="solic-time">${mins} min</span>
              </div>
              ${items ? `<div class="solic-items">${items}</div>` : ''}
              ${s.total ? `<div class="solic-total">$${parseFloat(s.total).toFixed(0)}</div>` : ''}
              <div class="solic-actions">
                ${s.tipo === 'pedido' ? `
                  <button class="btn btn-sm btn-success" onclick="Pedidos.aceptarSolicitud('${s.id}')">✓ Aceptar</button>
                  <button class="btn btn-sm btn-outline" onclick="Pedidos.rechazarSolicitud('${s.id}')">✕ Rechazar</button>
                ` : `
                  <button class="btn btn-sm btn-primary" onclick="Pedidos.atenderSolicitud('${s.id}')">✓ Atendido</button>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  async aceptarSolicitud(solicId) {
    const [solic] = await SB.get('taq_solicitudes', `id=eq.${solicId}`);
    if (!solic) return;

    // Crear orden nueva o agregar a orden existente
    let ordenId = solic.orden_id;
    let cuentaId = null;

    if (!ordenId) {
      // Resolver nombre de mesa si viene con mesa_id
      let mesaNombre = solic.nombre_cliente;
      if (solic.mesa_id) {
        const mesas = await SB.getN('taq_mesas', `id=eq.${solic.mesa_id}&limit=1`);
        if (mesas.length) mesaNombre = `${mesas[0].nombre} — ${solic.nombre_cliente}`;
      }

      // Nueva cuenta + orden
      const [cuenta] = await SB.insertN('taq_cuentas', {
        nombre_cliente: mesaNombre,
        mesa: mesaNombre,
        total: solic.total || 0
      });
      cuentaId = cuenta.id;

      const [orden] = await SB.insertN('taq_ordenes', {
        mesa: mesaNombre,
        total: solic.total || 0,
        subtotal: solic.total || 0,
        usuario_id: Auth.user?.id || null,
        cuenta_id: cuenta.id
      });
      ordenId = orden.id;

      // Insertar items
      if (solic.items?.length) {
        await SB.insertN('taq_orden_items', solic.items.map(i => ({
          orden_id: ordenId,
          producto_id: i.producto_id,
          nombre_producto: i.nombre,
          cantidad: i.cantidad,
          precio_unitario: i.precio,
          notas: i.notas || null
        })));
      }
    } else {
      // Agregar a orden existente
      const [ord] = await SB.get('taq_ordenes', `id=eq.${ordenId}`);
      if (ord) {
        cuentaId = ord.cuenta_id;
        if (solic.items?.length) {
          await SB.insertN('taq_orden_items', solic.items.map(i => ({
            orden_id: ordenId,
            producto_id: i.producto_id,
            nombre_producto: i.nombre,
            cantidad: i.cantidad,
            precio_unitario: i.precio,
            notas: i.notas || null
          })));
          const adicional = parseFloat(solic.total || 0);
          const nuevoTotalOrden = parseFloat(ord.total || 0) + adicional;
          await SB.update('taq_ordenes', `id=eq.${ordenId}`, { total: nuevoTotalOrden, subtotal: nuevoTotalOrden });
          // Actualizar también el total de la cuenta
          if (cuentaId) {
            const [cuenta] = await SB.get('taq_cuentas', `id=eq.${cuentaId}`);
            if (cuenta) {
              await SB.update('taq_cuentas', `id=eq.${cuentaId}`, {
                total: parseFloat(cuenta.total || 0) + adicional
              });
            }
          }
        }
      }
    }

    await SB.update('taq_solicitudes', `id=eq.${solicId}`, {
      estado: 'aceptada',
      orden_id: ordenId,
      atendida_por: Auth.user?.id
    });

    Auth.audit('solicitud_aceptada', solicId, { tipo: solic.tipo, cliente: solic.nombre_cliente });
    App.toast('Solicitud aceptada');
    this.loadSolicitudes();
    this.load();
  },

  async rechazarSolicitud(solicId) {
    await SB.update('taq_solicitudes', `id=eq.${solicId}`, {
      estado: 'rechazada',
      atendida_por: Auth.user?.id
    });
    Auth.audit('solicitud_rechazada', solicId, {}, 'warning');
    App.toast('Solicitud rechazada');
    this.loadSolicitudes();
  },

  async atenderSolicitud(solicId) {
    await SB.update('taq_solicitudes', `id=eq.${solicId}`, {
      estado: 'aceptada',
      atendida_por: Auth.user?.id
    });
    App.toast('Atendido ✓');
    this.loadSolicitudes();
  },

  async load() {
    // Cargar cuentas abiertas
    const cuentas = await SB.getN('taq_cuentas', 'estado=eq.abierta&order=created_at.desc');
    // También cargar órdenes sin cuenta (compatibilidad con pedidos viejos)
    const ordenesSinCuenta = await SB.getN('taq_ordenes', 'estado=neq.cobrada&estado=neq.cancelada&cuenta_id=is.null&order=created_at.desc');

    const container = document.getElementById('pedidos-list');
    if (!container) return;

    if (!cuentas.length && !ordenesSinCuenta.length) {
      container.innerHTML = '<p class="empty-state">No hay pedidos activos.<br>Toca <strong>+ Nuevo Pedido</strong> para empezar.</p>';
      return;
    }

    let html = '';

    // Cargar todas las órdenes y items en 2 queries planas (no N+1)
    let todasOrdenes = [], todosItems = [];
    if (cuentas.length) {
      const cuentaIds = cuentas.map(c => c.id).join(',');
      todasOrdenes = await SB.getN('taq_ordenes', `cuenta_id=in.(${cuentaIds})&estado=neq.cancelada&order=created_at`);
    }
    if (todasOrdenes.length) {
      const ordenIds = todasOrdenes.map(o => o.id).join(',');
      todosItems = await SB.get('taq_orden_items', `orden_id=in.(${ordenIds})&order=created_at`);
    }

    // Renderizar cuentas abiertas
    for (const cuenta of cuentas) {
      const ordenes = todasOrdenes.filter(o => o.cuenta_id === cuenta.id);
      if (!ordenes.length) continue;

      const ids = ordenes.map(o => o.id);
      const items = todosItems.filter(i => ids.includes(i.orden_id));
      const totalCuenta = ordenes.reduce((s, o) => s + parseFloat(o.total || 0), 0);
      const mins = Math.floor((Date.now() - new Date(cuenta.created_at).getTime()) / 60000);

      // Estado general: el peor estado de las órdenes
      const estados = ordenes.map(o => o.estado);
      let estadoGeneral = 'abierta';
      if (estados.includes('en_cocina')) estadoGeneral = 'en_cocina';
      if (estados.every(e => e === 'lista')) estadoGeneral = 'lista';

      const estadoClass = { abierta: 'estado-abierta', en_cocina: 'estado-cocina', lista: 'estado-lista' };
      const estadoLabel = { abierta: 'Abierta', en_cocina: 'En Cocina', lista: 'Lista' };

      html += `
        <div class="pedido-card ${estadoClass[estadoGeneral] || ''}">
          <div class="pedido-header">
            <span class="pedido-mesa">${cuenta.nombre_cliente || cuenta.mesa || 'Cliente'}</span>
            <span class="pedido-estado">${estadoLabel[estadoGeneral] || estadoGeneral}</span>
          </div>
          <div class="pedido-num">${ordenes.length > 1 ? ordenes.length + ' pedidos' : '#' + ordenes[0].numero}</div>
          <div class="pedido-time">${mins} min</div>
          <ul class="pedido-items">
            ${items.map(i => `<li>${i.cantidad}x ${i.nombre_producto}${i.notas ? ' <small>(' + i.notas + ')</small>' : ''}${i.estado === 'entregado' ? ' ✓' : i.estado === 'listo' ? ' 🍽️' : ''}</li>`).join('')}
          </ul>
          <div class="pedido-total">$${totalCuenta.toFixed(0)}</div>
          <div class="pedido-actions">
            <button class="btn btn-sm btn-primary" onclick="location.hash='nuevo/cuenta/${cuenta.id}'">+ Agregar</button>
            ${ordenes.some(o => o.estado === 'abierta') ? `<button class="btn btn-sm btn-warning" onclick="Pedidos.enviarTodosCocina('${cuenta.id}')">Enviar a Cocina</button>` : ''}
            ${estadoGeneral === 'lista' ? `<button class="btn btn-sm btn-success" onclick="location.hash='cobrar/cuenta/${cuenta.id}'">Cobrar</button>` : ''}
            <button class="btn btn-sm btn-outline" onclick="location.hash='nuevo/${ordenes[ordenes.length - 1].id}'">Editar último</button>
            ${Auth.esAdmin() ? `<button class="btn btn-sm btn-danger" onclick="Pedidos.eliminarCuenta('${cuenta.id}', '${(cuenta.nombre_cliente || '').replace(/'/g,"\\'")}')">Eliminar</button>` : ''}
          </div>
        </div>
      `;
    }

    // Renderizar órdenes viejas sin cuenta (compatibilidad)
    if (ordenesSinCuenta.length) {
      const ids = ordenesSinCuenta.map(o => o.id);
      const items = await SB.get('taq_orden_items', `orden_id=in.(${ids.join(',')})&order=created_at`);

      for (const o of ordenesSinCuenta) {
        const oItems = items.filter(i => i.orden_id === o.id);
        const estadoClass = { abierta: 'estado-abierta', en_cocina: 'estado-cocina', lista: 'estado-lista' };
        const estadoLabel = { abierta: 'Abierta', en_cocina: 'En Cocina', lista: 'Lista' };
        const mins = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);

        html += `
          <div class="pedido-card ${estadoClass[o.estado] || ''}">
            <div class="pedido-header">
              <span class="pedido-mesa">${o.mesa || 'Para llevar'}</span>
              <span class="pedido-estado">${estadoLabel[o.estado] || o.estado}</span>
            </div>
            <div class="pedido-num">#${o.numero}</div>
            <div class="pedido-time">${mins} min</div>
            <ul class="pedido-items">
              ${oItems.map(i => `<li>${i.cantidad}x ${i.nombre_producto}${i.notas ? ' <small>(' + i.notas + ')</small>' : ''}</li>`).join('')}
            </ul>
            <div class="pedido-total">$${(o.total || 0).toFixed(0)}</div>
            <div class="pedido-actions">
              ${o.estado === 'abierta' ? `<button class="btn btn-sm btn-warning" onclick="Pedidos.enviarCocina('${o.id}')">Enviar a Cocina</button>` : ''}
              ${o.estado === 'lista' ? `<button class="btn btn-sm btn-primary" onclick="location.hash='cobrar/${o.id}'">Cobrar</button>` : ''}
              <button class="btn btn-sm btn-outline" onclick="location.hash='nuevo/${o.id}'">Editar</button>
            </div>
          </div>
        `;
      }
    }

    container.innerHTML = html;
  },

  async enviarCocina(id) {
    await SB.update('taq_ordenes', `id=eq.${id}`, { estado: 'en_cocina' });
    Auth.audit('enviado_cocina', id);
    App.toast('Pedido enviado a cocina');
  },

  async enviarTodosCocina(cuentaId) {
    const ordenes = await SB.getN('taq_ordenes', `cuenta_id=eq.${cuentaId}&estado=eq.abierta`);
    for (const o of ordenes) {
      await SB.update('taq_ordenes', `id=eq.${o.id}`, { estado: 'en_cocina' });
      Auth.audit('enviado_cocina', o.id);
    }
    App.toast(ordenes.length + ' pedido(s) enviados a cocina');
  },

  async eliminarCuenta(cuentaId, nombre) {
    if (!confirm(`¿Eliminar cuenta de "${nombre}"? Todos los pedidos se cancelarán.`)) return;
    const motivo = prompt('Motivo:');
    if (motivo === null) return;

    const ordenes = await SB.getN('taq_ordenes', `cuenta_id=eq.${cuentaId}&estado=neq.cancelada`);
    for (const o of ordenes) {
      await SB.update('taq_ordenes', `id=eq.${o.id}`, { estado: 'cancelada' });
    }
    await SB.update('taq_cuentas', `id=eq.${cuentaId}`, { estado: 'cancelada' });
    Auth.audit('orden_eliminada', cuentaId, { nombre, motivo, ordenes: ordenes.length }, 'critical');
    App.toast('Cuenta eliminada');
  }
};
