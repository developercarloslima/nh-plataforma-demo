const TOKEN_KEY = 'nhPortalToken';
const ROLE_KEY = 'nhPortalRole';
const CONSULTANT_KEY = 'nhSelectedConsultant';
const $ = id => document.getElementById(id);

let token = localStorage.getItem(TOKEN_KEY);
let consultants = [];
let users = [];
let quotes = [];
let inspections = [];
let categories = [];
let prices = [];
let promotionalMotorcyclePrices = [];
let plans = [];
let coverages = [];
let auditEntries = [];
let settings = {};
let regulationDocument = {};
let publicQuoteAssignmentSettings = { enabled: true, updatedBy: "SYSTEM", updatedAt: null };
const adminMediaObjectUrls = new Set();

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
const REGION_LABELS = Object.freeze({ NATIONAL: 'Nacional', NORTHEAST: 'Nordeste', CAPITAL: 'Capital' });
const MOTORCYCLE_ORIGIN_LABELS = Object.freeze({ NORTHEAST: 'Demais cidades do Nordeste', CAPITAL: 'Capital' });
const QUOTE_STATUS_LABELS = Object.freeze({
  CREATED: ['Pendente', 'warn'], UNDER_REVIEW: ['Em análise', 'warn'], ACCEPTED: ['Aceita', 'ok'],
  DECLINED: ['Recusada', 'off'], CANCELLED: ['Cancelada', 'off']
});
const INSPECTION_STATUS_LABELS = Object.freeze({
  WAITING_FILES: ['Aguardando arquivos', 'warn'], UPLOADING_FILES: ['Envio em andamento', 'warn'], CREATED: ['Pendente', 'warn'],
  UNDER_REVIEW: ['Em análise', 'warn'], COMPLETED: ['Material enviado', 'ok'],
  APPROVED: ['Aprovada', 'ok'], REJECTED: ['Reprovada', 'off'], CANCELLED: ['Cancelada', 'off'], EXPIRED: ['Expirada', 'off']
});
const AUDIT_TYPE_LABELS = Object.freeze({
  PLAN: 'Plano', VEHICLE_CATEGORY: 'Categoria de veículo', PRICE_RANGE: 'Faixa de valor', PROMO_MOTORCYCLE_PRICE: 'Tabela promocional', PLAN_COVERAGE: 'Cobertura', OPTIONAL: 'Opcional',
  CONSULTANT: 'Consultor', PORTAL_USER: 'Usuário', QUOTE_STATUS: 'Cotação', QUOTE_DELETE: 'Exclusão de cotação', INSPECTION_STATUS: 'Retrato NH', INSPECTION_DELETE: 'Exclusão de vistoria', DATA_RETENTION: 'Retenção automática', COMMUNICATION: 'Comunicação', SITE_DOCUMENT: 'Arquivo do site', QUOTE_CONSULTANT: 'Responsável da cotação', PUBLIC_QUOTE_ASSIGNMENT: 'Distribuição de cotação do site'
});


const VEHICLE_CATEGORY_GROUPS = Object.freeze([
  { code: 'MOTORCYCLE_PROMO_2026', name: 'Tabela Promocional - Motocicletas', categoryCodes: ['MOTORCYCLE_PROMO_2026'] },
  { code: 'MOTORCYCLE_UP_TO_300', name: 'Motos até 300cc', categoryCodes: ['MOTORCYCLE_UP_TO_300'] },
  { code: 'MOTORCYCLE_OVER_300', name: 'Motos acima de 300cc', categoryCodes: ['MOTORCYCLE_OVER_300'] },
  { code: 'SCOOTER_ELECTRIC', name: 'Scooters e elétricas', categoryCodes: ['SCOOTER_ELECTRIC'] },
  { code: 'CAR', name: 'Carros', categoryCodes: ['CAR_NATIONAL', 'CAR_IMPORTED'] },
  { code: 'UTILITY', name: 'Utilitários', categoryCodes: ['UTILITY'] },
  { code: 'TRUCK', name: 'Caminhões', categoryCodes: ['TRUCK'] }
]);

const regionLabel = value => REGION_LABELS[value] || value || '—';
const motorcycleOriginLabel = value => MOTORCYCLE_ORIGIN_LABELS[value] || 'Não se aplica';
const quoteOriginLabel = value => value === 'SELF_SERVICE' ? 'Cliente pelo site' : 'Consultor';
const quoteConsultantLabel = item => item?.consultantId ? (item.consultantName || 'Consultor') : (item?.origin === 'SELF_SERVICE' ? 'Aguardando atribuição' : (item?.consultantName || '—'));
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(CONSULTANT_KEY);
  token = null;
}

function showLogin(text = '') {
  clearSession();
  $('admin-login').hidden = false;
  $('admin-view').hidden = true;
  $('logout').hidden = true;
  const box = $('admin-login-message');
  box.className = text ? 'message error' : '';
  box.textContent = text;
}

