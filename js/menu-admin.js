/**
 * menu-admin.js — Administración de menú (multi-tenant, auditoría)
 */
const MenuAdmin = {
  async render(el) {
    const [cats, prods] = await Promise.all([
      SB.getN('taq_categorias', 'order=orden&limit=200'),
      SB.getN('taq_productos', 'order=orden&limit=500')
    ]);

    el.innerHTML = `
      <div class="view-header">
        <h1>Administrar Menú</h1>
        <button class="btn btn-primary" onclick="MenuAdmin.nuevaCategoria()">+ Categoría</button>
      </div>

      ${cats.map(c => {
        const catProds = prods.filter(p => p.categoria_id === c.id);
        return `
          <div class="admin-cat-section">
            <div class="admin-cat-header">
              <h2>${c.icono} ${c.nombre}</h2>
              <div>
                <button class="btn btn-sm btn-outline" onclick="MenuAdmin.editarCategoria('${c.id}', '${c.nombre.replace(/'/g,"\\'")}', '${c.icono}')">✏️</button>
                <button class="btn btn-sm btn-outline" onclick="MenuAdmin.nuevoProducto('${c.id}')">+ Producto</button>
              </div>
            </div>
            <table class="admin-table">
              <thead><tr><th>Producto</th><th>Precio</th><th>Disp.</th><th></th></tr></thead>
              <tbody>
                ${catProds.map(p => `
                  <tr class="${p.disponible ? '' : 'no-disponible'}">
                    <td>${p.nombre}</td>
                    <td>$${parseFloat(p.precio).toFixed(0)}</td>
                    <td>
                      <button class="btn btn-sm ${p.disponible ? 'btn-success' : 'btn-outline'}"
                        onclick="MenuAdmin.toggleDisponible('${p.id}', ${!p.disponible})">
                        ${p.disponible ? '✓' : '✕'}
                      </button>
                    </td>
                    <td>
                      <button class="btn btn-sm btn-outline" onclick="MenuAdmin.editarProducto('${p.id}', '${p.nombre.replace(/'/g,"\\'")}', ${p.precio}, '${c.id}')">✏️</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    `;
  },

  async toggleDisponible(id, val) {
    try {
      await SB.update('taq_productos', `id=eq.${id}`, { disponible: val });
      Auth.audit('producto_disponibilidad', id, { disponible: val });
      await App.loadMenu();
      this.render(document.getElementById('main'));
      App.toast(val ? 'Producto disponible' : 'Producto agotado');
    } catch (e) {
      ErrorLogger?.capture(e, 'MenuAdmin.toggleDisponible');
      App.toast('Error: ' + e.message, 'error');
    }
  },

  nuevoProducto(catId) {
    const nombre = prompt('Nombre del producto:');
    if (!nombre || !nombre.trim()) return;
    const precioStr = prompt('Precio:', '25');
    if (precioStr === null) return;
    const precio = parseFloat(precioStr);
    if (isNaN(precio) || precio <= 0) { App.toast('Precio inválido'); return; }
    this._crearProducto(catId, nombre.trim(), precio);
  },

  async _crearProducto(catId, nombre, precio) {
    try {
      const [prod] = await SB.insertN('taq_productos', { categoria_id: catId, nombre, precio, disponible: true });
      Auth.audit('producto_creado', prod?.id, { nombre, precio });
      await App.loadMenu();
      this.render(document.getElementById('main'));
      App.toast('Producto agregado');
    } catch (e) {
      ErrorLogger?.capture(e, 'MenuAdmin._crearProducto');
      App.toast('Error al crear producto: ' + e.message, 'error');
    }
  },

  editarProducto(id, nombre, precio, catId) {
    const nuevoNombre = prompt('Nombre:', nombre);
    if (!nuevoNombre || !nuevoNombre.trim()) return;
    const precioStr = prompt('Precio:', precio);
    if (precioStr === null) return;
    const nuevoPrecio = parseFloat(precioStr);
    if (isNaN(nuevoPrecio) || nuevoPrecio <= 0) { App.toast('Precio inválido'); return; }
    this._actualizarProducto(id, nuevoNombre.trim(), nuevoPrecio, nombre, precio);
  },

  async _actualizarProducto(id, nombre, precio, nombreAnterior, precioAnterior) {
    try {
      await SB.update('taq_productos', `id=eq.${id}`, { nombre, precio });
      if (precio !== precioAnterior) {
        Auth.audit('precio_cambiado', id, {
          producto: nombre,
          precio_anterior: precioAnterior,
          precio_nuevo: precio
        }, 'warning');
      }
      await App.loadMenu();
      this.render(document.getElementById('main'));
      App.toast('Producto actualizado');
    } catch (e) {
      ErrorLogger?.capture(e, 'MenuAdmin._actualizarProducto');
      App.toast('Error al actualizar: ' + e.message, 'error');
    }
  },

  nuevaCategoria() {
    const nombre = prompt('Nombre de la categoría:');
    if (!nombre || !nombre.trim()) return;
    const icono = prompt('Emoji/Icono:', '🍽️') || '🍽️';
    this._crearCategoria(nombre.trim(), icono);
  },

  async _crearCategoria(nombre, icono) {
    try {
      const [cat] = await SB.insertN('taq_categorias', { nombre, icono, activa: true });
      Auth.audit('categoria_creada', cat?.id, { nombre, icono });
      await App.loadMenu();
      this.render(document.getElementById('main'));
      App.toast('Categoría creada');
    } catch (e) {
      ErrorLogger?.capture(e, 'MenuAdmin._crearCategoria');
      App.toast('Error al crear categoría: ' + e.message, 'error');
    }
  },

  editarCategoria(id, nombre, icono) {
    const nuevoNombre = prompt('Nombre:', nombre);
    if (!nuevoNombre || !nuevoNombre.trim()) return;
    const nuevoIcono = prompt('Icono:', icono) || icono;
    this._actualizarCategoria(id, nuevoNombre.trim(), nuevoIcono);
  },

  async _actualizarCategoria(id, nombre, icono) {
    try {
      await SB.update('taq_categorias', `id=eq.${id}`, { nombre, icono });
      await App.loadMenu();
      this.render(document.getElementById('main'));
      App.toast('Categoría actualizada');
    } catch (e) {
      ErrorLogger?.capture(e, 'MenuAdmin._actualizarCategoria');
      App.toast('Error al actualizar: ' + e.message, 'error');
    }
  }
};
