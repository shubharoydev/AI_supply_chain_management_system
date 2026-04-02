from pydantic import BaseModel, Field

class DelayPredictionInput(BaseModel):
    distance: float = Field(..., ge=0, description="Distance in km")
    traffic: float = Field(..., ge=0, le=100, description="Traffic congestion index (0-100)")
    weather: float = Field(..., ge=0, le=100, description="Weather severity index (0-100)")
    historical_delay: float = Field(..., ge=0, description="Average historical delay in minutes")


class DelayPredictionOutput(BaseModel):
    delay_probability: float = Field(..., ge=0, le=1, description="Probability of delay (0.0–1.0)")
    expected_delay_minutes: float = Field(..., ge=0, description="Predicted delay time in minutes")
    risk_score: int = Field(..., ge=0, le=100, description="Risk score (0–100)")