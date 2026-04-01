#!/usr/bin/env python3
"""Train all GigGuard ML models using synthetic data."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ML_DIR = ROOT / 'ml-service'
MODELS_DIR = ML_DIR / 'models'
DATA_DIR = ML_DIR / 'data'


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
    model_path = MODELS_DIR / 'zone_model.pkl'
    if model_path.exists() and not force:
        print('[Zone Model] already trained - skipping (use --force to retrain)')
        return
    print('[Zone Model] training Ridge model...')
    sys.path.insert(0, str(ML_DIR))
    try:
        from premium.zone_model import train_zone_model as train_fn

        with pushd(ML_DIR):
            train_fn(model_path)
    finally:
        if str(ML_DIR) in sys.path:
            sys.path.remove(str(ML_DIR))


def train_isolation_forest(force: bool = False) -> None:
    model_path = MODELS_DIR / 'isolation_forest.pkl'
    if model_path.exists() and not force:
        print('[Isolation Forest] already trained - skipping')
        return
    print('[Isolation Forest] training synthetic IF model...')
    sys.path.insert(0, str(ML_DIR))
    try:
        from fraud.train_isolation_forest import train

        with pushd(ML_DIR):
            train(str(model_path))
    finally:
        if str(ML_DIR) in sys.path:
            sys.path.remove(str(ML_DIR))


def train_sac(force: bool = False) -> None:
    model_path = MODELS_DIR / 'sac_premium_v1.zip'
    if model_path.exists() and not force:
        print('[SAC] already trained - skipping')
        return
    print('[SAC] training RL agent (30k steps)...')
    sys.path.insert(0, str(ML_DIR))
    try:
        from rl.train_sac import train

        with pushd(ML_DIR):
            train()
    finally:
        if str(ML_DIR) in sys.path:
            sys.path.remove(str(ML_DIR))


def generate_gnn_data(force: bool = False) -> None:
    data_path = DATA_DIR / 'synthetic_graph.json'
    if data_path.exists() and not force:
        print('[GNN Data] already generated - skipping')
        return
    print('[GNN Data] generating fraud-ring graph dataset...')
    sys.path.insert(0, str(ML_DIR))
    try:
        from gnn.synthetic_fraud import FraudRingGenerator

        with pushd(ML_DIR):
            generator = FraudRingGenerator(seed=42)
            generator.generate_dataset(
                n_fraud_rings=100,
                n_clean_clusters=100,
                output_path=str(Path('data') / 'synthetic_graph.json'),
            )
    finally:
        if str(ML_DIR) in sys.path:
            sys.path.remove(str(ML_DIR))


def run_verify_setup() -> int:
    print('\nRunning setup verification...')
    proc = subprocess.run(
        [sys.executable, str(ROOT / 'scripts' / 'verify_setup.py')],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.stdout:
        print(proc.stdout.rstrip())
    if proc.stderr:
        print(proc.stderr.rstrip())
    return proc.returncode


def print_summary() -> None:
    print('\n' + '=' * 50)
    print('GigGuard ML Training Complete')
    print('=' * 50)
    for model, rel_path in [
        ('Zone Model', 'models/zone_model.pkl'),
        ('Isolation Forest', 'models/isolation_forest.pkl'),
        ('SAC Agent', 'models/sac_premium_v1.zip'),
        ('GNN Data', 'data/synthetic_graph.json'),
    ]:
        artifact = ML_DIR / rel_path
        exists = artifact.exists()
        size = artifact.stat().st_size // 1024 if exists else 0
        status = f'OK {size}KB' if exists else 'MISSING'
        print(f'  {model:20s}: {status}')
    print('')
    print('Next step: python scripts/verify_setup.py')


def main() -> None:
    parser = argparse.ArgumentParser(description='Train all GigGuard ML models.')
    parser.add_argument('--force', action='store_true', help='Retrain even if artifacts already exist.')
    parser.add_argument(
        '--model',
        choices=['zone_model', 'isolation_forest', 'sac', 'gnn_data', 'all'],
        default='all',
        help='Train one model or all.',
    )
    args = parser.parse_args()

    _ensure_paths()
    print('\nGigGuard ML Training Pipeline')
    print('=' * 40)

    steps = [
        ('zone_model', train_zone_model),
        ('isolation_forest', train_isolation_forest),
        ('sac', train_sac),
        ('gnn_data', generate_gnn_data),
    ]

    for key, runner in steps:
        if args.model != 'all' and args.model != key:
            continue
        start = time.time()
        runner(force=args.force)
        print(f'  Time: {time.time() - start:.1f}s')

    print_summary()

    verify_code = run_verify_setup()
    if verify_code != 0:
        print(f'\nverify_setup.py exited with status {verify_code}')
        raise SystemExit(verify_code)


if __name__ == '__main__':
    main()
