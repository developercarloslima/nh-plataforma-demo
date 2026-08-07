const TOKEN_KEY = 'nhPortalToken';
const ROLE_KEY = 'nhPortalRole';
const CONSULTANT_KEY = 'nhSelectedConsultant';
const $ = id => document.getElementById(id);

let consultants = [];
let selectedConsultant = null;
let dashboardData = null;
let dashboardTimer = null;
let activeCompletionCommunication = null;
let activeQuoteEditId = null;
const dismissedCompletionIds = new Set();
const consultantMediaObjectUrls = new Set();

const QUOTE_STATUS = {
  CREATED: ['Pendente', 'warn'],
  UNDER_REVIEW: ['Em análise', 'warn'],
  ACCEPTED: ['Aceita', 'ok'],
  DECLINED: ['Recusada', 'off'],
  CANCELLED: ['Cancelada', 'off']
};

const INSPECTION_STATUS = {
  WAITING_FILES: ['Aguardando arquivos', 'warn'],
  UPLOADING_FILES: ['Envio em andamento', 'warn'],
  CREATED: ['Pendente', 'warn'],
  UNDER_REVIEW: ['Em análise', 'warn'],
  COMPLETED: ['Aguardando análise', 'warn'],
  APPROVED: ['Aprovada', 'ok'],
  REJECTED: ['Recusada', 'off'],
  CANCELLED: ['Cancelada', 'off'],
  EXPIRED: ['Expirada', 'off']
};

function token() {
  return localStorage.getItem(TOKEN_KEY);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token()) headers.set('Authorization', `Bearer ${token()}`);
  const response = await fetch(window.NH_API?.backend(path) || path, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401) logout();
    throw new Error(body?.message || 'Não foi possível concluir a solicitação.');
  }
  return response.status === 204 ? null : response.json();
}

async function apiBlob(path) {
  const headers = new Headers();
  if (token()) headers.set('Authorization', `Bearer ${token()}`);
  const response = await fetch(window.NH_API?.backend(path) || path, { headers, cache: 'no-store' });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) logout();
    throw new Error(body?.message || 'Não foi possível carregar o arquivo.');
  }
  return response.blob();
}

const CONSULTANT_ASSET_LABELS = {
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

function releaseConsultantMediaUrls() {
  consultantMediaObjectUrls.forEach(url => URL.revokeObjectURL(url));
  consultantMediaObjectUrls.clear();
}

function message(text, type = 'error') {
  const element = $('portal-message');
  element.className = `message ${type}`;
  element.textContent = text;
}

function clearMessage() {
  const element = $('portal-message');
  element.className = '';
  element.textContent = '';
}

function confirmConsultantAction(title, text, confirmLabel = 'Confirmar') {
  return new Promise(resolve => {
    const dialog = $('consultant-confirm-dialog');
    const action = $('consultant-confirm-action');
    $('consultant-confirm-title').textContent = title;
    $('consultant-confirm-text').textContent = text;
    action.textContent = confirmLabel;
    dialog.returnValue = 'cancel';

    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'default');
    };

    dialog.addEventListener('close', onClose);
    if (!dialog.open) dialog.showModal();
  });
}

function logout() {
  stopDashboardPolling();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(CONSULTANT_KEY);
  location.reload();
}

async function boot() {
  if (!token()) return;
  $('login-view').hidden = true;
  $('portal-view').hidden = false;
  $('logout').hidden = false;
  try {
    const me = await api('/api/auth/me');
    localStorage.setItem(ROLE_KEY, me.role);
    if (me.role === 'ADMIN') {
      location.replace('/admin/');
      return;
    }
    if (me.role === 'ANALYST') {
      location.replace('/analise/');
      return;
    }
    $('admin-card-wrap').hidden = true;
    await loadConsultants();
    await restoreConsultant();
  } catch (error) {
    message(error.message);
  }
}

async function loadConsultants() {
  consultants = await api('/api/consultants');
  $('consultants-list').innerHTML = consultants
    .map(item => `<option value="${escapeHtml(item.name)}"></option>`)
    .join('');
}

async function registerConsultantLogin(consultant) {
  return api(`/api/consultants/${encodeURIComponent(consultant.id)}/portal-login`, { method: 'POST' });
}

