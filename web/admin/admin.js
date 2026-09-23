const TOKEN_KEY = 'nhPortalToken';
const ROLE_KEY = 'nhPortalRole';
const CONSULTANT_KEY = 'nhSelectedConsultant';
const LAST_ACTIVITY_KEY = 'nhPortalLastActivityAt';
const INACTIVITY_LIMIT_MS = 20 * 60 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 15 * 1000;
const $ = id => document.getElementById(id);

let token = localStorage.getItem(TOKEN_KEY);
let inactivityTimer = null;
let lastActivityWriteAt = 0;
let consultants = [];
let users = [];
let quotes = [];
let inspections = [];
let nhEvents = [];
let workshopEvents = [];
let procurementEvents = [];
let towRecords = [];
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
let adminFilePreviewUrl = null;
let adminAcceptanceInfo = null;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
const timestampMs = value => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
function localDateBoundary(value, endOfDay = false) {
  if (!value) return null;
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime();
}
function matchesDateRange(value, fromValue, toValue) {
  if (!fromValue && !toValue) return true;
  const point = timestampMs(value);
  if (!point) return false;
  const from = localDateBoundary(fromValue, false);
  const to = localDateBoundary(toValue, true);
  if (from !== null && point < from) return false;
  if (to !== null && point > to) return false;
  return true;
}
function compareByDateField(a, b, field, direction = 'desc') {
  const left = timestampMs(a?.[field] || a?.createdAt);
  const right = timestampMs(b?.[field] || b?.createdAt);
  const primary = direction === 'asc' ? left - right : right - left;
  if (primary !== 0) return primary;
  const createdLeft = timestampMs(a?.createdAt);
  const createdRight = timestampMs(b?.createdAt);
  return direction === 'asc' ? createdLeft - createdRight : createdRight - createdLeft;
}
const REGION_LABELS = Object.freeze({ NATIONAL: 'Nacional', NORTHEAST: 'Nordeste', CAPITAL: 'Capital' });
const MOTORCYCLE_ORIGIN_LABELS = Object.freeze({ NORTHEAST: 'Demais cidades do Nordeste', CAPITAL: 'Capital' });
const QUOTE_STATUS_LABELS = Object.freeze({
  CREATED: ['Pendente', 'warn'], UNDER_REVIEW: ['Em análise', 'warn'], ACCEPTED: ['Aceita', 'ok'],
  DECLINED: ['Recusada', 'off'], CANCELLED: ['Cancelada', 'off']
});
const INSPECTION_STATUS_LABELS = Object.freeze({
  WAITING_FILES: ['Aguardando arquivos', 'warn'], UPLOADING_FILES: ['Envio em andamento', 'warn'], CREATED: ['Pendente', 'warn'],
  UNDER_REVIEW: ['Em análise', 'warn'], COMPLETED: ['Material enviado', 'ok'],
  APPROVED: ['Aprovada', 'ok'], REJECTED: ['Rejeitada', 'off'], CANCELLED: ['Cancelada', 'off'], EXPIRED: ['Expirada', 'off']
});
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

const ADMIN_COMMERCIAL_CONFIG = Object.freeze({
  discountId: 'admin-contract-discount',
  brandingId: 'admin-contract-branding',
  fipeId: 'admin-contract-fipe',
  benefitsId: 'admin-contract-benefits',
  monthlyId: 'admin-contract-monthly',
  inspectionIdId: 'inspection-analysis-id',
  previewApiBase: '/api/admin/inspections',
  previewBaseId: 'admin-preview-base',
  previewMandatoryId: 'admin-preview-mandatory',
  previewMandatoryLabelId: 'admin-preview-mandatory-label',
  previewOptionalsId: 'admin-preview-optionals',
  previewSubtotalId: 'admin-preview-subtotal',
  previewOneTimeId: 'admin-preview-one-time',
  previewDiscountId: 'admin-preview-discount',
  previewFinalId: 'admin-preview-final',
  previewFinalNoteId: 'admin-preview-final-note',
  previewDiscountLabelId: 'admin-preview-discount-label'
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
  localStorage.removeItem(LAST_ACTIVITY_KEY);
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = null;
  token = null;
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
  if (token && (response.status === 401 || response.status === 403)) {
    showLogin('Sua sessão administrativa expirou. Entre novamente.');
    const error = new Error('Sessão administrativa inválida.');
    error.authExpired = true;
    throw error;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || body?.detail || 'Não foi possível concluir a operação.');
  }
  return response.status === 204 ? null : response.json();
}

