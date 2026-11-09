import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {seed,localDate} from '../domain.mjs';
import {writeAppointment,readState} from '../database.mjs';
import {whatsappConfig} from '../whatsapp.mjs';
import {whatsappFields} from '../whatsapp-fields.mjs';

const today=localDate(),tomorrowDate=new Date(today+'T12:00:00-03:00');tomorrowDate.setDate(tomorrowDate.getDate()+1);const tomorrow=localDate(tomorrowDate);
const config={token:'fake-token-never-sent',phoneId:'123456789',appSecret:'fake-app-secret',verifyToken:'fake-verify-token',version:'v99.0',language:'pt_BR',templates:{booking:'booking_test',reminder:'reminder_test',birthday:'birthday_test'},birthdayEndpoint:'messages',publicOrigin:'https://salon.example.test'};
function fixture(options={}){
 let now=Date.parse(today+'T09:00:00-03:00');const requests=[];
 const fetchImpl=options.fetchImpl||(async(url,input)=>{requests.push({url,body:JSON.parse(input.body)});return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.'+randomUUID()}]})};});
 const app=createApp({dbPath:':memory:',whatsapp:{config:{...config,...options.config},fetchImpl,clock:()=>now}}),db=app.db,s=seed();
 s.business.days=[0,1,2,3,4,5,6];s.clients[0]={...s.clients[0],birthDate:'2000-'+today.slice(5),birthdayBenefit:'SEGREDO INTERNO',...whatsappFields({whatsappNumber:'+55 (85) 99999-0001',whatsappAppointments:true,whatsappBirthdays:true})};
 db.prepare('UPDATE businesses SET data=? WHERE id=?').run(JSON.stringify(s.business),'main');
 for(const table of ['clients','services','professionals'])for(const row of s[table])db.prepare('INSERT INTO '+table+'(id,business_id,data) VALUES(?,?,?)').run(row.id,'main',JSON.stringify(row));
 const appointment={...s.appointments[0],id:'wa-appointment',date:tomorrow,start:'09:00',status:'pending'};writeAppointment(db,'main',appointment);
 app.whatsapp.verification(new URLSearchParams({'hub.mode':'subscribe','hub.verify_token':config.verifyToken,'hub.challenge':'1234'}));
 const user={id:'test-admin',business_id:'main'};
 app.whatsapp.configure(user,{enabled:true,bookings:true,reminders:false,birthdays:false,birthdayHour:9,...options.settings});
 return {...app,requests,user,appointment,advance:ms=>{now+=ms;},now:()=>now,close:()=>db.close(),client:()=>readState(db,'main').clients.find(c=>c.id==='pedro'),setClient:c=>db.prepare('UPDATE clients SET data=? WHERE id=?').run(JSON.stringify(c),c.id)};
}
function signed(app,value){const raw=Buffer.from(JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:config.phoneId},...value}}]}]}));return app.whatsapp.handleWebhook(raw,'sha256='+createHmac('sha256',config.appSecret).update(raw).digest('hex'));}
const rows=f=>f.db.prepare('SELECT * FROM whatsapp_outbox ORDER BY rowid').all();

