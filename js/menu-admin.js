/**
 * menu-admin.js — Administración de menú (productos, categorías, precios)
 */
const MenuAdmin = {
  async render(el) {
    const [cats, prods] = await Promise.all([
      SB.get('taq_categorias', 'order=orden'),
      SB.get('taq_productos', 'order=orden')
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
                <button class="btn btn-sm btn-outline" onclick="MenuAdmin.editarCategoria('${c.id}', '${c.nombre}', '${c.icono}')">✏️</button>
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
    await SB.update('taq_productos', `id=eq.${id}`, { disponible: val });
    await App.loadMenu();
    this.render(document.getElementById('main'));
    App.toast(val ? 'Producto disponible' : 'Producto agotado');
  },

  nuevoProducto(catId) {
    const nombre = prompt('Nombre del producto:');
    if (!nombre) return;
    const precio = parseFloat(prompt('Precio:', '25'));
    if (isNaN(precio)) return;
    this._crearProducto(catId, nombre, precio);
  },

  async _crearProducto(catId, nombre, precio) {
    await SB.insert('taq_productos', { categoria_id: catId, nombre, precio, disponible: true });
    await App.loadMenu();
    this.render(document.getElementById('main'));
    App.toast('Producto agregado');
  },

  editarProducto(id, nombre, precio, catId) {
    const nuevoNombre = prompt('Nombre:', nombre);
    if (!nuevoNombre) return;
    const nuevoPrecio = parseFloat(prompt('Precio:', precio));
    if (isNaN(nuevoPrecio)) return;
    this._actualizarProducto(id, nuevoNombre, nuevoPrecio);
  },

  async _actualizarProducto(id, nombre, precio) {
    await SB.update('taq_productos', `id=eq.${id}`, { nombre, precio });
    await App.loadMenu();
    this.render(document.getElementById('main'));
    App.toast('Producto actualizado');
  },

  nuevaCategoria() {
    const nombre = prompt('Nombre de la categoría:');
    if (!nombre) return;
    const icono = prompt('Emoji/Icono:', '🍽️');
    this._crearCategoria(nombre, icono || '🍽️');
  },

  async _crearCategoria(nombre, icono) {
    await SB.insert('taq_categorias', { nombre, icono, activa: true });
    await App.loadMenu();
    this.render(document.getElementById('main'));
    App.toast('Categoría creada');
  },

  editarCategoria(id, nombre, icono) {
    const nuevoNombre = prompt('Nombre:', nombre);
    if (!nuevoNombre) return;
    const nuevoIcono = prompt('Icono:', icono);
    this._actualizarCategoria(id, nuevoNombre, nuevoIcono || icono);
  },

  async _actualizarCategoria(id, nombre, icono) {
    await SB.update('taq_categorias', `id=eq.${id}`, { nombre, icono });
    await App.loadMenu();
    this.render(document.getElementById('main'));
    App.toast('Categoría actualizada');
  }
};
