import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {hashPassword,verifyPassword,createSession,digest,getSession} from '../auth.mjs';
import {issueAdminRecovery,inspectRecovery,completeAdminRecovery} from '../recovery.mjs';
const previous='Senha antiga apenas para teste!';
const next='Nova senha apenas para teste!';
async function fixture(){
 const app=createApp({dbPath:':memory:'}),hash=await hashPassword(previous);
 app.db.prepare("INSERT INTO users(id,business_id,name,email,password_hash,role) VALUES('owner','main','Dono','owner@example.test',?,'admin')").run(hash);
 app.db.prepare('INSERT INTO clients(id,business_id,data) VALUES(?,?,?)').run('customer','main',JSON.stringify({id:'customer',name:'Cliente',phone:''}));
 app.db.prepare("INSERT INTO users(id,business_id,name,email,password_hash,role,client_id) VALUES('customer','main','Cliente','customer@example.test',?,'client','customer')").run(hash);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;
 async function post(route,data,headers={}){const res=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...headers},body:JSON.stringify(data)});return {status:res.status,data:await res.json()};}
 return {...app,post,close:async()=>{await new Promise(r=>app.server.close(r));app.db.close();}};
}
test('convite só é emitido para administrador existente e guarda apenas hash do segredo',async()=>{
 const f=await fixture();try{
  assert.throws(()=>issueAdminRecovery(f.db,'customer@example.test'),/administradora/);
  const invite=issueAdminRecovery(f.db),stored=f.db.prepare('SELECT * FROM admin_recovery').get();
  assert.equal(invite.email,'owner@example.test');assert.equal(stored.token_hash,digest(invite.token));assert.notEqual(stored.token_hash,invite.token);
  assert.equal(f.db.prepare('SELECT count(*) n FROM users').get().n,2);
  const result=await f.post('/api/auth/admin-recovery/inspect',{token:invite.token});assert.equal(result.status,200);assert.equal(result.data.email,'owner@example.test');assert.equal('password_hash' in result.data,false);assert.equal('token' in result.data,false);
 }finally{await f.close();}
});
test('link vencido, inválido ou usado não revela conta nem autoriza troca',async()=>{
 const f=await fixture();try{
  const invite=issueAdminRecovery(f.db,undefined,Date.now()-31*60*1000);
  assert.throws(()=>inspectRecovery(f.db,invite.token),/expirado/);
  for(const token of [invite.token,'invalid','']){const res=await f.post('/api/auth/admin-recovery/inspect',{token});assert.equal(res.status,400);assert.equal(res.data.email,undefined);}
  assert(await verifyPassword(previous,f.db.prepare("SELECT password_hash FROM users WHERE id='owner'").get().password_hash));
 }finally{await f.close();}
});
test('redefinição preserva perfil e dados, troca senha e revoga todas as sessões da conta',async()=>{
 const f=await fixture();try{
  const session=createSession(f.db,'owner'),other=createSession(f.db,'customer'),invite=issueAdminRecovery(f.db);
  const before=f.db.prepare("SELECT data FROM clients WHERE id='customer'").get().data;
  const res=await f.post('/api/auth/admin-recovery/complete',{token:invite.token,password:next});assert.equal(res.status,200);
  const owner=f.db.prepare("SELECT * FROM users WHERE id='owner'").get();assert.equal(owner.role,'admin');assert.equal(owner.email,'owner@example.test');assert(await verifyPassword(next,owner.password_hash));assert(!await verifyPassword(previous,owner.password_hash));
  assert.equal(getSession(f.db,{headers:{cookie:'invictus_session='+session.token}}),undefined);
  assert.equal(getSession(f.db,{headers:{cookie:'invictus_session='+other.token}}).id,'customer');
  assert.equal(f.db.prepare("SELECT data FROM clients WHERE id='customer'").get().data,before);
  assert.equal((await f.post('/api/auth/admin-recovery/complete',{token:invite.token,password:previous})).status,400);
 }finally{await f.close();}
});
test('duas tentativas simultâneas com o mesmo convite permitem uma única troca',async()=>{
 const f=await fixture();try{
  const invite=issueAdminRecovery(f.db);
  const results=await Promise.allSettled([completeAdminRecovery(f.db,invite.token,next),completeAdminRecovery(f.db,invite.token,next+'2')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit WHERE action='admin_password_recovered'").get().n,1);
 }finally{await f.close();}
});
test('senha fraca não consome convite e origem externa é recusada',async()=>{
 const f=await fixture();try{
  const invite=issueAdminRecovery(f.db);
  assert.equal((await f.post('/api/auth/admin-recovery/complete',{token:invite.token,password:'123'})).status,400);
  assert.equal((await f.post('/api/auth/admin-recovery/complete',{token:invite.token,password:next},{Origin:'https://evil.example'})).status,403);
  assert.equal(inspectRecovery(f.db,invite.token).email,'owner@example.test');
 }finally{await f.close();}
});
test('novo convite invalida o anterior sem alterar senha nem sessão antes da escolha do usuário',async()=>{
 const f=await fixture();try{
  const session=createSession(f.db,'owner'),first=issueAdminRecovery(f.db),second=issueAdminRecovery(f.db);
  assert.throws(()=>inspectRecovery(f.db,first.token));assert.equal(inspectRecovery(f.db,second.token).user_id,'owner');
  assert.equal(getSession(f.db,{headers:{cookie:'invictus_session='+session.token}}).id,'owner');assert(await verifyPassword(previous,f.db.prepare("SELECT password_hash FROM users WHERE id='owner'").get().password_hash));
  f.db.prepare("UPDATE users SET active=0 WHERE id='owner'").run();assert.throws(()=>inspectRecovery(f.db,second.token));
 }finally{await f.close();}
});
test('mudança normal de senha invalida o convite privado pendente',async()=>{
 const f=await fixture();try{
  const session=createSession(f.db,'owner'),invite=issueAdminRecovery(f.db);
  const res=await f.post('/api/account/password',{currentPassword:previous,password:next},{Cookie:'invictus_session='+session.token,'X-CSRF-Token':session.csrf});assert.equal(res.status,200);assert.throws(()=>inspectRecovery(f.db,invite.token));
 }finally{await f.close();}
});
test('com múltiplos administradores, console exige escolha explícita da conta',async()=>{
 const f=await fixture();try{
  f.db.prepare("INSERT INTO users(id,business_id,name,email,password_hash,role) SELECT 'second','main','Segundo','second@example.test',password_hash,'admin' FROM users WHERE id='owner'").run();
  assert.throws(()=>issueAdminRecovery(f.db),/e-mail/);assert.equal(issueAdminRecovery(f.db,'owner@example.test').email,'owner@example.test');
 }finally{await f.close();}
});
