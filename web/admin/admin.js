const TOKEN_KEY = 'nhPortalToken';
const ROLE_KEY = 'nhPortalRole';
const CONSULTANT_KEY = 'nhSelectedConsultant';
const $ = id => document.getElementById(id);

let token = localStorage.getItem(TOKEN_KEY);
let consultants = [];
let quotes = [];
let inspections = [];
let categories = [];
let prices = [];
let plans = [];
let coverages = [];
let auditEntries = [];
let settings = {};

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
const REGION_LABELS = Object.freeze({ NATIONAL: 'Nacional', NORTHEAST: 'Nordeste', CAPITAL: 'Capital' });
const MOTORCYCLE_ORIGIN_LABELS = Object.freeze({ NORTHEAST: 'Demais cidades do Nordeste', CAPITAL: 'Capital' });
const QUOTE_STATUS_LABELS = Object.freeze({
  CREATED: ['Pendente', 'warn'], UNDER_REVIEW: ['Em análise', 'warn'], ACCEPTED: ['Aceita', 'ok'],
  DECLINED: ['Recusada', 'off'], CANCELLED: ['Cancelada', 'off']
});
const INSPECTION_STATUS_LABELS = Object.freeze({
  CREATED: ['Pendente', 'warn'], UNDER_REVIEW: ['Em análise', 'warn'], COMPLETED: ['Material enviado', 'ok'],
  APPROVED: ['Aprovada', 'ok'], REJECTED: ['Reprovada', 'off'], CANCELLED: ['Cancelada', 'off'], EXPIRED: ['Expirada', 'off']
});
const AUDIT_TYPE_LABELS = Object.freeze({
  PLAN: 'Plano', PRICE_RANGE: 'Faixa de valor', PLAN_COVERAGE: 'Cobertura', OPTIONAL: 'Opcional',
  CONSULTANT: 'Consultor', QUOTE_STATUS: 'Cotação', INSPECTION_STATUS: 'Retrato NH', COMMUNICATION: 'Comunicação'
});

const regionLabel = value => REGION_LABELS[value] || value || '—';
const motorcycleOriginLabel = value => MOTORCYCLE_ORIGIN_LABELS[value] || 'Não se aplica';
const quoteOriginLabel = value => value === 'SELF_SERVICE' ? 'Cliente pelo site' : 'Consultor';
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
      api('/api/admin/quotes'),
      api('/api/admin/inspections'),
      api('/api/admin/catalog/categories'),
      api('/api/admin/catalog/prices'),
      api('/api/admin/catalog/plans'),
      api('/api/admin/catalog/coverages'),
      api('/api/admin/catalog/audit'),
      api('/api/admin/settings/communications')
    ]);
    [consultants, quotes, inspections, categories, prices, plans, coverages, auditEntries, settings] = result;
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
  renderQuotes();
  renderInspections();
  renderPlans();
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

function renderQuotes() {
  const filter = $('quote-filter').value.trim().toLowerCase();
  $('quotes-body').innerHTML = quotes
    .filter(item => `${item.consultantName} ${quoteOriginLabel(item.origin)} ${item.customerName} ${item.plate || ""} ${item.quoteNumber}`.toLowerCase().includes(filter))
    .map(item => `<tr>
      <td><strong>${esc(item.quoteNumber)}</strong></td><td><strong>${esc(quoteOriginLabel(item.origin))}</strong><small class="table-subtitle">${esc(item.consultantName)}</small></td><td>${esc(item.customerName)}</td>
      <td>${esc(item.plate || (item.zeroKm ? '0 km — sem placa' : '—'))}</td><td>${esc(item.selectedPlanName)}</td><td>${brl.format(item.monthlyValue)}</td>
      <td>${date(item.validUntil)}</td><td>${quoteBadge(item)}</td>
      <td><div class="row-actions"><button class="secondary small-button" data-quote-analyze="${item.id}" type="button">Analisar</button><a class="button outline small-button" href="${esc(item.pdfUrl)}" target="_blank" rel="noopener">PDF</a></div></td>
    </tr>`).join('') || emptyRow(9, 'Nenhuma cotação encontrada.');
  document.querySelectorAll('[data-quote-analyze]').forEach(button => button.addEventListener('click', () => openQuoteAnalysis(button.dataset.quoteAnalyze)));
}

