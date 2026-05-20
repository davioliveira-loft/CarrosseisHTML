/* ── Estado global ── */
const S = {
  id: null,          // carrossel atual (modo individual)
  files: [],         // imagens selecionadas para upload
  batch: { id: null },
  batchFiles: {},    // {cid: [File, ...]}
  templates: [],     // [{id, nome, descricao}]
  cardTemplate: {},  // {cid: 'template-id'}
  pexelsSelecoes: {}, // {cid: {slideNum: {url, thumb}}}
  pexelsConfigurado: false,
};

/* ── API ── */
async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

/* ── Views ── */
function showStep(name) {
  document.querySelectorAll('.step-view').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('step-' + name);
  if (el) el.classList.add('active');
}

function showSpinner(msg) {
  document.getElementById('spinner-msg').textContent = msg || 'Processando...';
  showStep('spinner');
}

function showErro(msg) {
  document.getElementById('erro-msg').textContent = msg;
  showStep('erro');
}

/* ── Init ── */
window.addEventListener('DOMContentLoaded', async () => {
  await loadBriefing();
  loadLogoStatus();
  await loadTemplatesList();
  await loadLotesAtivos();
  await loadPexelsConfig();
});

/* ── Templates ── */
async function loadTemplatesList() {
  S.templates = await api('GET', '/api/templates').catch(() => []);
}

async function setCardTemplate(cid, template) {
  S.cardTemplate[cid] = template;
  await api('POST', `/api/carrossel/${cid}/template`, { template }).catch(e => {
    alert('Erro ao trocar template: ' + e.message);
  });
}

function templateSelectHtml(cid) {
  const current = S.cardTemplate[cid] || 'alternado-claro-escuro';
  const opts = S.templates.map(t =>
    `<option value="${t.id}" ${t.id === current ? 'selected' : ''}>${esc(t.nome)}</option>`
  ).join('');
  return `<select class="template-select" onchange="setCardTemplate('${cid}', this.value)" title="Template visual">${opts}</select>`;
}

/* ── Briefing ── */
function toggleBriefing() {
  const form = document.getElementById('briefing-form');
  const btn = form.previousElementSibling;
  const collapsed = form.classList.toggle('collapsed');
  btn.textContent = (collapsed ? '▸' : '▾') + ' Briefing da Marca';
}

async function loadBriefing() {
  const b = await api('GET', '/api/briefing').catch(() => null);
  if (!b || !b.marca) return;
  document.getElementById('bf-marca').value  = b.marca;
  document.getElementById('bf-handle').value = b.handle;
  setColorField('bf-cor',          'bf-cor-picker',          b.cor_primaria);
  setColorField('bf-cor-destaque', 'bf-cor-destaque-picker', b.cor_destaque);
  setColorField('bf-cor-fundo',    'bf-cor-fundo-picker',    b.cor_fundo);
  setColorField('bf-cor-tinta',    'bf-cor-tinta-picker',    b.cor_tinta);
  if (b.estilo_visual) document.getElementById('bf-estilo').value = b.estilo_visual;
  if (b.max_imagens) document.getElementById('bf-max-imagens').value = String(b.max_imagens);
}

function setColorField(textId, pickerId, value) {
  const tx = document.getElementById(textId);
  const pk = document.getElementById(pickerId);
  if (!tx || !pk) return;
  if (value && /^#?[0-9a-fA-F]{6}$/.test(value)) {
    const v = value.startsWith('#') ? value.toUpperCase() : '#' + value.toUpperCase();
    tx.value = v;
    pk.value = v;
  } else {
    tx.value = '';
  }
}

async function saveBriefing(ev) {
  ev.preventDefault();
  const body = getBriefingForm();
  try {
    await api('POST', '/api/briefing', body);
    const msg = document.getElementById('briefing-saved');
    msg.style.display = 'inline';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
  } catch (e) { alert('Erro ao salvar: ' + e.message); }
}

