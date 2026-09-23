const TOKEN_KEY = 'nhPortalToken';
const ROLE_KEY = 'nhPortalRole';
const CONSULTANT_KEY = 'nhSelectedConsultant';
const LAST_ACTIVITY_KEY = 'nhPortalLastActivityAt';
const INACTIVITY_LIMIT_MS = 20 * 60 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 15 * 1000;
const $ = id => document.getElementById(id);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

let token = localStorage.getItem(TOKEN_KEY);
let inactivityTimer = null;
let lastActivityWriteAt = 0;
let inspections = [];
let analysts = [];
let currentUser = null;
let activeDecisionCommunication = null;
let activeAnalysisQueue = 'review';
const mediaObjectUrls = new Set();

const STATUS = {
  WAITING_FILES: ['Aguardando arquivos', 'warn'],
  UPLOADING_FILES: ['Envio em andamento', 'warn'],
  CREATED: ['Pendente', 'warn'],
  UNDER_REVIEW: ['Em análise', 'warn'],
  COMPLETED: ['Aguardando análise', 'warn'],
  APPROVED: ['Aprovada', 'ok'],
  REJECTED: ['Rejeitada', 'off'],
  CANCELLED: ['Cancelada', 'off'],
  EXPIRED: ['Expirada', 'off']
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));
const date = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
const hasFiles = item => Number(item?.assetCount || 0) > 0;

function renderCommercialBenefits(containerId, item, locked = false) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = '';
  const benefits = Array.isArray(item?.commercialBenefits) ? item.commercialBenefits : [];
  if (!benefits.length) {
    const empty = document.createElement('span');
    empty.className = 'commercial-benefits-empty';
    empty.textContent = 'Nenhum benefício cadastrado para este plano.';
    container.appendChild(empty);
    return;
  }
  benefits.forEach(benefit => {
    const row = document.createElement('label');
    row.className = 'commercial-benefit-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'commercial-benefit-input';
    input.checked = benefit.selected === true;
    input.dataset.benefitCode = benefit.code || '';
    input.dataset.catalogStatus = benefit.catalogStatus || '';
    input.dataset.monthlyPrice = String(Number(benefit.monthlyPrice || 0));
    input.dataset.alwaysLocked = (benefit.locked && !['NATURAL_PHENOMENA','SMALL_REPAIRS'].includes(String(benefit.code || '').toUpperCase())) ? 'true' : 'false';
    input.disabled = locked || input.dataset.alwaysLocked === 'true';
    const text = document.createElement('span');
    text.className = 'commercial-benefit-copy';
    const title = document.createElement('strong');
    title.textContent = benefit.name || benefit.code || 'Benefício';
    text.appendChild(title);
    const detail = document.createElement('small');
    detail.className = 'commercial-benefit-detail';
    const price = Number(benefit.monthlyPrice || 0);
    detail.textContent = [benefit.detail, price > 0 ? `Adicional: ${brl.format(price)}/mês` : null, benefit.lockReason].filter(Boolean).join(' · ');
    detail.dataset.baseDetail = [benefit.detail, price > 0 ? `Adicional: ${brl.format(price)}/mês` : null].filter(Boolean).join(' · ');
    detail.dataset.benefitDetail = 'true';
    text.appendChild(detail);
    row.append(input, text);
    container.appendChild(row);
  });
}

function selectedCommercialBenefits(containerId) {
  const container = $(containerId);
  if (!container) return [];
  return [...container.querySelectorAll('input[data-benefit-code]:checked')].map(input => input.dataset.benefitCode);
}

function refreshCommercialRules(config, locked = false) {
  const discountEl = $(config.discountId);
  const brandingEl = $(config.brandingId);
  const fipeEl = $(config.fipeId);
  const benefitsEl = $(config.benefitsId);
  if (!discountEl || !brandingEl || !benefitsEl) return;
  const discount = Number(discountEl.value || 0);
  if (discount === 15) brandingEl.value = 'NH_AND_OTHER_COMPANY';
  else if (discount === 30) brandingEl.value = 'NH_ONLY';
  else brandingEl.value = 'NOT_APPLICABLE';
  brandingEl.disabled = locked || ![15, 30].includes(discount);
  const parse = window.NHMoney?.parse;
  const fipe = typeof parse === 'function' ? parse(fipeEl?.value || '') : Number(String(fipeEl?.value || '').replace(/[^0-9,]/g, '').replace(',', '.'));
  benefitsEl.querySelectorAll('input[data-benefit-code]').forEach(input => {
    const code = String(input.dataset.benefitCode || '').toUpperCase();
    const alwaysLocked = input.dataset.alwaysLocked === 'true';
    if (code === 'THIRD_PARTY_BASE') { input.checked = true; input.disabled = true; }
    else if (code === 'THIRD_PARTY') { input.checked = false; input.disabled = true; }
    else if (discount > 0 && ['NATURAL_PHENOMENA','SMALL_REPAIRS'].includes(code)) { input.checked = false; input.disabled = true; }
    else input.disabled = locked || alwaysLocked;
    const row = input.closest('.commercial-benefit-row');
    const detail = input.parentElement?.querySelector('[data-benefit-detail]');
    if (code === 'THIRD_PARTY_BASE') {
      if (detail && Number.isFinite(fipe)) {
        detail.textContent = `Cobertura de até ${fipe >= 51000 ? 'R$ 100 mil' : 'R$ 50 mil'} · Limite obrigatório definido pela FIPE.`;
      }
    } else if (discount > 0 && ['NATURAL_PHENOMENA','SMALL_REPAIRS'].includes(code)) {
      if (detail) detail.textContent = [detail.dataset.baseDetail, 'Removido automaticamente porque o plano possui desconto.'].filter(Boolean).join(' · ');
    } else if (detail && detail.dataset.baseDetail) {
      detail.textContent = detail.dataset.baseDetail;
    }
    row?.classList.toggle('is-selected', input.checked);
    row?.classList.toggle('is-locked', input.disabled);
  });
}

