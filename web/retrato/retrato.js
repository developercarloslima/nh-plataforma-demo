const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(location.search).get('token');

const VEHICLE_PROFILES = {
  MOTORCYCLE: {
    title: 'Moto ou veículo com menos de 4 rodas',
    photos: [
      { label: 'Selfie mostrando a placa da moto', guide: '/assets/inspection-guides/moto-01-selfie-placa.webp', facingMode: 'user' },
      { label: 'Frente', guide: '/assets/inspection-guides/moto-02-frente.webp' },
      { label: 'Lateral esquerda', guide: '/assets/inspection-guides/moto-03-lateral-esquerda.webp' },
      { label: 'Traseira', guide: '/assets/inspection-guides/moto-04-traseira.webp' },
      { label: 'Lateral direita', guide: '/assets/inspection-guides/moto-05-lateral-direita.webp' },
      { label: 'Chassi', guide: '/assets/inspection-guides/moto-06-chassi.webp' },
      { label: 'Odômetro', guide: '/assets/inspection-guides/moto-07-odometro.webp' }
    ],
    videoGuide: '/assets/guia-vistoria-moto.png',
    videoInstruction: 'Com o veículo ligado, inicie a gravação mostrando o chassi legível. Fale seu nome completo, o dia, o mês e o ano. Mostre os 4 lados da motocicleta detalhadamente, dando um giro de 360° em torno do veículo. Finalize mostrando o odômetro com o KM total. A gravação deve ter no mínimo 1 minuto e 30 segundos e será encerrada automaticamente logo após atingir esse tempo.'
  },
  FOUR_WHEELS_OR_MORE: {
    title: 'Carro, utilitário ou veículo com 4 rodas ou mais',
    photos: [
      { label: 'Selfie na frente do carro', guide: '/assets/inspection-guides/carro-01-selfie-frente.webp', facingMode: 'user' },
      { label: 'Frente do carro', guide: '/assets/inspection-guides/carro-02-frente.webp' },
      { label: 'Frente do carro com motor e placa', guide: '/assets/inspection-guides/carro-03-motor-placa.webp' },
      { label: 'Para-brisa', guide: '/assets/inspection-guides/carro-04-parabrisa.webp' },
      { label: 'Caixa de roda dianteira — lado direito', guide: '/assets/inspection-guides/carro-05-roda-dianteira-direita.webp' },
      { label: 'Lateral direita', guide: '/assets/inspection-guides/carro-06-lateral-direita.webp' },
      { label: 'Caixa de roda traseira — lado direito', guide: '/assets/inspection-guides/carro-07-roda-traseira-direita.webp' },
      { label: 'Traseira do veículo', guide: '/assets/inspection-guides/carro-08-traseira.webp' },
      { label: 'Mala aberta', guide: '/assets/inspection-guides/carro-09-mala-aberta.webp' },
      { label: 'Caixa de roda traseira — lado esquerdo', guide: '/assets/inspection-guides/carro-10-roda-traseira-esquerda.webp' },
      { label: 'Lateral esquerda', guide: '/assets/inspection-guides/carro-11-lateral-esquerda.webp' },
      { label: 'Caixa de roda dianteira — lado esquerdo', guide: '/assets/inspection-guides/carro-12-roda-dianteira-esquerda.webp' },
      { label: 'Odômetro mostrando o KM total', guide: '/assets/inspection-guides/carro-13-odometro.webp' },
      { label: 'Foto interna mostrando o painel completo', guide: '/assets/inspection-guides/carro-14-painel-interno.webp' },
      { label: 'Foto do chassi', guide: '/assets/inspection-guides/carro-15-chassi.webp' }
    ],
    videoGuide: '/assets/guia-vistoria-carro.png',
    videoInstruction: 'Com o veículo ligado, inicie a gravação mostrando o chassi legível. Fale seu nome completo, o dia, o mês e o ano. Mostre os 4 lados do veículo detalhadamente, dando um giro de 360° em torno do veículo. Finalize abrindo a porta do motorista e mostrando o odômetro com o KM total. A gravação deve ter no mínimo 1 minuto e 30 segundos e será encerrada automaticamente logo após atingir esse tempo.'
  }
};

const allowedVideoTypes = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp'
]);

const VIDEO_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MIN_DURATION_SECONDS = 90;
const VIDEO_AUTO_STOP_SECONDS = 91;
const VIDEO_TARGET_VIDEO_BITRATE = 480_000;
const VIDEO_TARGET_AUDIO_BITRATE = 32_000;

let request = null;
let inspectionProfile = VEHICLE_PROFILES.FOUR_WHEELS_OR_MORE;
let labels = [];
let photoFiles = [];
let photoPreviewUrls = [];
let pendingGuideAction = null;
let videoFile = null;
let videoPreviewUrl = null;
let activeStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordedVideoBytes = 0;
let videoDurationSeconds = null;
let currentPhotoIndex = null;
let captureMode = null;
let selfieMirrorCorrection = false;
let activeFacingMode = 'environment';
let recordingTimer = null;
let recordingElapsedMs = 0;
let recordingActiveSince = null;
let recordingStopRequested = false;
let recordingInterrupted = false;
let recordingMustRestart = false;
let recordingInterruptionReason = '';
let recordingWakeLock = null;
let torchSupported = false;
let torchEnabled = false;
let discardRecording = false;
let signatureHasInk = false;
let vehicleDocumentFile = null;
let identityDocumentFrontFile = null;
let identityDocumentBackFile = null;
let signatureDrawing = false;
let signatureLastPoint = null;

const DRAFT_DB_NAME = 'nh-retrato-drafts';
const DRAFT_STORE_NAME = 'inspection-drafts';
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let draftDatabasePromise = null;
let draftSaveTimer = null;
let restoredSignatureBlob = null;
let hasRestoredDraft = false;
let draftSaveQueue = Promise.resolve();

const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const UPLOAD_MAX_ATTEMPTS = 4;
const UPLOAD_RETRY_BASE_MS = 1200;

function friendlyNetworkMessage(error, fallback) {
  const raw = String(error?.message || '').trim();
  if (!navigator.onLine) {
    return 'A internet está indisponível. Seus arquivos continuam salvos neste aparelho para tentar novamente.';
  }
  if (!raw || /load failed|failed to fetch|networkerror|network request failed/i.test(raw)) {
    return fallback;
  }
  return raw;
}

function openDraftDatabase() {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('Armazenamento local não disponível.'));
  }
  if (draftDatabasePromise) return draftDatabasePromise;

  draftDatabasePromise = new Promise((resolve, reject) => {
    const requestDb = indexedDB.open(DRAFT_DB_NAME, 1);
    requestDb.onupgradeneeded = () => {
      const database = requestDb.result;
      if (!database.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        database.createObjectStore(DRAFT_STORE_NAME, { keyPath: 'token' });
      }
    };
    requestDb.onsuccess = () => resolve(requestDb.result);
    requestDb.onerror = () => reject(requestDb.error || new Error('Não foi possível abrir o armazenamento local.'));
    requestDb.onblocked = () => reject(new Error('O armazenamento local está bloqueado por outra aba.'));
  });
  return draftDatabasePromise;
}

async function runDraftTransaction(mode, operation) {
  const database = await openDraftDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE_NAME, mode);
    const store = transaction.objectStore(DRAFT_STORE_NAME);
    let result;
    try {
      result = operation(store);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result?.result);
    transaction.onerror = () => reject(transaction.error || result?.error || new Error('Falha ao salvar o rascunho.'));
    transaction.onabort = () => reject(transaction.error || new Error('O salvamento do rascunho foi cancelado.'));
  });
}

function serializedFile(file) {
  if (!file) return null;
  return {
    blob: file,
    name: file.name || 'arquivo',
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified || Date.now()
  };
}

function restoredFile(entry, fallbackName, fallbackType) {
  if (!entry?.blob) return null;
  const type = entry.type || entry.blob.type || fallbackType;
  try {
    return new File([entry.blob], entry.name || fallbackName, {
      type,
      lastModified: entry.lastModified || Date.now()
    });
  } catch (_) {
    const blob = entry.blob;
    blob.name = entry.name || fallbackName;
    return blob;
  }
}

async function readDraft() {
  if (!token) return null;
  try {
    const database = await openDraftDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(DRAFT_STORE_NAME, 'readonly');
      const operation = transaction.objectStore(DRAFT_STORE_NAME).get(token);
      operation.onsuccess = () => resolve(operation.result || null);
      operation.onerror = () => reject(operation.error || new Error('Não foi possível ler o rascunho.'));
    });
  } catch (_) {
    return null;
  }
}

async function removeDraft() {
  if (draftSaveTimer) {
    window.clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }
  if (!token || !('indexedDB' in window)) return;
  try {
    await runDraftTransaction('readwrite', store => store.delete(token));
  } catch (_) {
    // A limpeza local não pode impedir a conclusão da vistoria.
  }
  hasRestoredDraft = false;
  restoredSignatureBlob = null;
  $('draft-panel').hidden = true;
}

function updateDraftPanel(text, kind = 'ok') {
  const panel = $('draft-panel');
  const status = $('draft-status');
  panel.hidden = false;
  panel.dataset.kind = kind;
  status.textContent = text;
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch (_) {
    // Nem todos os navegadores permitem solicitar persistência.
  }
}

function saveDraftNow(reason = '') {
  if (!request || !token || ['COMPLETED', 'APPROVED', 'REJECTED'].includes(request.status)) {
    return Promise.resolve();
  }
  draftSaveQueue = draftSaveQueue
    .catch(() => undefined)
    .then(() => persistDraftSnapshot(reason));
  return draftSaveQueue;
}

