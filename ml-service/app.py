"""Flask application factory and all ML API routes."""

from __future__ import annotations

import atexit
import logging
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Optional

import numpy as np
from flask import Blueprint, Flask, jsonify, request
from sqlalchemy import text

try:
    from flask_cors import CORS
except ModuleNotFoundError:  # pragma: no cover - dependency availability varies by runtime
    def CORS(app: Flask) -> Flask:  # type: ignore[no-redef]
        """No-op CORS fallback for minimal runtime environments."""
        return app

from bandits.bandit_store import BanditStateStore
from bandits.policy_bandit import ThompsonSamplingBandit, build_context_key
from config import Settings, get_settings
from db.connection import ENGINE, session_scope
from fraud.isolation_forest import FraudScorer
from fraud.gnn_scorer import GNNScorer
from premium.calculator import PremiumCalculator
from premium.zones import ZONES
from rl.validate_shadow import validate_shadow
from weather.live_weather import weather_client


class SACShadowModel:
    """Lazy SAC loader used for optional RL shadow predictions."""

    def __init__(self, model_path: str, logger: logging.Logger) -> None:
        self.model_path = model_path
        self.logger = logger
        self._model: Any = None
        self._loaded = False
        self._load_lock = threading.Lock()

    def start_background_load(self) -> None:
        """Start loading the SAC model in a background thread."""
        loader = threading.Thread(target=self._load_model, daemon=True)
        loader.start()

    def _load_model(self) -> None:
        """Load SAC model safely without blocking Flask startup."""
        if not os.path.exists(self.model_path):
            self.logger.warning("SAC model missing at %s. Shadow mode disabled.", self.model_path)
            return

        with self._load_lock:
            try:
                from stable_baselines3 import SAC

                self._model = SAC.load(self.model_path)
                self._loaded = True
                self.logger.info("SAC model loaded from %s", self.model_path)
            except Exception as exc:  # pragma: no cover - defensive startup path
                self.logger.warning("Failed to load SAC model: %s", exc)

    @property
    def loaded(self) -> bool:
        """Return whether SAC model is loaded."""
        return self._loaded

    def predict_premium(self, state_vector: np.ndarray) -> Optional[float]:
        """Predict premium via SAC action if model is available."""
        if not self._loaded or self._model is None:
            return None
        action, _ = self._model.predict(state_vector.astype(np.float32), deterministic=True)
        multiplier = float(np.clip(action[0], 0.5, 2.0))
        return round(35.0 * multiplier, 2)


def _parse_float(payload: Dict[str, Any], key: str, default: Optional[float] = None) -> float:
    """Parse float field from request payload."""
    value = payload.get(key, default)
    if value is None:
        raise ValueError(f"Missing field: {key}")
    return float(value)


def _rl_state_from_request(payload: Dict[str, Any]) -> np.ndarray:
    """Build 8-dim RL shadow state vector from request values."""
    zone_risk = float(payload.get("zone_multiplier", 1.0))
    rain_prob_7d = float(payload.get("rain_prob_7d", payload.get("weather_multiplier", 1.0)))
    aqi_avg_7d = float(payload.get("aqi_avg_7d", 0.8))
    claim_rate_90d = float(payload.get("claim_rate_90d", 0.2))
    worker_hours = float(payload.get("worker_hours", 1.0))
    platform = str(payload.get("platform", "zomato")).lower()
    platform_enc = 1.0 if platform == "swiggy" else 0.0
    season_enc = float(payload.get("season_enc", 0.5))
    competitor_price = float(payload.get("competitor_price", 1.0))

    state = np.array(
        [
            zone_risk,
            rain_prob_7d,
            aqi_avg_7d,
            claim_rate_90d,
            worker_hours,
            platform_enc,
            season_enc,
            competitor_price,
        ],
        dtype=np.float32,
    )
    return np.clip(state, 0.0, 2.0).astype(np.float32)