function setCommercialPreviewValue(id, value) {
  const element = $(id);
  if (element) element.textContent = brl.format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

const commercialPricingTimers = new WeakMap();

function parseCommercialMoneyInput(element) {
  const parse = window.NHMoney?.parse;
  if (!element) return NaN;
  return typeof parse === 'function'
    ? parse(element.value || '')
    : Number(String(element.value || '').replace(/[^0-9,]/g, '').replace(',', '.'));
}

function markCommercialMonthlyAutomatic(config) {
  const monthlyEl = $(config.monthlyId);
  if (monthlyEl) monthlyEl.dataset.manualOverride = 'false';
}

async function requestCommercialPricingPreview(config, applyCalculatedValue = true) {
  const inspectionId = $(config.inspectionIdId)?.value;
  const benefitsEl = $(config.benefitsId);
  const discountEl = $(config.discountId);
  const fipeEl = $(config.fipeId);
  const monthlyEl = $(config.monthlyId);
  const finalNote = $(config.previewFinalNoteId);
  if (!inspectionId || !benefitsEl || !discountEl || !fipeEl) return;

  const fipeValue = parseCommercialMoneyInput(fipeEl);
  if (!Number.isFinite(fipeValue) || fipeValue <= 0) {
    if (finalNote) finalNote.textContent = 'Informe uma FIPE válida para recalcular a mensalidade.';
    return;
  }

  const discountPercent = Number(discountEl.value || 0) || 0;
  const benefitCodes = selectedCommercialBenefits(config.benefitsId);
  const sequence = (Number(benefitsEl.dataset.pricingRequestSequence || 0) || 0) + 1;
  benefitsEl.dataset.pricingRequestSequence = String(sequence);
  if (finalNote) finalNote.textContent = 'Recalculando pela tabela atual do plano...';

  try {
    const pricing = await api(`${config.previewApiBase}/${encodeURIComponent(inspectionId)}/contract-pricing-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fipeValue, discountPercent, benefitCodes })
    });
    if (Number(benefitsEl.dataset.pricingRequestSequence || 0) !== sequence) return;

    const base = Number(pricing.planBaseMonthlyValue || 0);
    const mandatory = Number(pricing.mandatoryMonthlyFee || 0);
    const optionals = Number(pricing.optionalsMonthlyValue || 0);
    const subtotal = Number(pricing.subtotalBeforeDiscount || 0);
    const discountValue = Number(pricing.discountValue || 0);
    const finalValue = Number(pricing.finalMonthlyValue || 0);
    const oneTime = Number(pricing.oneTimeFee || 0);

    setCommercialPreviewValue(config.previewBaseId, base);
    setCommercialPreviewValue(config.previewMandatoryId, mandatory);
    setCommercialPreviewValue(config.previewOptionalsId, optionals);
    setCommercialPreviewValue(config.previewSubtotalId, subtotal);
    setCommercialPreviewValue(config.previewOneTimeId, oneTime);
    setCommercialPreviewValue(config.previewDiscountId, discountValue);
    setCommercialPreviewValue(config.previewFinalId, finalValue);
    benefitsEl.dataset.calculatedFinal = String(finalValue);

    const mandatoryLabel = $(config.previewMandatoryLabelId);
    if (mandatoryLabel) {
      mandatoryLabel.textContent = mandatory > 0 ? 'Rastreador / taxa mensal aplicável' : 'Rastreador / taxa mensal (não aplicável)';
      mandatoryLabel.title = pricing.mandatoryFeeDescription || '';
    }

    const discountLabel = $(config.previewDiscountLabelId);
    if (discountLabel) discountLabel.textContent = discountPercent > 0 ? `Desconto (${discountPercent}%)` : 'Desconto';

    const sourceText = pricing.catalogBased
      ? 'Preço calculado agora pelo catálogo atual: base do plano por FIPE/tipo do veículo + rastreador/taxas aplicáveis + serviços adicionais selecionados - desconto. Valores antigos não são usados como base.'
      : 'Preço reconstruído pelos componentes disponíveis da cotação.';
    const feeText = mandatory > 0 && pricing.mandatoryFeeDescription
      ? ` ${pricing.mandatoryFeeDescription}`
      : (mandatory === 0 ? ' Nenhuma mensalidade de rastreador/taxa obrigatória foi adicionada.' : '');
    if (finalNote) finalNote.textContent = sourceText + feeText;

    if (applyCalculatedValue && monthlyEl && !monthlyEl.disabled) {
      monthlyEl.value = window.NHMoney?.format(finalValue) || finalValue.toFixed(2).replace('.', ',');
      monthlyEl.dataset.manualOverride = 'false';
      window.NHMoney?.refresh(monthlyEl);
    }
    return pricing;
  } catch (error) {
    if (Number(benefitsEl.dataset.pricingRequestSequence || 0) !== sequence) return;
    if (finalNote) finalNote.textContent = `Não foi possível recalcular pela tabela: ${error.message || 'erro inesperado'}`;
    return null;
  }
}

function scheduleCommercialPricingPreview(config, applyCalculatedValue = true, delay = 250) {
  const benefitsEl = $(config.benefitsId);
  if (!benefitsEl) return;
  const previous = commercialPricingTimers.get(benefitsEl);
  if (previous) window.clearTimeout(previous);
  const timer = window.setTimeout(() => {
    commercialPricingTimers.delete(benefitsEl);
    requestCommercialPricingPreview(config, applyCalculatedValue);
  }, delay);
  commercialPricingTimers.set(benefitsEl, timer);
}

function initializeCommercialPricingPreview(config) {
  markCommercialMonthlyAutomatic(config);
  scheduleCommercialPricingPreview(config, true, 0);
}

function bindCommercialPricingPreview(config) {
  const discountEl = $(config.discountId);
  const fipeEl = $(config.fipeId);
  const benefitsEl = $(config.benefitsId);
  const monthlyEl = $(config.monthlyId);

  discountEl?.addEventListener('change', () => {
    refreshCommercialRules(config, discountEl.disabled);
    markCommercialMonthlyAutomatic(config);
    scheduleCommercialPricingPreview(config, true, 0);
  });
  fipeEl?.addEventListener('input', () => {
    refreshCommercialRules(config, fipeEl.disabled);
    markCommercialMonthlyAutomatic(config);
    scheduleCommercialPricingPreview(config, true, 300);
  });
  benefitsEl?.addEventListener('change', event => {
    if (!event.target?.matches?.('input[data-benefit-code]')) return;
    refreshCommercialRules(config, false);
    markCommercialMonthlyAutomatic(config);
    scheduleCommercialPricingPreview(config, true, 0);
  });
}

const ANALYSIS_COMMERCIAL_CONFIG = Object.freeze({
  discountId: 'edit-contract-discount',
  brandingId: 'edit-contract-branding',
  fipeId: 'edit-contract-fipe',
  benefitsId: 'edit-contract-benefits',
  monthlyId: 'edit-contract-monthly',
  inspectionIdId: 'inspection-id',
  previewApiBase: '/api/analysis/inspections',
  previewBaseId: 'analysis-preview-base',
  previewMandatoryId: 'analysis-preview-mandatory',
  previewMandatoryLabelId: 'analysis-preview-mandatory-label',
  previewOptionalsId: 'analysis-preview-optionals',
  previewSubtotalId: 'analysis-preview-subtotal',
  previewOneTimeId: 'analysis-preview-one-time',
  previewDiscountId: 'analysis-preview-discount',
  previewFinalId: 'analysis-preview-final',
  previewFinalNoteId: 'analysis-preview-final-note',
  previewDiscountLabelId: 'analysis-preview-discount-label'
});




function inspectionAssetAvailable(item, type, sortOrder) {
  return Array.isArray(item?.assets) && item.assets.some(asset =>
    asset?.available === true && asset?.type === type && Number(asset?.sortOrder) === Number(sortOrder)
  );
}

function inspectionPendingCount(item) {
  if (!item) return 0;
  if (item.requestType !== 'NEW_INSPECTION') {
    return inspectionAssetAvailable(item, 'VIDEO', 1) ? 0 : 1;
  }

  const photoCount = item.vehicleType === 'MOTORCYCLE' ? 7 : 15;
  let pending = 0;
  for (let order = 1; order <= photoCount; order += 1) {
    if (!inspectionAssetAvailable(item, 'PHOTO', order)) pending += 1;
  }
  if (!inspectionAssetAvailable(item, 'VIDEO', photoCount + 1)) pending += 1;
  if (!inspectionAssetAvailable(item, 'SIGNATURE', photoCount + 2)) pending += 1;
  if (!inspectionAssetAvailable(item, 'VEHICLE_DOCUMENT', photoCount + 3)) pending += 1;
  if (!inspectionAssetAvailable(item, 'IDENTITY_DOCUMENT', photoCount + 4)) pending += 1;
  if (!inspectionAssetAvailable(item, 'IDENTITY_DOCUMENT', photoCount + 5)) pending += 1;
  if (!item.residenceAddress) pending += 1;
  return pending;
}

function inspectionNeedsFiles(item) {
  return inspectionPendingCount(item) > 0;
}

const ANALYSIS_QUEUE_INFO = {
  review: { label: 'Para cadastro', description: 'Vistorias dos consultores vinculados a você que aguardam conferência e a marcação “Cadastro feito”.' },
  pending: { label: 'Pendências de vistoria', description: 'Vistorias devolvidas pela supervisão ou com arquivos faltando/reenvio solicitado.' }
};

function inspectionQueueKey(item) {
  if (item?.analysisStage === 'ANALYST_PENDING' || inspectionNeedsFiles(item)) return 'pending';
  return 'review';
}

function analystRegistrationState(item) {
  // A etapa operacional é a fonte de verdade. Registros históricos podem possuir
  // registrationCompletedAt legado mesmo depois de terem voltado para a fila do Cadastro.
  if (item?.analysisStage === 'SUPERVISION_QUEUE' || item?.analysisStage === 'FINISHED') {
    return ['COMPLETED', 'Cadastro feito', 'ok'];
  }
  if (inspectionNeedsFiles(item) || item?.analysisStage === 'ANALYST_PENDING') {
    return ['AWAITING_DOCUMENTS', 'Aguardando documentos', 'warn'];
  }
  return ['NOT_COMPLETED', 'Cadastro não feito', 'warn'];
}

function registrationLocked(item) {
  return item?.analysisStage === 'SUPERVISION_QUEUE' || item?.analysisStage === 'FINISHED';
}

function analystBadge(item) {
  const [, label, kind] = analystRegistrationState(item);
  return `<span class="badge ${kind}">${esc(label)}</span>`;
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  return local.length === 11
    ? `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
    : digits;
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(CONSULTANT_KEY);
  localStorage.removeItem(LAST_ACTIVITY_KEY);
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = null;
  token = null;
  currentUser = null;
  analysts = [];
}

function tokenExpiresAtMs(value = token) {
  if (!value) return null;
  const parts = String(value).split('.');
  if (parts.length !== 5) return null;
  const seconds = Number(parts[2]);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

function sessionExpired() {
  const expiresAt = tokenExpiresAtMs();
  return expiresAt !== null && Date.now() >= expiresAt;
}

function lastActivityAtMs() {
  const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function inactivityExpired() {
  const lastActivity = lastActivityAtMs();
  return lastActivity !== null && Date.now() - lastActivity >= INACTIVITY_LIMIT_MS;
}

function scheduleInactivityCheck() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = null;
  if (!token) return;
  let lastActivity = lastActivityAtMs();
  if (lastActivity === null) {
    lastActivity = Date.now();
    localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivity));
  }
  const remaining = Math.max(0, INACTIVITY_LIMIT_MS - (Date.now() - lastActivity));
  inactivityTimer = setTimeout(() => {
    if (!token) return;
    if (inactivityExpired()) {
      showLogin('Sessão encerrada após 20 minutos de inatividade. Entre novamente.');
      return;
    }
    scheduleInactivityCheck();
  }, remaining + 100);
}

function markSessionActivity(force = false) {
  if (!token) return;
  const now = Date.now();
  if (!force && now - lastActivityWriteAt < ACTIVITY_WRITE_THROTTLE_MS) return;
  lastActivityWriteAt = now;
  localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  scheduleInactivityCheck();
}

function installInactivityTracking() {
  ['pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(eventName => {
    window.addEventListener(eventName, () => markSessionActivity(), { passive: true });
  });
  window.addEventListener('storage', event => {
    if (event.key === TOKEN_KEY && !event.newValue) {
      showLogin('Sua sessão foi encerrada. Entre novamente.');
      return;
    }
    if (event.key === LAST_ACTIVITY_KEY && token) scheduleInactivityCheck();
  });
}

function showLogin(text = '') {
  clearSession();
  $('analysis-login').hidden = false;
  $('analysis-view').hidden = true;
  $('logout').hidden = true;
  const box = $('login-message');
  box.className = text ? 'message error' : '';
  box.textContent = text;
}

function collaboratorDisplayName(value) {
  const text = String(value || '').trim();
  if (!text || text !== text.toUpperCase()) return text;
  return text.toLocaleLowerCase('pt-BR').replace(/(^|\s)([a-záàâãéêíóôõúç])/g, (_, space, letter) => space + letter.toLocaleUpperCase('pt-BR'));
}

function showView() {
  $('analysis-login').hidden = true;
  $('analysis-view').hidden = false;
  $('logout').hidden = false;
  const rawName = currentUser?.consultantName || currentUser?.displayName || currentUser?.username || 'Analista';
  const name = collaboratorDisplayName(rawName);
  if ($('analysis-welcome-title')) $('analysis-welcome-title').textContent = `Olá, ${name}`;
  if ($('analysis-welcome-text')) $('analysis-welcome-text').textContent = 'Bem-vindo, seu painel de Analista está pronto e atualizado.';
}

function activeAnalysisDialog() {
  const opened = [...document.querySelectorAll('dialog.admin-dialog[open]')];
  return opened.length ? opened[opened.length - 1] : null;
}

function analysisDialogMessageElement(dialog) {
  if (!dialog) return null;
  let element = dialog.querySelector('[data-dialog-message]');
  if (element) return element;

  const card = dialog.querySelector('.dialog-card');
  if (!card) return null;

  element = document.createElement('div');
  element.dataset.dialogMessage = 'true';
  element.setAttribute('role', 'alert');
  element.setAttribute('aria-live', 'polite');
  const head = card.querySelector('.dialog-head');
  if (head) head.insertAdjacentElement('afterend', element);
  else card.prepend(element);
  return element;
}

function clearAnalysisDialogMessage(dialog) {
  const element = dialog?.querySelector('[data-dialog-message]');
  if (!element) return;
  element.className = '';
  element.textContent = '';
}

function message(text, type = 'error') {
  const dialog = activeAnalysisDialog();
  if (dialog) {
    const element = analysisDialogMessageElement(dialog);
    if (element) {
      element.className = `message ${type} dialog-message`;
      element.textContent = text;
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
  }

  const element = $('message');
  element.className = `message ${type}`;
  element.textContent = text;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(window.NH_API?.backend(path) || path, { ...options, headers });
  if (token && (response.status === 401 || response.status === 403)) {
    showLogin('Sua sessão expirou. Entre novamente.');
    const error = new Error('Sessão inválida.');
    error.authExpired = true;
    throw error;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || 'Não foi possível concluir a operação.');
  }
  return response.status === 204 ? null : response.json();
}


async function analysisSessionStillValid() {
  if (!token) return false;
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  try {
    const response = await fetch(window.NH_API?.backend('/api/auth/me') || '/api/auth/me', { headers, cache: 'no-store' });
    return response.ok;
  } catch (_) {
    return true;
  }
}

function normalizedCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

async function apiBlob(path) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const requestPath = attempt === 0
      ? path
      : `${path}${path.includes('?') ? '&' : '?'}_nhRetry=${Date.now()}`;
    try {
      response = await fetch(window.NH_API?.backend(requestPath) || requestPath, { headers, cache: 'no-store' });
      break;
    } catch (networkError) {
      if (attempt === 1) {
        throw new Error('A conexão com o servidor foi interrompida durante o download. Tente novamente; o sistema preservou os arquivos da vistoria.');
      }
      await new Promise(resolve => window.setTimeout(resolve, 700));
    }
  }

  if (!response) throw new Error('Não foi possível iniciar o download.');
  if (token && response.status === 401) {
    showLogin('Sua sessão expirou. Entre novamente.');
    const error = new Error('Sessão inválida.');
    error.authExpired = true;
    throw error;
  }
  if (token && response.status === 403) {
    const sessionValid = await analysisSessionStillValid();
    if (!sessionValid) {
      showLogin('Sua sessão expirou. Entre novamente.');
      const error = new Error('Sessão inválida.');
      error.authExpired = true;
      throw error;
    }
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || 'Não foi possível baixar este arquivo. Sua sessão continua ativa.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || 'Não foi possível carregar o arquivo.');
  }
  return response.blob();
}

