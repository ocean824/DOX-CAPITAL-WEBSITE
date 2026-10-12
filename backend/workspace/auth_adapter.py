from fastapi import APIRouter, Depends
from workspace.core import require
from workspace.schemas import UserOut

router = APIRouter(prefix='/api/workspace/auth', tags=['Workspace session'])


@router.get('/me', response_model=UserOut)
async def me(user=Depends(require('read'))):
    return {**{k: v for k, v in user.items() if not k.startswith('_')}, 'created_at': user.get('created_at', '')}