async function adminSessionStillValid() {
  if (!token) return false;
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  try {
    const response = await fetch(window.NH_API?.backend('/api/auth/me') || '/api/auth/me', { headers, cache: 'no-store' });
    return response.ok;
  } catch (_) {
    // Falha temporária de rede não deve apagar uma sessão válida.
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
    showLogin('Sua sessão administrativa expirou. Entre novamente.');
    const error = new Error('Sessão administrativa inválida.');
    error.authExpired = true;
    throw error;
  }
  if (token && response.status === 403) {
    const sessionValid = await adminSessionStillValid();
    if (!sessionValid) {
      showLogin('Sua sessão administrativa expirou. Entre novamente.');
      const error = new Error('Sessão administrativa inválida.');
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

function activeAdminDialog() {
  const opened = [...document.querySelectorAll('dialog.admin-dialog[open]')];
  return opened.length ? opened[opened.length - 1] : null;
}

function dialogMessageElement(dialog) {
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

function clearDialogMessage(dialog) {
  const element = dialog?.querySelector('[data-dialog-message]');
  if (!element) return;
  element.className = '';
  element.textContent = '';
}

function message(text, type = 'error') {
  const dialog = activeAdminDialog();
  if (dialog) {
    const element = dialogMessageElement(dialog);
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

function clearMessage() {
  $('message').className = '';
  $('message').textContent = '';
  document.querySelectorAll('dialog.admin-dialog').forEach(clearDialogMessage);
}

function statusBadge(text, kind = '') {
  return `<span class="badge ${kind}">${esc(text)}</span>`;
}

function quoteBadge(item) {
  if (item.expired) return statusBadge('Expirada', 'off');
  const [label, kind] = QUOTE_STATUS_LABELS[item.status] || [item.status, ''];
  return statusBadge(label, kind);
}

function inspectionBadge(status) {
  const [label, kind] = INSPECTION_STATUS_LABELS[status] || [status, ''];
  return statusBadge(label, kind);
}

function inspectionWorkflowBadge(item) {
  if (!item) return inspectionBadge('UNDER_REVIEW');
  if (!['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(item.status)) {
    if (adminInspectionNeedsFiles(item) || item.analysisStage === 'ANALYST_PENDING') {
      return statusBadge('Aguardando documentos', 'warn');
    }
    if (item.analysisStage === 'SUPERVISION_QUEUE' || item.registrationCompletedAt) {
      return statusBadge('Cadastro realizado', 'ok');
    }
    if (item.analysisStage === 'ANALYST_QUEUE') {
      return statusBadge('Cadastro não feito', 'warn');
    }
  }
  return inspectionBadge(item.status);
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
  $('message').className = '';
  $('message').textContent = '';
  clearDialogMessage(dialog);
  if (!dialog.open) dialog.showModal();
}

function closeDialog(id) {
  const dialog = $(id);
  clearDialogMessage(dialog);
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
      api('/api/checklist/events'),
      api('/api/workshop/events'),
      api('/api/procurement/events'),
      api('/api/tow/records'),
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
    [consultants, users, quotes, inspections, nhEvents, workshopEvents, procurementEvents, towRecords, categories, prices, promotionalMotorcyclePrices, plans, coverages, auditEntries, settings, regulationDocument, publicQuoteAssignmentSettings] = result;
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
  renderAdminEvents();
  renderAdminWorkshop();
  renderAdminPurchases();
  renderAdminTow();
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

  const inspectionSummary = [
    ['Aguardando documentos', 'warn', inspections.filter(item => !['APPROVED','REJECTED','CANCELLED','EXPIRED'].includes(item.status) && (adminInspectionNeedsFiles(item) || item.analysisStage === 'ANALYST_PENDING')).length],
    ['Cadastro não feito', 'warn', inspections.filter(item => !['APPROVED','REJECTED','CANCELLED','EXPIRED'].includes(item.status) && !adminInspectionNeedsFiles(item) && item.analysisStage === 'ANALYST_QUEUE').length],
    ['Cadastro feito', 'ok', inspections.filter(item => !['APPROVED','REJECTED','CANCELLED','EXPIRED'].includes(item.status) && (item.analysisStage === 'SUPERVISION_QUEUE' || item.registrationCompletedAt)).length],
    ['Aprovada', 'ok', inspections.filter(item => item.status === 'APPROVED').length],
    ['Rejeitada', 'off', inspections.filter(item => item.status === 'REJECTED').length]
  ];
  $('inspection-status-summary').innerHTML = inspectionSummary.map(([label, kind, count]) =>
    `<div><span>${statusBadge(label, kind)}</span><strong>${count}</strong></div>`
  ).join('');

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
    person: item.associateName, plate: item.plate, statusHtml: inspectionWorkflowBadge(item)
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
    <td><strong>${esc(item.name)}</strong></td>
    <td>${statusBadge(collaboratorRoleLabel(item.role), item.role === 'ANALYST' ? 'warn' : item.role === 'SUPERVISION_ANALYSIS' ? 'ok' : '')}</td>
    <td>${esc(item.city || '—')}</td>
    <td>${esc(formatPhone(item.whatsapp) || 'Não cadastrado')}</td>
    <td>${item.role === 'CONSULTANT' ? esc(item.assignedAnalystName || 'Não vinculado') : item.role === 'ANALYST' ? `${Number(item.assignedConsultantCount || 0)}/30 consultores` : 'Supervisão'}</td>
    <td>${item.quoteCount}</td>
    <td>${item.inspectionCount}</td><td>${statusBadge(item.active ? 'Ativo' : 'Inativo', item.active ? 'ok' : 'off')}</td>
    <td><div class="row-actions">
      <button class="secondary small-button" data-consultant-edit="${item.id}" type="button">Editar</button>
      <button class="outline small-button" data-consultant-toggle="${item.id}" type="button">${item.active ? 'Desativar' : 'Ativar'}</button>
      <button class="danger small-button" data-consultant-delete="${item.id}" type="button">Excluir</button>
    </div></td>
  </tr>`).join('') || emptyRow(9, 'Nenhum colaborador cadastrado.');

  document.querySelectorAll('[data-consultant-edit]').forEach(button => button.addEventListener('click', () => openConsultantModal(button.dataset.consultantEdit)));
  document.querySelectorAll('[data-consultant-toggle]').forEach(button => button.addEventListener('click', () => toggleConsultant(button.dataset.consultantToggle)));
  document.querySelectorAll('[data-consultant-delete]').forEach(button => button.addEventListener('click', () => deleteConsultant(button.dataset.consultantDelete)));
}

async function toggleConsultant(id) {
  const item = consultants.find(value => value.id === id);
  if (!item) return;
  if (item.active) {
    const confirmed = await confirmAction(
      'Desativar colaborador?',
      `${item.name} deixará de aparecer nas novas seleções do cargo ${collaboratorRoleLabel(item.role).toLowerCase()}. O histórico será mantido.`,
      'Desativar'
    );
    if (!confirmed) return;
  }
  try {
    await api(`/api/admin/consultants/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active })
    });
    message(item.active ? 'Colaborador desativado.' : 'Colaborador ativado.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

async function deleteConsultant(id) {
  const item = consultants.find(value => value.id === id);
  if (!item) return;
  const confirmed = await confirmAction(
    'Excluir colaborador?',
    `${item.name} será removido da lista. O histórico já registrado continuará salvo com o nome do colaborador.`,
    'Excluir definitivamente'
  );
  if (!confirmed) return;
  try {
    await api(`/api/admin/consultants/${id}`, { method: 'DELETE' });
    message('Colaborador excluído. O histórico vinculado foi preservado.', 'success');
    await load();
  } catch (error) { message(error.message); }
}

function openConsultantModal(id = '') {
  const item = consultants.find(value => value.id === id);
  $('consultant-id').value = item?.id || '';
  $('consultant-name').value = item?.name || '';
  $('consultant-role').value = item?.role || 'CONSULTANT';
  $('consultant-whatsapp').value = formatPhone(item?.whatsapp) || '';
  $('consultant-city').value = item?.city || '';
  populateConsultantAnalysts(item);
  syncConsultantWhatsappField();
  $('consultant-active-wrap').hidden = !item;
  $('consultant-active').checked = item?.active ?? true;
  $('consultant-dialog-title').textContent = item ? 'Editar colaborador' : 'Cadastrar colaborador';
  openDialog('consultant-dialog');
  $('consultant-name').focus();
}

function roleLabel(role) {
  return ({ ADMIN: 'Administrador', SUPERVISION_ANALYSIS: 'Supervisão de Análise', ANALYST: 'Analista', CONSULTANT: 'Consultor', TOW_DRIVER: 'Guincho / Reboque', WORKSHOP_MANAGER: 'Gerente da Oficina', EVENT_OPERATOR: 'Eventos', BUYER: 'Comprador / Financeiro' })[role] || role || '—';
}

function collaboratorRoleLabel(role) {
  return role === 'ANALYST' ? 'Analista' : role === 'SUPERVISION_ANALYSIS' ? 'Supervisão de Análise' : 'Consultor';
}

function populateConsultantAnalysts(item = null) {
  const select = $('consultant-assigned-analyst');
  if (!select) return;
  const options = ['<option value="">Selecione um analista</option>'];
  consultants
    .filter(value => value.active && value.role === 'ANALYST')
    .forEach(value => {
      const count = Number(value.assignedConsultantCount || 0);
      const current = String(item?.assignedAnalystId || '') === String(value.id);
      const full = count >= 30 && !current;
      options.push(`<option value="${value.id}" ${full ? 'disabled' : ''}>${esc(value.name)} · ${count}/30${full ? ' · equipe completa' : ''}</option>`);
    });
  select.innerHTML = options.join('');
  select.value = item?.assignedAnalystId || '';
}

function syncConsultantWhatsappField() {
  const isConsultant = $('consultant-role').value === 'CONSULTANT';
  $('consultant-whatsapp-wrap').hidden = false;
  $('consultant-whatsapp-help').hidden = false;
  $('consultant-whatsapp-help').textContent = isConsultant
    ? 'O Admin pode alterar este número a qualquer momento. Ele também será usado para receber a escolha de plano e adicionais enviada pelo associado.'
    : 'O Admin pode cadastrar ou alterar o WhatsApp deste colaborador a qualquer momento.';
  if ($('consultant-analyst-wrap')) $('consultant-analyst-wrap').hidden = !isConsultant;
  if (isConsultant) populateConsultantAnalysts(consultants.find(value => value.id === $('consultant-id').value) || null);
}

function renderUsers() {
  $('users-body').innerHTML = users.map(item => `<tr>
    <td><strong>${esc(item.username)}</strong></td>
    <td>${esc(item.displayName || '—')}</td>
    <td>${['CONSULTANT', 'ANALYST', 'SUPERVISION_ANALYSIS'].includes(item.role)
      ? esc(item.consultantName || (item.createdBy === 'BOOTSTRAP' ? 'Usuário padrão — identificação manual' : '—'))
      : '—'}</td>
    <td>${statusBadge(roleLabel(item.role), item.role === 'ADMIN' || item.role === 'SUPERVISION_ANALYSIS' ? 'ok' : item.role === 'ANALYST' || item.role === 'TOW_DRIVER' || item.role === 'WORKSHOP_MANAGER' || item.role === 'EVENT_OPERATOR' || item.role === 'BUYER' ? 'warn' : '')}</td>
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
  const role = $('user-role').value;
  const collaboratorRole = role === 'ANALYST' ? 'ANALYST' : role === 'SUPERVISION_ANALYSIS' ? 'SUPERVISION_ANALYSIS' : 'CONSULTANT';
  const roleLabelText = collaboratorRole === 'ANALYST' ? 'analista' : collaboratorRole === 'SUPERVISION_ANALYSIS' ? 'supervisor de análise' : 'consultor';
  $('user-collaborator-label').textContent = collaboratorRole === 'ANALYST' ? 'Analista vinculado' : collaboratorRole === 'SUPERVISION_ANALYSIS' ? 'Supervisor vinculado' : 'Consultor vinculado';
  $('user-new-collaborator-label').textContent = collaboratorRole === 'ANALYST' ? 'Nome do novo analista' : collaboratorRole === 'SUPERVISION_ANALYSIS' ? 'Nome do novo supervisor' : 'Nome do novo consultor';
  $('user-new-consultant-name').placeholder = collaboratorRole === 'ANALYST' ? 'Nome completo do analista' : collaboratorRole === 'SUPERVISION_ANALYSIS' ? 'Nome completo do supervisor' : 'Nome completo do consultor';

  const options = [`<option value="">Selecione um ${roleLabelText} ativo</option>`];
  if (item?.role === role && !item.consultantId && item.createdBy === 'BOOTSTRAP') {
    options.push('<option value="__LEGACY__">Usuário padrão — identificação manual</option>');
  }
  consultants
    .filter(collaborator => collaborator.active && collaborator.role === collaboratorRole)
    .forEach(collaborator => options.push(`<option value="${collaborator.id}">${esc(collaborator.name)}</option>`));
  options.push(`<option value="__NEW__">+ Cadastrar novo ${roleLabelText}</option>`);
  select.innerHTML = options.join('');

  if (item?.consultantId && item.role === role) select.value = item.consultantId;
  else if (item?.role === role && item.createdBy === 'BOOTSTRAP') select.value = '__LEGACY__';
  else select.value = '';
}

function syncUserRoleFields() {
  const role = $('user-role').value;
  const collaboratorMode = ['CONSULTANT', 'ANALYST', 'SUPERVISION_ANALYSIS'].includes(role);
  $('user-consultant-wrap').hidden = !collaboratorMode;
  if (!collaboratorMode) {
    $('user-new-consultant-wrap').hidden = true;
    $('user-new-consultant-name').required = false;
    return;
  }
  const item = users.find(value => value.id === $('user-id').value) || null;
  populateUserConsultants(item);
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
  roleSelect.innerHTML = '<option value="CONSULTANT">Consultor</option><option value="ANALYST">Analista</option><option value="SUPERVISION_ANALYSIS">Supervisão de Análise</option><option value="TOW_DRIVER">Guincho / Reboque</option><option value="WORKSHOP_MANAGER">Gerente da Oficina</option><option value="EVENT_OPERATOR">Eventos</option><option value="BUYER">Comprador / Financeiro</option>';
  if (item?.role === 'ADMIN') roleSelect.insertAdjacentHTML('beforeend', '<option value="ADMIN">Administrador</option>');
  roleSelect.value = item?.role || 'CONSULTANT';

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
  if (!inspections.length) return message('Não existem vistorias para excluir.');
  const confirmed = await confirmAction(
    'Excluir TODAS as vistorias?',
    `Serão excluídas definitivamente ${inspections.length} vistorias e seus arquivos, inclusive aprovadas, rejeitadas e com documentos pendentes.`,
    'Continuar'
  );
  if (!confirmed) return;
  $('inspection-bulk-delete-password').value = '';
  message('inspection-bulk-delete-message');
  openDialog('inspection-bulk-delete-dialog');
  setTimeout(() => $('inspection-bulk-delete-password')?.focus(), 80);
}

async function confirmDeleteAllAllowedInspections(event) {
  event.preventDefault();
  const password = $('inspection-bulk-delete-password').value;
  if (!password) return message('inspection-bulk-delete-message', 'Digite a senha de confirmação.');
  const button = $('inspection-bulk-delete-confirm');
  button.disabled = true;
  message('inspection-bulk-delete-message');
  try {
    const result = await api('/api/admin/inspections', { method: 'DELETE', headers: { 'X-NH-Delete-Password': password } });
    closeDialog('inspection-bulk-delete-dialog');
    message(result.message || 'Vistorias excluídas.', 'success');
    await load();
  } catch (error) {
    message('inspection-bulk-delete-message', error.message);
  } finally { button.disabled = false; }
}

function renderQuotes() {
  const filter = $('quote-filter').value.trim().toLowerCase();
  const dateField = $('quote-date-field')?.value || 'createdAt';
  const dateFrom = $('quote-date-from')?.value || '';
  const dateTo = $('quote-date-to')?.value || '';
  const direction = $('quote-sort-direction')?.value || 'desc';

  const visibleQuotes = quotes
    .filter(item => `${quoteConsultantLabel(item)} ${quoteOriginLabel(item.origin)} ${item.customerName} ${item.plate || ""} ${item.quoteNumber}`.toLowerCase().includes(filter))
    .filter(item => matchesDateRange(item?.[dateField] || item?.createdAt, dateFrom, dateTo))
    .slice()
    .sort((a, b) => compareByDateField(a, b, dateField, direction));

  $('quotes-body').innerHTML = visibleQuotes
    .map(item => `<tr>
      <td><strong>${esc(item.quoteNumber)}</strong></td><td><strong>${esc(quoteOriginLabel(item.origin))}</strong><small class="table-subtitle">${esc(quoteConsultantLabel(item))}</small></td><td>${esc(item.customerName)}</td>
      <td>${esc(item.plate || (item.zeroKm ? '0 km — sem placa' : '—'))}</td><td>${esc(item.selectedPlanName)}</td><td>${brl.format(item.monthlyValue)}</td>
      <td>${date(item.createdAt)}</td><td>${date(item.updatedAt || item.createdAt)}</td><td>${date(item.validUntil)}</td><td>${quoteBadge(item)}</td>
      <td><div class="row-actions"><button class="secondary small-button" data-quote-analyze="${item.id}" type="button">Analisar</button><a class="button outline small-button" href="${esc(item.pdfUrl)}" target="_blank" rel="noopener">PDF</a><button class="danger small-button" data-quote-delete="${item.id}" type="button">Excluir</button></div></td>
    </tr>`).join('') || emptyRow(11, 'Nenhuma cotação encontrada para os filtros selecionados.');
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
  const active = consultants.filter(consultant => consultant.active && consultant.role === 'CONSULTANT');
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
  const associateFilter = ($('inspection-associate-filter')?.value || '').trim().toLowerCase();
  const dateField = $('inspection-date-field')?.value || 'createdAt';
  const dateFrom = $('inspection-date-from')?.value || '';
  const dateTo = $('inspection-date-to')?.value || '';
  const direction = $('inspection-sort-direction')?.value || 'desc';

  const visibleInspections = inspections
    .filter(item => `${item.consultantName} ${item.reviewedByName || ''} ${item.plate || ""}`.toLowerCase().includes(filter))
    .filter(item => !associateFilter || `${item.associateName || ''} ${item.associateNumber || ''} ${item.associateCpf || item.cpf || ''}`.toLowerCase().includes(associateFilter))
    .filter(item => matchesDateRange(item?.[dateField] || item?.createdAt, dateFrom, dateTo))
    .slice()
    .sort((a, b) => compareByDateField(a, b, dateField, direction));

  $('inspections-body').innerHTML = visibleInspections
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
        <td><strong>${esc(item.associateName)}</strong></td><td>${esc(item.consultantName)}</td><td>${esc(item.reviewedByName || '—')}</td><td>${esc(item.plate || '0 km — sem placa')}</td>
        <td>${item.requestType === 'NEW_INSPECTION' ? 'Nova vistoria' : 'Atualização de boleto'}</td><td>${item.assetCount}</td>
        <td><div class="status-with-action">${inspectionWorkflowBadge(item)}${statusAction}</div></td><td>${date(item.createdAt)}</td><td>${date(item.updatedAt || item.createdAt)}</td>
        <td><div class="row-actions">${pendingActions}<button class="secondary small-button" data-inspection-analyze="${item.id}" type="button">Analisar</button><button class="danger small-button" data-inspection-delete="${item.id}" type="button">Excluir</button></div></td>
      </tr>`;
    }).join('') || emptyRow(10, 'Nenhuma atividade do Retrato NH encontrada para os filtros selecionados.');
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
  if (item.expired) {
    window.alert('Vistoria/cotação vencida, precisa ser refeita.');
    return;
  }
  $('quote-analysis-id').value = item.id;
  $('quote-dialog-title').textContent = item.quoteNumber;
  $('quote-analysis-status').value = item.status;
  $('quote-analysis-note').value = item.adminNote || '';
  $('quote-edit-name').value = item.customerName || '';
  $('quote-edit-cpf').value = item.customerCpf || item.maskedCpf || '';
  $('quote-edit-whatsapp').value = formatPhone(item.whatsapp) || '';
  $('quote-edit-plate').value = item.plate || '';
  $('quote-edit-zero-km').value = item.zeroKm ? 'true' : 'false';
  $('quote-edit-model').value = item.model || '';
  $('quote-edit-model-year').value = item.manufactureYear || '';
  $('quote-edit-observation').value = item.observation || '';
  const quoteDetailsLocked = false; // Admin pode corrigir dados cadastrais em qualquer status; FIPE permanece fora da edição.
  ['quote-edit-name','quote-edit-cpf','quote-edit-whatsapp','quote-edit-plate','quote-edit-zero-km','quote-edit-model','quote-edit-model-year','quote-edit-observation','quote-save-details']
    .forEach(fieldId => { const el = $(fieldId); if (el) el.disabled = quoteDetailsLocked; });
  const consultantField = $('quote-analysis-consultant-field');
  consultantField.hidden = item.origin !== 'SELF_SERVICE';
  if (item.origin === 'SELF_SERVICE') populateQuoteConsultantSelect(item);
  const quoteDiscount = Number(item.discountPercent || 0);
  const quoteDetails = [
    ['Cliente', item.customerName], ['Origem', quoteOriginLabel(item.origin)], ['Responsável', quoteConsultantLabel(item)], ['CPF', item.customerCpf || item.maskedCpf || '—'], ['WhatsApp', formatPhone(item.whatsapp) || '—'],
    ['Placa', item.plate], ['Modelo', item.model], ['Ano', item.manufactureYear], ['Veículo 0 km', item.zeroKm ? 'Sim' : 'Não'],
    ['Valor FIPE', brl.format(item.fipeValue)], ['Valor em caso de ressarcimento integral', `${Number(item.indemnityFipePercent || 100)}% da FIPE`], ['Leilão / remarcação de chassi', item.auctionOrChassisRemarked === true ? 'Sim' : (item.auctionOrChassisRemarked === false ? 'Não' : 'Não informado')], ['Abrangência', regionLabel(item.region)],
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

function adminSupervisionStageLabel(item) {
  if (item?.status === 'APPROVED') return item.reviewedByRole === 'ADMIN_SUPERVISION' ? 'Aprovada pelo Admin como Supervisão' : 'Aprovada pela Supervisão';
  if (item?.status === 'REJECTED') return item.reviewedByRole === 'ADMIN_SUPERVISION' ? 'Rejeitada pelo Admin como Supervisão' : 'Rejeitada pela Supervisão';
  if (item?.analysisStage === 'SUPERVISION_QUEUE') return 'Cadastro realizado · aguardando decisão da Supervisão';
  if (item?.analysisStage === 'ANALYST_PENDING') return 'Pendência do analista / aguardando documentos';
  if (item?.analysisStage === 'ANALYST_QUEUE') return 'Em análise / cadastro ainda não concluído';
  return 'Em acompanhamento';
}

function adminWebauthnAcceptanceUrl(item) {
  if (!item?.publicUrl) return '';
  try {
    const url = new URL(item.publicUrl, window.location.origin);
    url.pathname = '/retrato/';
    return url.toString();
  } catch (_) {
    return item.publicUrl;
  }
}

function syncAdminWebauthnBox(item) {
  const box = $('admin-webauthn-notification');
  const send = $('admin-send-webauthn-token');
  const copy = $('admin-copy-webauthn-link');
  const pending = item?.status === 'APPROVED' && Boolean(item?.registrationCompletedAt) && !item?.contractChangePending && !item?.digitalAcceptedAt && Boolean(item?.publicUrl);
  box.hidden = !pending;
  if (pending) {
    send.dataset.inspectionId = item.id;
    copy.dataset.inspectionId = item.id;
  } else {
    send.removeAttribute('data-inspection-id');
    copy.removeAttribute('data-inspection-id');
  }
}

function openInspectionAnalysis(id) {
  const item = inspections.find(value => value.id === id);
  if (!item) return;
  const approvedDossier = item.status === 'APPROVED';
  if (item.expiredWithoutFiles && !approvedDossier) {
    window.alert('Vistoria/cotação vencida, precisa ser refeita.');
    return;
  }
  const filesAvailable = hasInspectionFiles(item);
  const needsFiles = adminInspectionNeedsFiles(item);
  const pendingCount = adminInspectionPendingCount(item);
  const currentPublicUrl = item.publicUrl
    ? (window.NH_URLS?.retratoUrl(item.publicUrl) || item.publicUrl)
    : null;

  $('inspection-analysis-id').value = item.id;
  $('inspection-dialog-title').textContent = `${item.plate || '0 km — sem placa'} — ${item.associateName}`;
  $('inspection-analysis-note').value = item.adminNote || '';
  $('inspection-edit-name').value = item.associateName || '';
  $('inspection-edit-cpf').value = item.cpf || item.maskedCpf || '';
  $('inspection-edit-whatsapp').value = formatPhone(item.whatsapp) || '';
  $('inspection-edit-plate').value = item.plate || '';
  $('inspection-edit-zero-km').value = item.zeroKm ? 'true' : 'false';
  $('inspection-edit-model').value = item.vehicleModel || '';
  $('inspection-edit-model-year').value = item.modelYear || '';
  $('inspection-edit-address').value = item.residenceAddress || '';
  $('admin-contract-fipe').value = window.NHMoney?.format(item.pendingFipeValue ?? item.fipeValue) || (item.pendingFipeValue ?? item.fipeValue ?? '');
  $('admin-contract-monthly').value = window.NHMoney?.format(item.pendingMonthlyValue ?? item.monthlyValue) || (item.pendingMonthlyValue ?? item.monthlyValue ?? '');
  $('admin-contract-plan').textContent = item.selectedPlanName || item.contractedPlan || '—';
  $('admin-contract-discount').value = String(item.pendingDiscountPercent ?? item.discountPercent ?? 0);
  $('admin-contract-branding').value = item.pendingRearWindowBranding || item.rearWindowBranding || 'NOT_APPLICABLE';
  window.NHMoney?.refresh($('admin-contract-fipe'));
  window.NHMoney?.refresh($('admin-contract-monthly'));
  const inspectionEditableLocked = Boolean(item.digitalAcceptedAt); // O aceite digital é a trava definitiva do dossiê.
  const digitalLock = $('admin-digital-lock');
  if (digitalLock) digitalLock.hidden = !inspectionEditableLocked;
  ['inspection-edit-name','inspection-edit-cpf','inspection-edit-whatsapp','inspection-edit-plate','inspection-edit-zero-km','inspection-edit-model','inspection-edit-model-year','inspection-edit-address','inspection-save-details']
    .forEach(id => { const el = $(id); if (el) el.disabled = inspectionEditableLocked; });
  const contractLocked = Boolean(item.digitalAcceptedAt);
  const hasContractValues = item.requestType === 'NEW_INSPECTION' && item.fipeValue != null && item.monthlyValue != null;
  renderCommercialBenefits('admin-contract-benefits', item, contractLocked || !hasContractValues);
  refreshCommercialRules(ADMIN_COMMERCIAL_CONFIG, contractLocked || !hasContractValues);
  initializeCommercialPricingPreview(ADMIN_COMMERCIAL_CONFIG, item);
  const contractSection = $('admin-contract-values-section');
  if (contractSection) contractSection.hidden = item.requestType !== 'NEW_INSPECTION';
  ['admin-contract-fipe','admin-contract-monthly','admin-contract-discount','admin-contract-branding','admin-save-contract-values']
    .forEach(id => { const el = $(id); if (el) el.disabled = contractLocked || !hasContractValues; });
  const contractHelper = $('admin-contract-values-helper');
  if (contractHelper) contractHelper.textContent = contractLocked
    ? 'O aceite digital do associado já foi concluído. O dossiê comercial está bloqueado para edição.'
    : (hasContractValues
        ? 'O Admin pode corrigir FIPE, desconto, mensalidade, benefícios e adicionais inclusive em vistoria aprovada, até o associado concluir o aceite digital.'
        : 'Esta vistoria não possui valores de cotação vinculados para edição.');

  const pendingContractBox = $('admin-contract-change-pending');
  if (pendingContractBox) {
    const canSendContractAcceptance = Boolean(item.contractChangePending && item.registrationCompletedAt);
    pendingContractBox.hidden = !canSendContractAcceptance;
    if (canSendContractAcceptance) {
      $('admin-contract-change-pending-text').textContent = `FIPE proposta: ${brl.format(item.pendingFipeValue)} · mensalidade com os adicionais atuais: ${brl.format(item.pendingMonthlyValue)}. O contrato só será atualizado depois da confirmação do associado.`;
      const sendLink = $('admin-send-contract-change-link');
      sendLink.href = item.contractChangeWhatsappUrl || item.contractChangeConfirmationUrl || '#';
      sendLink.hidden = !(item.contractChangeWhatsappUrl || item.contractChangeConfirmationUrl);
      $('admin-copy-contract-change-link').dataset.url = item.contractChangeConfirmationUrl || '';
    }
  }
  $('admin-supervision-note').value = item.supervisionNote || '';
  $('admin-supervision-note').disabled = inspectionEditableLocked;
  $('admin-save-supervision-note').disabled = inspectionEditableLocked;
  $('inspection-analysis-note').disabled = inspectionEditableLocked;
  $('admin-supervision-note-meta').textContent = item.supervisionNoteUpdatedAt
    ? `Última atualização: ${date(item.supervisionNoteUpdatedAt)}${item.supervisionNoteByName ? ` por ${item.supervisionNoteByName}` : ''}. Visível para o analista.`
    : 'A observação ficará visível para o analista responsável.';

  const statusSelect = $('inspection-analysis-status');
  const awaitingSupervision = item.analysisStage === 'SUPERVISION_QUEUE';
  const finished = item.analysisStage === 'FINISHED' || ['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(item.status);
  // Para ADM, o estado do cadastro deve vir do registro explícito, não do status
  // final da vistoria. Uma vistoria aprovada pode ter sido reaberta/corrigida e
  // continuar precisando ser marcada novamente como Cadastro realizado.
  const registrationCompleted = Boolean(item.registrationCompletedAt);
  const registrationBlocked = Boolean(item.digitalAcceptedAt) || ['CANCELLED', 'EXPIRED'].includes(item.status);
  const operationalStatus = ['WAITING_FILES', 'UPLOADING_FILES', 'UNDER_REVIEW', 'CANCELLED', 'EXPIRED'].includes(item.status)
    ? item.status
    : (filesAvailable ? 'UNDER_REVIEW' : 'WAITING_FILES');
  statusSelect.value = operationalStatus;
  statusSelect.disabled = awaitingSupervision || finished;
  $('admin-save-analysis').hidden = awaitingSupervision || finished;

  // Admin pode alternar Cadastro realizado / não realizado em desktop e mobile
  // até o aceite digital, inclusive se a vistoria já tiver sido aprovada.
  $('admin-registration-actions').hidden = registrationBlocked;
  const adminRegistrationNotComplete = $('admin-registration-not-complete');
  const adminRegistrationComplete = $('admin-registration-complete');
  // ADM pode acionar qualquer uma das duas opções até o aceite digital. O estado
  // atual é destacado visualmente, mas não transforma a outra ação em indisponível.
  adminRegistrationNotComplete.disabled = registrationBlocked;
  adminRegistrationComplete.disabled = registrationBlocked;
  adminRegistrationNotComplete.classList.toggle('is-current', !registrationCompleted);
  adminRegistrationComplete.classList.toggle('is-current', registrationCompleted);
  adminRegistrationNotComplete.setAttribute('aria-pressed', String(!registrationCompleted));
  adminRegistrationComplete.setAttribute('aria-pressed', String(registrationCompleted));

  const canFinalDecision = awaitingSupervision || (finished && ['APPROVED', 'REJECTED'].includes(item.status) && !item.digitalAcceptedAt);
  $('admin-inspection-decision-actions').hidden = !canFinalDecision;
  $('admin-inspection-approve').hidden = !canFinalDecision;
  $('admin-inspection-reject').hidden = !canFinalDecision;
  syncAdminWebauthnBox(item);

  const inspectionDiscount = Number(item.discountPercent || 0);
  const inspectionDetails = [
    ['Associado', item.associateName], ['CPF', item.cpf || item.maskedCpf || '—'], ['WhatsApp', formatPhone(item.whatsapp) || '—'],
    ['Consultor', item.consultantName], ['Placa', item.plate || '0 km — sem placa'],
    ['Modelo', item.vehicleModel || '—'], ['Ano do modelo', item.modelYear || '—'],
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
    ['Arquivos disponíveis', item.assetCount], ['Situação dos arquivos', filesAvailable ? (needsFiles ? `${pendingCount} ${pendingCount === 1 ? 'item pendente' : 'itens pendentes'}; os demais continuam armazenados` : 'Disponíveis por até 40 dias') : (Number(item.expiredAssetCount || 0) > 0 ? 'Arquivo histórico indisponível' : 'Aguardando envio do associado')],
    ['Criada em', date(item.createdAt)], ['Expira em', date(item.expiresAt)],
    ['Concluída em', date(item.completedAt)], ['Última análise', date(item.reviewedAt)],
    ['Analista responsável', item.assignedAnalystName || 'Não vinculado'],
    ['Cadastro feito por', item.registrationCompletedByName || '—'],
    ['Etapa', adminSupervisionStageLabel(item)],
    ['Responsável pela última ação', item.reviewedByName || '—'],
    ['Perfil da última ação', item.reviewedByRole === 'ADMIN_ANALYSIS' ? 'Administrador · Análise' : item.reviewedByRole === 'ADMIN_SUPERVISION' ? 'Administrador · Supervisão' : item.reviewedByRole || '—'],
    ['Observação da análise', item.adminNote || '—'],
    ['O.B.S. Supervisão', item.supervisionNote || '—'],
    ['Aceite digital', item.digitalAcceptedAt ? `Confirmado em ${date(item.digitalAcceptedAt)}` : (item.status === 'APPROVED' ? 'Aguardando WebAuthn' : '—')]
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
  const sourceAssets = Array.isArray(item.assets) ? item.assets : [];
  const assets = item.completedAt && !sourceAssets.some(asset => asset.type === 'REPORT')
    ? [...sourceAssets, { id: 'regenerated-report', type: 'REPORT', label: 'Relatório da vistoria', fileName: 'relatorio-vistoria.pdf', fileSize: 0, contentType: 'application/pdf', available: false }]
    : sourceAssets;
  const available = assets.filter(asset => asset.available);
  section.hidden = assets.length === 0;
  if (section.hidden) {
    grid.innerHTML = '';
    return;
  }

  $('admin-inspection-files-retention').textContent = available.length
    ? 'Arquivos confirmados: disponíveis até o limite de retenção operacional de 40 dias.'
    : 'Há arquivo histórico indisponível. Novos arquivos também seguem a retenção operacional de 40 dias.';
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
    const canDelete = asset.available && !item.digitalAcceptedAt && ['PHOTO', 'VIDEO', 'SIGNATURE', 'VEHICLE_DOCUMENT', 'IDENTITY_DOCUMENT'].includes(asset.type);
    const legacyLargeVideo = video && Number(asset.fileSize || 0) > 15 * 1024 * 1024;
    const downloadName = legacyLargeVideo ? compactedVideoFileName(asset.fileName) : asset.fileName;
    const compressionNote = legacyLargeVideo
      ? '<small class="inspection-media-note">Vídeo original preservado sem limite de MB.</small>'
      : '';
    const canRegenerateReport = asset.type === 'REPORT' && Boolean(item.completedAt);
    const actions = canRegenerateReport
      ? `<div class="inspection-media-actions"><button class="secondary" data-admin-download-report="${item.id}" type="button">Baixar relatório</button></div>`
      : asset.available
        ? `<div class="inspection-media-actions">${video ? `<button class="outline" data-admin-play-video="${asset.id}" type="button">Reproduzir</button>` : ''}<button class="secondary" data-admin-download-asset="${asset.id}" data-file-name="${esc(downloadName)}" type="button">${legacyLargeVideo ? 'Baixar WebM' : 'Baixar'}</button>${canDelete ? `<button class="danger" data-admin-delete-asset="${asset.id}" data-file-name="${esc(title)}" type="button">Excluir / solicitar novamente</button>` : ''}</div>`
        : `<div class="inspection-media-expired">${adminInspectionNeedsFiles(item) && asset.type !== 'REPORT' ? 'Arquivo excluído / aguardando reenvio.' : 'Arquivo histórico indisponível.'}</div>`;
    return `<article class="inspection-media-card ${asset.available ? '' : 'expired'}">${preview}<div class="inspection-media-body"><strong>${esc(title)}</strong><small>${esc(asset.fileName)}</small><small>${formatBytes(asset.fileSize)} · ${esc(asset.contentType || 'arquivo')}</small>${compressionNote}${actions}</div></article>`;
  }).join('');

  available.filter(asset => String(asset.contentType || '').startsWith('image/')).forEach(asset => loadAdminImagePreview(item.id, asset));
  grid.querySelectorAll('[data-admin-download-asset]').forEach(button => button.addEventListener('click', () => downloadAdminAsset(item.id, button.dataset.adminDownloadAsset, button.dataset.fileName, button)));
  grid.querySelectorAll('[data-admin-download-report]').forEach(button => button.addEventListener('click', () => downloadAdminReport(item.id, button)));
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


function compactedVideoFileName(fileName) {
  const value = String(fileName || 'video-vistoria').trim();
  const dot = value.lastIndexOf('.');
  const base = dot > 0 ? value.slice(0, dot) : value;
  return `${base}-compactado.webm`;
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

async function downloadAdminReport(inspectionId, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Gerando relatório...';
  try {
    const blob = await apiBlob(`/api/admin/inspections/${inspectionId}/report`);
    triggerAdminDownload(blob, `relatorio-vistoria-${inspectionId}.pdf`);
  } catch (error) {
    message(error.message);
    await confirmAction('Erro ao baixar relatório', error.message || 'Não foi possível gerar o relatório desta vistoria.', 'Fechar');
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
  }).sort((a,b) => String(a.planName).localeCompare(String(b.planName), 'pt-BR') || Number(a.sortOrder)-Number(b.sortOrder));

  let lastPlan = null;
  const rows = [];
  filtered.forEach(item => {
    if (item.planName !== lastPlan) {
      rows.push(`<tr class="coverage-plan-separator"><td colspan="7">${esc(item.planName)}</td></tr>`);
      lastPlan = item.planName;
    }
    const ruleCount = Array.isArray(item.rules) ? item.rules.length : 0;
    rows.push(`<tr>
      <td><strong class="catalog-name">${esc(item.planName)}</strong><small class="table-code">${esc(regionLabel(item.region))} · ${esc(motorcycleOriginLabel(item.motorcycleOrigin))}</small></td>
      <td><strong class="catalog-name">${esc(item.coverageName)}</strong>${ruleCount ? `<small class="table-code">${ruleCount} regra${ruleCount === 1 ? '' : 's'} de limite</small>` : ''}</td>
      <td>${coverageBadge(item.status)}</td><td>${esc(item.detail || '—')}</td>
      <td>${item.status === 'OPTIONAL' ? brl.format(item.monthlyPrice || 0) : '—'}</td><td>${item.sortOrder}</td>
      <td><div class="row-actions"><button class="secondary small-button" data-coverage-edit="${item.id}" type="button">Editar</button><button class="danger small-button" data-coverage-delete="${item.id}" type="button">Excluir</button></div></td>
    </tr>`);
  });
  $('coverages-body').innerHTML = rows.join('') || emptyRow(7, 'Nenhuma cobertura encontrada.');
  document.querySelectorAll('[data-coverage-edit]').forEach(button => button.addEventListener('click', () => openCoverageModal(Number(button.dataset.coverageEdit))));
  document.querySelectorAll('[data-coverage-delete]').forEach(button => button.addEventListener('click', () => deleteCoverage(Number(button.dataset.coverageDelete))));
}

function coverageAssignments(item) {
  if (!item) return [];
  const coverageId = item.coverageId ?? item.id;
  return coverages.filter(value => (value.coverageId ?? value.id) === coverageId);
}

function renderCoveragePlanChoices(selectedIds = []) {
  const selected = new Set((selectedIds || []).map(Number));
  $('coverage-plan-options').innerHTML = plans.map(plan => `<label class="coverage-plan-choice">
    <input type="checkbox" data-coverage-plan-id="${plan.id}" ${selected.has(Number(plan.id)) ? 'checked' : ''}>
    <span><strong>${esc(plan.name)}</strong><small class="table-code">${esc(plan.category || '')}${plan.motorcycleOrigin ? ` · ${esc(motorcycleOriginLabel(plan.motorcycleOrigin))}` : ''}</small></span>
  </label>`).join('');
}

function coverageRuleRow(rule = {}, index = 0) {
  const categoryOptions = `<option value="">Todas as categorias</option>${categories.map(category => `<option value="${esc(category.code)}" ${String(rule.categoryCode || '') === String(category.code) ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}`;
  return `<div class="coverage-rule-row" data-coverage-rule-row>
    <label>Categoria<select data-rule-category>${categoryOptions}</select></label>
    <label>FIPE mínimo<input data-rule-min data-money inputmode="decimal" value="${rule.minFipe == null ? '0,00' : moneyInput(rule.minFipe)}" placeholder="0,00"></label>
    <label>FIPE máximo<input data-rule-max data-money inputmode="decimal" value="${rule.maxFipe == null ? '' : moneyInput(rule.maxFipe)}" placeholder="Sem limite"></label>
    <label>Limite normal<input data-rule-normal data-money inputmode="decimal" value="${rule.normalAmount == null ? '' : moneyInput(rule.normalAmount)}" placeholder="Ex.: 100.000,00"></label>
    <label>Com desconto<input data-rule-discount data-money inputmode="decimal" value="${rule.discountedAmount == null ? '' : moneyInput(rule.discountedAmount)}" placeholder="Ex.: 50.000,00"></label>
    <button class="danger small-button coverage-rule-remove" type="button" data-remove-coverage-rule>Remover</button>
  </div>`;
}

function bindCoverageRuleRemoveButtons() {
  document.querySelectorAll('[data-remove-coverage-rule]').forEach(button => {
    button.onclick = () => button.closest('[data-coverage-rule-row]')?.remove();
  });
}

function renderCoverageRules(rules = []) {
  $('coverage-rules-list').innerHTML = (rules || []).map(coverageRuleRow).join('');
  bindCoverageRuleRemoveButtons();
  window.NHMoney?.attachAll($('coverage-rules-list'));
}

function collectCoverageRules() {
  return [...document.querySelectorAll('[data-coverage-rule-row]')].map((row, index) => {
    const maxRaw = row.querySelector('[data-rule-max]').value.trim();
    const discountRaw = row.querySelector('[data-rule-discount]').value.trim();
    const normalRaw = row.querySelector('[data-rule-normal]').value.trim();
    if (!normalRaw) throw new Error(`Informe o limite normal da regra ${index + 1}.`);
    return {
      categoryCode: row.querySelector('[data-rule-category]').value || null,
      minFipe: parseMoney(row.querySelector('[data-rule-min]').value || '0'),
      maxFipe: maxRaw ? parseMoney(maxRaw) : null,
      normalAmount: parseMoney(normalRaw),
      discountedAmount: discountRaw ? parseMoney(discountRaw) : null,
      sortOrder: (index + 1) * 10
    };
  });
}

function openCoverageModal(id = null) {
  const item = coverages.find(value => value.id === id);
  const assignments = coverageAssignments(item);
  $('coverage-id').value = item?.id || '';
  renderCoveragePlanChoices(item ? assignments.map(value => value.planId) : (plans[0] ? [plans[0].id] : []));
  $('coverage-name').value = item?.coverageName || '';
  $('coverage-status').value = item?.status || 'INCLUDED';
  $('coverage-order').value = item?.sortOrder ?? 100;
  $('coverage-detail').value = item?.detail || '';
  $('coverage-price').value = item?.monthlyPrice == null ? '' : moneyInput(item.monthlyPrice);
  renderCoverageRules(item?.rules || []);
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
    'Excluir cobertura deste plano?',
    `${item.coverageName} será removido do plano ${item.planName}. Cotações antigas continuarão com os dados registrados na emissão.`,
    'Excluir cobertura'
  );
  if (!confirmed) return;
  try {
    await api(`/api/admin/catalog/coverages/${id}`, { method: 'DELETE' });
    message('Cobertura removida do plano.', 'success');
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
  ensureAdminAutoPager($('audit-list'),true);
}

function populatePlanSelects() {
  const options = plans.map(item => `<option value="${item.id}">${esc(item.name)} — ${esc(regionLabel(item.region))}${item.motorcycleOrigin ? ` · ${esc(motorcycleOriginLabel(item.motorcycleOrigin))}` : ''}</option>`).join('');
  const allOptions = `<option value="">Todos os planos</option>${options}`;
  const currentPriceFilter = $('price-plan-filter').value;
  const currentCoverageFilter = $('coverage-plan-filter').value;
  $('price-plan-filter').innerHTML = allOptions;
  $('coverage-plan-filter').innerHTML = allOptions;
  $('price-plan').innerHTML = options;
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
    token = body.token;
    localStorage.setItem(TOKEN_KEY, body.token);
    localStorage.setItem(ROLE_KEY, body.role);
    markSessionActivity(true);
    if (body.role !== 'ADMIN') {
      (window.NH_ROUTING?.redirectForRole ? window.NH_ROUTING.redirectForRole(body.role) : location.replace({CONSULTANT:'/colaborador/',ANALYST:'/analise/',SUPERVISION_ANALYSIS:'/supervisao/',TOW_DRIVER:'/guincho/',WORKSHOP_MANAGER:'/oficina/',EVENT_OPERATOR:'/checklist/',BUYER:'/financeiro/',ADMIN:'/admin/'}[body.role]||'/'));
      return;
    }
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
          'Desativar colaborador?',
          `${current.name} deixará de aparecer na seleção de novas atividades. Todo o histórico será mantido.`,
          'Desativar colaborador'
        );
        if (!confirmed) return;
      }
      await api(`/api/admin/consultants/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('consultant-name').value.trim(), active: nextActive, role: $('consultant-role').value, whatsapp: $('consultant-whatsapp').value.trim(), city: $('consultant-city').value.trim(), assignedAnalystId: $('consultant-role').value === 'CONSULTANT' ? ($('consultant-assigned-analyst').value || null) : null })
      });
      message('Colaborador atualizado.', 'success');
    } else {
      await api('/api/admin/consultants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('consultant-name').value.trim(), role: $('consultant-role').value, whatsapp: $('consultant-whatsapp').value.trim(), city: $('consultant-city').value.trim(), assignedAnalystId: $('consultant-role').value === 'CONSULTANT' ? ($('consultant-assigned-analyst').value || null) : null })
      });
      message('Colaborador cadastrado.', 'success');
    }
    closeDialog('consultant-dialog');
    await load();
  } catch (error) { message(error.message); }
});