def _register_health_blueprint(app: Flask) -> Blueprint:
    """Create and register health blueprint."""
    bp = Blueprint("health", __name__)

    @bp.get("/health")
    def health() -> Any:
        db_status = "connected"
        try:
            with ENGINE.connect() as connection:
                connection.execute(text("SELECT 1"))
        except Exception:
            db_status = "error"

        return jsonify(
            {
                "status": "ok",
                "isolation_forest": "loaded" if app.extensions["fraud_scorer"].loaded else "missing",
                "sac_model": "loaded" if app.extensions["sac_shadow_model"].loaded else "missing",
                "db": db_status,
            }
        )

    app.register_blueprint(bp)
    return bp


def _register_premium_blueprint(app: Flask) -> Blueprint:
    """Create and register premium blueprint."""
    bp = Blueprint("premium", __name__)

    @bp.post("/predict-premium")
    def predict_premium() -> Any:
        payload = request.get_json(silent=True) or {}
        state_payload = dict(payload)

        try:
            zone_multiplier = _parse_float(payload, "zone_multiplier", default=1.0)
            history_multiplier = _parse_float(payload, "history_multiplier", default=1.0)
        except (TypeError, ValueError) as exc:
            return jsonify({"error": str(exc)}), 400

        lat = payload.get("lat")
        lng = payload.get("lng")
        if lat is not None and lng is not None:
            try:
                weather_data = weather_client.get_weather_multiplier(float(lat), float(lng))
                weather_multiplier = float(weather_data.get("weather_multiplier", 1.0))
                state_payload["rain_prob_7d"] = weather_data.get("rain_prob_7d", state_payload.get("rain_prob_7d", 0.2))
                state_payload["aqi_avg_7d"] = weather_data.get("aqi_avg_7d", state_payload.get("aqi_avg_7d", 0.2))
                state_payload["weather_multiplier"] = weather_multiplier
            except Exception:
                weather_multiplier = _parse_float(payload, "weather_multiplier", default=1.0)
        else:
            weather_multiplier = _parse_float(payload, "weather_multiplier", default=1.0)

        calculator: PremiumCalculator = app.extensions["premium_calculator"]
        formula = calculator.calculate(zone_multiplier, weather_multiplier, history_multiplier)
        premium_value = float(formula["premium"])

        sac_model: SACShadowModel = app.extensions["sac_shadow_model"]
        state_vector = _rl_state_from_request(state_payload)
        rl_premium = sac_model.predict_premium(state_vector)

        shadow_logged = False
        if rl_premium is not None:
            worker_id = str(payload.get("worker_id", "00000000-0000-0000-0000-000000000000"))
            formula_won = premium_value <= rl_premium
            executor: ThreadPoolExecutor = app.extensions["shadow_executor"]
            executor.submit(
                _log_shadow_decision,
                worker_id,
                premium_value,
                float(rl_premium),
                state_vector,
                formula_won,
            )
            shadow_logged = True

        return jsonify(
            {
                "premium": premium_value,
                "formula_breakdown": formula,
                "rl_premium": rl_premium,
                "shadow_logged": shadow_logged,
            }
        )

    @bp.get("/zone-multipliers")
    def get_zone_multipliers() -> Any:
        try:
            from premium.zone_model import get_all_zone_multipliers

            multipliers = get_all_zone_multipliers()
            return jsonify(
                {
                    "multipliers": multipliers,
                    "source": "zone_model_v1",
                    "n_zones": len(multipliers),
                }
            )
        except Exception as exc:
            fallback = {str(zone["zone_id"]): float(zone["zone_multiplier"]) for zone in ZONES}
            return jsonify(
                {
                    "multipliers": fallback,
                    "source": "hardcoded_fallback",
                    "error": str(exc),
                }
            )

    app.register_blueprint(bp)
    return bp


