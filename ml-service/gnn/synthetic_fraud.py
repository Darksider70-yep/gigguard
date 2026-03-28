"""Generate synthetic fraud rings and clean clusters for GNN training."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np

from gnn.feature_encoding import build_claim_features, build_worker_features
from premium.zones import ZONES


@dataclass
class ClusterBundle:
    workers: List[Dict[str, Any]]
    claims: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    cluster_id: str
    label: int


class FraudRingGenerator:
    """Fraud-ring generator with deterministic seed and mixed fraud patterns."""

    def __init__(self, seed: int = 42) -> None:
        np.random.seed(42)
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        self.zone_by_city: Dict[str, List[Dict[str, Any]]] = {}
        for zone in ZONES:
            city = str(zone["city"]).strip().lower()
            self.zone_by_city.setdefault(city, []).append(zone)

    def _uuid(self) -> str:
        return str(uuid.uuid4())

    def _pick_city(self) -> str:
        return str(self.rng.choice(sorted(self.zone_by_city.keys())))

    def _pick_zone(self, city: str) -> Dict[str, Any]:
        options = self.zone_by_city[city]
        return dict(options[int(self.rng.integers(0, len(options)))])

    def _first_name(self) -> str:
        return self.rng.choice(
            ["Aarav", "Arjun", "Vikram", "Rahul", "Amit", "Priya", "Sneha", "Kavya", "Ravi", "Sameer"]
        ).item()

    def _make_worker(
        self,
        city: str,
        zone: Dict[str, Any],
        *,
        shared_upi: str | None = None,
        shared_device: str | None = None,
        created_at: datetime | None = None,
        account_age_days: int | None = None,
    ) -> Dict[str, Any]:
        worker_id = self._uuid()
        name = self._first_name()
        created = created_at or (datetime.now(timezone.utc) - timedelta(days=int(self.rng.integers(30, 360))))
        if account_age_days is not None:
            created = datetime.now(timezone.utc) - timedelta(days=account_age_days)
        upi = shared_upi or f"{name.lower()}{int(self.rng.integers(1000, 9999))}@upi"
        device = shared_device or f"dev_{self.rng.integers(100000, 999999)}"
        claim_freq = float(np.clip(self.rng.poisson(1.1), 0, 10))
        gnn_risk = float(np.clip(self.rng.beta(1.5, 5.0), 0.0, 1.0))
        return {
            "id": worker_id,
            "name": name,
            "city": city,
            "zone": str(zone["zone"]),
            "zone_id": str(zone["zone_id"]),
            "platform": self.rng.choice(["zomato", "swiggy"]).item(),
            "zone_multiplier": float(zone["zone_multiplier"]),
            "upi_vpa": upi,
            "device_fingerprint": device,
            "created_at": created.isoformat(),
            "account_age_days": float((datetime.now(timezone.utc) - created).days),
            "claim_freq_30d": claim_freq,
            "gnn_risk_score": gnn_risk,
        }

    def _make_claim(
        self,
        worker: Dict[str, Any],
        event_id: str,
        *,
        trigger_type: str,
        fraud_like: bool,
        first_week_claim: bool = False,
        claim_time: datetime | None = None,
    ) -> Dict[str, Any]:
        base_claim_time = claim_time or (datetime.now(timezone.utc) - timedelta(days=int(self.rng.integers(1, 30))))
        if first_week_claim:
            created_at = datetime.fromisoformat(worker["created_at"])
            base_claim_time = created_at + timedelta(days=int(self.rng.integers(0, 7)))

        payout = float(self.rng.uniform(550, 1000) if fraud_like else self.rng.uniform(180, 720))
        fraud_score = float(self.rng.uniform(0.66, 0.95) if fraud_like else self.rng.uniform(0.02, 0.35))
        disruption_hours = int(self.rng.choice([4, 5, 8]))
        return {
            "id": self._uuid(),
            "worker_id": worker["id"],
            "event_id": event_id,
            "trigger_type": trigger_type,
            "payout_amount": payout,
            "fraud_score": fraud_score,
            "disruption_hours": disruption_hours,
            "created_at": base_claim_time.isoformat(),
        }

    def _edges_for_worker_claim(
        self,
        worker: Dict[str, Any],
        claim: Dict[str, Any],
        event_id: str,
    ) -> List[Dict[str, Any]]:
        return [
            {"src": worker["id"], "dst": claim["id"], "type": "filed_claim", "edge_type": "filed_claim", "weight": 1.0},
            {"src": claim["id"], "dst": event_id, "type": "against_event", "edge_type": "against_event", "weight": 1.0},
            {"src": worker["id"], "dst": worker["upi_vpa"], "type": "uses_upi", "edge_type": "uses_upi", "weight": 1.0},
            {
                "src": worker["id"],
                "dst": worker["device_fingerprint"],
                "type": "uses_device",
                "edge_type": "uses_device",
                "weight": 1.0,
            },
        ]

    def generate_ring(
        self,
        ring_size: int,
        shared_upi: str,
        shared_device: str,
        event_id: str,
        city: str,
    ) -> Dict[str, Any]:
        """Backward-compatible helper used by tests."""
        zone = self._pick_zone(city)
        claim_anchor = datetime.now(timezone.utc) - timedelta(days=2)
        workers = [
            self._make_worker(city, zone, shared_upi=shared_upi, shared_device=shared_device)
            for _ in range(ring_size)
        ]
        claims = [
            self._make_claim(
                worker,
                event_id,
                trigger_type="severe_aqi",
                fraud_like=True,
                claim_time=claim_anchor + timedelta(minutes=int(self.rng.integers(0, 5))),
            )
            for worker in workers
        ]
        edges: List[Dict[str, Any]] = []
        for worker, claim in zip(workers, claims):
            edges.extend(self._edges_for_worker_claim(worker, claim, event_id))
        return {
            "workers": workers,
            "claims": claims,
            "edges": edges,
            "ring_id": self._uuid(),
            "label": 1,
        }

    def generate_legitimate_cluster(self, cluster_size: int, event_id: str, city: str) -> Dict[str, Any]:
        """Backward-compatible clean cluster helper used by tests."""
        zone = self._pick_zone(city)
        workers: List[Dict[str, Any]] = []
        claims: List[Dict[str, Any]] = []
        edges: List[Dict[str, Any]] = []
        for _ in range(cluster_size):
            worker = self._make_worker(city, zone)
            claim = self._make_claim(worker, event_id, trigger_type="heavy_rainfall", fraud_like=False)
            workers.append(worker)
            claims.append(claim)
            edges.extend(self._edges_for_worker_claim(worker, claim, event_id))
        return {"workers": workers, "claims": claims, "edges": edges, "cluster_id": self._uuid(), "label": 0}

    def _split_patterns(self, n_fraud_rings: int) -> Dict[str, int]:
        base = n_fraud_rings // 4
        counts = {"A": base, "B": base, "C": base, "D": base}
        for idx in range(n_fraud_rings - base * 4):
            counts[["A", "B", "C", "D"][idx % 4]] += 1
        return counts

    def _build_ring_by_pattern(self, pattern: str) -> ClusterBundle:
        city = self._pick_city()
        zone = self._pick_zone(city)
        event_id = self._uuid()
        trigger_type = self.rng.choice(["heavy_rainfall", "extreme_heat", "severe_aqi"]).item()
        workers: List[Dict[str, Any]] = []
        claims: List[Dict[str, Any]] = []
        edges: List[Dict[str, Any]] = []

        if pattern == "A":
            ring_size = int(self.rng.integers(3, 9))
            shared_upi = f"ring_{self._uuid()[:8]}@upi"
            claim_anchor = datetime.now(timezone.utc) - timedelta(days=1)
            for _ in range(ring_size):
                worker = self._make_worker(city, zone, shared_upi=shared_upi)
                claim = self._make_claim(
                    worker,
                    event_id,
                    trigger_type=trigger_type,
                    fraud_like=True,
                    claim_time=claim_anchor + timedelta(minutes=int(self.rng.integers(0, 5))),
                )
                workers.append(worker)
                claims.append(claim)
                edges.extend(self._edges_for_worker_claim(worker, claim, event_id))

        elif pattern == "B":
            ring_size = int(self.rng.integers(2, 5))
            shared_device = f"dev_ring_{self._uuid()[:8]}"
            created_anchor = datetime.now(timezone.utc) - timedelta(days=20)
            for _ in range(ring_size):
                worker = self._make_worker(
                    city,
                    zone,
                    shared_device=shared_device,
                    created_at=created_anchor + timedelta(hours=int(self.rng.integers(0, 48))),
                )
                claim = self._make_claim(worker, event_id, trigger_type=trigger_type, fraud_like=True)
                workers.append(worker)
                claims.append(claim)
                edges.extend(self._edges_for_worker_claim(worker, claim, event_id))

        elif pattern == "C":
            ring_size = int(self.rng.integers(8, 16))
            created_anchor = datetime.now(timezone.utc) - timedelta(days=6)
            for _ in range(ring_size):
                worker = self._make_worker(
                    city,
                    zone,
                    created_at=created_anchor + timedelta(hours=int(self.rng.integers(0, 24))),
                    account_age_days=int(self.rng.integers(1, 7)),
                )
                claim = self._make_claim(
                    worker,
                    event_id,
                    trigger_type=trigger_type,
                    fraud_like=True,
                    first_week_claim=True,
                )
                workers.append(worker)
                claims.append(claim)
                edges.extend(self._edges_for_worker_claim(worker, claim, event_id))

        else:  # D mixed
            ring_size = int(self.rng.integers(12, 21))
            shared_upi = f"mix_{self._uuid()[:8]}@upi"
            shared_device = f"mix_dev_{self._uuid()[:8]}"
            created_anchor = datetime.now(timezone.utc) - timedelta(days=5)
            for _ in range(ring_size):
                worker = self._make_worker(
                    city,
                    zone,
                    shared_upi=shared_upi,
                    shared_device=shared_device,
                    created_at=created_anchor + timedelta(hours=int(self.rng.integers(0, 24))),
                    account_age_days=int(self.rng.integers(1, 7)),
                )
                claim = self._make_claim(
                    worker,
                    event_id,
                    trigger_type=trigger_type,
                    fraud_like=True,
                    first_week_claim=True,
                    claim_time=created_anchor + timedelta(minutes=int(self.rng.integers(0, 5))),
                )
                workers.append(worker)
                claims.append(claim)
                edges.extend(self._edges_for_worker_claim(worker, claim, event_id))
            # Oversample hardest pattern edges.
            edges.extend([{**edge, "weight": 2.0} for edge in edges if edge["edge_type"] == "filed_claim"])

        return ClusterBundle(workers=workers, claims=claims, edges=edges, cluster_id=self._uuid(), label=1)

    def _build_clean_cluster(self) -> ClusterBundle:
        city = self._pick_city()
        zone = self._pick_zone(city)
        event_id = self._uuid()
        trigger_type = self.rng.choice(["heavy_rainfall", "extreme_heat", "severe_aqi"]).item()
        size = int(self.rng.integers(3, 13))
        workers: List[Dict[str, Any]] = []
        claims: List[Dict[str, Any]] = []
        edges: List[Dict[str, Any]] = []

        for _ in range(size):
            created = datetime.now(timezone.utc) - timedelta(days=int(self.rng.integers(20, 180)))
            worker = self._make_worker(city, zone, created_at=created)
            claim = self._make_claim(worker, event_id, trigger_type=trigger_type, fraud_like=False)
            workers.append(worker)
            claims.append(claim)
            edges.extend(self._edges_for_worker_claim(worker, claim, event_id))

        return ClusterBundle(workers=workers, claims=claims, edges=edges, cluster_id=self._uuid(), label=0)

    def _node_payloads(
        self,
        workers: List[Dict[str, Any]],
        claims: List[Dict[str, Any]],
    ) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
        nodes: List[Dict[str, Any]] = []
        labels: Dict[str, int] = {}

        for worker in workers:
            feat = build_worker_features(worker).astype(np.float32)
            label = 1 if float(worker.get("account_age_days", 180.0)) < 14 else 0
            labels[str(worker["id"])] = label
            nodes.append(
                {
                    "id": str(worker["id"]),
                    "type": "worker",
                    "label": label,
                    "features": [float(x) for x in np.clip(feat, 0.0, 1.0)],
                }
            )

        for claim in claims:
            feat = build_claim_features(claim).astype(np.float32)
            label = 1 if float(claim.get("fraud_score", 0.0)) >= 0.66 else 0
            nodes.append(
                {
                    "id": str(claim["id"]),
                    "type": "claim",
                    "label": label,
                    "features": [float(x) for x in np.clip(feat, 0.0, 1.0)],
                }
            )

        return nodes, labels

    def generate_dataset(
        self,
        n_fraud_rings: int = 100,
        n_clean_clusters: int = 100,
        output_path: str = "data/synthetic_graph.json",
    ) -> Dict[str, Any]:
        pattern_counts = self._split_patterns(n_fraud_rings)
        clusters: List[ClusterBundle] = []

        for _ in range(pattern_counts["A"]):
            clusters.append(self._build_ring_by_pattern("A"))
        for _ in range(pattern_counts["B"]):
            clusters.append(self._build_ring_by_pattern("B"))
        for _ in range(pattern_counts["C"]):
            clusters.append(self._build_ring_by_pattern("C"))
        for _ in range(pattern_counts["D"]):
            clusters.append(self._build_ring_by_pattern("D"))
        for _ in range(n_clean_clusters):
            clusters.append(self._build_clean_cluster())

        workers = [worker for cluster in clusters for worker in cluster.workers]
        claims = [claim for cluster in clusters for claim in cluster.claims]
        edges = [edge for cluster in clusters for edge in cluster.edges]
        nodes, labels = self._node_payloads(workers, claims)

        dataset = {
            "metadata": {
                "n_fraud_rings": int(n_fraud_rings),
                "n_clean_clusters": int(n_clean_clusters),
                "total_nodes": len(nodes),
                "total_edges": len(edges),
                "fraud_ratio": round(float(n_fraud_rings / max(n_fraud_rings + n_clean_clusters, 1)), 4),
                "seed": self.seed,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
            "nodes": nodes,
            "edges": edges,
            # Backward-compatible fields used by current loaders/tests.
            "workers": workers,
            "claims": claims,
            "labels": labels,
            "event_id": self._uuid(),
        }

        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8") as handle:
            json.dump(dataset, handle, indent=2)

        print(
            f"Synthetic dataset generated: workers={len(workers)}, claims={len(claims)}, "
            f"nodes={len(nodes)}, edges={len(edges)}"
        )
        return dataset
