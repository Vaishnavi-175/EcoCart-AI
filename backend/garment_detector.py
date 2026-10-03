from pathlib import Path
from ultralytics import YOLO

MODEL_PATH = Path(__file__).resolve().parent.parent / "ml" / "models" / "garment_detector_best.pt"

model = YOLO(str(MODEL_PATH))


def detect_garments(image_path: str):
    results = model.predict(
        source=image_path,
        conf=0.25,
        verbose=False
    )

    result = results[0]

    detections = []

    for box in result.boxes:
        class_id = int(box.cls[0])
        confidence = float(box.conf[0])

        detections.append({
            "garment": result.names[class_id],
            "confidence": round(confidence, 3)
        })

    return detections