$('consultant-role').addEventListener('change', syncConsultantWhatsappField);
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

  if (['CONSULTANT', 'ANALYST', 'SUPERVISION_ANALYSIS'].includes(role)) {
    if (consultantChoice === '__NEW__') {
      payload.newConsultantName = $('user-new-consultant-name').value.trim();
      if (!payload.newConsultantName) return message(`Informe o nome do novo ${role === 'ANALYST' ? 'analista' : role === 'SUPERVISION_ANALYSIS' ? 'supervisor' : 'consultor'}.`);
    } else if (consultantChoice === '__LEGACY__') {
      payload.consultantId = null;
    } else if (consultantChoice) {
      payload.consultantId = consultantChoice;
    } else {
      return message(`Selecione um ${role === 'ANALYST' ? 'analista' : role === 'SUPERVISION_ANALYSIS' ? 'supervisor' : 'consultor'} existente ou cadastre um novo.`);
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
      message(role === 'TOW_DRIVER' ? 'Usuário exclusivo de Guincho/Reboque criado com sucesso.' : role === 'WORKSHOP_MANAGER' ? 'Usuário de Gerência da Oficina criado com sucesso.' : role === 'EVENT_OPERATOR' ? 'Usuário de Eventos criado com sucesso.' : role === 'BUYER' ? 'Usuário de Compras / Financeiro criado com sucesso.' : 'Usuário criado e colaborador vinculado com sucesso.', 'success');
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
  const planIds = [...document.querySelectorAll('[data-coverage-plan-id]:checked')].map(input => Number(input.dataset.coveragePlanId));
  if (!planIds.length) return message('Selecione pelo menos um plano para esta cobertura.');
  try {
    const payload = {
      planIds,
      coverageName: $('coverage-name').value.trim(),
      status,
      detail: $('coverage-detail').value.trim(),
      monthlyPrice: status === 'OPTIONAL' ? parseMoney($('coverage-price').value) : null,
      sortOrder: Number($('coverage-order').value),
      rules: collectCoverageRules()
    };
    const path = id ? `/api/admin/catalog/coverages/${id}` : '/api/admin/catalog/coverages';
    await api(path, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    closeDialog('coverage-dialog');
    message(id ? 'Cobertura e planos atualizados.' : 'Cobertura criada nos planos selecionados.', 'success');
    await load();
  } catch (error) { message(error.message); }
});

$('quote-save-details').addEventListener('click', async () => {
  const id = $('quote-analysis-id').value;
  if (!id) return;
  const button = $('quote-save-details');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Salvando...';
  try {
    const updated = await api(`/api/admin/quotes/${encodeURIComponent(id)}/details`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: $('quote-edit-name').value.trim(),
        customerCpf: normalizedCpf($('quote-edit-cpf').value),
        whatsapp: $('quote-edit-whatsapp').value.trim(),
        plate: $('quote-edit-plate').value.trim(),
        zeroKm: $('quote-edit-zero-km').value === 'true',
        model: $('quote-edit-model').value.trim(),
        modelYear: Number($('quote-edit-model-year').value),
        observation: $('quote-edit-observation').value.trim()
      })
    });
    const index = quotes.findIndex(item => item.id === updated.id);
    if (index >= 0) quotes[index] = updated;
    renderQuotes();
    openQuoteAnalysis(updated.id);
    message('Dados cadastrais atualizados na cotação e na vistoria vinculada. O valor FIPE foi preservado.', 'success');
  } catch (error) { message(error.message); }
  finally { button.disabled = false; button.textContent = original; }
});