async function persistDraftSnapshot(reason = '') {
  if (!request || ['COMPLETED', 'APPROVED', 'REJECTED'].includes(request.status)) return;
  if (!('indexedDB' in window)) {
    updateDraftPanel('Este navegador não permite manter uma cópia local. Não feche a página antes do envio.', 'warning');
    return;
  }

  try {
    const signatureBlob = signatureHasInk ? await exportSignatureBlob() : null;
    const snapshot = {
      token,
      requestType: request.requestType,
      vehicleType: request.vehicleType,
      labels: [...labels],
      photos: photoFiles.map(serializedFile),
      video: serializedFile(videoFile),
      vehicleDocument: serializedFile(vehicleDocumentFile),
      identityDocumentFront: serializedFile(identityDocumentFrontFile),
      identityDocumentBack: serializedFile(identityDocumentBackFile),
      residenceAddress: $('residence-address').value.trim(),
      signature: signatureBlob,
      updatedAt: Date.now()
    };
    await runDraftTransaction('readwrite', store => store.put(snapshot));
    hasRestoredDraft = true;
    const time = new Date(snapshot.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    updateDraftPanel(reason || `Rascunho salvo às ${time}. Se o envio falhar, basta tentar novamente.`, 'ok');
  } catch (error) {
    const quota = error?.name === 'QuotaExceededError' || /quota|storage/i.test(String(error?.message || ''));
    updateDraftPanel(
      quota
        ? 'O aparelho não possui espaço suficiente para guardar todos os arquivos. Mantenha esta página aberta até concluir o envio.'
        : 'Não foi possível atualizar a cópia local. Mantenha esta página aberta até concluir o envio.',
      'warning'
    );
  }
}

function scheduleDraftSave(delay = 500, reason = '') {
  if (draftSaveTimer) window.clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(() => {
    draftSaveTimer = null;
    saveDraftNow(reason);
  }, delay);
}

async function restoreDraftFromCache() {
  const draft = await readDraft();
  if (!draft) return;
  if (!draft.updatedAt || Date.now() - draft.updatedAt > DRAFT_MAX_AGE_MS) {
    await removeDraft();
    return;
  }
  if (draft.requestType !== request.requestType || draft.vehicleType !== request.vehicleType) {
    await removeDraft();
    return;
  }

  photoFiles = labels.map((label, index) => restoredFile(
    draft.photos?.[index],
    `${String(index + 1).padStart(2, '0')}-${slugify(label)}.jpg`,
    'image/jpeg'
  ));
  videoFile = restoredFile(draft.video, 'video-vistoria.webm', 'video/webm');
  if (videoFile && videoFile.size > VIDEO_MAX_BYTES) {
    videoFile = null;
  }
  vehicleDocumentFile = restoredFile(draft.vehicleDocument, 'crlv-veiculo.pdf', 'application/pdf');
  identityDocumentFrontFile = restoredFile(draft.identityDocumentFront || draft.identityDocument, 'rg-cnh-frente.pdf', 'application/pdf');
  identityDocumentBackFile = restoredFile(draft.identityDocumentBack, 'rg-cnh-verso.pdf', 'application/pdf');
  $('residence-address').value = request?.residenceAddress || draft.residenceAddress || '';
  restoredSignatureBlob = draft.signature || null;
  hasRestoredDraft = photoFiles.some(Boolean)
    || Boolean(videoFile)
    || Boolean(vehicleDocumentFile)
    || Boolean(identityDocumentFrontFile)
    || Boolean(identityDocumentBackFile)
    || Boolean(restoredSignatureBlob)
    || Boolean(draft.residenceAddress);

  discardLocalCopiesAlreadyOnServer();
  hasRestoredDraft = photoFiles.some(Boolean)
    || Boolean(videoFile)
    || Boolean(vehicleDocumentFile)
    || Boolean(identityDocumentFrontFile)
    || Boolean(identityDocumentBackFile)
    || Boolean(restoredSignatureBlob)
    || Boolean((!request?.residenceAddress) && $('residence-address').value.trim());

  if (hasRestoredDraft) {
    $('start').textContent = 'Continuar vistoria salva →';
    updateDraftPanel(`Rascunho recuperado deste aparelho. Última atualização: ${new Date(draft.updatedAt).toLocaleString('pt-BR')}.`, 'ok');
    msg('Encontramos as fotos e o vídeo salvos neste aparelho. Você pode continuar sem repetir o que já registrou.', 'success');
  }
}

async function applyRestoredDraftToUi() {
  photoFiles.forEach((file, index) => {
    if (!file) return;
    if (photoPreviewUrls[index]) URL.revokeObjectURL(photoPreviewUrls[index]);
    photoPreviewUrls[index] = URL.createObjectURL(file);
    const image = $(`photo-preview-${index}`);
    if (image) {
      image.src = photoPreviewUrls[index];
      image.hidden = false;
    }
    const status = $(`photo-status-${index}`);
    if (status) status.textContent = 'Foto recuperada do rascunho deste aparelho.';
    const button = document.querySelector(`[data-photo-index="${index}"]`);
    if (button) {
      button.textContent = 'Refazer foto';
      button.classList.add('captured');
    }
  });

  if (videoFile) {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    videoPreviewUrl = URL.createObjectURL(videoFile);
    $('video-preview').src = videoPreviewUrl;
    $('video-preview').hidden = false;
    $('video-status').textContent = `Vídeo recuperado do rascunho (${formatBytes(videoFile.size)}).`;
    $('record-video').textContent = 'Gravar novamente';
    $('record-video').classList.add('captured');
  }

  if (vehicleDocumentFile) {
    updateDocumentStatus('vehicle-document', vehicleDocumentFile, true);
  }
  if (identityDocumentFrontFile) {
    updateDocumentStatus('identity-document-front', identityDocumentFrontFile, true);
  }
  if (identityDocumentBackFile) {
    updateDocumentStatus('identity-document-back', identityDocumentBackFile, true);
  }
  if (restoredSignatureBlob) {
    await drawSignatureBlob(restoredSignatureBlob);
  }
  updateCaptureSummary();
}

async function drawSignatureBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    signatureContext.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    signatureContext.drawImage(image, 0, 0, signatureCanvas.width, signatureCanvas.height);
    signatureHasInk = true;
    signatureCanvas.classList.add('has-signature');
    $('signature-status').textContent = 'Assinatura recuperada do rascunho.';
    $('signature-status').classList.add('ok');
  } catch (_) {
    restoredSignatureBlob = null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function databaseCompletionConfirmed(body) {
  if (!body || !['COMPLETED', 'APPROVED', 'REJECTED'].includes(body.status)) return false;
  if (!Array.isArray(body.assets)) return false;

  const assetTypes = body.assets.filter(asset => asset.available).map(asset => asset.type);
  if (!assetTypes.includes('VIDEO')) return false;
  if (body.requestType !== 'NEW_INSPECTION') return true;

  const expectedPhotos = (VEHICLE_PROFILES[body.vehicleType] || VEHICLE_PROFILES.FOUR_WHEELS_OR_MORE).photos.length;
  const confirmedPhotos = assetTypes.filter(type => type === 'PHOTO').length;
  const confirmedIdentityDocuments = assetTypes.filter(type => type === 'IDENTITY_DOCUMENT').length;
  return confirmedPhotos >= expectedPhotos
    && assetTypes.includes('SIGNATURE')
    && assetTypes.includes('VEHICLE_DOCUMENT')
    && confirmedIdentityDocuments >= 2;
}

async function checkIfServerCompleted() {
  try {
    const response = await fetch(
      window.NH_API?.backend(`/api/public/inspections/${encodeURIComponent(token)}`) || `/api/public/inspections/${encodeURIComponent(token)}`,
      { cache: 'no-store' }
    );
    if (!response.ok) return false;
    const body = await response.json();
    request = body;
    if (databaseCompletionConfirmed(body)) {
      showComplete(body);
      return true;
    }
  } catch (_) {
    // O rascunho local permanece disponível para uma nova tentativa.
  }
  return false;
}

function configureInspectionProfile(vehicleType) {
  inspectionProfile = VEHICLE_PROFILES[vehicleType] || VEHICLE_PROFILES.FOUR_WHEELS_OR_MORE;
  labels = inspectionProfile.photos.map((photo) => photo.label);
  photoFiles = new Array(labels.length).fill(null);
  photoPreviewUrls = new Array(labels.length).fill(null);
  vehicleDocumentFile = null;
  identityDocumentFrontFile = null;
  identityDocumentBackFile = null;

  $('vehicle-guide-title').textContent = inspectionProfile.title;
  $('vehicle-guide-count').textContent = `${labels.length} fotos obrigatórias + 1 vídeo`;
  $('video-title').textContent = `${labels.length + 1}. Vídeo da vistoria *`;
  $('video-card-instruction').textContent = inspectionProfile.videoInstruction;
}

function msg(text, type = 'error') {
  const element = $('message');
  element.className = `message ${type}`;
  element.textContent = text;
}

function clearMessage() {
  const element = $('message');
  element.className = '';
  element.textContent = '';
}

async function load() {
  $('connection-actions').hidden = true;
  clearMessage();

  if (!token) {
    msg('Link de vistoria não informado. Solicite um novo link ao consultor.');
    return;
  }

  try {
    const response = await fetch(
      window.NH_API?.backend(`/api/public/inspections/${encodeURIComponent(token)}`) || `/api/public/inspections/${encodeURIComponent(token)}`,
      { cache: 'no-store' }
    );
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(body?.message || 'Link de vistoria inválido ou indisponível.');
    }

    request = body;
    configureInspectionProfile(body.vehicleType);
    const pendingSlots = pendingRequiredSlots();
    const selective = isSelectiveResubmission();
    $('vehicle-guide-count').textContent = selective
      ? `${pendingSlots.length} pendência${pendingSlots.length === 1 ? '' : 's'} para refazer · os demais arquivos foram mantidos`
      : (body.requestType === 'NEW_INSPECTION'
        ? `${labels.length} fotos obrigatórias + 1 vídeo`
        : '1 vídeo obrigatório para atualização de boleto');

    if (databaseCompletionConfirmed(body)) {
      showComplete(body);
      return;
    }
    if (['COMPLETED', 'APPROVED', 'REJECTED'].includes(body.status)) {
      msg('O servidor ainda não confirmou todos os arquivos no banco de dados. Aguarde a conclusão do envio ou solicite a reabertura da vistoria.');
      return;
    }
    if (body.status === 'CANCELLED') {
      msg('Esta solicitação de vistoria foi cancelada. Fale com o seu consultor para receber um novo link.');
      return;
    }
    if (body.status === 'EXPIRED') {
      msg('Este link de vistoria expirou. Fale com o seu consultor para receber um novo link.');
      return;
    }

    $('title').textContent = selective
      ? 'Refazer arquivos pendentes'
      : (body.requestType === 'NEW_INSPECTION'
        ? 'Nova vistoria do veículo'
        : 'Atualização de boleto');
    const contractedPlanText = body.requestType === 'BILL_UPDATE' && body.contractedPlan
      ? ` · Plano atual: ${body.contractedPlan}`
      : '';
    $('subtitle').textContent = `Associado: ${body.associateName} · ${vehiclePlateLabel(body.plate)}${contractedPlanText}`;
    $('guideline-card').hidden = false;
    await restoreDraftFromCache();
    if (selective) {
      msg('Os arquivos já aceitos continuam salvos. Este link pedirá somente o que foi rejeitado, excluído ou ainda está faltando.', 'success');
      $('start').textContent = 'Refazer somente as pendências →';
    }
  } catch (error) {
    msg(friendlyNetworkMessage(
      error,
      'Não foi possível carregar os dados da vistoria agora. Verifique a internet e toque em “Tentar carregar novamente”.'
    ));
    $('connection-actions').hidden = false;
  }
}

