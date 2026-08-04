const TOKEN_KEY = 'nhPortalToken';
const ROLE_KEY = 'nhPortalRole';
const CONSULTANT_KEY = 'nhSelectedConsultant';
const $ = id => document.getElementById(id);

let token = localStorage.getItem(TOKEN_KEY);
let consultants = [];
let quotes = [];
let inspections = [];
let prices = [];
let plans = [];
let coverages = [];
let auditEntries = [];

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[c]));

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(CONSULTANT_KEY);
  token = null;
}

function showLogin(message = '') {
  clearSession();
  $('admin-login').hidden = false;
  $('admin-view').hidden = true;
  $('logout').hidden = true;
  const box = $('admin-login-message');
  box.className = message ? 'message error' : '';
  box.textContent = message;
}

function showAdmin() {
  $('admin-login').hidden = true;
  $('admin-view').hidden = false;
  $('logout').hidden = false;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401 || response.status === 403) {
    showLogin('Sua sessão administrativa expirou. Entre novamente.');
    throw new Error('Sessão administrativa inválida.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || 'Não foi possível concluir a operação.');
  }
  return response.status === 204 ? null : response.json();
}

function message(text, type = 'error') {
  const element = $('message');
  element.className = `message ${type}`;
  element.textContent = text;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearMessage() {
  $('message').className = '';
  $('message').textContent = '';
}

function statusBadge(text, kind = '') {
  return `<span class="badge ${kind}">${esc(text)}</span>`;
}

function coverageStatusLabel(status) {
  if (status === 'INCLUDED') return statusBadge('Incluído', 'ok');
  if (status === 'OPTIONAL') return statusBadge('Opcional', 'warn');
  return statusBadge('Não incluído', 'off');
}

function quoteLabel(quote) {
  if (quote.expired) return statusBadge('Expirada', 'off');
  if (quote.status === 'ACCEPTED') return statusBadge('Aceita', 'ok');
  if (quote.status === 'DECLINED') return statusBadge('Recusada', 'off');
  return statusBadge('Pendente', 'warn');
}

function parseMoney(value, required = true) {
  const text = String(value ?? '').trim();
  if (!text) {
    if (required) throw new Error('Informe um valor válido.');
    return null;
  }
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) throw new Error('Informe um valor válido.');
  return number;
}

async function load() {
  clearMessage();
  try {
    const result = await Promise.all([
      api('/api/admin/consultants'),
      api('/api/admin/quotes'),
      api('/api/admin/inspections'),
      api('/api/admin/catalog/prices'),
      api('/api/admin/catalog/plans'),
      api('/api/admin/catalog/coverages'),
      api('/api/admin/catalog/audit')
    ]);
    [consultants, quotes, inspections, prices, plans, coverages, auditEntries] = result;
    renderAll();
  } catch (error) {
    if ($('admin-view').hidden) return;
    message(error.message);
  }
}

function renderAll() {
  renderOverview();
  renderActivities();
  renderConsultants();
  renderQuotes();
  renderInspections();
  renderPlans();
  renderPrices();
  populateCoverageFilters();
  renderCoverages();
  renderAudit();
}

function renderOverview() {
  $('kpi-consultants').textContent = consultants.filter(item => item.active).length;
  $('kpi-quotes').textContent = quotes.length;
  $('kpi-inspections').textContent = inspections.length;
  $('kpi-accepted').textContent = quotes.filter(item => item.status === 'ACCEPTED').length;
}

