import {useState} from 'react';
import axios from 'axios';
import {Sparkles,Copy,Send} from 'lucide-react';
import {toast} from 'sonner';
import {api,BASE,errorText} from '../lib/api';
import {Modal,Btn,Field} from './Common';

const mail=axios.create({baseURL:`${BASE}/api`,withCredentials:true});

export default function ContactDraft({contact,onClose}){
 const [mode,setMode]=useState('single');
 const [instruction,setInstruction]=useState('');
 const [loading,setLoading]=useState(false);
 const [drafts,setDrafts]=useState([]);
 const [sending,setSending]=useState(-1);

 const close=()=>{setDrafts([]);setInstruction('');setMode('single');onClose();};

 const generate=async()=>{
  setLoading(true);
  try{
   const {data}=await api.post('/ai/contact-draft',{contact_id:contact.id,mode,instruction});
   setDrafts((data.drafts||[]).map(d=>({...d})));
   if(!data.drafts?.length)toast.error('No draft was produced. Try again.');
  }catch(e){toast.error(errorText(e));}
  finally{setLoading(false);}
 };
 const update=(i,k,v)=>setDrafts(ds=>ds.map((d,j)=>j===i?{...d,[k]:v}:d));
 const copy=(d)=>{navigator.clipboard?.writeText(`Subject: ${d.subject}\n\n${d.body}`);toast.success('Draft copied');};
 const send=async(i)=>{
  const d=drafts[i];
  if(!contact.email){toast.error('This contact has no email address');return;}
  if(!d.subject.trim()||!d.body.trim()){toast.error('Subject and message are required');return;}
  setSending(i);
  try{await mail.post('/inbox/compose',{to:contact.email,subject:d.subject,body:d.body});toast.success(`Email sent to ${contact.email}`);}
  catch(e){toast.error(errorText(e));}
  finally{setSending(-1);}
 };

 return <Modal open={!!contact} onClose={close} title={`Draft for ${contact?.name||''}`} description="AI-drafted nurture outreach · review and edit before sending" id="contact-draft-modal">
  <div className="segmented draft-controls" role="tablist">
   <button type="button" data-testid="draft-mode-single" className={mode==='single'?'active':''} onClick={()=>setMode('single')}>Single email</button>
   <button type="button" data-testid="draft-mode-sequence" className={mode==='sequence'?'active':''} onClick={()=>setMode('sequence')}>3-step sequence</button>
  </div>
  <Field label="What should this cover? (optional)"><textarea data-testid="draft-instruction" value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="e.g. check in after our last call, share the new facility sizes…"/></Field>
  <Btn id="draft-generate" loading={loading} onClick={generate}><Sparkles size={15}/>{drafts.length?'Regenerate':'Generate draft'}</Btn>
  <div className="draft-results">
   {drafts.map((d,i)=><div className="draft-card" data-testid={`draft-card-${i}`} key={i}>
    {d.send_after&&<div className="draft-step" data-testid={`draft-step-${i}`}>Step {d.step} · {d.send_after}</div>}
    <input className="draft-subject" data-testid={`draft-subject-${i}`} value={d.subject} onChange={e=>update(i,'subject',e.target.value)} placeholder="Subject"/>
    <textarea className="draft-body" data-testid={`draft-body-${i}`} value={d.body} onChange={e=>update(i,'body',e.target.value)}/>
    <div className="draft-actions">
     <Btn secondary id={`draft-copy-${i}`} type="button" onClick={()=>copy(d)}><Copy size={13}/>Copy</Btn>
     <Btn id={`draft-send-${i}`} type="button" loading={sending===i} onClick={()=>send(i)}><Send size={13}/>Send</Btn>
    </div>
   </div>)}
  </div>
 </Modal>;
}