const ASSET_LABELS = {
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
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function releaseMediaUrls() {
  mediaObjectUrls.forEach(url => URL.revokeObjectURL(url));
  mediaObjectUrls.clear();
}

function confirmAnalysisAction(title, text, confirmLabel = 'Confirmar') {
  return new Promise(resolve => {
    const dialog = $('analysis-confirm-dialog');
    const action = $('analysis-confirm-action');
    $('analysis-confirm-title').textContent = title;
    $('analysis-confirm-text').textContent = text;
    action.textContent = confirmLabel;
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'default');
    };
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}

async function boot() {
  if (!token) {
    showLogin();
    return;
  }
  if (sessionExpired()) {
    showLogin('Sua sessão expirou. Entre novamente.');
    return;
  }
  try {
    const me = await api('/api/auth/me');
    currentUser = me;
    localStorage.setItem(ROLE_KEY, me.role);
    if (me.role === 'ADMIN') { location.replace('/admin/'); return; }
    if (me.role === 'SUPERVISION_ANALYSIS') { location.replace('/supervisao/'); return; }
    if (me.role === 'TOW_DRIVER') { location.replace('/guincho/'); return; }
    if (me.role === 'WORKSHOP_MANAGER') { location.replace('/oficina/'); return; }
    if (me.role === 'EVENT_OPERATOR') { location.replace('/checklist/'); return; }
    if (me.role === 'BUYER') { location.replace('/financeiro/'); return; }
    if (me.role !== 'ANALYST') { location.replace('/colaborador/'); return; }
    showView();
    if (me.passwordChangeRequired) { openFirstPasswordDialog(); return; }
    await load();
  } catch (error) {
    if (!error?.authExpired && !$('analysis-view').hidden) message(error.message);
  }
}

async function load() {
  const button = $('refresh');
  button.disabled = true;
  try {
    [inspections, analysts] = await Promise.all([
      api('/api/analysis/inspections'),
      api('/api/analysis/inspections/analysts')
    ]);
    render();
  } finally {
    button.disabled = false;
  }
}

function actionLink(url, label, style = 'outline') {
  if (!url) return '';
  return `<a class="button ${style} small-button" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
}

function inspectionMatchesFilter(item, filter) {
  if (!filter) return true;
  return `${item.associateName} ${item.plate || ''} ${item.consultantName} ${item.reviewedByName || ''} ${item.status}`
    .toLowerCase()
    .includes(filter);
}

function inspectionRows(items, emptyMessage) {
  const rows = items.map(item => {
    const currentPublicUrl = item.publicUrl
      ? (window.NH_URLS?.retratoUrl(item.publicUrl) || item.publicUrl)
      : null;
    const filesAvailable = hasFiles(item);
    const needsFiles = inspectionNeedsFiles(item);
    const partialResubmission = filesAvailable && needsFiles;
    const statusActions = filesAvailable
      ? `<button class="outline small-button" data-analyze="${item.id}" type="button">Ver documentos enviados</button>`
      : '';
    const pendingActions = needsFiles
      ? `${actionLink(item.associateInspectionWhatsappUrl, partialResubmission ? 'Enviar ao associado' : 'Enviar link ao associado', 'secondary')}${actionLink(item.consultantInspectionWhatsappUrl, 'Enviar ao consultor', 'outline')}${actionLink(currentPublicUrl, partialResubmission ? 'Abrir pendências' : 'Abrir vistoria')}`
      : '';

    return `<tr>
      <td><strong>${esc(item.associateName)}</strong><small class="table-code">${esc(formatPhone(item.whatsapp) || 'Sem WhatsApp')}</small></td>
      <td>${esc(item.plate || '0 km — sem placa')}</td>
      <td>${esc(item.consultantName)}</td>
      <td>${esc(item.assignedAnalystName || currentUser?.consultantName || '—')}</td>
      <td>${date(item.completedAt || item.createdAt)}</td>
      <td><div class="status-with-action">${analystBadge(item)}${statusActions}</div></td>
      <td><div class="row-actions">${pendingActions}<button class="secondary small-button" data-analyze="${item.id}" type="button">Analisar</button></div></td>
    </tr>`;
  }).join('');

  return rows || `<tr><td colspan="7" class="empty-state">${esc(emptyMessage)}</td></tr>`;
}

function queueCountLabel(total) {
  return `${total} ${total === 1 ? 'registro' : 'registros'}`;
}

function render() {
  const filter = $('filter').value.trim().toLowerCase();
  const filtered = inspections.filter(item => inspectionMatchesFilter(item, filter));

  const counts = { review: 0, pending: 0 };
  filtered.forEach(item => { counts[inspectionQueueKey(item)] += 1; });
  Object.entries(counts).forEach(([key, value]) => {
    const counter = $(`analysis-tab-${key}-count`);
    if (counter) counter.textContent = value;
  });

  document.querySelectorAll('[data-analysis-queue]').forEach(button => {
    button.classList.toggle('active', button.dataset.analysisQueue === activeAnalysisQueue);
    button.setAttribute('aria-pressed', button.dataset.analysisQueue === activeAnalysisQueue ? 'true' : 'false');
  });
  const queueInfo = ANALYSIS_QUEUE_INFO[activeAnalysisQueue] || ANALYSIS_QUEUE_INFO.review;
  $('analysis-status-description').textContent = queueInfo.description;

  const queueItems = filtered.filter(item => inspectionQueueKey(item) === activeAnalysisQueue);
  const newInspections = queueItems.filter(item => item.requestType === 'NEW_INSPECTION');
  const billingUpdates = queueItems.filter(item => item.requestType !== 'NEW_INSPECTION');

  $('new-inspections-body').innerHTML = inspectionRows(newInspections, `Nenhuma nova vistoria em “${queueInfo.label}”.`);
  $('billing-inspections-body').innerHTML = inspectionRows(billingUpdates, `Nenhuma atualização de boleto em “${queueInfo.label}”.`);
  $('new-inspections-count').textContent = queueCountLabel(newInspections.length);
  $('billing-inspections-count').textContent = queueCountLabel(billingUpdates.length);

  document.querySelectorAll('[data-analyze]').forEach(button => {
    button.addEventListener('click', () => openInspection(button.dataset.analyze));
  });
}

function details(items) {
  return items.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value ?? '—')}</strong></div>`).join('');
}

