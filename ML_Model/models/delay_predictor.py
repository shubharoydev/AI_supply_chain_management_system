"""
Delay prediction: Gradient Boosting regression on scaled features.

We use HistGradientBoostingRegressor (sklearn) for:
- Strong nonlinear fits on tabular logistics features
- Native handling of ~100k+ rows with modest memory vs classic GBR
- Less hyperparameter sensitivity than deep nets for this feature set

R² on real last-mile data is often moderate (0.35–0.65) because many drivers of delay are
unobserved (restaurant prep, customer handoff). Synthetic data is included in training to keep
API behavior stable when real data is sparse; weights favor real rows when present.

Outputs combine the regression target with calibration stats from training labels for
delay_probability and risk_score (not arbitrary heuristics on 180 min).
"""
import os
import json
import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.preprocessing import StandardScaler



class DelayPredictor:
    def __init__(self):
        self.model = HistGradientBoostingRegressor(
            max_iter=420,
            learning_rate=0.06,
            max_depth=12,
            min_samples_leaf=18,
            l2_regularization=0.12,
            early_stopping=True,
            validation_fraction=0.12,
            n_iter_no_change=25,
            random_state=42,
        )
        self.scaler = StandardScaler()
        self.is_trained = False
        self.y_mean = 45.0
        self.y_std = 12.0
        self.y_p75 = 52.0
        self.stats_path = os.getenv(
            "TRAINING_STATS_PATH", "./models/saved_model/training_stats.json"
        )

    def _load_stats(self):
        if os.path.exists(self.stats_path):
            with open(self.stats_path, "r", encoding="utf-8") as f:
                s = json.load(f)
            self.y_mean = float(s.get("y_mean", self.y_mean))
            self.y_std = max(float(s.get("y_std", self.y_std)), 1e-6)
            self.y_p75 = float(s.get("y_p75", self.y_p75))

    def load_model(self):
        model_path = os.getenv("MODEL_PATH", "./models/saved_model/model.joblib")
        scaler_path = os.getenv("SCALER_PATH", "./models/saved_model/scaler.joblib")

        if os.path.exists(model_path) and os.path.exists(scaler_path):
            self.model = joblib.load(model_path)
            self.scaler = joblib.load(scaler_path)
            self._load_stats()
            self.is_trained = True
            print("Loaded pre-trained model + scaler + stats")
        else:
            raise FileNotFoundError(
                f"Model files not found. Ensure {model_path} and {scaler_path} exist."
            )

    def predict(self, data: dict):
        if not self.is_trained:
            raise RuntimeError("Model not trained or loaded")

        features = np.array(
            [
                [
                    data["distance"],
                    data["traffic"],
                    data["weather"],
                    data["historical_delay"],
                ]
            ]
        )

        features_scaled = self.scaler.transform(features)
        minutes = float(self.model.predict(features_scaled)[0])
        minutes = max(0.0, round(minutes, 1))

        # Calibrated delay probability: exceed typical (75th percentile) delay given feature-induced mean
        z = (minutes - self.y_p75) / max(self.y_std, 1e-6)
        prob = float(1.0 / (1.0 + np.exp(-np.clip(z, -4.0, 4.0))))
        prob = float(np.clip(prob, 0.02, 0.98))

        # Risk: combines probability and magnitude vs mean
        mag = abs(minutes - self.y_mean) / max(self.y_std, 1e-6)
        risk = int(np.clip(35.0 * prob + 25.0 * min(mag, 3.0), 0, 100))

        return {
            "delay_probability": round(prob, 3),
            "expected_delay_minutes": minutes,
            "risk_score": risk,
        }
