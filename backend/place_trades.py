import time
import hmac
import hashlib
import requests

API_KEY = 'OtQlPsGh9oYw8LfIfJ2cwUHnzo96PCT6frFS0bgDRkh4nSN4IfWw72mpykiES1Vn'
SECRET_KEY = 'WjtLdeE5gjw6Ficge3D8cPTkWWYd5lpEjcU3aal3Hy0ZX7d4QxJkV03qEe0iLaYy'

def place_order(host, endpoint, params):
    params['timestamp'] = int(time.time() * 1000)
    query = '&'.join([f"{k}={v}" for k, v in params.items()])
    signature = hmac.new(SECRET_KEY.encode('utf-8'), query.encode('utf-8'), hashlib.sha256).hexdigest()
    url = f"{host}{endpoint}?{query}&signature={signature}"
    
    headers = {
        'X-MBX-APIKEY': API_KEY,
        'User-Agent': 'Mozilla/5.0'
    }
    
    print(f"Sending request to {host}{endpoint}...")
    try:
        response = requests.post(url, headers=headers, timeout=15)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

# Place Futures Order
print("\n--- PLACING FUTURES ORDER ---")
place_order('https://demo-fapi.binance.com', '/fapi/v1/order', {
    'symbol': 'BTCUSDT',
    'side': 'BUY',
    'type': 'MARKET',
    'quantity': '0.001'
})

# Place Spot Order
print("\n--- PLACING SPOT ORDER ---")
place_order('https://demo-api.binance.com', '/api/v3/order', {
    'symbol': 'BTCUSDT',
    'side': 'BUY',
    'type': 'MARKET',
    'quantity': '0.001'
})