def _register_fraud_blueprint(app: Flask) -> Blueprint:
    """Create and register fraud blueprint."""
    bp = Blueprint("fraud", __name__)

    @bp.post("/score-fraud")
    def score_fraud() -> Any:
        payload = request.get_json(silent=True) or {}
        scorer: FraudScorer = app.extensions["fraud_scorer"]
        gnn_scorer = app.extensions.get("gnn_scorer")

        worker_id = payload.get("worker_id")
        claim_id = payload.get("claim_id")
        
        if_result = scorer.score(payload)
        isolation_forest_score = if_result["fraud_score"]
        
        gnn_result = None
        if worker_id and gnn_scorer and getattr(gnn_scorer, "gnn_available", False):
            try:
                gnn_result = gnn_scorer.score(worker_id)
            except Exception as e:
                import logging
                logging.getLogger("gigguard-ml").error(f"GNN scoring failed: {e}")
        
        final_fraud_score = isolation_forest_score
        scorer_used = "isolation_forest"
        gnn_score_val = None
        confidence = None
        graph_flags = None
        
        if gnn_result:
            gnn_score_val = gnn_result.get("gnn_score")
            confidence = gnn_result.get("confidence")
            graph_flags = gnn_result.get("graph_flags")
            
            if confidence is not None and confidence < 0.3:
                final_fraud_score = (gnn_score_val + isolation_forest_score) / 2.0
                scorer_used = "ensemble"
            else:
                final_fraud_score = gnn_score_val
                scorer_used = "gnn"
        
        if final_fraud_score < 0.3:
            recommendation = "approve"
            bcs_tier = 1
        elif final_fraud_score < 0.6:
            recommendation = "review"
            bcs_tier = 2
        else:
            recommendation = "deny"
            bcs_tier = 3

        response = {
            "worker_id": worker_id,
            "claim_id": claim_id,
            "fraud_score": float(round(final_fraud_score, 4)),
            "scorer_used": scorer_used,
            "gnn_score": float(round(gnn_score_val, 4)) if gnn_score_val is not None else None,
            "isolation_forest_score": float(round(isolation_forest_score, 4)),
            "confidence": float(round(confidence, 4)) if confidence is not None else None,
            "graph_flags": graph_flags,
            "recommendation": recommendation,
            "bcs_tier": bcs_tier,
            
            "gnn_fraud_score": float(round(gnn_score_val, 4)) if gnn_score_val is not None else None,
            "tier": bcs_tier,
            "flagged": recommendation == "deny",
            "scorer": scorer_used,
        }

        claim_id = payload.get("claim_id")
        parsed_claim_id: str | None = None
        if claim_id:
            try:
                parsed_claim_id = str(uuid.UUID(str(claim_id)))
            except (TypeError, ValueError):
                parsed_claim_id = None

        if parsed_claim_id:
            with session_scope() as session:
                session.execute(
                    text(
                        """
                        UPDATE claims
                        SET fraud_score = :fraud_score,
                            isolation_forest_score = :fraud_score
                        WHERE id = :claim_id
                        """
                    ),
                    {"fraud_score": float(response["fraud_score"]), "claim_id": parsed_claim_id},
                )

        return jsonify(response)

    app.register_blueprint(bp)
    return bp


