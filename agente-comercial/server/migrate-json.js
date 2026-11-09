import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from './store.js';

export async function migrateJson(store,dir){
 return store.transaction(async db=>{
  await db.pool.query('SELECT pg_advisory_xact_lock(734915805)');
  if((await db.pool.query("SELECT 1 FROM schema_migrations WHERE version='json-import-v1'")).rowCount)return {alreadyImported:true};
  const source=new Store(dir);
  const leads=await source.listLeads();
  for(const [phone,lead] of Object.entries(leads)){
   await db.pool.query('INSERT INTO leads(phone,data,created_at,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(connection_id,phone) DO NOTHING',[phone,lead,lead.criadoEm||new Date().toISOString(),lead.atualizadoEm||new Date().toISOString()]);
  }
  let names=[];try{names=await fs.readdir(path.join(dir,'conversas'));}catch(e){if(e.code!=='ENOENT')throw e;}
  let conversations=0;
  for(const name of names.filter(n=>/^\d+\.json$/.test(n))){
   const phone=name.slice(0,-5),conv=await source.getConversation(phone);
   await db.pool.query('INSERT INTO conversations(phone,data) VALUES($1,$2) ON CONFLICT(connection_id,phone) DO NOTHING',[phone,conv]);conversations++;
  }
  const events=await source.readJson(path.join(dir,'events.json'),{timeline:[],deliveries:{}});
  for(const event of events.timeline)await db.recordEvent(event);
  for(const delivery of Object.values(events.deliveries))await db.recordDelivery(delivery);
  await db.saveSettings(await source.getSettings());
  const jobs=await source.loadInbox();await db.saveInbox(jobs);
  const counts={leads:Object.keys(leads).length,conversations,messages:events.timeline.length,deliveries:Object.keys(events.deliveries).length,jobs:Object.keys(jobs).length};
  await db.audit('json_migration',null,counts);
  await db.pool.query("INSERT INTO schema_migrations(version) VALUES('json-import-v1')");
  return counts;
 });
}
