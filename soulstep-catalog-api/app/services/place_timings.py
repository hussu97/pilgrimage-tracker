"""Service for building place timing information (prayer times, services, deities)."""

from datetime import UTC, datetime

from sqlmodel import Session

from app.db import place_attributes as attr_db
from app.services.timezone_utils import get_local_now


def build_timings(place, session: Session, attrs: dict | None = None) -> list:
    """
    Build timing/schedule information for a place based on its religion and attributes.

    Returns a list of timing objects with type, name, subtitle, image_url, time, is_current, and status.

    - For Hinduism: Returns deity circles (deities attribute)
    - For Islam: Returns prayer times with past/current/upcoming status
    - For Christianity: Returns service times with past/current/upcoming status

    Requires session parameter.
    """
    # Fetch attributes if not provided
    if attrs is None:
        attrs = attr_db.get_attributes_dict(place.place_code, session)

    religion = getattr(place, "religion", "")
    result = []

    # Hinduism: deity circles
    if religion == "hinduism":
        deities = attrs.get("deities", [])
        if isinstance(deities, list):
            for d in deities:
                if isinstance(d, dict):
                    result.append(
                        {
                            "type": "deity",
                            "name": d.get("name", ""),
                            "subtitle": d.get("subtitle", ""),
                            "image_url": d.get("image_url", ""),
                            "time": "",
                            "is_current": False,
                            "status": "upcoming",
                        }
                    )
        return result

    # Islam: prayer times with past/current/upcoming status
    prayer_times = attrs.get("prayer_times", {})
    if prayer_times and isinstance(prayer_times, dict):
        # Use place's local time if offset is available
        utc_offset = getattr(place, "utc_offset_minutes", None)
        if utc_offset is not None:
            now = get_local_now(utc_offset)
        else:
            now = datetime.now(UTC)  # fallback for legacy data
        now_mins = now.hour * 60 + now.minute
        prayer_order = ["fajr", "dhuhr", "asr", "maghrib", "isha"]
        times_mins: dict = {}
        for key in prayer_order:
            t = prayer_times.get(key) or prayer_times.get(key.capitalize())
            if t and isinstance(t, str) and ":" in t:
                parts = t.split(":")
                try:
                    times_mins[key] = int(parts[0]) * 60 + int(parts[1])
                except (ValueError, IndexError):
                    pass
        next_prayer = next((k for k in prayer_order if times_mins.get(k, -1) > now_mins), None)
        if next_prayer is None and prayer_order:
            next_prayer = prayer_order[0]
        for key in prayer_order:
            t = prayer_times.get(key) or prayer_times.get(key.capitalize())
            if t:
                mins = times_mins.get(key, -1)
                if key == next_prayer:
                    status = "current"
                elif mins != -1 and mins < now_mins:
                    status = "past"
                else:
                    status = "upcoming"
                result.append(
                    {
                        "type": "prayer",
                        "name": key,
                        "subtitle": "",
                        "image_url": "",
                        "time": t,
                        "is_current": key == next_prayer,
                        "status": status,
                    }
                )
        return result

    # Christianity: service_times preferred (it's stored in attributes as either array or dict)
    service_times = attrs.get("service_times")
    service_times_array = service_times if isinstance(service_times, list) else []
    if service_times_array and isinstance(service_times_array, list):
        # Use place's local time if offset is available
        utc_offset = getattr(place, "utc_offset_minutes", None)
        if utc_offset is not None:
            now = get_local_now(utc_offset)
        else:
            now = datetime.now(UTC)  # fallback for legacy data
        today_name = now.strftime("%A")
        now_mins = now.hour * 60 + now.minute
        next_idx = None
        for i, svc in enumerate(service_times_array):
            if not isinstance(svc, dict):
                continue
            if svc.get("day", "") == today_name:
                svc_time = svc.get("time", "")
                if svc_time and ":" in svc_time:
                    try:
                        h, m = svc_time.split(":")[:2]
                        if int(h) * 60 + int(m) > now_mins:
                            next_idx = i
                            break
                    except (ValueError, IndexError):
                        pass
        for i, svc in enumerate(service_times_array):
            if not isinstance(svc, dict):
                continue
            svc_day = svc.get("day", "")
            svc_time = svc.get("time", "")
            is_past = False
            if svc_day == today_name and svc_time and ":" in svc_time:
                try:
                    h, m = svc_time.split(":")[:2]
                    is_past = int(h) * 60 + int(m) < now_mins
                except (ValueError, IndexError):
                    pass
            if i == next_idx:
                status = "current"
            elif svc_day == today_name and is_past:
                status = "past"
            else:
                status = "upcoming"
            result.append(
                {
                    "type": "service",
                    "name": svc.get("name") or svc_day,
                    "subtitle": svc_day,
                    "image_url": "",
                    "time": svc_time,
                    "is_current": i == next_idx,
                    "status": status,
                }
            )
        return result
    # Fallback for dict format service_times
    if service_times and isinstance(service_times, dict):
        for day, time_str in service_times.items():
            result.append(
                {
                    "type": "service",
                    "name": day,
                    "subtitle": "",
                    "image_url": "",
                    "time": time_str if isinstance(time_str, str) else "",
                    "is_current": False,
                    "status": "upcoming",
                }
            )
    return result
