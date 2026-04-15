/**
 * cocina.js — Vista de cocina con entregas parciales
 * El cocinero marca items individuales como listos y avisa al mesero
 */
const Cocina = {
  _sub: null,
  _subItems: null,
  lastOrderCount: -1,
  lastPendingCount: -1,
  clockInterval: null,

  playSound() {
    try {
      const ctx = App._ensureAudio();
      if (!ctx) return;
      [0, 0.2].forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.value = 0.3;
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.12);
      });
      if (navigator.vibrate) navigator.vibrate([150, 100, 150]);
    } catch (_) {}
  },

  render(el) {
    el.innerHTML = `
      <div class="view-header">
        <h1>🔥 Cocina</h1>
        <span class="cocina-clock" id="cocinaClock"></span>
      </div>
      <div id="cocina-grid" class="cocina-grid">
        <p class="loading">Cargando pedidos...</p>
      </div>
    `;
    this.load();

    this._sub && SB.unsubscribe(this._sub);
    this._sub = SB.subscribeN('taq_ordenes', () => {
      if (App.currentView === 'cocina') this.load();
    });

    this._subItems && SB.unsubscribe(this._subItems);
    this._subItems = SB.subscribeN('taq_orden_items', () => {
      if (App.currentView === 'cocina') this.load();
    });

    clearInterval(this.clockInterval);
    this.clockInterval = setInterval(() => {
      const el = document.getElementById('cocinaClock');
      if (el) el.textContent = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      else clearInterval(this.clockInterval);
    }, 1000);
  },

  async load() {
    const ordenes = await SB.getN('taq_ordenes', 'estado=in.(en_cocina,lista)&order=created_at');
    const container = document.getElementById('cocina-grid');
    if (!container) return;

    const enCocina = ordenes.filter(o => o.estado === 'en_cocina').length;
    if (this.lastOrderCount >= 0 && enCocina > this.lastOrderCount) {
      this.playSound();
    }
    this.lastOrderCount = enCocina;

    if (!ordenes.length) {
      this.lastPendingCount = 0;
      container.innerHTML = '<p class="empty-state cocina-empty">Sin pedidos en cocina<br><span style="font-size:3rem">👨‍🍳</span></p>';
      return;
    }

    const ids = ordenes.map(o => o.id);
    const items = await SB.get('taq_orden_items', `orden_id=in.(${ids.join(',')})&order=created_at`);

    // Sonar si llegaron items pendientes nuevos (adiciones del mesero)
    const pendientes = items.filter(i => !i.estado || i.estado === 'pendiente').length;
    if (this.lastPendingCount >= 0 && pendientes > this.lastPendingCount) {
      this.playSound();
    }
    this.lastPendingCount = pendientes;

    container.innerHTML = ordenes.map(o => {
      const oItems = items.filter(i => i.orden_id === o.id);
      const mins = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);
      const urgente = mins > 15;
      const todosListos = oItems.length > 0 && oItems.every(i => i.estado === 'listo' || i.estado === 'entregado');
      const algunosListos = oItems.some(i => i.estado === 'listo');

      return `
        <div class="cocina-card ${o.estado === 'lista' ? 'cocina-lista' : ''} ${urgente ? 'cocina-urgente' : ''}">
          <div class="cocina-card-header">
            <span class="cocina-mesa">${o.mesa || 'Llevar'}</span>
            <span class="cocina-num">#${o.numero}</span>
            <span class="cocina-time ${urgente ? 'urgente' : ''}">${mins} min</span>
          </div>
          <ul class="cocina-items">
            ${oItems.map(i => `
              <li class="cocina-item cocina-item-${i.estado || 'pendiente'}">
                <label class="cocina-item-check">
                  <input type="checkbox"
                    ${(i.estado === 'listo' || i.estado === 'entregado') ? 'checked' : ''}
                    ${i.estado === 'entregado' ? 'disabled' : ''}
                    onchange="Cocina.toggleItem('${i.id}', this.checked, '${o.id}')">
                  <strong>${i.cantidad}x</strong> ${i.nombre_producto}
                </label>
                ${i.notas ? `<div class="cocina-nota">⚠ ${i.notas}</div>` : ''}
                ${i.estado === 'entregado' ? '<span class="cocina-item-badge entregado">Entregado</span>' : ''}
                ${i.estado === 'listo' ? '<span class="cocina-item-badge listo">Listo</span>' : ''}
              </li>
            `).join('')}
          </ul>
          <div class="cocina-actions">
            ${algunosListos && o.estado === 'en_cocina' ? `
              <button class="btn btn-warning btn-block cocina-btn" onclick="Cocina.llamarMesero('${o.id}', '${(o.mesa || 'Llevar').replace(/'/g,"\\'")}')">
                📢 Llamar Mesero (parcial)
              </button>
            ` : ''}
            ${o.estado === 'en_cocina' ? `
              <button class="btn btn-success btn-block cocina-btn" onclick="Cocina.marcarTodoListo('${o.id}')">
                ✓ TODO LISTO
              </button>
            ` : ''}
            ${o.estado === 'lista' ? `
              <div class="cocina-estado-lista">✅ Listo — esperando entrega</div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  async toggleItem(itemId, listo, ordenId) {
    const estado = listo ? 'listo' : 'pendiente';
    const updates = { estado };
    if (listo) {
      updates.preparado_por = Auth.user?.id;
      updates.listo_at = new Date().toISOString();
    } else {
      updates.preparado_por = null;
      updates.listo_at = null;
    }
    await SB.update('taq_orden_items', `id=eq.${itemId}`, updates);
    this.load();
  },

  async llamarMesero(ordenId, mesa) {
    // Obtener items listos no entregados
    const itemsListos = await SB.get('taq_orden_items', `orden_id=eq.${ordenId}&estado=eq.listo`);
    if (!itemsListos.length) {
      App.toast('No hay items listos para recoger');
      return;
    }

    const descripcion = itemsListos.map(i => `${i.cantidad}x ${i.nombre_producto}`).join(', ');
    const itemIds = itemsListos.map(i => i.id);

    // Dedup: no crear si ya existe una tarea pendiente/en_proceso para esta orden
    const existente = await SB.get('taq_tareas', `orden_id=eq.${ordenId}&tipo=eq.recoger_comida&estado=neq.completada&limit=1`);
    if (!existente.length) {
      await SB.insertN('taq_tareas', {
        orden_id: ordenId,
        tipo: 'recoger_comida',
        descripcion,
        mesa,
        items_ids: itemIds,
        estado: 'pendiente',
        prioridad: 1,
        creado_por: Auth.user?.id
      });
    }

    Auth.audit('enviado_cocina', ordenId, { items: descripcion, parcial: true });
    App.toast('Mesero notificado: ' + descripcion);
  },

  async marcarTodoListo(ordenId) {
    // Marcar todos los items como listos
    await SB.update('taq_orden_items', `orden_id=eq.${ordenId}&estado=neq.entregado`, {
      estado: 'listo',
      preparado_por: Auth.user?.id,
      listo_at: new Date().toISOString()
    });

    // Obtener orden antes de actualizar estado (necesitamos created_at para el tiempo)
    const orden = (await SB.get('taq_ordenes', `id=eq.${ordenId}`))[0];
    const tiempoCocinaSegs = orden?.created_at
      ? Math.round((Date.now() - new Date(orden.created_at).getTime()) / 1000)
      : null;

    // Marcar la orden como lista
    await SB.update('taq_ordenes', `id=eq.${ordenId}`, { estado: 'lista' });

    // Crear tarea para mesero (dedup: solo si no hay una pendiente ya)
    const allItems = await SB.get('taq_orden_items', `orden_id=eq.${ordenId}&estado=eq.listo`);
    const descripcion = allItems.map(i => `${i.cantidad}x ${i.nombre_producto}`).join(', ');

    const existente = await SB.get('taq_tareas', `orden_id=eq.${ordenId}&tipo=eq.recoger_comida&estado=neq.completada&limit=1`);
    if (!existente.length) {
      await SB.insertN('taq_tareas', {
        orden_id: ordenId,
        tipo: 'recoger_comida',
        descripcion,
        mesa: orden?.mesa || '',
        items_ids: allItems.map(i => i.id),
        estado: 'pendiente',
        prioridad: 2,
        creado_por: Auth.user?.id
      });
    }

    Auth.audit('cocinado', ordenId, tiempoCocinaSegs ? { tiempo_cocina_seg: tiempoCocinaSegs } : {});
    App.toast('¡Pedido completo! Mesero notificado');
  }
};