$('inspection-save-details').addEventListener('click', async () => {
  const id = $('inspection-analysis-id').value;
  if (!id) return;
  const button = $('inspection-save-details');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Salvando...';
  try {
    const updated = await api(`/api/admin/inspections/${encodeURIComponent(id)}/details`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        associateName: $('inspection-edit-name').value.trim(),
        cpf: normalizedCpf($('inspection-edit-cpf').value),
        whatsapp: $('inspection-edit-whatsapp').value.trim(),
        plate: $('inspection-edit-plate').value.trim(),
        zeroKm: $('inspection-edit-zero-km').value === 'true',
        model: $('inspection-edit-model').value.trim(),
        modelYear: Number($('inspection-edit-model-year').value),
        residenceAddress: $('inspection-edit-address').value.trim()
      })
    });
    const index = inspections.findIndex(item => item.id === updated.id);
    if (index >= 0) inspections[index] = updated;
    renderInspections();
    openInspectionAnalysis(updated.id);
    message('Dados do associado/veículo atualizados. A cotação vinculada foi sincronizada sem alterar a FIPE.', 'success');
  } catch (error) { message(error.message); }
  finally { button.disabled = false; button.textContent = original; }
});

$('admin-save-contract-values')?.addEventListener('click', async () => {
  const id = $('inspection-analysis-id').value;
  if (!id) return;
  const manualMonthlyOverride = false;
  const preview = await requestCommercialPricingPreview(ADMIN_COMMERCIAL_CONFIG, true);
  if (!preview) return message('Não foi possível recalcular o valor pela tabela atual do plano.');
  let fipeValue;
  let monthlyValue;
  try {
    fipeValue = parseMoney($('admin-contract-fipe').value);
    monthlyValue = parseMoney($('admin-contract-monthly').value);
  } catch (error) {
    return message(error.message);
  }
  if (fipeValue <= 0) return message('Informe um valor FIPE válido.');
  if (monthlyValue <= 0) return message('Informe uma mensalidade válida.');
  const discountPercent = Number($('admin-contract-discount').value || 0);
  const rearWindowBranding = $('admin-contract-branding').value || 'NOT_APPLICABLE';
  const benefitCodes = selectedCommercialBenefits('admin-contract-benefits');
  const currentItem = inspections.find(item => item.id === id);
  const approvedBeforeDigitalAcceptance = currentItem?.status === 'APPROVED' && !currentItem?.digitalAcceptedAt;
  const confirmationSuffix = approvedBeforeDigitalAcceptance
    ? ' Como a vistoria está aprovada e ainda sem aceite digital, a revisão será aplicada agora e o dossiê final será regenerado para o novo aceite.'
    : ' Se houver alteração contratual que exija confirmação, o sistema preparará o fluxo correspondente para o associado.';
  const confirmed = window.confirm(`Confirma FIPE ${brl.format(fipeValue)} e mensalidade final ${brl.format(monthlyValue)}?${confirmationSuffix}`);
  if (!confirmed) return;
  const button = $('admin-save-contract-values');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Salvando...';
  try {
    const updated = await api(`/api/admin/inspections/${encodeURIComponent(id)}/contract-values`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fipeValue, monthlyValue, discountPercent, rearWindowBranding, benefitCodes, manualMonthlyOverride })
    });
    const index = inspections.findIndex(item => item.id === updated.id);
    if (index >= 0) inspections[index] = updated;
    renderInspections();
    openInspectionAnalysis(updated.id);
    message(updated.contractChangePending
      ? 'Novo valor preparado. Envie o link ao associado; o contrato só será atualizado após a confirmação dele.'
      : 'Revisão comercial salva no dossiê final.', 'success');
  } catch (error) { message(error.message); }
  finally { button.disabled = false; button.textContent = original; }
});


