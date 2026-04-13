/**
 * pedidos.js — Lista de pedidos activos
 */
const Pedidos = {
  pollId: null,

  render(el) {
    el.innerHTML = `
      <div class="view-header">
        <h1>Pedidos Activos</h1>
        <button class="btn btn-primary btn-lg" onclick="location.hash='nuevo'">+ Nuevo Pedido</button>
      </div>
      <div id="pedidos-list" class="pedidos-grid">
        <p class="loading">Cargando...</p>
      </div>
    `;
    this.startPolling();
  },

  startPolling() {
    if (this.pollId) clearInterval(this.pollId);
    this.load();
    this.pollId = setInterval(() => {
      if (App.currentView === 'pedidos') this.load();
      else clearInterval(this.pollId);
    }, 4000);
  },

  async load() {
    const ordenes = await SB.get('taq_ordenes', 'estado=neq.cobrada&estado=neq.cancelada&order=created_at.desc');
    const container = document.getElementById('pedidos-list');
    if (!container) return;

    if (!ordenes.length) {
      container.innerHTML = '<p class="empty-state">No hay pedidos activos.<br>Toca <strong>+ Nuevo Pedido</strong> para empezar.</p>';
      return;
    }

    // Cargar items de todas las órdenes
    const ids = ordenes.map(o => o.id);
    const items = await SB.get('taq_orden_items', `orden_id=in.(${ids.join(',')})&order=created_at`);

    container.innerHTML = ordenes.map(o => {
      const oItems = items.filter(i => i.orden_id === o.id);
      const estadoClass = { abierta: 'estado-abierta', en_cocina: 'estado-cocina', lista: 'estado-lista' };
      const estadoLabel = { abierta: 'Abierta', en_cocina: 'En Cocina', lista: 'Lista' };
      const mins = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);

      return `
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
            ${o.estado === 'en_cocina' ? `<button class="btn btn-sm btn-success" onclick="Pedidos.marcarLista('${o.id}')">Marcar Lista</button>` : ''}
            ${o.estado === 'lista' ? `<button class="btn btn-sm btn-primary" onclick="location.hash='cobrar/${o.id}'">Cobrar</button>` : ''}
            <button class="btn btn-sm btn-outline" onclick="location.hash='nuevo/${o.id}'">Editar</button>
          </div>
        </div>
      `;
    }).join('');
  },

  async enviarCocina(id) {
    await SB.update('taq_ordenes', `id=eq.${id}`, { estado: 'en_cocina' });
    App.toast('Pedido enviado a cocina');
    this.load();
  },

  async marcarLista(id) {
    await SB.update('taq_ordenes', `id=eq.${id}`, { estado: 'lista' });
    App.toast('Pedido listo para entregar');
    this.load();
  }
};
