import talib.abstract as ta
from pandas import DataFrame
from freqtrade.strategy import IStrategy, IntParameter
import pandas_ta as pta

class TrendFollower(IStrategy):
    """
    Trend following strategy that uses Supertrend, ADX, and Bollinger Bands.
    Aims to catch big moves, let winners run, and cut losses early to prevent bag holding.
    """
    INTERFACE_VERSION = 3
    timeframe = '1h'
    
    # Let winners run: no fixed ROI target, we rely on the trailing stop
    minimal_roi = { "0": 100.0 } 
    
    # Hard stop loss to prevent "dead coin" bags (-10%)
    stoploss = -0.10
    
    # Trailing stop to lock in profits as the trend rides up
    # Activates when profit reaches 5%, then trails at 2% distance
    trailing_stop = True
    trailing_stop_positive = 0.02
    trailing_stop_positive_offset = 0.05
    trailing_only_offset_is_reached = True

    # Parameters
    adx_level = IntParameter(20, 40, default=25, space="buy", optimize=True)

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # ADX for trend strength
        dataframe['adx'] = ta.ADX(dataframe, timeperiod=14)
        
        # Supertrend for trend direction
        st = pta.supertrend(dataframe['high'], dataframe['low'], dataframe['close'], length=10, multiplier=3.0)
        dataframe['supertrend_dir'] = st['SUPERTd_10_3.0']
        
        # Bollinger Bands for volatility breakout
        bollinger = ta.BBANDS(dataframe, timeperiod=20, nbdevup=2.0, nbdevdn=2.0)
        dataframe['bb_upperband'] = bollinger['upperband']
        
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[
            (
                (dataframe['supertrend_dir'] == 1) & # Uptrend
                (dataframe['adx'] > self.adx_level.value) & # Strong trend
                (dataframe['close'] > dataframe['bb_upperband']) & # Breakout
                (dataframe['volume'] > 0)
            ),
            'enter_long'] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[
            (
                (dataframe['supertrend_dir'] == -1) # Trend reversed
            ),
            'exit_long'] = 1
        return dataframe
