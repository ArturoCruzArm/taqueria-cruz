/**
 * app.js — Router SPA y lógica principal de Taquería Cruz
 */

const App = {
  currentView: null,
  menuData: { categorias: [], productos: [] },

  async init() {
    await this.loadMenu();
    window.addEventListener('hashchange', () => this.route());
    this.route();
  },

  async loadMenu() {
    const [cats, prods] = await Promise.all([
      SB.get('taq_categorias', 'activa=eq.true&order=orden'),
      SB.get('taq_productos', 'disponible=eq.true&order=orden')
    ]);
    this.menuData.categorias = cats;
    this.menuData.productos = prods;
  },

  route() {
    const hash = location.hash.slice(1) || 'pedidos';
    const [view, ...params] = hash.split('/');

    // Marcar nav activo
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.view === view);
    });

    const main = document.getElementById('main');
    this.currentView = view;

    switch (view) {
      case 'pedidos':  Pedidos.render(main); break;
      case 'nuevo':    NuevoPedido.render(main, params[0]); break;
      case 'cocina':   Cocina.render(main); break;
      case 'cobrar':   Cobrar.render(main, params[0]); break;
      case 'corte':    Corte.render(main); break;
      case 'menu':     MenuAdmin.render(main); break;
      default:         Pedidos.render(main);
    }
  },

  toast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (type || '');
    setTimeout(() => t.className = 'toast', 2500);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
