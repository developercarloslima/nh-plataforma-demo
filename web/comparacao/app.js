const $ = id => document.getElementById(id);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const params = new URLSearchParams(location.search);
const token = params.get('token') || '';
let comparison = null;
let selectedPlanCode = '';
const selectedByPlan = new Map();

function apiPath(path) { return window.NH_API?.backend(path) || path; }
function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function normalizedStatus(item){ return String(item?.status || '').toUpperCase(); }
function isOptional(item){ return normalizedStatus(item) === 'OPTIONAL'; }
function planByCode(code){ return comparison?.options?.plans?.find(p => p.code === code); }
function selectedCodes(code){ if(!selectedByPlan.has(code)) selectedByPlan.set(code,new Set()); return selectedByPlan.get(code); }
function discountPercent(){ return Number(comparison?.discountPercent || 0); }
function adjustedDetail(coverage){
  if(discountPercent()>0 && coverage?.discountedDetail) return String(coverage.discountedDetail);
  return String(coverage?.detail || '');
}
function totals(plan){
  const selected=selectedCodes(plan.code);
  const optionals=(plan.coverages||[]).filter(c=>isOptional(c)&&selected.has(c.code));
  const optionalTotal=optionals.reduce((sum,c)=>sum+Number(c.monthlyPrice||0),0);
  const subtotal=Number(plan.monthlyValue||0)+optionalTotal;
  const total=subtotal*(100-discountPercent())/100;
  return {optionals,optionalTotal,subtotal,total};
}
function showError(message){ $('error-box').textContent=message; $('error-box').hidden=false; $('comparison-content').hidden=true; $('sticky-choice').hidden=true; }
function whatsappTarget(value){ const digits=String(value||'').replace(/\D/g,''); if(!digits)return ''; return digits.startsWith('55')?digits:`55${digits}`; }
function render(){
  const plans=comparison.options?.plans||[];
  $('plan-list').innerHTML=plans.map(plan=>{
    const t=totals(plan); const selected=plan.code===selectedPlanCode;
    const included=(plan.coverages||[]).filter(c=>!isOptional(c));
    const optionals=(plan.coverages||[]).filter(isOptional).filter(c=>c.monthlyPrice!=null);
    return `<article class="plan-card ${selected?'selected':''}" data-plan="${escapeHtml(plan.code)}">
      <div class="plan-header"><div class="plan-name-row"><div><h3>${escapeHtml(plan.name)}</h3><p class="plan-subtitle">${escapeHtml(plan.subtitle||'')}</p></div><span class="radio-dot"></span></div>
      <div class="price-block"><small>Mensalidade do plano${discountPercent()>0?' com desconto':''}</small><strong>${brl.format(Number(plan.monthlyValue||0)*(100-discountPercent())/100)}</strong></div>
      ${discountPercent()>0?`<span class="discount-note">Desconto de ${discountPercent()}% aplicado</span>`:''}</div>
      <div class="coverage-list">${included.map(c=>{const yes=normalizedStatus(c)==='INCLUDED';return `<div class="coverage-row"><span class="icon">${yes?'✅':'❌'}</span><div><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(adjustedDetail(c)||(yes?'Incluído':'Não incluído'))}</small></div></div>`}).join('')}</div>
      <div class="optional-area"><h4>Adicionais</h4><p>Marque para simular quanto ficará este plano.</p>${optionals.length?optionals.map(c=>`<label class="optional-item"><input type="checkbox" data-plan="${escapeHtml(plan.code)}" data-optional="${escapeHtml(c.code)}" ${selectedCodes(plan.code).has(c.code)?'checked':''}><span><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(adjustedDetail(c)||'Cobertura adicional')}</small></span><span class="optional-price">+ ${brl.format(Number(c.monthlyPrice||0)*(100-discountPercent())/100)}${discountPercent()>0?'<small style="display:block;font-weight:600;color:#62687b">com desconto</small>':''}</span></label>`).join(''):'<small>Nenhum adicional disponível para este plano.</small>'}</div>
      <div class="plan-total"><div><small>Total mensal com adicionais</small><strong>${brl.format(t.total)}</strong></div><div><small>Adicionais</small><b>${brl.format(t.optionalTotal)}</b></div></div>
      <div style="padding:0 24px 22px"><button class="choose-plan" type="button" data-choose="${escapeHtml(plan.code)}">${selected?'Plano selecionado':'Escolher este plano'}</button></div>
    </article>`;
  }).join('');

  document.querySelectorAll('[data-choose]').forEach(btn=>btn.addEventListener('click',()=>{selectedPlanCode=btn.dataset.choose;render();updateSticky();}));
  document.querySelectorAll('[data-optional]').forEach(input=>input.addEventListener('change',()=>{
    const set=selectedCodes(input.dataset.plan);
    if(input.checked){ if(input.dataset.optional==='FUNERAL')set.delete('FUNERAL_FAMILY'); if(input.dataset.optional==='FUNERAL_FAMILY')set.delete('FUNERAL'); set.add(input.dataset.optional); } else set.delete(input.dataset.optional);
    render();updateSticky();
  }));
}
function updateSticky(){
  $('sticky-choice').hidden=false;
  const plan=planByCode(selectedPlanCode);
  $('send-choice').disabled=!plan || !whatsappTarget(comparison.returnWhatsapp);
  $('sticky-plan').textContent=plan?.name||'Selecione um plano';
  $('sticky-total').textContent=plan?`${brl.format(totals(plan).total)}/mês`:'—';
}
function sendChoice(){
  const plan=planByCode(selectedPlanCode); if(!plan)return;
  const target=whatsappTarget(comparison.returnWhatsapp); if(!target){alert('O WhatsApp do consultor não está disponível. Solicite um novo link.');return;}
  const t=totals(plan); const lines=[
    'Olá! Vi a comparação de planos da Novo Horizonte e escolhi minha opção.', '',
    `Associado: ${comparison.customerName||'Não informado'}`,
    `Consultor responsável: ${comparison.consultantName||'Equipe NH'}`,
    `Veículo: ${comparison.model||'—'}${comparison.plate?` • ${comparison.plate}`:''}`,
    `Ressarcimento integral: ${Number(comparison.indemnityFipePercent||100)}% da FIPE`,
    `Plano escolhido: ${plan.name}`
  ];
  if(t.optionals.length){ lines.push('Adicionais escolhidos:'); t.optionals.forEach(c=>lines.push(`• ${c.name} (+ ${brl.format(c.monthlyPrice)}/mês)`)); } else lines.push('Adicionais escolhidos: nenhum');
  if(discountPercent()>0) lines.push(`Desconto considerado: ${discountPercent()}%`);
  lines.push(`Valor mensal estimado: ${brl.format(t.total)}`, '', 'Quero seguir com esse plano e esses adicionais.');
  window.open(`https://wa.me/${target}?text=${encodeURIComponent(lines.join('\n'))}`,'_blank','noopener,noreferrer');
}
async function init(){
  if(!token){showError('Link de comparação inválido. Solicite um novo link ao consultor.');return;}
  try{
    const response=await fetch(apiPath(`/api/public/plan-comparisons/${encodeURIComponent(token)}`));
    if(!response.ok){const body=await response.json().catch(()=>null);throw new Error(body?.message||'Este link de comparação expirou ou não está mais disponível.');}
    comparison=await response.json();
    const plans=comparison.options?.plans||[]; if(!plans.length)throw new Error('Nenhum plano está disponível para esta comparação.');
    $('intro-text').textContent=`Olá, ${comparison.customerName||'associado'}! ${comparison.consultantName||'A equipe NH'} preparou esta comparação para você.`;
    $('vehicle-summary').innerHTML=`<span>${escapeHtml(comparison.model||'Veículo')}</span>${comparison.plate?`<span>Placa ${escapeHtml(comparison.plate)}</span>`:''}<span>FIPE ${brl.format(comparison.fipeValue||0)}</span><span>Ressarcimento ${Number(comparison.indemnityFipePercent||100)}% da FIPE</span>${discountPercent()>0?`<span>Desconto ${discountPercent()}%</span>`:''}`;
    $('comparison-content').hidden=false; $('error-box').hidden=true; render(); updateSticky();
  }catch(error){showError(error.message||'Não foi possível abrir a comparação.');}
}
$('send-choice').addEventListener('click',sendChoice);
init();
