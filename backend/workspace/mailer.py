import os, logging
from html import escape
import httpx

logger = logging.getLogger('workspace.mailer')
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '').strip()
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
APP_ORIGIN = os.environ.get('APP_ORIGIN', '').rstrip('/')


def _html(name, title, link):
    url = f'{APP_ORIGIN}{link}' if APP_ORIGIN and link.startswith('/') else link
    action = f'<p style="margin:22px 0 0"><a href="{escape(url)}" style="color:#e5b869">Open the workspace</a></p>' if url.startswith('https://') else ''
    return (f'<table role="presentation" width="100%" style="background:#0b0e12;padding:32px"><tr><td>'
            f'<table role="presentation" width="560" align="center" style="background:#12161d;border:1px solid #242a34;padding:28px;'
            f'font-family:Helvetica,Arial,sans-serif;color:#f1f2f4"><tr><td>'
            f'<div style="letter-spacing:.3em;font-size:10px;color:#e5b869;text-transform:uppercase">D.O.X Workspace</div>'
            f'<h1 style="font-size:19px;font-weight:500;margin:10px 0 18px">{escape(title)}</h1>'
            f'<p style="color:#9198a5;font-size:13px;margin:0">Hello {escape(name or "there")}, there is an update in your workspace.</p>'
            f'{action}<p style="color:#6d7483;font-size:11px;margin:26px 0 0">You can turn these emails off in Workspace → Settings → Notification preferences.</p>'
            f'</td></tr></table></td></tr></table>')


async def send_workspace_email(to, name, title, link):
    if not RESEND_API_KEY:
        logger.info('[WORKSPACE EMAIL MOCK] to=%s subject=%s', to, title)
        return
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post('https://api.resend.com/emails',
                                         headers={'Authorization': f'Bearer {RESEND_API_KEY}'},
                                         json={'from': SENDER_EMAIL, 'to': [to], 'subject': f'[D.O.X Workspace] {title}', 'html': _html(name, title, link)})
        if response.status_code >= 400:
            logger.warning('[WORKSPACE EMAIL FAILED] to=%s status=%s', to, response.status_code)
    except httpx.HTTPError as exc:
        logger.warning('[WORKSPACE EMAIL FAILED] to=%s err=%s', to, exc)