$('start').addEventListener('click', async () => {
  clearMessage();
  await requestPersistentStorage();
  $('guideline-card').hidden = true;
  $('upload-card').hidden = false;

  const fullInspection = request.requestType === 'NEW_INSPECTION';
  const selective = isSelectiveResubmission();
  const orders = requiredAssetOrders();
  const pending = pendingRequiredSlots();

  $('upload-heading').textContent = selective
    ? 'Refazer arquivos pendentes'
    : (fullInspection ? `Vistoria de ${inspectionProfile.title.toLowerCase()}` : 'Vídeo para atualização de boleto');
  $('upload-note').textContent = selective
    ? `Somente ${pending.length} ${pending.length === 1 ? 'item está pendente' : 'itens estão pendentes'}. Tudo que já foi aceito permanece salvo e não precisa ser refeito.`
    : (fullInspection
      ? `Registre as ${labels.length} fotos na ordem indicada. Antes de cada abertura da câmera, a imagem ilustrativa correspondente será exibida.`
      : 'Antes da gravação, você verá as diretrizes específicas para este tipo de veículo.');

  if ($('residence-address')) {
    $('residence-address').value = request.residenceAddress || $('residence-address').value || '';
    $('residence-address').required = fullInspection && !request.residenceAddress;
  }

  const pendingRegistration = fullInspection && (
    !request.residenceAddress
    || !serverHasAsset('SIGNATURE', orders.signature)
    || !serverHasAsset('VEHICLE_DOCUMENT', orders.vehicleDocument)
    || !serverHasAsset('IDENTITY_DOCUMENT', orders.identityFront)
    || !serverHasAsset('IDENTITY_DOCUMENT', orders.identityBack)
  );
  $('registration-fields').hidden = !pendingRegistration;
  $('residence-address-field').hidden = !fullInspection || Boolean(request.residenceAddress);
  $('vehicle-document-card').hidden = !fullInspection || serverHasAsset('VEHICLE_DOCUMENT', orders.vehicleDocument);
  $('identity-document-front-card').hidden = !fullInspection || serverHasAsset('IDENTITY_DOCUMENT', orders.identityFront);
  $('identity-document-back-card').hidden = !fullInspection || serverHasAsset('IDENTITY_DOCUMENT', orders.identityBack);
  $('signature-block').hidden = !fullInspection || serverHasAsset('SIGNATURE', orders.signature);

  $('video-capture-card').hidden = serverHasAsset('VIDEO', orders.video);
  $('video-title').textContent = fullInspection
    ? `${labels.length + 1}. Vídeo da vistoria *`
    : 'Vídeo para atualização de boleto *';

  if (fullInspection) {
    renderPhotoCaptureCards();
    if (!serverHasAsset('SIGNATURE', orders.signature)) initializeSignaturePad();
  } else {
    $('photos').innerHTML = '';
  }

  $('submit-inspection').textContent = selective ? 'Enviar arquivos pendentes' : 'Enviar vistoria com segurança';

  if (hasRestoredDraft) {
    await applyRestoredDraftToUi();
  } else {
    updateCaptureSummary();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function renderPhotoCaptureCards() {
  $('photos').innerHTML = labels.map((label, index) => {
    if (serverHasAsset('PHOTO', index + 1)) return '';
    return `
    <article class="upload-item camera-upload-item">
      <strong>${index + 1}. ${escapeHtml(label)}</strong>
      <small>Ao tocar em “Abrir câmera”, você verá primeiro a imagem ilustrativa desta etapa.</small>
      <img id="photo-preview-${index}" class="capture-preview" alt="Prévia de ${escapeHtml(label)}" hidden>
      <p id="photo-status-${index}" class="capture-status">Foto ainda não registrada.</p>
      <button class="outline camera-action" type="button" data-photo-index="${index}">
        Abrir câmera
      </button>
    </article>
  `;
  }).join('');

  document.querySelectorAll('[data-photo-index]').forEach((button) => {
    button.addEventListener('click', () => showPhotoGuide(Number(button.dataset.photoIndex)));
  });
}

function showPhotoGuide(index) {
  const photo = inspectionProfile.photos[index];
  pendingGuideAction = { type: 'photo', index };
  $('capture-guide-eyebrow').textContent = `FOTO ${index + 1} DE ${labels.length}`;
  $('capture-guide-title').textContent = photo.label;
  $('capture-guide-warning').textContent = 'Esta foto deve seguir as diretrizes da imagem ilustrativa.';
  $('capture-guide-image').src = photo.guide;
  $('capture-guide-image').alt = `Imagem ilustrativa: ${photo.label}`;
  $('capture-guide-image').hidden = false;
  const normalizedLabel = photo.label.toLowerCase();
  const discountPercent = Number(request?.discountPercent || 0);
  const rearWindowCondition = normalizedLabel.includes('traseira') && inspectionProfile === VEHICLE_PROFILES.FOUR_WHEELS_OR_MORE
    ? (
      discountPercent === 15
        ? ' Mostre claramente o perfurado do vigia traseiro com as duas logomarcas: Novo Horizonte e a outra empresa. Essa condição será conferida pela equipe de análise para validar o desconto de 15%.'
        : discountPercent === 30
          ? ' Mostre claramente o perfurado do vigia traseiro contendo somente a logomarca da Novo Horizonte. Essa condição será conferida pela equipe de análise para validar o desconto de 30%.'
          : ''
    )
    : '';

  $('capture-guide-instruction').textContent = normalizedLabel.includes('selfie')
    ? 'Enquadre o associado e o veículo como no exemplo. Quando houver placa, ela precisa ficar legível. Para veículo 0 km sem placa, mostre claramente a dianteira.'
    : 'Observe o ângulo, a distância e a área do veículo mostrada no exemplo. Tire a foto com boa iluminação e sem cortar a parte solicitada.' + rearWindowCondition;
  $('capture-guide-continue').textContent = 'Entendi, abrir câmera';
  showGuidePage();
}

function showVideoGuide() {
  pendingGuideAction = { type: 'video' };
  $('capture-guide-eyebrow').textContent = request?.requestType === 'NEW_INSPECTION'
    ? `VÍDEO ${labels.length + 1}`
    : 'VÍDEO OBRIGATÓRIO';
  $('capture-guide-title').textContent = 'Vídeo de conclusão da vistoria';
  $('capture-guide-warning').textContent = 'Este vídeo deve seguir todas as diretrizes abaixo.';
  $('capture-guide-image').src = inspectionProfile.videoGuide;
  $('capture-guide-image').alt = `Guia de vídeo para ${inspectionProfile.title.toLowerCase()}`;
  $('capture-guide-image').hidden = false;
  $('capture-guide-instruction').textContent = inspectionProfile.videoInstruction;
  $('capture-guide-continue').textContent = 'Entendi, abrir câmera para gravar';
  showGuidePage();
}

function showGuidePage() {
  $('upload-card').hidden = true;
  $('capture-guide-card').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideGuidePage({ restoreUpload = false } = {}) {
  $('capture-guide-card').hidden = true;
  if (restoreUpload) {
    $('upload-card').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  pendingGuideAction = null;
}

$('capture-guide-back').addEventListener('click', () => hideGuidePage({ restoreUpload: true }));
$('capture-guide-continue').addEventListener('click', async () => {
  const action = pendingGuideAction;

  // O clique em “Entendi” é o gesto direto do usuário que libera a câmera no mobile.
  $('capture-guide-card').hidden = true;
  $('upload-card').hidden = false;
  pendingGuideAction = null;

  if (!action) return;
  if (action.type === 'photo') {
    await openPhotoCamera(action.index);
  } else {
    await openVideoCamera();
  }
});

async function openPhotoCamera(index) {
  currentPhotoIndex = index;
  captureMode = 'photo';
  discardRecording = false;
  clearMessage();

  try {
    const photo = inspectionProfile.photos[index];
    const isSelfie = photo.label.toLowerCase().includes('selfie');
    selfieMirrorCorrection = isSelfie;
    await openCamera({ audio: false, facingMode: photo.facingMode || 'environment' });
    applySelfieOrientation();
    $('camera-title').textContent = `${index + 1}. ${labels[index]}`;
    $('camera-instruction').textContent = isSelfie
      ? 'Reproduza o enquadramento mostrado no guia. Confira se a placa aparece com as letras na orientação correta. Use “Inverter imagem” se necessário.'
      : 'Reproduza o ângulo mostrado no guia e toque em “Capturar foto”.';
    $('toggle-selfie-mirror').hidden = !isSelfie;
    $('capture-photo').hidden = false;
    $('start-recording').hidden = true;
    $('stop-recording').hidden = true;
    $('resume-recording').hidden = true;
    $('toggle-flash').hidden = true;
    $('recording-paused-banner').hidden = true;
    $('recording-indicator').hidden = true;
  } catch (error) {
    handleCameraError(error);
  }
}

async function openVideoCamera() {
  currentPhotoIndex = null;
  captureMode = 'video';
  discardRecording = false;
  clearMessage();

  try {
    selfieMirrorCorrection = false;
    await openCamera({ audio: true, facingMode: 'environment' });
    applySelfieOrientation();
    $('toggle-selfie-mirror').hidden = true;
    $('camera-title').textContent = request?.requestType === 'NEW_INSPECTION'
      ? `${labels.length + 1}. Vídeo da vistoria`
      : 'Vídeo para atualização de boleto';
    $('camera-instruction').textContent = inspectionProfile.videoInstruction;
    $('capture-photo').hidden = true;
    $('start-recording').hidden = false;
    $('stop-recording').hidden = true;
    $('resume-recording').hidden = true;
    $('recording-paused-banner').hidden = true;
    $('recording-indicator').hidden = true;
    configureTorchControl();
  } catch (error) {
    handleCameraError(error);
  }
}

async function openCamera({ audio, facingMode = 'environment' }) {
  activeFacingMode = facingMode;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('A câmera exige um navegador atualizado e uma conexão HTTPS. Em testes locais, use localhost.');
  }

  stopCameraStream();

  const videoConstraints = audio
    ? {
        facingMode: { ideal: facingMode },
        width: { ideal: 640, max: 640 },
        height: { ideal: 360, max: 360 },
        frameRate: { ideal: 20, max: 24 }
      }
    : {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      };

  const constraints = {
    video: videoConstraints,
    audio: audio
      ? { echoCancellation: true, noiseSuppression: true, channelCount: { ideal: 1 } }
      : false
  };

  activeStream = await navigator.mediaDevices.getUserMedia(constraints);
  const cameraPreview = $('camera-preview');
  cameraPreview.srcObject = activeStream;
  cameraPreview.muted = true;
  await cameraPreview.play();

  if (captureMode === 'video') {
    attachVideoTrackInterruptionListeners();
  }

  $('camera-modal').hidden = false;
  document.body.classList.add('camera-open');
}

function handleCameraError(error) {
  closeCameraModal();

  let message = error?.message || 'Não foi possível abrir a câmera.';

  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    message = 'O acesso à câmera foi bloqueado. Permita o uso da câmera nas configurações do navegador e tente novamente.';
  } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    message = 'Nenhuma câmera compatível foi encontrada neste aparelho.';
  } else if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    message = 'A câmera está sendo usada por outro aplicativo. Feche o outro aplicativo e tente novamente.';
  }

  msg(message);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function applySelfieOrientation() {
  const frame = $('camera-preview')?.closest('.camera-live-frame');
  const shouldCorrect = activeFacingMode === 'user' && selfieMirrorCorrection;
  frame?.classList.toggle('selfie-orientation-corrected', shouldCorrect);
  const toggle = $('toggle-selfie-mirror');
  if (toggle) {
    toggle.textContent = shouldCorrect ? 'Restaurar orientação' : 'Inverter imagem';
    toggle.setAttribute('aria-pressed', String(shouldCorrect));
  }
}

$('toggle-selfie-mirror').addEventListener('click', () => {
  selfieMirrorCorrection = !selfieMirrorCorrection;
  applySelfieOrientation();
});

$('capture-photo').addEventListener('click', capturePhoto);

async function capturePhoto() {
  if (currentPhotoIndex === null || !activeStream) {
    return;
  }

  const preview = $('camera-preview');
  const canvas = $('photo-canvas');
  const width = preview.videoWidth || 1280;
  const height = preview.videoHeight || 720;

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const correctSelfie = activeFacingMode === 'user' && selfieMirrorCorrection;
  if (correctSelfie) {
    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(preview, 0, 0, width, height);
    context.restore();
  } else {
    context.drawImage(preview, 0, 0, width, height);
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('Não foi possível processar a foto.')),
      'image/jpeg',
      0.9
    );
  });

  const index = currentPhotoIndex;
  const fileName = `${String(index + 1).padStart(2, '0')}-${slugify(labels[index])}.jpg`;
  photoFiles[index] = new File([blob], fileName, {
    type: 'image/jpeg',
    lastModified: Date.now()
  });

  if (photoPreviewUrls[index]) {
    URL.revokeObjectURL(photoPreviewUrls[index]);
  }
  photoPreviewUrls[index] = URL.createObjectURL(blob);

  const image = $(`photo-preview-${index}`);
  image.src = photoPreviewUrls[index];
  image.hidden = false;
  $(`photo-status-${index}`).textContent = 'Foto registrada pela câmera.';

  const button = document.querySelector(`[data-photo-index="${index}"]`);
  button.textContent = 'Refazer foto';
  button.classList.add('captured');

  closeCameraModal();
  updateCaptureSummary();
  scheduleDraftSave(0, `Foto ${index + 1} salva neste aparelho.`);
}