function getBriefingForm() {
  const optional = id => {
    const v = (document.getElementById(id)?.value || '').trim();
    return v || null;
  };
  return {
    marca:        document.getElementById('bf-marca').value.trim(),
    handle:       document.getElementById('bf-handle').value.trim().replace(/^@/, ''),
    cor_primaria: document.getElementById('bf-cor').value.trim(),
    cor_destaque: optional('bf-cor-destaque'),
    cor_fundo:    optional('bf-cor-fundo'),
    cor_tinta:    optional('bf-cor-tinta'),
    estilo_visual: document.getElementById('bf-estilo').value,
    max_imagens:   parseInt(document.getElementById('bf-max-imagens').value, 10) || 6,
  };
}

function syncColorText(picker, textId) {
  document.getElementById(textId).value = picker.value.toUpperCase();
}
function syncColorPicker(input, pickerId) {
  const v = input.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) document.getElementById(pickerId).value = v;
}

const PALETA_PRESETS = {
  'italiano':           { primaria: '#008C45', destaque: '#FFE74C', fundo: '#FAF8F2', tinta: '#0E0E0E' },
  'brutalismo-amarelo': { primaria: '#E8421A', destaque: '#FFE74C', fundo: '#FAF8F2', tinta: '#0E0E0E' },
  'editorial-creme':    { primaria: '#8B5A2B', destaque: '#C9A063', fundo: '#F6EFE2', tinta: '#1A1612' },
};

function applyPaletaPreset(name) {
  if (name === 'limpar') {
    setColorField('bf-cor-destaque', 'bf-cor-destaque-picker', '');
    setColorField('bf-cor-fundo',    'bf-cor-fundo-picker',    '');
    setColorField('bf-cor-tinta',    'bf-cor-tinta-picker',    '');
    return;
  }
  const p = PALETA_PRESETS[name];
  if (!p) return;
  setColorField('bf-cor',          'bf-cor-picker',          p.primaria);
  setColorField('bf-cor-destaque', 'bf-cor-destaque-picker', p.destaque);
  setColorField('bf-cor-fundo',    'bf-cor-fundo-picker',    p.fundo);
  setColorField('bf-cor-tinta',    'bf-cor-tinta-picker',    p.tinta);
}

/* ── Logo da marca ── */
async function loadLogoStatus() {
  const handle = (document.getElementById('bf-handle')?.value || '').trim().replace(/^@/, '');
  const preview = document.getElementById('logo-preview');
  const btnRm   = document.getElementById('logo-remove');
  if (!handle) { preview.innerHTML = ''; btnRm.style.display = 'none'; return; }
  const info = await api('GET', `/api/logo/${encodeURIComponent(handle)}`).catch(() => ({ existe: false }));
  if (info.existe) {
    preview.innerHTML = `<img src="/api/logo/${encodeURIComponent(handle)}/preview?t=${Date.now()}" alt="">`;
    btnRm.style.display = 'inline-block';
  } else {
    preview.innerHTML = '<span class="logo-empty">sem logo</span>';
    btnRm.style.display = 'none';
  }
}

async function uploadLogo(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  ev.target.value = '';
  const handle = (document.getElementById('bf-handle')?.value || '').trim().replace(/^@/, '');
  if (!handle) { alert('Preencha o @ Instagram primeiro.'); return; }
  const fd = new FormData();
  fd.append('file', file);
  try {
    await api('POST', `/api/logo/${encodeURIComponent(handle)}`, fd);
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('logo-preview').innerHTML = `<img src="${e.target.result}" alt="">`;
      document.getElementById('logo-remove').style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
  } catch (e) { alert('Erro ao enviar logo: ' + e.message); }
}

async function removerLogo() {
  const handle = (document.getElementById('bf-handle')?.value || '').trim().replace(/^@/, '');
  if (!handle) return;
  if (!confirm('Remover o logo da marca?')) return;
  await api('DELETE', `/api/logo/${encodeURIComponent(handle)}`).catch(() => {});
  loadLogoStatus();
}

/* ── Importar JSON ── */
async function importarJSONFromFile(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  ev.target.value = '';
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch (e) {
    alert('Arquivo não é um JSON válido: ' + e.message);
    return;
  }
  await _doImport(payload);
}

