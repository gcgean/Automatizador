import {loadDotEnv,loadConfig} from './config.js';
import {PgStore} from './pg-store.js';
import {migrateJson} from './migrate-json.js';
loadDotEnv(process.env.ENV_FILE);
const config=loadConfig();
if(!config.databaseUrl)throw new Error('DATABASE_URL não configurada.');
const store=new PgStore(config.databaseUrl,config.dataDir);
try{await store.init();console.log(JSON.stringify(await migrateJson(store,config.dataDir)));}finally{await store.close();}