def _register_bandit_blueprint(app: Flask) -> Blueprint:
    """Create and register contextual bandit blueprint."""
    bp = Blueprint("bandits", __name__)

    @bp.post("/recommend-tier")
    def recommend_tier() -> Any:
        payload = request.get_json(silent=True) or {}
        context = payload.get("context", {}) or {}
        context_key = build_context_key(context)

        bandit: ThompsonSamplingBandit = app.extensions["policy_bandit"]
        recommendation = bandit.select_arm(context_key)

        return jsonify(
            {
                "recommended_arm": recommendation["arm"],
                "recommended_premium": recommendation["premium"],
                "recommended_coverage": recommendation["coverage"],
                "context_key": recommendation["context_key"],
                "exploration": recommendation["explore"],
            }
        )

    @bp.post("/bandit-update")
    def bandit_update() -> Any:
        payload = request.get_json(silent=True) or {}
        context_key = str(payload.get("context_key", "")).strip() or "unknown_unknown_mid_other_medium"
        try:
            arm = int(payload.get("arm", 0))
        except (TypeError, ValueError):
            arm = 0
        arm = int(np.clip(arm, 0, 3))
        try:
            reward = float(payload.get("reward", 0.0))
        except (TypeError, ValueError):
            reward = 0.0
        reward = float(np.clip(reward, 0.0, 1.0))

        bandit: ThompsonSamplingBandit = app.extensions["policy_bandit"]
        bandit.update(context_key=context_key, arm=arm, reward=reward)

        store: BanditStateStore = app.extensions["bandit_store"]
        store.record_update()

        return jsonify({"success": True})

    @bp.get("/bandit-stats")
    def bandit_stats() -> Any:
        context_key = request.args.get("context_key")
        bandit: ThompsonSamplingBandit = app.extensions["policy_bandit"]
        return jsonify(bandit.get_arm_stats(context_key=context_key))

    app.register_blueprint(bp)
    return bp


def _register_rl_blueprint(app: Flask) -> Blueprint:
    """Create and register RL blueprint."""
    bp = Blueprint("rl", __name__)

    @bp.get("/rl/shadow-status")
    def rl_shadow_status() -> Any:
        sac_model: SACShadowModel = app.extensions["sac_shadow_model"]
        return jsonify({"sac_model": "loaded" if sac_model.loaded else "missing"})

    @bp.get("/rl/validate-shadow")
    def rl_validate_shadow() -> Any:
        settings: Settings = app.extensions["settings"]
        report = validate_shadow(settings.database_url)
        return jsonify(report)

    @bp.post("/rl-live-premium")
    def rl_live_premium() -> Any:
        payload = request.get_json(silent=True) or {}
            
        sac_model = app.extensions.get("sac_shadow_model")
        if not sac_model or not getattr(sac_model, 'loaded', False):
            return jsonify({"error": "SAC model not loaded"}), 503
            
        try:
            zone_multiplier = float(payload.get("zone_multiplier", 1.0))
            weather_multiplier = float(payload.get("weather_multiplier", 1.0))
            history_multiplier = float(payload.get("history_multiplier", 1.0))
            account_age_days = float(payload.get("account_age_days", 180.0))
            platform_enc = 1.0 if str(payload.get("platform", "")).lower() == "swiggy" else 0.0
            
            import numpy as np
            state_vector = np.array([
                zone_multiplier,
                weather_multiplier,
                history_multiplier,
                account_age_days / 365.0,
                platform_enc
            ], dtype=np.float32)
            
            rl_premium = sac_model.predict_premium(state_vector)
            
            return jsonify({
                "rl_premium": float(rl_premium) if rl_premium is not None else None,
                "pricing_source": "rl",
                "state_vector": [float(x) for x in state_vector.tolist()]
            })
        except Exception as e:
            import logging
            logging.getLogger("gigguard-ml").error(f"RL live prediction failed: {e}")
            return jsonify({"error": str(e)}), 500

    @bp.get("/shadow-comparison")
    def shadow_comparison() -> Any:
        """Return formula-vs-RL premium comparison data for the insurer dashboard."""
        try:
            with session_scope() as session:
                rows = session.execute(
                    text(
                        """
                        SELECT
                            COUNT(*)::int                                        AS total_rows,
                            ROUND(AVG(formula_premium)::numeric, 2)              AS avg_formula_premium,
                            ROUND(AVG(rl_premium)::numeric, 2)                   AS avg_rl_premium,
                            ROUND(AVG(ABS(formula_premium - rl_premium))::numeric, 2) AS avg_abs_diff,
                            SUM(CASE WHEN formula_won THEN 1 ELSE 0 END)::int    AS formula_wins,
                            SUM(CASE WHEN NOT formula_won THEN 1 ELSE 0 END)::int AS rl_wins
                        FROM rl_shadow_log
                        """
                    )
                ).mappings().first()

                if not rows or rows["total_rows"] == 0:
                    return jsonify({"total_rows": 0, "message": "No shadow log data yet"})

                return jsonify(dict(rows))
        except Exception as exc:
            app.logger.warning("shadow-comparison query failed: %s", exc)
            return jsonify({"error": "Shadow comparison unavailable", "detail": str(exc)}), 500

    app.register_blueprint(bp)
    return bp


