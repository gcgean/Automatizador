import React from 'react';
import {Instagram} from 'lucide-react';

// Ícone discreto do canal da conversa (Instagram ou WhatsApp), na cor do texto ao redor.
export function ChannelIcon({channel,size=11,className=''}){
 const label=channel==='instagram'?'Instagram':'WhatsApp',cls=('channel-icon '+className).trim();
 if(channel==='instagram')return <Instagram size={size} className={cls} aria-label={label} role="img"><title>{label}</title></Instagram>;
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-label={label} role="img"><title>{label}</title><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9.2 8.6c0 3.3 2.9 6.2 6.2 6.2l1-1.4-2-1-1 .8a5 5 0 0 1-2.6-2.6l.8-1-1-2z" strokeWidth="1.5"/></svg>;
}
