import os

# 1. Update ml-service/app.py
with open('ml-service/app.py', 'r') as f:
    app_py = f.read()

target = """    @bp.get("/rl/validate-shadow")
    def rl_validate_shadow() -> Any:
        settings: Settings = app.extensions["settings"]
        report = validate_shadow(settings.database_url)
        return jsonify(report)"""

rl_post = """    @bp.post("/rl-live-premium")
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
            return jsonify({"error": str(e)}), 500"""

if rl_post not in app_py and target in app_py:
    app_py = app_py.replace(target, target + '\n\n' + rl_post)
    with open('ml-service/app.py', 'w') as f:
        f.write(app_py)
    print('Patched app.py')
else:
    print('WARNING app.py target not found or already patched')

# 2. Update mlService.ts
with open('backend/src/services/mlService.ts', 'r') as f:
    ml_ts = f.read()

rl_method = """  async predictRLPremium(
    workerId: string,
    zoneMultiplier: number,
    weatherMultiplier: number,
    historyMultiplier: number,
    platform: string,
    accountAgeDays: number
  ): Promise<{ rl_premium: number | null }> {
    const result = await this.post<{ rl_premium: number | null }>('/rl-live-premium', {
      worker_id: workerId,
      zone_multiplier: zoneMultiplier,
      weather_multiplier: weatherMultiplier,
      history_multiplier: historyMultiplier,
      platform,
      account_age_days: accountAgeDays
    });
    return result || { rl_premium: null };
  }"""

if 'predictRLPremium' not in ml_ts:
    target_ml = '  async scoreFraud(params: {'
    ml_ts = ml_ts.replace(target_ml, rl_method + '\n\n' + target_ml)
    with open('backend/src/services/mlService.ts', 'w') as f:
        f.write(ml_ts)
    print('Patched mlService.ts')
else:
    print('mlService.ts already patched')