$('record-video').addEventListener('click', showVideoGuide);
$('start-recording').addEventListener('click', startVideoRecording);
$('stop-recording').addEventListener('click', stopVideoRecording);
$('resume-recording').addEventListener('click', resumeVideoRecording);
$('toggle-flash').addEventListener('click', toggleVideoFlash);
$('cancel-camera').addEventListener('click', cancelCameraCapture);
$('close-camera').addEventListener('click', cancelCameraCapture);

function startVideoRecording() {
  if (!activeStream) {
    return;
  }

  if (typeof MediaRecorder === 'undefined') {
    handleCameraError(new Error('Este navegador não oferece gravação de vídeo pela câmera. Use Chrome, Edge ou Safari atualizado.'));
    return;
  }

  const mimeType = selectRecordingMimeType();
  const options = {
    // 90 s a ~512 kbps totais gera cerca de 5,5 MB e deixa margem para navegadores
    // que variam o bitrate e para o overhead do contêiner. A resolução também é limitada
    // na captura para manter o arquivo final abaixo de 10 MB em aparelhos diferentes.
    videoBitsPerSecond: VIDEO_TARGET_VIDEO_BITRATE,
    audioBitsPerSecond: VIDEO_TARGET_AUDIO_BITRATE
  };

  if (mimeType) {
    options.mimeType = mimeType;
  }

  try {
    recordedChunks = [];
    recordedVideoBytes = 0;
    videoDurationSeconds = null;
    discardRecording = false;
    recordingStopRequested = false;
    recordingInterrupted = false;
    recordingMustRestart = false;
    recordingInterruptionReason = '';
    resetRecordingClock();
    mediaRecorder = new MediaRecorder(activeStream, options);

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
        recordedVideoBytes += event.data.size;
      }
    });

    mediaRecorder.addEventListener('pause', () => {
      pauseRecordingClock();
      if (!discardRecording && !recordingStopRequested) {
        showRecordingInterrupted('A gravação foi pausada pelo aparelho. Toque em “Retomar gravação” para continuar.');
      }
    });

    mediaRecorder.addEventListener('resume', () => {
      resumeRecordingClock();
      clearRecordingInterruptedUi();
      startRecordingTimerLoop();
      void requestRecordingWakeLock();
    });

    const recorderInstance = mediaRecorder;
    mediaRecorder.addEventListener('stop', () => handleVideoRecorderStopped(recorderInstance), { once: true });
    mediaRecorder.start(1000);

    resumeRecordingClock();
    $('start-recording').hidden = true;
    $('resume-recording').hidden = true;
    $('stop-recording').hidden = false;
    $('stop-recording').disabled = true;
    $('stop-recording').textContent = 'Aguarde 01:30';
    $('cancel-camera').textContent = 'Cancelar gravação';
    $('recording-paused-banner').hidden = true;
    $('recording-indicator').hidden = false;
    updateRecordingTimer();
    startRecordingTimerLoop();
    void requestRecordingWakeLock();
  } catch (error) {
    handleCameraError(error);
  }
}

function stopVideoRecording() {
  if (mediaRecorder?.state !== 'recording') {
    return;
  }

  const elapsedSeconds = getRecordedDurationSeconds();

  if (elapsedSeconds < VIDEO_MIN_DURATION_SECONDS) {
    const remaining = Math.max(1, Math.ceil(VIDEO_MIN_DURATION_SECONDS - elapsedSeconds));
    msg(`O vídeo precisa ter pelo menos 1 minuto e 30 segundos. Aguarde mais ${remaining} segundo${remaining === 1 ? '' : 's'}.`);
    return;
  }

  recordingStopRequested = true;
  mediaRecorder.stop();
}

