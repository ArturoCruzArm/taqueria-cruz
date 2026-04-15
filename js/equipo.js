/**
 * equipo.js — Gestión de personal (solo admin)
 * CRUD de usuarios, asignar roles, activar/desactivar
 */
const Equipo = {
  _roles: [],

  async render(el) {
    const [usuarios, roles] = await Promise.all([
      SB.getN('taq_usuarios', 'order=nombre'),
      SB.getN('taq_roles', 'order=nombre')
    ]);
    this._roles = roles;

    const roleMap = {};
    roles.forEach(r => roleMap[r.id] = r);

    const activos = usuarios.filter(u => u.activo);
    const inactivos = usuarios.filter(u => !u.activo);

    el.innerHTML = `
      <div class="view-header">
        <h1>👥 Equipo</h1>
        <button class="btn btn-primary" onclick="Equipo.nuevoUsuario()">+ Nuevo</button>
      </div>

      <div class="equipo-list">
        ${activos.map(u => this._renderUsuario(u, roleMap)).join('')}
      </div>

      ${inactivos.length ? `
        <h3 style="margin:1.5rem 0 .8rem;color:var(--muted)">Inactivos</h3>
        <div class="equipo-list">
          ${inactivos.map(u => this._renderUsuario(u, roleMap)).join('')}
        </div>
      ` : ''}

      <h3 style="margin:2rem 0 .8rem">Roles del Negocio</h3>
      <div class="equipo-roles">
        ${roles.map(r => `
          <div class="equipo-rol-card">
            <div class="equipo-rol-header">
              <strong>${r.nombre}</strong>
              ${r.es_admin ? '<span class="equipo-badge-admin">Admin</span>' : ''}
              <button class="btn btn-sm btn-outline" onclick="Equipo.editarRol('${r.id}')">✏️</button>
            </div>
            <div class="equipo-rol-permisos">
              ${(r.permisos || []).map(p => `<span class="equipo-permiso">${p}</span>`).join('')}
            </div>
          </div>
        `).join('')}
        <button class="btn btn-outline btn-block" onclick="Equipo.nuevoRol()" style="margin-top:8px">+ Nuevo Rol</button>
      </div>
    `;
  },

  _renderUsuario(u, roleMap) {
    const rol = roleMap[u.rol_id];
    return `
      <div class="equipo-card ${u.activo ? '' : 'equipo-inactivo'}">
        <div class="equipo-avatar">${u.avatar || '👤'}</div>
        <div class="equipo-info">
          <div class="equipo-nombre">${u.nombre}</div>
          <div class="equipo-rol">${rol?.nombre || u.rol || 'Sin rol'}</div>
          <div class="equipo-pin" title="Toca para revelar" onclick="this.textContent=this.textContent.includes('●')?'PIN: ${u.pin}':'PIN: ●●●●'" style="cursor:pointer">PIN: ●●●●</div>
        </div>
        <div class="equipo-actions">
          <button class="btn btn-sm btn-outline" onclick="Equipo.editar('${u.id}')">✏️</button>
          ${u.activo
            ? `<button class="btn btn-sm btn-outline" onclick="Equipo.desactivar('${u.id}', '${u.nombre.replace(/'/g,"\\'")}')">🚫</button>`
            : `<button class="btn btn-sm btn-success" onclick="Equipo.reactivar('${u.id}', '${u.nombre.replace(/'/g,"\\'")}')">✅</button>`
          }
        </div>
      </div>
    `;
  },

  _validarPin(pin) {
    return /^\d{4}$/.test(pin);
  },

  // ── CRUD Usuarios ──

  async nuevoUsuario() {
    const nombre = prompt('Nombre del empleado:');
    if (!nombre || !nombre.trim()) return;
    const avatar = prompt('Emoji/Avatar:', '👤') || '👤';
    const pin = prompt('PIN de 4 dígitos (solo números):');
    if (!this._validarPin(pin)) {
      App.toast('El PIN debe ser exactamente 4 dígitos numéricos');
      return;
    }

    try {
      // Verificar PIN único en el negocio
      const existe = await SB.getN('taq_usuarios', `pin=eq.${pin}&limit=1`);
      if (existe.length) {
        App.toast('Ese PIN ya está en uso');
        return;
      }

      // Elegir rol
      const opciones = this._roles.map((r, i) => `${i + 1}. ${r.nombre}${r.es_admin ? ' (admin)' : ''}`).join('\n');
      const sel = parseInt(prompt(`Rol:\n\n${opciones}`));
      if (!sel || sel < 1 || sel > this._roles.length) return;
      const rol = this._roles[sel - 1];

      await SB.insertN('taq_usuarios', {
        nombre: nombre.trim(), avatar, pin,
        rol: rol.nombre,
        rol_id: rol.id
      });

      Auth.audit('usuario_creado', null, { nombre: nombre.trim(), rol: rol.nombre });
      App.toast(`${nombre.trim()} agregado al equipo`);
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Equipo.nuevoUsuario');
      App.toast('Error al crear usuario: ' + e.message, 'error');
    }
  },

  async editar(id) {
    try {
      const [u] = await SB.get('taq_usuarios', `id=eq.${id}`);
      if (!u) return;

      const nombre = prompt('Nombre:', u.nombre);
      if (!nombre || !nombre.trim()) return;
      const avatar = prompt('Avatar:', u.avatar) || u.avatar;
      const pin = prompt('PIN (4 dígitos):', u.pin);
      if (!this._validarPin(pin)) {
        App.toast('El PIN debe ser exactamente 4 dígitos numéricos');
        return;
      }

      // Verificar PIN único (excepto el mismo usuario)
      const existe = await SB.getN('taq_usuarios', `pin=eq.${pin}&id=neq.${id}&limit=1`);
      if (existe.length) {
        App.toast('Ese PIN ya está en uso');
        return;
      }

      // Elegir rol
      const opciones = this._roles.map((r, i) => `${i + 1}. ${r.nombre}${r.es_admin ? ' (admin)' : ''}`).join('\n');
      const rolActual = this._roles.findIndex(r => r.id === u.rol_id) + 1;
      const sel = parseInt(prompt(`Rol (actual: ${rolActual}):\n\n${opciones}`, rolActual));
      if (!sel || sel < 1 || sel > this._roles.length) return;
      const rol = this._roles[sel - 1];

      const cambioRol = rol.id !== u.rol_id;

      await SB.update('taq_usuarios', `id=eq.${id}`, {
        nombre: nombre.trim(), avatar, pin,
        rol: rol.nombre,
        rol_id: rol.id
      });

      if (cambioRol) {
        Auth.audit('rol_cambiado', id, { nombre: nombre.trim(), rol_anterior: u.rol, rol_nuevo: rol.nombre }, 'warning');
      }

      App.toast(`${nombre.trim()} actualizado`);
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Equipo.editar');
      App.toast('Error al actualizar: ' + e.message, 'error');
    }
  },

  async desactivar(id, nombre) {
    try {
      // No permitir desactivar al último admin
      const admins = await SB.getN('taq_usuarios', 'activo=eq.true&limit=200');
      const adminRoles = this._roles.filter(r => r.es_admin).map(r => r.id);
      const adminsActivos = admins.filter(u => adminRoles.includes(u.rol_id) && u.id !== id);
      if (adminsActivos.length === 0) {
        App.toast('No puedes desactivar al último administrador');
        return;
      }

      if (!confirm(`¿Desactivar a ${nombre}? No podrá iniciar sesión.`)) return;

      await SB.update('taq_usuarios', `id=eq.${id}`, { activo: false });
      Auth.audit('usuario_desactivado', id, { nombre }, 'critical');
      App.toast(`${nombre} desactivado`);
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Equipo.desactivar');
      App.toast('Error: ' + e.message, 'error');
    }
  },

  async reactivar(id, nombre) {
    try {
      await SB.update('taq_usuarios', `id=eq.${id}`, { activo: true });
      Auth.audit('usuario_reactivado', id, { nombre }, 'warning');
      App.toast(`${nombre} reactivado`);
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Equipo.reactivar');
      App.toast('Error: ' + e.message, 'error');
    }
  },

  // ── CRUD Roles ──

  async nuevoRol() {
    const nombre = prompt('Nombre del rol:');
    if (!nombre || !nombre.trim()) return;

    const vistas = ['pedidos','nuevo','cocina','cobrar','tareas','corte','inventario','menu','equipo','negocio','auditoria','desempeno','horarios'];
    const permisos = [];
    for (const v of vistas) {
      if (confirm(`¿El rol "${nombre.trim()}" puede acceder a "${v}"?`)) {
        permisos.push(v);
      }
    }

    const esAdmin = confirm(`¿"${nombre.trim()}" es administrador? (acceso total + superpoderes)`);

    try {
      await SB.insertN('taq_roles', { nombre: nombre.trim(), permisos, es_admin: esAdmin });
      App.toast(`Rol "${nombre.trim()}" creado`);
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Equipo.nuevoRol');
      App.toast('Error al crear rol: ' + e.message, 'error');
    }
  },

  async editarRol(id) {
    try {
      const [rol] = await SB.getN('taq_roles', `id=eq.${id}&limit=1`);
      if (!rol) return;

      const nombre = prompt('Nombre:', rol.nombre);
      if (!nombre || !nombre.trim()) return;

      const vistas = ['pedidos','nuevo','cocina','cobrar','tareas','corte','inventario','menu','equipo','negocio','auditoria','desempeno','horarios'];
      const permisos = [];
      for (const v of vistas) {
        const tiene = (rol.permisos || []).includes(v);
        if (confirm(`¿"${nombre.trim()}" puede acceder a "${v}"?${tiene ? ' (actualmente SÍ)' : ' (actualmente NO)'}`)) {
          permisos.push(v);
        }
      }

      const esAdmin = confirm(`¿"${nombre.trim()}" es administrador?${rol.es_admin ? ' (actualmente SÍ)' : ' (actualmente NO)'}`);

      await SB.update('taq_roles', `id=eq.${id}`, { nombre: nombre.trim(), permisos, es_admin: esAdmin });
      App.toast(`Rol "${nombre.trim()}" actualizado`);
      this.render(document.getElementById('main'));
    } catch (e) {
      ErrorLogger?.capture(e, 'Equipo.editarRol');
      App.toast('Error al actualizar rol: ' + e.message, 'error');
    }
  }
};