async function restoreConsultant() {
  const consultant = JSON.parse(localStorage.getItem(CONSULTANT_KEY) || 'null');
  if (consultant?.id) {
    $('consultant-search').value = consultant.name;
    applyConsultant(await registerConsultantLogin(consultant));
  } else {
    $('tools').hidden = true;
    $('activity-dashboard').hidden = true;
  }
}

function applyConsultant(consultant) {
  selectedConsultant = consultant;
  localStorage.setItem(CONSULTANT_KEY, JSON.stringify(consultant));
  $('current-chip').textContent = `✓ ${consultant.name}`;
  $('current-chip').hidden = false;
  $('tools').hidden = false;
  $('activity-dashboard').hidden = false;
  $('change-consultant').hidden = false;
  $('select-consultant').hidden = true;
  $('show-create').hidden = true;
  $('consultant-search').disabled = true;
  clearMessage();
  startDashboardPolling();
  loadDashboard(consultant).catch(error => message(error.message));
}

function changeConsultant() {
  stopDashboardPolling();
  $('consultant-search').disabled = false;
  $('consultant-search').value = '';
  $('current-chip').hidden = true;
  $('tools').hidden = true;
  $('activity-dashboard').hidden = true;
  $('change-consultant').hidden = true;
  $('select-consultant').hidden = false;
  $('show-create').hidden = false;
  selectedConsultant = null;
  localStorage.removeItem(CONSULTANT_KEY);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function date(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '—';
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';
}

function badge(status, labels) {
  const [label, kind] = labels[status] || [status || 'Não iniciada', ''];
  return `<span class="badge ${kind}">${escapeHtml(label)}</span>`;
}

function plate(value, zeroKm = false) {
  return value || (zeroKm ? '0 km — sem placa' : '—');
}

function empty(columns, text) {
  return `<tr><td colspan="${columns}" class="empty-state">${escapeHtml(text)}</td></tr>`;
}

async function loadDashboard(consultant = selectedConsultant, { silent = false } = {}) {
  if (!consultant?.id) return;
  const button = $('refresh-dashboard');
  if (!silent) {
    button.disabled = true;
    button.textContent = 'Atualizando...';
  }
  try {
    dashboardData = await api(`/api/consultant-dashboard/${encodeURIComponent(consultant.id)}`);
    renderDashboard(dashboardData);
    showNextCompletionCommunication();
  } finally {
    if (!silent) {
      button.disabled = false;
      button.textContent = 'Atualizar informações';
    }
  }
}

function inspectionActions(item) {
  const canCollectFiles = ['WAITING_FILES', 'UPLOADING_FILES', 'CREATED'].includes(item.status);
  const startLabel = item.status === 'UPLOADING_FILES' ? 'Continuar vistoria' : 'Iniciar vistoria';

  const startButton = canCollectFiles
    ? (item.publicUrl
      ? `<a class="button secondary small-button" href="${escapeHtml(item.publicUrl)}" target="_blank" rel="noopener">${startLabel}</a>`
      : `<button class="secondary small-button" type="button" disabled title="O link desta vistoria ainda não está disponível.">${startLabel}</button>`)
    : '';

  const requestButton = canCollectFiles
    ? (item.associateInspectionWhatsappUrl
      ? `<a class="button outline small-button" href="${escapeHtml(item.associateInspectionWhatsappUrl)}" target="_blank" rel="noopener">Enviar mensagem para enviar arquivos</a>`
      : '<button class="outline small-button" type="button" disabled title="O WhatsApp do associado não está configurado nesta vistoria.">Enviar mensagem para enviar arquivos</button>')
    : '';

  const filesButton = item.hasFiles && Number(item.assetCount || 0) > 0
    ? `<button class="outline small-button" data-view-inspection-files="${item.id}" type="button">Ver documentos enviados (${Number(item.assetCount || 0)})</button>`
    : '';

  return `<div class="row-actions inspection-actions">${startButton}${requestButton}${filesButton}</div>`;
}

function quoteActions(item) {
  const pdfUrl = window.NH_API?.backend(item.pdfUrl || `/api/quotes/${item.id}/pdf`)
    || item.pdfUrl
    || `/api/quotes/${item.id}/pdf`;
  const review = `<a class="button outline small-button" href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener">Rever cotação</a>`;
  const edit = `<button class="outline small-button" data-edit-quote="${item.id}" type="button">Editar dados</button>`;
  const inspectionVehicleType = (String(item.categoryCode || '').startsWith('MOTORCYCLE') || String(item.categoryCode || '') === 'SCOOTER_ELECTRIC')
    ? 'MOTORCYCLE'
    : 'FOUR_WHEELS_OR_MORE';
  const inspectionParams = new URLSearchParams({
    quoteId: item.id,
    name: item.customerName || '',
    plate: item.plate || '',
    zeroKm: String(Boolean(item.zeroKm)),
    vehicleType: inspectionVehicleType,
    whatsapp: item.whatsapp || ''
  });
  const startInspection = item.status === 'ACCEPTED' && !item.inspectionId
    ? `<a class="button secondary small-button" href="/colaborador/retrato.html?${inspectionParams.toString()}">Abrir Retrato NH</a>`
    : '';
  const redo = item.expired
    ? `<button class="secondary small-button" data-redo-quote="${item.id}" type="button">Refazer cotação</button>`
    : '';
  const remove = `<button class="danger small-button" data-delete-quote="${item.id}" type="button">Excluir</button>`;
  return `<div class="row-actions quote-actions">${review}${edit}${startInspection}${redo}${remove}</div>`;
}

function findQuote(id) {
  return (dashboardData?.quotes || []).find(item => item.id === id);
}

function askCpf(customerName) {
  const value = window.prompt(`Informe o CPF de ${customerName || 'cliente'} para continuar:`);
  if (value === null) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) {
    message('Informe um CPF válido com 11 números.');
    return null;
  }
  return value;
}

