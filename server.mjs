import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {openDatabase,transaction,readState,writeAppointment,audit} from './database.mjs';
import {hashPassword,verifyPassword,passwordValid,safeUser,createSession,getSession,rateLimit} from './auth.mjs';
import {fail,text,email,validDate,birthDate,validateConfig} from './validation.mjs';
import {slots,saveAppointment} from './domain.mjs';
import {whatsappFields} from './whatsapp-fields.mjs';
import {createWhatsApp,appointmentFingerprint} from './whatsapp.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
const allowed=new Set(['/index.html','/styles.css','/app.js','/domain.mjs','/clients.mjs']);
const own=(u,a)=>u.role==='admin'||(u.role==='professional'?a.professionalId===u.professional_id:a.clientId===u.client_id);
export function createApp({dbPath=path.join(root,'data','invictus.sqlite'),secureCookies=false,whatsapp:waOptions={},startWorkers=false,publicOrigin=process.env.PUBLIC_ORIGIN||''}={}){
 const db=openDatabase(dbPath);
 const whatsapp=createWhatsApp(db,waOptions);
 let publicUrl=null;if(publicOrigin){publicUrl=new URL(publicOrigin);if(publicUrl.protocol!=='https:'||publicUrl.username||publicUrl.password||publicUrl.pathname!=='/'||publicUrl.search||publicUrl.hash)throw Error('PUBLIC_ORIGIN deve ser uma origem HTTPS, sem caminho.');}
 const cookie=(res,token,maxAge=43200)=>res.setHeader('Set-Cookie','invictus_session='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(secureCookies?'; Secure':''));
 const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 const admin=u=>{if(u.role!=='admin')fail('Acesso exclusivo do administrador.',403);};
 function scopedState(u){
  const s=readState(db,u.business_id);
  if(u.role==='admin')return s;
  s.appointments=s.appointments.filter(a=>own(u,a));s.waitlist=[];
  if(u.role==='client'){
   s.clients=s.clients.filter(c=>c.id===u.client_id).map(({birthdayBenefit,...c})=>c);
   s.professionals=s.professionals.filter(p=>p.status==='active'||s.appointments.some(a=>a.professionalId===p.id)).map(({id,name,role,status,serviceIds,open,close})=>({id,name,role,status,serviceIds,open,close,blocks:[]}));
  }else{
   s.professionals=s.professionals.filter(p=>p.id===u.professional_id);
   const clients=new Set(s.appointments.map(a=>a.clientId));s.clients=s.clients.filter(c=>clients.has(c.id)).map(({birthDate,birthdayBenefit,whatsappConsentAt,whatsappConsentSource,...c})=>c);
   s.services=s.services.filter(v=>s.professionals[0]?.serviceIds.includes(v.id)||s.appointments.some(a=>a.serviceId===v.id));
  }return s;
 }
 function authenticate(req){const u=getSession(db,req);if(!u)fail('Entre na sua conta para continuar.',401);return u;}
 function loginResult(req,res,u){const old=getSession(db,req);if(old)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(old.token_hash);const session=createSession(db,u.id);cookie(res,session.token);send(res,200,{user:safeUser(u),csrf:session.csrf});}
 async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>262144)fail('Requisição muito grande.',413);}try{const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v;}catch{fail('JSON inválido.');}}
 async function api(req,res,url){
  const route=url.pathname,method=req.method;
  let host;try{host=new URL('http://'+req.headers.host);}catch{fail('Host inválido.',403);}
  if(!['127.0.0.1','localhost','[::1]'].includes(host.hostname)&&host.host!==publicUrl?.host)fail('Host não autorizado.',403);
  const write=!['GET','HEAD'].includes(method);
  if(write){
   const expected=host.host===publicUrl?.host?publicUrl.origin:(secureCookies?'https:':'http:')+'//'+req.headers.host;
   if(req.headers.origin!==expected)fail('Origem da requisição não autorizada.',403);
   if(!req.headers['content-type']?.startsWith('application/json'))fail('Envie JSON.',415);
  }
  if(route==='/api/auth/status'&&method==='GET'){send(res,200,{needsSetup:!db.prepare('SELECT id FROM users LIMIT 1').get(),authenticated:Boolean(getSession(db,req))});return;}
  if(['/api/auth/setup','/api/auth/register','/api/auth/login'].includes(route)&&method==='POST'){
   const input=await body(req),address=req.socket.remoteAddress;
   if(!rateLimit(db,'auth-ip:'+address,100))fail('Muitas tentativas. Aguarde 15 minutos.',429);
   const loginEmail=email(input.email);
   if(!rateLimit(db,'auth-account:'+address+':'+loginEmail))fail('Muitas tentativas. Aguarde 15 minutos.',429);
   if(route.endsWith('/login')){
    if(typeof input.password!=='string'||input.password.length>128)fail('E-mail ou senha inválidos.',401);
    const u=db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(loginEmail);
    const valid=await verifyPassword(input.password,u?.password_hash||('scrypt$00000000000000000000000000000000$'+'00'.repeat(64)));
    if(!u||!valid)fail('E-mail ou senha inválidos.',401);
    loginResult(req,res,u);return;
   }
   if(!passwordValid(input.password))fail('Use uma senha de 12 a 128 caracteres.');
   const name=text(input.name,'nome',100),hash=await hashPassword(input.password),id=randomUUID(),isSetup=route.endsWith('/setup');
   transaction(db,()=>{
    const exists=db.prepare('SELECT id FROM users LIMIT 1').get();
    if(isSetup&&exists)fail('A configuração inicial já foi concluída.',409);
    if(!isSetup&&!exists)fail('Configure primeiro a conta administradora.',409);
    if(db.prepare('SELECT id FROM users WHERE email=?').get(loginEmail))fail('Não foi possível cadastrar esse e-mail.',409);
    let clientId=null;
    if(isSetup){const b=readState(db,'main').business;b.name=text(input.businessName,'nome do estabelecimento',90);db.prepare('UPDATE businesses SET data=? WHERE id=?').run(JSON.stringify(b),'main');}
    else{let wa;try{wa=whatsappFields(input,{},'self-registration');}catch(error){fail(error.message);}clientId=randomUUID();db.prepare('INSERT INTO clients(id,business_id,data) VALUES(?,?,?)').run(clientId,'main',JSON.stringify({id:clientId,name,phone:text(input.phone||'','telefone',30,false),birthDate:birthDate(input.birthDate),birthdayBenefit:'',...wa}));}
    db.prepare('INSERT INTO users(id,business_id,name,email,password_hash,role,client_id) VALUES(?,?,?,?,?,?,?)').run(id,'main',name,loginEmail,hash,isSetup?'admin':'client',clientId);
    audit(db,{id,business_id:'main'},isSetup?'setup':'register',id);
   });
   loginResult(req,res,db.prepare('SELECT * FROM users WHERE id=?').get(id));return;
  }
  const user=authenticate(req);
  if(write&&req.headers['x-csrf-token']!==user.csrf)fail('Sua sessão precisa ser atualizada. Recarregue a página.',403);
  if(route==='/api/auth/me'&&method==='GET'){send(res,200,{user:safeUser(user),csrf:user.csrf});return;}
  if(route==='/api/auth/logout'&&method==='POST'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.token_hash);cookie(res,'',0);send(res,200,{ok:true});return;}
  if(route==='/api/account/password'&&method==='POST'){
   if(!rateLimit(db,'password:'+user.id))fail('Muitas tentativas. Aguarde 15 minutos.',429);
   const input=await body(req);
   if(typeof input.currentPassword!=='string'||input.currentPassword.length>128||!await verifyPassword(input.currentPassword,user.password_hash))fail('Senha atual incorreta.');
   if(!passwordValid(input.password))fail('Use uma senha de 12 a 128 caracteres.');
   const hash=await hashPassword(input.password);
   transaction(db,()=>{db.prepare('UPDATE users SET password_hash=?,must_change=0 WHERE id=?').run(hash,user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);audit(db,user,'password_changed',user.id);});
   loginResult(req,res,db.prepare('SELECT * FROM users WHERE id=?').get(user.id));return;
  }
  if(user.must_change)fail('Altere sua senha temporária antes de continuar.',403);
  if(route==='/api/state'&&method==='GET'){send(res,200,scopedState(user));return;}
  if(route==='/api/whatsapp'&&method==='GET'){admin(user);send(res,200,{...whatsapp.status(user.business_id),messages:whatsapp.history(user.business_id)});return;}
  if(route==='/api/whatsapp'&&method==='PUT'){admin(user);const input=await body(req);let result;try{result=whatsapp.configure(user,input);}catch(error){fail(error.message);}send(res,200,result);return;}
  if(route==='/api/whatsapp/process'&&method==='POST'){admin(user);await whatsapp.tick();send(res,200,{...whatsapp.status(user.business_id),messages:whatsapp.history(user.business_id)});return;}
  if(/^\/api\/whatsapp\/[^/]+\/retry$/.test(route)&&method==='POST'){admin(user);try{whatsapp.retry(user,route.split('/')[3]);}catch(error){fail(error.message,409);}send(res,200,{ok:true});return;}
  if(route==='/api/account/whatsapp'&&method==='PUT'){
   if(user.role!=='client')fail('Acesso exclusivo do cliente.',403);const input=await body(req);
   transaction(db,()=>{const c=readState(db,user.business_id).clients.find(c=>c.id===user.client_id);if(!c)fail('Cadastro não encontrado.',404);let wa;try{wa=whatsappFields(input,c,'self-account');}catch(error){fail(error.message);}Object.assign(c,wa);db.prepare('UPDATE clients SET data=? WHERE id=? AND business_id=?').run(JSON.stringify(c),c.id,user.business_id);audit(db,user,'whatsapp_consent_updated',c.id);});send(res,200,{ok:true});return;
  }
  if(route==='/api/admin/state'&&method==='PUT'){
   admin(user);const input=await body(req);
   transaction(db,()=>{
    const current=readState(db,user.business_id),v=validateConfig(input,current);
    for(const table of ['clients','services','professionals','waitlist'])for(const item of v[table]){
     const other=db.prepare('SELECT business_id FROM '+table+' WHERE id=?').get(item.id);if(other&&other.business_id!==user.business_id)fail('Identificador não disponível.',409);
     db.prepare('INSERT INTO '+table+'(id,business_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(item.id,user.business_id,JSON.stringify(item));
    }
    for(const row of current.waitlist)if(!v.waitlist.some(x=>x.id===row.id))db.prepare('DELETE FROM waitlist WHERE id=? AND business_id=?').run(row.id,user.business_id);
    db.prepare('UPDATE businesses SET data=? WHERE id=?').run(JSON.stringify(v.business),user.business_id);audit(db,user,'configuration_updated');
   });send(res,200,scopedState(user));return;
  }
  if(route==='/api/availability'&&method==='GET'){
   const s=readState(db,user.business_id),serviceId=url.searchParams.get('serviceId'),professionalId=url.searchParams.get('professionalId'),date=url.searchParams.get('date'),ignoreId=url.searchParams.get('ignoreId')||undefined;
   const clientId=user.role==='client'?user.client_id:url.searchParams.get('clientId');
   if(!validDate(date))fail('Data inválida.');
   if(user.role==='professional'&&professionalId!==user.professional_id)fail('Você só pode consultar sua agenda.',403);
   if(ignoreId){const a=s.appointments.find(a=>a.id===ignoreId);if(!a||!own(user,a))fail('Atendimento não encontrado.',404);}
   send(res,200,{slots:slots(s,serviceId,professionalId,date,ignoreId,clientId)});return;
  }
  if((route==='/api/appointments'&&method==='POST')||(/^\/api\/appointments\/[^/]+$/.test(route)&&method==='PUT')){
   if(user.role==='professional')fail('A criação e a remarcação são feitas pelo cliente ou administrador.',403);
   const input=await body(req),id=method==='PUT'?route.split('/').pop():undefined;
   const result=transaction(db,()=>{
    const s=readState(db,user.business_id);
    const previousSnapshot=id?s.appointments.find(a=>a.id===id):null;
    if(id){const previous=s.appointments.find(a=>a.id===id);if(!previous||!own(user,previous))fail('Atendimento não encontrado.',404);}
    const a={clientId:user.role==='client'?user.client_id:text(input.clientId,'cliente',80),serviceId:text(input.serviceId,'serviço',80),professionalId:text(input.professionalId,'profissional',80),date:text(input.date,'data',10),start:text(input.start,'horário',5)};
    let appointment;try{appointment=saveAppointment(s,a,id);}catch(error){fail(error.message,409);}
    writeAppointment(db,user.business_id,appointment);audit(db,user,id?'appointment_rescheduled':'appointment_created',appointment.id);
    if(!previousSnapshot||appointmentFingerprint(previousSnapshot)!==appointmentFingerprint(appointment))whatsapp.enqueueBooking(user.business_id,appointment,Date.now(),'rev-'+(s.revision+1));
    return appointment;
   });send(res,method==='POST'?201:200,result);return;
  }
  if(/^\/api\/appointments\/[^/]+\/(confirm|cancel|late)$/.test(route)&&method==='POST'){
   const parts=route.split('/'),id=parts[3],action=parts[4];
   if(user.role==='professional')fail('Esta ação é feita pelo cliente ou administrador.',403);
   transaction(db,()=>{
    const a=readState(db,user.business_id).appointments.find(a=>a.id===id);
    if(!a||!own(user,a))fail('Atendimento não encontrado.',404);
    if(a.status==='cancelled')fail('Este atendimento já foi cancelado.',409);
    if(action==='cancel')a.status='cancelled';else if(action==='confirm')a.status='confirmed';else a.late=true;
    writeAppointment(db,user.business_id,a);audit(db,user,'appointment_'+action,a.id);
   });send(res,200,{ok:true});return;
  }
  if(route==='/api/professional/status'&&method==='POST'){
   if(user.role!=='professional')fail('Acesso exclusivo do profissional.',403);
   const input=await body(req);if(!['active','absent'].includes(input.status))fail('Situação inválida.');
   transaction(db,()=>{const s=readState(db,user.business_id),p=s.professionals.find(p=>p.id===user.professional_id);if(!p)fail('Cadastro não encontrado.',404);if(p.status==='inactive')fail('Procure o administrador para reativar o cadastro.',403);p.status=input.status;db.prepare('UPDATE professionals SET data=? WHERE id=? AND business_id=?').run(JSON.stringify(p),p.id,user.business_id);audit(db,user,'professional_status',p.id);});send(res,200,{ok:true});return;
  }
  if(route==='/api/users'&&method==='GET'){admin(user);send(res,200,{users:db.prepare('SELECT * FROM users WHERE business_id=? ORDER BY name').all(user.business_id).map(safeUser)});return;}
  if(route==='/api/users'&&method==='POST'){
   admin(user);const input=await body(req),role=input.role;
   if(!['professional','client'].includes(role))fail('Escolha profissional ou cliente.');
   const loginEmail=email(input.email),referenceId=text(input.referenceId,'cadastro vinculado',80);
   if(!passwordValid(input.password))fail('Use uma senha temporária de 12 a 128 caracteres.');
   const hash=await hashPassword(input.password),id=randomUUID();
   transaction(db,()=>{
    const table=role==='professional'?'professionals':'clients',record=db.prepare('SELECT data FROM '+table+' WHERE id=? AND business_id=?').get(referenceId,user.business_id);
    if(!record)fail('Cadastro vinculado não encontrado.',404);
    if(db.prepare('SELECT id FROM users WHERE email=? OR professional_id=? OR client_id=?').get(loginEmail,referenceId,referenceId))fail('E-mail ou cadastro já possui uma conta.',409);
    db.prepare('INSERT INTO users(id,business_id,name,email,password_hash,role,professional_id,client_id,must_change) VALUES(?,?,?,?,?,?,?,?,1)').run(id,user.business_id,JSON.parse(record.data).name,loginEmail,hash,role,role==='professional'?referenceId:null,role==='client'?referenceId:null);
    audit(db,user,'user_created',id);
   });send(res,201,{ok:true});return;
  }
  fail('Recurso não encontrado.',404);
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/webhooks/whatsapp'){
    if(req.method==='GET'){const challenge=whatsapp.verification(url.searchParams);if(challenge===null){send(res,403,{error:'Verificação recusada.'});return;}res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});res.end(challenge);return;}
    if(req.method==='POST'){
     const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>1048576)fail('Payload muito grande.',413);chunks.push(chunk);}
     let valid;try{valid=whatsapp.handleWebhook(Buffer.concat(chunks),req.headers['x-hub-signature-256']);}catch(error){if(error instanceof SyntaxError)fail('JSON inválido.');throw error;}
     send(res,valid?200:403,valid?{ok:true}:{error:'Assinatura inválida.'});return;
    }send(res,405,{error:'Método não permitido.'});return;
   }
   if(url.pathname.startsWith('/api/')){await api(req,res,url);return;}
   const file=url.pathname==='/'?'/index.html':url.pathname;
   if(!allowed.has(file)||!['GET','HEAD'].includes(req.method)){send(res,404,{error:'Não encontrado.'});return;}
   const content=await readFile(path.join(root,file));res.writeHead(200,{'Content-Type':types[path.extname(file)]});res.end(req.method==='HEAD'?undefined:content);
  }catch(error){
   const conflict=error.message.includes('appointment_overlap'),status=error.status||(conflict?409:500);
   if(status===500)console.error('Falha interna:',error.code||error.name);
   send(res,status,{error:conflict?'Este horário já está ocupado. Escolha outro horário.':status===500?'Não foi possível concluir a operação. Tente novamente.':error.message});
  }
 });
 if(startWorkers)whatsapp.start();
 server.on('close',()=>whatsapp.stop().catch(()=>{}));
 return {server,db,whatsapp};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 if(existsSync(path.join(root,'.env')))loadEnvFile(path.join(root,'.env'));
 const {server,db,whatsapp}=createApp({dbPath:process.env.DB_PATH||path.join(root,'data','invictus.sqlite'),secureCookies:process.env.COOKIE_SECURE==='1',startWorkers:true});
 server.listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Invictus Beauty: http://127.0.0.1:'+server.address().port));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await whatsapp.stop();server.close(()=>{db.close();process.exit(0);});});
}

