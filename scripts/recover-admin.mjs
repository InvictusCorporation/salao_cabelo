import {openDatabase} from '../database.mjs';
import {issueAdminRecovery} from '../recovery.mjs';
import {existsSync} from 'node:fs';

if(!process.env.DB_PATH||!process.env.PUBLIC_ORIGIN)throw Error('Defina DB_PATH e PUBLIC_ORIGIN para a instalação correta.');
if(!existsSync(process.env.DB_PATH))throw Error('O banco informado não existe. Nenhum banco será criado para recuperação de acesso.');
const origin=new URL(process.env.PUBLIC_ORIGIN);
if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('PUBLIC_ORIGIN deve ser a origem HTTPS da instalação.');
const db=openDatabase(process.env.DB_PATH);
try{
 const result=issueAdminRecovery(db,process.argv[2]);
 // Saída privada para o operador autorizado. Nunca versionar ou publicar o link.
 console.log(JSON.stringify({url:origin.origin+'/#admin-recovery='+result.token,email:result.email,expiresAt:new Date(result.expiresAt).toISOString()}));
}finally{db.close();}