function links(items) {
  return items
    .filter(([url]) => url)
    .map(([url, label, style = 'outline']) => `<a class="button ${style}" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`)
    .join('');
}

function syncNewAnalystInput() {
  const select = $('inspection-analyst');
  const wrap = $('inspection-new-analyst-wrap');
  const input = $('inspection-new-analyst-name');
  const isNew = select.value === '__NEW__';
  wrap.hidden = !isNew;
  input.required = isNew;
  if (!isNew) input.value = '';
}

function populateAnalystReviewer(item) {
  const select = $('inspection-analyst');
  const helper = $('inspection-analyst-helper');
  const linkedId = currentUser?.role === 'ANALYST' ? currentUser?.consultantId : null;
  const linkedName = currentUser?.role === 'ANALYST' ? currentUser?.consultantName : null;

  if (linkedId) {
    select.innerHTML = `<option value="${esc(linkedId)}">${esc(linkedName || 'Analista vinculado')}</option>`;
    select.value = linkedId;
    select.disabled = true;
    helper.textContent = `Login identificado como ${linkedName || 'analista vinculado'}. Este nome ficará registrado na análise.`;
    $('inspection-new-analyst-wrap').hidden = true;
    $('inspection-new-analyst-name').required = false;
    return;
  }

  select.disabled = false;
  const options = ['<option value="">Selecione o analista responsável</option>'];
  analysts.filter(item => item.active && item.role === 'ANALYST').forEach(analyst => {
    options.push(`<option value="${analyst.id}">${esc(analyst.name)}</option>`);
  });
  options.push('<option value="__NEW__">+ Cadastrar novo analista</option>');
  select.innerHTML = options.join('');

  const previousId = item?.reviewedByRole === 'ANALYST' ? item.reviewedByCollaboratorId : null;
  if (previousId && analysts.some(analyst => analyst.id === previousId && analyst.active)) {
    select.value = previousId;
  } else if (!analysts.some(analyst => analyst.active && analyst.role === 'ANALYST')) {
    select.value = '__NEW__';
  } else {
    select.value = '';
  }
  helper.textContent = 'Selecione quem está realizando a análise. Se o nome não existir, cadastre-o aqui e ele será incluído automaticamente em Colaboradores como Analista.';
  syncNewAnalystInput();
}

function configureStatusOptions(item) {
  const select = $('inspection-status');
  const [value] = analystRegistrationState(item);
  select.value = value;
  select.disabled = true;
}

