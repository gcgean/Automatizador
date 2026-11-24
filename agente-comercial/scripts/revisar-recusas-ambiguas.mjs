// Revisa somente flags antigas sem evidência de recusa explícita; nunca envia mensagens.
import {loadDotEnv,loadConfig} from '../server/config.js';
import {PgStore} from '../server/pg-store.js';
import {reconcileAmbiguousRefusals} from '../server/followup-reconciliation.js';
loadDotEnv();const config=loadConfig(),store=new PgStore(config.databaseUrl,config.dataDir);
try{console.log(JSON.stringify(await reconcileAmbiguousRefusals(store,{apply:process.argv.includes('--apply')})));}finally{await store.close();}
