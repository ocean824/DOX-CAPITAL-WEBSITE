import re,json,secrets
from datetime import datetime,timezone,timedelta
from pathlib import PurePosixPath
from fastapi import APIRouter,Depends,HTTPException,UploadFile,File,Form
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError
from workspace.core import db,uid,now,digest,require,Repo,authorize,activity,settings,push_notification
from workspace.knowledge_extract import extract_text,decode_payload,extension,MAX_BYTES
from workspace.schemas import (KnowledgeSyncIn,KnowledgeSyncOut,KnowledgeItemOut,KnowledgeItemDetail,KnowledgeItemPatch,GrantIn,GrantOut,
    HermesGrant,GrantConfirmationIn,ConfirmationOut,KnowledgeAccessOut,KnowledgeRules,OK)
from workspace.integration_routes import service_principal

router=APIRouter(prefix='/api/workspace',tags=['Knowledge vault'])
ITEM_FIELDS={'_id':0,'content':0}

def normalize_path(path):
    parts=[p for p in PurePosixPath(path.replace('\\','/')).parts if p not in ('','.','..','/')]
    if not parts:raise HTTPException(422,'Invalid knowledge path')
    return '/'.join(parts)
def title_of(path,content):
    match=re.search(r'^#\s+(.+)$',content,re.M)
    return (match.group(1).strip() if match else PurePosixPath(path).stem.replace('-',' ').replace('_',' '))[:150]
def prefix_clause(prefix):
    return {'path':{'$regex':'^'+re.escape(normalize_path(prefix))+'(/|$)'}} if prefix.strip() else {}
def active_grant_query(user_id):
    today=datetime.now(timezone.utc).date().isoformat()
    return {'user_id':user_id,'active':True,'$or':[{'expires_at':None},{'expires_at':{'$gte':today}}]}

async def permitted_filter(user):
    """Returns the Mongo filter of knowledge items the AI may use for this user, or None when nothing is permitted."""
    if user['role']=='OWNER':return {}
    grants=await db.knowledge_grants.find(active_grant_query(user['id']),{'_id':0}).to_list(200)
    if not grants:return None
    involved=[t['id'] for t in await Repo(user).list('transactions')]
    clauses=[]
    for grant in grants:
        base=prefix_clause(grant.get('path_prefix',''))
        if grant['scope']=='shared':clauses.append({**base,'scope':'shared'})
        elif involved and grant.get('deal_types'):
            clauses.append({**base,'scope':'project','transaction_id':{'$in':involved},'deal_type':{'$in':grant['deal_types']}})
    return {'$or':clauses} if clauses else None
async def permitted_items(user,extra=None,limit=500,projection=ITEM_FIELDS):
    allowed=await permitted_filter(user)
    if allowed is None:return []
    return await db.knowledge_items.find({'$and':[allowed,extra or {}]},projection).sort('path',1).to_list(limit)
async def search_knowledge(user,text,transaction_id=None,limit=6):
    """SOP items are the source of truth: always retrieved first, then keyword matches."""
    allowed=await permitted_filter(user)
    if allowed is None:return []
    scope={'$and':[allowed]+([{'$or':[{'scope':'shared'},{'transaction_id':transaction_id}]}] if transaction_id else [])}
    results=[]
    if text.strip():
        results=await db.knowledge_items.find({**scope,'$text':{'$search':text[:500]}},{'_id':0,'score':{'$meta':'textScore'}}).sort([('score',{'$meta':'textScore'})]).to_list(limit)
    sops=await db.knowledge_items.find({**scope,'trust':'sop'},{'_id':0}).sort('path',1).to_list(limit)
    if text.strip() and sops:
        words=[w.lower() for w in text.split() if len(w)>3]
        matched=[r for r in sops if any(w in (r['title']+' '+r['content'][:4000]).lower() for w in words)]
        sops=matched or sops[:2]
    seen=set();merged=[]
    for row in sops+results:
        if row['id'] in seen:continue
        seen.add(row['id']);merged.append(row)
    if not merged and transaction_id:
        merged=await db.knowledge_items.find({'$and':[allowed,{'transaction_id':transaction_id}]},{'_id':0}).sort('updated_at',-1).to_list(3)
    return merged[:max(limit,len(sops))]