function openInspection(id) {
  const item = inspections.find(value => value.id === id);
  if (!item) return;
  if (item.expiredWithoutFiles) {
    window.alert('Vistoria/cotação vencida, precisa ser refeita.');
    return;
  }

  releaseMediaUrls();
  const filesAvailable = hasFiles(item);
  const needsFiles = inspectionNeedsFiles(item);
  const pendingCount = inspectionPendingCount(item);
  const currentPublicUrl = item.publicUrl
    ? (window.NH_URLS?.retratoUrl(item.publicUrl) || item.publicUrl)
    : null;

  $('inspection-id').value = item.id;
  $('dialog-title').textContent = `${item.plate || '0 km — sem placa'} — ${item.associateName}`;
  $('edit-associate-name').value = item.associateName || '';
  $('edit-associate-cpf').value = item.cpf || item.maskedCpf || '';
  $('edit-associate-whatsapp').value = formatPhone(item.whatsapp) || '';
  $('edit-associate-plate').value = item.plate || '';
  $('edit-zero-km').value = item.zeroKm ? 'true' : 'false';
  $('edit-vehicle-model').value = item.vehicleModel || '';
  $('edit-model-year').value = item.modelYear || '';
  $('edit-residence-address').value = item.residenceAddress || '';
  $('edit-contract-fipe').value = window.NHMoney?.format(item.pendingFipeValue ?? item.fipeValue) || (item.pendingFipeValue ?? item.fipeValue ?? '');
  $('edit-contract-monthly').value = window.NHMoney?.format(item.pendingMonthlyValue ?? item.monthlyValue) || (item.pendingMonthlyValue ?? item.monthlyValue ?? '');
  $('edit-contract-plan').textContent = item.selectedPlanName || item.contractedPlan || '—';
  $('edit-contract-discount').value = String(item.pendingDiscountPercent ?? item.discountPercent ?? 0);
  $('edit-contract-branding').value = item.pendingRearWindowBranding || item.rearWindowBranding || 'NOT_APPLICABLE';
  window.NHMoney?.refresh($('edit-contract-fipe'));
  window.NHMoney?.refresh($('edit-contract-monthly'));
  const editableLocked = registrationLocked(item);
  renderCommercialBenefits('edit-contract-benefits', item, editableLocked);
  refreshCommercialRules(ANALYSIS_COMMERCIAL_CONFIG, editableLocked);
  initializeCommercialPricingPreview(ANALYSIS_COMMERCIAL_CONFIG, item);
  ['edit-associate-name','edit-associate-cpf','edit-associate-whatsapp','edit-associate-plate','edit-zero-km','edit-vehicle-model','edit-model-year','edit-residence-address','save-editable-details','edit-contract-fipe','edit-contract-monthly','edit-contract-discount','edit-contract-branding','save-contract-values']
    .forEach(id => { const el = $(id); if (el) el.disabled = editableLocked; });

  const hasContractValues = item.requestType === 'NEW_INSPECTION' && item.fipeValue != null && item.monthlyValue != null;
  const contractSection = $('contract-values-section');
  if (contractSection) contractSection.hidden = item.requestType !== 'NEW_INSPECTION';
  const contractHelper = $('contract-values-helper');
  if (contractHelper) {
    contractHelper.textContent = editableLocked
      ? 'FIPE e mensalidade ficam bloqueadas depois de Cadastro feito. Para registros pendentes ou Cadastro não feito, inclusive históricos, a edição permanece disponível.'
      : (hasContractValues
          ? 'FIPE e mensalidade podem ser corrigidas enquanto o cadastro estiver pendente ou marcado como não feito, inclusive em vistorias antigas. Os valores salvos passam a valer no PPV/PDF contratual e ficam registrados no histórico.'
          : 'Esta vistoria não possui valores de cotação vinculados para edição.');
  }
  if (!hasContractValues) {
    ['edit-contract-fipe','edit-contract-monthly','edit-contract-discount','edit-contract-branding','save-contract-values'].forEach(id => { const el = $(id); if (el) el.disabled = true; });
  }

  const pendingContractBox = $('contract-change-pending');
  if (pendingContractBox) {
    pendingContractBox.hidden = !item.contractChangePending;
    if (item.contractChangePending) {
      $('contract-change-pending-text').textContent = `FIPE proposta: ${brl.format(item.pendingFipeValue)} · mensalidade com os adicionais atuais: ${brl.format(item.pendingMonthlyValue)}. O contrato só será atualizado depois da confirmação do associado.`;
      const sendLink = $('send-contract-change-link');
      sendLink.href = item.contractChangeWhatsappUrl || item.contractChangeConfirmationUrl || '#';
      sendLink.hidden = !(item.contractChangeWhatsappUrl || item.contractChangeConfirmationUrl);
      $('copy-contract-change-link').dataset.url = item.contractChangeConfirmationUrl || '';
    }
  }

  // Não deixe ações de Cadastro sumirem em registros históricos que ainda estão
  // na fila do analista. O backend continua validando a transição.
  const registrationNotComplete = $('registration-not-complete');
  const registrationComplete = $('registration-complete');
  if (registrationNotComplete) {
    registrationNotComplete.hidden = false;
    registrationNotComplete.disabled = editableLocked;
  }
  if (registrationComplete) {
    registrationComplete.hidden = false;
    registrationComplete.disabled = editableLocked || item.contractChangePending;
  }
  $('inspection-note').value = item.adminNote || '';
  $('supervision-note').value = item.supervisionNote || '';
  $('supervision-note-meta').textContent = item.supervisionNoteUpdatedAt
    ? `Última atualização: ${date(item.supervisionNoteUpdatedAt)}${item.supervisionNoteByName ? ` por ${item.supervisionNoteByName}` : ''}.`
    : 'As orientações registradas pela supervisão aparecem aqui.';
  populateAnalystReviewer(item);
  configureStatusOptions(item);

  const retentionText = filesAvailable
    ? (needsFiles
      ? `${pendingCount} ${pendingCount === 1 ? 'item pendente' : 'itens pendentes'}; os demais arquivos continuam armazenados no sistema.`
      : 'Arquivos confirmados disponíveis durante a retenção operacional de 40 dias.')
    : (Number(item.expiredAssetCount || 0) > 0
      ? 'Há arquivo histórico indisponível. Novos arquivos também seguem a retenção operacional de 40 dias.'
      : 'Aguardando envio do associado.');

  const discountPercent = Number(item.discountPercent || 0);
  const rearWindowBrandingLabel = item.rearWindowBranding === 'NH_AND_OTHER_COMPANY'
    ? 'Perfurado com NH + outra empresa'
    : item.rearWindowBranding === 'NH_ONLY'
      ? 'Perfurado somente com a logomarca NH'
      : 'Não se aplica';

  const inspectionDetails = [
    ['Associado', item.associateName],
    ['CPF', item.cpf || item.maskedCpf || '—'],
    ['WhatsApp', formatPhone(item.whatsapp) || '—'],
    ['Modelo', item.vehicleModel || '—'],
    ['Ano do modelo', item.modelYear || '—'],
    ['Consultor', item.consultantName],
    ['Analista responsável', item.assignedAnalystName || currentUser?.consultantName || '—'],
    ['Situação do cadastro', analystRegistrationState(item)[1]],
    ['Placa', item.plate || '0 km — sem placa'],
    ['Tipo', item.requestType === 'NEW_INSPECTION' ? 'Nova vistoria' : 'Atualização de boleto']
  ];

  if (item.requestType === 'BILL_UPDATE') {
    inspectionDetails.push(['Plano já contratado', item.contractedPlan || '—']);
  }

  if (item.requestType === 'NEW_INSPECTION') {
    inspectionDetails.push(['PDF da cotação', item.quotationPdfUrl ? 'Disponível para visualização' : '—']);
    if (item.billingDueDay) inspectionDetails.push(['Vencimento mensal', `Dia ${item.billingDueDay}`]);
    if (item.firstBillingDueDate) {
      inspectionDetails.push(['Primeiro vencimento', new Date(`${item.firstBillingDueDate}T12:00:00`).toLocaleDateString('pt-BR')]);
    }
  }

  if (item.requestType === 'NEW_INSPECTION' && discountPercent > 0) {
    inspectionDetails.push(['Desconto da cotação', `${discountPercent}%`]);
    if (discountPercent === 15 || discountPercent === 30) {
      inspectionDetails.push(['Condição do vigia traseiro', rearWindowBrandingLabel]);
    }
  }

  inspectionDetails.push(
    ['Criada em', date(item.createdAt)],
    ['Concluída em', date(item.completedAt)],
    ['Arquivos disponíveis', item.assetCount],
    ['Situação dos arquivos', retentionText],
    ['Endereço', item.residenceAddress || '—'],
    ['Responsável pela última análise', item.reviewedByName || '—'],
    ['Observação da última análise', item.adminNote || '—'],
    ['O.B.S. Supervisão', item.supervisionNote || '—']
  );

  $('inspection-details').innerHTML = details(inspectionDetails);

  const discountNote = $('discount-validation-note');
  if (item.requestType === 'NEW_INSPECTION' && (discountPercent === 15 || discountPercent === 30)) {
    discountNote.hidden = false;
    discountNote.className = 'message';
    discountNote.textContent = discountPercent === 15
      ? 'Validação do desconto de 15%: antes de aprovar, confira na foto da traseira se o perfurado do vigia possui a logomarca da Novo Horizonte e a logomarca da outra empresa.'
      : 'Validação do desconto de 30%: antes de aprovar, confira na foto da traseira se o perfurado do vigia possui somente a logomarca da Novo Horizonte.';
  } else {
    discountNote.hidden = true;
    discountNote.textContent = '';
  }

  $('inspection-links').innerHTML = links([
    [needsFiles ? item.associateInspectionWhatsappUrl : null, filesAvailable ? 'Enviar pendências ao associado' : 'Enviar link ao associado', 'secondary'],
    [needsFiles ? item.consultantInspectionWhatsappUrl : null, 'Enviar pendências ao consultor', 'outline'],
    [currentPublicUrl, needsFiles && filesAvailable ? 'Abrir link das pendências' : 'Abrir link da vistoria'],
    [item.requestType === 'NEW_INSPECTION' ? item.quotationPdfUrl : null, 'Ver PDF da cotação'],
    [!filesAvailable ? item.teamWhatsappUrl : null, 'Comunicar equipe pelo WhatsApp']
  ]);

  renderInspectionFiles(item);
  showNotificationButton(item);
  $('message').className = '';
  $('message').textContent = '';
  clearAnalysisDialogMessage($('inspection-dialog'));
  $('inspection-dialog').showModal();
}

