import {useState,useEffect,useCallback} from 'react';
import axios from 'axios';
import {Send,ArrowLeft,Paperclip,Mail,Reply,Link2,RefreshCw} from 'lucide-react';
import {toast} from 'sonner';
import {useAuth} from '../lib/auth';
import {useData} from '../lib/useData';
import {BASE,api,dateLabel,errorText} from '../lib/api';
import {PageHeader,Btn,Avatar,Badge,Empty,Loading} from '../components/Common';

// Inbox endpoints live on the main site API (/api), not /api/workspace.
const mail=axios.create({baseURL:`${BASE}/api`,withCredentials:true});

export default function Inbox(){
 const {user}=useAuth();
 const isAdmin=user.role==='OWNER';
 const [scope,setScope]=useState('mine');
 const [data,setData]=useState({business_email:'',unread:0,messages:[]});
 const [loading,setLoading]=useState(true);
 const [selected,setSelected]=useState(null);
 const [body,setBody]=useState('');
 const [busy,setBusy]=useState(false);
 const [linkTo,setLinkTo]=useState('');
 const {data:txs=[]}=useData('/transactions',[]);

 const load=useCallback(async()=>{
  setLoading(true);
  try{const r=await mail.get('/inbox',{params:isAdmin&&scope==='all'?{scope:'all'}:{}});setData(r.data);}
  catch(e){toast.error(errorText(e));}
  finally{setLoading(false);}
 },[isAdmin,scope]);
 useEffect(()=>{load();},[load]);

 const open=async(m)=>{
  try{const r=await mail.get(`/inbox/${m.id}`);setSelected(r.data);setLinkTo(r.data.linked_deal_id||'');
   setData(d=>({...d,unread:Math.max(0,d.unread-(m.read?0:1)),messages:d.messages.map(x=>x.id===m.id?{...x,read:true}:x)}));}
  catch(e){toast.error(errorText(e));}
 };
 const reply=async e=>{e.preventDefault();if(!body.trim())return;setBusy(true);
  try{await mail.post(`/inbox/${selected.id}/reply`,{body});toast.success('Reply sent');setBody('');
   setSelected(s=>({...s,replied:true}));setData(d=>({...d,messages:d.messages.map(x=>x.id===selected.id?{...x,replied:true}:x)}));}
  catch(e){toast.error(errorText(e));}finally{setBusy(false);}
 };
 const linkDeal=async(deal_id)=>{setLinkTo(deal_id);
  try{await mail.post(`/inbox/${selected.id}/link`,{deal_id:deal_id||null});toast.success(deal_id?'Linked to deal':'Unlinked');}
  catch(e){toast.error(errorText(e));}
 };

 return <><PageHeader eyebrow="EMAIL, INSIDE THE WORKSPACE" title="Inbox" subtitle={data.business_email?`Mail to ${data.business_email}`:'Your business inbox'}>
   {isAdmin&&<Btn id="inbox-scope-toggle" secondary onClick={()=>setScope(s=>s==='mine'?'all':'mine')}>{scope==='mine'?'All firm mail':'My inbox'}</Btn>}
   <Btn id="inbox-refresh" secondary onClick={load}><RefreshCw size={15}/>Refresh</Btn>
 </PageHeader>
 {loading?<Loading/>:<div className={`messages-layout ${selected?'has-selection':''}`}>
  <aside className="thread-list">
   <div className="thread-list-title"><strong>{isAdmin&&scope==='all'?'All firm mail':'Received'}</strong><Badge color="neutral">{data.messages.length}</Badge></div>
   {data.messages.length?data.messages.map(m=><button data-testid={`inbox-item-${m.id}`} key={m.id} className={`thread-item ${selected?.id===m.id?'active':''} ${m.read?'':'unread'}`} onClick={()=>open(m)}>
     <Avatar name={m.from_raw||m.from_email}/>
     <div className="thread-info"><strong>{!m.read&&<span className="unread-dot"/>}{m.from_email||'Unknown sender'}</strong><p>{m.subject}</p><small>{m.snippet}</small></div>
     <div className="thread-meta"><small>{dateLabel(m.received_at)}</small>{m.replied&&<Badge color="green">Replied</Badge>}{m.attachments?.length>0&&<Paperclip size={13}/>}</div>
   </button>):<Empty title="No mail yet" text={`Messages sent to ${data.business_email} will appear here.`}/>}
  </aside>
  <section className="conversation">
   {selected?<>
    <header className="conversation-header"><button className="icon-btn mobile-thread-back" data-testid="inbox-back" aria-label="Back" onClick={()=>setSelected(null)}><ArrowLeft size={17}/></button>
     <div><h2>{selected.subject}</h2><small>From {selected.from_raw||selected.from_email} · to {Array.isArray(selected.to)?selected.to.join(', '):selected.to}</small></div></header>
    <div className="message-list" data-testid="inbox-reader" style={{padding:'0 4px'}}>
     {selected.attachments?.length>0&&<div className="inbox-attachments" style={{display:'flex',gap:8,flexWrap:'wrap',padding:'4px 0 12px'}}>{selected.attachments.map((a,i)=><Badge key={i} color="neutral"><Paperclip size={12}/> {a.filename}</Badge>)}</div>}
     <div className="inbox-body" data-testid="inbox-message-body" style={{color:'#d4d4d8',lineHeight:1.6,fontSize:14,wordBreak:'break-word'}}>
      {selected.html?<div dangerouslySetInnerHTML={{__html:selected.html}}/>:<pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit',margin:0}}>{selected.text||'(empty message)'}</pre>}
     </div>
    </div>
    <form className="message-compose" onSubmit={reply}>
     <div style={{display:'flex',alignItems:'center',gap:8,width:'100%',marginBottom:6}}>
      <Link2 size={14}/>
      <select data-testid="inbox-link-deal" aria-label="Link to deal" value={linkTo} onChange={e=>linkDeal(e.target.value)} style={{flex:1}}>
       <option value="">Link this email to a deal…</option>
       {txs.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}
      </select>
     </div>
     <textarea data-testid="inbox-reply-input" placeholder={`Reply to ${selected.from_email}…`} value={body} onChange={e=>setBody(e.target.value)} required maxLength={20000}/>
     <Btn id="inbox-reply-send" type="submit" loading={busy} disabled={!body.trim()}><Send/>Send reply</Btn>
    </form>
   </>:<Empty title="Select a message" text="Pick an email on the left to read and reply."><Mail size={0}/></Empty>}
  </section>
 </div>}</>;
}
