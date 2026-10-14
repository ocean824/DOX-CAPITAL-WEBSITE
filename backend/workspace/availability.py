"""Staff availability + bookable-slot computation, shared by workspace and site APIs.

Slots are computed as absolute UTC instants so multiple staff (in different
timezones) can be intersected correctly and the client can see them in their own
local timezone. Each availability also has a buffer (gap enforced around existing
bookings) so staff are never scheduled back-to-back without breathing room.
"""
from datetime import date as _date, datetime, timedelta, timezone as _tz
from zoneinfo import ZoneInfo
from workspace.core import db

UTC = ZoneInfo("UTC")
DAYS = ["0", "1", "2", "3", "4", "5", "6"]  # 0 = Sunday .. 6 = Saturday
DEFAULT_WEEKLY = {d: {"on": d in ("1", "2", "3", "4", "5"), "start": "09:00", "end": "17:00"} for d in DAYS}


def default_availability(user_id):
    return {"user_id": user_id, "weekly": DEFAULT_WEEKLY, "blocked_dates": [], "slot_minutes": 30,
            "buffer_minutes": 0, "timezone": "UTC", "updated_at": datetime.now(_tz.utc).isoformat()}


async def get_availability(user_id):
    doc = await db.availability.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        return default_availability(user_id)
    doc.setdefault("buffer_minutes", 0)
    return doc


async def save_availability(user_id, data):
    doc = {"user_id": user_id, "weekly": data["weekly"],
           "blocked_dates": data.get("blocked_dates", []),
           "slot_minutes": data.get("slot_minutes", 30),
           "buffer_minutes": data.get("buffer_minutes", 0),
           "timezone": data.get("timezone", "UTC"),
           "updated_at": datetime.now(_tz.utc).isoformat()}
    await db.availability.update_one({"user_id": user_id}, {"$set": doc}, upsert=True)
    return doc


def _tzinfo(name):
    try:
        return ZoneInfo(name or "UTC")
    except Exception:
        return UTC


def _weekday_key(date_str):
    # python weekday(): Mon=0..Sun=6 ; map to Sun=0..Sat=6
    return str((_date.fromisoformat(date_str).weekday() + 1) % 7)


def _shift(date_str, days):
    return (_date.fromisoformat(date_str) + timedelta(days=days)).isoformat()


def _iso(dt_utc):
    return dt_utc.strftime("%Y-%m-%dT%H:%M:00Z")


def _day_window(avail, date_str):
    """(start_utc, end_utc, step, buffer) for the staff-local day, or None."""
    if date_str in (avail.get("blocked_dates") or []):
        return None
    day = (avail.get("weekly") or {}).get(_weekday_key(date_str))
    if not day or not day.get("on"):
        return None
    tz = _tzinfo(avail.get("timezone"))
    d = _date.fromisoformat(date_str)
    sh, sm = (int(x) for x in day.get("start", "09:00").split(":"))
    eh, em = (int(x) for x in day.get("end", "17:00").split(":"))
    start = datetime(d.year, d.month, d.day, sh, sm, tzinfo=tz).astimezone(UTC)
    end = datetime(d.year, d.month, d.day, eh, em, tzinfo=tz).astimezone(UTC)
    return start, end, int(avail.get("slot_minutes") or 30), int(avail.get("buffer_minutes") or 0)


def _conflicts(start, step, buffer, busy):
    for b in busy:
        if start < b + timedelta(minutes=step + buffer) and b < start + timedelta(minutes=step + buffer):
            return True
    return False


async def _busy_starts(user_id):
    rows = await db.bookings.find(
        {"status": "scheduled", "$or": [{"participant_ids": user_id}, {"requested_by": user_id}]},
        {"_id": 0, "preferred_date": 1, "preferred_time": 1, "timezone": 1}).to_list(500)
    out = []
    for r in rows:
        try:
            d = _date.fromisoformat(r["preferred_date"])
            hh, mm = (int(x) for x in r["preferred_time"].split(":"))
            out.append(datetime(d.year, d.month, d.day, hh, mm, tzinfo=_tzinfo(r.get("timezone"))).astimezone(UTC))
        except Exception:
            pass
    return out


def person_slots(avail, date_str, busy):
    w = _day_window(avail, date_str)
    if not w:
        return set()
    start, end, step, buffer = w
    out, t = set(), start
    while t + timedelta(minutes=step) <= end:
        if not _conflicts(t, step, buffer, busy):
            out.add(_iso(t))
        t += timedelta(minutes=step)
    return out


async def common_slots(user_ids, date_str):
    """Sorted UTC-ISO instants available to ALL people who have availability set.
    People without availability impose no constraint. [] if nobody has availability."""
    sets = []
    for uid_ in user_ids:
        avail = await db.availability.find_one({"user_id": uid_}, {"_id": 0})
        if not avail:
            continue
        sets.append(person_slots(avail, date_str, await _busy_starts(uid_)))
    if not sets:
        return []
    inter = set.intersection(*sets) if len(sets) > 1 else sets[0]
    return sorted(inter)


async def host_timezone(user_ids):
    for uid_ in user_ids:
        a = await db.availability.find_one({"user_id": uid_}, {"_id": 0, "timezone": 1})
        if a:
            return a.get("timezone") or "UTC"
    return "UTC"


async def all_have_no_availability(user_ids):
    for uid_ in user_ids:
        if await db.availability.find_one({"user_id": uid_}, {"_id": 0, "user_id": 1}):
            return False
    return True


async def validate_slot(user_ids, date_str, time_str, tz_name):
    """(ok, offending_user_id). People without availability impose no constraint."""
    try:
        d = _date.fromisoformat(date_str)
        hh, mm = (int(x) for x in time_str.split(":"))
        inst = _iso(datetime(d.year, d.month, d.day, hh, mm, tzinfo=_tzinfo(tz_name)).astimezone(UTC))
    except Exception:
        return True, None
    for uid_ in user_ids:
        avail = await db.availability.find_one({"user_id": uid_}, {"_id": 0})
        if not avail:
            continue
        busy = await _busy_starts(uid_)
        allowed = set()
        for dd in (_shift(date_str, -1), date_str, _shift(date_str, 1)):
            allowed |= person_slots(avail, dd, busy)
        if inst not in allowed:
            return False, uid_
    return True, None