function showAdmin() {
  $('admin-login').hidden = true;
  $('admin-view').hidden = false;
  $('logout').hidden = false;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(window.NH_API?.backend(path) || path, { ...options, headers });
  if (response.status === 401 || response.status === 403) {
    showLogin('Sua sessão administrativa expirou. Entre novamente.');
    throw new Error('Sessão administrativa inválida.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || body?.detail || 'Não foi possível concluir a operação.');
  }
  return response.status === 204 ? null : response.json();
}

async function apiBlob(path) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(window.NH_API?.backend(path) || path, { headers, cache: 'no-store' });
  if (response.status === 401 || response.status === 403) {
    showLogin('Sua sessão administrativa expirou. Entre novamente.');
    throw new Error('Sessão administrativa inválida.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || 'Não foi possível carregar o arquivo.');
  }
  return response.blob();
}

const ADMIN_ASSET_LABELS = {
  PHOTO: 'Foto da vistoria',
  VIDEO: 'Vídeo da vistoria',
  SIGNATURE: 'Assinatura',
  VEHICLE_DOCUMENT: 'CRLV do veículo',
  IDENTITY_DOCUMENT: 'RG ou CNH',
  OTHER_DOCUMENT: 'Documento adicional',
  REPORT: 'Relatório da vistoria'
};

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function releaseAdminMediaUrls() {
  adminMediaObjectUrls.forEach(url => URL.revokeObjectURL(url));
  adminMediaObjectUrls.clear();
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

function quoteBadge(item) {
  if (item.expired && ['CREATED', 'UNDER_REVIEW'].includes(item.status)) return statusBadge('Expirada', 'off');
  const [label, kind] = QUOTE_STATUS_LABELS[item.status] || [item.status, ''];
  return statusBadge(label, kind);
}

function inspectionBadge(status) {
  const [label, kind] = INSPECTION_STATUS_LABELS[status] || [status, ''];
  return statusBadge(label, kind);
}

function hasInspectionFiles(item) {
  return Number(item?.assetCount || 0) > 0;
}

function adminInspectionAssetAvailable(item, type, sortOrder) {
  return Array.isArray(item?.assets) && item.assets.some(asset =>
    asset?.available === true && asset?.type === type && Number(asset?.sortOrder) === Number(sortOrder)
  );
}

function adminInspectionPendingCount(item) {
  if (!item) return 0;
  if (item.requestType !== 'NEW_INSPECTION') return adminInspectionAssetAvailable(item, 'VIDEO', 1) ? 0 : 1;

  const photoCount = item.vehicleType === 'MOTORCYCLE' ? 7 : 15;
  let pending = 0;
  for (let order = 1; order <= photoCount; order += 1) {
    if (!adminInspectionAssetAvailable(item, 'PHOTO', order)) pending += 1;
  }
  if (!adminInspectionAssetAvailable(item, 'VIDEO', photoCount + 1)) pending += 1;
  if (!adminInspectionAssetAvailable(item, 'SIGNATURE', photoCount + 2)) pending += 1;
  if (!adminInspectionAssetAvailable(item, 'VEHICLE_DOCUMENT', photoCount + 3)) pending += 1;
  if (!adminInspectionAssetAvailable(item, 'IDENTITY_DOCUMENT', photoCount + 4)) pending += 1;
  if (!adminInspectionAssetAvailable(item, 'IDENTITY_DOCUMENT', photoCount + 5)) pending += 1;
  if (!item.residenceAddress) pending += 1;
  return pending;
}

function adminInspectionNeedsFiles(item) {
  return adminInspectionPendingCount(item) > 0;
}

function coverageBadge(status) {
  if (status === 'INCLUDED') return statusBadge('Incluído', 'ok');
  if (status === 'OPTIONAL') return statusBadge('Serviço opcional', 'warn');
  return statusBadge('Não incluído', 'off');
}

function parseMoney(value) {
  const number = window.NHMoney?.parse(value);
  if (!Number.isFinite(number) || number < 0) throw new Error('Informe um valor válido.');
  return number;
}

function moneyInput(value) {
  return window.NHMoney?.format(Number(value || 0)) || '0,00';
}

function optionalMoney(id) {
  const value = $(id).value.trim();
  return value ? parseMoney(value) : null;
}

function setOptionalMoney(id, value) {
  $(id).value = value == null ? '' : moneyInput(value);
}

function emptyRow(columns, text) {
  return `<tr><td colspan="${columns}" class="empty-state">${esc(text)}</td></tr>`;
}

function openDialog(id) {
  const dialog = $(id);
  if (!dialog.open) dialog.showModal();
}

function closeDialog(id) {
  const dialog = $(id);
  if (id === 'inspection-dialog') releaseAdminMediaUrls();
  if (dialog.open) dialog.close();
}

function confirmAction(title, text, confirmLabel = 'Confirmar') {
  return new Promise(resolve => {
    const dialog = $('confirm-dialog');
    const action = $('confirm-action');
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    action.textContent = confirmLabel;
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'default');
    };
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}

async function load() {
  clearMessage();
  try {
    const result = await Promise.all([
      api('/api/admin/consultants'),
      api('/api/admin/users'),
      api('/api/admin/quotes'),
      api('/api/admin/inspections'),
      api('/api/admin/catalog/categories'),
      api('/api/admin/catalog/prices'),
      api('/api/admin/catalog/promotional-motorcycle-prices'),
      api('/api/admin/catalog/plans'),
      api('/api/admin/catalog/coverages'),
      api('/api/admin/catalog/audit'),
      api('/api/admin/settings/communications'),
      api('/api/admin/settings/regulation'),
      api('/api/admin/settings/public-quote-assignment')
    ]);
    [consultants, users, quotes, inspections, categories, prices, promotionalMotorcyclePrices, plans, coverages, auditEntries, settings, regulationDocument, publicQuoteAssignmentSettings] = result;
    renderAll();
  } catch (error) {
    if (!$('admin-view').hidden) message(error.message);
  }
}

function renderAll() {
  populatePlanSelects();
  populateCategorySelect();
  renderOverview();
  renderActivities();
  renderConsultants();
  renderUsers();
  renderQuotes();
  renderPublicQuoteAssignmentSettings();
  renderInspections();
  renderPlans();
  renderVehicleCategories();
  renderPrices();
  renderCoverages();
  renderSettings();
  renderAudit();
}

function renderOverview() {
  $('kpi-consultants').textContent = consultants.filter(item => item.active).length;
  $('kpi-quotes').textContent = quotes.length;
  $('kpi-inspections').textContent = inspections.length;
  $('kpi-accepted').textContent = quotes.filter(item => item.status === 'ACCEPTED').length;

  $('quote-status-summary').innerHTML = Object.entries(QUOTE_STATUS_LABELS).map(([status, [label, kind]]) => {
    const count = quotes.filter(item => item.status === status).length;
    return `<div><span>${statusBadge(label, kind)}</span><strong>${count}</strong></div>`;
  }).join('');

  $('inspection-status-summary').innerHTML = Object.entries(INSPECTION_STATUS_LABELS).map(([status, [label, kind]]) => {
    const count = inspections.filter(item => item.status === status).length;
    return `<div><span>${statusBadge(label, kind)}</span><strong>${count}</strong></div>`;
  }).join('');

  $('overview-team-email').textContent = settings.teamEmail || 'Não configurado';
  $('overview-team-whatsapp').textContent = formatPhone(settings.teamWhatsapp) || 'Não configurado';
}

function activities() {
  const quoteItems = quotes.map(item => ({
    id: item.id, source: 'quote', date: item.createdAt, consultant: item.consultantName,
    type: 'Cotação', person: item.customerName, plate: item.plate,
    statusHtml: quoteBadge(item)
  }));
  const inspectionItems = inspections.map(item => ({
    id: item.id, source: 'inspection', date: item.createdAt, consultant: item.consultantName,
    type: item.requestType === 'NEW_INSPECTION' ? 'Nova vistoria' : 'Atualização de boleto',
    person: item.associateName, plate: item.plate, statusHtml: inspectionBadge(item.status)
  }));
  return [...quoteItems, ...inspectionItems].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderActivities() {
  const filter = $('activity-filter').value.trim().toLowerCase();
  $('activities-body').innerHTML = activities()
    .filter(item => `${item.consultant} ${item.person} ${item.plate} ${item.type}`.toLowerCase().includes(filter))
    .map(item => `<tr>
      <td>${date(item.date)}</td><td><strong>${esc(item.consultant)}</strong></td><td>${esc(item.type)}</td>
      <td>${esc(item.person)}</td><td>${esc(item.plate)}</td><td>${item.statusHtml}</td>
      <td><button class="outline small-button" data-analyze-source="${item.source}" data-analyze-id="${item.id}" type="button">Analisar</button></td>
    </tr>`).join('') || emptyRow(7, 'Nenhuma atividade encontrada.');
  bindAnalyzeButtons();
}

function renderConsultants() {
  $('consultants-body').innerHTML = consultants.map(item => `<tr>
    <td><strong>${esc(item.name)}</strong></td><td>${sourceLabel(item.source)}</td><td>${item.quoteCount}</td>
    <td>${item.inspectionCount}</td><td>${statusBadge(item.active ? 'Ativo' : 'Inativo', item.active ? 'ok' : 'off')}</td>
    <td><div class="row-actions">
      <button class="secondary small-button" data-consultant-edit="${item.id}" type="button">Editar</button>
      <button class="outline small-button" data-consultant-toggle="${item.id}" type="button">${item.active ? 'Desativar' : 'Ativar'}</button>
      <button class="danger small-button" data-consultant-delete="${item.id}" type="button">Excluir</button>
    </div></td>
  </tr>`).join('') || emptyRow(6, 'Nenhum consultor cadastrado.');

  document.querySelectorAll('[data-consultant-edit]').forEach(button => button.addEventListener('click', () => openConsultantModal(button.dataset.consultantEdit)));
  document.querySelectorAll('[data-consultant-toggle]').forEach(button => button.addEventListener('click', () => toggleConsultant(button.dataset.consultantToggle)));
  document.querySelectorAll('[data-consultant-delete]').forEach(button => button.addEventListener('click', () => deleteConsultant(button.dataset.consultantDelete)));
}

async function toggleConsultant(id) {
  const item = consultants.find(value => value.id === id);
  if (!item) return;
  if (item.active) {
    const confirmed = await confirmAction(
      'Desativar consultor?',
      `${item.name} deixará de aparecer na seleção de novas atividades. O histórico será mantido.`,
      'Desativar'
    );
    if (!confirmed) return;
  }
  try {
    await api(`/api/admin/consultants/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active })
    });
    message(item.active ? 'Consultor desativado.' : 'Consultor ativado.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

async function deleteConsultant(id) {
  const item = consultants.find(value => value.id === id);
  if (!item) return;
  const confirmed = await confirmAction(
    'Excluir consultor?',
    `${item.name} será removido da lista. As ${item.quoteCount} cotações e ${item.inspectionCount} atividades do Retrato NH continuarão salvas com o nome dele.`,
    'Excluir definitivamente'
  );
  if (!confirmed) return;
  try {
    await api(`/api/admin/consultants/${id}`, { method: 'DELETE' });
    message('Consultor excluído. As atividades vinculadas foram preservadas.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

function openConsultantModal(id = '') {
  const item = consultants.find(value => value.id === id);
  $('consultant-id').value = item?.id || '';
  $('consultant-name').value = item?.name || '';
  $('consultant-active-wrap').hidden = !item;
  $('consultant-active').checked = item?.active ?? true;
  $('consultant-dialog-title').textContent = item ? 'Editar consultor' : 'Cadastrar consultor';
  openDialog('consultant-dialog');
  $('consultant-name').focus();
}

function roleLabel(role) {
  return ({ ADMIN: 'Administrador', ANALYST: 'Analista', CONSULTANT: 'Consultor' })[role] || role || '—';
}

function renderUsers() {
  $('users-body').innerHTML = users.map(item => `<tr>
    <td><strong>${esc(item.username)}</strong></td>
    <td>${esc(item.displayName || '—')}</td>
    <td>${item.role === 'CONSULTANT'
      ? esc(item.consultantName || (item.createdBy === 'BOOTSTRAP' ? 'Usuário padrão — seleção manual' : '—'))
      : '—'}</td>
    <td>${statusBadge(roleLabel(item.role), item.role === 'ADMIN' ? 'ok' : item.role === 'ANALYST' ? 'warn' : '')}</td>
    <td>${statusBadge(item.active ? 'Ativo' : 'Inativo', item.active ? 'ok' : 'off')}</td>
    <td>${date(item.lastLoginAt)}</td>
    <td>${date(item.passwordChangedAt)}</td>
    <td><div class="row-actions">
      <button class="secondary small-button" data-user-edit="${item.id}" type="button">Editar</button>
      <button class="outline small-button" data-user-password="${item.id}" type="button">Alterar senha</button>
      <button class="${item.active ? 'danger' : 'outline'} small-button" data-user-toggle="${item.id}" type="button">${item.active ? 'Desativar' : 'Ativar'}</button>
    </div></td>
  </tr>`).join('') || emptyRow(8, 'Nenhum usuário cadastrado.');

  document.querySelectorAll('[data-user-edit]').forEach(button => button.addEventListener('click', () => openUserModal(button.dataset.userEdit)));
  document.querySelectorAll('[data-user-password]').forEach(button => button.addEventListener('click', () => openPasswordModal(button.dataset.userPassword)));
  document.querySelectorAll('[data-user-toggle]').forEach(button => button.addEventListener('click', () => toggleUser(button.dataset.userToggle)));
}

function populateUserConsultants(item = null) {
  const select = $('user-consultant');
  const options = ['<option value="">Selecione um consultor ativo</option>'];
  if (item?.role === 'CONSULTANT' && !item.consultantId && item.createdBy === 'BOOTSTRAP') {
    options.push('<option value="__LEGACY__">Usuário padrão — seleção manual no login</option>');
  }
  consultants.filter(consultant => consultant.active).forEach(consultant => {
    options.push(`<option value="${consultant.id}">${esc(consultant.name)}</option>`);
  });
  options.push('<option value="__NEW__">+ Cadastrar novo consultor</option>');
  select.innerHTML = options.join('');
  if (item?.consultantId) select.value = item.consultantId;
  else if (item?.role === 'CONSULTANT' && item.createdBy === 'BOOTSTRAP') select.value = '__LEGACY__';
  else select.value = '';
}

function syncUserRoleFields() {
  const role = $('user-role').value;
  const consultantMode = role === 'CONSULTANT';
  $('user-consultant-wrap').hidden = !consultantMode;
  if (!consultantMode) {
    $('user-new-consultant-wrap').hidden = true;
    $('user-new-consultant-name').required = false;
    return;
  }
  syncUserConsultantMode();
}

function syncUserConsultantMode() {
  const isNew = $('user-consultant').value === '__NEW__';
  $('user-new-consultant-wrap').hidden = !isNew;
  $('user-new-consultant-name').required = isNew;
  if (!isNew) $('user-new-consultant-name').value = '';
}

function openUserModal(id = '') {
  const item = users.find(value => value.id === id);
  $('user-id').value = item?.id || '';
  $('user-username').value = item?.username || '';
  $('user-display-name').value = item?.displayName || '';

  const roleSelect = $('user-role');
  roleSelect.innerHTML = '<option value="CONSULTANT">Consultor</option><option value="ANALYST">Analista</option>';
  if (item?.role === 'ADMIN') roleSelect.insertAdjacentHTML('beforeend', '<option value="ADMIN">Administrador</option>');
  roleSelect.value = item?.role || 'CONSULTANT';

  populateUserConsultants(item);
  $('user-new-consultant-name').value = '';
  $('user-password').value = '';
  $('user-password-wrap').hidden = Boolean(item);
  $('user-password').required = !item;
  $('user-active-wrap').hidden = !item;
  $('user-active').checked = item?.active ?? true;
  $('user-dialog-title').textContent = item ? 'Editar usuário' : 'Novo usuário';
  syncUserRoleFields();
  openDialog('user-dialog');
  $('user-username').focus();
}

function openPasswordModal(id) {
  const item = users.find(value => value.id === id);
  if (!item) return;
  $('password-user-id').value = item.id;
  $('password-new').value = '';
  $('password-confirm').value = '';
  $('password-dialog-title').textContent = `Alterar senha — ${item.username}`;
  openDialog('password-dialog');
  $('password-new').focus();
}

async function toggleUser(id) {
  const item = users.find(value => value.id === id);
  if (!item) return;
  const action = item.active ? 'desativar' : 'ativar';
  const confirmed = await confirmAction(
    `${item.active ? 'Desativar' : 'Ativar'} usuário?`,
    item.active
      ? `${item.username} perderá o acesso imediatamente.`
      : `${item.username} poderá voltar a acessar o portal com a senha atual.`,
    item.active ? 'Desativar' : 'Ativar'
  );
  if (!confirmed) return;
  try {
    await api(`/api/admin/users/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active })
    });
    message(`Usuário ${action === 'desativar' ? 'desativado' : 'ativado'}.`, 'success');
    await load();
  } catch (error) { message(error.message); }
}

