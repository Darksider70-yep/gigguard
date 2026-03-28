"""Load synthetic/DB graph JSON into torch-geometric Data format."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np

try:
    import torch
except ModuleNotFoundError:  # pragma: no cover - dependency availability varies by runtime
    torch = None

try:
    from torch_geometric.data import Data as PygData
except ModuleNotFoundError:  # pragma: no cover - dependency availability varies by runtime
    PygData = None

from gnn.feature_encoding import (
    build_claim_features,
    build_event_features,
    build_upi_features,
    build_worker_features,
    pad_to_dim,
)


@dataclass
class FallbackData:
    """Minimal Data-like container used when torch-geometric is unavailable."""

    x: np.ndarray
    edge_index: np.ndarray
    y: np.ndarray


def _collect_nodes(graph_json: Dict[str, object]) -> List[Tuple[str, str, np.ndarray]]:
    """Collect and encode typed nodes from graph payload."""
    nodes: List[Tuple[str, str, np.ndarray]] = []

    for worker in graph_json.get("workers", []):
        worker_dict = dict(worker)
        features = pad_to_dim(build_worker_features(worker_dict), target_dim=7, node_type="worker")
        nodes.append((str(worker_dict["id"]), "worker", features))

    for claim in graph_json.get("claims", []):
        claim_dict = dict(claim)
        features = pad_to_dim(build_claim_features(claim_dict), target_dim=7, node_type="claim")
        nodes.append((str(claim_dict["id"]), "claim", features))

    event_id = graph_json.get("event_id")
    if event_id:
        event_features = pad_to_dim(
            build_event_features(
                {
                    "trigger_type": "unknown",
                    "affected_count": len(graph_json.get("workers", [])),
                    "total_payout": 0.0,
                    "hours_active": 8.0,
                }
            ),
            target_dim=7,
            node_type="event",
        )
        nodes.append((str(event_id), "event", event_features))

    upi_nodes = {
        str(edge["dst"])
        for edge in graph_json.get("edges", [])
        if edge.get("edge_type") == "uses_upi"
    }
    for upi_vpa in upi_nodes:
        upi_features = pad_to_dim(
            build_upi_features(
                {
                    "worker_count": 1.0,
                    "total_payouts_received": 0.0,
                    "unique_hex_count": 1.0,
                    "account_age_days": 180.0,
                }
            ),
            target_dim=7,
            node_type="upi",
        )
        nodes.append((upi_vpa, "upi", upi_features))

    return nodes


def load_graph_for_pyg(json_path: str):
    """Load graph JSON and return homogeneous PyG Data object.

    Note: Phase 3 should migrate this to torch_geometric.data.HeteroData.
    """
    with open(json_path, "r", encoding="utf-8") as handle:
        graph_json: Dict[str, object] = json.load(handle)

    nodes = _collect_nodes(graph_json)
    node_index = {node_id: idx for idx, (node_id, _, _) in enumerate(nodes)}

    x = np.vstack([features for _, _, features in nodes]).astype(np.float32)

    edge_pairs: List[List[int]] = [[], []]
    for edge in graph_json.get("edges", []):
        src = str(edge["src"])
        dst = str(edge["dst"])
        if src in node_index and dst in node_index:
            edge_pairs[0].append(node_index[src])
            edge_pairs[1].append(node_index[dst])

    edge_index_np = np.array(edge_pairs, dtype=np.int64)
    labels = graph_json.get("labels", {})
    y_values = []
    for node_id, node_type, _ in nodes:
        if node_type == "worker":
            y_values.append(int(labels.get(node_id, 0)))
        else:
            y_values.append(-1)

    y_np = np.array(y_values, dtype=np.int64)

    if torch is None or PygData is None:
        return FallbackData(x=x, edge_index=edge_index_np, y=y_np)

    data = PygData(
        x=torch.tensor(x, dtype=torch.float32),
        edge_index=torch.tensor(edge_index_np, dtype=torch.long),
        y=torch.tensor(y_np, dtype=torch.long),
    )
    return data
