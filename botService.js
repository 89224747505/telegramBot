const axios = require('axios');
const { EMA, MACD, RSI, ADX, ATR } = require('technicalindicators');

class BotService {

volumeWeightedAveragePriceIndicator(candles, length) {
    let cumulativeTPV = 0;   // Typical Price * Volume
    let cumulativeVolume = 0;
  
    // Берём последние length свечей
    const relevantCandles = candles.slice(-length);
    relevantCandles.forEach(candle => {
      const high = parseFloat(candle[2]);
      const low = parseFloat(candle[3]);
      const close = parseFloat(candle[4]);
      const volume = parseFloat(candle[5]);
  
      const typicalPrice = (high + low + close) / 3;
  
      cumulativeTPV += typicalPrice * volume;
      cumulativeVolume += volume;
    });
  
    const vwap = cumulativeTPV / cumulativeVolume;
    return vwap;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
////  channelBreakoutSignalIndicator - метод индикатора выхода из канала, который дает сигнал на покупку в зависимости от того в какую сторону пересекли канал
////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async channelBreakoutSignalIndicator(SYMBOL, TIMEFRAME, LENGTH = 5, settings) {
    const tickSize = await this.getTickSizeBybit(SYMBOL, settings);
    if (!tickSize) {
        console.error("Не удалось получить tickSize. Завершаем проверку.");
        return false;
    }

    const candles = await this.fetchKlines(SYMBOL, TIMEFRAME, LENGTH + 1, settings);
    if (candles.length < LENGTH + 1) return null;

    const highs = candles.map(c => parseFloat(c[2])); // Максимумы свечей
    const lows = candles.map(c => parseFloat(c[3]));  // Минимумы свечей
    const closes = candles.map(c => parseFloat(c[4])); // Закрытия свечей

    const upBound = Math.max(...highs.slice(0, LENGTH));
    const downBound = Math.min(...lows.slice(0, LENGTH));

    const lastClose = closes[closes.length - 1];
    
    if (lastClose >= upBound + tickSize) {
        return { signal: "LONG", level: upBound };
    } else if (lastClose <= downBound - tickSize) {
        return { signal: "SHORT", level: downBound };
    }
    return { signal: "NONE" };
}

volumeMinHighAverage(candles, average_candles_period) {
    let minVolume, averageVolume, currentVolume;

    const volumes = candles.map(candle => parseFloat(candle[5]));
    volumes.reverse();

    minVolume = Math.min(...volumes);
    averageVolume = volumes.slice(0, average_candles_period).reduce((a, b) => a + b, 0) / average_candles_period;

    currentVolume = volumes[0]; // Самый последний объём после reverse()
    
    return [minVolume, averageVolume, currentVolume];
}    
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
////  trendSignalEmaFastSlow - метод расчета индикатора пересечения быстрой EMA медленной
////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async trendSignalEmaFastSlow(ema_fast_period, ema_slow_period, closes) {
    
    const emaFast = EMA.calculate({ period: ema_fast_period, values: closes });
    const emaSlow = EMA.calculate({ period: ema_slow_period, values: closes });

    const ema_trend_fast_slow = emaFast[emaFast.length - 1] >= emaSlow[emaSlow.length - 1] ? 'Bullish' : 'Bearish';
    
