from datetime import datetime
from fastapi import APIRouter,Depends,HTTPException
from workspace.core import db,uid,now,require,Repo,activity,push_notification
from workspace.schemas import MeetingIn,MeetingPatch,MeetingOut,RespondIn,OK,AvailabilityIn,AvailabilityOut
from workspace.availability import get_availability,save_availability
router=APIRouter(prefix='/api/workspace',tags=['Calendar & meetings'])

@router.get('/availability',response_model=AvailabilityOut)
async def my_availability(user=Depends(require('read'))):
    if user['role']=='CLIENT':raise HTTPException(403,'Availability is for staff only')
    return await get_availability(user['id'])
@router.put('/availability',response_model=AvailabilityOut)
async def set_my_availability(data:AvailabilityIn,user=Depends(require('read'))):
    if user['role']=='CLIENT':raise HTTPException(403,'Availability is for staff only')
    return await save_availability(user['id'],{'weekly':{k:v.model_dump() for k,v in data.weekly.items()},'blocked_dates':data.blocked_dates,'slot_minutes':data.slot_minutes,'timezone':data.timezone})

async def notify(ids,title,link,exclude):
    for member in set(ids):
        if member==exclude:continue
        await push_notification(member,title,link)
    await db.events.insert_one({'id':uid(),'audience_ids':list(set(ids)),'created_at':now()})
def check_time(value):
    try:
        if datetime.fromisoformat(value)<datetime(2000,1,1):raise ValueError()
    except ValueError:raise HTTPException(422,'Meeting time must be a valid date and time')
async def allowed_people(tx):
    owners=[o['id'] for o in await db.ws_users.find({'role':'OWNER','active':True},{'_id':0,'id':1}).to_list(50)]
    return set(owners+tx['assigned_ids']+tx['client_ids'])
def label(meeting):return f'{meeting["title"]} · {meeting["starts_at"].replace("T"," ")}'

@router.get('/meetings',response_model=list[MeetingOut])
async def meetings(user=Depends(require('read'))):return await Repo(user).list('meetings',sort=('starts_at',1),limit=1000)
@router.post('/meetings',response_model=MeetingOut,status_code=201)
async def create_meeting(data:MeetingIn,user=Depends(require('read'))):
    repo=Repo(user);tx=await repo.get('transactions',data.transaction_id);check_time(data.starts_at)
    people=await allowed_people(tx);participants=list(set(data.participant_ids+[user['id']]))
    for id in participants:
        if id not in people:raise HTTPException(422,'Every participant must be on this transaction')
        if not await db.ws_users.find_one({'id':id,'active':True},{'_id':0,'id':1}):raise HTTPException(422,'Participant is unavailable')
    if len(participants)<2:raise HTTPException(422,'Invite at least one other person')
    record=await repo.insert('meetings',{**data.model_dump(),'participant_ids':participants,'organizer_id':user['id'],'organizer_name':user['name'],'status':'scheduled','responses':{id:('accepted' if id==user['id'] else 'pending') for id in participants}})
    await activity(user,f'proposed a meeting: {data.title}',tx,'meeting',False)
    await notify(participants,f'{user["name"]} invited you: {label(record)}',f'/workspace/calendar?meeting={record["id"]}',user['id'])
    return record
@router.patch('/meetings/{id}',response_model=MeetingOut)
async def update_meeting(id:str,data:MeetingPatch,user=Depends(require('read'))):
    repo=Repo(user);meeting=await repo.get('meetings',id)
    if meeting['organizer_id']!=user['id'] and user['role']!='OWNER':raise HTTPException(403,'Only the organizer or an owner can change this meeting')
    if meeting['status']=='cancelled':raise HTTPException(409,'Meeting is already cancelled')
    values=data.model_dump(exclude_none=True)
    if 'starts_at' in values:
        check_time(values['starts_at'])
        if values['starts_at']!=meeting['starts_at']:values['responses']={pid:('accepted' if pid==user['id'] else 'pending') for pid in meeting['participant_ids']}
    record=await repo.update('meetings',id,values);tx=await repo.get('transactions',meeting['transaction_id'])
    cancelled=values.get('status')=='cancelled'
    await activity(user,f'{"cancelled" if cancelled else "updated"} meeting: {record["title"]}',tx,'meeting',False)
    await notify(meeting['participant_ids'],f'{user["name"]} {"cancelled" if cancelled else "rescheduled" if "starts_at" in values else "updated"}: {label(record)}',f'/workspace/calendar?meeting={id}',user['id'])
    return record
@router.post('/meetings/{id}/respond',response_model=MeetingOut)
async def respond(id:str,data:RespondIn,user=Depends(require('read'))):
    repo=Repo(user);meeting=await repo.get('meetings',id)
    if meeting['status']=='cancelled':raise HTTPException(409,'Meeting was cancelled')
    record=await repo.update('meetings',id,{f'responses.{user["id"]}':data.response})
    await notify([meeting['organizer_id']],f'{user["name"]} {data.response} {label(record)}',f'/workspace/calendar?meeting={id}',user['id'])
    return record
@router.delete('/meetings/{id}',response_model=OK)
async def cancel_meeting(id:str,user=Depends(require('read'))):
    await update_meeting(id,MeetingPatch(status='cancelled'),user);return {'message':'Meeting cancelled'}
