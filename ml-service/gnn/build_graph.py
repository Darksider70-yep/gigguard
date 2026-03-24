"""NetworkX graph construction from GigGuard database tables."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Iterable, List

import networkx as nx
from sqlalchemy import create_engine, text


class GraphBuilder:
    """Build heterogeneous graph views using workers, claims, events, and edges."""

    def __init__(self, db_url: str) -> None:
        """Create SQLAlchemy engine for graph extraction."""
        self.db_url = db_url
        self.engine = create_engine(db_url, future=True, pool_pre_ping=True)

    def _fetch_rows(self, query: str, params: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
        """Execute SQL query and return rows as dictionaries."""
        try:
            with self.engine.connect() as connection:
                rows = connection.execute(text(query), params or {}).mappings().all()
            return [dict(row) for row in rows]
        except Exception:
            return []

    def _add_nodes(self, graph: nx.DiGraph, node_type: str, rows: Iterable[Dict[str, Any]], id_key: str = "id") -> None:
        """Add typed nodes from row dictionaries."""
        for row in rows:
            node_id = str(row[id_key])
            graph.add_node(node_id, node_type=node_type, **row)

    def _add_edges_from_table(self, graph: nx.DiGraph, rows: Iterable[Dict[str, Any]]) -> None:
        """Add edges from graph_edges rows."""
        for row in rows:
            src_id = str(row["src_id"])
            dst_id = str(row["dst_id"])
            graph.add_edge(
                src_id,
                dst_id,
                edge_type=row.get("edge_type", "unknown"),
                weight=float(row.get("weight", 1.0)),
            )

    def _build_core_graph(self, since: datetime | None = None) -> nx.DiGraph:
        """Build graph either full or incremental based on timestamp."""
        graph = nx.DiGraph()

        if since is None:
            workers_query = "SELECT id, city, platform, zone_multiplier, gnn_risk_score, created_at FROM workers"
            claims_query = "SELECT id, worker_id, disruption_event_id, payout_amount, fraud_score, created_at FROM claims"
            events_query = "SELECT id, trigger_type, city, affected_worker_count, total_payout, triggered_at FROM disruption_events"
            upi_query = "SELECT id, vpa, worker_count, total_payouts_received, is_flagged, created_at FROM upi_addresses"
            edges_query = "SELECT src_id, dst_id, edge_type, weight FROM graph_edges"
            params: Dict[str, Any] = {}
        else:
            workers_query = """
                SELECT id, city, platform, zone_multiplier, gnn_risk_score, created_at
                FROM workers
                WHERE created_at >= :since
            """
            claims_query = """
                SELECT id, worker_id, disruption_event_id, payout_amount, fraud_score, created_at
                FROM claims
                WHERE created_at >= :since
            """
            events_query = """
                SELECT id, trigger_type, city, affected_worker_count, total_payout, triggered_at
                FROM disruption_events
                WHERE triggered_at >= :since
            """
            upi_query = """
                SELECT id, vpa, worker_count, total_payouts_received, is_flagged, created_at
                FROM upi_addresses
                WHERE created_at >= :since
            """
            edges_query = """
                SELECT src_id, dst_id, edge_type, weight
                FROM graph_edges
                WHERE created_at >= :since
            """
            params = {"since": since}

        workers = self._fetch_rows(workers_query, params)
        claims = self._fetch_rows(claims_query, params)
        events = self._fetch_rows(events_query, params)
        upis = self._fetch_rows(upi_query, params)
        edges = self._fetch_rows(edges_query, params)

        self._add_nodes(graph, "worker", workers)
        self._add_nodes(graph, "claim", claims)
        self._add_nodes(graph, "event", events)
        self._add_nodes(graph, "upi", upis)
        self._add_edges_from_table(graph, edges)

        # Add canonical claim relationships even if graph_edges is empty.
        for claim in claims:
            claim_id = str(claim["id"])
            worker_id = str(claim.get("worker_id"))
            event_id = str(claim.get("disruption_event_id"))
            if worker_id and worker_id in graph.nodes:
                graph.add_edge(worker_id, claim_id, edge_type="filed_claim", weight=1.0)
            if event_id and event_id in graph.nodes:
                graph.add_edge(claim_id, event_id, edge_type="against_event", weight=1.0)

        return graph

    def build_full_graph(self) -> nx.DiGraph:
        """Build full graph snapshot from all supported tables."""
        return self._build_core_graph(since=None)

    def build_incremental_update(self, since: datetime) -> nx.DiGraph:
        """Build incremental graph for rows created since timestamp."""
        return self._build_core_graph(since=since)

    def export_edge_list(self, graph: nx.DiGraph, output_path: str) -> None:
        """Export edge list as CSV-like text file."""
        with open(output_path, "w", encoding="utf-8") as handle:
            handle.write("src,dst,edge_type,weight\n")
            for src, dst, attrs in graph.edges(data=True):
                edge_type = attrs.get("edge_type", "unknown")
                weight = attrs.get("weight", 1.0)
                handle.write(f"{src},{dst},{edge_type},{weight}\n")

    def get_graph_stats(self, graph: nx.DiGraph) -> Dict[str, Any]:
        """Return summary statistics for graph diagnostics."""
        node_types: Dict[str, int] = {"worker": 0, "claim": 0, "event": 0, "upi": 0, "unknown": 0}
        for _, attrs in graph.nodes(data=True):
            node_type = attrs.get("node_type", "unknown")
            node_types[node_type if node_type in node_types else "unknown"] += 1

        return {
            "num_nodes": graph.number_of_nodes(),
            "num_edges": graph.number_of_edges(),
            "density": float(nx.density(graph)) if graph.number_of_nodes() > 1 else 0.0,
            "node_types": node_types,
        }