async function deleteQuote(id) {
  const item = quotes.find(value => value.id === id);
  if (!item) return;
  const confirmed = await confirmAction(
    'Excluir cotação do banco?',
    `A cotação ${item.quoteNumber} de ${item.customerName} será excluída definitivamente. Esta ação não pode ser desfeita.`,
    'Excluir cotação'
  );
  if (!confirmed) return;
  try {
    await api(`/api/admin/quotes/${id}`, { method: 'DELETE' });
    message('Cotação excluída do banco.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

async function deleteAllQuotes() {
  if (!quotes.length) return message('Não existem cotações para excluir.');
  const confirmed = await confirmAction(
    'Excluir TODAS as cotações?',
    `Serão excluídas definitivamente ${quotes.length} cotações, inclusive aceitas. Vistorias vinculadas serão preservadas como registros independentes.`,
    'Excluir todas'
  );
  if (!confirmed) return;
  try {
    const result = await api('/api/admin/quotes', { method: 'DELETE' });
    message(result.message || 'Cotações excluídas.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

async function deleteInspection(id) {
  const item = inspections.find(value => value.id === id);
  if (!item) return;
  if (item.status === 'APPROVED') return message('Vistorias aprovadas não podem ser excluídas manualmente.');
  const confirmed = await confirmAction(
    'Excluir vistoria do banco?',
    `A vistoria de ${item.associateName} será excluída junto com fotos, vídeos, documentos e relatório armazenados.`,
    'Excluir vistoria'
  );
  if (!confirmed) return;
  try {
    await api(`/api/admin/inspections/${id}`, { method: 'DELETE' });
    message('Vistoria e arquivos excluídos do banco.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

async function deleteAllAllowedInspections() {
  const allowed = inspections.filter(item => item.status !== 'APPROVED');
  const approved = inspections.length - allowed.length;
  if (!allowed.length) return message(`Não existem vistorias permitidas para excluir. ${approved} aprovada(s) permanece(m) protegida(s).`);
  const confirmed = await confirmAction(
    'Excluir vistorias permitidas?',
    `Serão excluídas definitivamente ${allowed.length} vistorias e seus arquivos. ${approved} vistoria(s) aprovada(s) será(ão) preservada(s).`,
    'Excluir vistorias'
  );
  if (!confirmed) return;
  try {
    const result = await api('/api/admin/inspections', { method: 'DELETE' });
    message(result.message || 'Vistorias excluídas.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

function renderQuotes() {
  const filter = $('quote-filter').value.trim().toLowerCase();
  $('quotes-body').innerHTML = quotes
    .filter(item => `${quoteConsultantLabel(item)} ${quoteOriginLabel(item.origin)} ${item.customerName} ${item.plate || ""} ${item.quoteNumber}`.toLowerCase().includes(filter))
    .map(item => `<tr>
      <td><strong>${esc(item.quoteNumber)}</strong></td><td><strong>${esc(quoteOriginLabel(item.origin))}</strong><small class="table-subtitle">${esc(quoteConsultantLabel(item))}</small></td><td>${esc(item.customerName)}</td>
      <td>${esc(item.plate || (item.zeroKm ? '0 km — sem placa' : '—'))}</td><td>${esc(item.selectedPlanName)}</td><td>${brl.format(item.monthlyValue)}</td>
      <td>${date(item.validUntil)}</td><td>${quoteBadge(item)}</td>
      <td><div class="row-actions"><button class="secondary small-button" data-quote-analyze="${item.id}" type="button">Analisar</button><a class="button outline small-button" href="${esc(item.pdfUrl)}" target="_blank" rel="noopener">PDF</a><button class="danger small-button" data-quote-delete="${item.id}" type="button">Excluir</button></div></td>
    </tr>`).join('') || emptyRow(9, 'Nenhuma cotação encontrada.');
  document.querySelectorAll('[data-quote-analyze]').forEach(button => button.addEventListener('click', () => openQuoteAnalysis(button.dataset.quoteAnalyze)));
  document.querySelectorAll('[data-quote-delete]').forEach(button => button.addEventListener('click', () => deleteQuote(button.dataset.quoteDelete)));
}

function renderPublicQuoteAssignmentSettings() {
  const enabled = publicQuoteAssignmentSettings?.enabled !== false;
  $('public-quote-assignment-enabled').checked = enabled;
  $('public-quote-assignment-status').textContent = enabled
    ? 'Ativada — último consultor logado recebe a nova cotação'
    : 'Desativada — Admin escolhe o consultor';
  $('public-quote-assignment-updated-at').textContent = publicQuoteAssignmentSettings?.updatedAt
    ? `${date(publicQuoteAssignmentSettings.updatedAt)} por ${publicQuoteAssignmentSettings.updatedBy || '—'}`
    : 'Regra padrão do sistema';
}

function populateQuoteConsultantSelect(item) {
  const select = $('quote-analysis-consultant');
  const active = consultants.filter(consultant => consultant.active);
  const options = ['<option value="">Selecione um consultor</option>'];
  active.forEach(consultant => {
    options.push(`<option value="${esc(consultant.id)}">${esc(consultant.name)}</option>`);
  });
  if (item?.consultantId && !active.some(consultant => consultant.id === item.consultantId)) {
    options.push(`<option value="${esc(item.consultantId)}">${esc(item.consultantName || 'Consultor atual')} (inativo — atual)</option>`);
  }
  select.innerHTML = options.join('');
  select.value = item?.consultantId || '';
  select.dataset.originalConsultantId = item?.consultantId || '';
}

function renderInspections() {
  const filter = $('inspection-filter').value.trim().toLowerCase();
  $('inspections-body').innerHTML = inspections
    .filter(item => `${item.consultantName} ${item.associateName} ${item.plate || ""}`.toLowerCase().includes(filter))
    .map(item => {
      const filesAvailable = hasInspectionFiles(item);
      const needsFiles = adminInspectionNeedsFiles(item);
      const partialResubmission = filesAvailable && needsFiles;
      const currentPublicUrl = item.publicUrl
        ? (window.NH_URLS?.retratoUrl(item.publicUrl) || item.publicUrl)
        : null;
      const statusAction = filesAvailable
        ? `<button class="outline small-button" data-inspection-analyze="${item.id}" type="button">Ver documentos enviados</button>`
        : '';
      const pendingActions = needsFiles
        ? `${item.associateInspectionWhatsappUrl ? `<a class="button secondary small-button" href="${esc(item.associateInspectionWhatsappUrl)}" target="_blank" rel="noopener">${partialResubmission ? 'Enviar pendências' : 'Enviar link'}</a>` : ''}${currentPublicUrl ? `<a class="button outline small-button" href="${esc(currentPublicUrl)}" target="_blank" rel="noopener">${partialResubmission ? 'Refazer pendências' : 'Fazer vistoria'}</a>` : ''}`
        : '';
      return `<tr>
        <td><strong>${esc(item.associateName)}</strong></td><td>${esc(item.consultantName)}</td><td>${esc(item.plate || '0 km — sem placa')}</td>
        <td>${item.requestType === 'NEW_INSPECTION' ? 'Nova vistoria' : 'Atualização de boleto'}</td><td>${item.assetCount}</td>
        <td><div class="status-with-action">${inspectionBadge(item.status)}${statusAction}</div></td><td>${date(item.createdAt)}</td>
        <td><div class="row-actions">${pendingActions}<button class="secondary small-button" data-inspection-analyze="${item.id}" type="button">Analisar</button>${item.status === 'APPROVED' ? '' : `<button class="danger small-button" data-inspection-delete="${item.id}" type="button">Excluir</button>`}</div></td>
      </tr>`;
    }).join('') || emptyRow(8, 'Nenhuma atividade do Retrato NH encontrada.');
  document.querySelectorAll('[data-inspection-analyze]').forEach(button => button.addEventListener('click', () => openInspectionAnalysis(button.dataset.inspectionAnalyze)));
  document.querySelectorAll('[data-inspection-delete]').forEach(button => button.addEventListener('click', () => deleteInspection(button.dataset.inspectionDelete)));
}


function bindAnalyzeButtons() {
  document.querySelectorAll('[data-analyze-source]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.analyzeSource === 'quote') openQuoteAnalysis(button.dataset.analyzeId);
    else openInspectionAnalysis(button.dataset.analyzeId);
  }));
}

function openQuoteAnalysis(id) {
  const item = quotes.find(value => value.id === id);
  if (!item) return;
  $('quote-analysis-id').value = item.id;
  $('quote-dialog-title').textContent = item.quoteNumber;
  $('quote-analysis-status').value = item.status;
  $('quote-analysis-note').value = item.adminNote || '';
  const consultantField = $('quote-analysis-consultant-field');
  consultantField.hidden = item.origin !== 'SELF_SERVICE';
  if (item.origin === 'SELF_SERVICE') populateQuoteConsultantSelect(item);
  const quoteDiscount = Number(item.discountPercent || 0);
  const quoteDetails = [
    ['Cliente', item.customerName], ['Origem', quoteOriginLabel(item.origin)], ['Responsável', quoteConsultantLabel(item)], ['CPF', item.maskedCpf || '—'], ['WhatsApp', formatPhone(item.whatsapp) || '—'],
    ['Placa', item.plate], ['Modelo', item.model], ['Ano', item.manufactureYear], ['Veículo 0 km', item.zeroKm ? 'Sim' : 'Não'],
    ['Valor FIPE', brl.format(item.fipeValue)], ['Abrangência', regionLabel(item.region)],
    ['Origem da moto', item.motorcycleOrigin ? motorcycleOriginLabel(item.motorcycleOrigin) : 'Não se aplica'],
    ['Observação da cotação', item.observation || '—'],
    ['Plano', item.selectedPlanName]
  ];
  if (quoteDiscount > 0) {
    quoteDetails.push(['Subtotal antes do desconto', brl.format(item.preDiscountMonthlyValue || item.monthlyValue)]);
    quoteDetails.push(['Desconto comercial', `${quoteDiscount}%`]);
    if (quoteDiscount === 15) quoteDetails.push(['Condição do vigia traseiro', 'NH + outra empresa']);
    if (quoteDiscount === 30) quoteDetails.push(['Condição do vigia traseiro', 'Somente NH']);
  }
  quoteDetails.push(
    ['Total mensal', brl.format(item.monthlyValue)],
    ['Taxa única', brl.format(item.oneTimeFee || 0)], ['Emitida em', date(item.createdAt)], ['Válida até', date(item.validUntil)],
    ['Última análise', date(item.reviewedAt)]
  );
  $('quote-detail-grid').innerHTML = detailItems(quoteDetails);
  const currentInspectionUrl = item.inspectionUrl
    ? (window.NH_URLS?.retratoUrl(item.inspectionUrl) || item.inspectionUrl)
    : null;
  $('quote-links').innerHTML = linkButtons([
    [item.pdfUrl, 'Abrir PDF'], [currentInspectionUrl, 'Abrir vistoria digital'], [item.driveFolderUrl, 'Abrir Drive'], [item.drivePdfUrl, 'PDF no Drive'],
    [window.NH_URLS?.replaceLinkInCommunicationUrl(item.teamWhatsappUrl, item.inspectionUrl, currentInspectionUrl) || item.teamWhatsappUrl, 'Enviar por WhatsApp'],
    [window.NH_URLS?.replaceLinkInCommunicationUrl(item.teamEmailUrl, item.inspectionUrl, currentInspectionUrl) || item.teamEmailUrl, 'Enviar por e-mail']
  ]);
  openDialog('quote-dialog');
}

function openInspectionAnalysis(id) {
  const item = inspections.find(value => value.id === id);
  if (!item) return;
  const filesAvailable = hasInspectionFiles(item);
  const needsFiles = adminInspectionNeedsFiles(item);
  const pendingCount = adminInspectionPendingCount(item);
  const currentPublicUrl = item.publicUrl
    ? (window.NH_URLS?.retratoUrl(item.publicUrl) || item.publicUrl)
    : null;

  $('inspection-analysis-id').value = item.id;
  $('inspection-dialog-title').textContent = `${item.plate || '0 km — sem placa'} — ${item.associateName}`;
  $('inspection-analysis-note').value = item.adminNote || '';

  const statusSelect = $('inspection-analysis-status');
  const readyForAnalysis = filesAvailable && Array.isArray(item.assets) && item.assets.some(asset => asset.type === 'REPORT' && asset.available) && Boolean(item.completedAt);
  const allowedWhileWaiting = new Set(['WAITING_FILES', 'UPLOADING_FILES', 'CANCELLED', 'EXPIRED']);
  Array.from(statusSelect.options).forEach(option => {
    option.disabled = !readyForAnalysis && !allowedWhileWaiting.has(option.value);
  });
  if (!filesAvailable) {
    statusSelect.value = item.status === 'CANCELLED' || item.status === 'EXPIRED' ? item.status : 'WAITING_FILES';
  } else if (!readyForAnalysis) {
    statusSelect.value = item.status === 'CANCELLED' || item.status === 'EXPIRED' ? item.status : 'UPLOADING_FILES';
  } else {
    statusSelect.value = item.status;
  }

  const inspectionDiscount = Number(item.discountPercent || 0);
  const inspectionDetails = [
    ['Associado', item.associateName], ['CPF', item.maskedCpf], ['WhatsApp', formatPhone(item.whatsapp) || '—'],
    ['Consultor', item.consultantName], ['Placa', item.plate || '0 km — sem placa'],
    ['Endereço residencial', item.residenceAddress || '—'],
    ['Tipo', item.requestType === 'NEW_INSPECTION' ? 'Nova vistoria' : 'Atualização de boleto']
  ];
  if (item.requestType === 'BILL_UPDATE') {
    inspectionDetails.push(['Plano já contratado', item.contractedPlan || '—']);
  }
  if (item.requestType === 'NEW_INSPECTION' && inspectionDiscount > 0) {
    inspectionDetails.push(['Desconto da cotação', `${inspectionDiscount}%`]);
    if (inspectionDiscount === 15) inspectionDetails.push(['Condição do vigia traseiro', 'NH + outra empresa']);
    if (inspectionDiscount === 30) inspectionDetails.push(['Condição do vigia traseiro', 'Somente NH']);
  }
  inspectionDetails.push(
    ['Arquivos disponíveis', item.assetCount], ['Situação dos arquivos', filesAvailable ? (needsFiles ? `${pendingCount} ${pendingCount === 1 ? 'item pendente' : 'itens pendentes'}; os demais continuam armazenados` : `Armazenados no sistema até ${date(item.filesExpireAt)}`) : (Number(item.expiredAssetCount || 0) > 0 ? 'Arquivos apagados após 40 dias' : 'Aguardando envio do associado')],
    ['Criada em', date(item.createdAt)], ['Expira em', date(item.expiresAt)],
    ['Concluída em', date(item.completedAt)], ['Última análise', date(item.reviewedAt)]
  );
  $('inspection-detail-grid').innerHTML = detailItems(inspectionDetails);

  $('inspection-links').innerHTML = linkButtons([
    [needsFiles ? item.associateInspectionWhatsappUrl : null, filesAvailable ? 'Enviar link para refazer pendências' : 'Enviar link ao associado'],
    [currentPublicUrl, needsFiles && filesAvailable ? 'Abrir link das pendências' : 'Abrir link da vistoria'],
    [filesAvailable && !needsFiles ? (window.NH_URLS?.replaceLinkInCommunicationUrl(item.teamWhatsappUrl, item.publicUrl, currentPublicUrl) || item.teamWhatsappUrl) : null, 'Enviar por WhatsApp'],
    [filesAvailable && !needsFiles ? (window.NH_URLS?.replaceLinkInCommunicationUrl(item.teamEmailUrl, item.publicUrl, currentPublicUrl) || item.teamEmailUrl) : null, 'Enviar por e-mail'],
    [filesAvailable && !needsFiles ? item.associateDecisionWhatsappUrl : null, item.status === 'APPROVED' ? 'Informar aprovação ao associado' : 'Informar recusa ao associado'],
    [!filesAvailable ? (window.NH_URLS?.replaceLinkInCommunicationUrl(item.teamWhatsappUrl, item.publicUrl, currentPublicUrl) || item.teamWhatsappUrl) : null, 'Enviar para a equipe']
  ]);
  renderAdminInspectionFiles(item);
  openDialog('inspection-dialog');
}

function renderAdminInspectionFiles(item) {
  releaseAdminMediaUrls();
  const section = $('admin-inspection-files-section');
  const grid = $('admin-inspection-files-grid');
  const assets = Array.isArray(item.assets) ? item.assets : [];
  const available = assets.filter(asset => asset.available);
  section.hidden = assets.length === 0;
  if (section.hidden) {
    grid.innerHTML = '';
    return;
  }

  $('admin-inspection-files-retention').textContent = available.length
    ? `Os arquivos ficam disponíveis até ${date(item.filesExpireAt)} e são apagados automaticamente após 40 dias.`
    : 'O prazo de 40 dias terminou e os arquivos foram apagados automaticamente.';
  const allButton = $('admin-download-all-files');
  allButton.hidden = available.length === 0;
  allButton.dataset.inspectionId = item.id;

  grid.innerHTML = assets.map(asset => {
    const title = asset.label || ADMIN_ASSET_LABELS[asset.type] || 'Arquivo';
    const image = asset.available && String(asset.contentType || '').startsWith('image/');
    const video = asset.available && String(asset.contentType || '').startsWith('video/');
    const preview = image
      ? `<div class="inspection-media-preview"><span class="inspection-media-loading">Carregando imagem...</span><img data-admin-image-preview="${asset.id}" alt="${esc(title)}" hidden></div>`
      : video
        ? `<div class="inspection-media-preview"><div class="inspection-media-placeholder">▶ Vídeo disponível</div><video data-admin-video-preview="${asset.id}" controls hidden></video></div>`
        : `<div class="inspection-media-preview"><div class="inspection-media-placeholder">${asset.type === 'REPORT' ? 'PDF' : 'DOCUMENTO'}</div></div>`;
    const canDelete = asset.available && ['PHOTO', 'VIDEO', 'SIGNATURE', 'VEHICLE_DOCUMENT', 'IDENTITY_DOCUMENT'].includes(asset.type);
    const actions = asset.available
      ? `<div class="inspection-media-actions">${video ? `<button class="outline" data-admin-play-video="${asset.id}" type="button">Reproduzir</button>` : ''}<button class="secondary" data-admin-download-asset="${asset.id}" data-file-name="${esc(asset.fileName)}" type="button">Baixar</button>${canDelete ? `<button class="danger" data-admin-delete-asset="${asset.id}" data-file-name="${esc(title)}" type="button">Excluir / solicitar novamente</button>` : ''}</div>`
      : `<div class="inspection-media-expired">${adminInspectionNeedsFiles(item) && asset.type !== 'REPORT' ? 'Arquivo excluído / aguardando reenvio.' : 'Arquivo removido após 40 dias.'}</div>`;
    return `<article class="inspection-media-card ${asset.available ? '' : 'expired'}">${preview}<div class="inspection-media-body"><strong>${esc(title)}</strong><small>${esc(asset.fileName)}</small><small>${formatBytes(asset.fileSize)} · ${esc(asset.contentType || 'arquivo')}</small>${actions}</div></article>`;
  }).join('');

  available.filter(asset => String(asset.contentType || '').startsWith('image/')).forEach(asset => loadAdminImagePreview(item.id, asset));
  grid.querySelectorAll('[data-admin-download-asset]').forEach(button => button.addEventListener('click', () => downloadAdminAsset(item.id, button.dataset.adminDownloadAsset, button.dataset.fileName, button)));
  grid.querySelectorAll('[data-admin-play-video]').forEach(button => button.addEventListener('click', () => playAdminVideo(item.id, button.dataset.adminPlayVideo, button)));
  grid.querySelectorAll('[data-admin-delete-asset]').forEach(button => {
    button.addEventListener('click', () => deleteAdminInspectionAsset(
      item.id, button.dataset.adminDeleteAsset, button.dataset.fileName || 'arquivo', button
    ));
  });
}

async function deleteAdminInspectionAsset(inspectionId, assetId, label, button) {
  const confirmed = await confirmAction(
    'Excluir arquivo e solicitar novamente?',
    `O arquivo “${label}” será excluído. Os demais arquivos aceitos serão mantidos e o mesmo link da vistoria passará a pedir somente esta pendência (e qualquer outra que estiver faltando).`,
    'Excluir e solicitar novamente'
  );
  if (!confirmed) return;

  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Excluindo...';
  try {
    await api(`/api/admin/inspections/${encodeURIComponent(inspectionId)}/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
    releaseAdminMediaUrls();
    closeDialog('inspection-dialog');
    await load();
    const updated = inspections.find(item => item.id === inspectionId);
    if (updated) openInspectionAnalysis(inspectionId);
    message('Arquivo excluído. A vistoria foi reaberta e o link agora pede somente os arquivos pendentes.', 'success');
  } catch (error) {
    message(error.message);
    button.disabled = false;
    button.textContent = original;
  }
}

async function loadAdminImagePreview(inspectionId, asset) {
  const image = document.querySelector(`[data-admin-image-preview="${asset.id}"]`);
  if (!image) return;
  const loading = image.parentElement.querySelector('.inspection-media-loading');
  try {
    const blob = await apiBlob(`/api/admin/inspections/${inspectionId}/assets/${asset.id}`);
    const url = URL.createObjectURL(blob);
    adminMediaObjectUrls.add(url);
    image.src = url;
    image.hidden = false;
    if (loading) loading.remove();
  } catch (error) {
    if (loading) loading.textContent = error.message;
  }
}

async function playAdminVideo(inspectionId, assetId, button) {
  const video = document.querySelector(`[data-admin-video-preview="${assetId}"]`);
  if (!video) return;
  button.disabled = true;
  button.textContent = 'Carregando...';
  try {
    const blob = await apiBlob(`/api/admin/inspections/${inspectionId}/assets/${assetId}`);
    const url = URL.createObjectURL(blob);
    adminMediaObjectUrls.add(url);
    video.src = url;
    video.hidden = false;
    video.previousElementSibling?.remove();
    await video.play().catch(() => {});
    button.textContent = 'Vídeo carregado';
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Tentar novamente';
    message(error.message);
  }
}

async function downloadAdminAsset(inspectionId, assetId, fileName, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Baixando...';
  try {
    const blob = await apiBlob(`/api/admin/inspections/${inspectionId}/assets/${assetId}?download=true`);
    triggerAdminDownload(blob, fileName || 'arquivo-vistoria');
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function triggerAdminDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function downloadAllAdminFiles() {
  const id = $('admin-download-all-files').dataset.inspectionId;
  if (!id) return;
  const button = $('admin-download-all-files');
  button.disabled = true;
  button.textContent = 'Preparando pacote...';
  try {
    const blob = await apiBlob(`/api/admin/inspections/${id}/assets.zip`);
    triggerAdminDownload(blob, `arquivos-vistoria-${id}.zip`);
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Baixar todos (.zip)';
  }
}

function detailItems(items) {
  return items.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value ?? '—')}</strong></div>`).join('');
}

function linkButtons(items) {
  return items.filter(([url]) => url).map(([url, label]) => `<a class="button outline" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`).join('');
}


function vehicleCategoryGroupState(group) {
  const members = categories.filter(item => group.categoryCodes.includes(item.code));
  const activeCount = members.filter(item => item.active).length;
  return {
    members,
    active: members.length > 0 && activeCount === members.length,
    partial: activeCount > 0 && activeCount < members.length
  };
}

function renderVehicleCategories() {
  $('vehicle-categories-body').innerHTML = VEHICLE_CATEGORY_GROUPS.map(group => {
    const state = vehicleCategoryGroupState(group);
    const status = state.partial
      ? statusBadge('Parcial', 'warn')
      : statusBadge(state.active ? 'Ativa' : 'Desativada', state.active ? 'ok' : 'off');
    return `<tr>
      <td><strong class="catalog-name">${esc(group.name)}</strong></td>
      <td>${status}</td>
      <td><button class="${state.active ? 'outline' : 'secondary'} small-button" data-vehicle-category-toggle="${esc(group.code)}" type="button">${state.active ? 'Desativar' : 'Ativar'}</button></td>
    </tr>`;
  }).join('') || emptyRow(3, 'Nenhuma categoria encontrada.');

  document.querySelectorAll('[data-vehicle-category-toggle]').forEach(button =>
    button.addEventListener('click', () => toggleVehicleCategory(button.dataset.vehicleCategoryToggle))
  );
}

async function toggleVehicleCategory(groupCode) {
  const group = VEHICLE_CATEGORY_GROUPS.find(item => item.code === groupCode);
  if (!group) return;
  const state = vehicleCategoryGroupState(group);
  if (!state.members.length) return message('A categoria não foi encontrada no catálogo.');
  const nextActive = !state.active;

  if (!nextActive) {
    const confirmed = await confirmAction(
      'Desativar categoria?',
      `${group.name} deixará de aparecer como botão em novas cotações. Planos, valores e histórico continuarão salvos.`,
      'Desativar categoria'
    );
    if (!confirmed) return;
  }

  try {
    await Promise.all(state.members.map(item => api(`/api/admin/catalog/categories/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: nextActive })
    })));
    message(nextActive ? 'Categoria ativada.' : 'Categoria desativada.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

function renderPlans() {
  $('plans-body').innerHTML = plans.map(item => `<tr>
    <td><strong class="catalog-name">${esc(item.name)}</strong></td><td>${esc(item.category)}</td><td>${esc(regionLabel(item.region))}</td>
    <td>${esc(motorcycleOriginLabel(item.motorcycleOrigin))}</td><td>${esc(item.subtitle || '—')}</td><td>${item.displayOrder}</td><td>${statusBadge(item.active ? 'Ativo' : 'Inativo', item.active ? 'ok' : 'off')}</td>
    <td><div class="row-actions">
      <button class="secondary small-button" data-plan-edit="${item.id}" type="button">Editar tudo</button>
      <button class="outline small-button" data-plan-toggle="${item.id}" type="button">${item.active ? 'Desativar' : 'Ativar'}</button>
      <button class="danger small-button" data-plan-delete="${item.id}" type="button">Excluir</button>
    </div></td>
  </tr>`).join('') || emptyRow(8, 'Nenhum plano cadastrado.');
  document.querySelectorAll('[data-plan-edit]').forEach(button => button.addEventListener('click', () => openPlanModal(Number(button.dataset.planEdit))));
  document.querySelectorAll('[data-plan-toggle]').forEach(button => button.addEventListener('click', () => togglePlan(Number(button.dataset.planToggle))));
  document.querySelectorAll('[data-plan-delete]').forEach(button => button.addEventListener('click', () => deletePlan(Number(button.dataset.planDelete))));
}

function openPlanModal(id = null) {
  const item = plans.find(value => value.id === id);
  $('plan-id').value = item?.id || '';
  $('plan-name').value = item?.name || '';
  $('plan-category').value = item?.categoryId || categories[0]?.id || '';
  $('plan-region').value = 'NATIONAL';
  $('plan-motorcycle-origin').value = item?.motorcycleOrigin || 'NORTHEAST';
  $('plan-subtitle').value = item?.subtitle || '';
  syncPlanMotorcycleOrigin();
  $('plan-order').value = item?.displayOrder ?? 100;
  $('plan-active').value = String(item?.active ?? true);
  setOptionalMoney('plan-extra-above', item?.extraAbove);
  setOptionalMoney('plan-extra-step', item?.extraStep);
  setOptionalMoney('plan-extra-increment', item?.extraIncrement);
  setOptionalMoney('plan-extra-base-price', item?.extraBasePrice);
  setOptionalMoney('plan-tracker-required-above', item?.trackerRequiredAbove);
  setOptionalMoney('plan-tracker-installation-fee', item?.trackerInstallationFee);
  setOptionalMoney('plan-tracker-monthly-fee', item?.trackerMonthlyFee);
  $('plan-dialog-title').textContent = item ? 'Editar todos os dados do plano' : 'Novo plano ou pacote';
  openDialog('plan-dialog');
}


function syncPlanMotorcycleOrigin() {
  const categoryId = Number($('plan-category').value);
  const category = categories.find(item => Number(item.id) === categoryId);
  const promotionalMotorcycle = category?.code === 'MOTORCYCLE_PROMO_2026';
  const motorcycle = Boolean(category?.code?.startsWith('MOTORCYCLE')) && !promotionalMotorcycle;
  $('plan-motorcycle-origin-field').hidden = !motorcycle;
  $('plan-motorcycle-origin').required = motorcycle;
  if (!motorcycle) $('plan-motorcycle-origin').value = 'NORTHEAST';
}

async function togglePlan(id) {
  const item = plans.find(value => value.id === id);
  if (!item) return;
  if (item.active) {
    const confirmed = await confirmAction(
      'Desativar plano?',
      `${item.name} deixará de aparecer em novas cotações. Os valores, coberturas e cotações antigas permanecerão salvos.`,
      'Desativar plano'
    );
    if (!confirmed) return;
  }
  try {
    await api(`/api/admin/catalog/plans/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.name, subtitle: item.subtitle || '', categoryId: item.categoryId,
        region: 'NATIONAL', motorcycleOrigin: item.motorcycleOrigin || null,
        displayOrder: item.displayOrder, active: !item.active,
        extraAbove: item.extraAbove, extraStep: item.extraStep, extraIncrement: item.extraIncrement,
        extraBasePrice: item.extraBasePrice, trackerRequiredAbove: item.trackerRequiredAbove,
        trackerInstallationFee: item.trackerInstallationFee, trackerMonthlyFee: item.trackerMonthlyFee
      })
    });
    message(item.active ? 'Plano desativado.' : 'Plano ativado.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

async function deletePlan(id) {
  const item = plans.find(value => value.id === id);
  if (!item) return;
  const ranges = prices.filter(value => value.planId === id).length;
  const planCoverages = coverages.filter(value => value.planId === id).length;
  const confirmed = await confirmAction(
    'Excluir plano completamente?',
    `${item.name} e suas ${ranges} faixas de valor e ${planCoverages} coberturas serão removidos das novas cotações. Cotações antigas continuarão salvas.`,
    'Excluir plano'
  );
  if (!confirmed) return;
  try {
    await api(`/api/admin/catalog/plans/${id}`, { method: 'DELETE' });
    message('Plano excluído completamente.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

function openPromotionalMotorcyclePriceModal(id) {
  const item = promotionalMotorcyclePrices.find(value => value.id === id);
  if (!item) return;
  $('promo-motorcycle-price-id').value = item.id;
  $('promo-motorcycle-price-label').value = item.label || '';
  $('promo-motorcycle-price-min-fipe').value = moneyInput(item.minFipe ?? 0);
  $('promo-motorcycle-price-max-fipe').value = item.maxFipe == null ? '' : moneyInput(item.maxFipe);
  $('promo-motorcycle-price-min-cc').value = item.minCc ?? '';
  $('promo-motorcycle-price-max-cc').value = item.maxCc ?? '';
  $('promo-motorcycle-price-monthly').value = moneyInput(item.monthlyPrice);
  window.NHMoney?.refresh($('promo-motorcycle-price-min-fipe'));
  window.NHMoney?.refresh($('promo-motorcycle-price-max-fipe'));
  window.NHMoney?.refresh($('promo-motorcycle-price-monthly'));
  openDialog('promo-motorcycle-price-dialog');
}

function promotionalMotorcyclePlan() {
  const promotionalCategoryIds = new Set(
    categories.filter(item => item.code === 'MOTORCYCLE_PROMO_2026').map(item => Number(item.id))
  );
  return plans.find(item => promotionalCategoryIds.has(Number(item.categoryId))) || null;
}

function renderPrices() {
  const filter = $('price-filter').value.trim().toLowerCase();
  const selectedPlan = $('price-plan-filter').value;
  const promoPlan = promotionalMotorcyclePlan();
  const promoPlanId = promoPlan ? String(promoPlan.id) : null;

  const regularRows = prices
    .filter(item => {
      // A tabela promocional usa as três faixas fixas próprias; não mistura faixas FIPE comuns.
      if (promoPlanId && String(item.planId) === promoPlanId) return false;
      if (selectedPlan && String(item.planId) !== selectedPlan) return false;
      return `${item.planName} ${item.category} ${item.region} ${regionLabel(item.region)} ${item.motorcycleOrigin || ''} ${motorcycleOriginLabel(item.motorcycleOrigin)}`.toLowerCase().includes(filter);
    })
    .map(item => `<tr>
      <td><strong class="catalog-name">${esc(item.planName)}</strong></td><td>${esc(item.category)}</td><td>${esc(regionLabel(item.region))}<small class="table-code">${esc(motorcycleOriginLabel(item.motorcycleOrigin))}</small></td>
      <td>${brl.format(item.minValue)} a ${brl.format(item.maxValue)}</td><td><strong>${brl.format(item.monthlyPrice)}</strong></td>
      <td><div class="row-actions"><button class="secondary small-button" data-price-edit="${item.id}" type="button">Editar</button><button class="danger small-button" data-price-delete="${item.id}" type="button">Excluir</button></div></td>
    </tr>`);

  const promoRows = (!promoPlan || (selectedPlan && selectedPlan !== promoPlanId)) ? [] : promotionalMotorcyclePrices
    .filter(item => `${promoPlan.name} ${promoPlan.category} nacional ${item.label} ${item.minCc} ${item.maxCc} ${item.minFipe ?? ''} ${item.maxFipe ?? ''}`.toLowerCase().includes(filter))
    .map(item => `<tr>
      <td><strong class="catalog-name">${esc(promoPlan.name)}</strong></td>
      <td>${esc(promoPlan.category)}</td>
      <td>${esc(regionLabel(promoPlan.region))}<small class="table-code">${esc(motorcycleOriginLabel(promoPlan.motorcycleOrigin))}</small></td>
      <td>${item.minFipe != null || item.maxFipe != null
        ? `${brl.format(Number(item.minFipe || 0))} a ${item.maxFipe == null ? 'sem limite' : brl.format(item.maxFipe)}<small class="table-code">${esc(item.label)} · ${item.minCc}cc a ${item.maxCc}cc</small>`
        : esc(item.label)}</td>
      <td><strong>${brl.format(item.monthlyPrice)}</strong></td>
      <td><div class="row-actions"><button class="secondary small-button" data-promo-motorcycle-price-edit="${item.id}" type="button">Editar</button><button class="danger small-button" data-promo-motorcycle-price-delete="${item.id}" type="button">Excluir</button></div></td>
    </tr>`);

  const rows = [...promoRows, ...regularRows];
  $('prices-body').innerHTML = rows.join('') || emptyRow(6, 'Nenhuma faixa de valor encontrada.');

  document.querySelectorAll('[data-price-edit]').forEach(button => button.addEventListener('click', () => openPriceModal(Number(button.dataset.priceEdit))));
  document.querySelectorAll('[data-price-delete]').forEach(button => button.addEventListener('click', () => deletePrice(Number(button.dataset.priceDelete))));
  document.querySelectorAll('[data-promo-motorcycle-price-edit]').forEach(button =>
    button.addEventListener('click', () => openPromotionalMotorcyclePriceModal(Number(button.dataset.promoMotorcyclePriceEdit)))
  );
  document.querySelectorAll('[data-promo-motorcycle-price-delete]').forEach(button =>
    button.addEventListener('click', () => deletePromotionalMotorcyclePrice(Number(button.dataset.promoMotorcyclePriceDelete)))
  );
}

async function deletePromotionalMotorcyclePrice(id) {
  const item = promotionalMotorcyclePrices.find(value => value.id === id);
  if (!item) return;
  const confirmed = await confirmAction(
    'Excluir faixa promocional?',
    `${item.label} — ${brl.format(item.monthlyPrice)} será removida da Tabela Promocional 2026 e deixará de ser oferecida nas novas cotações.`,
    'Excluir faixa'
  );
  if (!confirmed) return;
  try {
    await api(`/api/admin/catalog/promotional-motorcycle-prices/${id}`, { method: 'DELETE' });
    message('Faixa promocional excluída.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

function openPriceModal(id = null) {
  const item = prices.find(value => value.id === id);
  $('price-id').value = item?.id || '';
  $('price-plan').value = item?.planId || plans[0]?.id || '';
  $('price-plan').disabled = Boolean(item);
  $('price-min').value = item ? moneyInput(item.minValue) : '';
  $('price-max').value = item ? moneyInput(item.maxValue) : '';
  $('price-monthly').value = item ? moneyInput(item.monthlyPrice) : '';
  $('price-dialog-title').textContent = item ? 'Editar faixa de valor' : 'Nova faixa de valor';
  openDialog('price-dialog');
}

async function deletePrice(id) {
  const item = prices.find(value => value.id === id);
  if (!item) return;
  const confirmed = await confirmAction(
    'Excluir faixa de valor?',
    `${item.planName}: ${brl.format(item.minValue)} a ${brl.format(item.maxValue)} será removida.`,
    'Excluir faixa'
  );
  if (!confirmed) return;
  try {
    await api(`/api/admin/catalog/prices/${id}`, { method: 'DELETE' });
    message('Faixa de valor excluída.', 'success');
    await load();
  } catch (error) { message(error.message); }
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
    <td><strong class="catalog-name">${esc(item.planName)}</strong><small class="table-code">${esc(regionLabel(item.region))} · ${esc(motorcycleOriginLabel(item.motorcycleOrigin))}</small></td>
    <td><strong class="catalog-name">${esc(item.coverageName)}</strong></td><td>${coverageBadge(item.status)}</td><td>${esc(item.detail || '—')}</td>
    <td>${item.status === 'OPTIONAL' ? brl.format(item.monthlyPrice || 0) : '—'}</td><td>${item.sortOrder}</td>
    <td><div class="row-actions"><button class="secondary small-button" data-coverage-edit="${item.id}" type="button">Editar</button><button class="danger small-button" data-coverage-delete="${item.id}" type="button">Excluir</button></div></td>
  </tr>`).join('') || emptyRow(7, 'Nenhuma cobertura encontrada.');
  document.querySelectorAll('[data-coverage-edit]').forEach(button => button.addEventListener('click', () => openCoverageModal(Number(button.dataset.coverageEdit))));
  document.querySelectorAll('[data-coverage-delete]').forEach(button => button.addEventListener('click', () => deleteCoverage(Number(button.dataset.coverageDelete))));
}

function openCoverageModal(id = null) {
  const item = coverages.find(value => value.id === id);
  $('coverage-id').value = item?.id || '';
  $('coverage-plan').value = item?.planId || plans[0]?.id || '';
  $('coverage-plan').disabled = false;
  $('coverage-name').value = item?.coverageName || '';
  $('coverage-status').value = item?.status || 'INCLUDED';
  $('coverage-order').value = item?.sortOrder ?? 100;
  $('coverage-detail').value = item?.detail || '';
  $('coverage-price').value = item?.monthlyPrice == null ? '' : moneyInput(item.monthlyPrice);
  $('coverage-dialog-title').textContent = item ? 'Editar cobertura ou opcional' : 'Nova cobertura ou opcional';
  syncCoveragePrice();
  openDialog('coverage-dialog');
}

function syncCoveragePrice() {
  const optional = $('coverage-status').value === 'OPTIONAL';
  $('coverage-price').disabled = !optional;
  if (!optional) $('coverage-price').value = '';
}

async function deleteCoverage(id) {
  const item = coverages.find(value => value.id === id);
  if (!item) return;
  const confirmed = await confirmAction(
    'Excluir cobertura ou opcional?',
    `${item.coverageName} será removido do plano ${item.planName}. Cotações antigas continuarão com os dados registrados na emissão.`,
    'Excluir cobertura'
  );
  if (!confirmed) return;
  try {
    await api(`/api/admin/catalog/coverages/${id}`, { method: 'DELETE' });
    message('Cobertura ou opcional excluído.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

function renderSettings() {
  const email = settings.teamEmail || 'Não configurado';
  const whatsapp = formatPhone(settings.teamWhatsapp) || 'Não configurado';
  $('settings-team-email').textContent = email;
  $('settings-team-whatsapp').textContent = whatsapp;
  $('settings-updated-at').textContent = settings.updatedAt ? `${date(settings.updatedAt)} por ${settings.updatedBy || '—'}` : '—';

  $('settings-regulation-file').textContent = regulationDocument.fileName || 'Regulamento padrão';
  $('settings-regulation-size').textContent = formatBytes(regulationDocument.fileSize || 0);
  $('settings-regulation-source').textContent = regulationDocument.customized ? 'Enviado pelo Admin' : 'Arquivo padrão do projeto';
  $('settings-regulation-updated-at').textContent = regulationDocument.updatedAt
    ? `${date(regulationDocument.updatedAt)} por ${regulationDocument.updatedBy || '—'}`
    : 'Arquivo padrão do projeto';
}

function openSettingsModal() {
  $('settings-email-input').value = settings.teamEmail || '';
  $('settings-whatsapp-input').value = settings.teamWhatsapp || '';
  openDialog('settings-dialog');
}

const AUDIT_FIELD_LABELS = Object.freeze({
  plano: 'Plano', nome: 'Nome', categoria: 'Categoria', abrangência: 'Abrangência', origemMoto: 'Origem da moto',
  subtítulo: 'Subtítulo', ordem: 'Ordem de exibição', ativo: 'Situação', mínimo: 'Valor FIPE mínimo', máximo: 'Valor FIPE máximo',
  mensal: 'Mensalidade', extraAcima: 'Aplicar adicional acima de', extraIntervalo: 'Intervalo do adicional',
  extraAcréscimo: 'Acréscimo por intervalo', extraBase: 'Mensalidade-base', rastreadorAcima: 'Rastreador obrigatório acima de',
  rastreadorInstalação: 'Instalação do rastreador', rastreadorMensal: 'Mensalidade do rastreador', status: 'Status',
  detalhe: 'Detalhe', observação: 'Observação', origem: 'Origem', 'e-mail': 'E-mail', whatsapp: 'WhatsApp',
  faixas: 'Faixas de preço', coberturas: 'Coberturas'
});

const AUDIT_VALUE_LABELS = Object.freeze({
  NATIONAL: 'Nacional', NORTHEAST: 'Demais cidades do Nordeste', CAPITAL: 'Capital',
  INCLUDED: 'Incluído', NOT_INCLUDED: 'Não incluído', OPTIONAL: 'Serviço opcional',
  WAITING_FILES: 'Aguardando arquivos', UPLOADING_FILES: 'Envio em andamento', CREATED: 'Pendente', UNDER_REVIEW: 'Em análise', ACCEPTED: 'Aceita', DECLINED: 'Recusada',
  COMPLETED: 'Material enviado', APPROVED: 'Aprovada', REJECTED: 'Recusada', CANCELLED: 'Cancelada', EXPIRED: 'Expirada',
  CREATED_IN_PORTAL: 'Criado pelo portal', IMPORTED: 'Importado', SELF_SERVICE: 'Cliente pelo site', CONSULTANT: 'Consultor'
});

const AUDIT_MONEY_FIELDS = new Set([
  'mínimo', 'máximo', 'mensal', 'extraAcima', 'extraIntervalo', 'extraAcréscimo', 'extraBase',
  'rastreadorAcima', 'rastreadorInstalação', 'rastreadorMensal'
]);

function parseAuditText(value) {
  if (value == null || String(value).trim() === '' || String(value).trim() === '—') return { entries: [], raw: '' };
  const raw = String(value).trim();
  const entries = raw.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const separator = part.indexOf('=');
    if (separator < 0) return { key: '', value: part };
    return { key: part.slice(0, separator).trim(), value: part.slice(separator + 1).trim() };
  });
  return { entries, raw };
}

function normalizedAuditValue(value) {
  const text = String(value ?? '').trim();
  if (/^-?\d+(?:[.,]\d+)?$/.test(text)) return String(Number(text.replace(',', '.')));
  return text.toLowerCase();
}

function auditValuesEqual(left, right) {
  return normalizedAuditValue(left) === normalizedAuditValue(right);
}

function auditFieldLabel(key) {
  return AUDIT_FIELD_LABELS[key] || key.replace(/([a-zá-ú])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
}

function auditValueLabel(key, value) {
  const text = String(value ?? '').trim();
  if (!text || text === '—' || text.toLowerCase() === 'null') return 'Não informado';
  if (AUDIT_MONEY_FIELDS.has(key) && /^-?\d+(?:[.,]\d+)?$/.test(text)) return brl.format(Number(text.replace(',', '.')));
  if (key === 'ativo') return text.toLowerCase() === 'true' ? 'Ativo' : text.toLowerCase() === 'false' ? 'Inativo' : text;
  if (key === 'whatsapp') return formatPhone(text) || text;
  return AUDIT_VALUE_LABELS[text] || text;
}

function auditChangeRows(item) {
  const hasNumericValues = item.oldText == null && item.newText == null && (item.oldValue != null || item.newValue != null);
  if (hasNumericValues) {
    const previous = item.oldValue == null ? 'Não havia valor' : brl.format(Number(item.oldValue));
    const next = item.newValue == null ? 'Valor removido' : brl.format(Number(item.newValue));
    return `<div class="audit-change-row"><span class="audit-field-label">Valor</span><div class="audit-change-values"><span class="audit-before">${esc(previous)}</span><span class="audit-arrow" aria-hidden="true">→</span><span class="audit-after">${esc(next)}</span></div></div>`;
  }

  const oldText = item.oldText ?? null;
  const newText = item.newText ?? null;
  const before = parseAuditText(oldText);
  const after = parseAuditText(newText);

  if (!before.entries.length && !after.entries.length) return '';

  const beforeMap = new Map(before.entries.filter(entry => entry.key).map(entry => [entry.key, entry.value]));
  const afterMap = new Map(after.entries.filter(entry => entry.key).map(entry => [entry.key, entry.value]));
  const hasStructuredData = beforeMap.size || afterMap.size;

  if (!hasStructuredData) {
    const previous = before.raw ? auditValueLabel('', before.raw) : 'Não havia dados';
    const next = after.raw ? auditValueLabel('', after.raw) : 'Registro removido';
    return `<div class="audit-change-row"><span class="audit-field-label">Alteração</span><div class="audit-change-values"><span class="audit-before">${esc(previous)}</span><span class="audit-arrow" aria-hidden="true">→</span><span class="audit-after">${esc(next)}</span></div></div>`;
  }

  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])];
  const changedKeys = beforeMap.size && afterMap.size
    ? keys.filter(key => !auditValuesEqual(beforeMap.get(key), afterMap.get(key)))
    : keys;

  if (!changedKeys.length) {
    return '<div class="audit-no-change">O registro foi salvo sem alteração visível nos dados.</div>';
  }

  return changedKeys.map(key => {
    const hasBefore = beforeMap.has(key);
    const hasAfter = afterMap.has(key);
    const previous = hasBefore ? auditValueLabel(key, beforeMap.get(key)) : 'Não havia dados';
    const next = hasAfter ? auditValueLabel(key, afterMap.get(key)) : 'Removido';
    const values = hasBefore && hasAfter
      ? `<span class="audit-before">${esc(previous)}</span><span class="audit-arrow" aria-hidden="true">→</span><span class="audit-after">${esc(next)}</span>`
      : hasAfter
        ? `<span class="audit-after audit-single-value">${esc(next)}</span>`
        : `<span class="audit-before audit-single-value">${esc(previous)}</span>`;
    return `<div class="audit-change-row"><span class="audit-field-label">${esc(auditFieldLabel(key))}</span><div class="audit-change-values">${values}</div></div>`;
  }).join('');
}

function auditActionKind(description = '') {
  const value = description.toLowerCase();
  if (value.includes('exclu') || value.includes('recus') || value.includes('cancel')) return 'danger';
  if (value.includes('criad') || value.includes('cadastr') || value.includes('aprov')) return 'success';
  return 'update';
}

function renderAudit() {
  const filter = $('audit-filter').value.trim().toLowerCase();
  const filtered = auditEntries.filter(item => {
    return `${item.itemType} ${item.description} ${item.changedBy} ${item.itemKey || ''} ${item.oldText || ''} ${item.newText || ''}`.toLowerCase().includes(filter);
  });

  $('audit-list').innerHTML = filtered.map(item => {
    const typeLabel = AUDIT_TYPE_LABELS[item.itemType] || item.itemType || 'Alteração';
    const administrator = item.changedBy || 'Sistema';
    const changes = auditChangeRows(item);
    const kind = auditActionKind(item.description);
    return `<article class="audit-card audit-card-${kind}">
      <div class="audit-card-head">
        <div class="audit-card-title">
          <span class="audit-type-badge">${esc(typeLabel)}</span>
          <div><h3>${esc(item.description || 'Alteração administrativa')}</h3><time datetime="${esc(item.changedAt || '')}">${esc(date(item.changedAt))}</time></div>
        </div>
        <div class="audit-admin"><span>Responsável</span><strong>${esc(administrator)}</strong></div>
      </div>
      ${changes ? `<details class="audit-details"><summary>Ver detalhes da alteração</summary><div class="audit-change-list">${changes}</div></details>` : ''}
    </article>`;
  }).join('') || '<div class="audit-empty">Nenhum registro de auditoria encontrado.</div>';
}

function populatePlanSelects() {
  const options = plans.map(item => `<option value="${item.id}">${esc(item.name)} — ${esc(regionLabel(item.region))}${item.motorcycleOrigin ? ` · ${esc(motorcycleOriginLabel(item.motorcycleOrigin))}` : ''}</option>`).join('');
  const allOptions = `<option value="">Todos os planos</option>${options}`;
  const currentPriceFilter = $('price-plan-filter').value;
  const currentCoverageFilter = $('coverage-plan-filter').value;
  $('price-plan-filter').innerHTML = allOptions;
  $('coverage-plan-filter').innerHTML = allOptions;
  $('price-plan').innerHTML = options;
  $('coverage-plan').innerHTML = options;
  if ([...$('price-plan-filter').options].some(option => option.value === currentPriceFilter)) $('price-plan-filter').value = currentPriceFilter;
  if ([...$('coverage-plan-filter').options].some(option => option.value === currentCoverageFilter)) $('coverage-plan-filter').value = currentCoverageFilter;
}

function populateCategorySelect() {
  const current = $('plan-category').value;
  $('plan-category').innerHTML = categories.map(item => `<option value="${item.id}">${esc(item.name)}${item.active ? '' : ' — desativada'}</option>`).join('');
  if ([...$('plan-category').options].some(option => option.value === current)) $('plan-category').value = current;
}

function sourceLabel(source) {
  if (source === 'ADMIN') return 'Painel administrativo';
  if (source === 'PORTAL') return 'Área do colaborador';
  if (source === 'IMPORTED') return 'Lista importada';
  return source || '—';
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return `+${digits}`;
}

$('admin-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const box = $('admin-login-message');
  box.className = '';
  box.textContent = '';
  try {
    const response = await fetch(window.NH_API?.backend('/api/auth/login') || '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('admin-username').value.trim(), password: $('admin-password').value })
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

$('consultant-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('consultant-id').value;
  try {
    if (id) {
      const current = consultants.find(item => item.id === id);
      const nextActive = $('consultant-active').checked;
      if (current?.active && !nextActive) {
        const confirmed = await confirmAction(
          'Desativar consultor?',
          `${current.name} deixará de aparecer na seleção de novas atividades. Todo o histórico será mantido.`,
          'Desativar consultor'
        );
        if (!confirmed) return;
      }
      await api(`/api/admin/consultants/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('consultant-name').value.trim(), active: nextActive })
      });
      message('Consultor atualizado.', 'success');
    } else {
      await api('/api/admin/consultants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('consultant-name').value.trim() })
      });
      message('Consultor cadastrado.', 'success');
    }
    closeDialog('consultant-dialog');
    await load();
  } catch (error) { message(error.message); }
});


$('user-role').addEventListener('change', syncUserRoleFields);
$('user-consultant').addEventListener('change', syncUserConsultantMode);

$('user-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('user-id').value;
  const role = $('user-role').value;
  const consultantChoice = $('user-consultant').value;
  const payload = {
    username: $('user-username').value.trim(),
    displayName: $('user-display-name').value.trim() || $('user-username').value.trim(),
    role
  };

  if (role === 'CONSULTANT') {
    if (consultantChoice === '__NEW__') {
      payload.newConsultantName = $('user-new-consultant-name').value.trim();
      if (!payload.newConsultantName) return message('Informe o nome do novo consultor.');
    } else if (consultantChoice === '__LEGACY__') {
      payload.consultantId = null;
    } else if (consultantChoice) {
      payload.consultantId = consultantChoice;
    } else {
      return message('Selecione um consultor existente ou cadastre um novo consultor.');
    }
  }

  try {
    if (id) {
      payload.active = $('user-active').checked;
      await api(`/api/admin/users/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      message('Usuário atualizado.', 'success');
    } else {
      payload.password = $('user-password').value;
      await api('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      message(role === 'CONSULTANT'
        ? 'Usuário criado e consultor vinculado com sucesso.'
        : 'Usuário analista criado com sucesso.', 'success');
    }
    closeDialog('user-dialog');
    await load();
  } catch (error) { message(error.message); }
});

$('password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('password-user-id').value;
  const password = $('password-new').value;
  if (password !== $('password-confirm').value) return message('As senhas informadas não são iguais.');
  try {
    await api(`/api/admin/users/${id}/password`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
    });
    closeDialog('password-dialog');
    message('Senha alterada com sucesso.', 'success');
    await load();
  } catch (error) { message(error.message); }
});

$('plan-category').addEventListener('change', syncPlanMotorcycleOrigin);

$('plan-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('plan-id').value;
  const payload = {
    name: $('plan-name').value.trim(), subtitle: $('plan-subtitle').value.trim(),
    categoryId: Number($('plan-category').value), region: 'NATIONAL',
    motorcycleOrigin: $('plan-motorcycle-origin-field').hidden ? null : $('plan-motorcycle-origin').value,
    displayOrder: Number($('plan-order').value), active: $('plan-active').value === 'true',
    extraAbove: optionalMoney('plan-extra-above'), extraStep: optionalMoney('plan-extra-step'),
    extraIncrement: optionalMoney('plan-extra-increment'), extraBasePrice: optionalMoney('plan-extra-base-price'),
    trackerRequiredAbove: optionalMoney('plan-tracker-required-above'),
    trackerInstallationFee: optionalMoney('plan-tracker-installation-fee'),
    trackerMonthlyFee: optionalMoney('plan-tracker-monthly-fee')
  };
  try {
    const current = id ? plans.find(item => String(item.id) === id) : null;
    if (current?.active && !payload.active) {
      const confirmed = await confirmAction(
        'Desativar plano?',
        `${current.name} deixará de aparecer em novas cotações. As cotações antigas continuarão salvas.`,
        'Desativar plano'
      );
      if (!confirmed) return;
    }
    await api(id ? `/api/admin/catalog/plans/${id}` : '/api/admin/catalog/plans', {
      method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    closeDialog('plan-dialog');
    message(id ? 'Plano atualizado.' : 'Plano criado.', 'success');
    await load();
  } catch (error) { message(error.message); }
});

$('promo-motorcycle-price-delete').addEventListener('click', async () => {
  const id = Number($('promo-motorcycle-price-id').value);
  if (!id) return;
  closeDialog('promo-motorcycle-price-dialog');
  await deletePromotionalMotorcyclePrice(id);
});

$('promo-motorcycle-price-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('promo-motorcycle-price-id').value;
  const minCc = Number($('promo-motorcycle-price-min-cc').value);
  const maxCc = Number($('promo-motorcycle-price-max-cc').value);
  const minFipe = parseMoney($('promo-motorcycle-price-min-fipe').value);
  const maxFipeRaw = $('promo-motorcycle-price-max-fipe').value.trim();
  const maxFipe = maxFipeRaw ? parseMoney(maxFipeRaw) : null;
  const monthlyPrice = parseMoney($('promo-motorcycle-price-monthly').value);

  if (!Number.isInteger(minCc) || !Number.isInteger(maxCc) || minCc < 1 || maxCc < minCc) {
    message('Confira as cilindradas mínima e máxima da faixa.');
    return;
  }
  if (!Number.isFinite(minFipe) || minFipe < 0 || (maxFipe != null && (!Number.isFinite(maxFipe) || maxFipe <= 0 || maxFipe < minFipe))) {
    message('Confira os valores FIPE mínimo e máximo da faixa. O máximo pode ficar vazio quando não houver limite.');
    return;
  }
  if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
    message('Informe uma mensalidade válida.');
    return;
  }

  try {
    await api(`/api/admin/catalog/promotional-motorcycle-prices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: $('promo-motorcycle-price-label').value.trim(),
        minCc,
        maxCc,
        minFipe,
        maxFipe,
        monthlyPrice
      })
    });
    closeDialog('promo-motorcycle-price-dialog');
    message('Faixa promocional atualizada.', 'success');
    await load();
  } catch (error) { message(error.message); }
});

$('price-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('price-id').value;
  const base = {
    minValue: parseMoney($('price-min').value), maxValue: parseMoney($('price-max').value),
    monthlyPrice: parseMoney($('price-monthly').value)
  };
  const payload = id ? base : { ...base, planId: Number($('price-plan').value) };
  try {
    await api(id ? `/api/admin/catalog/prices/${id}` : '/api/admin/catalog/prices', {
      method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    closeDialog('price-dialog');
    message(id ? 'Faixa de valor atualizada.' : 'Faixa de valor criada.', 'success');
    await load();
  } catch (error) { message(error.message); }
});

$('coverage-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('coverage-id').value;
  const status = $('coverage-status').value;
  const base = {
    coverageName: $('coverage-name').value.trim(), status,
    detail: $('coverage-detail').value.trim(),
    monthlyPrice: status === 'OPTIONAL' ? parseMoney($('coverage-price').value) : null,
    sortOrder: Number($('coverage-order').value)
  };
  const payload = id ? { ...base, planId: Number($('coverage-plan').value) } : base;
  const path = id ? `/api/admin/catalog/coverages/${id}` : `/api/admin/catalog/plans/${$('coverage-plan').value}/coverages`;
  try {
    await api(path, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    closeDialog('coverage-dialog');
    message(id ? 'Cobertura atualizada.' : 'Cobertura criada.', 'success');
    await load();
  } catch (error) { message(error.message); }
});

$('quote-analysis-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('quote-analysis-id').value;
  const item = quotes.find(value => value.id === id);
  try {
    if (item?.origin === 'SELF_SERVICE') {
      const consultantSelect = $('quote-analysis-consultant');
      const selectedConsultantId = consultantSelect.value;
      const originalConsultantId = consultantSelect.dataset.originalConsultantId || '';
      if (selectedConsultantId && selectedConsultantId !== originalConsultantId) {
        await api(`/api/admin/quotes/${id}/consultant`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consultantId: selectedConsultantId })
        });
      }
    }

    await api(`/api/admin/quotes/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: $('quote-analysis-status').value, adminNote: $('quote-analysis-note').value.trim() })
    });
    closeDialog('quote-dialog');
    message('Análise da cotação salva.', 'success');
    await load();
  } catch (error) { message(error.message); }
});

$('public-quote-assignment-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const enabled = $('public-quote-assignment-enabled').checked;
    publicQuoteAssignmentSettings = await api('/api/admin/settings/public-quote-assignment', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled })
    });
    renderPublicQuoteAssignmentSettings();
    message(enabled
      ? 'Distribuição automática ativada. Novas cotações do site irão para o último consultor logado.'
      : 'Distribuição automática desativada. Novas cotações do site ficarão aguardando atribuição do Admin.', 'success');
    await load();
  } catch (error) { message(error.message); }
});

$('inspection-analysis-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('inspection-analysis-id').value;
  try {
    await api(`/api/admin/inspections/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: $('inspection-analysis-status').value, adminNote: $('inspection-analysis-note').value.trim() })
    });
    closeDialog('inspection-dialog');
    message('Análise do Retrato NH salva.', 'success');
    await load();
  } catch (error) { message(error.message); }
});

$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const teamEmail = $('settings-email-input').value.trim();
    const teamWhatsapp = $('settings-whatsapp-input').value.replace(/\D/g, '');
    settings = await api('/api/admin/settings/communications', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamEmail, teamWhatsapp })
    });
    closeDialog('settings-dialog');
    message('Destinos de envio atualizados.', 'success');
    await load();
  } catch (error) { message(error.message); }
});

