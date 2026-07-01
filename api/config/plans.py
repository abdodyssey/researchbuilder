from datetime import timedelta

PLANS = {
    "trial": {
        "tokens": 100000,
        "max_refs": 5,
        "template_upload": False,
        "history_days": 7,
        "duration_days": 30,
    },
    "basic": {
        "tokens": 500000,
        "max_refs": 10,
        "template_upload": False,
        "history_days": 30,
        "duration_days": None,
    },
    "premium": {
        "tokens": -1,
        "max_refs": 15,
        "template_upload": True,
        "history_days": -1,
        "duration_days": None,
    },
}

def get_plan(plan_name: str) -> dict:
    return PLANS.get(plan_name, PLANS["trial"])

def is_unlimited(plan_name: str) -> bool:
    return PLANS.get(plan_name, {}).get("tokens", 0) == -1