async def resolve_target(user,data):
    values={'scope':data.scope,'transaction_id':data.transaction_id,'deal_type':data.deal_type,'trust':data.trust}
    if data.scope=='project':
        if not data.transaction_id:raise HTTPException(422,'Deal knowledge must be linked to a deal')
        tx=await Repo(user).get('transactions',data.transaction_id)
        values['deal_type']=data.deal_type or tx['deal_type']
    else:values['transaction_id']=None
    return values

@router.get('/knowledge/items',response_model=list[KnowledgeItemOut])
async def items(user=Depends(require('ai'))):
    if user['role']=='OWNER':return await db.knowledge_items.find({},ITEM_FIELDS).sort('path',1).to_list(2000)
    return await permitted_items(user)
@router.get('/knowledge/access',response_model=KnowledgeAccessOut)
async def access(user=Depends(require('ai'))):
    rows=await permitted_items(user) if user['role']!='OWNER' else await db.knowledge_items.find({},ITEM_FIELDS).sort('path',1).to_list(2000)
    grants=await db.knowledge_grants.count_documents(active_grant_query(user['id'])) if user['role']!='OWNER' else 0
    return {'shared_items':sum(r['scope']=='shared' for r in rows),'project_items':sum(r['scope']=='project' for r in rows),'grants':grants,'items':rows}
@router.get('/knowledge/items/{id}',response_model=KnowledgeItemDetail)
async def item(id:str,user=Depends(require('ai'))):
    allowed=await permitted_filter(user)
    doc=await db.knowledge_items.find_one({'$and':[allowed,{'id':id}]},{'_id':0}) if allowed is not None else None
    if not doc:raise HTTPException(404,'Knowledge item not found')
    return doc
async def upsert_items(user,files,target,tags,source,counts):
    for path,raw in files:
        path=normalize_path(path);content_hash=digest(raw.hex() if not isinstance(raw,str) else raw)
        existing=await db.knowledge_items.find_one({'path':path},{'_id':0,'content_hash':1})
        if existing and existing['content_hash']==content_hash:
            await db.knowledge_items.update_one({'path':path},{'$set':{**target,'tags':tags}});counts['unchanged']+=1;continue
        try:
            text=extract_text(path,raw)
        except Exception:
            counts['skipped']=counts.get('skipped',0)+1;continue
        values={'title':title_of(path,text),'content':text,'content_hash':content_hash,'size':len(raw),'format':extension(path),'tags':tags,**target,'source':source,'updated_at':now()}
        values.setdefault('trust','reference')
        if existing:await db.knowledge_items.update_one({'path':path},{'$set':values});counts['updated']+=1
        else:await db.knowledge_items.insert_one({'id':uid(),'path':path,**values,'created_by':user['id'],'created_at':now()});counts['created']+=1
    return counts
@router.post('/knowledge/sync',response_model=KnowledgeSyncOut)
async def sync(data:KnowledgeSyncIn,user=Depends(require('manage'))):
    target=await resolve_target(user,data);counts={'created':0,'updated':0,'unchanged':0,'deleted':0,'skipped':0}
    await upsert_items(user,[(entry.path,decode_payload(entry.content,entry.encoding)) for entry in data.items],target,data.tags,'sync',counts)
    if data.deleted_paths:
        result=await db.knowledge_items.delete_many({'path':{'$in':[normalize_path(p) for p in data.deleted_paths]}});counts['deleted']=result.deleted_count
    await activity(user,f'synced {len(data.items)} knowledge file{"s" if len(data.items)!=1 else ""} into the vault',kind='knowledge')
    return counts
