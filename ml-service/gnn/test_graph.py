"""Unit tests for graph generation and loading utilities."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

nx = pytest.importorskip("networkx")

from gnn.analyze_graph import analyze_graph
from gnn.build_graph import GraphBuilder
from gnn.load_pyg_data import load_graph_for_pyg
from gnn.synthetic_fraud import FraudRingGenerator


def test_fraud_ring_generator_outputs_expected_keys() -> None:
    """Fraud ring generation should include workers/claims/edges and label."""
    generator = FraudRingGenerator(seed=42)
    ring = generator.generate_ring(
        ring_size=5,
        shared_upi="ring@upi",
        shared_device="device_ring",
        event_id="event_1",
        city="mumbai",
    )
    assert ring["label"] == 1
    assert len(ring["workers"]) == 5
    assert len(ring["claims"]) == 5
    assert len(ring["edges"]) > 0


def test_generate_dataset_and_load_pyg(tmp_path: Path) -> None:
    """Dataset generation should produce valid JSON loadable to PyG Data."""
    output = tmp_path / "synthetic_graph.json"
    generator = FraudRingGenerator(seed=42)
    generator.generate_dataset(n_fraud_rings=4, n_clean_clusters=4, output_path=str(output))

    data = load_graph_for_pyg(str(output))
    assert data.x.shape[1] == 7
    assert data.edge_index.shape[0] == 2
    assert data.y.shape[0] == data.x.shape[0]


def test_analyze_graph_flags_shared_resources() -> None:
    """Shared UPI/device edges should produce suspicious worker flags."""
    graph = nx.DiGraph()
    graph.add_node("w1", node_type="worker")
    graph.add_node("w2", node_type="worker")
    graph.add_node("w3", node_type="worker")
    graph.add_edge("w1", "upi_a", edge_type="uses_upi")
    graph.add_edge("w2", "upi_a", edge_type="uses_upi")
    graph.add_edge("w3", "upi_a", edge_type="uses_upi")

    result = analyze_graph(graph)
    assert len(result["suspicious_workers"]) >= 3
    assert "upi_a" in result["shared_upi_groups"]


def test_graph_builder_stats_with_mock_rows(monkeypatch) -> None:
    """GraphBuilder should construct stats from mocked DB rows."""
    builder = GraphBuilder("sqlite+pysqlite:///:memory:")

    fake_rows = {
        "workers": [{"id": "w1", "city": "mumbai", "platform": "zomato"}],
        "claims": [{"id": "c1", "worker_id": "w1", "disruption_event_id": "e1"}],
        "events": [{"id": "e1", "trigger_type": "flood"}],
        "upis": [{"id": "u1", "vpa": "x@upi"}],
        "edges": [{"src_id": "w1", "dst_id": "u1", "edge_type": "uses_upi", "weight": 1.0}],
    }

    def fake_fetch(query: str, params=None):
        query_l = query.lower()
        if "from workers" in query_l:
            return fake_rows["workers"]
        if "from claims" in query_l:
            return fake_rows["claims"]
        if "from disruption_events" in query_l:
            return fake_rows["events"]
        if "from upi_addresses" in query_l:
            return fake_rows["upis"]
        if "from graph_edges" in query_l:
            return fake_rows["edges"]
        return []

    monkeypatch.setattr(builder, "_fetch_rows", fake_fetch)
    graph = builder.build_full_graph()
    stats = builder.get_graph_stats(graph)
    assert stats["num_nodes"] >= 3
    assert stats["num_edges"] >= 1
