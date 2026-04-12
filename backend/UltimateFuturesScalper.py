import talib.abstract as ta
from pandas import DataFrame
from freqtrade.strategy import IStrategy

class UltimateFuturesScalper(IStrategy):
    INTERFACE_VERSION = 3
    timeframe = '5m'
    can_short = True
    
    # 0.5% profit target - we want many small wins per day
    minimal_roi = { "0": 0.005 }
    
    # HARD STOP LOSS: If we lose 10%, get out to prevent liquidation.
    stoploss = -0.10
    
    # The "Banker" Rule: Never sell if the trade is red, UNLESS it hits the 10% stoploss
    exit_profit_only = True
    
    # High frequency settings
    process_only_new_candles = True
    startup_candle_count = 100

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)
        dataframe['ema20'] = ta.EMA(dataframe, timeperiod=20)
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # LONG: RSI is low, buy the quick dip
        dataframe.loc[
            (dataframe['rsi'] < 30) & 
            (dataframe['volume'] > 0),
            'enter_long'] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # Exit Long: RSI recovery
        dataframe.loc[(dataframe['rsi'] > 50), 'exit_long'] = 1
        return dataframe

    def populate_short_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # SHORT: RSI is high, bet on the quick drop
        dataframe.loc[
            (dataframe['rsi'] > 70) & 
            (dataframe['volume'] > 0),
            'enter_short'] = 1
        return dataframe

    def populate_exit_short_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # Exit Short: RSI drop
        dataframe.loc[(dataframe['rsi'] < 50), 'exit_short'] = 1
        return dataframe
