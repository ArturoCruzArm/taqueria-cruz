/**
 * desempeno.js — Dashboard de desempeño del equipo (solo admin)
 * Agrega taq_actividad por usuario: pedidos, cobros, tiempos, cancelados
 */
const Desempeno = {
  _periodo: 'hoy',

  async render(el) {
    el.innerHTML = `
      <div class="view-header">
        <h1>📈 Desempeño</h1>
        <div class="desemp-filtros">
          <button class="btn btn-sm btn-primary desemp-btn active" data-p="hoy"   onclick="Desempeno.setPeriodo('hoy', this)">Hoy</button>
          <button class="btn btn-sm btn-outline desemp-btn" data-p="semana" onclick="Desempeno.setPeriodo('semana', this)">Semana</button>
          <button class="btn btn-sm btn-outline desemp-btn" data-p="mes"    onclick="Desempeno.setPeriodo('mes', this)">Mes</button>
        </div>
      </div>
      <div id="desemp-content"><p class="loading">Cargando...</p></div>
    `;
    await this.load();
  },

  setPeriodo(p, btn) {
    this._periodo = p;
    document.querySelectorAll('.desemp-btn').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.classList.toggle('btn-primary', b === btn);
      b.classList.toggle('btn-outline', b !== btn);
    });
    this.load();
  },

  _desde() {
    if (this._periodo === 'hoy') {
      return App.inicioDia(App.hoy());
    } else if (this._periodo === 'semana') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString();
    }
  },

  async load() {
    const desde = this._desde();
    const el = document.getElementById('desemp-content');
    if (!el) return;

    const [usuarios, actividad] = await Promise.all([
      SB.getN('taq_usuarios', 'activo=eq.true&order=nombre'),
      SB.getN('taq_actividad', `created_at=gte.${desde}&order=created_at.desc`)
    ]);

    if (!actividad.length) {
      el.innerHTML = '<p class="empty-state">Sin actividad en este período</p>';
      return;
    }

    // Agregar por usuario
    const stats = {};
    for (const u of usuarios) {
      stats[u.id] = {
        usuario: u,
        pedidos_creados: 0,
        enviados_cocina: 0,
        cocinados: 0,
        cobrado_total: 0,
        cobros: 0,
        cancelados: 0,
        tiempos_cocina: []
      };
    }

    for (const a of actividad) {
      const uid = a.usuario_id;
      if (!uid || !stats[uid]) continue;
      const s = stats[uid];
      const meta = a.meta || {};

      switch (a.tipo) {
        case 'pedido_creado':   s.pedidos_creados++; break;
        case 'enviado_cocina':  s.enviados_cocina++; break;
        case 'cocinado':
          s.cocinados++;
          if (meta.tiempo_cocina_seg) s.tiempos_cocina.push(meta.tiempo_cocina_seg);
          break;
        case 'cobrado':
          s.cobros++;
          s.cobrado_total += parseFloat(meta.total || 0);
          break;
        case 'cancelado':       s.cancelados++; break;
      }
    }

    // Convertir a array, filtrar sin actividad, ordenar por ventas
    const lista = Object.values(stats)
      .filter(s => s.pedidos_creados + s.cocinados + s.cobros + s.cancelados > 0)
      .sort((a, b) => b.cobrado_total - a.cobrado_total);

    if (!lista.length) {
      el.innerHTML = '<p class="empty-state">Sin actividad registrada para el equipo en este período</p>';
      return;
    }

    const totalVentas = lista.reduce((s, r) => s + r.cobrado_total, 0);

    // Ranking cards
    const rankingHtml = lista.map((s, i) => {
      const u = s.usuario;
      const promCocina = s.tiempos_cocina.length
        ? Math.round(s.tiempos_cocina.reduce((a, b) => a + b, 0) / s.tiempos_cocina.length / 60)
        : null;
      const pct = totalVentas > 0 ? ((s.cobrado_total / totalVentas) * 100).toFixed(0) : 0;

      return `
        <div class="desemp-card">
          <div class="desemp-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1)}</div>
          <div class="desemp-avatar">${u.avatar || '👤'}</div>
          <div class="desemp-info">
            <div class="desemp-nombre">${u.nombre}</div>
            <div class="desemp-rol">${u.rol || ''}</div>
          </div>
          <div class="desemp-stats">
            <div class="desemp-stat">
              <span class="desemp-val">$${s.cobrado_total.toFixed(0)}</span>
              <span class="desemp-lbl">Cobrado</span>
            </div>
            <div class="desemp-stat">
              <span class="desemp-val">${s.pedidos_creados}</span>
              <span class="desemp-lbl">Pedidos</span>
            </div>
            <div class="desemp-stat">
              <span class="desemp-val">${s.cocinados}</span>
              <span class="desemp-lbl">Cocinados</span>
            </div>
            ${promCocina !== null ? `
              <div class="desemp-stat">
                <span class="desemp-val">${promCocina}m</span>
                <span class="desemp-lbl">T.Cocina</span>
              </div>
            ` : ''}
            ${s.cancelados > 0 ? `
              <div class="desemp-stat desemp-stat-danger">
                <span class="desemp-val">${s.cancelados}</span>
                <span class="desemp-lbl">Cancelados</span>
              </div>
            ` : ''}
          </div>
          <div class="desemp-bar-wrap">
            <div class="desemp-bar" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');

    // Tabla resumen general
    const resumenHtml = `
      <div class="corte-resumen" style="margin-bottom:1.5rem">
        <div class="corte-stat corte-total">
          <span class="corte-stat-label">Ventas totales</span>
          <span class="corte-stat-value">$${totalVentas.toFixed(0)}</span>
        </div>
        <div class="corte-stat">
          <span class="corte-stat-label">Pedidos creados</span>
          <span class="corte-stat-value">${lista.reduce((s, r) => s + r.pedidos_creados, 0)}</span>
        </div>
        <div class="corte-stat">
          <span class="corte-stat-label">Platos cocinados</span>
          <span class="corte-stat-value">${lista.reduce((s, r) => s + r.cocinados, 0)}</span>
        </div>
        <div class="corte-stat">
          <span class="corte-stat-label">Cancelados</span>
          <span class="corte-stat-value">${lista.reduce((s, r) => s + r.cancelados, 0)}</span>
        </div>
      </div>
    `;

    el.innerHTML = resumenHtml + `<div class="desemp-list">${rankingHtml}</div>`;
  }
};
