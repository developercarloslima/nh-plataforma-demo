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
let recordingTimer = null;
let recordingStartedAt = null;
let discardRecording = false;
let signatureHasInk = false;
let signatureDrawing = false;
let signatureLastPoint = null;

function configureInspectionProfile(vehicleType) {
  inspectionProfile = VEHICLE_PROFILES[vehicleType] || VEHICLE_PROFILES.FOUR_WHEELS_OR_MORE;
  labels = inspectionProfile.photos.map((photo) => photo.label);
  photoFiles = new Array(labels.length).fill(null);
  photoPreviewUrls = new Array(labels.length).fill(null);

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
  if (!token) {
    msg('Link de vistoria não informado.');
    return;
  }

  try {
    const response = await fetch(window.NH_API?.backend(`/api/public/inspections/${encodeURIComponent(token)}`) || `/api/public/inspections/${encodeURIComponent(token)}`);
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(body?.message || 'Link inválido.');
    }

    request = body;
    configureInspectionProfile(body.vehicleType);
    $('vehicle-guide-count').textContent = body.requestType === 'NEW_INSPECTION'
      ? `${labels.length} fotos obrigatórias + 1 vídeo`
      : '1 vídeo obrigatório para atualização de boleto';

    if (body.status === 'COMPLETED') {
      showComplete(body);
      return;
    }

    $('title').textContent = body.requestType === 'NEW_INSPECTION'
      ? 'Nova vistoria do veículo'
      : 'Atualização de boleto';
    $('subtitle').textContent = `Associado: ${body.associateName} · ${vehiclePlateLabel(body.plate)}`;
    $('guideline-card').hidden = false;
  } catch (error) {
    msg(error.message);
  }
}

$('start').addEventListener('click', () => {
  clearMessage();
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

  updateCaptureSummary();

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
    await openCamera({ audio: false, facingMode: photo.facingMode || 'environment' });
    $('camera-title').textContent = `${index + 1}. ${labels[index]}`;
    $('camera-instruction').textContent = photo.label.toLowerCase().includes('selfie')
      ? 'Reproduza o enquadramento mostrado no guia. Mantenha o associado, a frente do veículo e a placa visíveis.'
      : 'Reproduza o ângulo mostrado no guia e toque em “Capturar foto”.';
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
    await openCamera({ audio: true, facingMode: 'environment' });
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
  context.drawImage(preview, 0, 0, width, height);

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
    ? ` · endereço ${$('residence-address').value.trim() ? 'preenchido' : 'pendente'} · assinatura ${signatureHasInk ? 'registrada' : 'pendente'}`
    : '';
  $('capture-summary').textContent = requiredPhotos
    ? `${capturedPhotos} de ${requiredPhotos} fotos registradas · ${videoStatus}${registrationStatus}`
    : videoStatus;
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

  if (fullInspection && !signatureHasInk) {
    msg('Solicite que o associado assine com o dedo antes de concluir.');
    $('signature-pad').focus();
    return;
  }

  const button = event.submitter || $('submit-inspection');
  button.disabled = true;
  button.textContent = 'Enviando arquivos...';

  try {
    const form = new FormData();

    if (fullInspection) {
      photoFiles.forEach((file, index) => {
        form.append('photos', file);
        form.append('labels', labels[index]);
      });
    }

    form.append('video', videoFile);

    if (fullInspection) {
      const signatureBlob = await exportSignatureBlob();
      form.append('residenceAddress', residenceAddress);
      form.append('signature', new File([signatureBlob], 'assinatura-associado.png', {
        type: 'image/png',
        lastModified: Date.now()
      }));
    }

    const response = await fetch(window.NH_API?.backend(`/api/public/inspections/${encodeURIComponent(token)}/upload`) || `/api/public/inspections/${encodeURIComponent(token)}/upload`, {
      method: 'POST',
      body: form
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(body?.message || 'Não foi possível enviar a vistoria.');
    }

    showComplete(body.inspection);
  } catch (error) {
    msg(error.message);
    button.disabled = false;
    button.textContent = 'Enviar vistoria com segurança';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

function showComplete(data) {
  request = data;
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

  $('whatsapp-notice').textContent = 'Seu consultor será orientado a comunicar você pelo WhatsApp. A vistoria agora aguarda análise.';

  $('title').textContent = 'Vistoria concluída';
  $('subtitle').textContent = `${data.associateName} · ${vehiclePlateLabel(data.plate)}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
$('residence-address').addEventListener('input', updateCaptureSummary);
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
