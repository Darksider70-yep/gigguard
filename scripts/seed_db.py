#!/usr/bin/env python3
"""Seed GigGuard PostgreSQL with deterministic synthetic demo data."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import psycopg2
from psycopg2.extras import Json, execute_values

np.random.seed(42)

h3 = None
try:
    import h3  # type: ignore
except ImportError:
    if sys.version_info >= (3, 13):
        print("[seed_db] warning: h3==3.7.7 is unavailable on Python 3.13; using deterministic fallback home_hex_id")
    else:
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "h3==3.7.7"])
            import h3  # type: ignore
        except Exception as exc:  # pragma: no cover - environment fallback
            print(f"[seed_db] warning: h3 install failed ({exc}); using deterministic fallback home_hex_id")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml-service"))

from premium.zones import ZONES  # noqa: E402

FIRST_NAMES = [
    "Aarav", "Arjun", "Vikram", "Rahul", "Amit", "Suresh", "Rajesh",
    "Priya", "Sneha", "Ananya", "Divya", "Kavya", "Pooja", "Neha",
    "Sameer", "Ravi", "Kiran", "Deepak", "Mohan", "Sanjay", "Rohit",
    "Aditya", "Varun", "Nikhil", "Pranav", "Siddharth", "Harish",
    "Lakshmi", "Meena", "Sunita", "Rekha", "Savita", "Usha", "Geeta",
    "Ramesh", "Ganesh", "Mahesh", "Suresh", "Dinesh", "Naresh",
    "Fatima", "Zara", "Ayesha", "Noor", "Sana", "Hira", "Rubina",
    "Mohammed", "Imran", "Salman", "Farhan", "Aziz", "Tariq",
]
LAST_NAMES = [
    "Kumar", "Sharma", "Singh", "Patel", "Gupta", "Verma", "Yadav",
    "Reddy", "Nair", "Menon", "Iyer", "Pillai", "Rao", "Murthy",
    "Shaikh", "Khan", "Ansari", "Siddiqui", "Qureshi", "Malik",
    "Joshi", "Mishra", "Pandey", "Tiwari", "Dubey", "Shukla",
    "Chatterjee", "Banerjee", "Das", "Bose", "Sen", "Ghosh",
    "Naidu", "Chowdary", "Raju", "Babu", "Swamy", "Prasad",
]

CITY_DISTRIBUTION = {
    "Mumbai": {"total": 30, "zomato": 15, "swiggy": 15, "mean": 750, "std": 80, "low": 500, "high": 1000},
    "Delhi": {"total": 25, "zomato": 13, "swiggy": 12, "mean": 700, "std": 90, "low": 500, "high": 950},
    "Chennai": {"total": 25, "zomato": 12, "swiggy": 13, "mean": 800, "std": 75, "low": 550, "high": 1050},
    "Bangalore": {"total": 22, "zomato": 11, "swiggy": 11, "mean": 850, "std": 85, "low": 600, "high": 1100},
    "Hyderabad": {"total": 18, "zomato": 9, "swiggy": 9, "mean": 680, "std": 80, "low": 480, "high": 900},
}

SEED_EVENTS = [
    {"trigger_type": "heavy_rainfall", "city": "Mumbai", "zone": "Andheri West", "value": 25.4, "threshold": 15, "disruption_hours": 4, "severity": "severe", "days_ago": 10},
    {"trigger_type": "extreme_heat", "city": "Mumbai", "zone": "Andheri West", "value": 45.2, "threshold": 44, "disruption_hours": 4, "severity": "moderate", "days_ago": 18},
    {"trigger_type": "flood_red_alert", "city": "Mumbai", "zone": "Kurla", "value": 1, "threshold": 1, "disruption_hours": 8, "severity": "extreme", "days_ago": 23},
    {"trigger_type": "severe_aqi", "city": "Delhi", "zone": "Connaught Place", "value": 342, "threshold": 300, "disruption_hours": 5, "severity": "severe", "days_ago": 3},
    {"trigger_type": "extreme_heat", "city": "Delhi", "zone": "Lajpat Nagar", "value": 46.1, "threshold": 44, "disruption_hours": 4, "severity": "extreme", "days_ago": 31},
    {"trigger_type": "severe_aqi", "city": "Delhi", "zone": "Rohini", "value": 385, "threshold": 300, "disruption_hours": 5, "severity": "extreme", "days_ago": 45},
    {"trigger_type": "extreme_heat", "city": "Chennai", "zone": "T. Nagar", "value": 44.8, "threshold": 44, "disruption_hours": 4, "severity": "moderate", "days_ago": 7},
    {"trigger_type": "heavy_rainfall", "city": "Chennai", "zone": "Adyar", "value": 19.2, "threshold": 15, "disruption_hours": 4, "severity": "moderate", "days_ago": 14},
    {"trigger_type": "flood_red_alert", "city": "Chennai", "zone": "Velachery", "value": 1, "threshold": 1, "disruption_hours": 8, "severity": "extreme", "days_ago": 52},
    {"trigger_type": "heavy_rainfall", "city": "Bangalore", "zone": "Koramangala", "value": 17.8, "threshold": 15, "disruption_hours": 4, "severity": "moderate", "days_ago": 5},
    {"trigger_type": "severe_aqi", "city": "Bangalore", "zone": "Electronic City", "value": 318, "threshold": 300, "disruption_hours": 5, "severity": "moderate", "days_ago": 28},
    {"trigger_type": "extreme_heat", "city": "Hyderabad", "zone": "Banjara Hills", "value": 44.7, "threshold": 44, "disruption_hours": 4, "severity": "moderate", "days_ago": 12},
    {"trigger_type": "extreme_heat", "city": "Hyderabad", "zone": "Charminar", "value": 47.3, "threshold": 44, "disruption_hours": 4, "severity": "extreme", "days_ago": 35},
    {"trigger_type": "curfew_strike", "city": "Delhi", "zone": "Connaught Place", "value": 1, "threshold": 1, "disruption_hours": 8, "severity": "extreme", "days_ago": 60},
    {"trigger_type": "heavy_rainfall", "city": "Mumbai", "zone": "Bandra", "value": 22.1, "threshold": 15, "disruption_hours": 4, "severity": "severe", "days_ago": 40},
]


@dataclass
class WorkerRecord:
    id: str
    name: str
    phone_number: str
    platform: str
    city: str
    zone: str
    zone_id: str
    lat: float
    lng: float
    home_hex_id: int
    avg_daily_earning: float
    avg_daily_hours: float
    zone_multiplier: float
    history_multiplier: float
    upi_vpa: str
    device_id: str
    device_fingerprint: str
    created_at: datetime


def _db_url() -> str:
    value = os.environ.get("DATABASE_URL", "").strip()
    if not value:
        raise RuntimeError("DATABASE_URL is required")
    return value


def _monday(dt: datetime) -> datetime:
    return (dt - timedelta(days=dt.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


def _det_uuid(kind: str, key: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"gigguard:{kind}:{key}"))


def _realistic_name(index: int) -> Tuple[str, str]:
    first = FIRST_NAMES[index % len(FIRST_NAMES)]
    last = LAST_NAMES[(index * 7) % len(LAST_NAMES)]
    return first, f"{first} {last}"


def _zone_maps() -> Tuple[Dict[str, List[dict]], Dict[Tuple[str, str], dict]]:
    city_zones: Dict[str, List[dict]] = defaultdict(list)
    by_city_zone: Dict[Tuple[str, str], dict] = {}
    for zone in ZONES:
        city = str(zone["city"])
        city_zones[city].append(zone)
        by_city_zone[(city, str(zone["zone"]))] = zone
    return city_zones, by_city_zone


def _earning_for_city(city: str) -> float:
    cfg = CITY_DISTRIBUTION[city]
    value = np.random.normal(cfg["mean"], cfg["std"])
    return float(np.clip(value, cfg["low"], cfg["high"]))


def _geo_to_h3_hex(lat: float, lng: float, resolution: int = 8) -> str:
    if h3 is not None:
        return str(h3.geo_to_h3(lat, lng, resolution))
    raw = f"{lat:.6f}:{lng:.6f}:{resolution}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:15]


def build_workers(now: datetime) -> List[WorkerRecord]:
    city_zones, _ = _zone_maps()
    workers: List[WorkerRecord] = []
    phone_counter = 9700000000
    idx = 0

    for city, cfg in CITY_DISTRIBUTION.items():
        platform_sequence = ["zomato"] * cfg["zomato"] + ["swiggy"] * cfg["swiggy"]
        zones = city_zones[city]
        for i in range(cfg["total"]):
            first_name, full_name = _realistic_name(idx)
            zone = zones[i % len(zones)]
            phone_counter += 1
            phone = f"+91{phone_counter}"

            worker_id = _det_uuid("worker", f"{city}:{i}:{phone}")
            created_at = now - timedelta(days=int(np.random.randint(7, 426)))
            home_hex = int(_geo_to_h3_hex(float(zone["lat"]), float(zone["lng"]), 8), 16)
            device_id = _det_uuid("device", worker_id)
            device_fp = hashlib.sha256(device_id.encode("utf-8")).hexdigest()[:64]

            workers.append(
                WorkerRecord(
                    id=worker_id,
                    name=full_name,
                    phone_number=phone,
                    platform=platform_sequence[i],
                    city=city,
                    zone=str(zone["zone"]),
                    zone_id=str(zone["zone_id"]),
                    lat=float(zone["lat"]),
                    lng=float(zone["lng"]),
                    home_hex_id=home_hex,
                    avg_daily_earning=round(_earning_for_city(city), 2),
                    avg_daily_hours=round(float(np.random.uniform(6, 10)), 1),
                    zone_multiplier=float(zone["zone_multiplier"]),
                    history_multiplier=1.0,
                    upi_vpa=f"{first_name.lower()}{int(np.random.randint(1000, 9999))}@upi",
                    device_id=device_id,
                    device_fingerprint=device_fp,
                    created_at=created_at,
                )
            )
            idx += 1
    return workers


def _policy_offsets_for_worker(city: str, event_offsets_by_city: Dict[str, List[int]]) -> List[int]:
    required = sorted(set(event_offsets_by_city.get(city, [])))
    min_policies = max(2, min(8, len(required) + 1))
    num_policies = int(np.random.randint(min_policies, 9))
    offsets = {0}
    offsets.update(required[: max(0, num_policies - 1)])
    while len(offsets) < num_policies:
        offsets.add(int(np.random.randint(1, 61)))
    return sorted(offsets)


def _coverage_amount(avg_daily_earning: float) -> float:
    return float(np.floor(min(avg_daily_earning * 0.8, 800.0)))


def build_policies(workers: List[WorkerRecord], now: datetime) -> Tuple[List[tuple], Dict[Tuple[str, datetime], dict]]:
    event_offsets_by_city: Dict[str, List[int]] = defaultdict(list)
    current_monday = _monday(now)
    for event in SEED_EVENTS:
        event_time = now - timedelta(days=int(event["days_ago"]))
        week_start = _monday(event_time)
        offset = int((current_monday - week_start).days // 7)
        event_offsets_by_city[str(event["city"])].append(offset)

    rows: List[tuple] = []
    lookup: Dict[Tuple[str, datetime], dict] = {}
    for worker in workers:
        offsets = _policy_offsets_for_worker(worker.city, event_offsets_by_city)
        for offset in offsets:
            week_start = current_monday - timedelta(days=offset * 7)
            week_end = week_start + timedelta(days=6)
            weather_multiplier = float(np.random.uniform(0.95, 1.25))
            premium = round(35.0 * worker.zone_multiplier * weather_multiplier * worker.history_multiplier, 2)
            status = "active" if offset == 0 else "expired"
            policy_id = _det_uuid("policy", f"{worker.id}:{week_start.date().isoformat()}")
            purchased_at = week_start + timedelta(days=1, hours=int(np.random.randint(7, 22)))
            recommended_arm = int(np.random.choice([0, 1, 2, 3], p=[0.18, 0.32, 0.36, 0.14]))
            arm_accepted = bool(np.random.random() < 0.74)

            rows.append(
                (
                    policy_id,
                    worker.id,
                    worker.zone,
                    _coverage_amount(worker.avg_daily_earning),
                    week_start.date(),
                    status == "active",
                    purchased_at,
                    purchased_at,
                    premium,
                    week_end.date(),
                    status,
                    recommended_arm,
                    arm_accepted,
                    f"{worker.platform.lower()}_{worker.city.lower()}_seed",
                    f"order_seed_{uuid.uuid5(uuid.NAMESPACE_DNS, policy_id).hex[:16]}",
                    f"pay_seed_{uuid.uuid5(uuid.NAMESPACE_URL, policy_id).hex[:16]}",
                    purchased_at,
                )
            )
            lookup[(worker.id, week_start)] = {"id": policy_id, "status": status}
    return rows, lookup


def build_events(now: datetime) -> Tuple[List[tuple], Dict[str, dict]]:
    _, by_city_zone = _zone_maps()
    rows: List[tuple] = []
    event_meta: Dict[str, dict] = {}
    for idx, event in enumerate(SEED_EVENTS):
        zone = by_city_zone[(str(event["city"]), str(event["zone"]))]
        event_start = now - timedelta(days=int(event["days_ago"]))
        event_end = event_start + timedelta(hours=int(event["disruption_hours"]))
        hex_id = int(_geo_to_h3_hex(float(zone["lat"]), float(zone["lng"]), 8), 16)
        event_id = _det_uuid("event", f"{idx}:{event['city']}:{event['zone']}:{event['days_ago']}")
        status = "active" if int(event["days_ago"]) <= 7 else "processed"
        row = (
            event_id,
            event["trigger_type"],
            event["city"],
            event["zone"],
            float(zone["lat"]),
            float(zone["lng"]),
            0,
            0.0,
            event_start,
            [hex_id],
            float(event["value"]),
            int(event["disruption_hours"]),
            event_start,
            event_end,
            status,
            float(event["threshold"]),
            event["severity"],
            0,
            0,
            0.0,
        )
        rows.append(row)
        event_meta[event_id] = {
            **event,
            "event_start": event_start,
            "week_start": _monday(event_start),
        }
    return rows, event_meta


def _fraud_score() -> float:
    r = np.random.random()
    if r < 0.85:
        return float(np.random.uniform(0.05, 0.28))
    if r < 0.95:
        return float(np.random.uniform(0.30, 0.64))
    return float(np.random.uniform(0.66, 0.89))


def _claim_status(days_ago: int) -> str:
    roll = np.random.random()
    if days_ago > 30:
        return "paid"
    if 8 <= days_ago <= 30:
        return "under_review" if roll < 0.10 else "paid"
    if roll < 0.60:
        return "paid"
    if roll < 0.90:
        return "approved"
    return "triggered"


def build_claims_and_payouts(
    workers: List[WorkerRecord],
    policy_lookup: Dict[Tuple[str, datetime], dict],
    event_meta: Dict[str, dict],
) -> Tuple[List[tuple], List[tuple], Dict[str, Dict[str, float]], List[str]]:
    workers_by_city_zone: Dict[Tuple[str, str], List[WorkerRecord]] = defaultdict(list)
    for worker in workers:
        workers_by_city_zone[(worker.city, worker.zone)].append(worker)

    claim_rows: List[tuple] = []
    payout_rows: List[tuple] = []
    event_rollups: Dict[str, Dict[str, float]] = defaultdict(lambda: {"count": 0, "total": 0.0})
    claimed_policy_ids: List[str] = []

    for event_id, meta in event_meta.items():
        candidates = workers_by_city_zone[(str(meta["city"]), str(meta["zone"]))]
        week_start = meta["week_start"]
        for worker in candidates:
            policy = policy_lookup.get((worker.id, week_start))
            if not policy:
                continue

            claim_id = _det_uuid("claim", f"{event_id}:{worker.id}")
            disruption_hours = int(meta["disruption_hours"])
            payout_amount = float(round(min((worker.avg_daily_earning / 8.0) * disruption_hours * 0.8, 800.0), 2))
            status = _claim_status(int(meta["days_ago"]))
            fraud = _fraud_score()
            bcs = int(round((1.0 - fraud) * 100))
            created_at = meta["event_start"] + timedelta(minutes=int(np.random.randint(8, 160)))
            paid_at = created_at + timedelta(minutes=int(np.random.randint(8, 22))) if status == "paid" else None
            graph_flags = ["shared_upi_with_workers"] if fraud > 0.65 else []

            claim_rows.append(
                (
                    claim_id,
                    worker.id,
                    policy["id"],
                    event_id,
                    meta["trigger_type"],
                    payout_amount,
                    disruption_hours,
                    fraud,
                    fraud,
                    None,
                    Json(graph_flags),
                    bcs,
                    status,
                    "seeded_claim",
                    created_at,
                    paid_at,
                    float(meta["value"]),
                    float(meta["threshold"]),
                )
            )

            event_rollups[event_id]["count"] += 1
            if status in {"paid", "approved"}:
                event_rollups[event_id]["total"] += payout_amount
            if status == "paid":
                payout_id = _det_uuid("payout", claim_id)
                payout_rows.append(
                    (
                        payout_id,
                        claim_id,
                        worker.id,
                        payout_amount,
                        worker.upi_vpa,
                        f"pay_RZP{uuid.uuid5(uuid.NAMESPACE_URL, payout_id).hex[:8].upper()}",
                        f"fa_{uuid.uuid5(uuid.NAMESPACE_DNS, payout_id).hex[:12]}",
                        "paid",
                        created_at,
                        paid_at,
                    )
                )
            if policy["status"] != "active":
                claimed_policy_ids.append(policy["id"])
    return claim_rows, payout_rows, event_rollups, claimed_policy_ids


def _insert_bandit_state(cur) -> None:
    bandit_state = {
        "n_arms": 4,
        "global_alpha": [12.0, 28.0, 45.0, 18.0],
        "global_beta": [8.0, 15.0, 22.0, 12.0],
        "context_states": {
            "zomato_mumbai_veteran_monsoon_high": {"alpha": [3, 8, 15, 4], "beta": [5, 6, 8, 7]},
            "swiggy_mumbai_new_monsoon_high": {"alpha": [2, 5, 8, 2], "beta": [4, 7, 10, 5]},
            "zomato_delhi_veteran_summer_high": {"alpha": [4, 10, 18, 5], "beta": [3, 5, 9, 6]},
            "swiggy_delhi_mid_winter_high": {"alpha": [3, 7, 12, 4], "beta": [4, 6, 8, 5]},
            "zomato_chennai_veteran_other_medium": {"alpha": [2, 6, 10, 3], "beta": [3, 5, 7, 4]},
            "swiggy_bangalore_mid_other_low": {"alpha": [5, 12, 8, 2], "beta": [2, 4, 6, 5]},
            "zomato_hyderabad_new_summer_medium": {"alpha": [2, 4, 6, 2], "beta": [4, 6, 8, 4]},
        },
    }
    cur.execute(
        """
        INSERT INTO bandit_state (id, state, updated_at)
        VALUES (1, %s, NOW())
        ON CONFLICT (id) DO UPDATE
          SET state = EXCLUDED.state, updated_at = NOW()
        """,
        (Json(bandit_state),),
    )


def main() -> None:
    db_url = _db_url()
    now = datetime.now(timezone.utc).replace(microsecond=0)

    workers = build_workers(now)
    assert len(workers) == 120

    policy_rows, policy_lookup = build_policies(workers, now)
    event_rows, event_meta = build_events(now)
    claim_rows, payout_rows, event_rollups, claimed_policy_ids = build_claims_and_payouts(
        workers, policy_lookup, event_meta
    )

    conn = psycopg2.connect(db_url)
    try:
        with conn:
            with conn.cursor() as cur:
                _insert_bandit_state(cur)

                execute_values(
                    cur,
                    """
                    INSERT INTO workers (
                      id, name, phone_number, platform, city, zone, home_hex_id,
                      avg_daily_earning, zone_multiplier, history_multiplier,
                      experience_tier, upi_vpa, device_id, device_fingerprint,
                      created_at, updated_at
                    ) VALUES %s
                    ON CONFLICT (id) DO NOTHING
                    """,
                    [
                        (
                            w.id,
                            w.name,
                            w.phone_number,
                            w.platform,
                            w.city,
                            w.zone,
                            w.home_hex_id,
                            w.avg_daily_earning,
                            w.zone_multiplier,
                            w.history_multiplier,
                            "new",
                            w.upi_vpa,
                            w.device_id,
                            w.device_fingerprint,
                            w.created_at,
                            now,
                        )
                        for w in workers
                    ],
                )
                print(f"Inserting workers... {len(workers)}/{len(workers)} OK")

                execute_values(
                    cur,
                    """
                    INSERT INTO policies (
                      id, worker_id, zone, coverage_amount, week_start, active,
                      created_at, updated_at, premium_paid, week_end, status,
                      recommended_arm, arm_accepted, context_key,
                      razorpay_order_id, razorpay_payment_id, purchased_at
                    ) VALUES %s
                    ON CONFLICT (id) DO NOTHING
                    """,
                    policy_rows,
                )
                print(f"Inserting policies... {len(policy_rows)}/{len(policy_rows)} OK")

                execute_values(
                    cur,
                    """
                    INSERT INTO disruption_events (
                      id, trigger_type, city, zone, latitude, longitude,
                      affected_worker_count, total_payout, created_at,
                      affected_hex_ids, trigger_value, disruption_hours,
                      event_start, event_end, status, trigger_threshold,
                      severity, affected_workers_count, total_claims_triggered,
                      total_payout_amount
                    ) VALUES %s
                    ON CONFLICT (id) DO NOTHING
                    """,
                    event_rows,
                )
                print(f"Inserting disruption events... {len(event_rows)}/{len(event_rows)} OK")

                execute_values(
                    cur,
                    """
                    INSERT INTO claims (
                      id, worker_id, policy_id, disruption_event_id, trigger_type,
                      payout_amount, disruption_hours, fraud_score,
                      isolation_forest_score, gnn_fraud_score, graph_flags,
                      bcs_score, status, notes, created_at, paid_at,
                      trigger_value, trigger_threshold
                    ) VALUES %s
                    ON CONFLICT (id) DO NOTHING
                    """,
                    claim_rows,
                )
                print(f"Inserting claims... {len(claim_rows)}/{len(claim_rows)} OK")

                execute_values(
                    cur,
                    """
                    INSERT INTO payouts (
                      id, claim_id, worker_id, amount, upi_vpa,
                      razorpay_payout_id, razorpay_fund_account_id,
                      status, created_at, processed_at
                    ) VALUES %s
                    ON CONFLICT (id) DO NOTHING
                    """,
                    payout_rows,
                )
                print(f"Inserting payouts... {len(payout_rows)}/{len(payout_rows)} OK")

                if claimed_policy_ids:
                    cur.execute(
                        """
                        UPDATE policies
                        SET status = 'claimed', updated_at = NOW()
                        WHERE id = ANY(%s::uuid[]) AND status <> 'active'
                        """,
                        (claimed_policy_ids,),
                    )

                for event_id, rollup in event_rollups.items():
                    cur.execute(
                        """
                        UPDATE disruption_events
                        SET affected_worker_count = %s,
                            affected_workers_count = %s,
                            total_claims_triggered = %s,
                            total_payout = %s,
                            total_payout_amount = %s
                        WHERE id = %s
                        """,
                        (
                            int(rollup["count"]),
                            int(rollup["count"]),
                            int(rollup["count"]),
                            float(round(rollup["total"], 2)),
                            float(round(rollup["total"], 2)),
                            event_id,
                        ),
                    )

        print("Seed complete OK")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
