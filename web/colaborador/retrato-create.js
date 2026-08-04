const TOKEN_KEY = 'nhPortalToken';
const CONSULTANT_KEY = 'nhSelectedConsultant';
const $ = (id) => document.getElementById(id);
const token = localStorage.getItem(TOKEN_KEY);
const consultant = JSON.parse(localStorage.getItem(CONSULTANT_KEY) || 'null');

if (!token || !consultant?.id) location.replace('/colaborador/');

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(window.NH_API?.backend(path) || path, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || 'Não foi possível concluir a solicitação.');
  }
  return response.json();
}

function msg(text, type = 'error') {
  const element = $('message');
  element.className = `message ${type}`;
  element.textContent = text;
}

function isZeroKm() {
  return $('requestType').value === 'NEW_INSPECTION' && $('zeroKm').value === 'true';
}

function syncVehicleFields() {
  const newInspection = $('requestType').value === 'NEW_INSPECTION';
  const zeroKm = newInspection && $('zeroKm').value === 'true';

  $('zeroKm').disabled = !newInspection;
  if (!newInspection) $('zeroKm').value = 'false';

  $('plate').disabled = zeroKm;
  $('plate').required = !zeroKm;
  $('plate').placeholder = zeroKm ? 'Não necessário para veículo 0 km' : 'ABC1D23';
  if (zeroKm) $('plate').value = '';

  $('manual-plate-required').hidden = zeroKm;
  $('manual-plate-help').textContent = zeroKm
    ? 'A placa poderá ser cadastrada depois do emplacamento.'
    : newInspection
      ? 'Obrigatória para veículos que não são 0 km.'
      : 'Obrigatória para identificar o veículo na atualização de boleto.';
}

function vehicleLabel(data) {
  return data.plate || 'Veículo 0 km — sem placa';
}

$('consultant-info').textContent = `Consultor responsável: ${consultant.name}`;

const query = new URLSearchParams(location.search);
$('associateName').value = query.get('name') || '';
$('plate').value = (query.get('plate') || '').toUpperCase();
$('whatsapp').value = query.get('whatsapp') || '';
if (query.get('zeroKm') === 'true') $('zeroKm').value = 'true';
syncVehicleFields();

$('requestType').addEventListener('change', syncVehicleFields);
$('zeroKm').addEventListener('change', syncVehicleFields);

$('cpf').addEventListener('input', (event) => {
  const digits = event.target.value.replace(/\D/g, '').slice(0, 11);
  event.target.value = digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
});

$('plate').addEventListener('input', (event) => {
  event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
});

$('inspection-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!isZeroKm() && !$('plate').value.trim()) {
    msg('Informe a placa do veículo.');
    $('plate').focus();
    return;
  }

  try {
    const data = await api('/api/inspections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consultantId: consultant.id,
        requestType: $('requestType').value,
        associateName: $('associateName').value.trim(),
        cpf: $('cpf').value,
        plate: isZeroKm() ? '' : $('plate').value.trim(),
        whatsapp: $('whatsapp').value
      })
    });

    const currentPublicUrl = window.NH_URLS?.retratoUrl(data.publicToken || data.publicUrl) || data.publicUrl;

    $('result').hidden = false;
    $('public-link').value = currentPublicUrl;
    $('open-link').href = currentPublicUrl;

    const sendWhatsapp = $('send-whatsapp');
    if (data.teamWhatsappUrl) {
      sendWhatsapp.href = window.NH_URLS?.replaceLinkInCommunicationUrl(
        data.teamWhatsappUrl,
        data.publicUrl,
        currentPublicUrl
      ) || data.teamWhatsappUrl;
      sendWhatsapp.removeAttribute('aria-disabled');
      sendWhatsapp.classList.remove('disabled');
      sendWhatsapp.title = 'Enviar a solicitação ao WhatsApp configurado pelo administrador';
    } else {
      sendWhatsapp.removeAttribute('href');
      sendWhatsapp.setAttribute('aria-disabled', 'true');
      sendWhatsapp.classList.add('disabled');
      sendWhatsapp.title = 'Configure o WhatsApp da equipe no painel administrativo';
    }

    $('result-summary').textContent = `${data.associateName} · ${vehicleLabel(data)} · link válido até ${new Date(data.expiresAt).toLocaleDateString('pt-BR')}`;
    $('result').scrollIntoView({ behavior: 'smooth' });
    msg('Solicitação registrada no painel administrativo.', 'success');
  } catch (error) {
    msg(error.message);
  }
});

$('send-whatsapp').addEventListener('click', (event) => {
  if (!$('send-whatsapp').hasAttribute('href')) {
    event.preventDefault();
    msg('Configure o WhatsApp da equipe no painel administrativo.');
  }
});

$('copy-link').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('public-link').value);
  msg('Link copiado.', 'success');
});

$('new-request').addEventListener('click', () => {
  location.href = '/colaborador/retrato.html';
});
