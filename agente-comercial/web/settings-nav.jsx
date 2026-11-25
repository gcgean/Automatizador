import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Building2,Activity,PhoneCall,Rocket,Plug,Network,Megaphone,ShoppingBag,Send,Clapperboard,Clock,ListChecks,MessageSquareText,Sparkles,CalendarDays,Kanban,Repeat,FlaskConical,Users,ShieldCheck,KeyRound,Search,ChevronDown,X} from 'lucide-react';
import './settings-nav.css';

// Organização do menu de Configurações: grupos por assunto, ícone, descrição curta e palavras de busca.
const ITEMS={
 departments:{group:'atendimento',icon:Network,hint:'Equipes e quem atende cada assunto',keys:'setor departamento equipe'},
 hours:{group:'atendimento',icon:Clock,hint:'Expediente, feriados e distribuição',keys:'horario expediente feriado distribuicao rodizio'},
 closure:{group:'atendimento',icon:ListChecks,hint:'Motivos ao encerrar um chamado',keys:'finalizar encerrar motivo'},
 quick:{group:'atendimento',icon:MessageSquareText,hint:'Atalhos de texto para o atendente',keys:'atalho resposta pronta'},
 agenda:{group:'atendimento',icon:CalendarDays,hint:'Horários de apresentação e lembretes',keys:'agenda reuniao apresentacao lembrete'},
 ai:{group:'helena',icon:Sparkles,hint:'Modelo, comportamento e contexto da IA',keys:'ia inteligencia helena modelo deepseek'},
 cadence:{group:'helena',icon:Repeat,hint:'Retomadas automáticas e modelos',keys:'cadencia retomada modelo template follow'},
 videos:{group:'helena',icon:Clapperboard,hint:'Vídeos que a HELENA pode enviar',keys:'video demonstracao'},
 simulation:{group:'helena',icon:FlaskConical,hint:'Converse com a HELENA sem cliente real',keys:'testar simular helena'},
 growth:{group:'vendas',icon:ShoppingBag,hint:'Produtos, links e funil comercial',keys:'produto link teste funil comercial pagina'},
 telegram:{group:'vendas',icon:Send,hint:'Bot e quem recebe os avisos',keys:'telegram bot alerta aviso notificacao vendedor gestor'},
 crm:{group:'vendas',icon:Kanban,hint:'Integração com o CRM',keys:'crm negocio integracao'},
 meta:{group:'vendas',icon:Megaphone,hint:'Contas e campanhas de anúncios',keys:'meta facebook anuncio campanha'},
 manage:{group:'canais',icon:Plug,hint:'Números, Instagram, YouTube e contextos',keys:'conexao whatsapp numero instagram youtube contexto'},
 calls:{group:'canais',icon:PhoneCall,hint:'Ligações pelo WhatsApp',keys:'ligacao chamada telefone voz'},
 users:{group:'acesso',icon:Users,hint:'Convites, perfis e conexões',keys:'usuario convite vendedor atendente'},
 groups:{group:'acesso',icon:ShieldCheck,hint:'Permissões por grupo',keys:'grupo acesso permissao'},
 onboarding:{group:'acesso',icon:Rocket,hint:'Passo a passo para uma nova empresa',keys:'nova empresa configurar'},
 companies:{group:'acesso',icon:Building2,hint:'Empresas da plataforma',keys:'empresa cliente plataforma'},
 password:{group:'acesso',icon:KeyRound,hint:'Trocar sua senha',keys:'senha conta'},
 'server-monitor':{group:'sistema',icon:Activity,hint:'Saúde do servidor e envios',keys:'servidor monitoramento saude'},
};
const GROUPS=[['atendimento','Atendimento'],['helena','HELENA (IA)'],['vendas','Vendas e alertas'],['canais','Canais'],['acesso','Empresa e acesso'],['sistema','Sistema']];
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

export function SettingsNav({tabs,active,onSelect}){
 const [query,setQuery]=useState(''),[open,setOpen]=useState(false);
 const groups=useMemo(()=>{
  const q=norm(query).trim(),list=tabs.map(([id,label])=>({id,label,...(ITEMS[id]||{group:'sistema',icon:Activity,hint:'',keys:''})})).filter(i=>!q||norm(i.label+' '+i.hint+' '+i.keys).includes(q));
  return GROUPS.map(([id,label])=>({id,label,items:list.filter(i=>i.group===id)})).filter(g=>g.items.length);
 },[tabs,query]);
 const current=tabs.find(([id])=>id===active),CurrentIcon=ITEMS[active]?.icon||Activity;
 const pick=id=>{onSelect(id);setOpen(false);setQuery('');};
 const body=useRef(null);
 // Mantém o item atual visível no menu lateral.
 useEffect(()=>{body.current?.querySelector('button.active')?.scrollIntoView({block:'nearest'});},[active]);
 return <nav className={'settings-nav'+(open?' open':'')} aria-label="Configurações">
  <button type="button" className="settings-nav-current" aria-expanded={open} onClick={()=>setOpen(!open)}><CurrentIcon size={18}/><span><small>Você está em</small>{current?.[1]}</span><ChevronDown size={18} className="chevron"/></button>
  <div className="settings-nav-body" ref={body}>
   <label className="settings-nav-search"><Search size={15}/><input type="search" placeholder="Buscar (ex.: telegram)" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Buscar configuração"/>{query&&<button type="button" className="icon-button" aria-label="Limpar busca" onClick={()=>setQuery('')}><X size={14}/></button>}</label>
   {groups.length?groups.map(g=><div className="settings-nav-group" key={g.id}><h3>{g.label}</h3><ul>{g.items.map(i=>{const Icon=i.icon;return <li key={i.id}><button type="button" className={active===i.id?'active':''} aria-current={active===i.id?'page':undefined} onClick={()=>pick(i.id)}><Icon size={17}/><span><strong>{i.label}</strong>{i.hint&&<small>{i.hint}</small>}</span></button></li>;})}</ul></div>):<p className="settings-nav-empty">Nada encontrado para “{query}”.</p>}
  </div>
 </nav>;
}
