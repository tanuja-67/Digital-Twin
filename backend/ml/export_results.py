from __future__ import annotations

from pathlib import Path
import json
import joblib
import numpy as np

from ml.train_model import train_and_save_model, MODEL_PATH, FEATURES


def main() -> dict:
    summary = train_and_save_model()

    # Load the saved model payload to extract feature importances
    payload = joblib.load(MODEL_PATH)
    model = payload.get("model")
    features = payload.get("features", FEATURES)
    model_name = payload.get("model_name", summary.get("best_model"))

    importances = None
    if hasattr(model, "feature_importances_"):
        importances = list(map(float, model.feature_importances_))
    elif hasattr(model, "coef_"):
        coef = np.ravel(model.coef_)
        importances = list(map(float, np.abs(coef)))

    results = {
        "summary": summary,
        "model_name": model_name,
        "feature_importances": dict(zip(features, importances)) if importances is not None else None,
    }

    out_dir = Path(__file__).resolve().parent
    out_json = out_dir / "training_summary.json"
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    # Try to create a simple bar plot for feature importances
    try:
        import matplotlib.pyplot as plt

        if importances is not None:
            idx = np.argsort(importances)[::-1]
            feat_sorted = [features[i] for i in idx]
            imp_sorted = [importances[i] for i in idx]
            plt.figure(figsize=(8, 4))
            plt.bar(feat_sorted, imp_sorted, color="#2b8cbe")
            plt.title("Feature importances")
            plt.tight_layout()
            plt.savefig(out_dir / "feature_importances.png")
            plt.close()
    except Exception:
        # plotting is optional; ignore failures (e.g., missing matplotlib)
        pass

    print(f"Saved summary to: {out_json}")
    print(results)
    return results


if __name__ == "__main__":
    main()