def _register_gnn_blueprint(app: Flask) -> Blueprint:
    """Create and register GNN blueprint."""
    bp = Blueprint("gnn", __name__)

    @bp.get("/gnn/status")
    def gnn_status() -> Any:
        return jsonify({"phase": "groundwork", "status": "ready"})

    app.register_blueprint(bp)
    return bp


def _log_shadow_decision(
    worker_id: str,
    formula_premium: float,
    rl_premium: float,
    state_vector: np.ndarray,
    formula_won: bool,
) -> None:
    """Insert a shadow-mode comparison row without blocking API response."""
    with session_scope() as session:
        session.execute(
            text(
                """
                INSERT INTO rl_shadow_log
                (id, worker_id, formula_premium, rl_premium, state_vector, action_value, formula_won, logged_at)
                VALUES
                (:id, :worker_id, :formula_premium, :rl_premium, :state_vector, :action_value, :formula_won, NOW())
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "worker_id": worker_id,
                "formula_premium": formula_premium,
                "rl_premium": rl_premium,
                "state_vector": [float(x) for x in state_vector.tolist()],
                "action_value": float(rl_premium / 35.0),
                "formula_won": bool(formula_won),
            },
        )


def create_app() -> Flask:
    """Application factory for the GigGuard ML microservice."""
    settings = get_settings()

    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
    logger = logging.getLogger("gigguard-ml")

    app = Flask(__name__)
    CORS(app)

    app.extensions["settings"] = settings
    app.extensions["premium_calculator"] = PremiumCalculator()
    app.extensions["fraud_scorer"] = FraudScorer(settings.if_model_path)
    try:
        from fraud.gnn_scorer import GNNScorer
        app.extensions["gnn_scorer"] = GNNScorer("models/graphsage_model.pt", "models/graphsage_meta.json")
    except Exception as e:
        logger.warning(f"Could not load GNNScorer: {e}")
        app.extensions["gnn_scorer"] = None
    app.extensions["policy_bandit"] = ThompsonSamplingBandit()

    bandit_store = BanditStateStore(settings.database_url, lambda: app.extensions["policy_bandit"].get_state())
    loaded_state = bandit_store.load()
    if loaded_state:
        app.extensions["policy_bandit"].load_state(loaded_state)
    app.extensions["bandit_store"] = bandit_store

    sac_shadow_model = SACShadowModel(settings.sac_model_path, logger)
    sac_shadow_model.start_background_load()
    app.extensions["sac_shadow_model"] = sac_shadow_model

    shadow_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="shadow-log")
    app.extensions["shadow_executor"] = shadow_executor

    _register_health_blueprint(app)
    _register_premium_blueprint(app)
    _register_fraud_blueprint(app)
    _register_bandit_blueprint(app)
    _register_rl_blueprint(app)
    _register_gnn_blueprint(app)

    def _shutdown() -> None:
        bandit_store.force_save()
        shadow_executor.shutdown(wait=False, cancel_futures=True)

    atexit.register(_shutdown)
    return app


if __name__ == "__main__":
    app_instance = create_app()
    config = get_settings()
    app_instance.run(host="0.0.0.0", port=config.ml_service_port)

