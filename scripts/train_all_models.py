#!/usr/bin/env python3
"""Train all GigGuard ML models using synthetic data."""

from __future__ import annotations

import argparse
import os
import sys
import time
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ML_DIR = ROOT / "ml-service"
MODELS_DIR = ML_DIR / "models"
DATA_DIR = ML_DIR / "data"


@contextmanager
def pushd(path: Path):
    prev = Path.cwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(prev)


def _ensure_paths() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def train_zone_model(force: bool = False) -> None:
    model_path = MODELS_DIR / "zone_model.pkl"
    if model_path.exists() and not force:
        print("[Zone Model] already trained - skipping (use --force to retrain)")
        return
    print("[Zone Model] training Ridge model...")
    start = time.time()
    sys.path.insert(0, str(ML_DIR))
    try:
        from premium.zone_model import train_zone_model as train_fn

        with pushd(ML_DIR):
            train_fn(model_path)
    finally:
        if str(ML_DIR) in sys.path:
            sys.path.remove(str(ML_DIR))
    print(f"[Zone Model] done in {time.time() - start:.1f}s")


def train_isolation_forest(force: bool = False) -> None:
    model_path = MODELS_DIR / "isolation_forest.pkl"
    if model_path.exists() and not force:
        print("[Isolation Forest] already trained - skipping")
        return
    print("[Isolation Forest] training synthetic IF model...")
    start = time.time()
    sys.path.insert(0, str(ML_DIR))
    try:
        from fraud.train_isolation_forest import train

        with pushd(ML_DIR):
            train(str(model_path))
    finally:
        if str(ML_DIR) in sys.path:
            sys.path.remove(str(ML_DIR))
    print(f"[Isolation Forest] done in {time.time() - start:.1f}s")


def train_sac(force: bool = False) -> None:
    model_path = MODELS_DIR / "sac_premium_v1.zip"
    if model_path.exists() and not force:
        print("[SAC] already trained - skipping")
        return
    print("[SAC] training RL agent (30k steps)...")
    start = time.time()
    sys.path.insert(0, str(ML_DIR))
    try:
        from rl.train_sac import train

        with pushd(ML_DIR):
            train()
    finally:
        if str(ML_DIR) in sys.path:
            sys.path.remove(str(ML_DIR))
    print(f"[SAC] done in {time.time() - start:.1f}s")


def generate_gnn_data(force: bool = False) -> None:
    data_path = DATA_DIR / "synthetic_graph.json"
    if data_path.exists() and not force:
        print("[GNN Data] already generated - skipping")
        return
    print("[GNN Data] generating fraud-ring graph dataset...")
    start = time.time()
    sys.path.insert(0, str(ML_DIR))
    try:
        from gnn.synthetic_fraud import FraudRingGenerator

        with pushd(ML_DIR):
            generator = FraudRingGenerator(seed=42)
            generator.generate_dataset(
                n_fraud_rings=100,
                n_clean_clusters=100,
                output_path=str(Path("data") / "synthetic_graph.json"),
            )
    finally:
        if str(ML_DIR) in sys.path:
            sys.path.remove(str(ML_DIR))
    print(f"[GNN Data] done in {time.time() - start:.1f}s")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train all GigGuard ML models.")
    parser.add_argument("--force", action="store_true", help="Retrain even if artifacts already exist.")
    parser.add_argument(
        "--model",
        choices=["zone_model", "isolation_forest", "sac", "gnn_data", "all"],
        default="all",
        help="Train one model or all.",
    )
    args = parser.parse_args()

    _ensure_paths()
    print("\nGigGuard ML Training Pipeline")
    print("=" * 40)

    steps = {
        "zone_model": train_zone_model,
        "isolation_forest": train_isolation_forest,
        "sac": train_sac,
        "gnn_data": generate_gnn_data,
    }
    to_run = list(steps.keys()) if args.model == "all" else [args.model]
    for key in to_run:
        steps[key](force=args.force)

    print("\nAll done. Run scripts/verify_setup.py next.")


if __name__ == "__main__":
    main()

