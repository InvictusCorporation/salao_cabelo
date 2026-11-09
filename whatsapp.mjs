import {randomUUID,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {readState,transaction,audit,writeAppointment} from './database.mjs';
import {localDate} from './domain.mjs';
const defaults={enabled:false,bookings:true,reminders:true,birthdays:true,birthdayHour:9};
const hash=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
export const appointmentTime=a=>Date.parse(a.date+'T'+a.start+':00-03:00');
export const appointmentFingerprint=a=>hash(JSON.stringify([a.id,a.clientId,a.professionalId,a.serviceId,a.date,a.start,a.duration,a.gap]));
export function whatsappConfig(env=process.env){
 return {token:env.WHATSAPP_ACCESS_TOKEN||'',phoneId:env.WHATSAPP_PHONE_NUMBER_ID||'',appSecret:env.WHATSAPP_APP_SECRET||'',verifyToken:env.WHATSAPP_VERIFY_TOKEN||'',version:env.WHATSAPP_GRAPH_VERSION||'',language:env.WHATSAPP_TEMPLATE_LANGUAGE||'pt_BR',
  templates:{booking:env.WHATSAPP_TEMPLATE_BOOKING||'',reminder:env.WHATSAPP_TEMPLATE_REMINDER||'',birthday:env.WHATSAPP_TEMPLATE_BIRTHDAY||''},birthdayEndpoint:env.WHATSAPP_BIRTHDAY_ENDPOINT||'messages',publicOrigin:env.PUBLIC_ORIGIN||''};
}
export function createWhatsApp(db,{config=whatsappConfig(),fetchImpl=fetch,clock=()=>Date.now()}={}){
 let timer=null,active=null,stopped=false;
 const fingerprint=()=>hash([config.phoneId,config.appSecret,config.verifyToken].join('|'));
 function settings(businessId='main'){
  const row=db.prepare('SELECT data FROM whatsapp_settings WHERE business_id=?').get(businessId);
  return {...defaults,...(row?JSON.parse(row.data):{})};
 }
 function status(businessId='main'){
  const missing=[];
  for(const [key,valid] of [['WHATSAPP_ACCESS_TOKEN',Boolean(config.token)],['WHATSAPP_PHONE_NUMBER_ID',/^\d+$/.test(config.phoneId)],['WHATSAPP_APP_SECRET',Boolean(config.appSecret)],['WHATSAPP_VERIFY_TOKEN',Boolean(config.verifyToken)],['WHATSAPP_GRAPH_VERSION',/^v\d+\.\d+$/.test(config.version)]])if(!valid)missing.push(key);
  for(const [kind,template] of Object.entries(config.templates))if(!/^[a-z0-9_]{1,512}$/.test(template))missing.push('WHATSAPP_TEMPLATE_'+kind.toUpperCase());
  if(!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(config.language))missing.push('WHATSAPP_TEMPLATE_LANGUAGE');
  if(!['messages','marketing_messages'].includes(config.birthdayEndpoint))missing.push('WHATSAPP_BIRTHDAY_ENDPOINT');
  try{const url=new URL(config.publicOrigin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error();}catch{missing.push('PUBLIC_ORIGIN');}
  const row=db.prepare('SELECT verified_fingerprint,verified_at FROM whatsapp_settings WHERE business_id=?').get(businessId);
  const verified=Boolean(row?.verified_fingerprint&&equal(row.verified_fingerprint,fingerprint()));
  return {settings:settings(businessId),configured:!missing.length,webhookVerified:verified,ready:!missing.length&&verified,missing,
   verifiedAt:verified?row.verified_at:null,webhookUrl:config.publicOrigin&&!missing.includes('PUBLIC_ORIGIN')?new URL('/webhooks/whatsapp',config.publicOrigin).href:null};
 }
 function configure(user,input){
  const value={};for(const key of ['enabled','bookings','reminders','birthdays']){if(typeof input[key]!=='boolean')throw Error('Escolha as opções de envio.');value[key]=input[key];}
  if(!Number.isInteger(input.birthdayHour)||input.birthdayHour<8||input.birthdayHour>18)throw Error('Escolha o horário de aniversário entre 8h e 18h.');value.birthdayHour=input.birthdayHour;
  if(value.enabled&&!status(user.business_id).ready)throw Error('Conclua a conexão do número, os modelos e a verificação do webhook antes de ativar.');
  transaction(db,()=>{db.prepare('INSERT INTO whatsapp_settings(business_id,data) VALUES(?,?) ON CONFLICT(business_id) DO UPDATE SET data=excluded.data').run(user.business_id,JSON.stringify(value));audit(db,user,'whatsapp_settings_updated');});
  return status(user.business_id);
 }
 function add(businessId,client,a,kind,key,now,expiresAt){
  if(!client.whatsappNumber||!(kind==='birthday'?client.whatsappBirthdays:client.whatsappAppointments))return null;
  const id=randomUUID(),snapshot=a?appointmentFingerprint(a):client.birthDate?.slice(5)||'';
  const inserted=db.prepare('INSERT OR IGNORE INTO whatsapp_outbox(id,business_id,client_id,appointment_id,kind,dedupe_key,snapshot,recipient,next_at,expires_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,businessId,client.id,a?.id||null,kind,businessId+':'+key,snapshot,client.whatsappNumber.slice(1),now,expiresAt,now);
  return inserted.changes?id:null;
 }
 function enqueueBooking(businessId,a,now=clock(),eventKey=''){
  const cfg=settings(businessId);if(!cfg.enabled||!cfg.bookings||a.status==='cancelled'||appointmentTime(a)<=now)return null;
  const c=readState(db,businessId).clients.find(c=>c.id===a.clientId);if(!c)return null;
  return add(businessId,c,a,'booking','booking:'+a.id+':'+appointmentFingerprint(a)+(eventKey?':'+eventKey:''),now,appointmentTime(a));
 }
 function schedule(now=clock()){
  for(const b of db.prepare('SELECT id FROM businesses').all()){
   const cfg=settings(b.id);if(!cfg.enabled||!status(b.id).ready)continue;
   const s=readState(db,b.id);
   if(cfg.reminders)for(const a of s.appointments){const at=appointmentTime(a);if(a.status==='cancelled'||at<=now||at-s.business.reminders*3600000>now)continue;const c=s.clients.find(c=>c.id===a.clientId);if(c)add(b.id,c,a,'reminder','reminder:'+a.id+':'+appointmentFingerprint(a),now,at);}
   const today=localDate(new Date(now));const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Fortaleza',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));
   if(cfg.birthdays&&hour>=cfg.birthdayHour&&hour<20)for(const c of s.clients)if(c.birthDate?.slice(5)===today.slice(5))add(b.id,c,null,'birthday','birthday:'+c.id+':'+today.slice(0,4),now,Date.parse(today+'T20:00:00-03:00'));
  }
 }
 function eligibility(row,now){
  const cfg=settings(row.business_id);if(!cfg.enabled||!(row.kind==='booking'?cfg.bookings:row.kind==='reminder'?cfg.reminders:cfg.birthdays))return 'Envio desativado.';
  const s=readState(db,row.business_id),c=s.clients.find(c=>c.id===row.client_id),a=s.appointments.find(a=>a.id===row.appointment_id);
  if(!c||!c.whatsappNumber||c.whatsappNumber.slice(1)!==row.recipient||!(row.kind==='birthday'?c.whatsappBirthdays:c.whatsappAppointments))return 'Número alterado ou autorização retirada.';
  if(row.expires_at<=now)return 'Prazo da mensagem encerrado.';
  if(row.kind!=='birthday'&&(!a||a.status==='cancelled'||appointmentFingerprint(a)!==row.snapshot))return 'Agendamento cancelado ou alterado.';
  if(row.kind==='birthday'&&(c.birthDate?.slice(5)!==row.snapshot||localDate(new Date(now)).slice(5)!==row.snapshot))return 'Data de aniversário alterada ou encerrada.';
  return null;
 }
 function actionPayload(row,action){const value=row.id+':'+action+':'+row.snapshot;return 'iv:'+row.id+':'+action+':'+createHmac('sha256',config.appSecret).update(value).digest('hex').slice(0,32);}
 function payload(row){
  const s=readState(db,row.business_id),c=s.clients.find(c=>c.id===row.client_id),a=s.appointments.find(a=>a.id===row.appointment_id);
  const values=row.kind==='birthday'?[c.name,s.business.name]:[c.name,s.services.find(v=>v.id===a.serviceId)?.name||'Atendimento',s.professionals.find(p=>p.id===a.professionalId)?.name||'Profissional',a.date.split('-').reverse().join('/'),a.start,s.business.address||'Consulte o estabelecimento'];
  const components=[{type:'body',parameters:values.map(text=>({type:'text',text}))}];
  if(row.kind!=='birthday')for(const [index,action] of ['confirm','reschedule','cancel'].entries())components.push({type:'button',sub_type:'quick_reply',index:String(index),parameters:[{type:'payload',payload:actionPayload(row,action)}]});
  return {messaging_product:'whatsapp',recipient_type:'individual',to:row.recipient,type:'template',template:{name:config.templates[row.kind],language:{code:config.language},components}};
 }
 function applyReceipt(receipt){
  const row=db.prepare('SELECT * FROM whatsapp_outbox WHERE provider_id=? AND recipient=?').get(receipt.provider_id,receipt.recipient);if(!row)return;
  if(row.state==='read'||(row.state==='delivered'&&receipt.status!=='read')||(row.state==='sent'&&receipt.status==='accepted'))return;
  db.prepare('UPDATE whatsapp_outbox SET state=?,error=?,updated_at=? WHERE id=?').run(receipt.status,receipt.error_code?'Falha informada pela Meta, código '+receipt.error_code:null,clock(),row.id);
 }
 async function dispatch(row){
  try{
   const endpoint=row.kind==='birthday'?config.birthdayEndpoint:'messages';
   const response=await fetchImpl('https://graph.facebook.com/'+config.version+'/'+config.phoneId+'/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify(payload(row)),signal:AbortSignal.timeout(10000)});
   let result;try{result=await response.json();}catch{throw Error('unknown');}
   if(response.ok&&typeof result.messages?.[0]?.id==='string'&&result.messages[0].id.startsWith('wamid.')){
    const id=result.messages[0].id;db.prepare("UPDATE whatsapp_outbox SET state='accepted',provider_id=?,error=NULL,updated_at=? WHERE id=?").run(id,clock(),row.id);
    for(const receipt of db.prepare('SELECT * FROM whatsapp_receipts WHERE provider_id=? ORDER BY at').all(id))applyReceipt(receipt);
   }else if(response.status===429&&row.attempts<3){db.prepare("UPDATE whatsapp_outbox SET state='queued',next_at=?,error=?,updated_at=? WHERE id=?").run(clock()+60000*row.attempts,'Limite da Meta. Nova tentativa agendada.',clock(),row.id);}
   else if(response.status>=400&&response.status<500){db.prepare("UPDATE whatsapp_outbox SET state='failed',error=?,updated_at=? WHERE id=?").run('Meta recusou a mensagem'+(Number.isInteger(result.error?.code)?', código '+result.error.code:'.'),clock(),row.id);}
   else throw Error('unknown');
  }catch{db.prepare("UPDATE whatsapp_outbox SET state='unknown',error=?,updated_at=? WHERE id=? AND state='sending'").run('Resultado incerto. Confira no WhatsApp Manager antes de qualquer novo envio.',clock(),row.id);}
 }
 async function run(){
  const now=clock();
  db.prepare("UPDATE whatsapp_outbox SET state='unknown',error='Processamento interrompido. Verifique no WhatsApp Manager.',updated_at=? WHERE state='sending' AND updated_at<?").run(now,now-300000);
  db.prepare("UPDATE whatsapp_outbox SET state='skipped',error='Prazo da mensagem encerrado.',updated_at=? WHERE state='queued' AND expires_at<=?").run(now,now);
  transaction(db,()=>schedule(now));
  for(let i=0;i<20&&!stopped;i++){
   const row=transaction(db,()=>{
    const rows=db.prepare("SELECT * FROM whatsapp_outbox WHERE state='queued' AND next_at<=? ORDER BY next_at LIMIT 100").all(clock());
    for(const candidate of rows){if(!status(candidate.business_id).ready||!settings(candidate.business_id).enabled)continue;const reason=eligibility(candidate,clock());if(reason){db.prepare("UPDATE whatsapp_outbox SET state='skipped',error=?,updated_at=? WHERE id=?").run(reason,clock(),candidate.id);continue;}
     db.prepare("UPDATE whatsapp_outbox SET state='sending',attempts=attempts+1,updated_at=? WHERE id=? AND state='queued'").run(clock(),candidate.id);return {...candidate,attempts:candidate.attempts+1};}
   });if(!row)break;await dispatch(row);
  }
 }
 function tick(){if(!active)active=run().finally(()=>{active=null;});return active;}
 function history(businessId){return db.prepare('SELECT id,client_id,appointment_id,kind,state,attempts,updated_at,error,action_requested FROM whatsapp_outbox WHERE business_id=? ORDER BY updated_at DESC LIMIT 100').all(businessId);}
 function verification(params){
  if(!config.verifyToken||!config.appSecret||!config.phoneId||params.get('hub.mode')!=='subscribe'||!equal(params.get('hub.verify_token'),config.verifyToken))return null;
  const challenge=params.get('hub.challenge');if(!challenge||challenge.length>300)return null;
  db.prepare('INSERT INTO whatsapp_settings(business_id,data,verified_fingerprint,verified_at) VALUES(?,?,?,?) ON CONFLICT(business_id) DO UPDATE SET verified_fingerprint=excluded.verified_fingerprint,verified_at=excluded.verified_at').run('main',JSON.stringify(defaults),fingerprint(),new Date(clock()).toISOString());
  return challenge;
 }
 function validSignature(raw,signature){return Boolean(config.appSecret&&/^sha256=[a-f0-9]{64}$/.test(signature||'')&&equal(signature,'sha256='+createHmac('sha256',config.appSecret).update(raw).digest('hex')));}
 function handleWebhook(raw,signature){
  if(!validSignature(raw,signature))return false;
  const body=JSON.parse(raw.toString('utf8'));if(body.object!=='whatsapp_business_account')return true;
  transaction(db,()=>{
   for(const entry of body.entry||[])for(const change of entry.changes||[]){
    const value=change.value;if(change.field!=='messages'||value?.metadata?.phone_number_id!==config.phoneId)continue;
    for(const receipt of value.statuses||[]){
     if(!['sent','delivered','read','failed'].includes(receipt.status)||typeof receipt.id!=='string'||typeof receipt.recipient_id!=='string')continue;
     const at=Number(receipt.timestamp)*1000;if(!Number.isFinite(at))continue;
     const errorCode=Number.isInteger(receipt.errors?.[0]?.code)?String(receipt.errors[0].code):null;
     db.prepare('INSERT INTO whatsapp_receipts(provider_id,status,recipient,at,error_code) VALUES(?,?,?,?,?) ON CONFLICT(provider_id,status) DO UPDATE SET at=MAX(at,excluded.at)').run(receipt.id,receipt.status,receipt.recipient_id,at,errorCode);
     applyReceipt({provider_id:receipt.id,status:receipt.status,recipient:receipt.recipient_id,error_code:errorCode});
    }
    for(const message of value.messages||[]){
     if(typeof message.id!=='string'||typeof message.from!=='string')continue;
     if(!db.prepare('INSERT OR IGNORE INTO whatsapp_inbound(id,received_at) VALUES(?,?)').run(message.id,clock()).changes)continue;
     const rawText=message.type==='text'?message.text?.body:'';
     if(typeof rawText==='string'&&['SAIR','PARAR','STOP','CANCELAR MENSAGENS'].includes(rawText.trim().toUpperCase())){
      const s=readState(db,'main');
      for(const c of s.clients)if(c.whatsappNumber?.slice(1)===message.from){c.whatsappAppointments=false;c.whatsappBirthdays=false;c.whatsappConsentAt=new Date(clock()).toISOString();c.whatsappConsentSource='whatsapp-opt-out';db.prepare('UPDATE clients SET data=? WHERE id=? AND business_id=?').run(JSON.stringify(c),c.id,'main');audit(db,{id:'whatsapp',business_id:'main'},'whatsapp_opt_out',c.id);}
      continue;
     }
     const data=message.type==='button'?message.button?.payload:message.interactive?.button_reply?.id;
     if(typeof data!=='string'||data.length>250)continue;
     const [,id,action]=data.split(':');if(!['confirm','reschedule','cancel'].includes(action))continue;
     const row=db.prepare('SELECT * FROM whatsapp_outbox WHERE id=?').get(id);
     if(!row||row.recipient!==message.from||row.kind==='birthday'||!equal(data,actionPayload(row,action))||eligibility(row,clock()))continue;
     if(row.provider_id&&message.context?.id&&message.context.id!==row.provider_id)continue;
     const a=readState(db,row.business_id).appointments.find(a=>a.id===row.appointment_id);
     if(action==='confirm')a.status='confirmed';else if(action==='cancel')a.status='cancelled';
     writeAppointment(db,row.business_id,a);
     db.prepare('UPDATE whatsapp_outbox SET action_requested=?,updated_at=? WHERE id=?').run(action,clock(),row.id);
     audit(db,{id:'whatsapp',business_id:row.business_id},'whatsapp_'+action,a.id);
    }
   }
  });return true;
 }
 function start(){if(timer)return;stopped=false;timer=setInterval(()=>tick().catch(()=>console.error('Falha no processamento do WhatsApp; consulte a central de notificações.')),30000);timer.unref();}
 async function stop(){stopped=true;if(timer)clearInterval(timer);timer=null;if(active)await active;}
 function retry(user,id){transaction(db,()=>{const row=db.prepare('SELECT * FROM whatsapp_outbox WHERE id=? AND business_id=?').get(id,user.business_id);if(!row||row.state!=='failed')throw Error('Somente falhas confirmadas podem ser reenviadas. Envios incertos exigem conferência no WhatsApp Manager.');if(!status(user.business_id).ready)throw Error('A conexão ainda não está pronta.');const reason=eligibility(row,clock());if(reason)throw Error(reason);db.prepare("UPDATE whatsapp_outbox SET state='queued',next_at=?,updated_at=?,attempts=0,error=NULL WHERE id=?").run(clock(),clock(),id);audit(db,user,'whatsapp_retry',id);});}
 return {status,settings,configure,enqueueBooking,schedule,tick,history,verification,handleWebhook,start,stop,actionPayload,retry};
}