function renderInspectionFiles(item) {
  const section = $('inspection-files-section');
  const grid = $('inspection-files-grid');
  const sourceAssets = Array.isArray(item.assets) ? item.assets : [];
  const assets = item.completedAt && !sourceAssets.some(asset => asset.type === 'REPORT')
    ? [...sourceAssets, { id: 'regenerated-report', type: 'REPORT', label: 'Relatório da vistoria', fileName: 'relatorio-vistoria.pdf', fileSize: 0, contentType: 'application/pdf', available: false }]
    : sourceAssets;
  const available = assets.filter(asset => asset.available);
  const expired = assets.filter(asset => !asset.available && asset.purgedAt);

  section.hidden = assets.length === 0;
  if (section.hidden) {
    grid.innerHTML = '';
    return;
  }

  $('inspection-files-retention').textContent = available.length
    ? 'Arquivos confirmados: disponíveis até o limite de retenção operacional de 40 dias.'
    : 'Há arquivo histórico indisponível. Novos arquivos também seguem a retenção operacional de 40 dias.';
  $('download-all-files').hidden = available.length === 0;
  $('download-all-files').dataset.inspectionId = item.id;

  grid.innerHTML = assets.map(asset => {
    const title = asset.label || ASSET_LABELS[asset.type] || 'Arquivo';
    const image = asset.available && String(asset.contentType || '').startsWith('image/');
    const video = asset.available && String(asset.contentType || '').startsWith('video/');
    const preview = image
      ? `<div class="inspection-media-preview"><span class="inspection-media-loading">Carregando imagem...</span><img data-image-preview="${asset.id}" alt="${esc(title)}" hidden></div>`
      : video
        ? `<div class="inspection-media-preview"><div class="inspection-media-placeholder">▶ Vídeo disponível</div><video data-video-preview="${asset.id}" controls hidden></video></div>`
        : `<div class="inspection-media-preview"><div class="inspection-media-placeholder">${asset.type === 'REPORT' ? 'PDF' : 'DOCUMENTO'}</div></div>`;
    const canDelete = asset.available && !item.digitalAcceptedAt && ['PHOTO', 'VIDEO', 'SIGNATURE', 'VEHICLE_DOCUMENT', 'IDENTITY_DOCUMENT'].includes(asset.type);
    const legacyLargeVideo = video && Number(asset.fileSize || 0) > 15 * 1024 * 1024;
    const downloadName = legacyLargeVideo ? compactedVideoFileName(asset.fileName) : asset.fileName;
    const compressionNote = legacyLargeVideo
      ? '<small class="inspection-media-note">Vídeo original preservado sem limite de MB.</small>'
      : '';
    const canRegenerateReport = asset.type === 'REPORT' && Boolean(item.completedAt);
    const actions = canRegenerateReport
      ? `<div class="inspection-media-actions"><button class="secondary" data-analysis-download-report="${item.id}" type="button">Baixar relatório</button></div>`
      : asset.available
        ? `<div class="inspection-media-actions">${video ? `<button class="outline" data-play-video="${asset.id}" type="button">Reproduzir</button>` : ''}<button class="secondary" data-download-asset="${asset.id}" data-file-name="${esc(downloadName)}" type="button">${legacyLargeVideo ? 'Baixar WebM' : 'Baixar'}</button>${canDelete ? `<button class="danger" data-delete-asset="${asset.id}" data-file-name="${esc(title)}" type="button">Excluir / solicitar novamente</button>` : ''}</div>`
        : `<div class="inspection-media-expired">${inspectionNeedsFiles(item) && asset.type !== 'REPORT' ? 'Arquivo excluído / aguardando reenvio.' : 'Arquivo histórico indisponível.'}</div>`;
    return `<article class="inspection-media-card ${asset.available ? '' : 'expired'}">${preview}<div class="inspection-media-body"><strong>${esc(title)}</strong><small>${esc(asset.fileName)}</small><small>${formatBytes(asset.fileSize)} · ${esc(asset.contentType || 'arquivo')}</small>${compressionNote}${actions}</div></article>`;
  }).join('');

  available.filter(asset => String(asset.contentType || '').startsWith('image/')).forEach(asset => loadImagePreview(item.id, asset));
  grid.querySelectorAll('[data-download-asset]').forEach(button => {
    button.addEventListener('click', () => downloadAsset(item.id, button.dataset.downloadAsset, button.dataset.fileName, button));
  });
  grid.querySelectorAll('[data-analysis-download-report]').forEach(button => {
    button.addEventListener('click', () => downloadAnalysisReport(item.id, button));
  });
  grid.querySelectorAll('[data-play-video]').forEach(button => {
    button.addEventListener('click', () => playVideo(item.id, button.dataset.playVideo, button));
  });
  grid.querySelectorAll('[data-delete-asset]').forEach(button => {
    button.addEventListener('click', () => deleteInspectionAsset(
      item.id, button.dataset.deleteAsset, button.dataset.fileName || 'arquivo', button
    ));
  });
}

