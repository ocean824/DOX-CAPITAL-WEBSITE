from workspace.core import db, now, DEFAULT_PREFERENCES, workspace_role
from workspace.schemas import DEFAULT_CHECKLIST, DEFAULT_DEAL_TYPES, DEFAULT_REQUIRED_DOCUMENTS

STAGES = [('lead','Lead','#829fba'),('qualified','Qualified','#b5a0c4'),('underwriting','Underwriting','#e5b869'),('term_sheet','Term sheet','#c4a07a'),('closing','Closing / funding','#79b99d')]
RENAMES = {'address':'title','property_type':'deal_type','contract_date':'engagement_date','contingency_date':'diligence_date','closing_date':'close_date','buyer_id':'counterparty_id','agent':'deal_lead'}


async def migrate_deal_records():
    """One-time rename of the ported real-estate fields onto deal-agnostic ones."""
    async for tx in db.transactions.find({'address': {'$exists': True}}, {'_id': 0}):
        values = {new: tx[old] for old, new in RENAMES.items() if old in tx}
        values['location'] = ', '.join(str(tx.get(k) or '').strip() for k in ('city','state','zip') if str(tx.get(k) or '').strip())
        if values.get('deal_type') not in DEFAULT_DEAL_TYPES:
            values['deal_type'] = 'Underwriting'
        await db.transactions.update_one({'id': tx['id']}, {'$set': values,
            '$unset': {k: '' for k in list(RENAMES) + ['city','state','zip','seller_id']}})
    await db.contacts.update_many({'type': 'buyer'}, {'$set': {'type': 'client'}})
    await db.contacts.update_many({'type': 'seller'}, {'$set': {'type': 'counterparty'}})
    await db.knowledge_items.update_many({'trust': {'$exists': False}}, {'$set': {'trust': 'reference'}})
    await db.knowledge_items.update_many({'project_type': {'$exists': True}}, [{'$set': {'deal_type': '$project_type'}}, {'$unset': 'project_type'}])
    await db.knowledge_grants.update_many({'project_types': {'$exists': True}}, [{'$set': {'deal_types': '$project_types'}}, {'$unset': 'project_types'}])


async def sync_workspace_users():
    """Mirrors thedoxs.com accounts into ws_users so owners can assign work before a first visit."""
    async for site_user in db.users.find({}, {'_id':0,'id':1,'name':1,'email':1,'role':1,'status':1,'workspace_role':1}):
        role = workspace_role(site_user)
        await db.ws_users.update_one({'id': site_user['id']},
            {'$set': {'name': site_user.get('name') or site_user['email'], 'email': site_user['email'],
                      'role': role or 'CLIENT', 'active': bool(role)},
             '$setOnInsert': {'notification_preferences': DEFAULT_PREFERENCES, 'created_at': now()}}, upsert=True)


async def seed():
    for name in ['ws_users','transactions','contacts','tasks','documents','reviews','threads','messages','ai_daily_usage','service_keys','integration_receipts','pipeline_stages','settings','knowledge_items','knowledge_grants','meetings']:
        await db[name].create_index('id', unique=True)
    await db.meetings.create_index([('participant_ids',1),('starts_at',1)])
    await db.knowledge_items.create_index('path', unique=True)
    await db.knowledge_items.create_index([('title','text'),('content','text'),('tags','text')], name='knowledge_text')
    await db.knowledge_grants.create_index([('user_id',1),('active',1)])
    await db.approval_confirmations.create_index('expires', expireAfterSeconds=0)
    await db.transactions.create_index('assigned_ids'); await db.transactions.create_index('client_ids')
    await db.contacts.create_index('assigned_ids'); await db.messages.create_index([('thread_id',1),('created_at',1)])
    for name in ['tasks','documents','reviews','review_comments']: await db[name].create_index('transaction_id')
    await db.settings.update_one({'id':'workspace'},{'$setOnInsert':{'team_daily_limit':30,'client_daily_limit':10,'autonomous_approvals':False,'autonomous_max_value':500000,
        'deal_types':list(DEFAULT_DEAL_TYPES),'checklist_template':[dict(s) for s in DEFAULT_CHECKLIST],'required_documents':list(DEFAULT_REQUIRED_DOCUMENTS),
        'knowledge_rules':{'enabled':False,'roles':['TEAM_MEMBER'],'scopes':['project'],'deal_types':list(DEFAULT_DEAL_TYPES),'path_prefixes':[]}}}, upsert=True)
    await db.settings.update_one({'id':'workspace','deal_types':{'$exists':False}},{'$set':{'deal_types':list(DEFAULT_DEAL_TYPES),
        'checklist_template':[dict(s) for s in DEFAULT_CHECKLIST],'required_documents':list(DEFAULT_REQUIRED_DOCUMENTS),
        'knowledge_rules':{'enabled':False,'roles':['TEAM_MEMBER'],'scopes':['project'],'deal_types':list(DEFAULT_DEAL_TYPES),'path_prefixes':[]}}})
    await db.service_keys.update_many({'service':'hermes','scopes':{'$ne':'knowledge:grant'}},{'$addToSet':{'scopes':'knowledge:grant'}})
    for position,(id,name,color) in enumerate(STAGES):
        await db.pipeline_stages.update_one({'id':id},{'$setOnInsert':{'name':name,'color':color,'position':position}}, upsert=True)
    await sync_workspace_users()
    await migrate_deal_records()
