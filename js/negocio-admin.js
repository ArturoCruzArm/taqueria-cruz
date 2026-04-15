/**
 * negocio-admin.js — Configuración del negocio (solo admin)
 * Datos del negocio, mesas, código del día
 */
const NegocioAdmin = {

  async render(el) {
    const negocio = Auth.negocio;
    const mesas = await SB.getN('taq_mesas', 'order=nombre');

    // Código del día actual
    const hoy = App.hoy();
    const codigos = await SB.getN('taq_codigos_dia', `fecha=eq.${hoy}&limit=1`);
    const codigoHoy = codigos.length ? codigos[0].codigo : null;

    el.innerHTML = `
      <div class="view-header">
        <h1>⚙️ Configuración</h1>
      </div>

      <!-- Datos del negocio -->
      <div class="config-section">
        <h2>Datos del Negocio</h2>
        <div class="config-form">
          <div class="config-field">
            <label>Nombre</label>
            <input type="text" id="cfgNombre" value="${App.esc(negocio.nombre || '')}" class="config-input">
          </div>
          <div class="config-field">
            <label>Descripción</label>
            <input type="text" id="cfgDesc" value="${App.esc(negocio.descripcion || '')}" class="config-input" placeholder="Ej: Los mejores tacos de la zona">
          </div>
          <div class="config-field">
            <label>Dirección</label>
            <input type="text" id="cfgDir" value="${App.esc(negocio.direccion || '')}" class="config-input" placeholder="Ej: Av. Reforma 123, Col. Centro">
          </div>
          <div class="config-field">
            <label>Teléfono</label>
            <input type="tel" id="cfgTel" value="${App.esc(negocio.telefono || '')}" class="config-input" placeholder="Ej: 55 1234 5678">
          </div>
          <div class="config-field">
            <label>Color principal</label>
            <input type="color" id="cfgColor" value="${negocio.color_primario || '#e94560'}" class="config-color">
          </div>
          <div class="config-field">
            <label>Slug (URL)</label>
            <div class="config-slug">/n/<strong>${negocio.slug}</strong></div>
          </div>
          <button class="btn btn-primary btn-block" onclick="NegocioAdmin.guardarDatos()">Guardar Cambios</button>
        </div>
      </div>

      <!-- Código del día -->
      <div class="config-section">
        <h2>🔢 Código del Día</h2>
        <p style="color:var(--muted);font-size:.85rem">Los clientes necesitan este código para hacer pedidos desde su celular. Solo es visible en el local.</p>
        ${codigoHoy ? `
          <div class="config-codigo-actual">
            <span class="config-codigo-num">${codigoHoy}</span>
            <span class="config-codigo-label">Código de hoy</span>
          </div>
        ` : `
          <p style="margin:12px 0">No hay código generado para hoy.</p>
        `}
        <button class="btn btn-outline btn-block" onclick="NegocioAdmin.generarCodigo()">
          ${codigoHoy ? 'Regenerar Código' : 'Generar Código del Día'}
        </button>
      </div>

      <!-- URL del menú general -->
      <div class="config-section">
        <h2>🔗 Menú para Clientes</h2>
        ${(() => {
          const slug = negocio.slug || '';
          const base = location.origin + location.pathname.replace(/\/[^/]*$/, '/');
          const urlMenu = `${base}cliente.html?n=${slug}`;
          return `
            <p style="color:var(--muted);font-size:.85rem">Comparte este enlace para que los clientes vean tu menú desde su celular. Sin mesa asignada solo pueden ver, no pedir.</p>
            <div style="background:var(--bg2);border-radius:8px;padding:12px;margin:10px 0">
              <div style="font-size:.78rem;color:var(--muted);word-break:break-all;margin-bottom:8px">${urlMenu}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-sm btn-primary" onclick="navigator.clipboard.writeText('${urlMenu.replace(/'/g,"\\'")}').then(()=>App.toast('URL copiada'))">📋 Copiar URL del menú</button>
                <a class="btn btn-sm btn-outline" href="${urlMenu}" target="_blank">🔗 Abrir menú</a>
              </div>
            </div>
          `;
        })()}
      </div>

      <!-- Mesas -->
      <div class="config-section">
        <h2>🪑 Mesas / Posiciones</h2>
        <p style="color:var(--muted);font-size:.85rem">Cada mesa tiene su propio enlace. El cliente que entra por ese enlace puede hacer pedidos desde su lugar.</p>
        <div class="config-mesas">
          ${mesas.map(m => {
            const slug = negocio.slug || '';
            const base = location.origin + location.pathname.replace(/\/[^/]*$/, '/');
            const url = m.qr_token ? `${base}cliente.html?n=${slug}&mesa=${m.qr_token}` : null;
            return `
            <div class="config-mesa-item">
              <div class="config-mesa-header">
                <span class="config-mesa-nombre">${m.nombre}</span>
                <div style="display:flex;gap:4px;flex-shrink:0">
                  ${m.activa
                    ? `<button class="btn btn-sm btn-outline" onclick="NegocioAdmin.toggleMesa('${m.id}', false)">Desactivar</button>`
                    : `<button class="btn btn-sm btn-success" onclick="NegocioAdmin.toggleMesa('${m.id}', true)">Activar</button>`
                  }
                  <button class="btn btn-sm btn-outline" onclick="NegocioAdmin.editarMesa('${m.id}', '${m.nombre.replace(/'/g,"\\'")}')">✏️</button>
                </div>
              </div>
              ${url ? `
                <div style="font-size:.72rem;color:var(--muted);word-break:break-all">${url}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="btn btn-sm btn-outline" onclick="navigator.clipboard.writeText('${url.replace(/'/g,"\\'")}').then(()=>App.toast('URL copiada'))">📋 Copiar</button>
                  <a class="btn btn-sm btn-outline" href="${url}" target="_blank">🔗 Abrir</a>
                </div>
              ` : `<span style="font-size:.72rem;color:var(--muted)">Sin token QR — recrea la mesa para generarlo</span>`}
            </div>
          `}).join('')}
        </div>
        <button class="btn btn-outline btn-block" onclick="NegocioAdmin.nuevaMesa()" style="margin-top:8px">+ Nueva Mesa</button>
      </div>
    `;
  },

  async guardarDatos() {
    const datos = {
      nombre: document.getElementById('cfgNombre').value.trim(),
      descripcion: document.getElementById('cfgDesc').value.trim() || null,
      direccion: document.getElementById('cfgDir').value.trim() || null,
      telefono: document.getElementById('cfgTel').value.trim() || null,
      color_primario: document.getElementById('cfgColor').value
    };

    if (!datos.nombre) { App.toast('El nombre es obligatorio'); return; }

    try {
      await SB.update('taq_negocios', `id=eq.${SB.negocioId}`, datos);
      Auth.negocio = { ...Auth.negocio, ...datos };
      Auth.setNegocio(Auth.negocio);
      document.title = datos.nombre;
      Auth.audit('config_negocio_cambiada', null, { campos: Object.keys(datos) }, 'warning');
      App.toast('Datos guardados');
      App.renderTopBar();
    } catch (e) {
      ErrorLogger?.capture(e, 'NegocioAdmin.guardarDatos');
      App.toast('Error al guardar: ' + e.message, 'error');
    }
  },

  async generarCodigo() {
    const codigo = String(Math.floor(100 + Math.random() * 900)); // 3 dígitos 100-999
    const hoy = App.hoy();
    try {
      const existente = await SB.getN('taq_codigos_dia', `fecha=eq.${hoy}&limit=1`);
      if (existente.length) {
        await SB.update('taq_codigos_dia', `id=eq.${existente[0].id}`, { codigo });
      } else {
        await SB.insertN('taq_codigos_dia', { codigo, fecha: hoy });
      }
      Auth.audit('codigo_dia_generado', null, { codigo });
      App.toast(`Código del día: ${codigo}`);
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'NegocioAdmin.generarCodigo');
      App.toast('Error al generar código: ' + e.message, 'error');
    }
  },

  async nuevaMesa() {
    const nombre = prompt('Nombre de la mesa/posición:');
    if (!nombre || !nombre.trim()) return;
    try {
      const qr_token = crypto.randomUUID();
      await SB.insertN('taq_mesas', { nombre: nombre.trim(), qr_token });
      Auth.audit('mesa_creada', null, { nombre: nombre.trim() });
      App.toast(`Mesa "${nombre.trim()}" creada`);
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'NegocioAdmin.nuevaMesa');
      App.toast('Error al crear mesa: ' + e.message, 'error');
    }
  },

  async editarMesa(id, nombre) {
    const nuevo = prompt('Nombre:', nombre);
    if (!nuevo || !nuevo.trim()) return;
    try {
      await SB.update('taq_mesas', `id=eq.${id}`, { nombre: nuevo.trim() });
      App.toast('Mesa actualizada');
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'NegocioAdmin.editarMesa');
      App.toast('Error: ' + e.message, 'error');
    }
  },

  async toggleMesa(id, activa) {
    try {
      await SB.update('taq_mesas', `id=eq.${id}`, { activa });
      App.toast(activa ? 'Mesa activada' : 'Mesa desactivada');
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'NegocioAdmin.toggleMesa');
      App.toast('Error: ' + e.message, 'error');
    }
  }
};
