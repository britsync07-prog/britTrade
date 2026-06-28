import talib.abstract as ta
from pandas import DataFrame
from freqtrade.strategy import IStrategy, IntParameter, DecimalParameter
import numpy as np

class GridMeanReversion(IStrategy):
    INTERFACE_VERSION = 3
    timeframe = '5m'
    can_short: bool = False
    
    # Grid/DCA Settings - Crucial for Dark Venus
    position_adjustment_enable = True
    max_entry_position_adjustment = 10  # Increased for deeper recovery
    
    # Profit Target
    minimal_roi = { "0": 0.01 } # 1% profit target for the whole basket
    stoploss = -0.35            # Safety net: Exit if we lose 35% after DCA steps

    # Never sell at a loss UNLESS stoploss is hit
    exit_profit_only = True
    use_exit_signal = True

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # Bollinger Bands
        bollinger = ta.BBANDS(dataframe, timeperiod=20, nbdevup=2.0, nbdevdn=2.0)
        dataframe['bb_lower'] = bollinger['lowerband']
        dataframe['bb_middle'] = bollinger['middleband']
        
        # RSI
        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)
        
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[
            (
                (dataframe['close'] < dataframe['bb_lower']) &
                (dataframe['rsi'] < 20) & # Stricter entry
                (dataframe['volume'] > 0)
            ),
            'enter_long'] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # We sell when price recovers to the middle band, 
        # BUT only if we are in profit (checked by exit_profit_only)
        dataframe.loc[
            (
                (dataframe['close'] > dataframe['bb_middle'])
            ),
            'exit_long'] = 1
        return dataframe

    def adjust_trade_position(self, trade, current_time, current_rate, current_profit, min_stake, max_stake, current_entry_rate, current_exit_rate, current_entry_profit, trade_count_fi, **kwargs):
        """
        Structured DCA: Buy at progressive 5% drop levels (-5%, -10%, -15%, etc.) to pull average price down.
        """
        count_of_entries = trade.nr_of_successful_entries
        
        # Calculate target drop threshold for the NEXT DCA level
        # Level 1 DCA triggers at -5% (-0.05 * 1), Level 2 DCA at -10% (-0.05 * 2), etc.
        target_dca_profit = -0.05 * count_of_entries

        if current_profit > target_dca_profit:
            return None

        # Add initial stake amount to lower average entry price
        if count_of_entries <= self.max_entry_position_adjustment:
            return trade.stake_amount

        return None