@router.post('/knowledge/upload',response_model=KnowledgeSyncOut)
async def upload(files:list[UploadFile]=File(...),scope:str=Form('shared'),transaction_id:str=Form(''),deal_type:str=Form(''),trust:str=Form('reference'),folder:str=Form(''),user=Depends(require('manage'))):
    if len(files)>50:raise HTTPException(422,'Upload at most 50 files per batch')
    try:target=await resolve_target(user,KnowledgeSyncIn(items=[{'path':'x.md','content':''}],scope=scope,transaction_id=transaction_id or None,deal_type=deal_type or None,trust=trust))
    except ValidationError:raise HTTPException(422,'Invalid scope, deal type or trust level')
    payload=[]
    for file in files:
        raw=await file.read(MAX_BYTES+1)
        if len(raw)>MAX_BYTES:raise HTTPException(413,f'{file.filename} exceeds 25 MB')
        payload.append(((folder.strip('/ ')+'/' if folder.strip('/ ') else '')+(file.filename or 'untitled.txt'),raw))
    counts=await upsert_items(user,payload,target,[],'upload',{'created':0,'updated':0,'unchanged':0,'deleted':0,'skipped':0})
    await activity(user,f'uploaded {len(files)} file{"s" if len(files)!=1 else ""} to the knowledge vault',kind='knowledge')
    return counts
@router.patch('/knowledge/items/{id}',response_model=KnowledgeItemOut)
async def patch_item(id:str,data:KnowledgeItemPatch,user=Depends(require('manage'))):
    doc=await db.knowledge_items.find_one({'id':id},ITEM_FIELDS)
    if not doc:raise HTTPException(404,'Knowledge item not found')
    merged={**doc,**data.model_dump(exclude_none=True)}
    if merged['scope']=='project':
        if not merged.get('transaction_id'):raise HTTPException(422,'Deal knowledge must be linked to a deal')
        tx=await Repo(user).get('transactions',merged['transaction_id'])
        if not data.deal_type and doc.get('transaction_id')!=merged['transaction_id']:merged['deal_type']=tx['deal_type']
        merged['deal_type']=merged.get('deal_type') or tx['deal_type']
    else:merged['transaction_id']=None
    values={k:merged.get(k) for k in ('scope','transaction_id','deal_type','tags','trust')};values['trust']=values['trust'] or 'reference';values['updated_at']=now()
    await db.knowledge_items.update_one({'id':id},{'$set':values})
    return await db.knowledge_items.find_one({'id':id},ITEM_FIELDS)
@router.delete('/knowledge/items/{id}',response_model=OK)
async def delete_item(id:str,user=Depends(require('manage'))):
    result=await db.knowledge_items.delete_one({'id':id})
    if not result.deleted_count:raise HTTPException(404,'Knowledge item not found')
    return {'message':'Knowledge item removed'}

async def validate_grant(data):
    person=await db.ws_users.find_one({'id':data.user_id,'active':True},{'_id':0,'password_hash':0})
    if not person:raise HTTPException(422,'User is unavailable')
    if person['role']=='OWNER':raise HTTPException(422,'Owners already have full knowledge access')
    if data.scope=='project' and not data.deal_types:raise HTTPException(422,'Select at least one deal type for deal knowledge')
    if data.path_prefix.strip():normalize_path(data.path_prefix)
    return person
async def store_grant(data,actor,authority,person,extra=None):
    record={'id':uid(),**data.model_dump(),'path_prefix':normalize_path(data.path_prefix) if data.path_prefix.strip() else '','user_name':person['name'],'granted_by':actor['id'],'granted_by_name':actor.get('name','Hermes'),'authority':authority,'active':True,'created_at':now(),'revoked_at':None,**(extra or {})}
    await db.knowledge_grants.insert_one(record.copy())
    await push_notification(person['id'],f'Knowledge access granted: {data.scope} vault{" · "+record["path_prefix"] if record["path_prefix"] else ""}','/workspace/knowledge')
    await db.events.insert_one({'id':uid(),'audience_ids':[person['id']],'created_at':now()})
    await activity(actor,f'granted {person["name"]} {data.scope} knowledge access ({authority})',kind='knowledge')
    return {k:v for k,v in record.items() if k not in ('policy_hash','confirmed_owner_id')}
@router.get('/knowledge/grants',response_model=list[GrantOut])
async def grants(user=Depends(require('ai'))):
    query={} if user['role']=='OWNER' else {'user_id':user['id'],'active':True}
    return await db.knowledge_grants.find(query,{'_id':0,'policy_hash':0,'confirmed_owner_id':0}).sort('created_at',-1).to_list(1000)
@router.post('/knowledge/grants',response_model=GrantOut,status_code=201)
async def create_grant(data:GrantIn,user=Depends(require('manage'))):
    person=await validate_grant(data);return await store_grant(data,user,'owner',person)