function abrirModalColarJSON() {
  const modal = document.getElementById('modal-colar-json');
  const ta = document.getElementById('colar-json-area');
  const erro = document.getElementById('colar-json-erro');
  ta.value = '';
  erro.textContent = '';
  modal.style.display = 'flex';
  setTimeout(() => ta.focus(), 50);
}
function fecharModalColarJSON() {
  document.getElementById('modal-colar-json').style.display = 'none';
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const m = document.getElementById('modal-colar-json');
    if (m && m.style.display === 'flex') fecharModalColarJSON();
  }
});

async function importarJSONFromText() {
  const ta = document.getElementById('colar-json-area');
  const erro = document.getElementById('colar-json-erro');
  const raw = ta.value.trim();
  if (!raw) {
    erro.textContent = 'Cole um JSON antes de importar.';
    return;
  }
  let payload;
  try {
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```\s*$/, '').trim();
    payload = JSON.parse(clean);
  } catch (e) {
    erro.textContent = 'JSON inválido: ' + e.message;
    return;
  }
  fecharModalColarJSON();
  await _doImport(payload);
}

async function _doImport(payload) {
  try {
    showSpinner('Importando carrosséis...');
    const r = await api('POST', '/api/importar', payload);
    S.batch.id = r.batch_id;
    S.batchFiles = {};
    await loadBatchImagens(r.batch_id);
    loadLotesAtivos();
  } catch (e) {
    showErro('Erro ao importar: ' + e.message);
  }
}

/* ── Lotes ativos ── */
async function loadLotesAtivos() {
  const ativos = await api('GET', '/api/batch/ativos').catch(() => []);
  const el = document.getElementById('lotes-ativos');
  if (!el) return;
  if (!ativos.length) { el.innerHTML = ''; return; }
  el.innerHTML = ativos.map(b => {
    const total = b.total || b.ideias?.length || 0;
    const ideias = (b.ideias || []).slice(0, 3).map(esc).join(' • ');
    return `
      <div class="lote-ativo-card">
        <div class="lote-ativo-info">
          <strong>${total} carrossel${total !== 1 ? 'éis' : ''}</strong>
          <div class="lote-ativo-ideias">${ideias}</div>
        </div>
        <div class="lote-ativo-btns">
          <button class="btn-sm btn-primary" onclick="retomarLote('${b.id}')">↪ Retomar</button>
          <button class="btn-danger" title="Descartar lote" onclick="descartarLote('${b.id}')">✕</button>
        </div>
      </div>`;
  }).join('');
}

async function retomarLote(batchId) {
  S.batch.id = batchId;
  S.batchFiles = {};
  showSpinner('Carregando lote...');
  await loadBatchImagens(batchId);
}

async function descartarLote(batchId) {
  if (!confirm('Descartar este lote?')) return;
  await api('DELETE', `/api/batch/${batchId}`).catch(() => {});
  loadLotesAtivos();
}

/* ── Step: Imagens (individual) ── */
async function loadSugestao(id) {
  const data = await api('GET', `/api/carrossel/${id}/sugestao-imagens`);
  await renderSugestao(data);
}

async function renderSugestao(data) {
  const lista = document.getElementById('sugestao-lista');
  lista.innerHTML = (data.slides_com_imagem || []).map(s =>
    `<div class="sugestao-item">
      <span class="sugestao-num">Slide ${s.numero}</span>
      <span class="sugestao-tipo">${s.tipo_imagem}</span>
      <span class="sugestao-desc">${esc(s.descricao_sugestao)}</span>
      ${s.obrigatorio ? '<span class="sugestao-obrig">obrigatório</span>' : ''}
    </div>`
  ).join('');
  document.getElementById('img-preview-row').innerHTML = '';
  S.files = [];

  if (S.id) {
    const tplRow = document.getElementById('template-row-individual');
    if (tplRow) {
      const r = await api('GET', `/api/carrossel/${S.id}/template`).catch(() => null);
      if (r) S.cardTemplate[S.id] = r.template;
      tplRow.innerHTML = `
        <label class="template-label">Template visual:</label>
        ${templateSelectHtml(S.id)}
        <span class="template-hint">(altere antes de gerar o preview)</span>
      `;
    }
  }

  showStep('imagens');
}

function onDrop(ev) {
  ev.preventDefault();
  document.getElementById('upload-zone').classList.remove('dragover');
  const files = Array.from(ev.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  addFiles(files);
}

document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('upload-zone');
  if (zone) {
    zone.addEventListener('dragenter', () => zone.classList.add('dragover'));
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  }
});

function onFilesSelected(ev) { addFiles(Array.from(ev.target.files)); }

function addFiles(newFiles) {
  S.files.push(...newFiles);
  const row = document.getElementById('img-preview-row');
  newFiles.forEach(f => {
    const img = document.createElement('img');
    img.className = 'img-thumb';
    img.src = URL.createObjectURL(f);
    row.appendChild(img);
  });
}

async function uploadImagens(semImagem = false) {
  showSpinner('Renderizando carrossel...');
  try {
    const pexSel = !semImagem && S.pexelsSelecoes[S.id];
    const hasPexels = pexSel && Object.keys(pexSel).length > 0;
    let r;
    if (hasPexels) {
      showSpinner('Baixando fotos do Pexels...');
      const selecoes = Object.entries(pexSel).map(([slide, info]) => ({ slide: parseInt(slide), url: info.url }));
      r = await api('POST', `/api/carrossel/${S.id}/upload-pexels`, { selecoes });
    } else {
      const fd = new FormData();
      if (!semImagem) S.files.forEach(f => fd.append('files', f));
      r = await api('POST', `/api/carrossel/${S.id}/upload-imagens`, fd);
    }
    loadPreview(S.id, r.preview_url);
  } catch (e) { showErro(e.message); }
}

/* ── Step: Preview ── */
function loadPreview(id, url) {
  const previewUrl = url || `/api/carrossel/${id}/preview`;
  document.getElementById('preview-iframe').src = previewUrl;
  document.getElementById('preview-link').href = previewUrl;
  showStep('preview');
}

function voltarParaImagens() {
  showStep('imagens');
}

async function exportar() {
  showSpinner('Exportando PNGs com Playwright...');
  try {
    await api('POST', `/api/carrossel/${S.id}/exportar`);
    const timer = setInterval(async () => {
      const s = await api('GET', `/api/carrossel/${S.id}/status`).catch(() => null);
      if (!s) return;
      if (s.etapa === 'finalizado') {
        clearInterval(timer);
        await loadPNGs(S.id);
      } else if (s.etapa === 'erro') {
        clearInterval(timer);
        showErro(s.erro || 'Erro ao exportar');
      }
    }, 1500);
  } catch (e) { showErro(e.message); }
}

/* ── Step: PNGs ── */
async function loadPNGs(id) {
  const data = await api('GET', `/api/carrossel/${id}/pngs`);
  renderPNGs(id, data.pngs || []);
}

function renderPNGs(id, pngs) {
  document.getElementById('pngs-path').textContent =
    `${pngs.length} slide${pngs.length !== 1 ? 's' : ''} exportado${pngs.length !== 1 ? 's' : ''} → carrosseis/${id}/`;
  const grid = document.getElementById('pngs-grid');
  grid.innerHTML = pngs.map(name =>
    `<div class="png-card">
      <img src="/api/carrossel/${id}/arquivo/${name}" alt="${name}" loading="lazy">
      <div class="png-card-label">
        <span>${name}</span>
        <a href="/api/carrossel/${id}/arquivo/${name}" download="${name}">↓</a>
      </div>
    </div>`
  ).join('');
  showStep('pngs');
}

/* ── Batch: Imagens e exportação ── */
async function loadBatchImagens(batchId) {
  const data = await api('GET', `/api/batch/${batchId}/sugestao-imagens`);
  await Promise.all(data.map(async c => {
    const r = await api('GET', `/api/carrossel/${c.cid}/template`).catch(() => null);
    if (r) S.cardTemplate[c.cid] = r.template;
  }));
  renderBatchImagens(data);
}

function renderBatchImagens(carrosseis) {
  const container = document.getElementById('batch-img-container');
  container.innerHTML = carrosseis.map((c, i) => {
    const imgs = c.sugestao?.slides_com_imagem || [];
    const total = c.sugestao?.total_imagens_sugeridas ?? 0;

    const sugestaoHtml = imgs.length === 0
      ? `<p class="empty-msg batch-no-img">Nenhuma imagem necessária neste carrossel.</p>`
      : `<div class="batch-sugestao-lista">
           <div class="batch-sugestao-header">${total} imagem${total !== 1 ? 's' : ''} sugerida${total !== 1 ? 's' : ''} — envie nesta ordem:</div>
           ${imgs.map((s, idx) => `
             <div class="sugestao-item">
               <span class="sugestao-num">${idx + 1}º → Slide ${s.numero}</span>
               <span class="sugestao-tipo">${s.tipo_imagem}</span>
               <span class="sugestao-desc">${esc(s.descricao_sugestao)}</span>
               ${s.obrigatorio ? '<span class="sugestao-obrig">obrigatório</span>' : ''}
             </div>`).join('')}
         </div>`;

    return `
      <div class="batch-img-card" id="bimg-${c.cid}">
        <div class="batch-carrossel-header">
          <span class="batch-num-badge">${i + 1}</span>
          <span class="batch-carrossel-ideia">${esc(c.ideia)}</span>
          ${templateSelectHtml(c.cid)}
          <span class="batch-img-status" id="bstatus-${c.cid}">aguardando imagens</span>
        </div>
        ${sugestaoHtml}
        <div class="batch-upload-row">
          <input type="file" id="binput-${c.cid}" multiple accept="image/*" style="display:none"
                 onchange="addBatchFiles('${c.cid}', event)">
          <div class="upload-zone batch-upload-zone" id="bzone-${c.cid}"
               ondragover="event.preventDefault(); this.classList.add('dragover')"
               ondragleave="this.classList.remove('dragover')"
               ondrop="onBatchDrop('${c.cid}', event)"
               onclick="document.getElementById('binput-${c.cid}').click()">
            <div class="upload-inner">
              <div class="upload-icon">↑</div>
              <p>Arraste ou clique para selecionar imagens</p>
            </div>
          </div>
          <div id="bpreview-${c.cid}" class="img-preview-row"></div>
        </div>
        <div class="pexels-bar" style="margin: 8px 0 0;">
          <button class="btn-pexels" onclick="buscarPexelsLote('${c.cid}')">📷 Buscar no Pexels</button>
          <span id="pexels-sel-${c.cid}" class="pexels-sel-count"></span>
        </div>
        <div id="pexels-gallery-${c.cid}" class="pexels-gallery" style="display:none"></div>
        <div class="batch-card-actions">
          <button class="batch-btn-slides btn-secondary" onclick="toggleBatchSlides('${c.cid}', this)">Ver slides</button>
          <button class="btn-primary" onclick="uploadImagensLote('${c.cid}')">Gerar preview</button>
          <button class="btn-secondary" onclick="uploadImagensLote('${c.cid}', true)">Sem imagens</button>
          <a id="blink-${c.cid}" class="btn-secondary" href="#" target="_blank" style="display:none">Ver preview ↗</a>
          <button id="bexport-${c.cid}" class="btn-primary" onclick="exportarLote('${c.cid}')" style="display:none">⬇ Exportar PNGs</button>
        </div>
        <div id="bslides-${c.cid}" class="batch-slides-section" style="display:none"></div>
      </div>`;
  }).join('');
  showStep('batch-imagens');
}

function onBatchDrop(cid, ev) {
  ev.preventDefault();
  document.getElementById('bzone-' + cid)?.classList.remove('dragover');
  const files = Array.from(ev.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  addBatchFiles(cid, null, files);
}

function addBatchFiles(cid, ev, directFiles) {
  if (!S.batchFiles[cid]) S.batchFiles[cid] = [];
  const files = directFiles || Array.from(ev.target.files);
  S.batchFiles[cid].push(...files);
  renderBatchThumbs(cid);
}

/* ── Thumb drag-to-reorder + remove ── */

const _fileUrlCache = new WeakMap();
function _fileUrl(f) {
  if (!_fileUrlCache.has(f)) _fileUrlCache.set(f, URL.createObjectURL(f));
  return _fileUrlCache.get(f);
}

let _drag = null; // {cid, idx}

function renderBatchThumbs(cid) {
  const row = document.getElementById('bpreview-' + cid);
  if (!row) return;
  const files = S.batchFiles[cid] || [];
  row.innerHTML = files.map((f, idx) => `
    <div class="img-thumb-card" draggable="true"
         ondragstart="onThumbDragStart('${cid}',${idx})"
         ondragover="onThumbDragOver(event,this)"
         ondrop="onThumbDrop(event,'${cid}',${idx})"
         ondragend="onThumbDragEnd()">
      <img src="${_fileUrl(f)}" alt="">
      <span class="img-thumb-num">${idx + 1}</span>
      <button class="img-thumb-remove" onclick="removeBatchFile('${cid}',${idx})" title="Remover">×</button>
    </div>`).join('');
}

function onThumbDragStart(cid, idx) {
  _drag = { cid, idx };
}

function onThumbDragOver(ev, el) {
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.img-thumb-card.drag-over').forEach(c => c.classList.remove('drag-over'));
  if (!_drag || _drag.idx === +el.querySelector('.img-thumb-num').textContent - 1) return;
  el.classList.add('drag-over');
}

function onThumbDrop(ev, cid, toIdx) {
  ev.preventDefault();
  ev.stopPropagation(); // impede que o drop zone do carrossel também receba
  document.querySelectorAll('.img-thumb-card.drag-over').forEach(c => c.classList.remove('drag-over'));
  if (!_drag || _drag.cid !== cid || _drag.idx === toIdx) return;
  const files = S.batchFiles[cid];
  const [moved] = files.splice(_drag.idx, 1);
  files.splice(toIdx, 0, moved);
  renderBatchThumbs(cid);
}

function onThumbDragEnd() {
  document.querySelectorAll('.img-thumb-card.drag-over').forEach(c => c.classList.remove('drag-over'));
  _drag = null;
}

function removeBatchFile(cid, idx) {
  S.batchFiles[cid].splice(idx, 1);
  renderBatchThumbs(cid);
}

async function uploadImagensLote(cid, semImagem = false) {
  const statusEl = document.getElementById('bstatus-' + cid);
  if (statusEl) statusEl.textContent = 'gerando preview...';
  try {
    const pexSel = !semImagem && S.pexelsSelecoes[cid];
    const hasPexels = pexSel && Object.keys(pexSel).length > 0;
    let r;
    if (hasPexels) {
      if (statusEl) statusEl.textContent = 'baixando fotos do Pexels...';
      const selecoes = Object.entries(pexSel).map(([slide, info]) => ({ slide: parseInt(slide), url: info.url }));
      r = await api('POST', `/api/carrossel/${cid}/upload-pexels`, { selecoes });
    } else {
      const fd = new FormData();
      if (!semImagem) (S.batchFiles[cid] || []).forEach(f => fd.append('files', f));
      r = await api('POST', `/api/carrossel/${cid}/upload-imagens`, fd);
    }
    if (statusEl) statusEl.textContent = 'preview pronto';
    const link   = document.getElementById('blink-' + cid);
    const btnExp = document.getElementById('bexport-' + cid);
    if (link)   { link.href = r.preview_url; link.style.display = 'inline-block'; }
    if (btnExp) btnExp.style.display = 'inline-block';
  } catch (e) {
    if (statusEl) statusEl.textContent = 'erro';
    alert('Erro ao gerar preview de ' + cid + ': ' + e.message);
  }
}

async function exportarLote(cid) {
  const statusEl = document.getElementById('bstatus-' + cid);
  const btnExp   = document.getElementById('bexport-' + cid);
  if (statusEl) statusEl.textContent = 'exportando...';
  if (btnExp)   btnExp.disabled = true;
  try {
    await api('POST', `/api/carrossel/${cid}/exportar`);
    const timer = setInterval(async () => {
      const s = await api('GET', `/api/carrossel/${cid}/status`).catch(() => null);
      if (!s) return;
      if (s.etapa === 'finalizado') {
        clearInterval(timer);
        const pngs = await api('GET', `/api/carrossel/${cid}/pngs`).catch(() => ({ total: 0 }));
        if (statusEl) { statusEl.textContent = `✓ ${pngs.total} PNGs`; statusEl.classList.add('status-ok'); }
      } else if (s.etapa === 'erro') {
        clearInterval(timer);
        if (statusEl) statusEl.textContent = 'erro ao exportar';
        if (btnExp)   { btnExp.disabled = false; btnExp.textContent = '↺ Tentar novamente'; }
      }
    }, 2000);
  } catch (e) {
    if (statusEl) statusEl.textContent = 'erro';
    if (btnExp)   btnExp.disabled = false;
    alert(e.message);
  }
}

async function toggleBatchSlides(cid, btn) {
  const section = document.getElementById('bslides-' + cid);
  if (section.style.display === 'block') {
    section.style.display = 'none';
    btn.textContent = 'Ver slides';
    return;
  }
  if (!section.dataset.loaded) {
    const prev = btn.textContent;
    btn.textContent = 'Carregando...';
    btn.disabled = true;
    const data = await api('GET', `/api/carrossel/${cid}/slides`).catch(() => null);
    btn.disabled = false;
    if (!data?.slides?.length) {
      btn.textContent = prev;
      alert('Slides não encontrados.');
      return;
    }
    section.innerHTML = data.slides.map(s => `
      <div class="slide-card" data-num="${s.numero}" data-tipo="${s.tipo || 'dark'}">
        <div class="slide-card-header">
          <span class="slide-num">Slide ${s.numero}</span>
          <span class="slide-tipo-badge tipo-${s.tipo || 'dark'}">${(s.tipo || 'dark').toUpperCase()}</span>
          ${s.tag ? `<span class="slide-tag">${esc(s.tag)}</span>` : ''}
        </div>
        ${buildSlideReadonly(s)}
      </div>`).join('');
    section.dataset.loaded = '1';
  }
  section.style.display = 'block';
  btn.textContent = 'Ocultar slides';
}

function buildSlideReadonly(s) {
  const rows = [];
  if (s.tipo === 'capa') {
    rows.push(readonlyField('Headline', s.headline_capa));
  } else if (s.tipo === 'cta') {
    rows.push(readonlyField('Frase-ponte', s.frase_ponte));
    rows.push(readonlyField('CTA', s.cta_headline));
    rows.push(readonlyField('Palavra-chave', s.cta_keyword));
    rows.push(readonlyField('Benefício', s.cta_beneficio));
  } else {
    if (s.headline_interna) rows.push(readonlyField('Headline', s.headline_interna));
    if (s.bloco1) rows.push(readonlyField('Bloco 1', s.bloco1));
    if (s.bloco2) rows.push(readonlyField('Bloco 2', s.bloco2));
  }
  return rows.join('');
}

function readonlyField(label, value) {
  return `<div class="slide-field">
    <label>${label}</label>
    <div class="editable-readonly">${value || ''}</div>
  </div>`;
}

/* ── Pexels: configuração ── */
function togglePexelsConfig() {
  const form = document.getElementById('pexels-config-form');
  const btn = form.previousElementSibling;
  const collapsed = form.classList.toggle('collapsed');
  btn.textContent = (collapsed ? '▸' : '▾') + ' Pexels API';
}

async function loadPexelsConfig() {
  const cfg = await api('GET', '/api/config/pexels').catch(() => null);
  S.pexelsConfigurado = cfg?.configurado || false;
  const status = document.getElementById('pexels-key-status');
  if (status && S.pexelsConfigurado) status.textContent = '✓ Chave configurada';
}

async function savePexelsKey() {
  const key = document.getElementById('pexels-key-input').value.trim();
  if (!key) { alert('Cole a API key antes de salvar.'); return; }
  try {
    await api('POST', '/api/config/pexels', { key });
    document.getElementById('pexels-key-input').value = '';
    const status = document.getElementById('pexels-key-status');
    if (status) status.textContent = '✓ Salvo';
    S.pexelsConfigurado = true;
  } catch (e) { alert('Erro ao salvar: ' + e.message); }
}

/* ── Pexels: busca e galeria ── */
async function buscarPexelsIndividual() {
  if (!S.id) return;
  if (!S.pexelsConfigurado) {
    alert('Configure a API key do Pexels primeiro (seção "Pexels API" na sidebar).');
    return;
  }
  const gallery = document.getElementById('pexels-individual-gallery');
  gallery.style.display = 'block';
  await buscarPexelsParaCid(S.id, gallery, 'pexels-individual-sel');
}

async function buscarPexelsLote(cid) {
  if (!S.pexelsConfigurado) {
    alert('Configure a API key do Pexels primeiro (seção "Pexels API" na sidebar).');
    return;
  }
  const gallery = document.getElementById('pexels-gallery-' + cid);
  if (!gallery) return;
  gallery.style.display = 'block';
  await buscarPexelsParaCid(cid, gallery, 'pexels-sel-' + cid);
}

async function buscarPexelsParaCid(cid, galleryEl, selCountId) {
  galleryEl.innerHTML = '<div class="pexels-loading">Buscando no Pexels...</div>';
  try {
    const queries = await api('GET', `/api/carrossel/${cid}/pexels-queries`);
    if (!queries.length) {
      galleryEl.innerHTML = '<p class="pexels-vazio">Nenhum slide com imagem sugerida.</p>';
      return;
    }
    const results = await api('POST', '/api/pexels/buscar', { queries });
    renderPexelsGallery(cid, results, galleryEl, selCountId);
  } catch (e) {
    galleryEl.innerHTML = `<p class="pexels-erro">Erro: ${esc(e.message)}</p>`;
  }
}

function renderPexelsGallery(cid, results, galleryEl, selCountId) {
  if (!S.pexelsSelecoes[cid]) S.pexelsSelecoes[cid] = {};
  galleryEl.innerHTML = results.map(r => `
    <div class="pexels-slide-block">
      <div class="pexels-slide-header">
        <span class="sugestao-num">Slide ${r.slide}</span>
        <span class="pexels-query">"${esc(r.q)}"</span>
      </div>
      ${r.erro
        ? `<p class="pexels-erro">Erro: ${esc(r.erro)}</p>`
        : r.fotos.length === 0
          ? '<p class="pexels-vazio">Nenhuma foto encontrada.</p>'
          : `<div class="pexels-grid">
              ${r.fotos.map(f => `
                <div class="pexels-thumb"
                     data-cid="${cid}"
                     data-slide="${r.slide}"
                     data-url="${f.src}"
                     data-thumb="${f.thumb}"
                     data-selid="${selCountId}"
                     onclick="togglePexelsPhoto(this)">
                  <img src="${f.thumb}" loading="lazy" alt="">
                  <span class="pexels-autor">${esc(f.autor)}</span>
                </div>`).join('')}
            </div>`}
    </div>`).join('');
}

function togglePexelsPhoto(el) {
  const cid = el.dataset.cid;
  const slide = parseInt(el.dataset.slide);
  const url = el.dataset.url;
  const thumb = el.dataset.thumb;
  const selCountId = el.dataset.selid;

  if (!S.pexelsSelecoes[cid]) S.pexelsSelecoes[cid] = {};

  const block = el.closest('.pexels-slide-block');
  block.querySelectorAll('.pexels-thumb').forEach(t => t.classList.remove('selected'));

  if (S.pexelsSelecoes[cid][slide]?.url === url) {
    delete S.pexelsSelecoes[cid][slide];
  } else {
    el.classList.add('selected');
    S.pexelsSelecoes[cid][slide] = { url, thumb };
  }

  const total = Object.keys(S.pexelsSelecoes[cid] || {}).length;
  const countEl = document.getElementById(selCountId);
  if (countEl) countEl.textContent = total > 0 ? `${total} foto${total !== 1 ? 's' : ''} selecionada${total !== 1 ? 's' : ''}` : '';
}

/* ── Utilitários ── */
function voltarInicio() {
  S.id = null;
  S.files = [];
  showStep('empty');
  loadLotesAtivos();
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
