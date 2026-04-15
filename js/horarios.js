// Horarios — Tablero de turnos semanales
const Horarios = (() => {
  // lunes de la semana que se muestra (Date)
  let semanaBase = null;

  // ── helpers de fecha ────────────────────────────────────────────────────────
  function lunesDe(date) {
    const d = new Date(date);
    const dow = d.getDay(); // 0=dom
    const diff = (dow === 0 ? -6 : 1 - dow);
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function isoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function hoy() {
    return isoDate(new Date());
  }

  function formatHM(timeStr) {
    // "08:00:00" → "08:00"
    return timeStr ? timeStr.slice(0, 5) : '';
  }

  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  // ── render principal ─────────────────────────────────────────────────────────
  async function render(container) {
    if (!semanaBase) semanaBase = lunesDe(new Date());

    container.innerHTML = `
      <div class="view-header">
        <h2>📅 Horarios</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm" id="h-prev">◀</button>
          <span id="h-rango" style="font-size:14px;white-space:nowrap"></span>
          <button class="btn btn-sm" id="h-next">▶</button>
          <button class="btn btn-sm" id="h-hoy">Hoy</button>
        </div>
      </div>
      <div id="h-body" style="overflow-x:auto;padding:0 12px 80px"></div>
      <div id="h-modal" style="display:none"></div>`;

    container.querySelector('#h-prev').onclick = () => {
      semanaBase = addDays(semanaBase, -7);
      render(container);
    };
    container.querySelector('#h-next').onclick = () => {
      semanaBase = addDays(semanaBase, 7);
      render(container);
    };
    container.querySelector('#h-hoy').onclick = () => {
      semanaBase = lunesDe(new Date());
      render(container);
    };

    const domingo = addDays(semanaBase, 6);
    const fmtShort = d => `${d.getDate()}/${d.getMonth() + 1}`;
    container.querySelector('#h-rango').textContent =
      `${fmtShort(semanaBase)} – ${fmtShort(domingo)}`;

    await cargarYPintar(container);
  }

  async function cargarYPintar(container) {
    const body = container.querySelector('#h-body');
    body.innerHTML = '<p style="padding:20px;color:#888">Cargando…</p>';

    const inicioSemana = isoDate(semanaBase);
    const finSemana = isoDate(addDays(semanaBase, 6));
    const todayStr = hoy();

    // Cargar empleados activos
    const usuarios = await SB.get('taq_usuarios',
      SB.nq(`select=id,nombre,rol&activo=eq.true&order=nombre.asc&limit=200`));
    if (!usuarios) { body.innerHTML = '<p style="padding:20px;color:#e94560">Error cargando empleados</p>'; return; }

    // Cargar horarios de la semana
    const horarios = await SB.get('taq_horarios',
      SB.nq(`select=id,usuario_id,fecha,hora_inicio,hora_fin,notas&fecha=gte.${inicioSemana}&fecha=lte.${finSemana}&limit=1000`));
    if (!horarios) { body.innerHTML = '<p style="padding:20px;color:#e94560">Error cargando horarios</p>'; return; }

    // índice: usuario_id → fecha → horario
    const idx = {};
    for (const h of horarios) {
      if (!idx[h.usuario_id]) idx[h.usuario_id] = {};
      idx[h.usuario_id][h.fecha] = h;
    }

    if (usuarios.length === 0) {
      body.innerHTML = '<p style="padding:20px;color:#888">No hay empleados registrados.</p>';
      return;
    }

    // Columnas de días
    const dias = Array.from({ length: 7 }, (_, i) => addDays(semanaBase, i));

    let html = `<table class="h-table">
      <thead><tr>
        <th style="min-width:110px;text-align:left;padding:8px">Empleado</th>`;
    for (let i = 0; i < 7; i++) {
      const d = dias[i];
      const isHoy = isoDate(d) === todayStr;
      html += `<th style="min-width:90px;text-align:center;${isHoy ? 'background:#e9456020;color:#e94560;' : ''}padding:8px">
        ${DIAS[i]}<br><span style="font-size:11px;font-weight:normal">${d.getDate()}/${d.getMonth() + 1}</span>
      </th>`;
    }
      <th style="min-width:60px;text-align:center;padding:8px;border-left:2px solid #333">Total</th>
    </tr></thead><tbody>

    // Helper: diferencia de horas entre dos strings "HH:MM:SS"
    function horasEntre(hi, hf) {
      if (!hi || !hf) return 0;
      const [hhi, mmi] = hi.split(':').map(Number);
      const [hhf, mmf] = hf.split(':').map(Number);
      return Math.max(0, (hhf * 60 + mmf - hhi * 60 - mmi) / 60);
    }

    for (const u of usuarios) {
      let horasTotal = 0;
      let diasTrabaja = 0;
      html += `<tr>
        <td style="padding:8px;font-weight:500;white-space:nowrap">${u.nombre}</td>`;
      for (let i = 0; i < 7; i++) {
        const d = dias[i];
        const fecha = isoDate(d);
        const isHoy = fecha === todayStr;
        const h = idx[u.id]?.[fecha];
        const cellStyle = isHoy ? 'background:#e9456010;' : '';
        if (h) {
          const hrs = horasEntre(h.hora_inicio, h.hora_fin);
          horasTotal += hrs;
          diasTrabaja++;
          html += `<td style="${cellStyle}padding:6px;text-align:center">
            <button class="h-cell filled" data-uid="${u.id}" data-nombre="${u.nombre}" data-fecha="${fecha}"
              data-hid="${h.id}" data-hi="${h.hora_inicio}" data-hf="${h.hora_fin}" data-notas="${h.notas || ''}">
              ${formatHM(h.hora_inicio)}<br><span style="font-size:10px">—</span><br>${formatHM(h.hora_fin)}
            </button></td>`;
        } else {
          html += `<td style="${cellStyle}padding:6px;text-align:center">
            <button class="h-cell empty" data-uid="${u.id}" data-nombre="${u.nombre}" data-fecha="${fecha}">—</button>
          </td>`;
        }
      }
      const resumen = diasTrabaja > 0
        ? `<span style="font-size:11px;color:#e94560;font-weight:600">${horasTotal.toFixed(1)}h</span><br><span style="font-size:10px;color:#888">${diasTrabaja}d</span>`
        : `<span style="font-size:11px;color:#555">—</span>`;
      html += `<td style="padding:6px;text-align:center;border-left:2px solid #333">${resumen}</td>`;
      html += '</tr>';
    }
    // Fila de totales por día
    html += `<tfoot><tr style="background:#111;font-size:11px">
      <td style="padding:6px 8px;color:#888">Turnos/día</td>`;
    for (let i = 0; i < 7; i++) {
      const fecha = isoDate(dias[i]);
      const turnosDia = usuarios.filter(u => idx[u.id]?.[fecha]).length;
      const isHoy = fecha === todayStr;
      html += `<td style="text-align:center;padding:4px;${isHoy ? 'background:#e9456010;' : ''}color:${turnosDia > 0 ? '#e94560' : '#555'}">
        ${turnosDia > 0 ? turnosDia : '—'}
      </td>`;
    }
    html += `<td style="border-left:2px solid #333"></td></tr></tfoot>`;
    html += '</tbody></table>';

    body.innerHTML = html;

    // Estilos inline para la tabla
    const style = document.createElement('style');
    style.textContent = `
      .h-table { border-collapse: collapse; width: 100%; min-width: 600px; }
      .h-table th, .h-table td { border: 1px solid #2a2a2a; }
      .h-table tbody tr:hover { background: #1a1a1a; }
      .h-cell { background: none; border: none; cursor: pointer; width: 100%; padding: 4px; border-radius: 4px; font-size: 12px; line-height: 1.4; }
      .h-cell.filled { background: #e9456025; color: #e94560; font-weight: 600; }
      .h-cell.empty { color: #555; }
      .h-cell:hover { background: #e9456040 !important; color: #e94560; }
    `;
    body.prepend(style);

    // Delegación de clicks
    body.addEventListener('click', e => {
      const btn = e.target.closest('.h-cell');
      if (!btn) return;
      abrirModal(container, {
        uid: btn.dataset.uid,
        nombre: btn.dataset.nombre,
        fecha: btn.dataset.fecha,
        hid: btn.dataset.hid || null,
        hi: btn.dataset.hi || '',
        hf: btn.dataset.hf || '',
        notas: btn.dataset.notas || ''
      });
    });
  }

  // ── modal edición ────────────────────────────────────────────────────────────
  function abrirModal(container, { uid, nombre, fecha, hid, hi, hf, notas }) {
    const modal = container.querySelector('#h-modal');
    const [anio, mes, dia] = fecha.split('-');
    const fechaDisplay = `${dia}/${mes}/${anio}`;

    modal.innerHTML = `
      <div class="modal-overlay" id="h-overlay">
        <div class="modal-box" style="max-width:340px">
          <h3 style="margin:0 0 4px">📅 Horario</h3>
          <p style="margin:0 0 16px;color:#888;font-size:14px">${nombre} · ${fechaDisplay}</p>
          <label style="display:block;margin-bottom:8px">
            <span style="font-size:12px;color:#888">Entrada</span>
            <input type="time" id="h-entrada" value="${formatHM(hi)}" style="display:block;width:100%;margin-top:4px">
          </label>
          <label style="display:block;margin-bottom:8px">
            <span style="font-size:12px;color:#888">Salida</span>
            <input type="time" id="h-salida" value="${formatHM(hf)}" style="display:block;width:100%;margin-top:4px">
          </label>
          <label style="display:block;margin-bottom:16px">
            <span style="font-size:12px;color:#888">Notas (opcional)</span>
            <input type="text" id="h-notas" value="${notas}" placeholder="ej. Cubrir turno tarde" style="display:block;width:100%;margin-top:4px">
          </label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" id="h-guardar" style="flex:1">Guardar</button>
            ${hid ? `<button class="btn btn-danger" id="h-libre">Libre</button>` : ''}
            <button class="btn" id="h-cancelar">Cancelar</button>
          </div>
        </div>
      </div>`;
    modal.style.display = 'block';

    const cerrar = () => { modal.style.display = 'none'; modal.innerHTML = ''; };
    modal.querySelector('#h-overlay').onclick = e => { if (e.target === modal.querySelector('#h-overlay')) cerrar(); };
    modal.querySelector('#h-cancelar').onclick = cerrar;

    modal.querySelector('#h-guardar').onclick = async () => {
      const entrada = modal.querySelector('#h-entrada').value;
      const salida = modal.querySelector('#h-salida').value;
      const notasVal = modal.querySelector('#h-notas').value.trim();
      if (!entrada || !salida) { App.toast('Ingresa hora de entrada y salida'); return; }
      if (salida <= entrada) { App.toast('La salida debe ser después de la entrada'); return; }

      const btn = modal.querySelector('#h-guardar');
      btn.disabled = true; btn.textContent = 'Guardando…';

      const payload = {
        negocio_id: SB.negocioId,
        usuario_id: uid,
        fecha,
        hora_inicio: entrada,
        hora_fin: salida,
        notas: notasVal || null
      };

      try {
        if (hid) {
          await SB.update('taq_horarios', `id=eq.${hid}`, payload);
        } else {
          await SB.insert('taq_horarios', payload);
        }
      } catch (err) {
        App.toast('Error al guardar', 3000);
        btn.disabled = false; btn.textContent = 'Guardar';
        return;
      }
      App.toast('Horario guardado');
      cerrar();
      await cargarYPintar(container);
    };

    if (hid) {
      modal.querySelector('#h-libre').onclick = async () => {
        if (!confirm(`¿Marcar como libre a ${nombre} el ${fechaDisplay}?`)) return;
        const ok = await SB.delete('taq_horarios', `id=eq.${hid}`);
        App.toast('Día marcado como libre');
        cerrar();
        await cargarYPintar(container);
      };
    }
  }

  return { render };
})();
