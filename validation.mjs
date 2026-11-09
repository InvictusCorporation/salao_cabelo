import {localDate} from './domain.mjs';
import {whatsappFields} from './whatsapp-fields.mjs';
export function fail(message, status=400) { throw Object.assign(new Error(message), { status }); }
export function birthDate(value) {
 if(value===undefined||value===null||value==='')return '';
 if(!validDate(value)||value.slice(0,4)==='0000'||value>localDate())fail('Informe uma data de nascimento válida, até hoje.');
 return value;
}
export function text(value, label, max=100, required=true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('Informe '+label+' válido.');
  if(label==='identificador'&&!/^[a-zA-Z0-9_-]+$/.test(value))fail('Identificador inválido.');
  return value.trim();
}
export function email(value) { const result=text(value,'e-mail',254).toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail('Informe um e-mail válido.'); return result; }
export const validTime = value => typeof value==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function validDate(value) { return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value; }
function number(value,min,max,integer=true) { if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))fail('Valor numérico inválido.');return value; }
function range(start,end) { if(!validTime(start)||!validTime(end)||start>=end) fail('Informe um horário de início e fim válido.'); }
function period(value,withTime=false) { if(!value||!validDate(value.from)||!validDate(value.to)||value.from>value.to)fail('Período inválido.');if(withTime)range(value.start,value.end);return withTime?{from:value.from,to:value.to,start:value.start,end:value.end}:{from:value.from,to:value.to}; }
function list(value,max=1000) { if(!Array.isArray(value)||value.length>max)fail('Lista inválida.');return value; }
function ids(value) { return list(value).map(v=>text(v,'identificador',80)); }
export function validateConfig(input, current) {
  if(!input || typeof input!=='object')fail('Configuração inválida.');
  if(input.revision!==current.revision) fail('Os dados foram alterados por outro acesso. Atualize a página e tente novamente.',409);
  const b=input.business;
  if(!b)fail('Estabelecimento inválido.');
  range(b.open,b.close);
  if(!['Barbearia','Salão de beleza','Barbearia e salão'].includes(b.type))fail('Tipo de estabelecimento inválido.');
  const days=list(b.days,7).map(d=>number(d,0,6));if(!days.length)fail('Selecione dias de funcionamento.');
  const result={business:{name:text(b.name,'nome',90),type:b.type,address:text(b.address,'endereço',220,false),contact:text(b.contact,'contato',80,false),open:b.open,close:b.close,days:[...new Set(days)],closures:list(b.closures,300).map(c=>period(c)),reminders:number(b.reminders,1,168),timezone:'America/Fortaleza'}};
  result.clients=list(input.clients).map(c=>{let wa;try{wa=whatsappFields(c,current.clients.find(p=>p.id===c.id));}catch(error){fail(error.message);}return {id:text(c.id,'identificador',80),name:text(c.name,'nome',100),phone:text(c.phone,'telefone',30,false),birthDate:birthDate(c.birthDate),birthdayBenefit:text(c.birthdayBenefit||'','benefício de aniversário',300,false),...wa};});
  result.services=list(input.services).map(s=>({id:text(s.id,'identificador',80),name:text(s.name,'serviço',100),price:number(s.price,0,100000,false),duration:number(s.duration,5,600),gap:number(s.gap,0,180)}));
  result.professionals=list(input.professionals).map(p=>{
    range(p.open,p.close);if(!['active','absent','inactive'].includes(p.status))fail('Situação inválida.');
    if(p.breakStart||p.breakEnd){range(p.breakStart,p.breakEnd);if(p.breakStart<p.open||p.breakEnd>p.close)fail('Intervalo fora do expediente.');}
    const serviceIds=ids(p.serviceIds);if(serviceIds.some(id=>!result.services.some(s=>s.id===id)))fail('Serviço não cadastrado.');
    return {id:text(p.id,'identificador',80),name:text(p.name,'nome',100),role:text(p.role,'cargo',70),status:p.status,open:p.open,close:p.close,breakStart:p.breakStart||'',breakEnd:p.breakEnd||'',serviceIds:[...new Set(serviceIds)],blocks:list(p.blocks,300).map(b=>period(b,true))};
  });
  result.waitlist=list(input.waitlist).map(w=>{if(!result.clients.some(c=>c.id===w.clientId)||!result.services.some(s=>s.id===w.serviceId))fail('Cliente ou serviço da fila inválido.');return {id:text(w.id,'identificador',80),clientId:w.clientId,serviceId:w.serviceId};});
  for(const table of ['clients','services','professionals','waitlist']) {
    if(new Set(result[table].map(x=>x.id)).size!==result[table].length)fail('Identificadores repetidos.');
    if(table!=='waitlist'&&current[table].some(x=>!result[table].some(y=>x.id===y.id)))fail('Remoção de cadastros não é suportada; preserve os registros vinculados.');
  }
  return result;
}
