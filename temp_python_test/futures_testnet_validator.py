import os
import sys
from dotenv import load_dotenv
from binance.client import Client
from binance.exceptions import BinanceAPIException

def run_validator():
    # 1. Load environment variables
    load_dotenv(override=True)
    
    api_key = os.getenv('BINANCE_API_KEY')
    api_secret = os.getenv('BINANCE_API_SECRET')
    use_testnet = os.getenv('TESTNET', 'true').lower() == 'true'
    use_demo = os.getenv('DEMO', 'false').lower() == 'true'

    if not api_key or api_key == 'YOUR_TESTNET_API_KEY':
        print("Error: Please set your BINANCE_API_KEY in the .env file.")
        print("Refer to TESTNET_SETUP.md for instructions.")
        sys.exit(1)

    print(f"--- Initializing Binance Client (Testnet: {use_testnet}, Demo: {use_demo}) ---")
    
    try:
        # 2. Initialize the Client
        client = Client(api_key, api_secret, testnet=use_testnet, demo=use_demo)
        
        # 3. Check connectivity & Account Info
        print("Checking account information...")
        account_info = client.futures_account()
        
        balance = 0
        for asset in account_info['assets']:
            if asset['asset'] == 'USDT':
                balance = float(asset['walletBalance'])
                break
        
        print(f"Successfully connected! USDT Wallet Balance: {balance}")

        # 4. Get Current Price for BTCUSDT
        symbol = 'BTCUSDT'
        ticker = client.futures_symbol_ticker(symbol=symbol)
        print(f"Current {symbol} Price: {ticker['price']}")

        # 5. Perform a test trade (Smallest possible Market Buy)
        # We use a very small quantity just to verify the order goes through.
        # Check exchange info for min quantity if this fails.
        print(f"Attempting a test MARKET BUY for {symbol}...")
        
        # Note: In futures, you usually need a bit of balance.
        # If you have 0 balance, this will fail with an error.
        try:
            order = client.futures_create_order(
                symbol=symbol,
                side='BUY',
                type='MARKET',
                quantity=0.001  # Minimum for BTCUSDT is usually 0.001
            )
            print("Order created successfully!")
            print(f"Order ID: {order['orderId']}")
            
            # Immediately close it if you want to be safe, 
            # but for a demo we'll just show the status.
            status = client.futures_get_order(symbol=symbol, orderId=order['orderId'])
            print(f"Order Status: {status['status']}")
            
        except BinanceAPIException as e:
            if e.code == -2011:
                print("Order failed: Likely due to insufficient balance in your Testnet account.")
                print("Go to the Testnet faucet to get some free USDT.")
            else:
                print(f"Order failed with error: {e}")

    except BinanceAPIException as e:
        print(f"An error occurred during initialization: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    run_validator()