async function deleteInspectionAsset(inspectionId, assetId, label, button) {
  const confirmed = await confirmAnalysisAction(
    'Excluir arquivo da vistoria?',
    `O arquivo “${label}” será excluído. Os demais arquivos aceitos serão mantidos e o mesmo link da vistoria passará a pedir somente esta pendência (e qualquer outra que estiver faltando).`,
    'Excluir e solicitar novamente'
  );
  if (!confirmed) return;

  const dialog = $('inspection-dialog');
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Excluindo...';
  try {
    await api(`/api/analysis/inspections/${encodeURIComponent(inspectionId)}/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
    releaseMediaUrls();
    if (dialog.open) dialog.close();
    await load();
    const updated = inspections.find(item => item.id === inspectionId);
    if (updated) openInspection(inspectionId);
    message('Arquivo excluído. A vistoria foi reaberta e o link agora pede somente os arquivos pendentes.', 'success');
  } catch (error) {
    message(error.message);
    button.disabled = false;
    button.textContent = original;
  }
}

async function loadImagePreview(inspectionId, asset) {
  const image = document.querySelector(`[data-image-preview="${asset.id}"]`);
  if (!image) return;
  const loading = image.parentElement.querySelector('.inspection-media-loading');
  try {
    const blob = await apiBlob(`/api/analysis/inspections/${inspectionId}/assets/${asset.id}`);
    const url = URL.createObjectURL(blob);
    mediaObjectUrls.add(url);
    image.src = url;
    image.hidden = false;
    if (loading) loading.remove();
  } catch (error) {
    if (loading) loading.textContent = error.message;
  }
}

async function playVideo(inspectionId, assetId, button) {
  const video = document.querySelector(`[data-video-preview="${assetId}"]`);
  if (!video) return;
  button.disabled = true;
  button.textContent = 'Carregando...';
  try {
    const blob = await apiBlob(`/api/analysis/inspections/${inspectionId}/assets/${assetId}`);
    const url = URL.createObjectURL(blob);
    mediaObjectUrls.add(url);
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


function compactedVideoFileName(fileName) {
  const value = String(fileName || 'video-vistoria').trim();
  const dot = value.lastIndexOf('.');
  const base = dot > 0 ? value.slice(0, dot) : value;
  return `${base}-compactado.webm`;
}

async function downloadAsset(inspectionId, assetId, fileName, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Baixando...';
  try {
    const blob = await apiBlob(`/api/analysis/inspections/${inspectionId}/assets/${assetId}?download=true`);
    triggerDownload(blob, fileName || 'arquivo-vistoria');
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function downloadAnalysisReport(inspectionId, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Gerando relatório...';
  try {
    const blob = await apiBlob(`/api/analysis/inspections/${inspectionId}/report`);
    triggerDownload(blob, `relatorio-vistoria-${inspectionId}.pdf`);
  } catch (error) {
    message(error.message);
    await confirmAnalysisAction('Erro ao baixar relatório', error.message || 'Não foi possível gerar o relatório desta vistoria.', 'Fechar');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function downloadAllFiles() {
  const id = $('download-all-files').dataset.inspectionId;
  if (!id) return;
  const button = $('download-all-files');
  button.disabled = true;
  button.textContent = 'Preparando pacote...';
  try {
    const blob = await apiBlob(`/api/analysis/inspections/${id}/assets.zip`);
    triggerDownload(blob, `arquivos-vistoria-${id}.zip`);
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Baixar todos (.zip)';
  }
}

function showNotificationButton(item) {
  const box = $('associate-notification');
  const button = $('notify-associate');
  if (item?.associateDecisionWhatsappUrl && item.associateDecisionMessagePending) {
    button.textContent = item.status === 'APPROVED'
      ? 'Enviar aprovação ao associado'
      : 'Enviar recusa ao associado';
    button.dataset.inspectionId = item.id;
    box.hidden = false;
  } else {
    button.removeAttribute('data-inspection-id');
    box.hidden = true;
  }
}

$('registration-not-complete').addEventListener('click', async () => {
  const id = $('inspection-id').value;
  const item = inspections.find(value => value.id === id);
  if (!item) return;
  if (inspectionNeedsFiles(item)) {
    return message('Esta vistoria está em Aguardando documentos. Só é possível marcar Cadastro não feito depois que todos os documentos estiverem disponíveis.');
  }
  const confirmed = await confirmAnalysisAction(
    'Marcar Cadastro não feito?',
    'A vistoria permanecerá na sua fila de cadastro. A aprovação ou rejeição final não é feita pela Equipe de Análise.',
    'Cadastro não feito'
  );
  if (!confirmed) return;
  const button = $('registration-not-complete');
  button.disabled = true;
  try {
    const updated = await api(`/api/analysis/inspections/${encodeURIComponent(id)}/registration-not-complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: $('inspection-note').value.trim() })
    });
    const index = inspections.findIndex(value => value.id === updated.id);
    if (index >= 0) inspections[index] = updated;
    render();
    configureStatusOptions(updated);
    message('Situação atualizada para Cadastro não feito.', 'success');
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
  }
});

$('registration-complete').addEventListener('click', async () => {
  const id = $('inspection-id').value;
  const item = inspections.find(value => value.id === id);
  if (!item) return;
  if (inspectionNeedsFiles(item)) {
    return message('Ainda existem arquivos pendentes. Conclua o envio antes de marcar Cadastro feito.');
  }
  const confirmed = await confirmAnalysisAction(
    'Marcar Cadastro feito?',
    'A vistoria sairá do seu painel e será enviada para a Supervisão de Análise. Se a supervisão reprovar alguma imagem ou vídeo, ela voltará para sua aba Pendências de vistoria.',
    'Cadastro feito'
  );
  if (!confirmed) return;
  const button = $('registration-complete');
  button.disabled = true;
  try {
    await api(`/api/analysis/inspections/${encodeURIComponent(id)}/registration-complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: $('inspection-note').value.trim() })
    });
    $('inspection-dialog').close();
    await load();
    message('Cadastro concluído. A vistoria foi encaminhada para a Supervisão de Análise.', 'success');
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
  }
});

$('save-editable-details').addEventListener('click', async () => {
  const id = $('inspection-id').value;
  if (!id) return;
  const button = $('save-editable-details');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Salvando...';
  try {
    const updated = await api(`/api/analysis/inspections/${encodeURIComponent(id)}/details`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        associateName: $('edit-associate-name').value.trim(),
        cpf: normalizedCpf($('edit-associate-cpf').value),
        whatsapp: $('edit-associate-whatsapp').value.trim(),
        plate: $('edit-associate-plate').value.trim(),
        zeroKm: $('edit-zero-km').value === 'true',
        model: $('edit-vehicle-model').value.trim(),
        modelYear: Number($('edit-model-year').value),
        residenceAddress: $('edit-residence-address').value.trim()
      })
    });
    const index = inspections.findIndex(item => item.id === updated.id);
    if (index >= 0) inspections[index] = updated;
    render();
    openInspection(updated.id);
    message('Dados do associado e veículo atualizados. A cotação vinculada foi sincronizada.', 'success');
  } catch (error) { message(error.message); }
  finally { button.disabled = false; button.textContent = original; }
});

$('save-contract-values').addEventListener('click', async () => {
  const id = $('inspection-id').value;
  if (!id) return;

  const manualMonthlyOverride = false;
  const preview = await requestCommercialPricingPreview(ANALYSIS_COMMERCIAL_CONFIG, true);
  if (!preview) return message('Não foi possível recalcular o valor pela tabela atual do plano.');
  const fipeValue = window.NHMoney?.parse($('edit-contract-fipe').value);
  const monthlyValue = window.NHMoney?.parse($('edit-contract-monthly').value);
  const discountPercent = Number($('edit-contract-discount').value || 0);
  const rearWindowBranding = $('edit-contract-branding').value || 'NOT_APPLICABLE';
  const benefitCodes = selectedCommercialBenefits('edit-contract-benefits');
  if (!Number.isFinite(fipeValue) || fipeValue <= 0) return message('Informe um valor FIPE válido.');
  if (!Number.isFinite(monthlyValue) || monthlyValue <= 0) return message('Informe uma mensalidade válida.');

  const confirmed = await confirmAction(
    'Alterar valores do contrato',
    `Confirma a alteração da FIPE para ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fipeValue)} e da mensalidade para ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(monthlyValue)}? Se a mensalidade mudar, o novo valor só será aplicado ao PPV/PDF depois da confirmação do associado.`
  );
  if (!confirmed) return;

  const button = $('save-contract-values');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Salvando...';
  try {
    const updated = await api(`/api/analysis/inspections/${encodeURIComponent(id)}/contract-values`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fipeValue, monthlyValue, discountPercent, rearWindowBranding, benefitCodes, manualMonthlyOverride })
    });
    const index = inspections.findIndex(item => item.id === updated.id);
    if (index >= 0) inspections[index] = updated;
    render();
    openInspection(updated.id);
    message(updated.contractChangePending ? 'Novo valor preparado. Envie o link ao associado; o contrato só será atualizado após a confirmação dele.' : 'Revisão comercial salva no dossiê final.', 'success');
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});


$('copy-contract-change-link')?.addEventListener('click', async () => {
  const url = $('copy-contract-change-link').dataset.url || '';
  if (!url) return message('Não há link de confirmação pendente.');
  try {
    await navigator.clipboard.writeText(url);
    message('Link de confirmação copiado.', 'success');
  } catch (_error) {
    window.prompt('Copie o link abaixo:', url);
  }
});

$('inspection-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('inspection-id').value;
  try {
    const analystChoice = $('inspection-analyst').value;
    const currentItem = inspections.find(value => value.id === id);
    const payload = {
      // A Equipe de Análise não aprova/rejeita. Este endpoint serve somente
      // para salvar observação mantendo a situação operacional atual.
      status: inspectionNeedsFiles(currentItem)
        ? (currentItem?.status === 'UPLOADING_FILES' ? 'UPLOADING_FILES' : 'WAITING_FILES')
        : 'UNDER_REVIEW',
      adminNote: $('inspection-note').value.trim()
    };
    if (currentUser?.consultantId) {
      payload.analystId = currentUser.consultantId;
    } else if (analystChoice === '__NEW__') {
      payload.analystName = $('inspection-new-analyst-name').value.trim();
      if (!payload.analystName) return message('Informe o nome do analista responsável.');
    } else if (analystChoice) {
      payload.analystId = analystChoice;
    } else {
      return message('Selecione o analista responsável pela análise.');
    }

    const updated = await api(`/api/analysis/inspections/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const index = inspections.findIndex(item => item.id === updated.id);
    if (index >= 0) inspections[index] = updated;
    if (payload.analystName) {
      analysts = await api('/api/analysis/inspections/analysts');
    }
    render();
    showNotificationButton(updated);
    message('Observação salva com sucesso.', 'success');
    if (updated.associateDecisionWhatsappUrl && updated.associateDecisionMessagePending) {
      $('inspection-dialog').close();
      openDecisionCommunication(updated);
    }
  } catch (error) {
    message(error.message);
  }
});

