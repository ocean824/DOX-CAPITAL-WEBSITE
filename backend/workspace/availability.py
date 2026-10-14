"""Staff availability + bookable-slot computation, shared by workspace and site APIs."""
from datetime import date as _date, datetime, timezone
from workspace.core import db

DAYS = ["0", "1", "2", "3", "4", "5", "6"]  # 0 = Sunday .. 6 = Saturday
DEFAULT_WEEKLY = {d: {"on": d in ("1", "2", "3", "4", "5"), "start": "09:00", "end": "17:00"} for d in DAYS}


def default_availability(user_id):
    return {"user_id": user_id, "weekly": DEFAULT_WEEKLY, "blocked_dates": [], "slot_minutes": 30,
            "timezone": "UTC", "updated_at": datetime.now(timezone.utc).isoformat()}


async def get_availability(user_id):
    doc = await db.availability.find_one({"user_id": user_id}, {"_id": 0})
    return doc or default_availability(user_id)


async def save_availability(user_id, data):
    doc = {"user_id": user_id, "weekly": data["weekly"],
           "blocked_dates": data.get("blocked_dates", []),
           "slot_minutes": data.get("slot_minutes", 30),
           "timezone": data.get("timezone", "UTC"),
           "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.availability.update_one({"user_id": user_id}, {"$set": doc}, upsert=True)
    return doc


def _to_min(t):
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _to_str(mins):
    return f"{mins // 60:02d}:{mins % 60:02d}"


def _weekday_key(date_str):
    # python weekday(): Mon=0..Sun=6 ; map to Sun=0..Sat=6
    return str((_date.fromisoformat(date_str).weekday() + 1) % 7)


def person_slots(avail, date_str, busy=None):
    busy = busy or set()
    if date_str in (avail.get("blocked_dates") or []):
        return []
    day = (avail.get("weekly") or {}).get(_weekday_key(date_str))
    if not day or not day.get("on"):
        return []
    step = int(avail.get("slot_minutes") or 30)
    start, end = _to_min(day.get("start", "09:00")), _to_min(day.get("end", "17:00"))
    out, t = [], start
    while t + step <= end:
        s = _to_str(t)
        if s not in busy:
            out.append(s)
        t += step
    return out


async def _busy_for(user_id, date_str):
    rows = await db.bookings.find(
        {"status": "scheduled", "preferred_date": date_str,
         "$or": [{"participant_ids": user_id}, {"requested_by": user_id}]},
        {"_id": 0, "preferred_time": 1}).to_list(300)
    return {r.get("preferred_time") for r in rows if r.get("preferred_time")}


async def common_slots(user_ids, date_str):
    """Slots available to ALL people who have availability set. People without
    availability impose no constraint. Returns [] if nobody has availability set."""
    sets = []
    for uid_ in user_ids:
        avail = await db.availability.find_one({"user_id": uid_}, {"_id": 0})
        if not avail:
            continue
        sets.append(set(person_slots(avail, date_str, await _busy_for(uid_, date_str))))
    if not sets:
        return []
    inter = set.intersection(*sets) if len(sets) > 1 else sets[0]
    return sorted(inter)


async def all_have_no_availability(user_ids):
    for uid_ in user_ids:
        if await db.availability.find_one({"user_id": uid_}, {"_id": 0, "user_id": 1}):
            return False
    return True


async def validate_slot(user_ids, date_str, time_str):
    """(ok, offending_user_id). People without availability impose no constraint."""
    for uid_ in user_ids:
        avail = await db.availability.find_one({"user_id": uid_}, {"_id": 0})
        if not avail:
            continue
        if time_str not in person_slots(avail, date_str, await _busy_for(uid_, date_str)):
            return False, uid_
    return True, None
