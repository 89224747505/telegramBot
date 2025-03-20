const TelegramBot = require('node-telegram-bot-api');
const BotController = require('./botController');

// Конфиг с дефолтными параметрами
const DEFAULT_CONFIG = {
    URL_TICKERS: 'https://api.bybit.com/v5/market/tickers?category=linear',
    URL_KLINES: 'https://api.bybit.com/v5/market/kline',
    URL_INFO: 'https://api.bybit.com/v5/market/instruments-info',
    TIMEFRAME: '1',
    LENGTH_BREAKOUT: 30,
    INTERVAL_FETCHING: 1,
    VOLUME_MULTIPLIER: 1,
    TURNOVER: 20000000,
    AVERAGE_CANDLES_PERIOD: 16,
    EMA_FAST_PERIOD: 28,
    EMA_SLOW_PERIOD: 100,
    TIMEFRAMES: ['1', '3', '5', '15', '30', '60', '120', '240', '360', '720', 'D', 'W']
};

const token = `7913661191:AAGDMEMNsRCjOBS9nG2uPU7YzKBBYGJbQgQ`;
const bot = new TelegramBot(token, { polling: true });

const botController = new BotController(DEFAULT_CONFIG); // Передаем настройки

//////Обработка событий бота////////////////

bot.onText(/\/h\b/, (msg) => botController.infoBot(msg, bot));

bot.onText(/\/s\b/, (msg) => botController.startFetchingSymbols(msg, bot));

bot.onText(/\/q\b/, (msg) => botController.stopFetching(msg, bot));

bot.onText(/\/r\b/, (msg) => botController.resetSettings(msg, bot));

bot.onText(/\/f\s+([A-Z0-9]+)\s*([+-])/, (msg, match) => botController.startFetchingFollowCoin(msg, match, bot));

bot.onText(/\/svm(?:\s+(\d+))?\b/, (msg, match) => botController.setVolumeMultiplier(msg, match, bot));

bot.onText(/\/stf(?:\s+(\d+))?\b/, (msg, match) => botController.setTimeframe(msg, match, bot));

bot.onText(/\/stn(?:\s+(\d+))?\b/, (msg, match) => botController.setTurnOver(msg, match, bot));

bot.onText(/\/sfi(?:\s+(\d+))?\b/, (msg, match) => botController.setIntervalFetching(msg, match, bot));

console.log("Бот запущен...");