import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';
import {seed,localDate} from '../domain.mjs';
import {readState,transaction,writeAppointment} from '../database.mjs';

let directory,app,second,base,base2,admin,alice,bob,pro,appointmentId;
const password='Senha apenas teste 2026!';
const newPassword='Outra senha para teste 2026!';
const future=new Date();future.setDate(future.getDate()+8);
const date=localDate(future);
async function request(route,{method='GET',data,auth,origin,csrf=true,url=base}={}){
 const headers={};if(method!=='GET'){headers['Content-Type']='application/json';headers.Origin=origin||url;if(csrf)headers['X-CSRF-Token']=auth?.csrf||'';}
 if(auth?.cookie)headers.Cookie=auth.cookie;
 const response=await fetch(url+route,{method,headers,...(data!==undefined?{body:JSON.stringify(data)}:{})});
 const result=await response.json();return {status:response.status,data:result,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
}
const asAuth=r=>({cookie:r.cookie,csrf:r.data.csrf,user:r.data.user});
const booking=(start='10:00')=>({serviceId:'cut',professionalId:'lucas',date,start});
before(async()=>{
 directory=await mkdtemp(path.join(tmpdir(),'invictus-api-'));
 app=createApp({dbPath:path.join(directory,'test.sqlite')});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;
});
after(async()=>{if(second){await new Promise(r=>second.server.close(r));second.db.close();}await new Promise(r=>app.server.close(r));app.db.close();await rm(directory,{recursive:true,force:true});});

test('API exige login e arquivos privados não são servidos',async()=>{
 assert.equal((await request('/api/state')).status,401);
 for(const route of ['/data/invictus.sqlite','/auth.mjs','/database.mjs','/.env','/docs/ESCOPO.md'])assert.equal((await request(route)).status,404);
 assert.equal((await request('/api/auth/status')).data.needsSetup,true);
});
test('primeiro administrador, senha derivada e cookie seguro para sessão local',async()=>{
 const result=await request('/api/auth/setup',{method:'POST',data:{name:'Administrador',businessName:'Salão de testes',email:'admin@example.test',password}});
 assert.equal(result.status,200);admin=asAuth(result);assert.equal(admin.user.role,'admin');
 assert.match(result.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 const u=app.db.prepare('SELECT password_hash FROM users WHERE id=?').get(admin.user.id);assert.notEqual(u.password_hash,password);assert.match(u.password_hash,/^scrypt\$/);
 assert.equal((await request('/api/auth/setup',{method:'POST',data:{name:'Intruso',businessName:'Outro',email:'intruso@example.test',password}})).status,409);
 assert.equal((await request('/api/auth/login',{method:'POST',data:{email:'admin@example.test',password:'senha incorreta'}})).status,401);
});
test('cadastro público sempre cria cliente e não permite escolher privilégios',async()=>{
 const a=await request('/api/auth/register',{method:'POST',data:{name:'Alice',email:'alice@example.test',password,role:'admin',clientId:'pedro',birthDate:'2000-02-29',birthdayBenefit:'Benefício não autorizado'}});
 assert.equal(a.status,200);alice=asAuth(a);assert.equal(alice.user.role,'client');assert.notEqual(alice.user.clientId,'pedro');
 bob=asAuth(await request('/api/auth/register',{method:'POST',data:{name:'Bob',email:'bob@example.test',password}}));
});
test('configurações são gravadas em transação e rejeitam versões antigas ou inválidas',async()=>{
 const current=(await request('/api/state',{auth:admin})).data,fixture=seed();
 const config={...current,services:fixture.services,professionals:fixture.professionals,clients:[...current.clients,...fixture.clients],business:{...current.business,days:[0,1,2,3,4,5,6]}};
 const saved=await request('/api/admin/state',{method:'PUT',data:config,auth:admin});assert.equal(saved.status,200);
 assert.equal((await request('/api/admin/state',{method:'PUT',data:config,auth:admin})).status,409);
 const invalid=structuredClone(saved.data);invalid.services[0].duration=-1;
 assert.equal((await request('/api/admin/state',{method:'PUT',data:invalid,auth:admin})).status,400);
 assert.equal((await request('/api/admin/state',{method:'PUT',data:saved.data,auth:alice})).status,403);
 assert.equal((await request('/api/users',{auth:alice})).status,403);
});
test('origem externa e ausência de CSRF são rejeitadas',async()=>{
 assert.equal((await request('/api/appointments',{method:'POST',data:booking(),auth:alice,origin:'https://evil.example'})).status,403);
 assert.equal((await request('/api/appointments',{method:'POST',data:booking(),auth:alice,csrf:false})).status,403);
});
test('central WhatsApp é administrativa e não permite ativação sem conexão',async()=>{
 const status=await request('/api/whatsapp',{auth:admin});assert.equal(status.status,200);assert.equal(status.data.ready,false);assert.equal(status.data.settings.enabled,false);
 assert.equal((await request('/api/whatsapp',{auth:alice})).status,403);
 assert.equal((await request('/api/whatsapp',{method:'PUT',auth:admin,data:{enabled:true,bookings:true,reminders:true,birthdays:true,birthdayHour:9}})).status,400);
 assert.equal((await request('/api/whatsapp/process',{method:'POST',auth:alice,data:{}})).status,403);
 assert(!JSON.stringify(status.data).includes('appSecret'));assert(!JSON.stringify(status.data).includes('accessToken'));
});
test('cliente atualiza somente a própria autorização e pode retirá-la',async()=>{
 const enabled=await request('/api/account/whatsapp',{method:'PUT',auth:alice,data:{clientId:bob.user.clientId,whatsappNumber:'+5585999992222',whatsappAppointments:true,whatsappBirthdays:false}});assert.equal(enabled.status,200);
 let s=readState(app.db,'main');assert.equal(s.clients.find(c=>c.id===alice.user.clientId).whatsappAppointments,true);assert.equal(Boolean(s.clients.find(c=>c.id===bob.user.clientId).whatsappAppointments),false);
 const changed=await request('/api/account/whatsapp',{method:'PUT',auth:alice,data:{whatsappAppointments:false}});assert.equal(changed.status,200);
 s=readState(app.db,'main');assert.equal(s.clients.find(c=>c.id===alice.user.clientId).whatsappAppointments,false);
 assert.equal((await request('/api/account/whatsapp',{method:'PUT',auth:admin,data:{whatsappAppointments:true}})).status,403);
});
test('aniversário e planejamento são persistidos; nota interna não é exposta ao cliente',async()=>{
 const current=(await request('/api/state',{auth:admin})).data;
 const c=current.clients.find(c=>c.id===alice.user.clientId);assert.equal(c.birthDate,'2000-02-29');assert.equal(c.birthdayBenefit,'');
 c.birthdayBenefit='Hidratação de aniversário';
 const saved=await request('/api/admin/state',{method:'PUT',data:current,auth:admin});assert.equal(saved.status,200);
 assert.equal(readState(app.db,'main').clients.find(c=>c.id===alice.user.clientId).birthdayBenefit,'Hidratação de aniversário');
 const own=(await request('/api/state',{auth:alice})).data.clients[0];assert.equal(own.birthDate,'2000-02-29');assert.equal('birthdayBenefit' in own,false);
 const invalid=structuredClone(saved.data);invalid.clients[0].birthDate='2001-02-29';
 assert.equal((await request('/api/admin/state',{method:'PUT',data:invalid,auth:admin})).status,400);
 assert.equal(readState(app.db,'main').clients.find(c=>c.id===alice.user.clientId).birthDate,'2000-02-29');
 const bad=await request('/api/auth/register',{method:'POST',data:{name:'Inválido',email:'bad-birthday@example.test',password,birthDate:'2999-01-01'}});assert.equal(bad.status,400);
 assert.equal(app.db.prepare('SELECT id FROM users WHERE email=?').get('bad-birthday@example.test'),undefined);
});
test('cliente reserva apenas para si; duração, preço e confirmação vêm do servidor',async()=>{
 const r=await request('/api/appointments',{method:'POST',data:{...booking(),clientId:bob.user.clientId,duration:1,price:0,status:'confirmed'},auth:alice});
 assert.equal(r.status,201);appointmentId=r.data.id;assert.equal(r.data.clientId,alice.user.clientId);assert.equal(r.data.duration,30);assert.equal(r.data.price,45);assert.equal(r.data.status,'pending');
 const own=(await request('/api/state',{auth:alice})).data;assert.equal(own.appointments.length,1);assert.deepEqual(own.clients.map(c=>c.id),[alice.user.clientId]);assert(own.professionals.every(p=>p.blocks.length===0));
 const other=(await request('/api/state',{auth:bob})).data;assert.equal(other.appointments.length,0);assert(!JSON.stringify(other).includes('Alice'));
});
test('outro cliente não confirma, cancela ou remarca a reserva alheia',async()=>{
 for(const action of ['confirm','cancel','late'])assert.equal((await request('/api/appointments/'+appointmentId+'/'+action,{method:'POST',data:{},auth:bob})).status,404);
 assert.equal((await request('/api/appointments/'+appointmentId,{method:'PUT',data:booking('11:00'),auth:bob})).status,404);
 assert.equal((await request('/api/availability?'+new URLSearchParams({...booking(),ignoreId:appointmentId}),{auth:bob})).status,404);
});
test('remarcação falha preserva reserva; atraso e falta de confirmação não liberam vaga',async()=>{
 const occupied=await request('/api/appointments',{method:'POST',data:booking('11:00'),auth:bob});assert.equal(occupied.status,201);
 assert.equal((await request('/api/appointments/'+appointmentId,{method:'PUT',data:booking('11:00'),auth:alice})).status,409);
 assert.equal((await request('/api/appointments/'+appointmentId+'/late',{method:'POST',data:{},auth:alice})).status,200);
 assert.equal((await request('/api/appointments',{method:'POST',data:booking(),auth:bob})).status,409);
 const row=readState(app.db,'main').appointments.find(a=>a.id===appointmentId);assert.equal(row.start,'10:00');assert.equal(row.status,'pending');assert.equal(row.late,true);
});
test('duas conexões HTTP para o mesmo banco: uma única reserva para a vaga',async()=>{
 second=createApp({dbPath:path.join(directory,'test.sqlite')});await new Promise(r=>second.server.listen(0,'127.0.0.1',r));base2='http://127.0.0.1:'+second.server.address().port;
 const results=await Promise.all([request('/api/appointments',{method:'POST',data:booking('14:00'),auth:alice}),request('/api/appointments',{method:'POST',data:booking('14:00'),auth:bob,url:base2})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(readState(second.db,'main').appointments.filter(a=>a.start==='14:00').length,1);
});
test('banco também rejeita sobreposição por escrita direta',()=>{
 const s=readState(app.db,'main'),a=s.appointments.find(a=>a.id===appointmentId);
 assert.throws(()=>transaction(second.db,()=>writeAppointment(second.db,'main',{...a,id:'collision-direct'})),/appointment_overlap/);
 assert.equal(app.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('remarcação válida move a reserva no banco sem duplicá-la',async()=>{
 const before=readState(app.db,'main').appointments.length;
 const moved=await request('/api/appointments/'+appointmentId,{method:'PUT',auth:alice,data:booking('10:30')});
 assert.equal(moved.status,200);assert.equal(moved.data.id,appointmentId);assert.equal(moved.data.start,'10:30');
 assert.equal(readState(second.db,'main').appointments.length,before);
 assert.equal((await request('/api/appointments/'+appointmentId,{method:'PUT',auth:alice,data:booking()})).status,200);
});
test('acesso profissional exige troca de senha e só permite a própria agenda',async()=>{
 assert.equal((await request('/api/users',{method:'POST',auth:admin,data:{email:'lucas@example.test',role:'professional',referenceId:'lucas',password}})).status,201);
 const login=await request('/api/auth/login',{method:'POST',data:{email:'lucas@example.test',password}});pro=asAuth(login);assert.equal(pro.user.mustChange,true);
 assert.equal((await request('/api/state',{auth:pro})).status,403);
 const changed=await request('/api/account/password',{method:'POST',auth:pro,data:{currentPassword:password,password:newPassword}});assert.equal(changed.status,200);const old=pro;pro=asAuth(changed);
 assert.equal((await request('/api/auth/me',{auth:old})).status,401);
 const s=(await request('/api/state',{auth:pro})).data;assert(s.appointments.every(a=>a.professionalId==='lucas'));assert.deepEqual(s.professionals.map(p=>p.id),['lucas']);assert(s.clients.every(c=>!('birthDate' in c)&&!('birthdayBenefit' in c)));
 assert.equal((await request('/api/appointments',{method:'POST',data:booking('15:00'),auth:pro})).status,403);
 assert.equal((await request('/api/users',{auth:pro})).status,403);
 assert.equal((await request('/api/admin/state',{method:'PUT',data:s,auth:pro})).status,403);
 assert.equal((await request('/api/professional/status',{method:'POST',auth:pro,data:{status:'absent'}})).status,200);
 assert.equal((await request('/api/appointments',{method:'POST',data:booking('15:00'),auth:alice})).status,409);
 assert.equal((await request('/api/professional/status',{method:'POST',auth:pro,data:{status:'active'}})).status,200);
});
test('confirmação e cancelamento persistem e logout revoga a sessão',async()=>{
 assert.equal((await request('/api/appointments/'+appointmentId+'/confirm',{method:'POST',auth:alice,data:{}})).status,200);
 assert.equal(readState(second.db,'main').appointments.find(a=>a.id===appointmentId).status,'confirmed');
 assert.equal((await request('/api/appointments/'+appointmentId+'/cancel',{method:'POST',auth:alice,data:{}})).status,200);
 assert.equal((await request('/api/appointments',{method:'POST',data:booking(),auth:bob})).status,201);
 assert.equal((await request('/api/auth/logout',{method:'POST',auth:alice,data:{}})).status,200);
 assert.equal((await request('/api/state',{auth:alice})).status,401);
});
test('dados e sessão sobrevivem ao fechamento e reabertura do banco',async()=>{
 await new Promise(r=>second.server.close(r));second.db.close();
 second=createApp({dbPath:path.join(directory,'test.sqlite')});await new Promise(r=>second.server.listen(0,'127.0.0.1',r));base2='http://127.0.0.1:'+second.server.address().port;
 const s=await request('/api/state',{auth:admin,url:base2});assert.equal(s.status,200);assert(s.data.appointments.length>=4);assert.equal(s.data.business.name,'Salão de testes');
});
test('sessão expirada não dá acesso e APIs não retornam hashes ou credenciais',async()=>{
 const login=await request('/api/auth/login',{method:'POST',data:{email:'bob@example.test',password}}),temporary=asAuth(login);
 app.db.prepare('UPDATE sessions SET expires=? WHERE user_id=?').run(Date.now()-1,bob.user.id);
 assert.equal((await request('/api/state',{auth:temporary})).status,401);
 const users=await request('/api/users',{auth:admin});assert.equal(users.status,200);
 assert(!JSON.stringify(users.data).includes('password_hash'));assert(!JSON.stringify(users.data).includes('scrypt$'));
});
test('limite de tentativas protege login sem expor contas existentes',async()=>{
 let result;for(let i=0;i<16;i++)result=await request('/api/auth/login',{method:'POST',data:{email:'inexistente@example.test',password:'incorreta'}});
 assert.equal(result.status,429);
});
