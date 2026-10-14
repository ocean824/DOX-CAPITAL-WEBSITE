import {useState,useEffect,useCallback} from 'react';
import {Plus,Trash2,Clock} from 'lucide-react';
import {toast} from 'sonner';
import {api,errorText} from '../lib/api';
import {Modal,Btn,Field} from './Common';

const DAYS=[['0','Sunday'],['1','Monday'],['2','Tuesday'],['3','Wednesday'],['4','Thursday'],['5','Friday'],['6','Saturday']];
const blank=()=>DAYS.reduce((a,[k])=>({...a,[k]:{on:['1','2','3','4','5'].includes(k),start:'09:00',end:'17:00'}}),{});

export default function AvailabilityEditor({open,onClose}){
 const [weekly,setWeekly]=useState(blank());
 const [slot,setSlot]=useState(30);
 const [blocked,setBlocked]=useState([]);
 const [newDate,setNewDate]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(false);

 const load=useCallback(async()=>{setLoading(true);
  try{const {data}=await api.get('/availability');
   setWeekly({...blank(),...(data.weekly||{})});setSlot(data.slot_minutes||30);setBlocked(data.blocked_dates||[]);}
  catch(e){toast.error(errorText(e));}finally{setLoading(false);}
 },[]);
 useEffect(()=>{if(open)load();},[open,load]);

 const setDay=(k,patch)=>setWeekly(w=>({...w,[k]:{...w[k],...patch}}));
 const addBlocked=()=>{if(newDate&&!blocked.includes(newDate)){setBlocked(b=>[...b,newDate].sort());setNewDate('');}};
 const save=async()=>{setBusy(true);
  try{await api.put('/availability',{weekly,slot_minutes:Number(slot),blocked_dates:blocked,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'});
   toast.success('Availability saved');onClose();}
  catch(e){toast.error(errorText(e));}finally{setBusy(false);}
 };

 return <Modal open={open} onClose={onClose} title="Your availability" description="When clients can book you for calls" id="availability-modal">
  <div className="avail-weekly">
   {DAYS.map(([k,label])=><div className="avail-row" data-testid={`avail-day-${k}`} key={k}>
    <label className="avail-toggle"><input type="checkbox" data-testid={`avail-on-${k}`} checked={weekly[k].on} onChange={e=>setDay(k,{on:e.target.checked})}/><span>{label}</span></label>
    <div className="avail-times" style={{opacity:weekly[k].on?1:.4}}>
     <input type="time" data-testid={`avail-start-${k}`} value={weekly[k].start} disabled={!weekly[k].on} onChange={e=>setDay(k,{start:e.target.value})}/>
     <span>–</span>
     <input type="time" data-testid={`avail-end-${k}`} value={weekly[k].end} disabled={!weekly[k].on} onChange={e=>setDay(k,{end:e.target.value})}/>
    </div>
   </div>)}
  </div>
  <div className="form-grid" style={{marginTop:16}}>
   <Field label="Slot length"><select data-testid="avail-slot" value={slot} onChange={e=>setSlot(e.target.value)}>{[15,30,45,60].map(m=><option key={m} value={m}>{m} minutes</option>)}</select></Field>
  </div>
  <div style={{marginTop:14}}>
   <span style={{fontSize:10,color:'#b2bbc8'}}>Blocked dates (time off)</span>
   <div className="avail-blocked">
    <input type="date" data-testid="avail-block-date" value={newDate} onChange={e=>setNewDate(e.target.value)}/>
    <Btn secondary id="avail-block-add" type="button" onClick={addBlocked}><Plus size={13}/>Block date</Btn>
   </div>
   <div className="tags" style={{marginTop:10}}>{blocked.map(d=><span key={d} className="badge neutral" data-testid={`avail-blocked-${d}`}>{d}<button type="button" aria-label="Remove" onClick={()=>setBlocked(b=>b.filter(x=>x!==d))} style={{marginLeft:6,display:'inline-flex'}}><Trash2 size={11}/></button></span>)}{!blocked.length&&<small style={{color:'#78869b'}}>No blocked dates.</small>}</div>
  </div>
  <div className="form-footer"><Btn secondary id="avail-cancel" type="button" onClick={onClose}>Cancel</Btn><Btn id="avail-save" loading={busy||loading} onClick={save}><Clock size={14}/>Save availability</Btn></div>
 </Modal>;
}
