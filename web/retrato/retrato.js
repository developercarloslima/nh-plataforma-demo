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
    videoInstruction: 'Com o veículo ligado, inicie a gravação mostrando o chassi legível. Fale seu nome completo, o dia, o mês e o ano. Mostre os 4 lados da motocicleta detalhadamente, dando um giro de 360° em torno do veículo. Finalize mostrando o odômetro com o KM total e encerre o vídeo. Tempo ideal: 1 minuto e 30 segundos.'
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
    videoInstruction: 'Com o veículo ligado, inicie a gravação mostrando o chassi legível. Fale seu nome completo, o dia, o mês e o ano. Mostre os 4 lados do veículo detalhadamente, dando um giro de 360° em torno do veículo. Finalize abrindo a porta do motorista e mostrando o odômetro com o KM total. Encerre o vídeo. Tempo ideal: 1 minuto e 30 segundos.'
  }
};

const allowedVideoTypes = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp'
]);

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
let currentPhotoIndex = null;
let captureMode = null;
let selfieMirrorCorrection = false;
let activeFacingMode = 'environment';
let recordingTimer = null;
let recordingStartedAt = null;
let discardRecording = false;
let signatureHasInk = false;
let vehicleDocumentFile = null;
let identityDocumentFile = null;
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
      identityDocument: serializedFile(identityDocumentFile),
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
  vehicleDocumentFile = restoredFile(draft.vehicleDocument, 'crlv-veiculo.pdf', 'application/pdf');
  identityDocumentFile = restoredFile(draft.identityDocument, 'rg-cnh-associado.pdf', 'application/pdf');
  $('residence-address').value = draft.residenceAddress || '';
  restoredSignatureBlob = draft.signature || null;
  hasRestoredDraft = photoFiles.some(Boolean)
    || Boolean(videoFile)
    || Boolean(vehicleDocumentFile)
    || Boolean(identityDocumentFile)
    || Boolean(restoredSignatureBlob)
    || Boolean(draft.residenceAddress);

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
  if (identityDocumentFile) {
    updateDocumentStatus('identity-document', identityDocumentFile, true);
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
  return confirmedPhotos >= expectedPhotos
    && assetTypes.includes('SIGNATURE')
    && assetTypes.includes('VEHICLE_DOCUMENT')
    && assetTypes.includes('IDENTITY_DOCUMENT');
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
  identityDocumentFile = null;

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
    $('vehicle-guide-count').textContent = body.requestType === 'NEW_INSPECTION'
      ? `${labels.length} fotos obrigatórias + 1 vídeo`
      : '1 vídeo obrigatório para atualização de boleto';

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

    $('title').textContent = body.requestType === 'NEW_INSPECTION'
      ? 'Nova vistoria do veículo'
      : 'Atualização de boleto';
    $('subtitle').textContent = `Associado: ${body.associateName} · ${vehiclePlateLabel(body.plate)}`;
    $('guideline-card').hidden = false;
    await restoreDraftFromCache();
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
  $('upload-heading').textContent = fullInspection
    ? `Vistoria de ${inspectionProfile.title.toLowerCase()}`
    : 'Vídeo para atualização de boleto';
  $('upload-note').textContent = fullInspection
    ? `Registre as ${labels.length} fotos na ordem indicada. Antes de cada abertura da câmera, a imagem ilustrativa correspondente será exibida.`
    : 'Antes da gravação, você verá as diretrizes específicas para este tipo de veículo.';

  $('registration-fields').hidden = !fullInspection;
  $('residence-address').required = fullInspection;
  $('video-title').textContent = fullInspection
    ? `${labels.length + 1}. Vídeo da vistoria *`
    : 'Vídeo para atualização de boleto *';

  if (fullInspection) {
    renderPhotoCaptureCards();
    initializeSignaturePad();
  } else {
    $('photos').innerHTML = '';
  }

  if (hasRestoredDraft) {
    await applyRestoredDraftToUi();
  } else {
    updateCaptureSummary();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function renderPhotoCaptureCards() {
  $('photos').innerHTML = labels.map((label, index) => `
    <article class="upload-item camera-upload-item">
      <strong>${index + 1}. ${escapeHtml(label)}</strong>
      <small>Ao tocar em “Abrir câmera”, você verá primeiro a imagem ilustrativa desta etapa.</small>
      <img id="photo-preview-${index}" class="capture-preview" alt="Prévia de ${escapeHtml(label)}" hidden>
      <p id="photo-status-${index}" class="capture-status">Foto ainda não registrada.</p>
      <button class="outline camera-action" type="button" data-photo-index="${index}">
        Abrir câmera
      </button>
    </article>
  `).join('');

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
  $('capture-guide-instruction').textContent = photo.label.toLowerCase().includes('selfie')
    ? 'Enquadre o associado e o veículo como no exemplo. Quando houver placa, ela precisa ficar legível. Para veículo 0 km sem placa, mostre claramente a dianteira.'
    : 'Observe o ângulo, a distância e a área do veículo mostrada no exemplo. Tire a foto com boa iluminação e sem cortar a parte solicitada.';
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
    $('recording-indicator').hidden = true;
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

  const constraints = {
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: audio
      ? { echoCancellation: true, noiseSuppression: true }
      : false
  };

  activeStream = await navigator.mediaDevices.getUserMedia(constraints);
  const cameraPreview = $('camera-preview');
  cameraPreview.srcObject = activeStream;
  cameraPreview.muted = true;
  await cameraPreview.play();
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
    videoBitsPerSecond: 2_500_000,
    audioBitsPerSecond: 96_000
  };

  if (mimeType) {
    options.mimeType = mimeType;
  }

  try {
    recordedChunks = [];
    discardRecording = false;
    mediaRecorder = new MediaRecorder(activeStream, options);

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener('stop', finishVideoRecording, { once: true });
    mediaRecorder.start(1000);

    recordingStartedAt = Date.now();
    $('start-recording').hidden = true;
    $('stop-recording').hidden = false;
    $('cancel-camera').textContent = 'Cancelar gravação';
    $('recording-indicator').hidden = false;
    updateRecordingTimer();
    recordingTimer = window.setInterval(updateRecordingTimer, 1000);
  } catch (error) {
    handleCameraError(error);
  }
}

function stopVideoRecording() {
  if (mediaRecorder?.state === 'recording') {
    mediaRecorder.stop();
  }
}

function cancelCameraCapture() {
  if (mediaRecorder?.state === 'recording') {
    discardRecording = true;
    mediaRecorder.stop();
    return;
  }

  closeCameraModal();
}

function finishVideoRecording() {
  clearRecordingTimer();

  if (discardRecording) {
    recordedChunks = [];
    mediaRecorder = null;
    closeCameraModal();
    return;
  }

  const recorderType = (mediaRecorder?.mimeType || '').split(';')[0];
  const selectedType = selectRecordingMimeType().split(';')[0];
  const mimeType = recorderType || selectedType || 'video/webm';

  if (!allowedVideoTypes.has(mimeType)) {
    mediaRecorder = null;
    recordedChunks = [];
    handleCameraError(new Error(`O formato de vídeo gerado (${mimeType}) não é compatível. Use Chrome, Edge ou Safari atualizado.`));
    return;
  }

  const blob = new Blob(recordedChunks, { type: mimeType });
  const extension = videoExtension(mimeType);
  const plate = slugify(request?.plate || 'veiculo');

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
  $('video-status').textContent = `Vídeo gravado pela câmera (${formatBytes(blob.size)}).`;
  $('record-video').textContent = 'Gravar novamente';
  $('record-video').classList.add('captured');

  mediaRecorder = null;
  recordedChunks = [];
  closeCameraModal();
  updateCaptureSummary();
  scheduleDraftSave(0, 'Vídeo salvo neste aparelho para uma nova tentativa de envio.');
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
  if (!recordingStartedAt) {
    return;
  }

  const elapsedSeconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const seconds = String(elapsedSeconds % 60).padStart(2, '0');
  $('recording-time').textContent = `${minutes}:${seconds}`;
}

function clearRecordingTimer() {
  if (recordingTimer) {
    window.clearInterval(recordingTimer);
    recordingTimer = null;
  }
  recordingStartedAt = null;
}

function closeCameraModal() {
  clearRecordingTimer();
  stopCameraStream();
  $('camera-modal').hidden = true;
  $('capture-photo').hidden = true;
  $('start-recording').hidden = true;
  $('stop-recording').hidden = true;
  $('recording-indicator').hidden = true;
  $('cancel-camera').textContent = 'Cancelar';
  $('camera-preview').srcObject = null;
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
  const requiredPhotos = request?.requestType === 'NEW_INSPECTION' ? labels.length : 0;
  const capturedPhotos = photoFiles.filter(Boolean).length;
  const videoStatus = videoFile ? 'vídeo gravado' : 'vídeo pendente';
  const registrationStatus = requiredPhotos
    ? ` · endereço ${$('residence-address').value.trim() ? 'preenchido' : 'pendente'}`
      + ` · CRLV ${vehicleDocumentFile ? 'enviado' : 'pendente'}`
      + ` · RG/CNH ${identityDocumentFile ? 'enviado' : 'pendente'}`
      + ` · assinatura ${signatureHasInk ? 'registrada' : 'pendente'}`
    : '';
  $('capture-summary').textContent = requiredPhotos
    ? `${capturedPhotos} de ${requiredPhotos} fotos registradas · ${videoStatus}${registrationStatus}`
    : videoStatus;
}

function serverHasAsset(assetType, sortOrder) {
  return Array.isArray(request?.assets) && request.assets.some((asset) =>
    asset?.type === assetType && asset?.available === true && Number(asset?.sortOrder) === Number(sortOrder)
  );
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

$('upload-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage();

  const fullInspection = request.requestType === 'NEW_INSPECTION';
  const missingPhotoIndex = fullInspection ? photoFiles.findIndex((file) => !file) : -1;

  if (missingPhotoIndex >= 0) {
    msg(`Registre a foto obrigatória: ${labels[missingPhotoIndex]}.`);
    document.querySelector(`[data-photo-index="${missingPhotoIndex}"]`)?.focus();
    return;
  }

  if (!videoFile) {
    msg('Grave o vídeo da vistoria antes de enviar.');
    $('record-video').focus();
    return;
  }

  const residenceAddress = $('residence-address').value.trim();
  if (fullInspection && !residenceAddress) {
    msg('Informe o endereço completo de residência do associado.');
    $('residence-address').focus();
    return;
  }

  if (fullInspection && !vehicleDocumentFile) {
    msg('Envie o CRLV do veículo antes de concluir.');
    $('vehicle-document').focus();
    return;
  }

  if (fullInspection && !identityDocumentFile) {
    msg('Envie o RG ou a CNH do associado antes de concluir.');
    $('identity-document').focus();
    return;
  }

  if (fullInspection && !signatureHasInk) {
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
      photoFiles.forEach((file, index) => assets.push({
        assetType: 'PHOTO',
        sortOrder: index + 1,
        label: labels[index],
        file
      }));
    }

    const videoOrder = fullInspection ? labels.length + 1 : 1;
    assets.push({
      assetType: 'VIDEO',
      sortOrder: videoOrder,
      label: 'Vídeo da vistoria',
      file: videoFile
    });

    if (fullInspection) {
      const signatureBlob = await exportSignatureBlob();
      assets.push({
        assetType: 'SIGNATURE',
        sortOrder: labels.length + 2,
        label: 'Assinatura do associado',
        file: new File([signatureBlob], 'assinatura-associado.png', {
          type: 'image/png',
          lastModified: Date.now()
        })
      });
      assets.push({
        assetType: 'VEHICLE_DOCUMENT',
        sortOrder: labels.length + 3,
        label: 'CRLV do veículo',
        file: vehicleDocumentFile
      });
      assets.push({
        assetType: 'IDENTITY_DOCUMENT',
        sortOrder: labels.length + 4,
        label: 'RG ou CNH do associado',
        file: identityDocumentFile
      });
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
      else identityDocumentFile = file;
      updateDocumentStatus(inputId, file);
      updateCaptureSummary();
      scheduleDraftSave(0, `${label} salvo neste aparelho.`);
    } catch (error) {
      input.value = '';
      if (inputId === 'vehicle-document') vehicleDocumentFile = null;
      else identityDocumentFile = null;
      updateDocumentStatus(inputId, null);
      updateCaptureSummary();
      msg(error.message);
    }
  });
}

handleDocumentSelection('vehicle-document', 'o CRLV do veículo');
handleDocumentSelection('identity-document', 'o RG ou a CNH do associado');

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
  if ($('registration-fields').hidden) return;
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
  if (document.visibilityState === 'hidden' && request && !$('upload-card').hidden) {
    scheduleDraftSave(0, 'Rascunho atualizado neste aparelho.');
  }
});
window.addEventListener('online', () => {
  if (!$('connection-actions').hidden) load();
});
initializeSignaturePad();
clearSignature();

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

window.addEventListener('beforeunload', stopCameraStream);
load();