function activities() {
  const quoteActivities = quotes.map(item => ({
    date: item.createdAt,
    consultant: item.consultantName,
    type: 'Cotação',
    person: item.customerName,
    plate: item.plate,
    status: item.expired ? 'Expirada' : item.status === 'ACCEPTED' ? 'Aceita' : item.status === 'DECLINED' ? 'Recusada' : 'Pendente',
    statusKind: item.expired || item.status === 'DECLINED' ? 'off' : item.status === 'ACCEPTED' ? 'ok' : 'warn',
    url: `/api/quotes/${item.id}/pdf`,
    linkLabel: 'PDF'
  }));
  const inspectionActivities = inspections.map(item => ({
    date: item.createdAt,
    consultant: item.consultantName,
    type: item.requestType === 'NEW_INSPECTION' ? 'Nova vistoria' : 'Atualização de boleto',
    person: item.associateName,
    plate: item.plate,
    status: item.status === 'COMPLETED' ? 'Concluída' : 'Pendente',
    statusKind: item.status === 'COMPLETED' ? 'ok' : 'warn',
    url: item.driveFolderUrl || item.publicUrl,
    linkLabel: item.driveFolderUrl ? 'Drive' : 'Abrir'
  }));
  return [...quoteActivities, ...inspectionActivities]
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderActivities() {
  const filter = $('activity-filter').value.trim().toLowerCase();
  $('activities-body').innerHTML = activities()
    .filter(item => `${item.consultant} ${item.person} ${item.plate} ${item.type}`.toLowerCase().includes(filter))
    .map(item => `<tr>
      <td>${date(item.date)}</td>
      <td><strong>${esc(item.consultant)}</strong></td>
      <td>${esc(item.type)}</td>
      <td>${esc(item.person)}</td>
      <td>${esc(item.plate)}</td>
      <td>${statusBadge(item.status, item.statusKind)}</td>
      <td><a class="button outline" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.linkLabel)}</a></td>
    </tr>`).join('') || emptyRow(7, 'Nenhuma atividade encontrada.');
}

function renderConsultants() {
  $('consultants-body').innerHTML = consultants.map(item => `<tr>
    <td><input data-consultant-name="${item.id}" value="${esc(item.name)}" maxlength="140"></td>
    <td>${esc(item.source)}</td>
    <td>${item.quoteCount}</td>
    <td>${item.inspectionCount}</td>
    <td>${statusBadge(item.active ? 'Ativo' : 'Inativo', item.active ? 'ok' : 'off')}</td>
    <td><div class="row-actions">
      <button class="secondary small-button" data-consultant-save="${item.id}" type="button">Salvar nome</button>
      <button class="outline small-button" data-consultant-toggle="${item.id}" data-active="${!item.active}" type="button">${item.active ? 'Desativar' : 'Ativar'}</button>
      <button class="danger small-button" data-consultant-delete="${item.id}" data-name="${esc(item.name)}" type="button">Excluir</button>
    </div></td>
  </tr>`).join('') || emptyRow(6, 'Nenhum consultor cadastrado.');

  document.querySelectorAll('[data-consultant-save]').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.consultantSave;
      const name = document.querySelector(`[data-consultant-name="${id}"]`).value.trim();
      try {
        await api(`/api/admin/consultants/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        message('Nome do consultor atualizado.', 'success');
        await load();
      } catch (error) { message(error.message); }
    });
  });

  document.querySelectorAll('[data-consultant-toggle]').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        await api(`/api/admin/consultants/${button.dataset.consultantToggle}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: button.dataset.active === 'true' })
        });
        message('Status do consultor atualizado.', 'success');
        await load();
      } catch (error) { message(error.message); }
    });
  });

  document.querySelectorAll('[data-consultant-delete]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!confirm(`Excluir ${button.dataset.name}? A exclusão só é permitida quando não há atividades vinculadas.`)) return;
      try {
        await api(`/api/admin/consultants/${button.dataset.consultantDelete}`, { method: 'DELETE' });
        message('Consultor excluído.', 'success');
        await load();
      } catch (error) { message(error.message); }
    });
  });
}

function renderQuotes() {
  const filter = $('quote-filter').value.toLowerCase();
  $('quotes-body').innerHTML = quotes
    .filter(item => `${item.consultantName} ${item.customerName} ${item.plate} ${item.quoteNumber}`.toLowerCase().includes(filter))
    .map(item => `<tr>
      <td>${esc(item.quoteNumber)}</td><td>${esc(item.consultantName)}</td><td>${esc(item.customerName)}</td>
      <td>${esc(item.plate)}</td><td>${item.zeroKm ? 'Sim' : 'Não'}</td><td>${esc(item.selectedPlanName)}</td>
      <td>${brl.format(item.monthlyValue)}</td><td>${date(item.validUntil)}</td><td>${quoteLabel(item)}</td>
      <td><a class="button outline" href="/api/quotes/${item.id}/pdf" target="_blank">PDF</a></td>
    </tr>`).join('') || emptyRow(10, 'Nenhuma cotação encontrada.');
}

