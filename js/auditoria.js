/**
 * auditoria.js — Log de actividad y supervisión (solo admin)
 * Filtros por severidad, usuario, tipo y fecha
 */
const Auditoria = {
  _usuarios: [],
  _filtros: { severidad: 'todas', usuario: 'todos', tipo: 'todos', fecha: 'hoy' },

  async render(el) {
    // Cargar usuarios para los filtros
    this._usuarios = await SB.getN('taq_usuarios', 'order=nombre');

    const tipos = [
      'pedido_creado', 'enviado_cocina', 'cocinado', 'cobrado', 'cancelado',
      'orden_eliminada', 'orden_modificada',
      'precio_cambiado', 'producto_creado', 'producto_eliminado', 'producto_disponibilidad',
      'categoria_creada', 'usuario_creado', 'usuario_desactivado', 'usuario_reactivado', 'rol_cambiado',
      'corte_modificado', 'solicitud_aceptada', 'solicitud_rechazada', 'dispositivo_bloqueado',
      'config_negocio_cambiada', 'mesa_creada', 'codigo_dia_generado'
    ];

    el.innerHTML = `
      <div class="view-header">
        <h1>🔍 Auditoría</h1>
      </div>

      <!-- Resumen rápido -->
      <div id="audit-resumen" class="corte-resumen" style="margin-bottom:16px"></div>

      <!-- Filtros -->
      <div class="audit-filtros">
        <select id="filtroSeveridad" onchange="Auditoria.aplicarFiltros()">
          <option value="todas">Todas las severidades</option>
          <option value="critical">🔴 Críticas</option>
          <option value="warning">🟡 Advertencias</option>
          <option value="info">🟢 Info</option>
        </select>
        <select id="filtroUsuario" onchange="Auditoria.aplicarFiltros()">
          <option value="todos">Todos los usuarios</option>
          ${this._usuarios.map(u => `<option value="${u.id}">${u.avatar} ${u.nombre}</option>`).join('')}
        </select>
        <select id="filtroTipo" onchange="Auditoria.aplicarFiltros()">
          <option value="todos">Todos los tipos</option>
          ${tipos.map(t => `<option value="${t}">${this._tipoLabel(t)}</option>`).join('')}
        </select>
        <select id="filtroFecha" onchange="Auditoria.aplicarFiltros()">
          <option value="hoy">Hoy</option>
          <option value="ayer">Ayer</option>
          <option value="semana">Últimos 7 días</option>
          <option value="mes">Últimos 30 días</option>
          <option value="todo">Todo</option>
        </select>
      </div>

      <div id="audit-list" class="audit-list">
        <p class="loading">Cargando actividad...</p>
      </div>

      <details style="margin-top:24px" id="audit-errores-section">
        <summary style="cursor:pointer;color:var(--text2);font-size:.85rem;padding:8px 0">🐛 Errores JS / BD <span id="audit-errores-badge"></span></summary>
        <div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap">
          <label style="font-size:.8rem;color:var(--text2)">
            <input type="checkbox" id="chkMostrarResueltas" onchange="Auditoria.renderErrores()"> Mostrar resueltas
          </label>
          <button class="btn btn-outline" style="font-size:.75rem;padding:4px 10px"
            onclick="Auditoria.limpiarResueltas()">🗑️ Eliminar resueltas</button>
        </div>
        <div id="audit-errores" style="margin-top:4px"><p class="loading">Cargando...</p></div>
      </details>
    `;

    this.aplicarFiltros();
  },

  async aplicarFiltros() {
    const severidad = document.getElementById('filtroSeveridad')?.value || 'todas';
    const usuario = document.getElementById('filtroUsuario')?.value || 'todos';
    const tipo = document.getElementById('filtroTipo')?.value || 'todos';
    const fecha = document.getElementById('filtroFecha')?.value || 'hoy';

    let query = 'order=created_at.desc&limit=200';

    // Filtro de fecha usando timezone del negocio
    let desde;
    if (fecha === 'hoy') {
      desde = App.inicioDia(App.hoy());
    } else if (fecha === 'ayer') {
      desde = App.inicioDia(App.ayer());
      query += `&created_at=lt.${App.inicioDia(App.hoy())}`;
    } else if (fecha === 'semana') {
      const hace7 = new Date();
      hace7.setDate(hace7.getDate() - 7);
      desde = hace7.toISOString();
    } else if (fecha === 'mes') {
      const hace30 = new Date();
      hace30.setDate(hace30.getDate() - 30);
      desde = hace30.toISOString();
    }
    if (desde) query += `&created_at=gte.${desde}`;

    if (severidad !== 'todas') query += `&severidad=eq.${severidad}`;
    if (usuario !== 'todos') query += `&usuario_id=eq.${usuario}`;
    if (tipo !== 'todos') query += `&tipo=eq.${tipo}`;

    const actividad = await SB.getN('taq_actividad', query);
    this.renderResumen(actividad);
    this.renderList(actividad);
    this.renderErrores();
  },

  async renderErrores() {
    const el = document.getElementById('audit-errores');
    if (!el) return;
    const mostrarResueltas = document.getElementById('chkMostrarResueltas')?.checked;
    let q = 'order=ultima_vez.desc&limit=50';
    if (!mostrarResueltas) q += '&resuelta=eq.false';
    const errores = await SB.getN('taq_errores', q);

    // Badge con pendientes
    const badge = document.getElementById('audit-errores-badge');
    const pendientes = errores.filter(e => !e.resuelta).length;
    if (badge) badge.innerHTML = pendientes > 0
      ? `<span style="background:var(--danger);color:#fff;border-radius:10px;padding:1px 7px;font-size:.75rem;margin-left:6px">${pendientes}</span>`
      : '';

    if (!errores.length) {
      el.innerHTML = '<p style="color:var(--text2);font-size:.8rem">Sin errores' + (mostrarResueltas ? '' : ' pendientes') + '</p>';
      return;
    }

    const usuarioMap = {};
    this._usuarios.forEach(u => { usuarioMap[u.id] = u; });

    el.innerHTML = `
      <table class="corte-table" style="font-size:.78rem">
        <thead>
          <tr>
            <th>Última vez</th><th>Tipo</th><th>Vista</th><th>Mensaje</th><th>#</th><th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${errores.map(e => {
            const ultima = new Date(e.ultima_vez || e.created_at);
            const hora = ultima.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'});
            const dia  = ultima.toLocaleDateString('es-MX', {day:'numeric',month:'short'});
            const quien = e.resuelta_por ? (usuarioMap[e.resuelta_por]?.nombre || '?') : '';
            const rowStyle = e.resuelta ? 'opacity:.45' : '';
            return `<tr style="${rowStyle}">
              <td style="white-space:nowrap">${dia} ${hora}</td>
              <td><code>${App.esc(e.tipo)}</code></td>
              <td style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${App.esc(e.vista || '')}</td>
              <td style="max-width:220px;word-break:break-word">${App.esc((e.mensaje || '').slice(0, 130))}</td>
              <td style="text-align:center;font-weight:bold${e.veces > 1 ? ';color:var(--warning)' : ''}">${e.veces > 1 ? '×' + e.veces : '1'}</td>
              <td style="white-space:nowrap">
                ${e.resuelta
                  ? `<span style="color:var(--success);font-size:.75rem">✅ ${App.esc(quien)}</span>`
                  : '<span style="color:var(--text2);font-size:.75rem">Pendiente</span>'}
              </td>
              <td style="white-space:nowrap">
                ${!e.resuelta
                  ? `<button class="btn btn-outline" style="font-size:.7rem;padding:2px 8px"
                      onclick="Auditoria.resolverError('${e.id}')">✅ Resuelta</button>`
                  : ''}
                <button class="btn btn-outline" style="font-size:.7rem;padding:2px 8px;color:var(--danger)"
                  onclick="Auditoria.eliminarError('${e.id}')">🗑️</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  async resolverError(id) {
    await SB.rpc('resolver_error', { p_id: id, p_usuario_id: Auth.user?.id || null });
    App.toast('Error marcado como resuelto');
    this.renderErrores();
  },

  async eliminarError(id) {
    await SB.delete('taq_errores', `id=eq.${id}`);
    this.renderErrores();
  },

  async limpiarResueltas() {
    if (!confirm('¿Eliminar todos los errores marcados como resueltos?')) return;
    await SB.deleteN('taq_errores', 'resuelta=eq.true');
    App.toast('Errores resueltos eliminados');
    this.renderErrores();
  },

  renderResumen(actividad) {
    const el = document.getElementById('audit-resumen');
    if (!el) return;

    const critical = actividad.filter(a => a.severidad === 'critical').length;
    const warning = actividad.filter(a => a.severidad === 'warning').length;
    const info = actividad.filter(a => a.severidad === 'info').length;

    el.innerHTML = `
      <div class="corte-stat" style="cursor:pointer" onclick="document.getElementById('filtroSeveridad').value='critical';Auditoria.aplicarFiltros()">
        <span class="corte-stat-label">🔴 Críticas</span>
        <span class="corte-stat-value" style="${critical > 0 ? 'color:var(--danger)' : ''}">${critical}</span>
      </div>
      <div class="corte-stat" style="cursor:pointer" onclick="document.getElementById('filtroSeveridad').value='warning';Auditoria.aplicarFiltros()">
        <span class="corte-stat-label">🟡 Advertencias</span>
        <span class="corte-stat-value" style="${warning > 0 ? 'color:var(--warning)' : ''}">${warning}</span>
      </div>
      <div class="corte-stat" style="cursor:pointer" onclick="document.getElementById('filtroSeveridad').value='info';Auditoria.aplicarFiltros()">
        <span class="corte-stat-label">🟢 Info</span>
        <span class="corte-stat-value">${info}</span>
      </div>
      <div class="corte-stat">
        <span class="corte-stat-label">Total</span>
        <span class="corte-stat-value">${actividad.length}</span>
      </div>
    `;
  },

  renderList(actividad) {
    const el = document.getElementById('audit-list');
    if (!el) return;

    if (!actividad.length) {
      el.innerHTML = '<p class="empty-state">Sin actividad para estos filtros</p>';
      return;
    }

    const userMap = {};
    this._usuarios.forEach(u => userMap[u.id] = u);

    el.innerHTML = actividad.map(a => {
      const user = userMap[a.usuario_id];
      const fecha = new Date(a.created_at);
      const hora = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dia = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

      const sevClass = {
        critical: 'audit-critical',
        warning: 'audit-warning',
        info: 'audit-info'
      };
      const sevIcon = { critical: '🔴', warning: '🟡', info: '🟢' };

      const meta = a.meta || {};
      const metaStr = this._formatMeta(a.tipo, meta);

      return `
        <div class="audit-entry ${sevClass[a.severidad] || 'audit-info'}">
          <div class="audit-entry-header">
            <span class="audit-sev">${sevIcon[a.severidad] || '⚪'}</span>
            <span class="audit-tipo">${this._tipoLabel(a.tipo)}</span>
            <span class="audit-user">${user ? user.avatar + ' ' + user.nombre : 'Sistema'}</span>
            <span class="audit-time">${dia} ${hora}</span>
          </div>
          ${metaStr ? `<div class="audit-meta">${metaStr}</div>` : ''}
        </div>
      `;
    }).join('');
  },

  _tipoLabel(tipo) {
    const labels = {
      pedido_creado: '📋 Pedido creado',
      enviado_cocina: '🔥 Enviado a cocina',
      cocinado: '✅ Cocinado',
      cobrado: '💰 Cobrado',
      cancelado: '❌ Cancelado',
      orden_eliminada: '🗑️ Orden eliminada',
      orden_modificada: '✏️ Orden modificada',
      precio_cambiado: '💲 Precio cambiado',
      producto_creado: '➕ Producto creado',
      producto_eliminado: '🗑️ Producto eliminado',
      producto_disponibilidad: '🔄 Disponibilidad cambiada',
      categoria_creada: '📁 Categoría creada',
      categoria_eliminada: '🗑️ Categoría eliminada',
      usuario_creado: '👤 Usuario creado',
      usuario_desactivado: '🚫 Usuario desactivado',
      usuario_reactivado: '✅ Usuario reactivado',
      rol_cambiado: '🔑 Rol cambiado',
      corte_eliminado: '🗑️ Corte eliminado',
      corte_modificado: '📊 Corte cerrado',
      solicitud_aceptada: '✅ Solicitud aceptada',
      solicitud_rechazada: '❌ Solicitud rechazada',
      dispositivo_bloqueado: '🚫 Dispositivo bloqueado',
      config_negocio_cambiada: '⚙️ Config cambiada',
      mesa_creada: '🪑 Mesa creada',
      mesa_eliminada: '🗑️ Mesa eliminada',
      codigo_dia_generado: '🔢 Código del día'
    };
    return labels[tipo] || tipo;
  },

  _formatMeta(tipo, meta) {
    const parts = [];

    if (meta.numero) parts.push(`Pedido #${meta.numero}`);
    if (meta.mesa) parts.push(`Mesa: ${meta.mesa}`);
    if (meta.total != null) parts.push(`Total: $${parseFloat(meta.total).toFixed(0)}`);
    if (meta.pago) parts.push(`Pago: $${parseFloat(meta.pago).toFixed(0)}`);
    if (meta.cambio != null) parts.push(`Cambio: $${parseFloat(meta.cambio).toFixed(0)}`);
    if (meta.motivo) parts.push(`Motivo: "${meta.motivo}"`);
    if (meta.producto) parts.push(meta.producto);
    if (meta.precio_anterior != null && meta.precio_nuevo != null) {
      parts.push(`$${meta.precio_anterior} → $${meta.precio_nuevo}`);
    }
    if (meta.nombre) parts.push(meta.nombre);
    if (meta.disponible != null) parts.push(meta.disponible ? 'Disponible' : 'Agotado');
    if (meta.ordenes) parts.push(`Órdenes: ${Array.isArray(meta.ordenes) ? meta.ordenes.map(n => '#' + n).join(', ') : meta.ordenes}`);
    if (meta.horas) parts.push(`${meta.horas}h de turno`);
    if (meta.total_ventas != null) parts.push(`Ventas: $${parseFloat(meta.total_ventas).toFixed(0)}`);
    if (meta.total_ordenes != null) parts.push(`${meta.total_ordenes} pedidos`);
    if (meta.descripcion) parts.push(meta.descripcion);
    if (meta.tipo && tipo === 'solicitud_aceptada') parts.push(`Tipo: ${meta.tipo}`);
    if (meta.items) parts.push(meta.items);
    if (meta.parcial) parts.push('(entrega parcial)');
    if (meta.items_nuevos != null && meta.items_nuevos > 0) parts.push(`+${meta.items_nuevos} nuevo(s)`);

    return parts.join(' · ');
  }
};