function openDecisionCommunication(item) {
  if (!item?.associateDecisionWhatsappUrl) return;
  activeDecisionCommunication = item;
  const approved = item.status === 'APPROVED';
  $('decision-whatsapp-icon').textContent = approved ? '✓' : '!';
  $('decision-whatsapp-icon').classList.toggle('rejected', !approved);
  $('decision-whatsapp-text').textContent = approved
    ? `A vistoria de ${item.associateName} foi aprovada. Comunique a aprovação ao associado.`
    : `A vistoria de ${item.associateName} foi rejeitada. Comunique a rejeição e as orientações ao associado.`;
  $('decision-whatsapp-details').innerHTML = `<div><span>Associado</span><strong>${esc(item.associateName)}</strong></div><div><span>Veículo</span><strong>${esc(item.plate || '0 km — sem placa')}</strong></div><div><span>Novo status</span><strong>${approved ? 'Aprovada' : 'Rejeitada'}</strong></div>`;
  $('message').className = '';
  $('message').textContent = '';
  clearAnalysisDialogMessage($('decision-whatsapp-dialog'));
  $('decision-whatsapp-dialog').showModal();
}

async function sendDecisionCommunication() {
  const item = activeDecisionCommunication;
  if (!item) return;
  window.open(item.associateDecisionWhatsappUrl, '_blank', 'noopener,noreferrer');
  const button = $('decision-whatsapp-send');
  button.disabled = true;
  button.textContent = 'Registrando...';
  try {
    const updated = await api(`/api/analysis/inspections/${encodeURIComponent(item.id)}/decision-message-sent`, { method: 'POST' });
    const index = inspections.findIndex(value => value.id === updated.id);
    if (index >= 0) inspections[index] = updated;
    $('decision-whatsapp-dialog').close();
    activeDecisionCommunication = null;
    render();
    message('Mensagem preparada no WhatsApp. Comunicação registrada.', 'success');
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Enviar mensagem ao associado';
  }
}

$('inspection-analyst').addEventListener('change', syncNewAnalystInput);
$('notify-associate').addEventListener('click', () => {
  const id = $('notify-associate').dataset.inspectionId;
  const item = inspections.find(value => value.id === id);
  if (item) openDecisionCommunication(item);
});
$('decision-whatsapp-send').addEventListener('click', () => sendDecisionCommunication());
$('decision-whatsapp-later').addEventListener('click', () => {
  $('decision-whatsapp-dialog').close();
  activeDecisionCommunication = null;
});

function openFirstPasswordDialog() {
  const dialog = $('first-password-dialog');
  $('first-current-password').value = '';
  $('first-new-password').value = '';
  $('first-confirm-password').value = '';
  $('first-password-message').className = '';
  $('first-password-message').textContent = '';
  if (!dialog.open) dialog.showModal();
}

$('first-password-dialog').addEventListener('cancel', event => event.preventDefault());

$('first-password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const box = $('first-password-message');
  const currentPassword = $('first-current-password').value;
  const newPassword = $('first-new-password').value;
  if (newPassword !== $('first-confirm-password').value) {
    box.className = 'message error'; box.textContent = 'As novas senhas não são iguais.'; return;
  }
  try {
    currentUser = await api('/api/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    $('first-password-dialog').close();
    message('Senha alterada com sucesso. Bem-vindo ao seu painel!', 'success');
    await load();
  } catch (error) {
    box.className = 'message error'; box.textContent = error.message;
  }
});

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
    token = data.token;
    markSessionActivity(true);
    currentUser = data;
    if (data.role === 'ADMIN') {
      location.href = '/admin/';
    } else if (data.role === 'SUPERVISION_ANALYSIS') {
      location.href = '/supervisao/';
    } else if (data.role === 'ANALYST') {
      showView();
      if (data.passwordChangeRequired) openFirstPasswordDialog();
      else await load();
    } else if (data.role === 'TOW_DRIVER') {
      location.href = '/guincho/';
    } else if (data.role === 'WORKSHOP_MANAGER') {
      location.href = '/oficina/';
    } else if (data.role === 'EVENT_OPERATOR') {
      location.href = '/checklist/';
    } else if (data.role === 'BUYER') {
      location.href = '/financeiro/';
    } else {
      location.href = '/colaborador/';
    }
  } catch (error) {
    box.className = 'message error';
    box.textContent = error.message;
  }
});

$('download-all-files').addEventListener('click', downloadAllFiles);
document.querySelectorAll('[data-analysis-queue]').forEach(button => {
  button.addEventListener('click', () => {
    activeAnalysisQueue = button.dataset.analysisQueue || 'review';
    render();
  });
});
$('filter').addEventListener('input', render);
$('refresh').addEventListener('click', () => load().catch(error => message(error.message)));
$('close-dialog').addEventListener('click', () => { releaseMediaUrls(); $('inspection-dialog').close(); });
$('cancel-dialog').addEventListener('click', () => { releaseMediaUrls(); $('inspection-dialog').close(); });
$('inspection-dialog').addEventListener('close', () => { clearAnalysisDialogMessage($('inspection-dialog')); releaseMediaUrls(); });
$('logout').addEventListener('click', () => showLogin());

window.addEventListener('pageshow', () => {
  if (!token) return;
  if (sessionExpired()) showLogin('Sua sessão expirou. Entre novamente.');
  else if (inactivityExpired()) showLogin('Sessão encerrada após 20 minutos de inatividade. Entre novamente.');
  else scheduleInactivityCheck();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !token) return;
  if (sessionExpired()) showLogin('Sua sessão expirou. Entre novamente.');
  else if (inactivityExpired()) showLogin('Sessão encerrada após 20 minutos de inatividade. Entre novamente.');
  else scheduleInactivityCheck();
});

installInactivityTracking();
if (token && lastActivityAtMs() === null) markSessionActivity(true);
else scheduleInactivityCheck();
boot();

bindCommercialPricingPreview(ANALYSIS_COMMERCIAL_CONFIG);
