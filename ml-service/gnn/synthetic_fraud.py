"""Synthetic fraud ring generator for graph-learning groundwork."""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List

import numpy as np


@dataclass
class ClusterBundle:
    """Container for generated cluster data."""

    workers: List[Dict[str, Any]]
    claims: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    cluster_id: str
    label: int


class FraudRingGenerator:
    """Generate synthetic fraud rings and legitimate clusters."""

    def __init__(self, seed: int = 42) -> None:
        """Initialize deterministic RNG state."""
        np.random.seed(42)
        self.seed = seed
        self.rng = np.random.default_rng(seed)

    def _random_city(self) -> str:
        """Sample city from the supported set."""
        return self.rng.choice(["mumbai", "delhi", "chennai", "bangalore", "hyderabad"]).item()

    def _worker_template(self, city: str, shared_upi: str | None = None, shared_device: str | None = None) -> Dict[str, Any]:
        """Create synthetic worker profile."""
        worker_id = str(uuid.uuid4())
        upi = shared_upi or f"user{self.rng.integers(1000, 9999)}@upi"
        device = shared_device or f"dev_{self.rng.integers(10000, 99999)}"
        created_at = datetime.now() - timedelta(days=int(self.rng.integers(1, 365)))
        return {
            "id": worker_id,
            "city": city,
            "platform": self.rng.choice(["zomato", "swiggy"]).item(),
            "upi_vpa": upi,
            "device_fingerprint": device,
            "created_at": created_at.isoformat(),
            "zone_multiplier": float(self.rng.uniform(0.9, 1.5)),
        }

    def _claim_template(self, worker_id: str, event_id: str, fraud_like: bool) -> Dict[str, Any]:
        """Create synthetic claim record."""
        payout = float(self.rng.uniform(700, 1000) if fraud_like else self.rng.uniform(200, 600))
        return {
            "id": str(uuid.uuid4()),
            "worker_id": worker_id,
            "event_id": event_id,
            "payout_amount": payout,
            "fraud_score": float(self.rng.uniform(0.7, 1.0) if fraud_like else self.rng.uniform(0.0, 0.4)),
        }

    def generate_ring(
        self,
        ring_size: int,
        shared_upi: str,
        shared_device: str,
        event_id: str,
        city: str,
    ) -> Dict[str, Any]:
        """Generate one coordinated fraud ring."""
        ring_id = str(uuid.uuid4())
        workers = [
            self._worker_template(city=city, shared_upi=shared_upi, shared_device=shared_device)
            for _ in range(ring_size)
        ]
        claims = [self._claim_template(worker["id"], event_id, fraud_like=True) for worker in workers]

        edges: List[Dict[str, Any]] = []
        for worker, claim in zip(workers, claims):
            edges.extend(
                [
                    {"src": worker["id"], "dst": shared_upi, "edge_type": "uses_upi", "weight": 1.0},
                    {"src": worker["id"], "dst": shared_device, "edge_type": "uses_device", "weight": 1.0},
                    {"src": worker["id"], "dst": claim["id"], "edge_type": "filed_claim", "weight": 1.0},
                    {"src": claim["id"], "dst": event_id, "edge_type": "against_event", "weight": 1.0},
                ]
            )

        return {
            "workers": workers,
            "claims": claims,
            "edges": edges,
            "ring_id": ring_id,
            "label": 1,
        }

    def generate_legitimate_cluster(
        self,
        cluster_size: int,
        event_id: str,
        city: str,
    ) -> Dict[str, Any]:
        """Generate legitimate worker/claim cluster."""
        cluster_id = str(uuid.uuid4())
        workers = [self._worker_template(city=city) for _ in range(cluster_size)]

        # Legitimate registrations are spread out over longer timeline.
        for worker in workers:
            created_at = datetime.now() - timedelta(days=int(self.rng.integers(30, 180)))
            worker["created_at"] = created_at.isoformat()

        claims = [self._claim_template(worker["id"], event_id, fraud_like=False) for worker in workers]

        edges: List[Dict[str, Any]] = []
        for worker, claim in zip(workers, claims):
            edges.extend(
                [
                    {"src": worker["id"], "dst": worker["upi_vpa"], "edge_type": "uses_upi", "weight": 1.0},
                    {"src": worker["id"], "dst": worker["device_fingerprint"], "edge_type": "uses_device", "weight": 1.0},
                    {"src": worker["id"], "dst": claim["id"], "edge_type": "filed_claim", "weight": 1.0},
                    {"src": claim["id"], "dst": event_id, "edge_type": "against_event", "weight": 1.0},
                ]
            )

        return {
            "workers": workers,
            "claims": claims,
            "edges": edges,
            "cluster_id": cluster_id,
            "label": 0,
        }

    def generate_dataset(
        self,
        n_fraud_rings: int = 100,
        n_clean_clusters: int = 100,
        output_path: str = "data/synthetic_graph.json",
    ) -> Dict[str, Any]:
        """Generate complete synthetic dataset with mixed fraud patterns."""
        event_id = str(uuid.uuid4())
        all_workers: List[Dict[str, Any]] = []
        all_claims: List[Dict[str, Any]] = []
        all_edges: List[Dict[str, Any]] = []
        labels: Dict[str, int] = {}

        pattern_counts = {"A_upi": 0, "B_device": 0, "C_burst": 0, "D_mixed": 0}
        for idx in range(n_fraud_rings):
            city = self._random_city()
            ring_size = int(self.rng.integers(4, 10))
            pattern_bucket = "D_mixed" if idx < int(0.5 * n_fraud_rings) else self.rng.choice(
                ["A_upi", "B_device", "C_burst"]
            ).item()

            shared_upi = f"ring{idx}@upi" if pattern_bucket in {"A_upi", "D_mixed"} else f"user{idx}@upi"
            shared_device = f"device_ring_{idx}" if pattern_bucket in {"B_device", "D_mixed"} else f"dev_{idx}"

            ring = self.generate_ring(ring_size, shared_upi, shared_device, event_id, city)
            pattern_counts[pattern_bucket] += 1

            all_workers.extend(ring["workers"])
            all_claims.extend(ring["claims"])
            all_edges.extend(ring["edges"])
            for worker in ring["workers"]:
                labels[worker["id"]] = 1

            # Pattern D is oversampled by duplicating claim-event edges.
            if pattern_bucket == "D_mixed":
                for edge in ring["edges"]:
                    if edge["edge_type"] == "against_event":
                        all_edges.append({**edge, "weight": 1.5})

        for _ in range(n_clean_clusters):
            city = self._random_city()
            cluster = self.generate_legitimate_cluster(
                cluster_size=int(self.rng.integers(4, 10)),
                event_id=event_id,
                city=city,
            )
            all_workers.extend(cluster["workers"])
            all_claims.extend(cluster["claims"])
            all_edges.extend(cluster["edges"])
            for worker in cluster["workers"]:
                labels[worker["id"]] = 0

        dataset = {
            "event_id": event_id,
            "workers": all_workers,
            "claims": all_claims,
            "edges": all_edges,
            "labels": labels,
            "pattern_counts": pattern_counts,
        }

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as handle:
            json.dump(dataset, handle, indent=2)

        print(
            f"Synthetic dataset generated: workers={len(all_workers)}, "
            f"claims={len(all_claims)}, edges={len(all_edges)}, "
            f"fraud_rings={n_fraud_rings}, clean_clusters={n_clean_clusters}"
        )
        return dataset

