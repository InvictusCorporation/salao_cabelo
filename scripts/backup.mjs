import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=process.env.DB_PATH||path.join(root,'data','invictus.sqlite');
if(!existsSync(source))throw Error('O banco ainda não foi criado. Inicie o aplicativo primeiro.');
const destination=path.join(root,'data','backups');
mkdirSync(destination,{recursive:true});
const file=path.join(destination,'invictus-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,file);console.log('Backup consistente salvo em: '+file);}finally{db.close();}