$('admin-copy-contract-change-link')?.addEventListener('click', async () => {
  const url = $('admin-copy-contract-change-link').dataset.url || '';
  if (!url) return message('Não há link de confirmação pendente.');
  try {
    await navigator.clipboard.writeText(url);
    message('Link de confirmação copiado.', 'success');
  } catch (_error) {
    window.prompt('Copie o link abaixo:', url);
  }
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

async function setAdminInspectionDecision(status) {
  const id = $('inspection-analysis-id').value;
  if (!id) return;
  const approved = status === 'APPROVED';
  const note = $('inspection-analysis-note').value.trim();
  if (!note) {
    message(approved
      ? 'Informe na observação por que esta vistoria está sendo aprovada.'
      : 'Informe na observação por que esta vistoria está sendo rejeitada.');
    $('inspection-analysis-note').focus();
    return;
  }
  const confirmed = await confirmAction(
    approved ? 'Aprovar vistoria?' : 'Rejeitar vistoria?',
    approved
      ? 'A decisão final será registrada por Pedro Henrique com os poderes de Supervisão.'
      : 'A rejeição final será registrada por Pedro Henrique com os poderes de Supervisão.',
    approved ? 'Aprovar vistoria' : 'Rejeitar vistoria'
  );
  if (!confirmed) return;
  try {
    await api(`/api/admin/inspections/${id}/supervision-status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, adminNote: note })
    });
    closeDialog('inspection-dialog');
    await load();
    if (approved) {
      openInspectionAnalysis(id);
      message('Vistoria aprovada por Pedro Henrique como Supervisão. Agora use “Enviar link para aceite” para encaminhar o aceite digital.', 'success');
    } else {
      message('Vistoria rejeitada por Pedro Henrique como Supervisão.', 'success');
    }
  } catch (error) { message(error.message); }
}

$('admin-inspection-approve').addEventListener('click', () => setAdminInspectionDecision('APPROVED'));
$('admin-inspection-reject').addEventListener('click', () => setAdminInspectionDecision('REJECTED'));

$('inspection-analysis-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('inspection-analysis-id').value;
  const status = $('inspection-analysis-status').value;
  const adminNote = $('inspection-analysis-note').value.trim();
  try {
    await api(`/api/admin/inspections/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, adminNote })
    });
    closeDialog('inspection-dialog');
    message('Análise administrativa salva. Para decisão final, marque Cadastro feito e use os controles de Supervisão.', 'success');
    await load();
  } catch (error) { message(error.message); }
});

$('admin-save-supervision-note')?.addEventListener('click', async () => {
  const id = $('inspection-analysis-id').value;
  if (!id) return;
  const button = $('admin-save-supervision-note');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Salvando...';
  try {
    const updated = await api(`/api/admin/inspections/${encodeURIComponent(id)}/supervision-note`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: $('admin-supervision-note').value.trim() })
    });
    const index = inspections.findIndex(item => item.id === updated.id);
    if (index >= 0) inspections[index] = updated;
    $('admin-supervision-note').value = updated.supervisionNote || '';
    $('admin-supervision-note-meta').textContent = updated.supervisionNoteUpdatedAt
      ? `Última atualização: ${date(updated.supervisionNoteUpdatedAt)}${updated.supervisionNoteByName ? ` por ${updated.supervisionNoteByName}` : ''}. Visível para o analista.`
      : 'A observação ficará visível para o analista responsável.';
    message(updated.supervisionNote ? 'O.B.S. Supervisão salva e enviada ao analista.' : 'O.B.S. Supervisão removida.', 'success');
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

$('admin-registration-not-complete')?.addEventListener('click', async () => {
  const id = $('inspection-analysis-id').value;
  const item = inspections.find(value => value.id === id);
  if (!item) return;
  if (item.digitalAcceptedAt) return message('O aceite digital do associado já foi concluído. Esta vistoria está bloqueada para edição.');
  if (!item.registrationCompletedAt) return message('O cadastro já está marcado como não realizado.', 'success');
  const confirmed = await confirmAction(
    'Marcar Cadastro não realizado e reabrir?',
    'A vistoria voltará para a etapa de cadastro para permitir correções. Como Administrador, esta ação é permitida mesmo que existam arquivos pendentes. Se houver um aceite digital ainda não concluído, ele será invalidado e deverá ser enviado novamente depois da nova liberação.',
    'Reabrir cadastro'
  );
  if (!confirmed) return;
  try {
    await api(`/api/admin/inspections/${encodeURIComponent(id)}/registration-not-complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: $('inspection-analysis-note').value.trim() })
    });
    closeDialog('inspection-dialog');
    await load();
    const updated = inspections.find(value => value.id === id);
    if (updated) openInspectionAnalysis(id);
    message('Cadastro reaberto como não realizado. Depois da correção, use “Cadastro realizado · Liberar decisão”.', 'success');
  } catch (error) { message(error.message); }
});

$('admin-registration-complete')?.addEventListener('click', async () => {
  const id = $('inspection-analysis-id').value;
  const item = inspections.find(value => value.id === id);
  if (!item) return;
  if (item.digitalAcceptedAt) return message('O aceite digital do associado já foi concluído. Esta vistoria está bloqueada para edição.');
  if (item.registrationCompletedAt) return message('O cadastro já está marcado como realizado.', 'success');
  const pending = adminInspectionPendingCount(item);
  const pendingContract = Boolean(item.contractChangePending);
  const text = pendingContract
    ? 'O cadastro será marcado como realizado. A decisão final continuará bloqueada somente até o associado confirmar a alteração comercial pendente.'
    : (pending > 0
      ? `Ainda existem ${pending} ${pending === 1 ? 'pendência' : 'pendências'}. Como Administrador, Pedro Henrique pode assumir a responsabilidade, registrar o cadastro como realizado e liberar a decisão final.`
      : 'O cadastro será registrado em nome de Pedro Henrique e a decisão final ficará liberada imediatamente.');
  const confirmed = await confirmAction('Registrar Cadastro realizado?', text, 'Cadastro realizado');
  if (!confirmed) return;
  try {
    await api(`/api/admin/inspections/${encodeURIComponent(id)}/registration-complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: $('inspection-analysis-note').value.trim() })
    });
    closeDialog('inspection-dialog');
    await load();
    openInspectionAnalysis(id);
    message('Cadastro realizado por Pedro Henrique. Os botões de aprovação/rejeição final já estão liberados.', 'success');
  } catch (error) { message(error.message); }
});

$('admin-send-webauthn-token')?.addEventListener('click', () => {
  const id = $('admin-send-webauthn-token').dataset.inspectionId;
  const item = inspections.find(value => value.id === id);
  if (!item) return message('Vistoria não encontrada para envio do aceite digital.');
  if (item.digitalAcceptedAt) return message('O associado já concluiu o aceite digital WebAuthn.', 'success');
  if (item.associateDecisionWhatsappUrl) {
    window.open(item.associateDecisionWhatsappUrl, '_blank', 'noopener,noreferrer');
    message('WhatsApp aberto com o link do aceite digital WebAuthn.', 'success');
    return;
  }
  const link = adminWebauthnAcceptanceUrl(item);
  if (!link) return message('Não foi possível montar o link do aceite digital.');
  navigator.clipboard?.writeText(link).then(
    () => message('Link do aceite digital copiado para envio manual.', 'success'),
    () => window.prompt('Copie o link do aceite digital:', link)
  );
});

