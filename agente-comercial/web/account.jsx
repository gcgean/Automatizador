import {responseErrorMessage} from './http-error.js';
import React,{useEffect,useState} from 'react';
import {AttendanceReport} from './attendance-dashboard.jsx';
import {Eye,EyeOff,ArrowRight,MessageSquare,CalendarDays,Sparkles,Mail,LockKeyhole} from 'lucide-react';
export async function request(path,body){
 const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{'X-Requested-With':'CommandPanel',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(!response.ok){const error=new Error(responseErrorMessage(response.status,await response.text()));error.status=response.status;throw error;}
 return response.json();
}
const activation=new URLSearchParams(location.hash.slice(1));
let initialToken=activation.get('setup')||'';
export function clearActivation(){initialToken='';}
const initialEmail=activation.get('email')||'';
if(initialToken)history.replaceState(null,'',location.pathname);
function PasswordInput({id,...props}){
 const [visible,setVisible]=useState(false);
 return <div className="password-input"><LockKeyhole size={18} aria-hidden="true"/><input {...props} id={id} type={visible?'text':'password'}/><button type="button" className="password-toggle" aria-label={visible?'Ocultar senha':'Mostrar senha'} aria-controls={id} aria-pressed={visible} title={visible?'Ocultar senha':'Mostrar senha'} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={19}/>:<Eye size={19}/>}</button></div>;
}
export function Login({onLogin,busy,error}){
 const [email,setEmail]=useState(initialEmail),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
 const [formError,setFormError]=useState('');
 const [setup,setSetup]=useState(!!initialToken);
 return <main className="login-page"><section className="login-card" aria-label="Acesso ao Command Comercial">
  <aside className="login-brand"><img src="/logo.jpg" alt="Command System Comercial"/><div className="login-brand-copy"><h1>Seu atendimento,<br/><span>em um só lugar.</span></h1><p>Mais clareza para acompanhar cada conversa e o próximo passo de cada lead.</p></div><ul className="login-features"><li><MessageSquare size={20}/><span>Conversas e contatos organizados</span></li><li><CalendarDays size={20}/><span>CRM e apresentações conectados</span></li><li><Sparkles size={20}/><span>HELENA e sua equipe trabalhando juntas</span></li></ul><small>Command System · Plataforma comercial</small></aside>
  <div className="login-form-panel"><div className="login-form-heading"><h2>{setup?'Crie sua senha de acesso':'Bem-vindo de volta'}</h2><p>{setup?'Ative sua conta com uma senha de pelo menos 8 caracteres.':'Entre para acompanhar suas conversas e oportunidades.'}</p></div>
  <form onSubmit={event=>{event.preventDefault();setFormError('');if(setup&&password!==confirmation){setFormError('As senhas não conferem.');return;}onLogin({email,password,...(setup?{setupToken:initialToken}:{})},setup);}}>
   <div className="login-field"><label htmlFor="email">E-mail</label><div className="email-input"><Mail size={18} aria-hidden="true"/><input id="email" type="email" autoComplete="username" placeholder="voce@empresa.com.br" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required/></div></div>
   <div className="login-field"><label htmlFor="password">Senha</label><PasswordInput id="password" autoComplete={setup?'new-password':'current-password'} placeholder={setup?'No mínimo 8 caracteres':'Digite sua senha'} value={password} minLength={setup?8:undefined} maxLength={256} onChange={e=>setPassword(e.target.value)} required/></div>
   {setup&&<div className="login-field"><label htmlFor="confirmation">Confirme sua senha</label><PasswordInput id="confirmation" autoComplete="new-password" minLength={8} maxLength={256} value={confirmation} onChange={e=>setConfirmation(e.target.value)} required/></div>}
   {(error||formError)&&<p role="alert" className="login-form-error">{formError||error}</p>}
   <button className="login-submit" disabled={busy}>{busy?'Conectando…':setup?'Criar senha e entrar':'Entrar no painel'}<ArrowRight size={18}/></button>
  </form>{setup&&<button className="login-back" onClick={()=>{clearActivation();setSetup(false);setFormError('');setPassword('');setConfirmation('');}}>Voltar ao login</button>}<p className="login-help">Acesso exclusivo para usuários cadastrados.<br/>Precisa de acesso? Fale com o administrador.</p></div>
 </section></main>;
}
export function PasswordForm(){
 const [currentPassword,setCurrent]=useState(''),[newPassword,setNext]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function submit(event){event.preventDefault();setError('');setMessage('');if(newPassword!==confirmation){setError('As senhas não conferem.');return;}setBusy(true);try{await request('/auth/password',{currentPassword,newPassword});setCurrent('');setNext('');setConfirmation('');setMessage('Senha atualizada. As outras sessões foram encerradas.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="panel password-panel"><h2>Alterar minha senha</h2><form onSubmit={submit}><label htmlFor="change-current">Senha atual</label><PasswordInput id="change-current" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrent(e.target.value)} required/><label htmlFor="change-new">Nova senha</label><PasswordInput id="change-new" autoComplete="new-password" minLength={8} maxLength={256} value={newPassword} onChange={e=>setNext(e.target.value)} required/><label htmlFor="change-confirmation">Confirme a nova senha</label><PasswordInput id="change-confirmation" autoComplete="new-password" minLength={8} maxLength={256} value={confirmation} onChange={e=>setConfirmation(e.target.value)} required/><button disabled={busy}>Salvar nova senha</button></form>{message&&<p role="status" className="success banner">{message}</p>}{error&&<p role="alert" className="error">{error}</p>}</section>;
}
// Relatórios > Atendimentos: dashboard no padrão do relatório de atendimentos do FinanceHub.
export function Reports(props){return <AttendanceReport {...props}/>;}
