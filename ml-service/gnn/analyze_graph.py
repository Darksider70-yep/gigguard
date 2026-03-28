"""Graph analysis helpers for fraud-flag groundwork."""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any, Dict, List

import networkx as nx


def _shared_resource_flags(graph: nx.DiGraph, edge_type: str, threshold: int = 3) -> Dict[str, List[str]]:
    """Group workers by shared resource nodes (UPI/device) and return suspicious groups."""
    resource_to_workers: Dict[str, List[str]] = defaultdict(list)
    for src, dst, attrs in graph.edges(data=True):
        if attrs.get("edge_type") == edge_type:
            resource_to_workers[str(dst)].append(str(src))

    return {
        resource: workers
        for resource, workers in resource_to_workers.items()
        if len(set(workers)) >= threshold
    }


def analyze_graph(graph: nx.DiGraph) -> Dict[str, Any]:
    """Analyze graph structure and return suspicious clusters."""
    upi_flags = _shared_resource_flags(graph, "uses_upi", threshold=3)
    device_flags = _shared_resource_flags(graph, "uses_device", threshold=3)

    suspicious_workers: Counter[str] = Counter()
    for workers in upi_flags.values():
        suspicious_workers.update(set(workers))
    for workers in device_flags.values():
        suspicious_workers.update(set(workers))

    high_degree_workers = [
        node
        for node, degree in graph.degree()
        if graph.nodes[node].get("node_type") == "worker" and degree >= 4
    ]
    suspicious_workers.update(high_degree_workers)

    return {
        "suspicious_workers": [worker for worker, _ in suspicious_workers.most_common()],
        "shared_upi_groups": upi_flags,
        "shared_device_groups": device_flags,
        "num_nodes": graph.number_of_nodes(),
        "num_edges": graph.number_of_edges(),
    }