$('admin-copy-webauthn-link')?.addEventListener('click', async () => {
  const id = $('admin-copy-webauthn-link').dataset.inspectionId;
  const item = inspections.find(value => value.id === id);
  const link = adminWebauthnAcceptanceUrl(item);
  if (!link) return message('Não foi possível montar o link do aceite digital.');
  try {
    await navigator.clipboard.writeText(link);
    message('Link do aceite WebAuthn copiado.', 'success');
  } catch (_) {
    window.prompt('Copie o link do aceite WebAuthn:', link);
  }
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
  if (file.size > 15 * 1024 * 1024) {
    message('O regulamento deve ter no máximo 15 MB.');
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
$('inspection-bulk-delete-form')?.addEventListener('submit', confirmDeleteAllAllowedInspections);
$('new-plan-button').addEventListener('click', () => openPlanModal());
$('new-price-button').addEventListener('click', () => openPriceModal());
$('new-coverage-button').addEventListener('click', () => openCoverageModal());
$('add-coverage-rule')?.addEventListener('click', () => { $('coverage-rules-list').insertAdjacentHTML('beforeend', coverageRuleRow({}, document.querySelectorAll('[data-coverage-rule-row]').length)); bindCoverageRuleRemoveButtons(); window.NHMoney?.attachAll($('coverage-rules-list')); });
$('coverage-status').addEventListener('change', syncCoveragePrice);
$('activity-filter').addEventListener('input', renderActivities);
$('quote-filter').addEventListener('input', renderQuotes);
['quote-date-field', 'quote-date-from', 'quote-date-to', 'quote-sort-direction'].forEach(id => $(id)?.addEventListener('change', renderQuotes));
$('quote-date-clear')?.addEventListener('click', () => {
  $('quote-date-from').value = '';
  $('quote-date-to').value = '';
  renderQuotes();
});
$('inspection-filter').addEventListener('input', renderInspections);
$('inspection-associate-filter')?.addEventListener('input', renderInspections);
['inspection-date-field', 'inspection-date-from', 'inspection-date-to', 'inspection-sort-direction'].forEach(id => $(id)?.addEventListener('change', renderInspections));
$('inspection-date-clear')?.addEventListener('click', () => {
  $('inspection-date-from').value = '';
  $('inspection-date-to').value = '';
  renderInspections();
});
$('price-filter').addEventListener('input', renderPrices);
$('price-plan-filter').addEventListener('change', renderPrices);
$('coverage-plan-filter').addEventListener('change', renderCoverages);

const NH_EVENT_TYPE_LABELS = Object.freeze({COLLISION:'Colisão',GLASS:'Vidros',THEFT:'Roubo ou furto',FIRE:'Incêndio',COLLISION_FIRE:'Incêndio por colisão',SETTLEMENT_RELEASE:'Acordo/Quitação'});
const NH_EVENT_STATUS_LABELS = Object.freeze({DRAFT:'Rascunho',WAITING_DOCUMENTS:'Aguardando documentos',WAITING_ANALYSIS:'Aguardando análise',WAITING_WORKSHOP:'Aguardando oficina',IN_WORKSHOP:'Em vistoria',WORKSHOP_COMPLETED:'Checklist concluído',PENDING:'Pendência',FINALIZED:'Finalizado'});
const NH_VEHICLE_CATEGORY_LABELS = Object.freeze({MOTORCYCLE:'Motocicleta',LIGHT_CAR:'Carro leve / passeio',UTILITY:'Utilitário / pickup / van',TRUCK:'Caminhão / veículo pesado'});
const NH_DAMAGE_LABELS = Object.freeze({UNASSESSED:'Não avaliado',YES:'Com avaria',NO:'Sem avaria',NOT_APPLICABLE:'Não se aplica'});
const NH_REPAIR_LABELS = Object.freeze({REPAIR:'Recuperar / Reparar',REPLACE:'Trocar'});
const NH_TOW_ANSWER_LABELS = Object.freeze({YES:'Sim',NO:'Não',NOT_APPLICABLE:'Não se aplica',UNANSWERED:'Não informado'});

function nhText(value, fallback='—') { const text=String(value??'').trim(); return text || fallback; }
function nhEventType(value){return NH_EVENT_TYPE_LABELS[value]||nhText(value);}
function nhEventStatus(value){return NH_EVENT_STATUS_LABELS[value]||nhText(value);}
function nhVehicleCategory(value){return NH_VEHICLE_CATEGORY_LABELS[value]||nhText(value);}
function nhSearch(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function nhInfoGrid(items){return `<div class="admin-ops-grid">${items.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v==null||v===''?'—':v)}</strong></div>`).join('')}</div>`;}
function nhStateBadge(text, kind=''){return `<span class="badge ${kind}">${esc(text)}</span>`;}
function nhEventKind(status){return ['WORKSHOP_COMPLETED','FINALIZED'].includes(status)?'ok':['PENDING','WAITING_DOCUMENTS','WAITING_ANALYSIS','WAITING_WORKSHOP','IN_WORKSHOP'].includes(status)?'warn':'';}
function nhWorkshopKind(status){return ['WORKSHOP_COMPLETED','FINALIZED'].includes(status)?'ok':'warn';}

function renderAdminEvents(){
  const body=$('admin-events-body'); if(!body)return;
  const q=nhSearch($('admin-event-filter')?.value);
  const rows=nhEvents.filter(e=>!q||nhSearch([e.protocol,e.associateName,e.associateNumber,e.vehiclePlate,e.vehicleModel,e.planName,e.createdByName].join(' ')).includes(q));
  body.innerHTML=rows.length?rows.map(e=>`<tr><td><strong>${esc(e.protocol)}</strong><br><small>${esc(date(e.createdAt))}</small></td><td>${esc(e.associateName)}<br><small>${esc(e.associateNumber||'')}</small></td><td><strong>${esc(e.vehiclePlate)}</strong><br><small>${esc(e.vehicleModel)} · ${esc(nhVehicleCategory(e.vehicleCategory))}</small></td><td>${esc(nhEventType(e.eventType))}</td><td>${nhStateBadge(nhEventStatus(e.status),nhEventKind(e.status))}</td><td>${esc(e.createdByName||'—')}</td><td><div class="actions"><button class="outline admin-open-event" type="button" data-id="${esc(e.id)}">Ver tudo</button><button class="danger admin-delete-event" type="button" data-id="${esc(e.id)}" data-protocol="${esc(e.protocol)}">Excluir</button></div></td></tr>`).join(''):'<tr><td colspan="7" class="muted">Nenhum evento encontrado.</td></tr>';
  document.querySelectorAll('.admin-open-event').forEach(b=>b.onclick=()=>openAdminEvent(b.dataset.id));
  document.querySelectorAll('.admin-delete-event').forEach(b=>b.onclick=()=>deleteAdminEvent(b.dataset.id,b.dataset.protocol));
}

async function deleteAdminEvent(id, protocol){
  const confirmed=await confirmAction('Excluir evento',`Excluir permanentemente o evento ${protocol||''}? Todos os checklists, anexos, terceiros e compras vinculados também serão excluídos. Esta ação não pode ser desfeita.`,'Excluir evento');
  if(!confirmed)return;
  try{
    await api(`/api/checklist/events/${encodeURIComponent(id)}`,{method:'DELETE'});
    message(`Evento ${protocol||''} excluído com sucesso.`,'success');
    await load();
  }catch(error){message(error.message);}
}

function renderAdminWorkshop(){
  const body=$('admin-workshop-body'); if(!body)return;
  const q=nhSearch($('admin-workshop-filter')?.value);
  const rows=workshopEvents.filter(e=>!q||nhSearch([e.protocol,e.associateName,e.associateNumber,e.vehiclePlate,e.vehicleModel].join(' ')).includes(q));
  body.innerHTML=rows.length?rows.map(e=>`<tr><td><strong>${esc(e.protocol)}</strong></td><td>${esc(e.associateName)}<br><small>${esc(e.associateNumber||'')}</small></td><td><strong>${esc(e.vehiclePlate)}</strong><br><small>${esc(e.vehicleModel)} · ${esc(nhVehicleCategory(e.vehicleCategory))}</small></td><td>${nhStateBadge(nhEventStatus(e.eventStatus),nhWorkshopKind(e.eventStatus))}</td><td>${Number(e.assessedItems||0)}/${Number(e.totalItems||0)} avaliados<br><small>${Number(e.damagedItems||0)} avaria(s) · ${Number(e.replaceItems||0)} troca(s)</small></td><td>${Number(e.purchaseItems||0)} item(ns)</td><td><div class="admin-acceptance-cell">${e.acceptedAt?nhStateBadge('Aceite confirmado','ok'):nhStateBadge('Pendente',e.workshopCompletedAt?'warn':'')}${adminAcceptanceButtonHtml(e)}</div></td><td><button class="outline admin-open-workshop" type="button" data-id="${esc(e.id)}">Ver tudo</button></td></tr>`).join(''):'<tr><td colspan="8" class="muted">Nenhum evento de oficina encontrado.</td></tr>';
  document.querySelectorAll('.admin-open-workshop').forEach(b=>b.onclick=()=>openAdminWorkshop(b.dataset.id));
  bindAdminAcceptanceButtons(body);
}

function procurementBucketLabel(value){return ({NOT_FILLED:'Não preenchido',REQUESTED:'Solicitado',FINALIZED:'Finalizado'})[value]||value||'—';}
function procurementBucketKind(value){return value==='FINALIZED'?'ok':value==='REQUESTED'?'warn':'off';}
function renderAdminPurchases(){
  const body=$('admin-purchases-body'); if(!body)return;
  const q=nhSearch($('admin-purchases-filter')?.value);
  const rows=procurementEvents.filter(e=>!q||nhSearch([e.protocol,e.associateName,e.associateNumber,e.vehiclePlate,e.vehicleModel].join(' ')).includes(q));
  body.innerHTML=rows.length?rows.map(e=>`<tr><td><strong>${esc(e.protocol)}</strong><br><small>${esc(date(e.workshopCompletedAt))}</small></td><td>${esc(e.associateName)}<br><small>${esc(e.associateNumber||'')}</small></td><td><strong>${esc(e.vehiclePlate)}</strong><br><small>${esc(e.vehicleBrand||'')} ${esc(e.vehicleModel||'')}</small></td><td>${Number(e.totalItems||0)}</td><td>${Number(e.unfilledItems||0)}</td><td>${Number(e.requestedItems||0)}</td><td>${Number(e.finalizedItems||0)}</td><td>${nhStateBadge(procurementBucketLabel(e.bucket),procurementBucketKind(e.bucket))}</td><td><button class="outline admin-open-purchases" type="button" data-id="${esc(e.id)}">Ver compras</button></td></tr>`).join(''):'<tr><td colspan="9" class="muted">Nenhuma compra de evento encontrada.</td></tr>';
  document.querySelectorAll('.admin-open-purchases').forEach(b=>b.onclick=()=>openAdminPurchases(b.dataset.id));
}
async function openAdminPurchases(id){
  try{
    const e=await api(`/api/procurement/events/${encodeURIComponent(id)}`);
    const rows=(e.purchases||[]).map(p=>`<div class="admin-purchase-view"><div><strong>${esc(p.itemLabel)}</strong><small>${p.detailsSavedAt?`Registrado em ${esc(date(p.detailsSavedAt))}${p.detailsSavedBy?` por ${esc(p.detailsSavedBy)}`:''}`:'Ainda não preenchido pelo Comprador / Financeiro'}</small></div>${nhInfoGrid([['Fornecedor',p.supplier],['Valor',p.amount==null?'—':brl.format(p.amount)],['Prazo de entrega',p.deliveryDeadline?new Date(`${p.deliveryDeadline}T12:00:00`).toLocaleDateString('pt-BR'):'—'],['Status',p.detailsSavedAt?(p.status==='FINALIZED'?'Finalizado':'Solicitado'):'Não preenchido'],['Observação',p.notes]])}</div>`);
    openAdminOperationsDialog(`Compras do Evento · ${e.protocol}`,`${adminSection('Evento',nhInfoGrid([['Associado',e.associateName],['Número',e.associateNumber],['Veículo',`${e.vehiclePlate} · ${e.vehicleBrand||''} ${e.vehicleModel||''}`],['Plano',e.planName],['Oficina concluída',date(e.workshopCompletedAt)],['Situação',procurementBucketLabel(e.bucket)]]))}${adminSection(`Itens de compra (${e.purchases?.length||0})`,adminRows(rows,'Nenhum item de compra.',10))}`);bindAdminProgressiveLists($('admin-operations-content'));
  }catch(error){message(error.message);}
}

function renderAdminTow(){
  const body=$('admin-tow-body'); if(!body)return;
  const q=nhSearch($('admin-tow-filter')?.value);
  const rows=towRecords.filter(e=>!q||nhSearch([e.code,e.vehiclePlate,e.vehicleModel,e.providerName,e.driverName].join(' ')).includes(q));
  body.innerHTML=rows.length?rows.map(e=>`<tr><td><strong>${esc(e.code)}</strong><br><small>${esc(date(e.createdAt))}</small></td><td><strong>${esc(e.vehiclePlate)}</strong><br><small>${esc(e.vehicleModel||'—')} · ${esc(nhVehicleCategory(e.vehicleCategory))}</small></td><td>${esc(e.providerName||'—')}</td><td>${esc(e.driverName||'—')}</td><td>${nhStateBadge(e.status==='COMPLETED'?'Concluído':'Em preenchimento',e.status==='COMPLETED'?'ok':'warn')}</td><td>${Number(e.answeredItems||0)}/${Number(e.totalItems||0)}</td><td>${Number(e.photoCount||0)}</td><td><button class="outline admin-open-tow" type="button" data-id="${esc(e.id)}">Ver tudo</button></td></tr>`).join(''):'<tr><td colspan="8" class="muted">Nenhum atendimento de reboque encontrado.</td></tr>';
  document.querySelectorAll('.admin-open-tow').forEach(b=>b.onclick=()=>openAdminTow(b.dataset.id));
}

function openAdminOperationsDialog(title,html){$('admin-operations-title').textContent=title;$('admin-operations-content').innerHTML=html;const d=$('admin-operations-dialog');if(!d.open)d.showModal();}
function adminSection(title,html){return `<section class="admin-ops-section"><h3>${esc(title)}</h3>${html}</section>`;}
function adminRows(items,empty='Nenhum registro.',pageSize=15){
  if(!items?.length)return `<div class="muted">${esc(empty)}</div>`;
  return items.length>pageSize?adminProgressiveRows(items,empty,pageSize):`<div class="admin-ops-list">${items.join('')}</div>`;
}
function adminProgressiveRows(items,empty='Nenhum registro.',pageSize=10){
  if(!items?.length)return `<div class="muted">${esc(empty)}</div>`;
  const rows=items.map((item,index)=>`<div class="admin-progressive-item"${index>=pageSize?' hidden':''}>${item}</div>`).join('');
  const remaining=Math.max(0,items.length-pageSize);
  return `<div class="admin-progressive-list" data-page-size="${pageSize}"><div class="admin-ops-list">${rows}</div>${remaining?`<div class="admin-progressive-actions"><button class="outline admin-progressive-more" type="button">Ver mais ${Math.min(pageSize,remaining)} <span>(${remaining} restante${remaining===1?'':'s'})</span></button><button class="outline admin-progressive-less" type="button" hidden>Ver menos</button></div>`:''}</div>`;
}
function updateAdminProgressiveControls(list){
  if(!list)return;
  const size=Number(list.dataset.pageSize||10);
  const items=[...list.querySelectorAll('.admin-progressive-item')];
  const visible=items.filter(item=>!item.hidden).length;
  const remaining=Math.max(0,items.length-visible);
  const more=list.querySelector('.admin-progressive-more');
  const less=list.querySelector('.admin-progressive-less');
  if(more){
    more.hidden=remaining<=0;
    if(remaining>0)more.innerHTML=`Ver mais ${Math.min(size,remaining)} <span>(${remaining} restante${remaining===1?'':'s'})</span>`;
  }
  if(less)less.hidden=visible<=size;
}
function bindAdminProgressiveLists(root=document){
  root.querySelectorAll('.admin-progressive-list').forEach(list=>{
    const size=Number(list.dataset.pageSize||10);
    const more=list.querySelector('.admin-progressive-more');
    const less=list.querySelector('.admin-progressive-less');
    if(more)more.onclick=()=>{
      const hidden=[...list.querySelectorAll('.admin-progressive-item[hidden]')];
      hidden.slice(0,size).forEach(row=>row.hidden=false);
      updateAdminProgressiveControls(list);
    };
    if(less)less.onclick=()=>{
      [...list.querySelectorAll('.admin-progressive-item')].forEach((row,index)=>row.hidden=index>=size);
      updateAdminProgressiveControls(list);
      list.scrollIntoView({behavior:'smooth',block:'nearest'});
    };
    updateAdminProgressiveControls(list);
  });
}

const ADMIN_AUTO_PAGE_SIZE=15;
let adminAutoPagerSeq=0;
function adminAutoPagerItems(container){
  if(!container)return [];
  if(container.tagName==='TBODY')return [...container.children].filter(el=>el.tagName==='TR');
  if(container.id==='audit-list')return [...container.children].filter(el=>el.classList.contains('audit-card'));
  return [...container.children].filter(el=>!el.classList.contains('admin-auto-pagination'));
}
function adminAutoPagerHost(container){
  if(container.tagName==='TBODY')return container.closest('.table-wrap')||container.closest('table')||container;
  return container;
}
function ensureAdminAutoPager(container,reset=false){
  if(!container)return;
  const items=adminAutoPagerItems(container);
  const pageSize=Number(container.dataset.autoPageSize||ADMIN_AUTO_PAGE_SIZE);
  let id=container.dataset.autoPagerId;
  if(!id){id=`admin-auto-pager-${++adminAutoPagerSeq}`;container.dataset.autoPagerId=id;}
  const host=adminAutoPagerHost(container);
  let controls=document.querySelector(`.admin-auto-pagination[data-for="${id}"]`);
  if(items.length<=pageSize){
    items.forEach(item=>item.hidden=false);
    if(controls)controls.remove();
    container.dataset.autoVisible=String(items.length);
    return;
  }
  let visible=reset?pageSize:Number(container.dataset.autoVisible||pageSize);
  visible=Math.max(pageSize,Math.min(visible,items.length));
  container.dataset.autoVisible=String(visible);
  items.forEach((item,index)=>item.hidden=index>=visible);
  if(!controls){
    controls=document.createElement('div');
    controls.className='admin-auto-pagination';
    controls.dataset.for=id;
    controls.innerHTML='<button class="outline admin-auto-more" type="button"></button><button class="outline admin-auto-less" type="button">Ver menos</button>';
    host.insertAdjacentElement('afterend',controls);
  }
  const render=()=>{
    const current=Number(container.dataset.autoVisible||pageSize);
    const remaining=Math.max(0,items.length-current);
    const more=controls.querySelector('.admin-auto-more');
    const less=controls.querySelector('.admin-auto-less');
    more.hidden=remaining<=0;
    if(remaining>0)more.innerHTML=`Ver mais ${Math.min(pageSize,remaining)} <span>(${remaining} restante${remaining===1?'':'s'})</span>`;
    less.hidden=current<=pageSize;
  };
  controls.querySelector('.admin-auto-more').onclick=()=>{
    visible=Math.min(items.length,Number(container.dataset.autoVisible||pageSize)+pageSize);
    container.dataset.autoVisible=String(visible);
    items.forEach((item,index)=>item.hidden=index>=visible);
    render();
  };
  controls.querySelector('.admin-auto-less').onclick=()=>{
    container.dataset.autoVisible=String(pageSize);
    items.forEach((item,index)=>item.hidden=index>=pageSize);
    render();
    host.scrollIntoView({behavior:'smooth',block:'nearest'});
  };
  render();
}
function initAdminAutoPagination(){
  const selector='tbody, #audit-list, #coverage-rules-list, #admin-inspection-files-grid';
  const applyAll=(reset=false)=>document.querySelectorAll(selector).forEach(el=>ensureAdminAutoPager(el,reset));
  applyAll(true);
  const observer=new MutationObserver(mutations=>{
    const touched=new Set();
    mutations.forEach(m=>{
      const target=m.target.closest?.(selector)||m.target;
      if(target?.matches?.(selector))touched.add(target);
    });
    touched.forEach(el=>ensureAdminAutoPager(el,true));
  });
  document.querySelectorAll(selector).forEach(el=>observer.observe(el,{childList:true}));
}
function adminAcceptanceButtonHtml(e){
  if(!e?.workshopCompletedAt||e?.acceptedAt)return '';
  const label=e.publicAcceptanceToken?'Reenviar dossiê + aceite':'Enviar dossiê + aceite';
  return `<button class="secondary admin-acceptance-send" type="button" data-event="${esc(e.id)}">${label}</button>`;
}
function adminAcceptanceBarHtml(e){
  if(!e?.workshopCompletedAt)return '';
  const accepted=!!e.acceptedAt;
  return `<div class="admin-acceptance-bar"><div><span>ACEITE DO ASSOCIADO</span><strong>${accepted?`Confirmado em ${esc(date(e.acceptedAt))}`:'Pendente'}</strong></div>${adminAcceptanceButtonHtml(e)}</div>`;
}
function bindAdminAcceptanceButtons(root=document){root.querySelectorAll('.admin-acceptance-send').forEach(button=>button.onclick=()=>openAdminAcceptanceDialog(button.dataset.event));}
function adminAcceptancePublicUrl(info){if(!info)return '';const path=info.publicPath||(info.publicToken?`/aceite-evento/?token=${encodeURIComponent(info.publicToken)}`:'');return path?new URL(path,window.location.origin).href:'';}
function adminAcceptanceMessage(info,url){return `Olá, ${info?.associateName||'associado(a)'}. A Novo Horizonte Proteção Veicular disponibilizou o dossiê do veículo ${info?.vehiclePlate||''}${info?.vehicleModel?` (${info.vehicleModel})`:''}. Revise o documento e confirme o aceite digital pelo link: ${url}`;}
function updateAdminAcceptanceLocal(info){
  if(!info)return;
  const patch=e=>{if(!e||String(e.id)!==String(info.eventId))return;e.acceptedAt=info.acceptedAt||null;e.publicAcceptanceToken=info.publicToken||null;};
  workshopEvents.forEach(patch);
}
function renderAdminAcceptanceDialog(info){
  adminAcceptanceInfo=info;updateAdminAcceptanceLocal(info);
  const accepted=!!info.accepted,url=adminAcceptancePublicUrl(info);
  const status=$('admin-acceptance-status'),input=$('admin-acceptance-link');
  if(status){status.className=`admin-acceptance-status ${accepted?'accepted':'pending'}`;status.innerHTML=accepted?`<strong>✓ Aceite confirmado</strong><span>O associado confirmou digitalmente em ${esc(date(info.acceptedAt))}.</span>`:`<strong>Aguardando aceite do associado</strong><span>Envie o link seguro abaixo para revisão do dossiê e aceite digital.</span>`;}
  if(input)input.value=url;
  document.querySelectorAll('[data-admin-acceptance-pending]').forEach(el=>el.hidden=accepted);
  $('admin-acceptance-open').hidden=!url;
  $('admin-acceptance-download').hidden=!info.publicToken;
  $('admin-acceptance-accepted-note').hidden=!accepted;
  if(accepted)$('admin-acceptance-accepted-note').textContent=`Aceite registrado em ${date(info.acceptedAt)}${info.userVerified?' · usuário verificado pelo dispositivo':''}.`;
  renderAdminWorkshop();
}
async function openAdminAcceptanceDialog(eventId){
  const d=$('admin-associate-acceptance-dialog');if(!d)return;
  adminAcceptanceInfo=null;
  $('admin-acceptance-status').className='admin-acceptance-status loading';
  $('admin-acceptance-status').innerHTML='<strong>Preparando dossiê...</strong><span>Aguarde um instante.</span>';
  $('admin-acceptance-link').value='';
  document.querySelectorAll('[data-admin-acceptance-pending]').forEach(el=>el.hidden=true);
  $('admin-acceptance-open').hidden=true;$('admin-acceptance-download').hidden=true;$('admin-acceptance-accepted-note').hidden=true;
  if(!d.open)d.showModal();
  try{
    let info=await api(`/api/checklist/events/${encodeURIComponent(eventId)}/acceptance`);
    if(!info.accepted&&!info.publicToken)info=await api(`/api/checklist/events/${encodeURIComponent(eventId)}/acceptance/prepare`,{method:'POST'});
    renderAdminAcceptanceDialog(info);
  }catch(error){
    $('admin-acceptance-status').className='admin-acceptance-status error';
    $('admin-acceptance-status').innerHTML=`<strong>Não foi possível preparar o envio</strong><span>${esc(error.message)}</span>`;
  }
}
async function adminCopyAcceptanceLink(){const url=adminAcceptancePublicUrl(adminAcceptanceInfo);if(!url)return;try{await navigator.clipboard.writeText(url);message('Link do dossiê e aceite copiado.','success');}catch(_){$('admin-acceptance-link').select();document.execCommand('copy');message('Link copiado.','success');}}
function adminSendAcceptanceWhatsapp(){const info=adminAcceptanceInfo,url=adminAcceptancePublicUrl(info);if(url)window.open(`https://wa.me/?text=${encodeURIComponent(adminAcceptanceMessage(info,url))}`,'_blank','noopener,noreferrer');}
function adminOpenAcceptancePage(){const url=adminAcceptancePublicUrl(adminAcceptanceInfo);if(url)window.open(url,'_blank','noopener,noreferrer');}
async function adminDownloadAssociateDossier(){const info=adminAcceptanceInfo;if(!info?.publicToken)return;try{const blob=await apiBlob(`/api/public/events/acceptance/${encodeURIComponent(info.publicToken)}/dossier.pdf`),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`dossie-associado-${info.protocol||'evento'}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}catch(error){message(error.message);}}
function releaseAdminFilePreview(){if(adminFilePreviewUrl){URL.revokeObjectURL(adminFilePreviewUrl);adminFilePreviewUrl=null;}$('admin-file-preview-content').innerHTML='';}
async function openAdminFilePreview(button){
  const d=$('admin-file-preview-dialog');if(!d)return;
  releaseAdminFilePreview();
  $('admin-file-preview-title').textContent=button.dataset.name||'Arquivo';
  $('admin-file-preview-content').innerHTML='<div class="muted">Carregando prévia...</div>';
  if(!d.open)d.showModal();
  try{
    const path=`/api/checklist/events/${encodeURIComponent(button.dataset.event)}/attachments/${encodeURIComponent(button.dataset.id)}`;
    const blob=await apiBlob(path);
    adminFilePreviewUrl=URL.createObjectURL(blob);
    const type=(blob.type||button.dataset.type||'').toLowerCase();
    if(type.startsWith('image/')){
      $('admin-file-preview-content').innerHTML=`<img class="admin-file-preview-image" src="${adminFilePreviewUrl}" alt="${esc(button.dataset.name||'Arquivo')}" />`;
    }else if(type==='application/pdf'){
      $('admin-file-preview-content').innerHTML=`<iframe class="admin-file-preview-pdf" src="${adminFilePreviewUrl}" title="Prévia do PDF"></iframe>`;
    }else{
      $('admin-file-preview-content').innerHTML='<div class="muted">Este tipo de arquivo não possui prévia no navegador.</div>';
    }
    const open=$('admin-file-preview-open');open.hidden=false;open.onclick=()=>window.open(adminFilePreviewUrl,'_blank','noopener,noreferrer');
    const download=$('admin-file-preview-download');download.hidden=false;download.onclick=()=>downloadAdminBinary(path,button.dataset.name||'arquivo');
  }catch(error){$('admin-file-preview-content').innerHTML=`<div class="message error">${esc(error.message)}</div>`;}
}

async function openAdminEvent(id){
  openAdminOperationsDialog('Carregando ocorrência…','<div class="muted">Carregando todas as informações do evento.</div>');
  try{
    const e=await api(`/api/checklist/events/${encodeURIComponent(id)}`);
    const basic=nhInfoGrid([
      ['Protocolo',e.protocol],['Status',nhEventStatus(e.status)],['Tipo de evento',nhEventType(e.eventType)],['Data da ocorrência',date(e.occurredAt)],['Local',e.location],['Associado',e.associateName],['Nº associado',e.associateNumber],['Plano',e.planName],['Código do plano',e.planCode],['Mensalidade',e.planMonthlyAmount==null?'—':brl.format(e.planMonthlyAmount)],['Participação',e.participationAmount==null?'—':brl.format(e.participationAmount)],['Placa',e.vehiclePlate],['Marca',e.vehicleBrand],['Modelo',e.vehicleModel],['Versão/motorização',e.vehicleVersion],['Categoria',nhVehicleCategory(e.vehicleCategory)],['Configuração',e.vehicleSubtype],['Ano',e.vehicleYear],['Cor',e.vehicleColor],['Combustível',e.vehicleFuel],['Câmbio',e.vehicleTransmission],['Quilometragem',e.vehicleOdometer==null?'—':String(e.vehicleOdometer)],['FIPE',e.fipeValue==null?'—':brl.format(e.fipeValue)],['Chassi',e.chassis],['Criado por',e.createdByName],['Criado em',date(e.createdAt)],['Última atualização',date(e.updatedAt)]]);
    const attachments=(e.attachments||[]).map(a=>`<div class="admin-ops-row admin-file-row"><div><strong>${esc(a.originalName)}</strong><small>${esc(a.context||'')} · ${esc(a.attachmentKind||'')} · ${esc(date(a.createdAt))}${a.uploadedBy?` · ${esc(a.uploadedBy)}`:''}</small>${a.notes?`<p>${esc(a.notes)}</p>`:''}</div><div class="admin-file-actions"><button class="secondary admin-preview-event-file" data-event="${esc(e.id)}" data-id="${esc(a.id)}" data-name="${esc(a.originalName)}" data-type="${esc(a.contentType||'')}" type="button">Visualizar</button><button class="outline admin-download-event-file" data-event="${esc(e.id)}" data-id="${esc(a.id)}" data-name="${esc(a.originalName)}" type="button">Baixar</button></div></div>`);
    const checklist=(e.checklist||[]).map(i=>`<div class="admin-ops-row"><div><strong>${esc(i.section)} · ${esc(i.label)}</strong><small>Relatado: ${esc(i.reportedState||'—')} · Análise: ${esc(i.analysisState||'—')}</small>${i.reportedNotes?`<p>Relato: ${esc(i.reportedNotes)}</p>`:''}${i.analysisNotes?`<p>Análise: ${esc(i.analysisNotes)}</p>`:''}</div></div>`);
    const third=(e.thirdParties||[]).map(t=>`<div class="admin-ops-card"><strong>${esc(t.name||'Terceiro')}</strong><small>${esc(t.vehiclePlate||'—')} · ${esc(t.vehicleModel||'—')} · ${esc(nhVehicleCategory(t.vehicleCategory))}</small>${t.notes?`<p>${esc(t.notes)}</p>`:''}<div class="admin-mini-list">${(t.checklist||[]).map(i=>`<span>${esc(i.label)}: ${esc(i.analysisState||i.reportedState||'—')}</span>`).join('')}</div></div>`);
    const audit=(e.audit||[]).map(a=>`<div class="admin-ops-row"><div><strong>${esc(a.action)}</strong><small>${esc(a.actorName||a.actorUsername||'Sistema')} · ${esc(date(a.createdAt))}</small>${a.details?`<p>${esc(a.details)}</p>`:''}</div></div>`);
    const actions=`<div class="actions"><button class="secondary admin-download-dossier" data-event="${esc(e.id)}" data-kind="external" data-name="dossie-${esc(e.protocol)}.pdf" type="button">Baixar dossiê do associado</button><button class="outline admin-download-dossier" data-event="${esc(e.id)}" data-kind="internal" data-name="dossie-interno-${esc(e.protocol)}.pdf" type="button">Baixar dossiê interno</button></div>`;
    openAdminOperationsDialog(`Evento ${e.protocol}`,basic+(e.description?adminSection('Descrição',`<p>${esc(e.description)}</p>`):'')+(e.coverageNotes?adminSection('Plano / coberturas',`<p>${esc(e.coverageNotes)}</p>`):'')+adminSection('Arquivos e documentos',adminRows(attachments,'Nenhum arquivo anexado.'))+adminSection(`Checklist / análise registrada (${checklist.length} itens)`,adminProgressiveRows(checklist,'Nenhum item registrado nesta ocorrência.'))+adminSection('Terceiros',adminRows(third,'Nenhum terceiro cadastrado.'))+adminSection('Auditoria',adminRows(audit,'Nenhuma movimentação registrada.'))+actions);
    document.querySelectorAll('.admin-preview-event-file').forEach(b=>b.onclick=()=>openAdminFilePreview(b));
    document.querySelectorAll('.admin-download-event-file').forEach(b=>b.onclick=()=>downloadAdminBinary(`/api/checklist/events/${encodeURIComponent(b.dataset.event)}/attachments/${encodeURIComponent(b.dataset.id)}`,b.dataset.name));
    bindAdminProgressiveLists($('admin-operations-content'));
    document.querySelectorAll('.admin-download-dossier').forEach(b=>b.onclick=()=>downloadAdminBinary(b.dataset.kind==='internal'?`/api/checklist/events/${encodeURIComponent(b.dataset.event)}/internal-dossier.pdf`:`/api/checklist/events/${encodeURIComponent(b.dataset.event)}/dossier.pdf`,b.dataset.name));
  }catch(error){openAdminOperationsDialog('Evento','<div class="message error">'+esc(error.message)+'</div>');}
}

async function openAdminWorkshop(id){
  openAdminOperationsDialog('Carregando oficina…','<div class="muted">Carregando checklist técnico e compras.</div>');
  try{
    const e=await api(`/api/workshop/events/${encodeURIComponent(id)}`);
    const basic=nhInfoGrid([['Protocolo',e.protocol],['Status',nhEventStatus(e.eventStatus)],['Associado',e.associateName],['Nº associado',e.associateNumber],['Placa',e.vehiclePlate],['Marca / modelo',[e.vehicleBrand,e.vehicleModel].filter(Boolean).join(' / ')],['Versão',e.vehicleVersion],['Categoria',nhVehicleCategory(e.vehicleCategory)],['Configuração',e.vehicleSubtype],['Ano / cor',[e.vehicleYear,e.vehicleColor].filter(Boolean).join(' / ')],['Combustível / câmbio',[e.vehicleFuel,e.vehicleTransmission].filter(Boolean).join(' / ')],['Plano',e.planName],['Iniciado por',e.workshopStartedBy],['Início',date(e.workshopStartedAt)],['Concluído por',e.workshopCompletedBy],['Conclusão',date(e.workshopCompletedAt)]]);
    const items=(e.checklist||[]).map(i=>`<div class="admin-ops-row"><div><strong>${esc(i.section)} · ${esc(i.label)}</strong><small>${esc(NH_DAMAGE_LABELS[i.damageState]||i.damageState||'Não avaliado')}${i.repairAction?` · ${esc(NH_REPAIR_LABELS[i.repairAction]||i.repairAction)}`:''}${i.updatedBy?` · ${esc(i.updatedBy)}`:''}</small>${i.notes?`<p>${esc(i.notes)}</p>`:''}</div></div>`);
    const third=(e.thirdParties||[]).map(t=>`<div class="admin-ops-card"><strong>${esc(t.name||'Terceiro')}</strong><small>${esc(t.vehiclePlate||'—')} · ${esc(t.vehicleModel||'—')} · ${esc(nhVehicleCategory(t.vehicleCategory))}</small><div class="admin-mini-list">${(t.checklist||[]).map(i=>`<span>${esc(i.label)}: ${esc(NH_DAMAGE_LABELS[i.damageState]||i.damageState||'—')}${i.repairAction?` / ${esc(NH_REPAIR_LABELS[i.repairAction]||i.repairAction)}`:''}</span>`).join('')}</div></div>`);
    const purchases=(e.purchases||[]).map(p=>`<div class="admin-ops-row"><div><strong>${esc(p.itemLabel)}</strong><small>Fornecedor: ${esc(p.supplier||'—')} · Valor: ${p.amount==null?'—':esc(brl.format(p.amount))} · Prazo: ${esc(p.deliveryDeadline||'—')} · Status: ${esc(p.status||'—')}</small>${p.notes?`<p>${esc(p.notes)}</p>`:''}<small>Registro: ${esc(p.detailsSavedBy||p.updatedBy||'—')} · ${esc(date(p.detailsSavedAt||p.updatedAt))}</small></div></div>`);
    const actions=`<div class="actions"><button class="secondary admin-download-dossier" data-event="${esc(e.id)}" data-kind="external" data-name="dossie-${esc(e.protocol)}.pdf" type="button">Dossiê do associado</button><button class="outline admin-download-dossier" data-event="${esc(e.id)}" data-kind="internal" data-name="dossie-interno-${esc(e.protocol)}.pdf" type="button">Dossiê interno</button></div>`;
    openAdminOperationsDialog(`Oficina · ${e.protocol}`,basic+adminAcceptanceBarHtml(e)+adminSection(`Checklist técnico (${(e.checklist||[]).length} itens)`,adminProgressiveRows(items))+adminSection('Terceiros',adminRows(third,'Nenhum terceiro cadastrado.'))+adminSection(`Compras do Evento (${(e.purchases||[]).length})`,adminRows(purchases,'Nenhuma compra registrada.'))+actions);
    bindAdminProgressiveLists($('admin-operations-content'));
    bindAdminAcceptanceButtons($('admin-operations-content'));
    document.querySelectorAll('.admin-download-dossier').forEach(b=>b.onclick=()=>downloadAdminBinary(b.dataset.kind==='internal'?`/api/checklist/events/${encodeURIComponent(b.dataset.event)}/internal-dossier.pdf`:`/api/checklist/events/${encodeURIComponent(b.dataset.event)}/dossier.pdf`,b.dataset.name));
  }catch(error){openAdminOperationsDialog('Oficina','<div class="message error">'+esc(error.message)+'</div>');}
}

async function openAdminTow(id){
  openAdminOperationsDialog('Carregando reboque…','<div class="muted">Carregando checklist e registros do atendimento.</div>');
  try{
    const e=await api(`/api/tow/records/${encodeURIComponent(id)}`);
    const basic=nhInfoGrid([['Código',e.code],['Status',e.status==='COMPLETED'?'Concluído':'Em preenchimento'],['Placa',e.vehiclePlate],['Modelo',e.vehicleModel],['Categoria',nhVehicleCategory(e.vehicleCategory)],['Prestador / empresa',e.providerName],['Motorista',e.driverName],['Telefone',e.driverPhone],['Criado por',e.createdByName],['Criado em',date(e.createdAt)],['Concluído por',e.completedByName],['Concluído em',date(e.completedAt)],['Fotos',String(e.photoCount||0)]]);
    const items=(e.checklist||[]).map(i=>`<div class="admin-ops-row"><div><strong>${esc(i.section)} · ${esc(i.label)}</strong><small>${esc(NH_TOW_ANSWER_LABELS[i.answer]||i.answer||'Não informado')}${i.updatedBy?` · ${esc(i.updatedBy)}`:''}</small>${i.notes?`<p>${esc(i.notes)}</p>`:''}</div></div>`);
    const photos=(e.photos||[]).map(p=>`<div class="admin-ops-row"><div><strong>${esc(p.originalName)}</strong><small>${esc(p.photoKind||'Foto')} · ${esc(date(p.createdAt))}${p.uploadedBy?` · ${esc(p.uploadedBy)}`:''}</small>${p.notes?`<p>${esc(p.notes)}</p>`:''}</div><button class="outline admin-download-tow-photo" data-record="${esc(e.id)}" data-id="${esc(p.id)}" data-name="${esc(p.originalName)}" type="button">Baixar</button></div>`);
    openAdminOperationsDialog(`Reboque · ${e.code}`,basic+(e.generalNotes?adminSection('Observações gerais',`<p>${esc(e.generalNotes)}</p>`):'')+adminSection('Checklist de acessórios e pertences',adminRows(items))+adminSection('Fotos do atendimento',adminRows(photos,'Nenhuma foto registrada.')));
    document.querySelectorAll('.admin-download-tow-photo').forEach(b=>b.onclick=()=>downloadAdminBinary(`/api/tow/records/${encodeURIComponent(b.dataset.record)}/photos/${encodeURIComponent(b.dataset.id)}`,b.dataset.name));
  }catch(error){openAdminOperationsDialog('Guincho / Reboque','<div class="message error">'+esc(error.message)+'</div>');}
}

async function downloadAdminBinary(path,fileName){
  try{const blob=await apiBlob(path);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=fileName||'arquivo';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}catch(error){message(error.message);}
}

$('admin-event-filter')?.addEventListener('input', renderAdminEvents);
$('admin-workshop-filter')?.addEventListener('input', renderAdminWorkshop);
$('admin-purchases-filter')?.addEventListener('input', renderAdminPurchases);
$('admin-tow-filter')?.addEventListener('input', renderAdminTow);
$('coverage-status-filter').addEventListener('change', renderCoverages);
$('coverage-text-filter').addEventListener('input', renderCoverages);
$('audit-filter').addEventListener('input', renderAudit);
$('admin-download-all-files').addEventListener('click', downloadAllAdminFiles);
initAdminAutoPagination();
document.querySelectorAll('[data-open-settings]').forEach(button => button.addEventListener('click', openSettingsModal));
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => closeDialog(button.dataset.closeDialog)));
$('admin-acceptance-copy')?.addEventListener('click',adminCopyAcceptanceLink);
$('admin-acceptance-whatsapp')?.addEventListener('click',adminSendAcceptanceWhatsapp);
$('admin-acceptance-open')?.addEventListener('click',adminOpenAcceptancePage);
$('admin-acceptance-download')?.addEventListener('click',adminDownloadAssociateDossier);

document.querySelectorAll('.admin-dialog').forEach(dialog => {
  dialog.addEventListener('close', () => { if (dialog.id === 'inspection-dialog') releaseAdminMediaUrls(); if(dialog.id==='admin-file-preview-dialog')releaseAdminFilePreview(); });
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
  if (!token) {
    showLogin();
    return;
  }
  const cachedRole = localStorage.getItem(ROLE_KEY);
  if (cachedRole && cachedRole !== 'ADMIN') {
    (window.NH_ROUTING?.redirectForRole ? window.NH_ROUTING.redirectForRole(cachedRole) : location.replace({CONSULTANT:'/colaborador/',ANALYST:'/analise/',SUPERVISION_ANALYSIS:'/supervisao/',TOW_DRIVER:'/guincho/',WORKSHOP_MANAGER:'/oficina/',EVENT_OPERATOR:'/checklist/',BUYER:'/financeiro/',ADMIN:'/admin/'}[cachedRole]||'/'));
    return;
  }
  if (sessionExpired()) {
    showLogin('Sua sessão administrativa expirou. Entre novamente.');
    return;
  }
  try {
    const me = await api('/api/auth/me');
    if (me.role !== 'ADMIN') {
      localStorage.setItem(ROLE_KEY, me.role);
      (window.NH_ROUTING?.redirectForRole ? window.NH_ROUTING.redirectForRole(me.role) : location.replace({CONSULTANT:'/colaborador/',ANALYST:'/analise/',SUPERVISION_ANALYSIS:'/supervisao/',TOW_DRIVER:'/guincho/',WORKSHOP_MANAGER:'/oficina/',EVENT_OPERATOR:'/checklist/',BUYER:'/financeiro/',ADMIN:'/admin/'}[me.role]||'/'));
      return;
    }
    showAdmin();
    await load();
  } catch (error) {
    if (!error?.authExpired && $('admin-login').hidden) showLogin(error.message);
  }
}

window.addEventListener('pageshow', () => {
  if (!token) return;
  if (sessionExpired()) showLogin('Sua sessão administrativa expirou. Entre novamente.');
  else if (inactivityExpired()) showLogin('Sessão encerrada após 20 minutos de inatividade. Entre novamente.');
  else scheduleInactivityCheck();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !token) return;
  if (sessionExpired()) showLogin('Sua sessão administrativa expirou. Entre novamente.');
  else if (inactivityExpired()) showLogin('Sessão encerrada após 20 minutos de inatividade. Entre novamente.');
  else scheduleInactivityCheck();
});

installInactivityTracking();
if (token && lastActivityAtMs() === null) markSessionActivity(true);
else scheduleInactivityCheck();
boot();

bindCommercialPricingPreview(ADMIN_COMMERCIAL_CONFIG);
