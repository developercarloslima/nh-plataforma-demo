const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(location.search).get('token');

const labels = [
  'Frente do veículo',
  'Traseira do veículo',
  'Lateral esquerda',
  'Lateral direita',
  'Painel e quilometragem',
  'Chassi / numeração',
  'Motor ou compartimento do motor',
  'Pneus, rodas e estado geral'
];

const allowedVideoTypes = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp'
]);

let request = null;
let photoFiles = new Array(labels.length).fill(null);
let photoPreviewUrls = new Array(labels.length).fill(null);
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
    ? 'Fotos completas e vídeo'
    : 'Vídeo para atualização de boleto';
  $('upload-note').textContent = fullInspection
    ? 'As imagens devem ser registradas agora. A galeria do aparelho não será utilizada.'
    : 'Grave agora o vídeo solicitado. A galeria do aparelho não será utilizada.';

  $('registration-fields').hidden = !fullInspection;
  $('residence-address').required = fullInspection;

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
      <small>Abra a câmera e fotografe com nitidez, sem cortar a área solicitada.</small>
      <img id="photo-preview-${index}" class="capture-preview" alt="Prévia de ${escapeHtml(label)}" hidden>
      <p id="photo-status-${index}" class="capture-status">Foto ainda não registrada.</p>
      <button class="outline camera-action" type="button" data-photo-index="${index}">
        Abrir câmera
      </button>
    </article>
  `).join('');

  document.querySelectorAll('[data-photo-index]').forEach((button) => {
    button.addEventListener('click', () => openPhotoCamera(Number(button.dataset.photoIndex)));
  });
}

async function openPhotoCamera(index) {
  currentPhotoIndex = index;
  captureMode = 'photo';
  discardRecording = false;
  clearMessage();

  try {
    await openCamera({ audio: false });
    $('camera-title').textContent = `${index + 1}. ${labels[index]}`;
    $('camera-instruction').textContent = 'Posicione o veículo no enquadramento e toque em “Capturar foto”.';
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
    await openCamera({ audio: true });
    $('camera-title').textContent = 'Vídeo da vistoria';
    $('camera-instruction').textContent = 'Toque em “Iniciar gravação”, caminhe devagar ao redor do veículo e finalize nesta mesma tela.';
    $('capture-photo').hidden = true;
    $('start-recording').hidden = false;
    $('stop-recording').hidden = true;
    $('recording-indicator').hidden = true;
  } catch (error) {
    handleCameraError(error);
  }
}

async function openCamera({ audio }) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('A câmera exige um navegador atualizado e uma conexão HTTPS. Em testes locais, use localhost.');
  }

  stopCameraStream();

  const constraints = {
    video: {
      facingMode: { ideal: 'environment' },
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

$('record-video').addEventListener('click', openVideoCamera);
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
