from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.security import APIKeyHeader
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn
import os
import logging
from dotenv import load_dotenv
from contextlib import asynccontextmanager

from schemas.prediction import DelayPredictionInput, DelayPredictionOutput
from models.delay_predictor import DelayPredictor
from utils.security import verify_api_key

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model instance
predictor = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor
    logger.info("Initializing app and loading delay predictor model...")
    predictor = DelayPredictor()
    predictor.load_model()
    logger.info("Model loaded successfully.")
    yield
    logger.info("Shutting down delay predictor service.")
    predictor = None

app = FastAPI(
    title="Smart Supply Chain — Delay Prediction Microservice",
    description="Predicts delay probability, expected delay minutes and risk score",
    version="1.0.0",
    docs_url="/docs" if os.getenv("ENV") != "production" else None,
    redoc_url=None,
    lifespan=lifespan
)

def get_predictor():
    if predictor is None:
        raise RuntimeError("Predictor model is not initialized.")
    return predictor

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

@app.post("/predict", response_model=DelayPredictionOutput)
async def predict_delay(
    payload: DelayPredictionInput,
    api_key: str = Depends(api_key_header),
    model: DelayPredictor = Depends(get_predictor)
):
    if not verify_api_key(api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key"
        )

    try:
        result = model.predict(payload.model_dump())
        return result
    except Exception as e:
        logger.error(f"Prediction failed due to internal error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred during prediction processing."
        )


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "delay-prediction"}


@app.get("/")
async def root():
    return {"message": "Delay Prediction Service — use /docs for API documentation"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("ENV", "development") == "development"
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=reload,
        workers=1 if reload else 2
    )