async function redoQuote(id, button) {
  const item = findQuote(id);
  if (!item || !selectedConsultant?.id) return;
  const cpf = item.hasCustomerCpf ? null : askCpf(item.customerName);
  if (!item.hasCustomerCpf && cpf === null) return;
  button.disabled = true;
  button.textContent = 'Refazendo...';
  try {
    await api(`/api/consultant-dashboard/${encodeURIComponent(selectedConsultant.id)}/quotes/${encodeURIComponent(id)}/redo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cpf ? { cpf } : {})
    });
    await loadDashboard(selectedConsultant, { silent: true });
    message('Nova cotação criada com a tabela atual. A anterior foi mantida no histórico.', 'success');
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Refazer cotação';
  }
}

function setQuoteEditMessage(text = '', type = 'error') {
  const box = $('consultant-quote-edit-message');
  box.className = text ? `message ${type}` : '';
  box.textContent = text;
}

function closeQuoteEditDialog() {
  const dialog = $('consultant-quote-edit-dialog');
  if (dialog.open) dialog.close();
  activeQuoteEditId = null;
  setQuoteEditMessage();
}

function syncQuoteEditPlateRequirement() {
  const zeroKm = $('consultant-quote-edit-zero-km').value === 'true';
  const plateInput = $('consultant-quote-edit-plate');
  plateInput.required = !zeroKm;
  plateInput.placeholder = zeroKm ? 'Opcional para veículo 0 km' : 'Informe a placa';
}

function quoteInspectionHref(item) {
  if (!item) return '#';
  if (item.inspectionPublicUrl) return item.inspectionPublicUrl;
  const inspectionVehicleType = (String(item.categoryCode || '').startsWith('MOTORCYCLE') || String(item.categoryCode || '') === 'SCOOTER_ELECTRIC')
    ? 'MOTORCYCLE'
    : 'FOUR_WHEELS_OR_MORE';
  const params = new URLSearchParams({
    quoteId: item.id,
    name: item.customerName || '',
    plate: item.plate || '',
    zeroKm: String(Boolean(item.zeroKm)),
    vehicleType: inspectionVehicleType,
    whatsapp: item.whatsapp || ''
  });
  return `/colaborador/retrato.html?${params.toString()}`;
}

function renderQuoteEditDecision(item) {
  const decision = $('consultant-quote-decision');
  const accepted = $('consultant-quote-accepted');
  const declineButton = $('consultant-quote-decline');
  const canDecide = item && ['CREATED', 'UNDER_REVIEW', 'DECLINED'].includes(item.status) && !item.expired;
  decision.hidden = !canDecide;
  accepted.hidden = item?.status !== 'ACCEPTED';
  declineButton.classList.toggle('selected', item?.status === 'DECLINED');
  if (item?.status === 'ACCEPTED') {
    $('consultant-quote-open-retrato').href = quoteInspectionHref(item);
  }
}

function collectQuoteEditPayload() {
  const customerName = $('consultant-quote-edit-name').value.trim();
  const cpf = $('consultant-quote-edit-cpf').value.trim();
  const whatsapp = $('consultant-quote-edit-whatsapp').value.trim();
  const plateValue = $('consultant-quote-edit-plate').value.trim();
  const model = $('consultant-quote-edit-model').value.trim();
  const manufactureYear = Number($('consultant-quote-edit-year').value);
  const zeroKm = $('consultant-quote-edit-zero-km').value === 'true';
  if (!customerName) { setQuoteEditMessage('Informe o nome do associado.'); return null; }
  const cpfDigits = cpf.replace(/\D/g, '');
  if (cpfDigits && cpfDigits.length !== 11) { setQuoteEditMessage('O CPF deve possuir 11 números.'); return null; }
  const phoneDigits = whatsapp.replace(/\D/g, '');
  if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 13)) { setQuoteEditMessage('Informe um WhatsApp válido com DDD.'); return null; }
  if (!model) { setQuoteEditMessage('Informe o modelo do veículo.'); return null; }
  if (!Number.isInteger(manufactureYear) || manufactureYear < 1950 || manufactureYear > 2100) { setQuoteEditMessage('Informe um ano de fabricação válido.'); return null; }
  const plateDigits = plateValue.replace(/[^A-Za-z0-9]/g, '');
  if (!zeroKm && (plateDigits.length < 7 || plateDigits.length > 10)) { setQuoteEditMessage('Informe uma placa válida.'); return null; }
  return { customerName, cpf, whatsapp, plate: plateValue, model, manufactureYear, zeroKm };
}

async function persistQuoteEdit(item, payload) {
  return api(`/api/consultant-dashboard/${encodeURIComponent(selectedConsultant.id)}/quotes/${encodeURIComponent(item.id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
}

function openQuoteEditDialog(id) {
  const item = findQuote(id);
  if (!item) return;
  activeQuoteEditId = item.id;
  $('consultant-quote-edit-id').value = item.id;
  $('consultant-quote-edit-name').value = item.customerName || '';
  $('consultant-quote-edit-cpf').value = item.customerCpf || '';
  $('consultant-quote-edit-whatsapp').value = item.whatsapp || '';
  $('consultant-quote-edit-plate').value = item.plate || '';
  $('consultant-quote-edit-number').textContent = item.quoteNumber || '—';
  $('consultant-quote-edit-model').value = item.model || '';
  $('consultant-quote-edit-year').value = item.manufactureYear || '';
  $('consultant-quote-edit-zero-km').value = String(Boolean(item.zeroKm));
  syncQuoteEditPlateRequirement();
  $('consultant-quote-edit-plan').textContent = item.selectedPlanName || '—';
  $('consultant-quote-edit-value').textContent = money(item.monthlyValue);
  setQuoteEditMessage();
  renderQuoteEditDecision(item);
  $('consultant-quote-edit-dialog').showModal();
  $('consultant-quote-edit-name').focus();
}

async function saveQuoteEdit(event) {
  event.preventDefault();
  const item = findQuote(activeQuoteEditId || $('consultant-quote-edit-id').value);
  if (!item || !selectedConsultant?.id) return;
  const payload = collectQuoteEditPayload();
  if (!payload) return;
  const button = $('consultant-quote-edit-save');
  button.disabled = true;
  button.textContent = 'Salvando...';
  setQuoteEditMessage();
  try {
    await persistQuoteEdit(item, payload);
    await loadDashboard(selectedConsultant, { silent: true });
    const updated = findQuote(item.id);
    if (updated) renderQuoteEditDecision(updated);
    setQuoteEditMessage('Dados cadastrais atualizados. Plano, coberturas e valores permaneceram inalterados.', 'success');
  } catch (error) {
    setQuoteEditMessage(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Salvar dados cadastrais';
  }
}

async function decideEditedQuote(decision) {
  const item = findQuote(activeQuoteEditId || $('consultant-quote-edit-id').value);
  if (!item || !selectedConsultant?.id) return;
  const payload = collectQuoteEditPayload();
  if (!payload) return;
  const acceptButton = $('consultant-quote-accept');
  const declineButton = $('consultant-quote-decline');
  acceptButton.disabled = true;
  declineButton.disabled = true;
  setQuoteEditMessage();
  try {
    await persistQuoteEdit(item, payload);
    await api(`/api/consultant-dashboard/${encodeURIComponent(selectedConsultant.id)}/quotes/${encodeURIComponent(item.id)}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision })
    });
    await loadDashboard(selectedConsultant, { silent: true });
    const updated = findQuote(item.id);
    if (updated) renderQuoteEditDecision(updated);
    if (decision === 'ACCEPTED') {
      $('consultant-quote-accepted').hidden = false;
      $('consultant-quote-open-retrato').href = quoteInspectionHref(updated || item);
      setQuoteEditMessage('Proposta aceita. Agora você pode abrir o Retrato NH para gerar a nova vistoria.', 'success');
    } else {
      setQuoteEditMessage('Proposta marcada como recusada. Ela poderá ser aceita depois enquanto estiver válida.', 'success');
    }
  } catch (error) {
    setQuoteEditMessage(error.message);
  } finally {
    acceptButton.disabled = false;
    declineButton.disabled = false;
  }
}

async function deleteQuote(id, button) {
  const item = findQuote(id);
  if (!item || !selectedConsultant?.id) return;
  const confirmed = await confirmConsultantAction(
    'Excluir cotação?',
    `A cotação ${item.quoteNumber} de ${item.customerName || 'este cliente'} será excluída do painel. A vistoria existente, quando houver, continuará preservada. Esta ação não pode ser desfeita.`,
    'Excluir cotação'
  );
  if (!confirmed) return;
  button.disabled = true;
  button.textContent = 'Excluindo...';
  try {
    await api(`/api/consultant-dashboard/${encodeURIComponent(selectedConsultant.id)}/quotes/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    await loadDashboard(selectedConsultant, { silent: true });
    message('Cotação excluída do painel.', 'success');
  } catch (error) {
    message(error.message);
    button.disabled = false;
    button.textContent = 'Excluir';
  }
}

function renderDashboard(data) {
  $('consultant-quotes-body').innerHTML = (data.quotes || []).map(item => `<tr>
    <td><strong>${escapeHtml(item.quoteNumber)}</strong></td>
    <td>${escapeHtml(item.customerName)}</td>
    <td>${escapeHtml(plate(item.plate, item.zeroKm))}<small class="table-code">${escapeHtml(item.model || '')}</small></td>
    <td>${date(item.createdAt)}</td>
    <td>${date(item.validUntil)}</td>
    <td>${item.expired ? '<span class="badge off">Expirada</span>' : badge(item.status, QUOTE_STATUS)}</td>
    <td>${badge(item.inspectionStatus, INSPECTION_STATUS)}</td>
    <td>${quoteActions(item)}</td>
  </tr>`).join('') || empty(8, 'Nenhuma cotação encontrada para este consultor.');

  $('consultant-inspections-body').innerHTML = (data.inspections || []).map(item => `<tr>
    <td><strong>${escapeHtml(item.associateName)}</strong></td>
    <td>${escapeHtml(plate(item.plate, true))}</td>
    <td>${item.requestType === 'NEW_INSPECTION' ? 'Nova vistoria' : 'Atualização de boleto'}</td>
    <td>${date(item.createdAt)}</td>
    <td>${date(item.completedAt)}</td>
    <td>${badge(item.status, INSPECTION_STATUS)}</td>
    <td>${inspectionActions(item)}</td>
    <td><div class="row-actions">${Array.isArray(item.assets) && item.assets.some(asset => asset.type === 'REPORT' && asset.available) ? `<button class="button outline small-button" data-download-report="${item.id}" type="button">Relatório</button>` : '<button class="outline small-button" type="button" disabled>Sem relatório</button>'}</div></td>
    <td>${communicationCell(item)}</td>
  </tr>`).join('') || empty(9, 'Nenhuma vistoria encontrada para este consultor.');

  document.querySelectorAll('[data-completion-message]').forEach(button => {
    button.addEventListener('click', () => openCompletionCommunication(button.dataset.completionMessage));
  });
  document.querySelectorAll('[data-view-inspection-files]').forEach(button => {
    button.addEventListener('click', () => openConsultantFiles(button.dataset.viewInspectionFiles));
  });
  document.querySelectorAll('[data-download-report]').forEach(button => {
    button.addEventListener('click', () => downloadConsultantReport(button.dataset.downloadReport, button));
  });
  document.querySelectorAll('[data-edit-quote]').forEach(button => {
    button.addEventListener('click', () => openQuoteEditDialog(button.dataset.editQuote));
  });
  document.querySelectorAll('[data-redo-quote]').forEach(button => {
    button.addEventListener('click', () => redoQuote(button.dataset.redoQuote, button));
  });
  document.querySelectorAll('[data-delete-quote]').forEach(button => {
    button.addEventListener('click', () => deleteQuote(button.dataset.deleteQuote, button));
  });
}

function openConsultantFiles(id) {
  const item = (dashboardData?.inspections || []).find(value => value.id === id);
  if (!item) return;
  releaseConsultantMediaUrls();
  $('consultant-files-title').textContent = `${plate(item.plate, true)} — ${item.associateName}`;
  $('consultant-files-retention').textContent = Number(item.assetCount || 0) > 0
    ? `Os arquivos ficam disponíveis até ${date(item.filesExpireAt)} e são apagados automaticamente após 40 dias.`
    : 'Nenhum arquivo disponível.';
  $('consultant-download-all-files').dataset.inspectionId = item.id;
  renderConsultantFiles(item);
  $('consultant-files-dialog').showModal();
}

function renderConsultantFiles(item) {
  const grid = $('consultant-files-grid');
  const assets = Array.isArray(item.assets) ? item.assets : [];
  const available = assets.filter(asset => asset.available);
  $('consultant-download-all-files').hidden = available.length === 0;
  grid.innerHTML = assets.map(asset => {
    const title = asset.label || CONSULTANT_ASSET_LABELS[asset.type] || 'Arquivo';
    const image = asset.available && String(asset.contentType || '').startsWith('image/');
    const video = asset.available && String(asset.contentType || '').startsWith('video/');
    const preview = image
      ? `<div class="inspection-media-preview"><span class="inspection-media-loading">Carregando imagem...</span><img data-consultant-image-preview="${asset.id}" alt="${escapeHtml(title)}" hidden></div>`
      : video
        ? `<div class="inspection-media-preview"><div class="inspection-media-placeholder">▶ Vídeo disponível</div><video data-consultant-video-preview="${asset.id}" controls hidden></video></div>`
        : `<div class="inspection-media-preview"><div class="inspection-media-placeholder">${asset.type === 'REPORT' ? 'PDF' : 'DOCUMENTO'}</div></div>`;
    const actions = asset.available
      ? `<div class="inspection-media-actions">${video ? `<button class="outline" data-consultant-play-video="${asset.id}" type="button">Reproduzir</button>` : ''}<button class="secondary" data-consultant-download-asset="${asset.id}" data-file-name="${escapeHtml(asset.fileName)}" type="button">Baixar</button></div>`
      : '<div class="inspection-media-expired">Arquivo removido após 40 dias.</div>';
    return `<article class="inspection-media-card ${asset.available ? '' : 'expired'}">${preview}<div class="inspection-media-body"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(asset.fileName)}</small><small>${formatBytes(asset.fileSize)} · ${escapeHtml(asset.contentType || 'arquivo')}</small>${actions}</div></article>`;
  }).join('') || '<div class="empty-state">Nenhum arquivo disponível.</div>';

  available.filter(asset => String(asset.contentType || '').startsWith('image/')).forEach(asset => loadConsultantImagePreview(item.id, asset));
  grid.querySelectorAll('[data-consultant-download-asset]').forEach(button => button.addEventListener('click', () => downloadConsultantAsset(item.id, button.dataset.consultantDownloadAsset, button.dataset.fileName, button)));
  grid.querySelectorAll('[data-consultant-play-video]').forEach(button => button.addEventListener('click', () => playConsultantVideo(item.id, button.dataset.consultantPlayVideo, button)));
}

async function loadConsultantImagePreview(inspectionId, asset) {
  const image = document.querySelector(`[data-consultant-image-preview="${asset.id}"]`);
  if (!image) return;
  const loading = image.parentElement.querySelector('.inspection-media-loading');
  try {
    const blob = await apiBlob(`/api/consultant-dashboard/inspections/${inspectionId}/assets/${asset.id}`);
    const url = URL.createObjectURL(blob);
    consultantMediaObjectUrls.add(url);
    image.src = url;
    image.hidden = false;
    if (loading) loading.remove();
  } catch (error) {
    if (loading) loading.textContent = error.message;
  }
}

async function playConsultantVideo(inspectionId, assetId, button) {
  const video = document.querySelector(`[data-consultant-video-preview="${assetId}"]`);
  if (!video) return;
  button.disabled = true;
  button.textContent = 'Carregando...';
  try {
    const blob = await apiBlob(`/api/consultant-dashboard/inspections/${inspectionId}/assets/${assetId}`);
    const url = URL.createObjectURL(blob);
    consultantMediaObjectUrls.add(url);
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

function triggerConsultantDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function downloadConsultantAsset(inspectionId, assetId, fileName, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Baixando...';
  try {
    const blob = await apiBlob(`/api/consultant-dashboard/inspections/${inspectionId}/assets/${assetId}?download=true`);
    triggerConsultantDownload(blob, fileName || 'arquivo-vistoria');
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function downloadConsultantReport(inspectionId, button) {
  const item = (dashboardData?.inspections || []).find(value => value.id === inspectionId);
  const report = item?.assets?.find(asset => asset.type === 'REPORT' && asset.available);
  if (!report) return;
  await downloadConsultantAsset(inspectionId, report.id, report.fileName || 'relatorio-vistoria.pdf', button);
}

async function downloadAllConsultantFiles() {
  const id = $('consultant-download-all-files').dataset.inspectionId;
  if (!id) return;
  const button = $('consultant-download-all-files');
  button.disabled = true;
  button.textContent = 'Preparando pacote...';
  try {
    const blob = await apiBlob(`/api/consultant-dashboard/inspections/${id}/assets.zip`);
    triggerConsultantDownload(blob, `arquivos-vistoria-${id}.zip`);
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Baixar todos (.zip)';
  }
}

function communicationCell(item) {
  if (item.completionMessagePending && item.associateCompletionWhatsappUrl) {
    return `<button class="secondary small-button" data-completion-message="${escapeHtml(item.id)}" type="button">Enviar mensagem</button>`;
  }
  if (item.completionMessageSentAt) return '<span class="badge ok">Informado</span>';
  if (item.completedAt && !item.associateCompletionWhatsappUrl) return '<span class="badge off">Sem WhatsApp</span>';
  return '—';
}

function startDashboardPolling() {
  stopDashboardPolling();
  dashboardTimer = window.setInterval(() => loadDashboard(selectedConsultant, { silent: true }).catch(() => {}), 20000);
}

function stopDashboardPolling() {
  if (dashboardTimer) {
    window.clearInterval(dashboardTimer);
    dashboardTimer = null;
  }
}

function showNextCompletionCommunication() {
  if ($('consultant-whatsapp-dialog').open) return;
  const next = (dashboardData?.inspections || []).find(item =>
    item.completionMessagePending
    && item.associateCompletionWhatsappUrl
    && !dismissedCompletionIds.has(item.id)
  );
  if (next) openCompletionCommunication(next.id);
}

function openCompletionCommunication(id) {
  const item = (dashboardData?.inspections || []).find(value => value.id === id);
  if (!item?.associateCompletionWhatsappUrl) return;
  activeCompletionCommunication = item;
  $('consultant-whatsapp-text').textContent = `A vistoria de ${item.associateName} foi concluída. Comunique ao associado que ela foi realizada e agora aguarda análise.`;
  $('consultant-whatsapp-details').innerHTML = `<div><span>Associado</span><strong>${escapeHtml(item.associateName)}</strong></div><div><span>Veículo</span><strong>${escapeHtml(plate(item.plate, true))}</strong></div><div><span>Concluída em</span><strong>${escapeHtml(date(item.completedAt))}</strong></div>`;
  $('consultant-whatsapp-dialog').showModal();
}

async function sendCompletionCommunication() {
  const item = activeCompletionCommunication;
  if (!item) return;
  window.open(item.associateCompletionWhatsappUrl, '_blank', 'noopener,noreferrer');
  const button = $('consultant-whatsapp-send');
  button.disabled = true;
  button.textContent = 'Registrando...';
  try {
    const updated = await api(`/api/consultant-dashboard/inspections/${encodeURIComponent(item.id)}/completion-message-sent`, { method: 'POST' });
    const index = dashboardData.inspections.findIndex(value => value.id === updated.id);
    if (index >= 0) dashboardData.inspections[index] = updated;
    $('consultant-whatsapp-dialog').close();
    activeCompletionCommunication = null;
    renderDashboard(dashboardData);
    message('Mensagem preparada no WhatsApp. Comunicação registrada.', 'success');
    showNextCompletionCommunication();
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Enviar mensagem ao associado';
  }
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const box = $('login-message');
  box.textContent = '';
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('username').value.trim(), password: $('password').value })
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(ROLE_KEY, data.role);
    if (data.role === 'ADMIN') location.href = '/admin/';
    else if (data.role === 'ANALYST') location.href = '/analise/';
    else location.reload();
  } catch (error) {
    box.className = 'message error';
    box.textContent = error.message;
  }
});

$('select-consultant').addEventListener('click', async () => {
  const value = $('consultant-search').value.trim().toLowerCase();
  const found = consultants.find(item => item.name.toLowerCase() === value);
  if (!found) return message('Selecione um nome da lista ou cadastre um novo consultor.');
  try {
    applyConsultant(await registerConsultantLogin(found));
  } catch (error) {
    message(error.message);
  }
});

$('show-create').addEventListener('click', () => {
  $('create-box').hidden = false;
  $('new-consultant-name').value = $('consultant-search').value;
  $('new-consultant-name').focus();
});
$('cancel-create').addEventListener('click', () => { $('create-box').hidden = true; });
$('create-consultant').addEventListener('click', async () => {
  clearMessage();
  try {
    const consultant = await api('/api/consultants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('new-consultant-name').value.trim() })
    });
    await loadConsultants();
    $('create-box').hidden = true;
    $('consultant-search').value = consultant.name;
    applyConsultant(await registerConsultantLogin(consultant));
    message('Novo consultor cadastrado e selecionado. Ele já aparecerá no painel administrativo.', 'success');
  } catch (error) {
    message(error.message);
  }
});

$('change-consultant').addEventListener('click', changeConsultant);
$('refresh-dashboard').addEventListener('click', () => {
  dismissedCompletionIds.clear();
  loadDashboard().catch(error => message(error.message));
});
$('consultant-whatsapp-send').addEventListener('click', () => sendCompletionCommunication());
$('consultant-whatsapp-later').addEventListener('click', () => {
  if (activeCompletionCommunication) dismissedCompletionIds.add(activeCompletionCommunication.id);
  $('consultant-whatsapp-dialog').close();
  activeCompletionCommunication = null;
  showNextCompletionCommunication();
});
$('logout').addEventListener('click', logout);

const defaultSgaUrl = 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/v5/login.php';
const configuredSgaUrl = window.NH_CONFIG?.sgaUrl;
$('sga-card').href = configuredSgaUrl && configuredSgaUrl !== '#' ? configuredSgaUrl : defaultSgaUrl;
boot();

$('consultant-quote-edit-form').addEventListener('submit', saveQuoteEdit);
$('consultant-quote-edit-zero-km').addEventListener('change', syncQuoteEditPlateRequirement);
$('consultant-quote-accept').addEventListener('click', () => decideEditedQuote('ACCEPTED'));
$('consultant-quote-decline').addEventListener('click', () => decideEditedQuote('DECLINED'));
$('consultant-quote-edit-close').addEventListener('click', closeQuoteEditDialog);
$('consultant-quote-edit-cancel').addEventListener('click', closeQuoteEditDialog);
$('consultant-quote-edit-dialog').addEventListener('close', () => {
  activeQuoteEditId = null;
  setQuoteEditMessage();
});

$('consultant-files-close').addEventListener('click', () => $('consultant-files-dialog').close());
$('consultant-download-all-files').addEventListener('click', downloadAllConsultantFiles);
$('consultant-files-dialog').addEventListener('close', releaseConsultantMediaUrls);