function renderInspections() {
  const filter = $('inspection-filter').value.trim().toLowerCase();
  $('inspections-body').innerHTML = inspections
    .filter(item => `${item.consultantName} ${item.associateName} ${item.plate || ""}`.toLowerCase().includes(filter))
    .map(item => `<tr>
      <td><strong>${esc(item.associateName)}</strong></td><td>${esc(item.consultantName)}</td><td>${esc(item.plate || '0 km — sem placa')}</td>
      <td>${item.requestType === 'NEW_INSPECTION' ? 'Nova vistoria' : 'Atualização de boleto'}</td><td>${item.assetCount}</td>
      <td>${inspectionBadge(item.status)}</td><td>${date(item.createdAt)}</td>
      <td><button class="secondary small-button" data-inspection-analyze="${item.id}" type="button">Analisar</button></td>
    </tr>`).join('') || emptyRow(8, 'Nenhuma atividade do Retrato NH encontrada.');
  document.querySelectorAll('[data-inspection-analyze]').forEach(button => button.addEventListener('click', () => openInspectionAnalysis(button.dataset.inspectionAnalyze)));
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
  $('quote-detail-grid').innerHTML = detailItems([
    ['Cliente', item.customerName], ['Origem', quoteOriginLabel(item.origin)], ['Responsável', item.consultantName], ['CPF', item.maskedCpf || '—'], ['WhatsApp', formatPhone(item.whatsapp) || '—'],
    ['Placa', item.plate], ['Modelo', item.model], ['Ano', item.manufactureYear], ['Veículo 0 km', item.zeroKm ? 'Sim' : 'Não'],
    ['Valor FIPE', brl.format(item.fipeValue)], ['Abrangência', regionLabel(item.region)],
    ['Origem da moto', item.motorcycleOrigin ? motorcycleOriginLabel(item.motorcycleOrigin) : 'Não se aplica'],
    ['Plano', item.selectedPlanName], ['Total mensal', brl.format(item.monthlyValue)],
    ['Taxa única', brl.format(item.oneTimeFee || 0)], ['Emitida em', date(item.createdAt)], ['Válida até', date(item.validUntil)],
    ['Última análise', date(item.reviewedAt)]
  ]);
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
  $('inspection-analysis-id').value = item.id;
  $('inspection-dialog-title').textContent = `${item.plate || '0 km — sem placa'} — ${item.associateName}`;
  $('inspection-analysis-status').value = item.status;
  $('inspection-analysis-note').value = item.adminNote || '';
  $('inspection-detail-grid').innerHTML = detailItems([
    ['Associado', item.associateName], ['CPF', item.maskedCpf], ['WhatsApp', formatPhone(item.whatsapp) || '—'],
    ['Consultor', item.consultantName], ['Placa', item.plate || '0 km — sem placa'],
    ['Endereço residencial', item.residenceAddress || '—'],
    ['Tipo', item.requestType === 'NEW_INSPECTION' ? 'Nova vistoria' : 'Atualização de boleto'],
    ['Arquivos enviados', item.assetCount], ['Criada em', date(item.createdAt)], ['Expira em', date(item.expiresAt)],
    ['Concluída em', date(item.completedAt)], ['Última análise', date(item.reviewedAt)]
  ]);
  const currentPublicUrl = item.publicUrl
    ? (window.NH_URLS?.retratoUrl(item.publicUrl) || item.publicUrl)
    : null;
  $('inspection-links').innerHTML = linkButtons([
    [currentPublicUrl, 'Abrir link do associado'], [item.driveFolderUrl, 'Abrir Drive'], [item.reportUrl, 'Abrir relatório'], [item.signatureUrl, 'Abrir assinatura'],
    [window.NH_URLS?.replaceLinkInCommunicationUrl(item.teamWhatsappUrl, item.publicUrl, currentPublicUrl) || item.teamWhatsappUrl, 'Enviar por WhatsApp'],
    [window.NH_URLS?.replaceLinkInCommunicationUrl(item.teamEmailUrl, item.publicUrl, currentPublicUrl) || item.teamEmailUrl, 'Enviar por e-mail'],
    [item.associateDecisionWhatsappUrl, item.status === 'APPROVED' ? 'Informar aprovação ao associado' : 'Informar recusa ao associado']
  ]);
  openDialog('inspection-dialog');
}

function detailItems(items) {
  return items.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value ?? '—')}</strong></div>`).join('');
}

function linkButtons(items) {
  return items.filter(([url]) => url).map(([url, label]) => `<a class="button outline" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`).join('');
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
  const motorcycle = Boolean(category?.code?.startsWith('MOTORCYCLE'));
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

function renderPrices() {
  const filter = $('price-filter').value.trim().toLowerCase();
  const selectedPlan = $('price-plan-filter').value;
  const filtered = prices.filter(item => {
    if (selectedPlan && String(item.planId) !== selectedPlan) return false;
    return `${item.planName} ${item.category} ${item.region} ${regionLabel(item.region)} ${item.motorcycleOrigin || ''} ${motorcycleOriginLabel(item.motorcycleOrigin)}`.toLowerCase().includes(filter);
  });
  $('prices-body').innerHTML = filtered.map(item => `<tr>
    <td><strong class="catalog-name">${esc(item.planName)}</strong></td><td>${esc(item.category)}</td><td>${esc(regionLabel(item.region))}<small class="table-code">${esc(motorcycleOriginLabel(item.motorcycleOrigin))}</small></td>
    <td>${brl.format(item.minValue)} a ${brl.format(item.maxValue)}</td><td><strong>${brl.format(item.monthlyPrice)}</strong></td>
    <td><div class="row-actions"><button class="secondary small-button" data-price-edit="${item.id}" type="button">Editar</button><button class="danger small-button" data-price-delete="${item.id}" type="button">Excluir</button></div></td>
  </tr>`).join('') || emptyRow(6, 'Nenhuma faixa de valor encontrada.');
  document.querySelectorAll('[data-price-edit]').forEach(button => button.addEventListener('click', () => openPriceModal(Number(button.dataset.priceEdit))));
  document.querySelectorAll('[data-price-delete]').forEach(button => button.addEventListener('click', () => deletePrice(Number(button.dataset.priceDelete))));
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
  CREATED: 'Pendente', UNDER_REVIEW: 'Em análise', ACCEPTED: 'Aceita', DECLINED: 'Recusada',
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
  $('plan-category').innerHTML = categories.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('');
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
  try {
    await api(`/api/admin/quotes/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: $('quote-analysis-status').value, adminNote: $('quote-analysis-note').value.trim() })
    });
    closeDialog('quote-dialog');
    message('Análise da cotação salva.', 'success');
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

$('logout').addEventListener('click', () => showLogin());
$('new-consultant-button').addEventListener('click', () => openConsultantModal());
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
document.querySelectorAll('[data-open-settings]').forEach(button => button.addEventListener('click', openSettingsModal));
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => closeDialog(button.dataset.closeDialog)));

document.querySelectorAll('.admin-dialog').forEach(dialog => {
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
