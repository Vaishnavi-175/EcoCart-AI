from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from pathlib import Path
from backend.garment_detector import detect_garments


# =========================
# CREATE FASTAPI APP
# =========================

app = FastAPI(
    title="EcoCart-AI API",
    description="Fashion sustainability and Eco Score API",
    version="1.0.0"
)


# =========================
# CORS
# =========================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# =========================
# LOAD PROCESSED DATA
# =========================

DATA_FILE = str(Path(__file__).resolve().parent.parent / "data" / "processed" / "zara_material_sustainability.csv")

df = pd.read_csv(DATA_FILE)


# =========================
# HOME API
# =========================

@app.get("/")
def home():

    return {
        "message": "EcoCart-AI API is running",
        "products": len(df)
    }


# =========================
# GET ALL PRODUCTS
# =========================

@app.get("/products")
def get_products():

    products = (
        df[
            [
                "product_id",
                "product_name",
                "material",
                "percentage",
                "carbon",
                "eco_score"
            ]
        ]
        .drop_duplicates()
        .to_dict(orient="records")
    )

    return {
        "count": len(products),
        "products": products
    }


# =========================
# SEARCH PRODUCTS
# =========================

@app.get("/products/search")
def search_products(q: str):

    result = df[
        df["product_name"]
        .str.contains(q, case=False, na=False)
    ]

    if result.empty:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    products = (
        result[
            [
                "product_id",
                "product_name",
                "material",
                "percentage",
                "carbon",
                "eco_score"
            ]
        ]
        .drop_duplicates()
        .to_dict(orient="records")
    )

    return {
        "count": len(products),
        "products": products
    }


# =========================
# GET PRODUCT BY ID
# =========================

@app.get("/products/{product_id}")
def get_product(product_id: int):

    result = df[
        df["product_id"] == product_id
    ]

    if result.empty:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    product_name = result.iloc[0]["product_name"]

    materials = (
        result[
            [
                "material",
                "percentage",
                "carbon",
                "eco_score"
            ]
        ]
        .drop_duplicates()
        .to_dict(orient="records")
    )

    return {
        "product_id": product_id,
        "product_name": product_name,
        "materials": materials
    }


# =========================
# MATERIAL DATABASE
# =========================

@app.get("/materials")
def get_materials():

    materials = (
        df[
            [
                "material",
                "carbon",
                "eco_score"
            ]
        ]
        .drop_duplicates()
        .sort_values("eco_score", ascending=False)
        .to_dict(orient="records")
    )

    return {
        "count": len(materials),
        "materials": materials
    }


# =========================
# API INFO
# =========================

@app.get("/health")
def health_check():

    return {
        "status": "healthy",
        "database_records": len(df)
    }

# =========================
# AI GARMENT IMAGE ANALYSIS
# =========================

@app.post("/analyze-image")
async def analyze_image(file: UploadFile = File(...)):

    import tempfile
    import os

    file_bytes = await file.read()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as temp:
        temp.write(file_bytes)
        temp_path = temp.name

    try:
        detections = detect_garments(temp_path)

        return {
            "filename": file.filename,
            "detections": detections
        }

    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

