// Importa somente o catálogo oficial autorizado. Não envia mensagens a clientes.
import {loadDotEnv,loadConfig} from '../server/config.js';
import {PgStore} from '../server/pg-store.js';
import {synchronizeOfficialLessons} from '../server/official-lessons.js';
loadDotEnv();const config=loadConfig(),store=new PgStore(config.databaseUrl,config.dataDir);
try{console.log(JSON.stringify(await synchronizeOfficialLessons(store,{apply:process.argv.includes('--apply')})));}finally{await store.close();}
