import {secret,digest,passwordValid,hashPassword} from './auth.mjs';
import {transaction,audit} from './database.mjs';

const invalid=()=>{throw Object.assign(new Error('Link inválido, expirado ou já utilizado. Solicite um novo acesso privado.'),{status:400});};
export function inspectRecovery(db,token,now=Date.now()){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))invalid();
 const row=db.prepare('SELECT r.*,u.name,u.email,u.role,u.active,u.business_id,u.password_hash FROM admin_recovery r JOIN users u ON u.id=r.user_id WHERE r.token_hash=?').get(digest(token));
 if(!row||row.used_at!==null||row.expires_at<=now||row.role!=='admin'||!row.active||row.password_fingerprint!==digest(row.password_hash))invalid();
 return row;
}
export function issueAdminRecovery(db,email,now=Date.now()){
 return transaction(db,()=>{
  const users=email?db.prepare("SELECT * FROM users WHERE email=? AND role='admin' AND active=1").all(email.trim().toLowerCase()):db.prepare("SELECT * FROM users WHERE role='admin' AND active=1").all();
  if(users.length!==1)throw Error('Informe o e-mail de uma conta administradora ativa. Nenhuma conta será criada ou promovida.');
  const user=users[0],token=secret(),expiresAt=now+30*60*1000;
  db.prepare('DELETE FROM admin_recovery WHERE user_id=? OR expires_at<=?').run(user.id,now);
  db.prepare('INSERT INTO admin_recovery(token_hash,user_id,password_fingerprint,expires_at) VALUES(?,?,?,?)').run(digest(token),user.id,digest(user.password_hash),expiresAt);
  audit(db,{id:'server-console',business_id:user.business_id},'admin_recovery_issued',user.id);
  return {token,email:user.email,name:user.name,expiresAt};
 });
}
export async function completeAdminRecovery(db,token,password){
 inspectRecovery(db,token);
 if(!passwordValid(password))throw Object.assign(new Error('Use uma senha de 12 a 128 caracteres.'),{status:400});
 const hash=await hashPassword(password);
 return transaction(db,()=>{
  const row=inspectRecovery(db,token);
  db.prepare('UPDATE users SET password_hash=?,must_change=0 WHERE id=?').run(hash,row.user_id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);
  db.prepare('UPDATE admin_recovery SET used_at=? WHERE user_id=? AND used_at IS NULL').run(Date.now(),row.user_id);
  audit(db,{id:row.user_id,business_id:row.business_id},'admin_password_recovered',row.user_id);
  return {ok:true,email:row.email};
 });
}
