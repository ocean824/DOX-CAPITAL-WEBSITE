import {Link} from 'react-router-dom';
import {CalendarDays,CheckSquare,ArrowUpRight} from 'lucide-react';
import {money,dateLabel} from '../lib/api';
import {Avatar} from './Common';
export const TransactionCard=({transaction:t,tasks=[]})=>{
 const list=tasks.filter(x=>x.transaction_id===t.id),done=list.filter(x=>x.completed).length;
 return <Link to={`/workspace/transactions/${t.id}`} className="property-card" data-testid={`transaction-card-${t.id}`} draggable onDragStart={e=>e.dataTransfer.setData('transaction',t.id)}><div className="deal-card-top"><span className="property-type">{t.deal_type}</span>{t.location&&<span className="deal-card-location">{t.location}</span>}</div><div className="property-card-body"><h3>{t.title}</h3><div className="property-value" data-testid={`transaction-value-${t.id}`}>{money(t.value)}</div><div className="property-card-meta"><Avatar name={t.deal_lead||'D.O.X'}/>{list.length>0?<span className="task-progress"><CheckSquare size={11}/>{done}/{list.length} steps</span>:<span className="task-progress">{t.review_status==='approved'?'Approved':'In progress'}</span>}</div>{list.length>0&&<div className="mini-progress"><span style={{width:`${done/list.length*100}%`}}/></div>}<div className="property-card-footer"><span className={`due ${t.stage_id==='closed_funded'?'urgent':''}`}><CalendarDays/>{t.stage_id==='closed_funded'?'Funded':'Target'} {dateLabel(t.close_date)}</span><ArrowUpRight/></div></div></Link>;
};