test('WhatsApp fica desligado sem credenciais e sem webhook verificado',()=>{
 const f=createApp({dbPath:':memory:',whatsapp:{config:whatsappConfig({})}});
 try{const status=f.whatsapp.status();assert.equal(status.ready,false);assert.equal(status.settings.enabled,false);assert(status.missing.includes('WHATSAPP_ACCESS_TOKEN'));assert.throws(()=>f.whatsapp.configure({id:'test',business_id:'main'},{enabled:true,bookings:true,reminders:true,birthdays:true,birthdayHour:9}),/conexão/);assert.equal(f.whatsapp.verification(new URLSearchParams()),null);}finally{f.db.close();}
});
test('consentimentos separados, número internacional e histórico de alteração',()=>{
 assert.throws(()=>whatsappFields({whatsappNumber:'85999990001',whatsappAppointments:true}),/DDI/);
 assert.throws(()=>whatsappFields({whatsappBirthdays:true}),/número/);
 const c=whatsappFields({whatsappNumber:'+55 (85) 99999-0001',whatsappAppointments:true});assert.equal(c.whatsappNumber,'+5585999990001');assert.equal(c.whatsappBirthdays,false);
 const retained=whatsappFields({},c);assert.deepEqual(retained,c);
 const withdrawn=whatsappFields({whatsappAppointments:false},c,'self-account','2026-11-09T12:00:00Z');assert.equal(withdrawn.whatsappConsentSource,'self-account');
});
test('confirmação tem seis variáveis e botões, com deduplicação e aceite distinto de envio',async()=>{
 const f=fixture();try{const id=f.whatsapp.enqueueBooking('main',f.appointment);assert(id);assert.equal(f.whatsapp.enqueueBooking('main',f.appointment),null);await f.whatsapp.tick();assert.equal(f.requests.length,1);assert.equal(rows(f)[0].state,'accepted');assert.equal(f.requests[0].body.template.components[0].parameters.length,6);assert.equal(f.requests[0].body.template.components.length,4);assert(!JSON.stringify(f.requests[0].body).includes('SEGREDO INTERNO'));assert.match(f.requests[0].url,/graph\.facebook\.com\/v99\.0\/123456789\/messages$/);}finally{f.close();}
});
test('lembrete é criado somente na janela de antecedência e uma vez',async()=>{
 const f=fixture({settings:{reminders:true}});try{await f.whatsapp.tick();assert.equal(f.requests.length,1);assert.equal(rows(f)[0].kind,'reminder');await f.whatsapp.tick();assert.equal(f.requests.length,1);f.advance(25*3600000);await f.whatsapp.tick();assert.equal(f.requests.length,1);}finally{f.close();}
});
test('aniversário respeita horário e opt-in, sem expor benefício nem repetir no mesmo ano',async()=>{
 const f=fixture({settings:{birthdays:true,birthdayHour:10}});try{await f.whatsapp.tick();assert.equal(f.requests.length,0);f.advance(3600000);await f.whatsapp.tick();assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.template.components[0].parameters.length,2);assert(!JSON.stringify(f.requests[0].body).includes('SEGREDO INTERNO'));await f.whatsapp.tick();assert.equal(f.requests.length,1);f.advance(24*3600000);await f.whatsapp.tick();assert.equal(f.requests.length,1);}finally{f.close();}
});
test('retirada de autorização impede mensagens já enfileiradas',async()=>{
 const f=fixture();try{f.whatsapp.enqueueBooking('main',f.appointment);f.setClient({...f.client(),whatsappAppointments:false});await f.whatsapp.tick();assert.equal(f.requests.length,0);assert.equal(rows(f)[0].state,'skipped');}finally{f.close();}
});
test('cancelamento, remarcação e troca de número invalidam mensagens antigas',async()=>{
 for(const change of ['cancel','reschedule','number']){const f=fixture();try{f.whatsapp.enqueueBooking('main',f.appointment);if(change==='number')f.setClient({...f.client(),whatsappNumber:'+5585999999999'});else writeAppointment(f.db,'main',{...f.appointment,...(change==='cancel'?{status:'cancelled'}:{start:'10:00'})});await f.whatsapp.tick();assert.equal(f.requests.length,0);assert.equal(rows(f)[0].state,'skipped');}finally{f.close();}}
});
test('desativar pausa envios e o prazo impede lembretes atrasados',async()=>{
 const f=fixture();try{f.whatsapp.enqueueBooking('main',f.appointment);f.whatsapp.configure(f.user,{enabled:false,bookings:true,reminders:true,birthdays:true,birthdayHour:9});await f.whatsapp.tick();assert.equal(f.requests.length,0);f.advance(25*3600000);await f.whatsapp.tick();assert.equal(rows(f)[0].state,'skipped');}finally{f.close();}
});
test('timeout ou falha ambígua não provoca repetição automática',async()=>{
 let calls=0;const f=fixture({fetchImpl:async()=>{calls++;throw Error('token-sensitive-must-not-leak');}});try{f.whatsapp.enqueueBooking('main',f.appointment);await f.whatsapp.tick();await f.whatsapp.tick();assert.equal(calls,1);assert.equal(rows(f)[0].state,'unknown');assert(!JSON.stringify(rows(f)).includes('token-sensitive'));assert.throws(()=>f.whatsapp.retry(f.user,rows(f)[0].id),/incertos/);}finally{f.close();}
});
test('recusa da Meta é registrada sem expor resposta bruta e permite nova tentativa explícita',async()=>{
 const f=fixture({fetchImpl:async()=>({ok:false,status:400,json:async()=>({error:{code:132000,message:'secret-response'}})})});try{f.whatsapp.enqueueBooking('main',f.appointment);await f.whatsapp.tick();assert.equal(rows(f)[0].state,'failed');assert.match(rows(f)[0].error,/132000/);assert(!rows(f)[0].error.includes('secret'));f.whatsapp.retry(f.user,rows(f)[0].id);assert.equal(rows(f)[0].state,'queued');}finally{f.close();}
});
test('limite 429 tem novas tentativas limitadas',async()=>{
 let calls=0;const f=fixture({fetchImpl:async()=>{calls++;return {ok:false,status:429,json:async()=>({error:{code:130429}})}}});try{f.whatsapp.enqueueBooking('main',f.appointment);await f.whatsapp.tick();assert.equal(rows(f)[0].state,'queued');f.advance(61000);await f.whatsapp.tick();f.advance(121000);await f.whatsapp.tick();assert.equal(calls,3);assert.equal(rows(f)[0].state,'failed');}finally{f.close();}
});
test('webhooks exigem assinatura e não regridem entrega para enviado',async()=>{
 const f=fixture();try{f.whatsapp.enqueueBooking('main',f.appointment);await f.whatsapp.tick();assert.equal(f.whatsapp.handleWebhook(Buffer.from('{}'),'invalid'),false);const row=rows(f)[0],receipt=status=>({statuses:[{id:row.provider_id,status,recipient_id:row.recipient,timestamp:String(f.now()/1000)}]});assert(signed(f,receipt('delivered')));assert.equal(rows(f)[0].state,'delivered');signed(f,receipt('sent'));assert.equal(rows(f)[0].state,'delivered');signed(f,receipt('read'));assert.equal(rows(f)[0].state,'read');}finally{f.close();}
});
test('botão confirma apenas a reserva correspondente e trata repetição de webhook',async()=>{
 const f=fixture();try{f.whatsapp.enqueueBooking('main',f.appointment);await f.whatsapp.tick();const row=rows(f)[0],payload=f.requests[0].body.template.components[1].parameters[0].payload;
 const message={id:'inbound-1',from:row.recipient,type:'button',button:{payload},context:{id:row.provider_id}};
 signed(f,{messages:[{...message,from:'5585000000000'}]});assert.equal(readState(f.db,'main').appointments[0].status,'pending');
 signed(f,{messages:[{...message,id:'inbound-2'}]});signed(f,{messages:[{...message,id:'inbound-2'}]});assert.equal(readState(f.db,'main').appointments[0].status,'confirmed');assert.equal(f.db.prepare("SELECT count(*) AS n FROM audit WHERE action='whatsapp_confirm'").get().n,1);
 }finally{f.close();}
});
test('pedido de remarcação preserva horário e cancelamento exige botão válido',async()=>{
 const f=fixture();try{f.whatsapp.enqueueBooking('main',f.appointment);await f.whatsapp.tick();const row=rows(f)[0],components=f.requests[0].body.template.components;
 signed(f,{messages:[{id:'reschedule',from:row.recipient,type:'button',button:{payload:components[2].parameters[0].payload}}]});assert.equal(rows(f)[0].action_requested,'reschedule');assert.equal(readState(f.db,'main').appointments[0].start,'09:00');assert.equal(readState(f.db,'main').appointments[0].status,'pending');
 signed(f,{messages:[{id:'cancel',from:row.recipient,type:'button',button:{payload:components[3].parameters[0].payload}}]});assert.equal(readState(f.db,'main').appointments[0].status,'cancelled');
 }finally{f.close();}
});
test('SAIR retira as duas autorizações sem cancelar agendamento',()=>{
 const f=fixture();try{signed(f,{messages:[{id:'stop',from:'5585999990001',type:'text',text:{body:'SAIR'}}]});assert.equal(f.client().whatsappAppointments,false);assert.equal(f.client().whatsappBirthdays,false);assert.equal(readState(f.db,'main').appointments[0].status,'pending');}finally{f.close();}
});
test('rota HTTP verifica challenge e assinatura sem exigir sessão do aplicativo',async()=>{
 const f=fixture();await new Promise(r=>f.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+f.server.address().port;
 try{
  const query=new URLSearchParams({'hub.mode':'subscribe','hub.verify_token':config.verifyToken,'hub.challenge':'challenge-test'});
  const verified=await fetch(base+'/webhooks/whatsapp?'+query);assert.equal(verified.status,200);assert.equal(await verified.text(),'challenge-test');
  query.set('hub.verify_token','wrong');assert.equal((await fetch(base+'/webhooks/whatsapp?'+query)).status,403);
  const raw=JSON.stringify({object:'whatsapp_business_account',entry:[]}),signature='sha256='+createHmac('sha256',config.appSecret).update(raw).digest('hex');
  assert.equal((await fetch(base+'/webhooks/whatsapp',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature},body:raw})).status,200);
  assert.equal((await fetch(base+'/webhooks/whatsapp',{method:'POST',headers:{'Content-Type':'application/json'},body:raw})).status,403);
 }finally{await new Promise(r=>f.server.close(r));f.close();}
});
test('resposta de botão obsoleta não altera reserva remarcada',async()=>{
 const f=fixture();try{f.whatsapp.enqueueBooking('main',f.appointment);await f.whatsapp.tick();const row=rows(f)[0],payload=f.requests[0].body.template.components[3].parameters[0].payload;writeAppointment(f.db,'main',{...f.appointment,start:'10:00'});signed(f,{messages:[{id:'old-button',from:row.recipient,type:'button',button:{payload}}]});assert.equal(readState(f.db,'main').appointments[0].status,'pending');assert.equal(readState(f.db,'main').appointments[0].start,'10:00');}finally{f.close();}
});
