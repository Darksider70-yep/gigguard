# GigGuard GNN Phase 3 Handoff

## Scope Completed in Phase 2 Groundwork
- Node feature encoders with bounded float32 outputs in `[0, 1]`.
- Synthetic fraud-ring generator with reproducible seed behavior.
- NetworkX graph builder for full and incremental snapshots.
- PyG loading path (`Data`) with homogeneous padded feature vectors.
- Graph analysis helper that surfaces shared-UPI and shared-device clusters.
- GraphSAGE model stub (`GigGuardGraphSAGE`) with sigmoid output head.

## Required Phase 3 Additions
- Replace homogeneous `Data` with `HeteroData` for node/edge type separation.
- Build feature store from production tables at scale (workers, claims, upi, devices, events).
- Introduce temporal graph windows for streaming fraud-ring detection.
- Add supervised training labels from investigator-reviewed claim outcomes.
- Add threshold calibration pipeline for `gnn_fraud_score`.
- Add online inference service path and claim-level graph flag explanations.

## Data Contracts
- Worker node features: 6 raw + node type encoding.
- Claim node features: 4 raw + node type encoding.
- Event node features: 4 raw + node type encoding.
- UPI node features: 4 raw + node type encoding.
- All final node tensors are padded to `float32[7]`.

## Deployment Notes
- PyG runtime may require platform-specific wheels for `torch-scatter` and `torch-sparse`.
- Batch graph inference should run off the online request path initially.
- Start with daily graph refresh + offline scoring, then migrate to incremental updates.

## Validation Checklist for Phase 3
1. Offline AUC/PR over labeled fraud rings and legitimate clusters.
2. Drift monitoring on graph topology metrics.
3. Explainability output for every flagged claim.
4. Safe fallback to Isolation Forest-only scoring when GNN unavailable.
