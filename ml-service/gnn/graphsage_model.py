"""GraphSAGE model stub for Phase 3 handoff."""

from __future__ import annotations

import torch
from torch import Tensor
from torch.nn import Module, ModuleList

try:
    from torch_geometric.nn import SAGEConv
except ImportError as exc:  # pragma: no cover - optional dependency import path
    raise ImportError(
        "torch-geometric is required for GigGuardGraphSAGE. "
        "Install torch-scatter/torch-sparse platform wheels as needed."
    ) from exc


class GigGuardGraphSAGE(Module):
    """GraphSAGE binary classifier stub for worker fraud risk."""

    def __init__(
        self,
        in_channels: int = 7,
        hidden_channels: int = 64,
        out_channels: int = 1,
        num_layers: int = 2,
    ) -> None:
        """Initialize stacked SAGE convolutions and output head."""
        super().__init__()
        if num_layers < 2:
            raise ValueError("num_layers must be at least 2")

        self.convs = ModuleList()
        self.convs.append(SAGEConv(in_channels, hidden_channels))
        for _ in range(num_layers - 2):
            self.convs.append(SAGEConv(hidden_channels, hidden_channels))
        self.convs.append(SAGEConv(hidden_channels, out_channels))

    def forward(self, x: Tensor, edge_index: Tensor) -> Tensor:
        """Run message passing and output fraud probability."""
        hidden = x
        for conv in self.convs[:-1]:
            hidden = conv(hidden, edge_index)
            hidden = torch.relu(hidden)
        logits = self.convs[-1](hidden, edge_index)
        return torch.sigmoid(logits)

