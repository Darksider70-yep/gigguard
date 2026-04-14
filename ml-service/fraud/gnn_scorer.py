"""GNNScorer wrapper for GigGuard GraphSAGE inference."""

import json
import logging
import os
from typing import Any, Dict, Optional

import torch
import numpy as np
from sqlalchemy import text

from db.connection import session_scope
from gnn.graphsage_model import GigGuardGraphSAGE
from gnn.feature_encoding import build_worker_features, pad_to_dim

logger = logging.getLogger("gigguard-ml")

class GNNScorer:
    """Wrapper for GraphSAGE model loading and inference."""

    def __init__(self, model_path: str, meta_path: str) -> None:
        self.model_path = model_path
        self.meta_path = meta_path
        self.model: Optional[GigGuardGraphSAGE] = None
        self.metadata: Dict[str, Any] = {}
        self.gnn_available = False
        
        self._load_model()

    def _load_model(self) -> None:
        """Initialize the GraphSAGE model and load saved state."""
        if not os.path.exists(self.model_path):
            logger.warning(f"GNN model missing at {self.model_path}. GNN scoring disabled.")
            return

        try:
            # Load metadata
            if os.path.exists(self.meta_path):
                with open(self.meta_path, "r") as f:
                    self.metadata = json.load(f)
            
            # Initialize model (Architecture must match training)
            self.model = GigGuardGraphSAGE(
                in_channels=7,
                hidden_channels=64,
                out_channels=1,
                num_layers=2
            )
            
            # Load weights (CPU only for Render Free Tier)
            state_dict = torch.load(self.model_path, map_location=torch.device('cpu'))
            self.model.load_state_dict(state_dict)
            self.model.eval()
            self.gnn_available = True
            
            logger.info(f"GNN Scorer loaded: {self.metadata.get('model_version', 'v1')}")
        except Exception as e:
            logger.error(f"Failed to load GNNScorer: {e}")
            self.gnn_available = False

    def score(self, worker_id: str) -> Dict[str, Any]:
        """Perform GNN inference for a single worker."""
        if not self.gnn_available or self.model is None:
            return {"gnn_score": 0.0, "confidence": 0.0, "error": "Model not available"}

        try:
            # 1. Fetch worker features from DB
            with session_scope() as session:
                row = session.execute(
                    text("""
                        SELECT city, platform, zone_multiplier, 
                               account_age_days, gnn_risk_score
                        FROM workers WHERE id = :worker_id
                    """),
                    {"worker_id": worker_id}
                ).mappings().first()

            if not row:
                return {"gnn_score": 0.5, "confidence": 0.1, "error": "Worker not found"}

            # 2. Encode features
            worker_data = dict(row)
            raw_features = build_worker_features(worker_data)
            x_padded = pad_to_dim(raw_features, target_dim=7, node_type="worker")
            
            # Convert to torch tensor
            x = torch.from_numpy(x_padded).unsqueeze(0)  # (1, 7)
            
            # 3. Handle neighborhood (Placeholder for full graph inference)
            # In a real GNN, we'd fetch the subgraph. 
            # For this standalone scorer, we'll use a self-loop (edge_index connecting 0 to 0)
            edge_index = torch.tensor([[0], [0]], dtype=torch.long)

            # 4. Infer
            with torch.no_grad():
                score_tensor = self.model(x, edge_index)
                score = float(score_tensor.item())

            return {
                "gnn_score": score,
                "confidence": 0.85,
                "graph_flags": ["isolation_prediction"],
                "scorer": "graphsage_v1"
            }
        except Exception as e:
            logger.error(f"GNN inference failed for {worker_id}: {e}")
            return {"gnn_score": 0.0, "confidence": 0.0, "error": str(e)}