function renderInspections() {
  const filter = $('inspection-filter').value.toLowerCase();
  $('inspections-body').innerHTML = inspections
    .filter(item => `${item.consultantName} ${item.associateName} ${item.plate}`.toLowerCase().includes(filter))
    .map(item => `<tr>
      <td>${esc(item.associateName)}</td><td>${esc(item.consultantName)}</td><td>${esc(item.plate)}</td>
      <td>${item.requestType === 'NEW_INSPECTION' ? 'Nova vistoria' : 'Atualização de boleto'}</td>
      <td>${statusBadge(item.status === 'COMPLETED' ? 'Concluída' : 'Pendente', item.status === 'COMPLETED' ? 'ok' : 'warn')}</td>
      <td>${date(item.createdAt)}</td><td><div class="row-actions">
        ${item.driveFolderUrl ? `<a class="button outline" href="${esc(item.driveFolderUrl)}" target="_blank" rel="noopener">Drive</a>` : `<a class="button outline" href="${esc(item.publicUrl)}" target="_blank" rel="noopener">Link</a>`}
        ${item.reportUrl ? `<a class="button outline" href="${esc(item.reportUrl)}" target="_blank" rel="noopener">Relatório</a>` : ''}
        ${item.teamWhatsappUrl ? `<a class="button secondary" href="${esc(item.teamWhatsappUrl)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      </div></td>
    </tr>`).join('') || emptyRow(7, 'Nenhuma vistoria encontrada.');
}

function renderPlans() {
  $('plans-body').innerHTML = plans.map(item => `<tr>
    <td><input data-plan-name="${item.id}" value="${esc(item.name)}" maxlength="120"><small class="table-code">${esc(item.code)}</small></td>
    <td>${esc(item.category)}</td><td>${esc(item.region)}</td>
    <td><input data-plan-subtitle="${item.id}" value="${esc(item.subtitle || '')}" maxlength="180"></td>
    <td><select data-plan-active="${item.id}"><option value="true" ${item.active ? 'selected' : ''}>Ativo</option><option value="false" ${!item.active ? 'selected' : ''}>Inativo</option></select></td>
    <td><button class="secondary small-button" data-plan-save="${item.id}" type="button">Salvar</button></td>
  </tr>`).join('') || emptyRow(6, 'Nenhum plano cadastrado.');

  document.querySelectorAll('[data-plan-save]').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.planSave;
      try {
        await api(`/api/admin/catalog/plans/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.querySelector(`[data-plan-name="${id}"]`).value.trim(),
            subtitle: document.querySelector(`[data-plan-subtitle="${id}"]`).value.trim(),
            active: document.querySelector(`[data-plan-active="${id}"]`).value === 'true'
          })
        });
        message('Plano atualizado.', 'success');
        await load();
      } catch (error) { message(error.message); }
    });
  });
}

