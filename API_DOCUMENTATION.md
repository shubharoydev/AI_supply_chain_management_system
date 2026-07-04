## 📚 API Documentation

### Authentication Endpoints

#### POST /api/auth/register
Register a new user account.

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "role": "manager|admin|driver"
}
```

#### POST /api/auth/login
Authenticate user and receive tokens.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "user": {
    "id": "string",
    "username": "string",
    "role": "string"
  }
}
```

### Delivery Endpoints

#### GET /api/deliveries
Fetch all shipments (requires authentication).

#### POST /api/deliveries
Create a new shipment (requires authentication).

**Request Body:**
```json
{
  "origin": "string",
  "destinations": ["string"],
  "truckId": "string",
  "cargoType": "general|essential|pharma",
  "cargoValue": 50000
}
```

#### POST /api/deliveries/:id/start
Start delivery simulation (requires authentication).

#### POST /api/deliveries/:id/stop
Stop delivery simulation (requires authentication).

#### DELETE /api/deliveries/:id
Delete a shipment (requires authentication).

### Advisory Endpoints

#### GET /api/advisory/briefing
Generate AI network briefing (requires authentication).

#### POST /api/advisory/ask
Ask AI advisor a question (requires authentication).

**Request Body:**
```json
{
  "question": "string"
}
```

### ML Service Endpoints

#### POST /predict
Predict delay for given parameters.

**Headers:**
```
X-API-Key: your-api-key
```

**Request Body:**
```json
{
  "distance": 100.5,
  "traffic": 45.0,
  "weather": 30.0,
  "historical_delay": 40.0
}
```

**Response:**
```json
{
  "delay_probability": 0.75,
  "expected_delay_minutes": 35.5,
  "risk_score": 78
}
```

For complete API documentation, see the [OpenAPI/Swagger documentation](http://localhost:8000/docs) when the ML service is running.

## 💡 Usage Examples

### Creating a Shipment

```javascript
import axios from 'axios';

const shipment = await axios.post('http://localhost:5000/api/deliveries', {
  origin: 'Siliguri, West Bengal',
  destinations: ['Kolkata, West Bengal'],
  truckId: 'TRK-12345',
  cargoType: 'essential',
  cargoValue: 75000
}, {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

### Starting Delivery Simulation

```javascript
await axios.post(`http://localhost:5000/api/deliveries/${shipmentId}/start`, {}, {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

### Getting AI Advisory

```javascript
const briefing = await axios.get('http://localhost:5000/api/advisory/briefing', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

console.log(briefing.data.briefing);
```

### ML Prediction

```python
import requests

response = requests.post(
    'http://localhost:8000/predict',
    json={
        'distance': 150.0,
        'traffic': 60.0,
        'weather': 45.0,
        'historical_delay': 50.0
    },
    headers={'X-API-Key': 'your-api-key'}
)

print(response.json())
```