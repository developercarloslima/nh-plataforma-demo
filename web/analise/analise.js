const TOKEN_KEY = 'nhPortalToken';
const ROLE_KEY = 'nhPortalRole';
const CONSULTANT_KEY = 'nhSelectedConsultant';
const $ = id => document.getElementById(id);

let token = localStorage.getItem(TOKEN_KEY);
let inspections = [];
let activeDecisionCommunication = null;
const mediaObjectUrls = new Set();

const STATUS = {
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

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));
const date = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
const hasFiles = item => Number(item?.assetCount || 0) > 0;

function badge(status) {
  const [label, kind] = STATUS[status] || [status, ''];
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
  token = null;
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

function showView() {
  $('analysis-login').hidden = true;
  $('analysis-view').hidden = false;
  $('logout').hidden = false;
}

function message(text, type = 'error') {
  const element = $('message');
  element.className = `message ${type}`;
  element.textContent = text;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(window.NH_API?.backend(path) || path, { ...options, headers });
  if (response.status === 401 || response.status === 403) {
    showLogin('Sua sessão expirou ou não possui acesso à equipe de análise.');
    throw new Error('Sessão inválida.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || 'Não foi possível concluir a operação.');
  }
  return response.status === 204 ? null : response.json();
}


async function apiBlob(path) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(window.NH_API?.backend(path) || path, { headers, cache: 'no-store' });
  if (response.status === 401 || response.status === 403) {
    showLogin('Sua sessão expirou ou não possui acesso à equipe de análise.');
    throw new Error('Sessão inválida.');
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

async function boot() {
  if (!token) return;
  try {
    const me = await api('/api/auth/me');
    localStorage.setItem(ROLE_KEY, me.role);
    if (me.role === 'ADMIN') {
      location.replace('/admin/');
      return;
    }
    if (me.role !== 'ANALYST') {
      location.replace('/colaborador/');
      return;
    }
    showView();
    await load();
  } catch (error) {
    if (!$('analysis-view').hidden) message(error.message);
  }
}

async function load() {
  const button = $('refresh');
  button.disabled = true;
  try {
    inspections = await api('/api/analysis/inspections');
    render();
  } finally {
    button.disabled = false;
  }
}

function actionLink(url, label, style = 'outline') {
  if (!url) return '';
  return `<a class="button ${style} small-button" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
}

function render() {
  const filter = $('filter').value.trim().toLowerCase();
  const rows = inspections
    .filter(item => `${item.associateName} ${item.plate || ''} ${item.consultantName} ${item.status}`.toLowerCase().includes(filter))
    .map(item => {
      const currentPublicUrl = item.publicUrl
        ? (window.NH_URLS?.retratoUrl(item.publicUrl) || item.publicUrl)
        : null;
      const filesAvailable = hasFiles(item);
      const statusActions = filesAvailable
        ? `<button class="outline small-button" data-analyze="${item.id}" type="button">Ver arquivos</button>`
        : '';
      const pendingActions = filesAvailable
        ? ''
        : `${actionLink(item.associateInspectionWhatsappUrl, 'Enviar link', 'secondary')}${actionLink(currentPublicUrl, 'Fazer vistoria')}`;

      return `<tr>
        <td><strong>${esc(item.associateName)}</strong><small class="table-code">${esc(formatPhone(item.whatsapp) || 'Sem WhatsApp')}</small></td>
        <td>${esc(item.plate || '0 km — sem placa')}</td>
        <td>${esc(item.consultantName)}</td>
        <td>${item.requestType === 'NEW_INSPECTION' ? 'Nova vistoria' : 'Atualização de boleto'}</td>
        <td>${date(item.completedAt || item.createdAt)}</td>
        <td><div class="status-with-action">${badge(item.status)}${statusActions}</div></td>
        <td><div class="row-actions">${pendingActions}<button class="secondary small-button" data-analyze="${item.id}" type="button">Analisar</button></div></td>
      </tr>`;
    }).join('');

  $('inspections-body').innerHTML = rows || '<tr><td colspan="7" class="empty-state">Nenhuma vistoria encontrada.</td></tr>';
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

function configureStatusOptions(item) {
  const select = $('inspection-status');
  const filesAvailable = hasFiles(item);
  const readyForAnalysis = filesAvailable
    && Boolean(item.completedAt)
    && Array.isArray(item.assets)
    && item.assets.some(asset => asset.type === 'REPORT' && asset.available);
  const allowedWhileWaiting = new Set(['WAITING_FILES', 'UPLOADING_FILES', 'CANCELLED', 'EXPIRED']);

  Array.from(select.options).forEach(option => {
    option.disabled = !readyForAnalysis && !allowedWhileWaiting.has(option.value);
  });

  if (!filesAvailable) {
    select.value = item.status === 'CANCELLED' || item.status === 'EXPIRED'
      ? item.status
      : 'WAITING_FILES';
  } else if (!readyForAnalysis) {
    select.value = item.status === 'CANCELLED' || item.status === 'EXPIRED'
      ? item.status
      : 'UPLOADING_FILES';
  } else {
    select.value = item.status;
  }
}

function openInspection(id) {
  const item = inspections.find(value => value.id === id);
  if (!item) return;

  releaseMediaUrls();
  const filesAvailable = hasFiles(item);
  const currentPublicUrl = item.publicUrl
    ? (window.NH_URLS?.retratoUrl(item.publicUrl) || item.publicUrl)
    : null;

  $('inspection-id').value = item.id;
  $('dialog-title').textContent = `${item.plate || '0 km — sem placa'} — ${item.associateName}`;
  $('inspection-note').value = item.adminNote || '';
  configureStatusOptions(item);

  const retentionText = filesAvailable
    ? `Disponíveis no painel até ${date(item.filesExpireAt)}.`
    : (Number(item.expiredAssetCount || 0) > 0
      ? 'O prazo de 40 dias terminou e os arquivos foram apagados automaticamente.'
      : 'Aguardando envio do associado.');

  $('inspection-details').innerHTML = details([
    ['Associado', item.associateName],
    ['CPF', item.maskedCpf],
    ['WhatsApp', formatPhone(item.whatsapp) || '—'],
    ['Consultor', item.consultantName],
    ['Placa', item.plate || '0 km — sem placa'],
    ['Tipo', item.requestType === 'NEW_INSPECTION' ? 'Nova vistoria' : 'Atualização de boleto'],
    ['Criada em', date(item.createdAt)],
    ['Concluída em', date(item.completedAt)],
    ['Arquivos disponíveis', item.assetCount],
    ['Situação dos arquivos', retentionText],
    ['Endereço', item.residenceAddress || '—']
  ]);

  $('inspection-links').innerHTML = links(filesAvailable ? [
    [currentPublicUrl, 'Abrir link da vistoria']
  ] : [
    [item.associateInspectionWhatsappUrl, 'Enviar link ao associado', 'secondary'],
    [currentPublicUrl, 'Fazer vistoria agora'],
    [item.teamWhatsappUrl, 'Comunicar equipe pelo WhatsApp']
  ]);

  renderInspectionFiles(item);
  showNotificationButton(item);
  $('inspection-dialog').showModal();
}

function renderInspectionFiles(item) {
  const section = $('inspection-files-section');
  const grid = $('inspection-files-grid');
  const assets = Array.isArray(item.assets) ? item.assets : [];
  const available = assets.filter(asset => asset.available);
  const expired = assets.filter(asset => !asset.available && asset.purgedAt);

  section.hidden = assets.length === 0;
  if (section.hidden) {
    grid.innerHTML = '';
    return;
  }

  $('inspection-files-retention').textContent = available.length
    ? `Os arquivos ficam disponíveis até ${date(item.filesExpireAt)} e são apagados automaticamente após 40 dias.`
    : 'O prazo de 40 dias terminou e os arquivos foram apagados automaticamente.';
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
    const actions = asset.available
      ? `<div class="inspection-media-actions">${video ? `<button class="outline" data-play-video="${asset.id}" type="button">Reproduzir</button>` : ''}<button class="secondary" data-download-asset="${asset.id}" data-file-name="${esc(asset.fileName)}" type="button">Baixar</button></div>`
      : '<div class="inspection-media-expired">Arquivo removido após 40 dias.</div>';
    return `<article class="inspection-media-card ${asset.available ? '' : 'expired'}">${preview}<div class="inspection-media-body"><strong>${esc(title)}</strong><small>${esc(asset.fileName)}</small><small>${formatBytes(asset.fileSize)} · ${esc(asset.contentType || 'arquivo')}</small>${actions}</div></article>`;
  }).join('');

  available.filter(asset => String(asset.contentType || '').startsWith('image/')).forEach(asset => loadImagePreview(item.id, asset));
  grid.querySelectorAll('[data-download-asset]').forEach(button => {
    button.addEventListener('click', () => downloadAsset(item.id, button.dataset.downloadAsset, button.dataset.fileName, button));
  });
  grid.querySelectorAll('[data-play-video]').forEach(button => {
    button.addEventListener('click', () => playVideo(item.id, button.dataset.playVideo, button));
  });
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

$('inspection-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('inspection-id').value;
  try {
    const updated = await api(`/api/analysis/inspections/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: $('inspection-status').value,
        adminNote: $('inspection-note').value.trim()
      })
    });
    const index = inspections.findIndex(item => item.id === updated.id);
    if (index >= 0) inspections[index] = updated;
    render();
    showNotificationButton(updated);
    message('Análise salva com sucesso.', 'success');
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
    : `A vistoria de ${item.associateName} foi recusada. Comunique a recusa e as orientações ao associado.`;
  $('decision-whatsapp-details').innerHTML = `<div><span>Associado</span><strong>${esc(item.associateName)}</strong></div><div><span>Veículo</span><strong>${esc(item.plate || '0 km — sem placa')}</strong></div><div><span>Novo status</span><strong>${approved ? 'Aprovada' : 'Recusada'}</strong></div>`;
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
    if (data.role === 'ADMIN') {
      location.href = '/admin/';
    } else if (data.role === 'ANALYST') {
      showView();
      await load();
    } else {
      location.href = '/colaborador/';
    }
  } catch (error) {
    box.className = 'message error';
    box.textContent = error.message;
  }
});

$('download-all-files').addEventListener('click', downloadAllFiles);
$('filter').addEventListener('input', render);
$('refresh').addEventListener('click', () => load().catch(error => message(error.message)));
$('close-dialog').addEventListener('click', () => { releaseMediaUrls(); $('inspection-dialog').close(); });
$('cancel-dialog').addEventListener('click', () => { releaseMediaUrls(); $('inspection-dialog').close(); });
$('inspection-dialog').addEventListener('close', releaseMediaUrls);
$('logout').addEventListener('click', () => showLogin());
boot();
