/**
 * cocina.js — Vista de cocina en tiempo real
 * Muestra pedidos en_cocina y permite marcarlos como listos
 */
const Cocina = {
  pollId: null,

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
    this.startPolling();
    this.clockInterval = setInterval(() => {
      const el = document.getElementById('cocinaClock');
      if (el) el.textContent = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    }, 1000);
  },

  startPolling() {
    if (this.pollId) clearInterval(this.pollId);
    this.load();
    this.pollId = setInterval(() => {
      if (App.currentView === 'cocina') this.load();
      else {
        clearInterval(this.pollId);
        clearInterval(this.clockInterval);
      }
    }, 3000);
  },

  async load() {
    const ordenes = await SB.get('taq_ordenes', 'estado=in.(en_cocina,lista)&order=created_at');
    const container = document.getElementById('cocina-grid');
    if (!container) return;

    if (!ordenes.length) {
      container.innerHTML = '<p class="empty-state cocina-empty">Sin pedidos en cocina<br><span style="font-size:3rem">👨‍🍳</span></p>';
      return;
    }

    const ids = ordenes.map(o => o.id);
    const items = await SB.get('taq_orden_items', `orden_id=in.(${ids.join(',')})&order=created_at`);

    container.innerHTML = ordenes.map(o => {
      const oItems = items.filter(i => i.orden_id === o.id);
      const mins = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);
      const urgente = mins > 15;

      return `
        <div class="cocina-card ${o.estado === 'lista' ? 'cocina-lista' : ''} ${urgente ? 'cocina-urgente' : ''}">
          <div class="cocina-card-header">
            <span class="cocina-mesa">${o.mesa || 'Llevar'}</span>
            <span class="cocina-num">#${o.numero}</span>
            <span class="cocina-time ${urgente ? 'urgente' : ''}">${mins} min</span>
          </div>
          <ul class="cocina-items">
            ${oItems.map(i => `
              <li class="cocina-item">
                <strong>${i.cantidad}x</strong> ${i.nombre_producto}
                ${i.notas ? `<div class="cocina-nota">⚠ ${i.notas}</div>` : ''}
              </li>
            `).join('')}
          </ul>
          ${o.estado === 'en_cocina' ? `
            <button class="btn btn-success btn-block cocina-btn" onclick="Cocina.marcarLista('${o.id}')">
              ✓ LISTO
            </button>
          ` : `
            <div class="cocina-estado-lista">✅ Listo — esperando entrega</div>
          `}
        </div>
      `;
    }).join('');
  },

  async marcarLista(id) {
    await SB.update('taq_ordenes', `id=eq.${id}`, { estado: 'lista' });
    App.toast('¡Pedido listo!');
    this.load();
  }
};