@router.delete('/knowledge/grants/{id}',response_model=OK)
async def revoke_grant(id:str,user=Depends(require('manage'))):
    grant=await db.knowledge_grants.find_one({'id':id,'active':True},{'_id':0})
    if not grant:raise HTTPException(404,'Grant not found')
    await db.knowledge_grants.update_one({'id':id},{'$set':{'active':False,'revoked_at':now(),'revoked_by':user['id']}})
    await activity(user,f'revoked {grant["user_name"]} {grant["scope"]} knowledge access',kind='knowledge')
    return {'message':'Knowledge access revoked'}

@router.post('/integrations/knowledge/confirmation',response_model=ConfirmationOut,tags=['Integration contracts'])
async def confirm_grant(data:GrantConfirmationIn,user=Depends(require('manage'))):
    await validate_grant(data);token=secrets.token_urlsafe(48)
    await db.approval_confirmations.insert_one({'hash':digest(token),'kind':'knowledge_grant','request_hash':digest(json.dumps(data.model_dump(),sort_keys=True)),'owner_id':user['id'],'used':False,'expires':datetime.now(timezone.utc)+timedelta(minutes=5)})
    await activity(user,'issued a single-use knowledge-access confirmation for Hermes',kind='knowledge')
    return {'confirmation_token':token,'expires_in':300}
@router.post('/integrations/hermes/knowledge/grants',response_model=GrantOut,status_code=201,tags=['Integration contracts'])
async def hermes_grant(data:HermesGrant,principal=Depends(service_principal)):
    await authorize(principal,'knowledge:grant');receipt_id=f'{principal["id"]}:{data.idempotency_key}'
    body=data.model_dump(exclude={'confirmation_token','idempotency_key'});request_hash=digest(json.dumps(body,sort_keys=True))
    existing=await db.integration_receipts.find_one({'id':receipt_id},{'_id':0})
    if existing:
        if existing['request_hash']!=request_hash:raise HTTPException(409,'Idempotency key was used for a different request')
        if 'result' in existing:return existing['result']
        raise HTTPException(409,'Grant is already being processed')
    grant=GrantIn(**body);person=await validate_grant(grant);extra={}
    if data.confirmation_token:
        proof=await db.approval_confirmations.find_one_and_update({'hash':digest(data.confirmation_token),'kind':'knowledge_grant','request_hash':request_hash,'used':False,'expires':{'$gt':datetime.now(timezone.utc)}},{'$set':{'used':True}},projection={'_id':0})
        if not proof:raise HTTPException(403,'Owner confirmation is invalid, expired, mismatched, or already used')
        if not await db.ws_users.find_one({'id':proof['owner_id'],'role':'OWNER','active':True},{'_id':0,'id':1}):raise HTTPException(403,'Owner authority has been revoked')
        authority='hermes_owner_confirmed';extra['confirmed_owner_id']=proof['owner_id']
    else:
        rules=KnowledgeRules(**(await settings()).get('knowledge_rules',{}))
        prefix_ok=not rules.path_prefixes or any(grant.path_prefix.strip() and normalize_path(grant.path_prefix).startswith(normalize_path(p)) for p in rules.path_prefixes)
        if not rules.enabled or person['role'] not in rules.roles or grant.scope not in rules.scopes or not set(grant.deal_types).issubset(set(rules.deal_types)) or not prefix_ok:
            raise HTTPException(403,'Explicit owner confirmation is required; knowledge-access rules do not cover this grant')
        if grant.scope=='project' and not await db.transactions.find_one({'$or':[{'assigned_ids':person['id']},{'client_ids':person['id']}],'deal_type':{'$in':grant.deal_types}},{'_id':0,'id':1}):
            raise HTTPException(403,'User is not actively involved in a deal of the requested type')
        authority='hermes_rule';extra['policy_hash']=digest(json.dumps(rules.model_dump(),sort_keys=True))
    try:await db.integration_receipts.insert_one({'id':receipt_id,'request_hash':request_hash,'created_at':now()})
    except DuplicateKeyError:raise HTTPException(409,'Grant is already being processed')
    result=await store_grant(grant,principal,authority,person,extra)
    await db.integration_receipts.update_one({'id':receipt_id},{'$set':{'result':result}})
    return result