$('regulation-upload-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('settings-regulation-input');
  const file = input.files?.[0];
  if (!file) {
    message('Selecione o novo regulamento em PDF.');
    return;
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    message('O regulamento precisa estar em formato PDF.');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    message('O regulamento deve ter no máximo 20 MB.');
    return;
  }

  const button = $('settings-regulation-save');
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = 'Enviando PDF...';
  try {
    const formData = new FormData();
    formData.append('file', file, file.name);
    regulationDocument = await api('/api/admin/settings/regulation', { method: 'PUT', body: formData });
    input.value = '';
    renderSettings();
    message('Regulamento atualizado. O botão do site já está usando o novo PDF.', 'success');
    await load();
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
});

$('logout').addEventListener('click', () => showLogin());
$('new-consultant-button').addEventListener('click', () => openConsultantModal());
$('new-user-button').addEventListener('click', () => openUserModal());
$('delete-all-quotes').addEventListener('click', deleteAllQuotes);
$('delete-all-inspections').addEventListener('click', deleteAllAllowedInspections);
$('new-plan-button').addEventListener('click', () => openPlanModal());
$('new-price-button').addEventListener('click', () => openPriceModal());
$('new-coverage-button').addEventListener('click', () => openCoverageModal());
$('coverage-status').addEventListener('change', syncCoveragePrice);
$('activity-filter').addEventListener('input', renderActivities);
$('quote-filter').addEventListener('input', renderQuotes);
$('inspection-filter').addEventListener('input', renderInspections);
$('price-filter').addEventListener('input', renderPrices);
$('price-plan-filter').addEventListener('change', renderPrices);
$('coverage-plan-filter').addEventListener('change', renderCoverages);
$('coverage-status-filter').addEventListener('change', renderCoverages);
$('coverage-text-filter').addEventListener('input', renderCoverages);
$('audit-filter').addEventListener('input', renderAudit);
$('admin-download-all-files').addEventListener('click', downloadAllAdminFiles);
document.querySelectorAll('[data-open-settings]').forEach(button => button.addEventListener('click', openSettingsModal));
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => closeDialog(button.dataset.closeDialog)));

document.querySelectorAll('.admin-dialog').forEach(dialog => {
  dialog.addEventListener('close', () => { if (dialog.id === 'inspection-dialog') releaseAdminMediaUrls(); });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside && dialog.id !== 'confirm-dialog') dialog.close();
  });
});

document.querySelectorAll('.admin-tabs button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.admin-tabs button').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('[id^="tab-"]').forEach(section => { section.hidden = section.id !== `tab-${button.dataset.tab}`; });
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
    if ($('admin-login').hidden) showLogin(error.message);
  }
}

boot();
