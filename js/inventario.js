/**
 * inventario.js — Gestión de ingredientes, recetas, stock y pronóstico
 */
const Inventario = {

  async render(el) {
    const [ingredientes, productos, recetas] = await Promise.all([
      SB.getN('taq_ingredientes', 'activo=eq.true&order=categoria,nombre'),
      SB.getN('taq_productos', 'order=nombre'),
      SB.getN('taq_recetas', '')
    ]);

    // Agrupar ingredientes por categoría
    const cats = {};
    ingredientes.forEach(i => {
      const cat = i.categoria || 'general';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(i);
    });

    el.innerHTML = `
      <div class="view-header">
        <h1>Inventario</h1>
        <div>
          <button class="btn btn-sm btn-outline" onclick="Inventario.verPronostico()">📊 Pronóstico</button>
          <button class="btn btn-sm btn-primary" onclick="Inventario.nuevoIngrediente()">+ Ingrediente</button>
        </div>
      </div>

      <!-- Alertas de stock bajo -->
      <div id="inv-alertas"></div>

      <!-- Tabs -->
      <div class="inv-tabs">
        <button class="inv-tab active" onclick="Inventario.showTab('stock', this)">📦 Stock</button>
        <button class="inv-tab" onclick="Inventario.showTab('recetas', this)">📝 Recetas</button>
        <button class="inv-tab" onclick="Inventario.showTab('movimientos', this)">📋 Movimientos</button>
      </div>

      <div id="inv-content"></div>
    `;

    // Alertas
    const bajos = ingredientes.filter(i => i.stock_actual <= i.stock_minimo && i.stock_minimo > 0);
    const alertEl = document.getElementById('inv-alertas');
    if (bajos.length) {
      alertEl.innerHTML = `
        <div class="inv-alerta">
          ⚠️ <strong>${bajos.length} ingrediente(s) con stock bajo:</strong>
          ${bajos.map(i => `<span class="inv-alerta-item">${i.nombre} (${i.stock_actual} ${i.unidad})</span>`).join(', ')}
        </div>
      `;
    }

    this._ingredientes = ingredientes;
    this._productos = productos;
    this._recetas = recetas;
    this._cats = cats;
    this.showTab('stock');
  },

  showTab(tab, btn) {
    if (btn) {
      document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
    }
    const el = document.getElementById('inv-content');
    if (tab === 'stock') this.renderStock(el);
    else if (tab === 'recetas') this.renderRecetas(el);
    else if (tab === 'movimientos') this.renderMovimientos(el);
  },

  // ── STOCK ──

  renderStock(el) {
    const cats = this._cats;
    const catNames = Object.keys(cats).sort();

    if (!catNames.length) {
      el.innerHTML = '<p class="empty-state">Sin ingredientes registrados.<br>Toca <strong>+ Ingrediente</strong> para agregar.</p>';
      return;
    }

    el.innerHTML = catNames.map(cat => `
      <div class="inv-cat-section">
        <h3 class="inv-cat-title">${cat.charAt(0).toUpperCase() + cat.slice(1)}</h3>
        <table class="corte-table">
          <thead><tr><th>Ingrediente</th><th>Stock</th><th>Mín.</th><th>Costo</th><th></th></tr></thead>
          <tbody>
            ${cats[cat].map(i => {
              const bajo = i.stock_actual <= i.stock_minimo && i.stock_minimo > 0;
              return `
                <tr class="${bajo ? 'inv-bajo' : ''}">
                  <td>${i.nombre}</td>
                  <td><strong>${i.stock_actual}</strong> ${i.unidad}</td>
                  <td>${i.stock_minimo} ${i.unidad}</td>
                  <td>$${parseFloat(i.costo_unitario || 0).toFixed(1)}</td>
                  <td>
                    <button class="btn btn-sm btn-success" onclick="Inventario.registrarCompra('${i.id}', '${i.nombre}', '${i.unidad}')">+ Compra</button>
                    <button class="btn btn-sm btn-warning" onclick="Inventario.registrarMerma('${i.id}', '${i.nombre}', '${i.unidad}')">Merma</button>
                    <button class="btn btn-sm btn-outline" onclick="Inventario.registrarAjuste('${i.id}', '${i.nombre}', '${i.unidad}')">Ajuste</button>
                    <button class="btn btn-sm btn-outline" onclick="Inventario.editarIngrediente('${i.id}')">✏️</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `).join('');
  },

  // ── RECETAS ──

  renderRecetas(el) {
    const prods = this._productos;
    const recetas = this._recetas;
    const ingredientes = this._ingredientes;
    const ingMap = {};
    ingredientes.forEach(i => ingMap[i.id] = i);

    el.innerHTML = `
      <div style="margin-bottom:12px">
        <p style="color:var(--text2);font-size:.85rem">Define cuánto de cada ingrediente lleva cada producto. Esto permite calcular consumo automático y pronósticos.</p>
      </div>
      ${prods.map(p => {
        const prodRecetas = recetas.filter(r => r.producto_id === p.id);
        return `
          <div class="inv-receta-card">
            <div class="inv-receta-header">
              <strong>${p.nombre}</strong> — $${parseFloat(p.precio).toFixed(0)}
              <button class="btn btn-sm btn-outline" onclick="Inventario.agregarAReceta('${p.id}', '${p.nombre.replace(/'/g,"\\'")}')">+ Ingrediente</button>
            </div>
            ${prodRecetas.length ? `
              <ul class="inv-receta-items">
                ${prodRecetas.map(r => {
                  const ing = ingMap[r.ingrediente_id];
                  return ing ? `
                    <li>
                      ${r.cantidad} ${ing.unidad} de <strong>${ing.nombre}</strong>
                      <button class="btn-remove" onclick="Inventario.quitarDeReceta('${r.id}')">✕</button>
                    </li>
                  ` : '';
                }).join('')}
              </ul>
            ` : '<p style="color:var(--text2);font-size:.8rem;padding:4px 8px">Sin receta definida</p>'}
          </div>
        `;
      }).join('')}
    `;
  },

  // ── MOVIMIENTOS ──

  async renderMovimientos(el) {
    const movs = await SB.getN('taq_inventario_mov', 'order=created_at.desc&limit=50');
    const ingredientes = this._ingredientes;
    const ingMap = {};
    ingredientes.forEach(i => ingMap[i.id] = i);

    if (!movs.length) {
      el.innerHTML = '<p class="empty-state">Sin movimientos registrados</p>';
      return;
    }

    const tipoLabel = { compra: '📥 Compra', venta: '📤 Venta', merma: '🗑️ Merma', ajuste: '🔧 Ajuste' };

    el.innerHTML = `
      <table class="corte-table">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Ingrediente</th><th>Cant.</th><th>Antes→Después</th><th>Notas</th></tr></thead>
        <tbody>
          ${movs.map(m => {
            const ing = ingMap[m.ingrediente_id];
            const fecha = new Date(m.created_at);
            const u = ing?.unidad || '';
            return `
              <tr>
                <td style="font-size:.8rem">${fecha.toLocaleDateString('es-MX', {day:'numeric',month:'short'})} ${fecha.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'})}</td>
                <td>${tipoLabel[m.tipo] || m.tipo}</td>
                <td>${ing?.nombre || '?'}</td>
                <td class="${m.cantidad > 0 ? 'inv-positivo' : 'inv-negativo'}">${m.cantidad > 0 ? '+' : ''}${m.cantidad} ${u}</td>
                <td style="font-size:.8rem;color:var(--text2)">${m.stock_antes != null ? m.stock_antes : '?'} → ${m.stock_despues != null ? m.stock_despues : '?'} ${u}</td>
                <td style="font-size:.8rem;color:var(--text2)">${m.notas || ''}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  // ── ACCIONES ──

  nuevoIngrediente() {
    const nombre = prompt('Nombre del ingrediente:');
    if (!nombre) return;
    const unidad = prompt('Unidad (pz, kg, g, lt, ml):', 'pz');
    if (!unidad) return;
    const categoria = prompt('Categoría (carne, tortillas, bebidas, verduras, general):', 'general');
    const stockMin = parseFloat(prompt('Stock mínimo (alerta):', '5')) || 0;
    const costo = parseFloat(prompt('Costo por ' + unidad + ':', '0')) || 0;

    this._crearIngrediente(nombre, unidad, categoria || 'general', stockMin, costo);
  },

  async _crearIngrediente(nombre, unidad, categoria, stockMinimo, costoUnitario) {
    try {
      await SB.insertN('taq_ingredientes', { nombre, unidad, categoria, stock_minimo: stockMinimo, costo_unitario: costoUnitario });
      Auth.audit('producto_creado', null, { tipo: 'ingrediente', nombre, unidad });
      App.toast('Ingrediente agregado');
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Inventario._crearIngrediente');
      App.toast('Error al crear ingrediente: ' + e.message, 'error');
    }
  },

  async editarIngrediente(id) {
    try {
      const [ing] = await SB.get('taq_ingredientes', `id=eq.${id}`);
      if (!ing) return;
      const nombre = prompt('Nombre:', ing.nombre);
      if (!nombre) return;
      const stockMin = parseFloat(prompt('Stock mínimo:', ing.stock_minimo)) || 0;
      const costo = parseFloat(prompt('Costo por ' + ing.unidad + ':', ing.costo_unitario)) || 0;

      await SB.update('taq_ingredientes', `id=eq.${id}`, { nombre, stock_minimo: stockMin, costo_unitario: costo });
      App.toast('Ingrediente actualizado');
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Inventario.editarIngrediente');
      App.toast('Error: ' + e.message, 'error');
    }
  },

  async registrarCompra(ingId, nombre, unidad) {
    const cantidad = parseFloat(prompt(`¿Cuántas ${unidad} de ${nombre} compraste?`));
    if (!cantidad || cantidad <= 0) return;
    try {
      await SB.rpc('registrar_movimiento', {
        p_negocio_id:     SB.negocioId,
        p_ingrediente_id: ingId,
        p_tipo:           'compra',
        p_cantidad:       cantidad,
        p_notas:          `Compra ${cantidad} ${unidad}`,
        p_usuario_id:     Auth.user?.id || null
      });
      App.toast(`+${cantidad} ${unidad} de ${nombre}`);
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Inventario.registrarCompra');
      App.toast('Error al registrar compra: ' + e.message, 'error');
    }
  },

  async registrarMerma(ingId, nombre, unidad) {
    const cantidad = parseFloat(prompt(`¿Cuántas ${unidad} de ${nombre} se perdieron/echaron a perder?`));
    if (!cantidad || cantidad <= 0) return;
    const motivo = prompt('Motivo (ej: se cayó, echó a perder, robo):') || 'sin especificar';
    try {
      await SB.rpc('registrar_movimiento', {
        p_negocio_id:     SB.negocioId,
        p_ingrediente_id: ingId,
        p_tipo:           'merma',
        p_cantidad:       -cantidad,
        p_notas:          motivo,
        p_usuario_id:     Auth.user?.id || null
      });
      Auth.audit('orden_modificada', null, { producto: nombre, motivo, tipo: 'merma' }, 'warning');
      App.toast(`-${cantidad} ${unidad} de ${nombre} (merma)`);
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Inventario.registrarMerma');
      App.toast('Error al registrar merma: ' + e.message, 'error');
    }
  },

  async registrarAjuste(ingId, nombre, unidad) {
    try {
      const [ing] = await SB.getN('taq_ingredientes', `id=eq.${ingId}`);
      if (!ing) { App.toast('Ingrediente no encontrado'); return; }
      const stockReal = parseFloat(prompt(
        `Stock actual en sistema: ${ing.stock_actual} ${unidad}\n¿Cuánto hay físicamente en almacén?`
      ));
      if (isNaN(stockReal)) return;
      const motivo = prompt('Motivo del ajuste:') || 'regularización';

      const diferencia = stockReal - parseFloat(ing.stock_actual || 0);
      if (diferencia === 0) { App.toast('Sin diferencia, no se registró ajuste'); return; }

      await SB.rpc('registrar_movimiento', {
        p_negocio_id:     SB.negocioId,
        p_ingrediente_id: ingId,
        p_tipo:           'ajuste',
        p_cantidad:       diferencia,
        p_notas:          `Ajuste a ${stockReal} ${unidad}: ${motivo}`,
        p_usuario_id:     Auth.user?.id || null
      });
      Auth.audit('orden_modificada', null, { producto: nombre, motivo, tipo: 'ajuste', diferencia }, 'warning');
      App.toast(`Ajuste: ${diferencia > 0 ? '+' : ''}${diferencia.toFixed(2)} ${unidad} de ${nombre}`);
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Inventario.registrarAjuste');
      App.toast('Error al registrar ajuste: ' + e.message, 'error');
    }
  },

  async agregarAReceta(productoId, productoNombre) {
    const ingredientes = this._ingredientes;
    if (!ingredientes.length) {
      App.toast('Primero agrega ingredientes');
      return;
    }
    const opciones = ingredientes.map((i, idx) => `${idx + 1}. ${i.nombre} (${i.unidad})`).join('\n');
    const sel = parseInt(prompt(`Elige ingrediente para "${productoNombre}":\n\n${opciones}`));
    if (!sel || sel < 1 || sel > ingredientes.length) return;

    const ing = ingredientes[sel - 1];
    const cantidad = parseFloat(prompt(`¿Cuántas ${ing.unidad} de ${ing.nombre} lleva 1 ${productoNombre}?`));
    if (!cantidad || cantidad <= 0) return;

    try {
      await SB.insertN('taq_recetas', { producto_id: productoId, ingrediente_id: ing.id, cantidad });
      App.toast(`${cantidad} ${ing.unidad} de ${ing.nombre} por ${productoNombre}`);
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Inventario.agregarAReceta');
      App.toast('Error: ' + e.message, 'error');
    }
  },

  async quitarDeReceta(recetaId) {
    if (!confirm('¿Quitar este ingrediente de la receta?')) return;
    try {
      await SB.delete('taq_recetas', `id=eq.${recetaId}`);
      App.toast('Ingrediente quitado de receta');
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Inventario.quitarDeReceta');
      App.toast('Error: ' + e.message, 'error');
    }
  },

  // ── PRONÓSTICO ──

  async verPronostico() {
    const ingredientes = this._ingredientes;
    const recetas = this._recetas;

    if (!recetas.length) {
      App.toast('Define recetas primero para ver pronósticos');
      return;
    }

    // Ventas de los últimos 7 días
    const hace7 = new Date();
    hace7.setDate(hace7.getDate() - 7);
    const desde = hace7.toISOString();

    const ordenesCobradas = await SB.getN('taq_ordenes', `estado=eq.cobrada&cobrada_at=gte.${desde}`);
    let items = [];
    if (ordenesCobradas.length) {
      const ids = ordenesCobradas.map(o => o.id);
      items = await SB.get('taq_orden_items', `orden_id=in.(${ids.join(',')})&order=created_at`);
    }

    // Contar productos vendidos por día
    const diasActivos = new Set(ordenesCobradas.map(o => o.cobrada_at?.split('T')[0])).size || 1;

    // Calcular consumo de ingredientes por producto vendido
    const consumoPorIng = {};
    const ingMap = {};
    ingredientes.forEach(i => { ingMap[i.id] = i; consumoPorIng[i.id] = 0; });

    items.forEach(item => {
      const prodRecetas = recetas.filter(r => r.producto_id === item.producto_id);
      prodRecetas.forEach(r => {
        if (consumoPorIng[r.ingrediente_id] !== undefined) {
          consumoPorIng[r.ingrediente_id] += r.cantidad * item.cantidad;
        }
      });
    });

    // Pronóstico: consumo diario promedio
    const pronostico = ingredientes.map(ing => {
      const consumoTotal = consumoPorIng[ing.id] || 0;
      const consumoDiario = consumoTotal / diasActivos;
      const diasStock = consumoDiario > 0 ? (ing.stock_actual / consumoDiario) : Infinity;
      const pedirSemana = Math.max(0, Math.ceil(consumoDiario * 7 - ing.stock_actual));

      return {
        ...ing,
        consumoTotal,
        consumoDiario: consumoDiario.toFixed(1),
        diasStock: diasStock === Infinity ? '∞' : diasStock.toFixed(1),
        pedirSemana,
        costoSemana: (pedirSemana * parseFloat(ing.costo_unitario || 0)).toFixed(0)
      };
    }).filter(i => i.consumoTotal > 0 || i.stock_actual > 0)
      .sort((a, b) => (a.diasStock === '∞' ? 999 : parseFloat(a.diasStock)) - (b.diasStock === '∞' ? 999 : parseFloat(b.diasStock)));

    const costoTotalSemana = pronostico.reduce((s, p) => s + parseFloat(p.costoSemana), 0);

    // Mostrar modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
      <div class="modal-card" style="max-width:600px">
        <div class="modal-header">
          <h2>📊 Pronóstico Semanal</h2>
          <button class="btn btn-sm btn-outline" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <p style="color:var(--text2);font-size:.85rem;margin-bottom:12px">
          Basado en ventas de ${diasActivos} día(s) — ${ordenesCobradas.length} pedidos cobrados
        </p>
        <table class="corte-table">
          <thead><tr><th>Ingrediente</th><th>Stock</th><th>Uso/día</th><th>Días restantes</th><th>Pedir (semana)</th><th>Costo</th></tr></thead>
          <tbody>
            ${pronostico.map(p => `
              <tr class="${parseFloat(p.diasStock) < 2 ? 'inv-bajo' : ''}">
                <td>${p.nombre}</td>
                <td>${p.stock_actual} ${p.unidad}</td>
                <td>${p.consumoDiario} ${p.unidad}</td>
                <td><strong>${p.diasStock}</strong> días</td>
                <td>${p.pedirSemana > 0 ? `<strong>${p.pedirSemana} ${p.unidad}</strong>` : '✓'}</td>
                <td>${p.pedirSemana > 0 ? '$' + p.costoSemana : '—'}</td>
              </tr>
            `).join('')}
            ${!pronostico.length ? '<tr><td colspan="6" style="text-align:center">Sin datos suficientes. Define recetas y vende para generar pronósticos.</td></tr>' : ''}
          </tbody>
        </table>
        ${costoTotalSemana > 0 ? `
          <div style="text-align:right;margin-top:12px;font-size:1.1rem">
            <strong>Costo estimado de compras: $${costoTotalSemana.toFixed(0)}</strong>
          </div>
        ` : ''}
      </div>
    `;
    document.body.appendChild(modal);
  }
};
