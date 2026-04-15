/**
 * tareas.js — Cola de tareas para meseros
 * Muestra tareas pendientes: recoger comida, atender mesa, llevar cuenta, etc.
 * Cualquier mesero puede tomar cualquier tarea pero se registra quién la completó.
 */
const Tareas = {
  _sub: null,

  playAlert() {
    try {
      const ctx = App._ensureAudio();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660;
      osc.type = 'triangle';
      gain.gain.value = 0.25;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      if (navigator.vibrate) navigator.vibrate(100);
    } catch (_) {}
  },

  render(el) {
    el.innerHTML = `
      <div class="view-header">
        <h1>📋 Mis Tareas</h1>
        <div class="tareas-filtros">
          <button class="btn btn-sm btn-primary tareas-filtro active" data-filtro="pendiente" onclick="Tareas.filtrar('pendiente', this)">Pendientes</button>
          <button class="btn btn-sm btn-outline tareas-filtro" data-filtro="en_proceso" onclick="Tareas.filtrar('en_proceso', this)">En Proceso</button>
          <button class="btn btn-sm btn-outline tareas-filtro" data-filtro="completada" onclick="Tareas.filtrar('completada', this)">Hechas</button>
        </div>
      </div>
      <div id="tareas-list" class="tareas-list">
        <p class="loading">Cargando tareas...</p>
      </div>
    `;

    this._filtroActual = 'pendiente';
    this.load();

    this._sub && SB.unsubscribe(this._sub);
    this._sub = SB.subscribeN('taq_tareas', (change) => {
      if (App.currentView === 'tareas') {
        this.load();
        // Sonar si llega tarea nueva
        if (change && change.eventType === 'INSERT') {
          this.playAlert();
        }
      }
    });
  },

  _filtroActual: 'pendiente',

  filtrar(estado, btn) {
    this._filtroActual = estado;
    document.querySelectorAll('.tareas-filtro').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.classList.toggle('btn-primary', b === btn);
      b.classList.toggle('btn-outline', b !== btn);
    });
    this.load();
  },

  async load() {
    const estado = this._filtroActual;
    let query = `estado=eq.${estado}&order=`;

    if (estado === 'completada') {
      query += 'completado_at.desc&limit=30';
    } else {
      query += 'prioridad.desc,created_at.asc&limit=200';
    }

    const tareas = await SB.getN('taq_tareas', query);
    const container = document.getElementById('tareas-list');
    if (!container) return;

    if (!tareas.length) {
      const msgs = {
        pendiente: 'Sin tareas pendientes 👍',
        en_proceso: 'No hay tareas en proceso',
        completada: 'No hay tareas completadas aún'
      };
      container.innerHTML = `<p class="empty-state">${msgs[estado]}</p>`;
      return;
    }

    // Cargar nombres de usuarios para mostrar quién creó/completó
    const userIds = new Set();
    tareas.forEach(t => {
      if (t.creado_por) userIds.add(t.creado_por);
      if (t.completado_por) userIds.add(t.completado_por);
      if (t.asignado_a) userIds.add(t.asignado_a);
    });

    let usuarios = {};
    if (userIds.size) {
      const uArr = await SB.get('taq_usuarios', `id=in.(${[...userIds].join(',')})&select=id,nombre,avatar`);
      uArr.forEach(u => usuarios[u.id] = u);
    }

    container.innerHTML = tareas.map(t => {
      const tipoConfig = {
        recoger_comida: { icon: '🍽️', label: 'Recoger comida', color: 'warning' },
        llevar_cuenta:  { icon: '🧾', label: 'Llevar cuenta', color: 'primary' },
        atender_mesa:   { icon: '🙋', label: 'Atender mesa', color: 'success' },
        pedido_cliente: { icon: '📱', label: 'Pedido de cliente', color: 'primary' },
        adicion_orden:  { icon: '➕', label: 'Adición a pedido', color: 'warning' },
        otro:           { icon: '📌', label: 'Tarea', color: 'outline' }
      };
      const cfg = tipoConfig[t.tipo] || tipoConfig.otro;
      const mins = Math.floor((Date.now() - new Date(t.created_at).getTime()) / 60000);
      const creador = usuarios[t.creado_por];
      const completador = usuarios[t.completado_por];

      return `
        <div class="tarea-card tarea-${t.estado} tarea-tipo-${cfg.color}">
          <div class="tarea-header">
            <span class="tarea-tipo">${cfg.icon} ${cfg.label}</span>
            <span class="tarea-time">${mins} min</span>
          </div>
          ${t.mesa ? `<div class="tarea-mesa">📍 ${t.mesa}</div>` : ''}
          ${t.descripcion ? `<div class="tarea-desc">${t.descripcion}</div>` : ''}
          ${creador ? `<div class="tarea-creador">De: ${creador.avatar} ${creador.nombre}</div>` : ''}
          ${t.estado === 'en_proceso' && t.completado_por ? '' : ''}
          ${completador ? `<div class="tarea-completador">Por: ${completador.avatar} ${completador.nombre} — ${t.completado_at ? new Date(t.completado_at).toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'}) : ''}</div>` : ''}
          <div class="tarea-actions">
            ${t.estado === 'pendiente' ? `
              <button class="btn btn-${cfg.color} btn-block" onclick="Tareas.tomar('${t.id}')">
                Tomar tarea
              </button>
            ` : ''}
            ${t.estado === 'en_proceso' ? `
              <button class="btn btn-success btn-block" onclick="Tareas.completar('${t.id}')">
                ✓ Completada
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  async tomar(tareaId) {
    await SB.update('taq_tareas', `id=eq.${tareaId}`, {
      estado: 'en_proceso',
      asignado_a: Auth.user?.id
    });
    App.toast('Tarea tomada');
  },

  async completar(tareaId) {
    const [tarea] = await SB.get('taq_tareas', `id=eq.${tareaId}`);

    await SB.update('taq_tareas', `id=eq.${tareaId}`, {
      estado: 'completada',
      completado_por: Auth.user?.id,
      completado_at: new Date().toISOString()
    });

    // Si era recoger comida, marcar items como entregados
    if (tarea && tarea.tipo === 'recoger_comida' && tarea.items_ids && tarea.items_ids.length) {
      for (const itemId of tarea.items_ids) {
        await SB.update('taq_orden_items', `id=eq.${itemId}`, {
          estado: 'entregado',
          entregado_por: Auth.user?.id,
          entregado_at: new Date().toISOString()
        });
      }

      // Verificar si todos los items de la orden están entregados
      if (tarea.orden_id) {
        const pendientes = await SB.get('taq_orden_items', `orden_id=eq.${tarea.orden_id}&estado=neq.entregado`);
        if (pendientes.length === 0) {
          await SB.update('taq_ordenes', `id=eq.${tarea.orden_id}`, { estado: 'lista' });
        }
      }
    }

    Auth.audit('solicitud_aceptada', tareaId, {
      tipo: tarea?.tipo,
      mesa: tarea?.mesa,
      descripcion: tarea?.descripcion
    });

    App.toast('Tarea completada ✓');
  }
};
