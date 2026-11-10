export function blockingJob(jobs,phone){return Object.values(jobs||{}).find(job=>job.message?.from===phone&&job.status==='attention');}
export function deliveryActivity(jobs,phone){
 const list=Object.values(jobs||{}).filter(job=>job.message?.from===phone),blocking=blockingJob(jobs,phone),queued=list.filter(job=>job.status==='queued');
 if(blocking)return {phase:'attention',label:'Envio aguardando conferência',blocking,queued};
 const processing=list.find(job=>job.status==='processing');
 if(processing)return {phase:processing.message.manual?'sending':'ai',label:processing.message.manual?'Enviando sua mensagem…':'IARA está respondendo…',queued};
 if(queued.length)return {phase:'queued',label:'Mensagem na fila de envio…',queued};
 return {phase:'idle',label:'',queued};
}