function cancelCameraCapture() {
  if (mediaRecorder && (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused')) {
    discardRecording = true;
    recordingStopRequested = true;
    mediaRecorder.stop();
    return;
  }

  closeCameraModal();
}

function handleVideoRecorderStopped(stoppedRecorder) {
  if (stoppedRecorder !== mediaRecorder) {
    return;
  }

  pauseRecordingClock();
  stopRecordingTimerLoop();
  void releaseRecordingWakeLock();

  if (discardRecording || recordingStopRequested) {
    finishVideoRecording();
    return;
  }

  // Alguns aparelhos encerram a câmera ao bloquear a tela. Nesse caso não é seguro
  // concatenar dois contêineres MP4/WebM no navegador. Mantemos a tela de retomada,
  // mas reiniciamos a gravação do zero se o MediaRecorder tiver sido encerrado.
  recordingInterrupted = true;
  recordingMustRestart = true;
  mediaRecorder = null;
  showRecordingInterrupted('O aparelho encerrou a câmera enquanto a tela estava inativa. Toque em “Retomar gravação”; para garantir um vídeo íntegro, a gravação será reiniciada do início.');
}

function finishVideoRecording() {
  const measuredDurationSeconds = getRecordedDurationSeconds();
  stopRecordingTimerLoop();
  void releaseRecordingWakeLock();

  if (discardRecording) {
    recordedChunks = [];
    recordedVideoBytes = 0;
    videoDurationSeconds = null;
    mediaRecorder = null;
    resetRecordingClock();
    closeCameraModal();
    return;
  }

  if (measuredDurationSeconds < VIDEO_MIN_DURATION_SECONDS) {
    mediaRecorder = null;
    recordedChunks = [];
    recordedVideoBytes = 0;
    videoDurationSeconds = null;
    resetRecordingClock();
    handleCameraError(new Error('O vídeo precisa ter pelo menos 1 minuto e 30 segundos de gravação efetiva. Períodos em que a câmera ficou pausada não contam.'));
    return;
  }

  const recorderType = (mediaRecorder?.mimeType || '').split(';')[0];
  const selectedType = selectRecordingMimeType().split(';')[0];
  const mimeType = recorderType || selectedType || 'video/webm';

  if (!allowedVideoTypes.has(mimeType)) {
    mediaRecorder = null;
    recordedChunks = [];
    recordedVideoBytes = 0;
    videoDurationSeconds = null;
    resetRecordingClock();
    handleCameraError(new Error(`O formato de vídeo gerado (${mimeType}) não é compatível. Use Chrome, Edge ou Safari atualizado.`));
    return;
  }

  const blob = new Blob(recordedChunks, { type: mimeType });
  if (blob.size > VIDEO_MAX_BYTES) {
    mediaRecorder = null;
    recordedChunks = [];
    recordedVideoBytes = 0;
    videoDurationSeconds = null;
    resetRecordingClock();
    handleCameraError(new Error(`Este aparelho gerou um vídeo de ${formatBytes(blob.size)}, acima do limite de 10 MB. Grave novamente; o sistema usará a configuração compactada obrigatória de 1min30s.`));
    return;
  }

  const extension = videoExtension(mimeType);
  const plate = slugify(request?.plate || 'veiculo');

  videoDurationSeconds = measuredDurationSeconds;
  videoFile = new File([blob], `video-vistoria-${plate}.${extension}`, {
    type: mimeType,
    lastModified: Date.now()
  });

  if (videoPreviewUrl) {
    URL.revokeObjectURL(videoPreviewUrl);
  }
  videoPreviewUrl = URL.createObjectURL(blob);

  $('video-preview').src = videoPreviewUrl;
  $('video-preview').hidden = false;
  $('video-status').textContent = `Vídeo gravado com duração válida (${Math.floor(measuredDurationSeconds)}s · ${formatBytes(blob.size)} de 10 MB).`;
  $('record-video').textContent = 'Gravar novamente';
  $('record-video').classList.add('captured');

  mediaRecorder = null;
  recordedChunks = [];
  recordedVideoBytes = 0;
  resetRecordingClock();
  closeCameraModal();
  updateCaptureSummary();
  scheduleDraftSave(0, 'Vídeo com duração mínima confirmada salvo neste aparelho para uma nova tentativa de envio.');
}

function getRecordedDurationMilliseconds() {
  const activeSegment = recordingActiveSince ? Math.max(0, Date.now() - recordingActiveSince) : 0;
  return Math.max(0, recordingElapsedMs + activeSegment);
}

function getRecordedDurationSeconds() {
  return getRecordedDurationMilliseconds() / 1000;
}

function resumeRecordingClock() {
  if (!recordingActiveSince) {
    recordingActiveSince = Date.now();
  }
}

function pauseRecordingClock() {
  if (recordingActiveSince) {
    recordingElapsedMs += Math.max(0, Date.now() - recordingActiveSince);
    recordingActiveSince = null;
  }
}

function resetRecordingClock() {
  stopRecordingTimerLoop();
  recordingElapsedMs = 0;
  recordingActiveSince = null;
}

function startRecordingTimerLoop() {
  stopRecordingTimerLoop();
  recordingTimer = window.setInterval(updateRecordingTimer, 250);
}

function stopRecordingTimerLoop() {
  if (recordingTimer) {
    window.clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

function showRecordingInterrupted(message) {
  recordingInterrupted = true;
  recordingInterruptionReason = message || 'A gravação foi pausada.';
  stopRecordingTimerLoop();
  $('recording-indicator').hidden = true;
  $('stop-recording').hidden = true;
  $('resume-recording').hidden = false;
  $('recording-paused-banner').hidden = false;
  $('recording-paused-text').textContent = recordingInterruptionReason;
  void releaseRecordingWakeLock();
}

function clearRecordingInterruptedUi() {
  recordingInterrupted = false;
  recordingMustRestart = false;
  recordingInterruptionReason = '';
  $('resume-recording').hidden = true;
  $('recording-paused-banner').hidden = true;
  $('recording-indicator').hidden = false;
  $('stop-recording').hidden = false;
}

function pauseVideoRecordingForInterruption(reason) {
  if (captureMode !== 'video' || discardRecording || recordingStopRequested || !mediaRecorder) {
    return;
  }

  if (mediaRecorder.state === 'recording') {
    pauseRecordingClock();
    try {
      mediaRecorder.requestData?.();
      mediaRecorder.pause();
    } catch (_error) {
      showRecordingInterrupted(reason);
    }
  } else if (mediaRecorder.state === 'paused') {
    showRecordingInterrupted(reason);
  }
}

async function resumeVideoRecording() {
  if (!recordingInterrupted) return;
  if (document.visibilityState === 'hidden') return;

  clearMessage();

  try {
    const currentVideoTrack = activeStream?.getVideoTracks?.()[0];
    const cameraEnded = !currentVideoTrack || currentVideoTrack.readyState === 'ended';

    if (recordingMustRestart || !mediaRecorder || mediaRecorder.state === 'inactive' || cameraEnded) {
      const previousRecorder = mediaRecorder;

      if (previousRecorder && previousRecorder.state !== 'inactive') {
        discardRecording = true;
        recordingStopRequested = true;
        await new Promise((resolve) => {
          previousRecorder.addEventListener('stop', resolve, { once: true });
          try {
            previousRecorder.stop();
          } catch (_error) {
            resolve();
          }
        });
      } else {
        mediaRecorder = null;
        closeCameraModal();
      }

      recordedChunks = [];
      recordedVideoBytes = 0;
      videoDurationSeconds = null;
      resetRecordingClock();
      recordingStopRequested = false;
      discardRecording = false;
      recordingMustRestart = false;

      await openVideoCamera();
      msg('A câmera foi encerrada pelo aparelho. A gravação foi reiniciada do início para garantir o vídeo completo de 1min30s.', 'success');
      startVideoRecording();
      return;
    }

    const preview = $('camera-preview');
    if (preview?.paused) {
      await preview.play();
    }

    if (currentVideoTrack.muted) {
      showRecordingInterrupted('A câmera ainda está pausada pelo aparelho. Aguarde alguns segundos e toque novamente em “Retomar gravação”.');
      return;
    }

    if (mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
    } else if (mediaRecorder.state === 'recording') {
      resumeRecordingClock();
      clearRecordingInterruptedUi();
      updateRecordingTimer();
      startRecordingTimerLoop();
      void requestRecordingWakeLock();
    }
  } catch (error) {
    showRecordingInterrupted('Não foi possível retomar automaticamente. Toque novamente em “Retomar gravação”.');
    msg(error?.message || 'Não foi possível retomar a câmera.');
  }
}

function attachVideoTrackInterruptionListeners() {
  const track = activeStream?.getVideoTracks?.()[0];
  if (!track) return;

  track.addEventListener('mute', () => {
    if (captureMode === 'video' && mediaRecorder && !discardRecording) {
      pauseVideoRecordingForInterruption('A câmera foi pausada pelo aparelho. Desbloqueie a tela e toque em “Retomar gravação”.');
    }
  });

  track.addEventListener('ended', () => {
    if (captureMode === 'video' && mediaRecorder && !discardRecording && !recordingStopRequested) {
      pauseRecordingClock();
      recordingMustRestart = true;
      showRecordingInterrupted('A câmera foi encerrada pelo aparelho. Toque em “Retomar gravação” para reabrir a câmera.');
    }
  });
}

function configureTorchControl() {
  const button = $('toggle-flash');
  const track = activeStream?.getVideoTracks?.()[0];
  torchEnabled = false;
  torchSupported = false;

  if (!button || captureMode !== 'video' || !track) {
    if (button) button.hidden = true;
    return;
  }

  try {
    const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : null;
    torchSupported = Boolean(capabilities?.torch);
  } catch (_error) {
    torchSupported = false;
  }

  button.hidden = !torchSupported;
  button.disabled = false;
  button.textContent = 'Ligar flash';
  button.setAttribute('aria-pressed', 'false');
  button.title = torchSupported
    ? 'Liga ou desliga a lanterna da câmera traseira durante o vídeo.'
    : 'O flash não está disponível neste aparelho ou navegador.';
}

async function toggleVideoFlash() {
  if (!torchSupported) return;
  const track = activeStream?.getVideoTracks?.()[0];
  if (!track || track.readyState !== 'live') return;

  const button = $('toggle-flash');
  const nextState = !torchEnabled;
  button.disabled = true;

  try {
    await track.applyConstraints({ advanced: [{ torch: nextState }] });
    torchEnabled = nextState;
    button.textContent = torchEnabled ? 'Desligar flash' : 'Ligar flash';
    button.setAttribute('aria-pressed', String(torchEnabled));
  } catch (_error) {
    torchSupported = false;
    torchEnabled = false;
    button.hidden = true;
    msg('O flash não pôde ser ativado neste aparelho. A gravação pode continuar normalmente.', 'success');
  } finally {
    button.disabled = false;
  }
}

async function requestRecordingWakeLock() {
  if (!('wakeLock' in navigator) || document.visibilityState === 'hidden' || !mediaRecorder || mediaRecorder.state !== 'recording') {
    return;
  }

  try {
    if (recordingWakeLock) return;
    recordingWakeLock = await navigator.wakeLock.request('screen');
    recordingWakeLock.addEventListener('release', () => {
      recordingWakeLock = null;
    }, { once: true });
  } catch (_error) {
    recordingWakeLock = null;
  }
}

async function releaseRecordingWakeLock() {
  const wakeLock = recordingWakeLock;
  recordingWakeLock = null;
  if (!wakeLock) return;
  try {
    await wakeLock.release();
  } catch (_error) {
    // O navegador pode liberar o wake lock automaticamente ao ocultar a página.
  }
}

function selectRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function updateRecordingTimer() {
  const elapsed = getRecordedDurationSeconds();
  const elapsedSeconds = Math.min(VIDEO_AUTO_STOP_SECONDS, Math.floor(elapsed));
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const seconds = String(elapsedSeconds % 60).padStart(2, '0');
  $('recording-time').textContent = `${minutes}:${seconds}`;

  const stopButton = $('stop-recording');
  const remaining = Math.max(0, Math.ceil(VIDEO_MIN_DURATION_SECONDS - elapsed));
  stopButton.disabled = elapsed < VIDEO_MIN_DURATION_SECONDS;
  stopButton.textContent = remaining > 0
    ? `Aguarde ${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
    : 'Finalizando vídeo...';

  if (elapsed >= VIDEO_AUTO_STOP_SECONDS && mediaRecorder?.state === 'recording') {
    recordingStopRequested = true;
    mediaRecorder.stop();
  }
}

function closeCameraModal() {
  resetRecordingClock();
  void releaseRecordingWakeLock();
  stopCameraStream();
  $('camera-modal').hidden = true;
  $('capture-photo').hidden = true;
  $('start-recording').hidden = true;
  $('resume-recording').hidden = true;
  $('toggle-flash').hidden = true;
  $('stop-recording').hidden = true;
  $('stop-recording').disabled = false;
  $('stop-recording').textContent = 'Parar e usar vídeo';
  $('recording-paused-banner').hidden = true;
  $('recording-indicator').hidden = true;
  $('cancel-camera').textContent = 'Cancelar';
  $('camera-preview').srcObject = null;
  torchEnabled = false;
  torchSupported = false;
  recordingInterrupted = false;
  recordingMustRestart = false;
  recordingStopRequested = false;
  document.body.classList.remove('camera-open');
  captureMode = null;
  currentPhotoIndex = null;
}

function stopCameraStream() {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }
}

function updateCaptureSummary() {
  const fullInspection = request?.requestType === 'NEW_INSPECTION';
  const orders = requiredAssetOrders();
  const requiredPhotos = fullInspection ? labels.length : 0;
  const confirmedPhotos = fullInspection
    ? labels.reduce((total, _label, index) => total + (serverHasAsset('PHOTO', index + 1) || photoFiles[index] ? 1 : 0), 0)
    : 0;
  const videoReady = serverHasAsset('VIDEO', orders.video) || Boolean(videoFile);
  const videoStatus = videoReady ? 'vídeo confirmado' : 'vídeo pendente';
  const registrationStatus = requiredPhotos
    ? ` · endereço ${(request?.residenceAddress || $('residence-address').value.trim()) ? 'confirmado' : 'pendente'}`
      + ` · CRLV ${(serverHasAsset('VEHICLE_DOCUMENT', orders.vehicleDocument) || vehicleDocumentFile) ? 'confirmado' : 'pendente'}`
      + ` · RG/CNH frente ${(serverHasAsset('IDENTITY_DOCUMENT', orders.identityFront) || identityDocumentFrontFile) ? 'confirmada' : 'pendente'}`
      + ` · RG/CNH verso ${(serverHasAsset('IDENTITY_DOCUMENT', orders.identityBack) || identityDocumentBackFile) ? 'confirmado' : 'pendente'}`
      + ` · assinatura ${(serverHasAsset('SIGNATURE', orders.signature) || signatureHasInk) ? 'confirmada' : 'pendente'}`
    : '';
  $('capture-summary').textContent = requiredPhotos
    ? `${confirmedPhotos} de ${requiredPhotos} fotos confirmadas · ${videoStatus}${registrationStatus}`
    : videoStatus;
}

function serverHasAsset(assetType, sortOrder) {
  return Array.isArray(request?.assets) && request.assets.some((asset) =>
    asset?.type === assetType && asset?.available === true && Number(asset?.sortOrder) === Number(sortOrder)
  );
}

function requiredAssetOrders() {
  const fullInspection = request?.requestType === 'NEW_INSPECTION';
  const photoCount = labels.length;
  return {
    video: fullInspection ? photoCount + 1 : 1,
    signature: photoCount + 2,
    vehicleDocument: photoCount + 3,
    identityFront: photoCount + 4,
    identityBack: photoCount + 5
  };
}

function pendingRequiredSlots() {
  if (!request) return [];
  const fullInspection = request.requestType === 'NEW_INSPECTION';
  const orders = requiredAssetOrders();
  const pending = [];

  if (fullInspection) {
    labels.forEach((label, index) => {
      if (!serverHasAsset('PHOTO', index + 1)) pending.push({ type: 'PHOTO', order: index + 1, label });
    });
  }
  if (!serverHasAsset('VIDEO', orders.video)) pending.push({ type: 'VIDEO', order: orders.video, label: 'Vídeo da vistoria' });

  if (fullInspection) {
    if (!request.residenceAddress) pending.push({ type: 'ADDRESS', order: 0, label: 'Endereço de residência' });
    if (!serverHasAsset('SIGNATURE', orders.signature)) pending.push({ type: 'SIGNATURE', order: orders.signature, label: 'Assinatura do associado' });
    if (!serverHasAsset('VEHICLE_DOCUMENT', orders.vehicleDocument)) pending.push({ type: 'VEHICLE_DOCUMENT', order: orders.vehicleDocument, label: 'CRLV do veículo' });
    if (!serverHasAsset('IDENTITY_DOCUMENT', orders.identityFront)) pending.push({ type: 'IDENTITY_DOCUMENT', order: orders.identityFront, label: 'RG ou CNH — frente' });
    if (!serverHasAsset('IDENTITY_DOCUMENT', orders.identityBack)) pending.push({ type: 'IDENTITY_DOCUMENT', order: orders.identityBack, label: 'RG ou CNH — verso' });
  }
  return pending;
}

function isSelectiveResubmission() {
  if (!request || !Array.isArray(request.assets)) return false;
  const hasPreservedSourceAsset = request.assets.some(asset => asset?.available === true && asset?.type !== 'REPORT');
  return hasPreservedSourceAsset && pendingRequiredSlots().length > 0;
}

function discardLocalCopiesAlreadyOnServer() {
  if (!request) return;
  const orders = requiredAssetOrders();
  photoFiles = photoFiles.map((file, index) => serverHasAsset('PHOTO', index + 1) ? null : file);
  if (serverHasAsset('VIDEO', orders.video)) videoFile = null;
  if (serverHasAsset('VEHICLE_DOCUMENT', orders.vehicleDocument)) vehicleDocumentFile = null;
  if (serverHasAsset('IDENTITY_DOCUMENT', orders.identityFront)) identityDocumentFrontFile = null;
  if (serverHasAsset('IDENTITY_DOCUMENT', orders.identityBack)) identityDocumentBackFile = null;
  if (serverHasAsset('SIGNATURE', orders.signature)) {
    restoredSignatureBlob = null;
    signatureHasInk = false;
  }
  if (request.residenceAddress) $('residence-address').value = request.residenceAddress;
}

function stableUploadId(file, assetType, sortOrder) {
  const modified = Number(file?.lastModified || 0);
  return `${assetType.toLowerCase()}-${sortOrder}-${Number(file?.size || 0)}-${modified}`
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 140);
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function showUploadProgress(label, sentBytes, totalBytes) {
  const panel = $('upload-progress');
  const progress = $('upload-progress-bar');
  const text = $('upload-progress-text');
  panel.hidden = false;
  const safeTotal = Math.max(1, totalBytes);
  const percentage = Math.min(100, Math.round((sentBytes / safeTotal) * 100));
  progress.max = 100;
  progress.value = percentage;
  text.textContent = `${label} · ${percentage}% (${formatBytes(sentBytes)} de ${formatBytes(totalBytes)})`;
}

function hideUploadProgress() {
  $('upload-progress').hidden = true;
  $('upload-progress-bar').value = 0;
  $('upload-progress-text').textContent = '';
}

async function parseApiResponse(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.message || `Falha no envio (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function uploadChunkWithRetry(asset, uploadId, chunkIndex, totalChunks, chunk) {
  let lastError = null;

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    const form = new FormData();
    form.append('assetType', asset.assetType);
    form.append('sortOrder', String(asset.sortOrder));
    form.append('label', asset.label);
    form.append('uploadId', uploadId);
    form.append('chunkIndex', String(chunkIndex));
    form.append('totalChunks', String(totalChunks));
    form.append('totalSize', String(asset.file.size));
    form.append('contentType', asset.file.type || 'application/octet-stream');
    if (asset.assetType === 'VIDEO' && Number.isFinite(asset.durationSeconds)) {
      form.append('videoDurationSeconds', String(asset.durationSeconds));
    }
    form.append('chunk', chunk, `parte-${chunkIndex + 1}.bin`);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5 * 60 * 1000);
    try {
      const response = await fetch(
        window.NH_API?.backend(`/api/public/inspections/${encodeURIComponent(token)}/upload-chunk`)
          || `/api/public/inspections/${encodeURIComponent(token)}/upload-chunk`,
        { method: 'POST', body: form, signal: controller.signal }
      );
      return await parseApiResponse(response);
    } catch (error) {
      lastError = error;
      const retryable = !error?.status || error.status >= 500 || error.name === 'AbortError';
      if (!retryable || attempt === UPLOAD_MAX_ATTEMPTS) break;
      const delay = UPLOAD_RETRY_BASE_MS * attempt;
      updateDraftPanel(
        `A conexão oscilou. Tentando novamente a parte ${chunkIndex + 1} de ${totalChunks} em instantes...`,
        'warning'
      );
      await wait(delay);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Não foi possível enviar uma parte do arquivo.');
}

async function fetchChunkStatus(asset, uploadId, totalChunks) {
  const params = new URLSearchParams({
    assetType: asset.assetType,
    sortOrder: String(asset.sortOrder),
    uploadId,
    totalChunks: String(totalChunks)
  });
  try {
    const response = await fetch(
      window.NH_API?.backend(`/api/public/inspections/${encodeURIComponent(token)}/upload-chunk-status?${params}`)
        || `/api/public/inspections/${encodeURIComponent(token)}/upload-chunk-status?${params}`,
      { cache: 'no-store' }
    );
    if (!response.ok) return { complete: false, receivedChunks: [] };
    const body = await response.json();
    if (body?.inspection) request = body.inspection;
    return body || { complete: false, receivedChunks: [] };
  } catch (_) {
    return { complete: false, receivedChunks: [] };
  }
}

async function uploadAssetInChunks(asset, progressState) {
  if (serverHasAsset(asset.assetType, asset.sortOrder)) {
    progressState.sentBytes += asset.file.size;
    showUploadProgress(`${asset.label} já estava salvo`, progressState.sentBytes, progressState.totalBytes);
    return;
  }

  const totalChunks = Math.max(1, Math.ceil(asset.file.size / UPLOAD_CHUNK_BYTES));
  const uploadId = stableUploadId(asset.file, asset.assetType, asset.sortOrder);
  const status = await fetchChunkStatus(asset, uploadId, totalChunks);
  if (status.complete || serverHasAsset(asset.assetType, asset.sortOrder)) {
    progressState.sentBytes += asset.file.size;
    showUploadProgress(`${asset.label} já estava salvo`, progressState.sentBytes, progressState.totalBytes);
    return;
  }
  const receivedChunks = new Set(Array.isArray(status.receivedChunks) ? status.receivedChunks.map(Number) : []);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * UPLOAD_CHUNK_BYTES;
    const end = Math.min(asset.file.size, start + UPLOAD_CHUNK_BYTES);
    const chunk = asset.file.slice(start, end, 'application/octet-stream');

    if (receivedChunks.has(chunkIndex)) {
      progressState.sentBytes += chunk.size;
      showUploadProgress(
        `${asset.label}: parte ${chunkIndex + 1} já recebida`,
        progressState.sentBytes,
        progressState.totalBytes
      );
      continue;
    }

    showUploadProgress(
      `${asset.label}: enviando parte ${chunkIndex + 1} de ${totalChunks}`,
      progressState.sentBytes,
      progressState.totalBytes
    );

    const body = await uploadChunkWithRetry(asset, uploadId, chunkIndex, totalChunks, chunk);
    if (body?.inspection) request = body.inspection;
    if (chunkIndex === totalChunks - 1 && body?.complete !== true) {
      throw new Error(`${asset.label} ainda não foi confirmado no banco de dados.`);
    }
    progressState.sentBytes += chunk.size;
    showUploadProgress(asset.label, progressState.sentBytes, progressState.totalBytes);
  }

  const confirmedStatus = await fetchChunkStatus(asset, uploadId, totalChunks);
  if (confirmedStatus?.inspection) request = confirmedStatus.inspection;

  if (confirmedStatus?.complete !== true || !serverHasAsset(asset.assetType, asset.sortOrder)) {
    throw new Error(`${asset.label} chegou ao servidor, mas não foi gravado no banco de dados. Tente novamente.`);
  }
}

async function finalizeResumableUpload(residenceAddress) {
  let lastError = null;
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5 * 60 * 1000);
    try {
      const response = await fetch(
        window.NH_API?.backend(`/api/public/inspections/${encodeURIComponent(token)}/finalize-upload`)
          || `/api/public/inspections/${encodeURIComponent(token)}/finalize-upload`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ residenceAddress }),
          signal: controller.signal
        }
      );
      return await parseApiResponse(response);
    } catch (error) {
      lastError = error;
      const completedDespiteFailure = await checkIfServerCompleted();
      if (completedDespiteFailure) return null;
      const retryable = !error?.status || error.status >= 500 || error.name === 'AbortError';
      if (!retryable || attempt === UPLOAD_MAX_ATTEMPTS) break;
      await wait(UPLOAD_RETRY_BASE_MS * attempt);
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw lastError || new Error('Não foi possível finalizar a vistoria.');
}

async function readVideoDurationSeconds(file) {
  if (!file) return 0;
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const timeout = window.setTimeout(() => reject(new Error('Não foi possível confirmar a duração do vídeo.')), 15000);
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        const value = Number(video.duration);
        if (Number.isFinite(value) && value > 0) resolve(value);
        else reject(new Error('Não foi possível confirmar a duração do vídeo.'));
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Não foi possível ler o vídeo gravado.'));
      };
      video.src = url;
    });
    return duration;
  } finally {
    URL.revokeObjectURL(url);
  }
}