function renderPrices() {
  const filter = $('price-filter').value.trim().toLowerCase();
  $('prices-body').innerHTML = prices
    .filter(item => `${item.planName} ${item.category} ${item.region}`.toLowerCase().includes(filter))
    .map(item => `<tr>
      <td>${esc(item.planName)}</td><td>${esc(item.category)}</td><td>${esc(item.region)}</td>
      <td>${brl.format(item.minValue)} a ${brl.format(item.maxValue)}</td>
      <td><div class="inline-edit"><input data-price-value="${item.id}" value="${Number(item.monthlyPrice).toFixed(2).replace('.', ',')}" inputmode="decimal"><button class="secondary small-button" data-price-save="${item.id}" type="button">Salvar</button></div></td>
    </tr>`).join('') || emptyRow(5, 'Nenhuma faixa encontrada.');

  document.querySelectorAll('[data-price-save]').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        const id = button.dataset.priceSave;
        const monthlyPrice = parseMoney(document.querySelector(`[data-price-value="${id}"]`).value);
        await api(`/api/admin/catalog/prices/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monthlyPrice })
        });
        message('Valor do pacote atualizado.', 'success');
        await load();
      } catch (error) { message(error.message); }
    });
  });
}

function populateCoverageFilters() {
  const currentFilter = $('coverage-plan-filter').value;
  const currentCreate = $('coverage-create-plan').value;
  const options = plans.map(plan => `<option value="${plan.id}">${esc(plan.name)} — ${esc(plan.region)}</option>`).join('');
  $('coverage-plan-filter').innerHTML = `<option value="">Todos os planos</option>${options}`;
  $('coverage-create-plan').innerHTML = options;
  if ([...$('coverage-plan-filter').options].some(option => option.value === currentFilter)) $('coverage-plan-filter').value = currentFilter;
  if ([...$('coverage-create-plan').options].some(option => option.value === currentCreate)) $('coverage-create-plan').value = currentCreate;
}

function renderCoverages() {
  const planId = $('coverage-plan-filter').value;
  const status = $('coverage-status-filter').value;
  const text = $('coverage-text-filter').value.trim().toLowerCase();
  const filtered = coverages.filter(item => {
    if (planId && String(item.planId) !== planId) return false;
    if (status && item.status !== status) return false;
    return `${item.coverageName} ${item.detail || ''} ${item.planName}`.toLowerCase().includes(text);
  });

  $('coverages-body').innerHTML = filtered.map(item => `<tr>
    <td><strong>${esc(item.planName)}</strong><small class="table-code">${esc(item.region)}</small></td>
    <td>${esc(item.coverageName)}</td><td>${coverageStatusLabel(item.status)}</td>
    <td>${esc(item.detail || '—')}</td><td>${item.status === 'OPTIONAL' ? brl.format(item.monthlyPrice || 0) : '—'}</td>
    <td>${item.sortOrder}</td><td><div class="row-actions">
      <button class="secondary small-button" data-coverage-edit="${item.id}" type="button">Editar</button>
      <button class="danger small-button" data-coverage-delete="${item.id}" data-name="${esc(item.coverageName)}" type="button">Remover</button>
    </div></td>
  </tr>`).join('') || emptyRow(7, 'Nenhuma cobertura encontrada.');

  document.querySelectorAll('[data-coverage-edit]').forEach(button => button.addEventListener('click', () => openCoverageEditor(Number(button.dataset.coverageEdit))));
  document.querySelectorAll('[data-coverage-delete]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!confirm(`Remover “${button.dataset.name}” deste plano? As cotações antigas não serão alteradas.`)) return;
      try {
        await api(`/api/admin/catalog/coverages/${button.dataset.coverageDelete}`, { method: 'DELETE' });
        message('Cobertura removida do plano.', 'success');
        await load();
      } catch (error) { message(error.message); }
    });
  });
}

function openCoverageEditor(id) {
  const item = coverages.find(coverage => coverage.id === id);
  if (!item) return;
  $('coverage-editor-id').value = item.id;
  $('coverage-editor-plan').textContent = `${item.planName} · ${item.category} · ${item.region}`;
  $('coverage-editor-name').value = item.coverageName;
  $('coverage-editor-status').value = item.status;
  $('coverage-editor-detail').value = item.detail || '';
  $('coverage-editor-price').value = item.monthlyPrice == null ? '' : Number(item.monthlyPrice).toFixed(2).replace('.', ',');
  $('coverage-editor-order').value = item.sortOrder;
  $('coverage-editor').hidden = false;
  syncOptionalPriceState('coverage-editor-status', 'coverage-editor-price');
  $('coverage-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeCoverageEditor() {
  $('coverage-editor').hidden = true;
  $('coverage-editor-id').value = '';
}

function syncOptionalPriceState(statusId, priceId) {
  const optional = $(statusId).value === 'OPTIONAL';
  $(priceId).disabled = !optional;
  if (!optional) $(priceId).value = '';
}

async function saveCoverage() {
  try {
    const status = $('coverage-editor-status').value;
    const payload = {
      coverageName: $('coverage-editor-name').value.trim(),
      status,
      detail: $('coverage-editor-detail').value.trim(),
      monthlyPrice: status === 'OPTIONAL' ? parseMoney($('coverage-editor-price').value) : null,
      sortOrder: Number($('coverage-editor-order').value)
    };
    await api(`/api/admin/catalog/coverages/${$('coverage-editor-id').value}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    closeCoverageEditor();
    message('Cobertura atualizada. A mudança será usada nas próximas cotações.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

async function createCoverage() {
  try {
    const status = $('coverage-create-status').value;
    const payload = {
      coverageName: $('coverage-create-name').value.trim(),
      status,
      detail: $('coverage-create-detail').value.trim(),
      monthlyPrice: status === 'OPTIONAL' ? parseMoney($('coverage-create-price').value) : null,
      sortOrder: Number($('coverage-create-order').value)
    };
    await api(`/api/admin/catalog/plans/${$('coverage-create-plan').value}/coverages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    $('coverage-create-card').hidden = true;
    $('coverage-create-name').value = '';
    $('coverage-create-detail').value = '';
    $('coverage-create-price').value = '';
    message('Nova cobertura cadastrada.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

function renderAudit() {
  $('audit-body').innerHTML = auditEntries.map(item => {
    const oldValue = item.oldText ?? (item.oldValue == null ? '—' : brl.format(item.oldValue));
    const newValue = item.newText ?? (item.newValue == null ? '—' : brl.format(item.newValue));
    return `<tr><td>${date(item.changedAt)}</td><td>${esc(item.description)}</td><td>${esc(oldValue)}</td><td>${esc(newValue)}</td><td>${esc(item.changedBy)}</td></tr>`;
  }).join('') || emptyRow(5, 'Nenhuma alteração registrada.');
}

function emptyRow(columns, text) {
  return `<tr><td colspan="${columns}" class="empty-state">${esc(text)}</td></tr>`;
}

$('admin-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const box = $('admin-login-message');
  box.className = '';
  box.textContent = '';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: $('admin-username').value.trim(),
        password: $('admin-password').value
      })
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || 'Usuário ou senha inválidos.');
    if (body.role !== 'ADMIN') throw new Error('Este usuário não possui permissão administrativa.');
    token = body.token;
    localStorage.setItem(TOKEN_KEY, body.token);
    localStorage.setItem(ROLE_KEY, body.role);
    showAdmin();
    await load();
  } catch (error) {
    clearSession();
    box.className = 'message error';
    box.textContent = error.message;
  }
});

$('logout').addEventListener('click', () => showLogin());
$('activity-filter').addEventListener('input', renderActivities);
$('quote-filter').addEventListener('input', renderQuotes);
$('inspection-filter').addEventListener('input', renderInspections);
$('price-filter').addEventListener('input', renderPrices);
$('coverage-plan-filter').addEventListener('change', renderCoverages);
$('coverage-status-filter').addEventListener('change', renderCoverages);
$('coverage-text-filter').addEventListener('input', renderCoverages);
$('coverage-editor-status').addEventListener('change', () => syncOptionalPriceState('coverage-editor-status', 'coverage-editor-price'));
$('coverage-create-status').addEventListener('change', () => syncOptionalPriceState('coverage-create-status', 'coverage-create-price'));
$('save-coverage').addEventListener('click', saveCoverage);
$('close-coverage-editor').addEventListener('click', closeCoverageEditor);
$('show-add-coverage').addEventListener('click', () => {
  $('coverage-create-card').hidden = false;
  syncOptionalPriceState('coverage-create-status', 'coverage-create-price');
  $('coverage-create-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('cancel-create-coverage').addEventListener('click', () => { $('coverage-create-card').hidden = true; });
$('create-coverage').addEventListener('click', createCoverage);
$('add-admin-consultant').addEventListener('click', async () => {
  const name = $('new-admin-consultant').value.trim();
  try {
    await api('/api/admin/consultants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
    $('new-admin-consultant').value = '';
    message('Consultor cadastrado.', 'success');
    await load();
  } catch (error) { message(error.message); }
});

document.querySelectorAll('.admin-tabs button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.admin-tabs button').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('[id^="tab-"]').forEach(section => {
      section.hidden = section.id !== `tab-${button.dataset.tab}`;
    });
  });
});

async function boot() {
  if (!token || localStorage.getItem(ROLE_KEY) !== 'ADMIN') {
    showLogin();
    return;
  }
  try {
    const me = await api('/api/auth/me');
    if (me.role !== 'ADMIN') {
      showLogin('Este usuário não possui permissão administrativa.');
      return;
    }
    showAdmin();
    await load();
  } catch (error) {
    if (!$('admin-login').hidden) return;
    showLogin(error.message);
  }
}

boot();