    return ema_trend_fast_slow;
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
////  calculateIndicators - метод рассчета индикаторов
////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


async calculateIndicators(symbol, settings, flag = false, isSignal = false) {
    
    const {
        TIMEFRAME,
        LENGTH_BREAKOUT,
        AVERAGE_CANDLES_PERIOD,
        EMA_FAST_PERIOD,
        EMA_SLOW_PERIOD,
        TIMEFRAMES,
        VOLUME_MULTIPLIER
    } = settings;
    
    //Расчет индиатора выхода из канала и выход из метода если выхода из канала нет
    const channelBreakout = await this.channelBreakoutSignalIndicator(symbol, TIMEFRAME, LENGTH_BREAKOUT, settings)
    if (!flag && channelBreakout.signal === 'NONE') return false;
    
    //Запрос свечей по переданному символу и таймфрейму. Кол-во свечей загружается необходимое для рассчета ema_slow
    const candles = await this.fetchKlines(symbol, TIMEFRAME, EMA_SLOW_PERIOD, settings);
    const closes = candles.map(c => parseFloat(c[4])); // Закрытие свечей
    const highs = candles.map(c => parseFloat(c[2])); // максимумы
    const lows = candles.map(c => parseFloat(c[3])); // минимумы
    const currentPrice = candles[candles.length - 1][4]; // Текущая цена (Close последней свечи)

    //Расчет индикатора тренда на основании расположения 
    const ema_trend_fast_slow = await this.trendSignalEmaFastSlow(EMA_FAST_PERIOD, EMA_SLOW_PERIOD, closes);
    
    //Расчет VWAP с тем же периодом что и channel breakout
    const VWAP = this.volumeWeightedAveragePriceIndicator(candles, LENGTH_BREAKOUT)
    
    //Проверка условия совпадения значений индиакторов
    const isValidSignal = (
        (channelBreakout.signal === 'LONG' && ema_trend_fast_slow === 'Bullish') ||
        (channelBreakout.signal === 'SHORT' && ema_trend_fast_slow === 'Bearish')
      );
      
    if (isSignal && channelBreakout.signal === 'NONE') {
      return false;
    }

       //Нахождение минимальных и средних объемов. И проверка условия при котором рост объемов сравнивается между средним и минимальным значением с мультипликатором
    const [minVolume, averageVolume, currentVolume] = this.volumeMinHighAverage(candles, AVERAGE_CANDLES_PERIOD);

    if (!flag && minVolume * VOLUME_MULTIPLIER > averageVolume) {
        return false;
    }

    // MACD 12, 26, 9
    const macdResult = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });
    const macdCross = macdResult.length > 1 && (macdResult[macdResult.length - 1].MACD > macdResult[macdResult.length - 1].signal);

    // RSI 13, RSI 5 и RSI 14
    const rsi13 = RSI.calculate({ period: 13, values: closes });
    const rsi5 = RSI.calculate({ period: 5, values: closes });
    const lastRSI13 = rsi13[rsi13.length - 1] || 50;
    const lastRSI5 = rsi5[rsi5.length - 1] || 50;

    // EMA 5, EMA 11, EMA 13 и EMA 36
    const ema5 = EMA.calculate({ period: 5, values: closes });
    const ema11 = EMA.calculate({ period: 11, values: closes });
    const ema13 = EMA.calculate({ period: 13, values: closes });
    const ema36 = EMA.calculate({ period: 36, values: closes });

    const trendBar1 = ema5.length > 1 && ema5[ema5.length - 1] > ema11[ema11.length - 1];
    const trendBar2 = ema13.length > 1 && ema13[ema13.length - 1] > ema36[ema36.length - 1];
   
    const bullish = `🟢`;
    const bearish = `🔴`;
    
    // MACD на разных таймфреймах
    const macdValues = {};
    let sumVectors = 0;
    
    for (const timeframe of TIMEFRAMES) {
        const candles = await this.fetchKlines(symbol, timeframe, EMA_SLOW_PERIOD, settings);
        const closes = candles.map(c => parseFloat(c[4]));
    
        const macdResult = MACD.calculate({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });
    
        if (macdResult.length > 1) {
            const currentMACD = macdResult[macdResult.length - 1].MACD;
            const currentSignal = macdResult[macdResult.length - 1].signal;
            const currentHistogram = macdResult[macdResult.length - 1].histogram;
            const previousHistogram = macdResult[macdResult.length - 2].histogram;
            const previousMACD = macdResult[macdResult.length - 2].MACD;
            const previousSignal = macdResult[macdResult.length - 2].signal;
    
            // Цвет кружка в зависимости от знака гистограммы
            const circle = currentHistogram > 0 ? '🟢' : '🔴';
    
            // Определение направления
            const arrow = currentHistogram > previousHistogram ? '🔼' : '🔽';
    
            // Определение силы вектора направления
            const vector = currentHistogram - previousHistogram;
    
            // Прибавляем к сумме векторов
            sumVectors += Number(vector);
    
            // Проверяем отношение MACD к Signal, чтобы добавить лимит
            const limit = Math.abs(currentMACD) < 0.5 * Math.abs(currentSignal) ? '⚠️' : '';
    
            // Проверяем пересечение MACD и сигнальной линии
            let cross = '';
            if (previousMACD <= previousSignal && currentMACD > currentSignal) {
                cross = '📈 Пересечение вверх';
            } else if (previousMACD >= previousSignal && currentMACD < currentSignal) {
                cross = '📉 Пересечение вниз';
            }
    
            // Формируем итоговый значок
            macdValues[timeframe] = {
                value: currentHistogram,
                vector: vector,
                sumVectors: sumVectors,
                circle: circle,
                arrow: arrow,
                limit: limit,
                cross: cross
            };
        }
    }

    // Trend Meter Calculation
    const trendMeter1 = macdCross ? bullish : bearish;
    const trendMeter2 = lastRSI13 > 50 ? bullish : bearish;
    const trendMeter3 = lastRSI5 > 50 ? bullish : bearish;
    let trendMeterSignal = 'No';
    
    if (macdCross && lastRSI13 > 50 && lastRSI5 > 50) {
        trendMeterSignal = 'Bullish';
    } else if (!macdCross && lastRSI13 <= 50 && lastRSI5 <= 50) {
        trendMeterSignal = 'Bearish';
    }

    // ADX & ATR расчет
    const adxPeriod = 14; // Обычно 14 периодов
    const atrPeriod = 14;

    const adxResult = ADX.calculate({
        close: closes,
        high: highs,
        low: lows,
        period: adxPeriod
    });
    const atrResult = ATR.calculate({
        close: closes,
        high: highs,
        low: lows,
        period: atrPeriod
    });

    const lastADX = adxResult.length > 0 ? adxResult[adxResult.length - 1].adx : 0;
    const lastATR = atrResult.length > 0 ? atrResult[atrResult.length - 1] : 0;
    
    // Считаем среднее ATR по всем доступным значениям
    const avgATR = atrResult.reduce((a, b) => a + b, 0) / atrResult.length;

    if (isSignal && settings.SIGNAL === channelBreakout.signal) {
        return `✅${symbol}               
                  \*ТЕКУЩАЯ ЦЕНА ${currentPrice}\*
                  Текущий объем ${currentVolume.toFixed(5)}               
                  ADX ${lastADX.toFixed(2)}% \*${lastADX > 40 ? 'сильный тренд' : lastADX > 30 ? 'тренд' : lastADX > 20 ? 'слабый тренд' : 'флет'}\*
                  ATR ${lastATR.toFixed(2)} \*${lastATR < avgATR ? 'слабая волотильность' : lastATR > 2*avgATR ? 'сильная волатильность' : 'оптимально'}\*               
                  VWAP ${VWAP.toFixed(2)} \*${VWAP < currentPrice ? '🟢 возможен LONG' : '🔴 возможен SHORT'}\*
                  ${ema_trend_fast_slow === 'Bullish' ? bullish : bearish} - EMA тренд
                  ${trendMeterSignal === 'Bullish' ? bullish : bearish} - Trend Signal
                  ${trendMeter1} - TrendMeter1
                  ${trendMeter2} - TrendMeter2
                  ${trendMeter3} - TrendMeter3
                  ${trendBar1 ? bullish : bearish} - TrendBar1
                  ${trendBar2 ? bullish : bearish} - TrendBar2
                                      
                  TF      Сигнал  
                  (01m)${macdValues['1']?.circle}${macdValues['1']?.arrow}${macdValues['1']?.cross} 
                  (03m)${macdValues['3']?.circle}${macdValues['3']?.arrow}${macdValues['3']?.cross} 
                  (05m)${macdValues['5']?.circle}${macdValues['5']?.arrow}${macdValues['5']?.cross} 
                  (15m)${macdValues['15']?.circle}${macdValues['15']?.arrow}${macdValues['15']?.cross}
                  (30m)${macdValues['30']?.circle}${macdValues['30']?.arrow}${macdValues['30']?.cross}
                  (01 h)${macdValues['60']?.circle}${macdValues['60']?.arrow}${macdValues['60']?.cross}
                  (02 h)${macdValues['120']?.circle}${macdValues['120']?.arrow}${macdValues['120']?.cross}
                  (04 h)${macdValues['240']?.circle}${macdValues['240']?.arrow}${macdValues['240']?.cross}
                  (06 h)${macdValues['360']?.circle}${macdValues['360']?.arrow}${macdValues['360']?.cross}
                  (12 h)${macdValues['720']?.circle}${macdValues['720']?.arrow}${macdValues['720']?.cross}
                  (01 D)${macdValues['D']?.circle}${macdValues['D']?.arrow}${macdValues['D']?.cross} 
                  (01W)${macdValues['W']?.circle}${macdValues['W']?.arrow}${macdValues['W']?.cross}`; 
      }
      
      settings.SIGNAL = channelBreakout.signal;

    return `✅${symbol} Таймфрейм ${TIMEFRAME}м
    
    \*СИГНАЛ ${channelBreakout.signal !== 'NONE' ? channelBreakout.signal : 'отсутствует'}\*
    
    \*ТЕКУЩАЯ ЦЕНА ${currentPrice}\*
    \*УРОВЕНЬ ВХОДА ${channelBreakout.signal !== 'NONE' ? channelBreakout.level : 'отсутствует'}\*

    Объемы:
        Текущий ${currentVolume.toFixed(5)}
        Средний ${averageVolume.toFixed(5)}
        Минимум ${minVolume.toFixed(5)}
       
    ADX ${lastADX.toFixed(2)}% \*${lastADX > 40 ? 'сильный тренд' : lastADX > 30 ? 'тренд' : lastADX > 20 ? 'слабый тренд' : 'флет'}\*
    Средний ATR ${avgATR.toFixed(5)} \*${lastATR < avgATR ? 'слабая волотильность' : lastATR > 2*avgATR ? 'сильная волатильность' : 'оптимально'}\*
    ATR ${lastATR.toFixed(5)} 
    VWAP ${VWAP.toFixed(2)} \*${VWAP < currentPrice ? '🟢 возможен LONG' : '🔴 возможен SHORT'}\*

    EMA тренд ${ema_trend_fast_slow === 'Bullish' ? bullish : bearish}
    FastEMA \*${EMA_FAST_PERIOD}\*
    SlowEMA \*${EMA_SLOW_PERIOD}\* 
    
    
    ${trendMeterSignal === 'Bullish' ? bullish : bearish} - Trend Signal
    ${trendMeter1} - TrendMeter1
    ${trendMeter2} - TrendMeter2
    ${trendMeter3} - TrendMeter3
    ${trendBar1 ? bullish : bearish} - TrendBar1
    ${trendBar2 ? bullish : bearish} - TrendBar2
        
    Сумма векторов ${sumVectors.toFixed(2)}
    
    TF      Сигнал  Значение  Вектор
    (01m)${macdValues['1']?.circle}${macdValues['1']?.arrow} ${macdValues['1']?.value?.toFixed(5)}   ${macdValues['1']?.vector?.toFixed(5)} ${macdValues['1']?.limit}${macdValues['1']?.cross}
    (03m)${macdValues['3']?.circle}${macdValues['3']?.arrow} ${macdValues['3']?.value?.toFixed(5)}   ${macdValues['3']?.vector?.toFixed(5)} ${macdValues['3']?.limit}${macdValues['3']?.cross}
    (05m)${macdValues['5']?.circle}${macdValues['5']?.arrow} ${macdValues['5']?.value?.toFixed(5)}   ${macdValues['5']?.vector?.toFixed(5)} ${macdValues['5']?.limit}${macdValues['5']?.cross}
    (15m)${macdValues['15']?.circle}${macdValues['15']?.arrow} ${macdValues['15']?.value?.toFixed(5)}   ${macdValues['15']?.vector?.toFixed(5)} ${macdValues['15']?.limit}${macdValues['15']?.cross}
    (30m)${macdValues['30']?.circle}${macdValues['30']?.arrow} ${macdValues['30']?.value?.toFixed(5)}   ${macdValues['30']?.vector?.toFixed(5)} ${macdValues['30']?.limit}${macdValues['30']?.cross}
    (01 h)${macdValues['60']?.circle}${macdValues['60']?.arrow} ${macdValues['60']?.value?.toFixed(5)}   ${macdValues['60']?.vector?.toFixed(5)} ${macdValues['60']?.limit}${macdValues['60']?.cross}
    (02 h)${macdValues['120']?.circle}${macdValues['120']?.arrow} ${macdValues['120']?.value?.toFixed(5)}   ${macdValues['120']?.vector?.toFixed(5)} ${macdValues['120']?.limit}${macdValues['120']?.cross}
    (04 h)${macdValues['240']?.circle}${macdValues['240']?.arrow} ${macdValues['240']?.value?.toFixed(5)}   ${macdValues['240']?.vector?.toFixed(5)} ${macdValues['240']?.limit}${macdValues['240']?.cross}
    (06 h)${macdValues['360']?.circle}${macdValues['360']?.arrow} ${macdValues['360']?.value?.toFixed(5)}   ${macdValues['360']?.vector?.toFixed(5)} ${macdValues['360']?.limit}${macdValues['360']?.cross}
    (12 h)${macdValues['720']?.circle}${macdValues['720']?.arrow} ${macdValues['720']?.value?.toFixed(5)}   ${macdValues['720']?.vector?.toFixed(5)} ${macdValues['720']?.limit}${macdValues['720']?.cross}
    (01 D)${macdValues['D']?.circle}${macdValues['D']?.arrow} ${macdValues['D']?.value?.toFixed(5)}   ${macdValues['D']?.vector?.toFixed(5)} ${macdValues['D']?.limit}${macdValues['D']?.cross}
    (01W)${macdValues['W']?.circle}${macdValues['W']?.arrow} ${macdValues['W']?.value?.toFixed(5)}   ${macdValues['W']?.vector?.toFixed(5)} ${macdValues['W']?.limit}${macdValues['W']?.cross}`;   
   
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
////  getFuturesSymbols - метод запроса символов с API Bybit которые удовлетворяют условию объема торгов за 24 часа turnover
////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async getFuturesSymbols(botInstance, chatId, settings, coin = '', isSignal = false) {
    const { TURNOVER, URL_TICKERS } = settings;

    if (coin) {
        const data = await this.calculateIndicators(coin, settings, true, isSignal);
                
        if (data) botInstance.sendMessage(chatId, data, {parse_mode: 'Markdown'});

    } else {

        try {
            const response = await axios.get(URL_TICKERS);
            if (response.data.retCode === 0) {

                const symbols = response.data.result.list.filter(symbol => parseFloat(symbol.turnover24h) >= TURNOVER);
            
                for (const symbol of symbols) {
                    
                    const data = await this.calculateIndicators(symbol.symbol, settings, false, isSignal);
                    
                    if (data) botInstance.sendMessage(chatId, data, {parse_mode: 'Markdown'});
                }

            } else {
                console.log('Error: ', response.data.ret_msg);
            }
        } catch (error) {
            console.error('Error fetching data from Bybit API:', error);
        }
    }
}    
    
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
////  fetchKlines - метод запроса данных свечей по символу и интервалу с API Bybit
////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async fetchKlines(symbol, interval, lookback, settings) {
    const {URL_KLINES} = settings;
    try {
        
        const response = await axios.get(URL_KLINES, {
            params: {
                symbol: symbol,
                category: 'linear',
                interval: interval,
                start: Date.now() - (lookback + 1) * 60000 * parseInt(interval),
                end: Date.now()     //- 60000 * parseInt(interval)
            }
        });
        
        return response.data.result.list.reverse(); // Разворачиваем массив, так как Bybit присылает его в обратном порядке

    } catch(e) {
        return false;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
////  getTickSize - метод запроса данных c API Bybit информации о размере тика на бирже для этого символа
////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async getTickSizeBybit(symbol, settings, category = "linear") {
    const { URL_INFO } = settings;

    const response = await fetch(`${URL_INFO}?category=${category}&symbol=${symbol}`);
    const data = await response.json();
    
    if (data.retCode === 0 && data.result?.list?.length > 0) {
        const tickSize = data.result.list[0].priceFilter.tickSize;
        return parseFloat(tickSize);
    } else {
        throw new Error("Symbol not found or API error");
    }
}

}

module.exports = new BotService();