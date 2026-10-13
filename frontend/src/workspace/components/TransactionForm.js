import {useState} from 'react';
import {toast} from 'sonner';
import {Plus} from 'lucide-react';
import {Modal,Field,Btn} from './Common';
import {useData} from '../lib/useData';
import {useAuth} from '../lib/auth';
import {api,errorText,refreshData} from '../lib/api';
const day=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return d.toLocaleDateString('en-CA');};
export const TransactionForm=({open,onClose,stage='lead'})=>{
 const {user}=useAuth(),{data:contacts=[]}=useData(open?'/contacts':null,[]),{data:stages=[]}=useData(open?'/pipeline-stages':null,[]),{data:directory=[]}=useData(open?'/directory':null,[]),{data:config}=useData(open?'/deal-config':null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [value,setValue]=useState(''),[needed,setNeeded]=useState('');
 const dealTypes=config?.deal_types||[];
 const redFlag=value!==''&&needed!==''&&Number(needed)>=Number(value)&&Number(value)>0;
 const overAsk=value!==''&&needed!==''&&Number(needed)>Number(value);
 const submit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setError('');try{await api.post('/transactions',{title:f.get('title'),location:f.get('location')||'',value:Number(f.get('value')),amount_needed:Number(f.get('amount_needed')||0),deal_type:f.get('deal_type'),stage_id:f.get('stage_id'),counterparty_id:f.get('counterparty_id')||null,deal_lead:f.get('deal_lead')||'',engagement_date:f.get('engagement_date'),diligence_date:f.get('diligence_date'),close_date:f.get('close_date'),assigned_ids:f.get('assigned_id')?[f.get('assigned_id')]:[user.id],client_ids:f.get('client_id')?[f.get('client_id')]:[],image_url:''});refreshData();toast.success('Deal created. The SOP checklist is ready.');onClose();}catch(e){setError(errorText(e));}finally{setBusy(false);}};
 return <Modal open={open} onClose={onClose} title="New deal" description="Every closing starts with the right details." id="transaction-modal"><form onSubmit={submit}><div className="form-grid">
  <div className="full"><Field label="Deal name" name="title" placeholder="Hartwell Group — $2.4M bridge facility" required minLength={3}/></div>
  <Field label="Deal type"><select data-testid="field-deal-type" name="deal_type">{dealTypes.map(x=><option key={x}>{x}</option>)}</select></Field>
  <Field label="Deal value ($)" name="value" type="number" min="0" step="1" required placeholder="2,400,000" value={value} onChange={e=>setValue(e.target.value)}/>
  <Field label="Amount needed ($)" name="amount_needed" type="number" min="0" step="1" placeholder="e.g. 1,800,000" value={needed} onChange={e=>setNeeded(e.target.value)}/>
  <div className="full"><p className="field-hint" data-testid="amount-needed-hint">Capital the client actually needs — usually less than the total deal value. {redFlag&&<strong data-testid="amount-needed-redflag" style={{color:'var(--red,#e5484d)'}}>⚑ Red flag: client is requesting {overAsk?'more than':'the entire'} deal value.</strong>}</p></div>
  <Field label="Counterparty"><select name="counterparty_id" data-testid="field-counterparty-id"><option value="">Not linked</option>{contacts.map(c=><option value={c.id} key={c.id}>{c.name}{c.company?` · ${c.company}`:''}</option>)}</select></Field>
  <Field label="Location (optional)" name="location" placeholder="Miami, FL"/>
  <Field label="Pipeline stage"><select name="stage_id" data-testid="field-stage-id" defaultValue={stage}>{stages.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
  <Field label="Deal lead" name="deal_lead" placeholder="Who owns this deal"/>
  <Field label="Assigned coordinator"><select name="assigned_id" data-testid="field-assigned-id">{directory.filter(u=>u.active&&u.role!=='CLIENT'&&(user.role==='OWNER'||u.id===user.id)).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
  {user.role==='OWNER'&&<Field label="Client portal access"><select name="client_id" data-testid="field-client-id"><option value="">No client access</option>{directory.filter(u=>u.role==='CLIENT'&&u.active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>}
  <Field label="Engagement date" name="engagement_date" type="date" defaultValue={day(0)} required/>
  <Field label="Diligence deadline" name="diligence_date" type="date" defaultValue={day(10)} required/>
  <Field label="Target close" name="close_date" type="date" defaultValue={day(30)} required/>
 </div>{error&&<div className="error-box" data-testid="transaction-form-error">{error}</div>}<div className="form-footer"><Btn secondary id="transaction-cancel-button" type="button" onClick={onClose}>Cancel</Btn><Btn id="transaction-save-button" type="submit" loading={busy}><Plus/>Create deal</Btn></div></form></Modal>;
};