$('upload-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage();

  const fullInspection = request.requestType === 'NEW_INSPECTION';
  const orders = requiredAssetOrders();
  const missingPhotoIndex = fullInspection
    ? photoFiles.findIndex((file, index) => !serverHasAsset('PHOTO', index + 1) && !file)
    : -1;

  if (missingPhotoIndex >= 0) {
    msg(`Registre a foto obrigatória: ${labels[missingPhotoIndex]}.`);
    document.querySelector(`[data-photo-index="${missingPhotoIndex}"]`)?.focus();
    return;
  }

  if (!serverHasAsset('VIDEO', orders.video) && !videoFile) {
    msg('Grave o vídeo da vistoria antes de enviar.');
    $('record-video').focus();
    return;
  }

  if (!serverHasAsset('VIDEO', orders.video) && videoFile?.size > VIDEO_MAX_BYTES) {
    msg(`O vídeo deve possuir no máximo 10 MB. O arquivo atual tem ${formatBytes(videoFile.size)}.`);
    $('record-video').focus();
    return;
  }

  if (!serverHasAsset('VIDEO', orders.video) && videoFile) {
    try {
      videoDurationSeconds = await readVideoDurationSeconds(videoFile);
    } catch (error) {
      msg(error?.message || 'Não foi possível confirmar a duração do vídeo. Grave novamente.');
      $('record-video').focus();
      return;
    }
    if (videoDurationSeconds < VIDEO_MIN_DURATION_SECONDS) {
      msg(`O vídeo precisa ter pelo menos 1 minuto e 30 segundos. O vídeo atual possui ${Math.floor(videoDurationSeconds)} segundos.`);
      $('record-video').focus();
      return;
    }
  }

  const residenceAddress = $('residence-address').value.trim() || request.residenceAddress || '';
  if (fullInspection && !residenceAddress) {
    msg('Informe o endereço completo de residência do associado.');
    $('residence-address').focus();
    return;
  }

  if (fullInspection && !serverHasAsset('VEHICLE_DOCUMENT', orders.vehicleDocument) && !vehicleDocumentFile) {
    msg('Envie o CRLV do veículo antes de concluir.');
    $('vehicle-document').focus();
    return;
  }

  if (fullInspection && !serverHasAsset('IDENTITY_DOCUMENT', orders.identityFront) && !identityDocumentFrontFile) {
    msg('Envie a frente do RG ou da CNH do associado antes de concluir.');
    $('identity-document-front').focus();
    return;
  }

  if (fullInspection && !serverHasAsset('IDENTITY_DOCUMENT', orders.identityBack) && !identityDocumentBackFile) {
    msg('Envie o verso do RG ou da CNH do associado antes de concluir.');
    $('identity-document-back').focus();
    return;
  }

  if (fullInspection && !serverHasAsset('SIGNATURE', orders.signature) && !signatureHasInk) {
    msg('Solicite que o associado assine com o dedo antes de concluir.');
    $('signature-pad').focus();
    return;
  }

  const button = event.submitter || $('submit-inspection');
  button.disabled = true;
  button.textContent = 'Salvando rascunho...';
  await saveDraftNow('Tudo salvo neste aparelho. Iniciando o envio por partes...');

  try {
    const assets = [];
    if (fullInspection) {
      photoFiles.forEach((file, index) => {
        if (!serverHasAsset('PHOTO', index + 1) && file) {
          assets.push({ assetType: 'PHOTO', sortOrder: index + 1, label: labels[index], file });
        }
      });
    }

    if (!serverHasAsset('VIDEO', orders.video) && videoFile) {
      assets.push({
        assetType: 'VIDEO',
        sortOrder: orders.video,
        label: 'Vídeo da vistoria',
        file: videoFile,
        durationSeconds: videoDurationSeconds
      });
    }

    if (fullInspection) {
      if (!serverHasAsset('SIGNATURE', orders.signature)) {
        const signatureBlob = await exportSignatureBlob();
        assets.push({
          assetType: 'SIGNATURE',
          sortOrder: orders.signature,
          label: 'Assinatura do associado',
          file: new File([signatureBlob], 'assinatura-associado.png', {
            type: 'image/png',
            lastModified: Date.now()
          })
        });
      }
      if (!serverHasAsset('VEHICLE_DOCUMENT', orders.vehicleDocument) && vehicleDocumentFile) {
        assets.push({ assetType: 'VEHICLE_DOCUMENT', sortOrder: orders.vehicleDocument, label: 'CRLV do veículo', file: vehicleDocumentFile });
      }
      if (!serverHasAsset('IDENTITY_DOCUMENT', orders.identityFront) && identityDocumentFrontFile) {
        assets.push({ assetType: 'IDENTITY_DOCUMENT', sortOrder: orders.identityFront, label: 'RG ou CNH — frente', file: identityDocumentFrontFile });
      }
      if (!serverHasAsset('IDENTITY_DOCUMENT', orders.identityBack) && identityDocumentBackFile) {
        assets.push({ assetType: 'IDENTITY_DOCUMENT', sortOrder: orders.identityBack, label: 'RG ou CNH — verso', file: identityDocumentBackFile });
      }
    }

    const progressState = {
      totalBytes: assets.reduce((total, asset) => total + asset.file.size, 0),
      sentBytes: 0
    };

    button.textContent = 'Enviando arquivos...';
    showUploadProgress('Preparando envio seguro', 0, progressState.totalBytes);

    for (const asset of assets) {
      await uploadAssetInChunks(asset, progressState);
    }

    button.textContent = 'Finalizando vistoria...';
    showUploadProgress('Gerando relatório e confirmando os arquivos no banco de dados', progressState.totalBytes, progressState.totalBytes);
    const body = await finalizeResumableUpload(residenceAddress);
    const completed = body?.inspection;
    if (!databaseCompletionConfirmed(completed)) {
      throw new Error('O servidor ainda não confirmou todos os arquivos no banco de dados. Tente continuar o envio.');
    }
    showComplete(completed);
  } catch (error) {
    const completedDespiteFailure = await checkIfServerCompleted();
    if (completedDespiteFailure) return;

    await saveDraftNow('O envio foi interrompido. Os arquivos locais e as partes já confirmadas permanecem salvos.');
    msg(friendlyNetworkMessage(
      error,
      'A conexão interrompeu o envio. As partes já enviadas ficaram salvas no servidor e o restante continua neste aparelho. Toque em “Continuar envio”.'
    ));
    button.disabled = false;
    button.textContent = 'Continuar envio';
    updateDraftPanel('As fotos já confirmadas não serão enviadas novamente. O sistema continuará do ponto em que parou.', 'warning');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

function showComplete(data) {
  request = data;
  hideUploadProgress();
  void removeDraft();
  $('connection-actions').hidden = true;
  hideGuidePage();
  closeCameraModal();
  $('guideline-card').hidden = true;
  $('upload-card').hidden = true;
  $('complete').hidden = false;

  if (data.reportUrl) {
    $('report-link').href = data.reportUrl;
    $('report-link').hidden = false;
  } else {
    $('report-link').hidden = true;
  }

  $('whatsapp-notice').textContent = 'Todos os arquivos, documentos e o relatório foram armazenados com segurança e estão disponíveis para a equipe de análise por 40 dias.';

  $('title').textContent = 'Vistoria concluída';
  $('subtitle').textContent = `${data.associateName} · ${vehiclePlateLabel(data.plate)}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


const DOCUMENT_MAX_BYTES = 30 * 1024 * 1024;
const FILE_MIME_BY_EXTENSION = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text', rtf: 'application/rtf', txt: 'text/plain'
};
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/rtf',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

function normalizedDocumentType(file) {
  const type = String(file?.type || '').toLowerCase().split(';', 1)[0].trim();
  return type === 'image/jpg' ? 'image/jpeg' : type;
}

function validateDocumentFile(file, label) {
  if (!file) return null;
  const currentType = normalizedDocumentType(file);
  const inferredType = FILE_MIME_BY_EXTENSION[fileExtension(file)];
  const contentType = DOCUMENT_TYPES.has(currentType) ? currentType : inferredType;
  if (!contentType || !DOCUMENT_TYPES.has(contentType)) {
    throw new Error(`Envie ${label} em PDF, DOC, DOCX, ODT, RTF, TXT, JPG, PNG ou WebP.`);
  }
  if (file.size <= 0) {
    throw new Error(`${label} está vazio.`);
  }
  if (file.size > DOCUMENT_MAX_BYTES) {
    throw new Error(`${label} deve possuir no máximo 30 MB.`);
  }
  if (file.type === contentType) return file;
  return new File([file], file.name || 'documento', {
    type: contentType,
    lastModified: file.lastModified || Date.now()
  });
}

function updateDocumentStatus(inputId, file, restored = false) {
  const card = $(inputId)?.closest('.document-upload-card');
  const status = $(`${inputId}-status`);
  if (!card || !status) return;
  if (!file) {
    card.classList.remove('has-file');
    status.textContent = 'Documento pendente.';
    return;
  }
  card.classList.add('has-file');
  status.textContent = `${restored ? 'Documento recuperado' : 'Documento selecionado'}: ${file.name || 'arquivo'} (${formatBytes(file.size)}).`;
}

function handleDocumentSelection(inputId, label) {
  const input = $(inputId);
  input.addEventListener('change', () => {
    clearMessage();
    try {
      const file = validateDocumentFile(input.files?.[0] || null, label);
      if (inputId === 'vehicle-document') vehicleDocumentFile = file;
      else if (inputId === 'identity-document-front') identityDocumentFrontFile = file;
      else if (inputId === 'identity-document-back') identityDocumentBackFile = file;
      updateDocumentStatus(inputId, file);
      updateCaptureSummary();
      scheduleDraftSave(0, `${label} salvo neste aparelho.`);
    } catch (error) {
      input.value = '';
      if (inputId === 'vehicle-document') vehicleDocumentFile = null;
      else if (inputId === 'identity-document-front') identityDocumentFrontFile = null;
      else if (inputId === 'identity-document-back') identityDocumentBackFile = null;
      updateDocumentStatus(inputId, null);
      updateCaptureSummary();
      msg(error.message);
    }
  });
}

handleDocumentSelection('vehicle-document', 'o CRLV do veículo');
handleDocumentSelection('identity-document-front', 'a frente do RG ou da CNH do associado');
handleDocumentSelection('identity-document-back', 'o verso do RG ou da CNH do associado');

function fileExtension(file) {
  const match = String(file?.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

const signatureCanvas = $('signature-pad');
const signatureContext = signatureCanvas.getContext('2d');

function initializeSignaturePad() {
  signatureContext.lineCap = 'round';
  signatureContext.lineJoin = 'round';
  signatureContext.lineWidth = 4;
  signatureContext.strokeStyle = '#080f63';
}

function signaturePoint(event) {
  const rect = signatureCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (signatureCanvas.width / rect.width),
    y: (event.clientY - rect.top) * (signatureCanvas.height / rect.height)
  };
}

function beginSignature(event) {
  if ($('registration-fields').hidden || $('signature-block').hidden) return;
  event.preventDefault();
  signatureDrawing = true;
  signatureLastPoint = signaturePoint(event);
  signatureCanvas.setPointerCapture?.(event.pointerId);
}

function drawSignature(event) {
  if (!signatureDrawing || !signatureLastPoint) return;
  event.preventDefault();
  const point = signaturePoint(event);
  signatureContext.beginPath();
  signatureContext.moveTo(signatureLastPoint.x, signatureLastPoint.y);
  signatureContext.lineTo(point.x, point.y);
  signatureContext.stroke();
  signatureLastPoint = point;
  signatureHasInk = true;
  signatureCanvas.classList.add('has-signature');
  $('signature-status').textContent = 'Assinatura registrada.';
  $('signature-status').classList.add('ok');
  updateCaptureSummary();
}

function endSignature(event) {
  if (!signatureDrawing) return;
  event.preventDefault();
  signatureDrawing = false;
  signatureLastPoint = null;
  if (event?.pointerId !== undefined && signatureCanvas.hasPointerCapture?.(event.pointerId)) {
    signatureCanvas.releasePointerCapture(event.pointerId);
  }
  scheduleDraftSave(300, 'Assinatura salva neste aparelho.');
}

function clearSignature() {
  signatureContext.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  signatureHasInk = false;
  signatureDrawing = false;
  signatureLastPoint = null;
  signatureCanvas.classList.remove('has-signature');
  $('signature-status').textContent = 'Assinatura pendente.';
  $('signature-status').classList.remove('ok');
  updateCaptureSummary();
  scheduleDraftSave(300, 'Rascunho atualizado neste aparelho.');
}

async function exportSignatureBlob() {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = signatureCanvas.width;
  exportCanvas.height = signatureCanvas.height;
  const context = exportCanvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(signatureCanvas, 0, 0);

  return new Promise((resolve, reject) => {
    exportCanvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Não foi possível processar a assinatura.')),
      'image/png'
    );
  });
}

function vehiclePlateLabel(plate) {
  return plate ? `Placa: ${plate}` : 'Veículo 0 km — sem placa';
}

signatureCanvas.addEventListener('pointerdown', beginSignature);
signatureCanvas.addEventListener('pointermove', drawSignature);
signatureCanvas.addEventListener('pointerup', endSignature);
signatureCanvas.addEventListener('pointercancel', endSignature);
signatureCanvas.addEventListener('pointerleave', (event) => {
  if (event.pointerType === 'mouse') endSignature(event);
});
$('clear-signature').addEventListener('click', clearSignature);
$('residence-address').addEventListener('input', () => {
  updateCaptureSummary();
  scheduleDraftSave(700, 'Endereço salvo neste aparelho.');
});
$('retry-load').addEventListener('click', () => load());
$('discard-draft').addEventListener('click', async () => {
  if (!window.confirm('Apagar as fotos, o vídeo, os documentos, o endereço e a assinatura salvos neste aparelho?')) return;
  await removeDraft();
  location.reload();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (request && !$('upload-card').hidden) {
      scheduleDraftSave(0, 'Rascunho atualizado neste aparelho.');
    }

    if (captureMode === 'video' && mediaRecorder && !discardRecording && !recordingStopRequested) {
      pauseVideoRecordingForInterruption('A tela foi bloqueada ou o navegador ficou em segundo plano. Desbloqueie o aparelho e toque em “Retomar gravação”.');
    }
    return;
  }

  if (recordingInterrupted && captureMode === 'video') {
    showRecordingInterrupted(recordingInterruptionReason || 'A gravação foi pausada. Toque em “Retomar gravação” para continuar.');
  } else if (mediaRecorder?.state === 'recording') {
    void requestRecordingWakeLock();
  }
});

window.addEventListener('pageshow', () => {
  if (recordingInterrupted && captureMode === 'video') {
    showRecordingInterrupted(recordingInterruptionReason || 'A gravação foi pausada. Toque em “Retomar gravação” para continuar.');
  }
});
window.addEventListener('online', () => {
  if (!$('connection-actions').hidden) load();
});
initializeSignaturePad();

function videoExtension(mimeType) {
  switch (mimeType) {
    case 'video/mp4': return 'mp4';
    case 'video/quicktime': return 'mov';
    case 'video/3gpp': return '3gp';
    default: return 'webm';
  }
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'arquivo';
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

window.addEventListener('beforeunload', () => {
  void releaseRecordingWakeLock();
  stopCameraStream();
});
load();
