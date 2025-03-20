const BotService = require("./botService");

class BotController {

    constructor(defaultConfig) {
        this.defaultConfig = defaultConfig;
        this.intervals = new Map();
        this.chatSettings = new Map();
    }

    getSettings(chatId) {
        if (!this.chatSettings.has(chatId)) {
            this.chatSettings.set(chatId, { ...this.defaultConfig });
        }
        return this.chatSettings.get(chatId);
    }

    resetSettings(msg, bot) {
        const chatId = msg.chat.id;

        this.chatSettings.set(chatId, { ...this.defaultConfig });

        bot.sendMessage(chatId, "Настройки сброшены к значениям по умолчанию.");
    }

    setIntervalFetching(msg, match, bot) {
        const chatId = msg.chat.id;
        const settings = this.getSettings(chatId);

        if (match[1]) {
            const intervalFetching = parseInt(match[1], 10);
            if (isNaN(intervalFetching) || intervalFetching < 1) {
                bot.sendMessage(chatId, "Ошибка: введите корректное число (больше 1).");
                return;
            }

            settings.INTERVAL_FETCHING = intervalFetching;
            bot.sendMessage(chatId, `Интервал запросов установлен: ${intervalFetching} минут`);
        } else {
            bot.sendMessage(chatId, `Текущий интервал запросов: ${settings.INTERVAL_FETCHING} минут`);
        }
    }

    setVolumeMultiplier(msg, match, bot) {
        const chatId = msg.chat.id;
        const settings = this.getSettings(chatId);

        if (match[1]) {
            const volumeMultiplier = parseInt(match[1], 10);
            if (isNaN(volumeMultiplier) || volumeMultiplier <= 0) {
                bot.sendMessage(chatId, "Ошибка: введите корректное число (больше 0).");
                return;
            }

            settings.VOLUME_MULTIPLIER = volumeMultiplier;
            bot.sendMessage(chatId, `Мультипликатор объема установлен: ${volumeMultiplier}`);
        } else {
            bot.sendMessage(chatId, `Текущий мультипликатор объема: ${settings.VOLUME_MULTIPLIER}`);
        }
    }

    setTurnOver(msg, match, bot) {
        const chatId = msg.chat.id;
        const settings = this.getSettings(chatId);

        if (match[1]) {
            const turnover = parseInt(match[1], 10);
            if (isNaN(turnover) || turnover <= 0) {
                bot.sendMessage(chatId, "Ошибка: введите корректное число (больше 0).");
                return;
            }

            settings.TURNOVER = turnover;
            bot.sendMessage(chatId, `Фильтр по объему торгов установлен: ${turnover}$`);
        } else {
            bot.sendMessage(chatId, `Текущий фильтр по объему торгов: ${settings.TURNOVER}$`);
        }
    }

    setTimeframe(msg, match, bot) {
        const chatId = msg.chat.id;
        const settings = this.getSettings(chatId);

        if (match[1]) {
            const timeframe = parseInt(match[1], 10);
            if (isNaN(timeframe) || timeframe <= 0) {
                bot.sendMessage(chatId, "Ошибка: введите корректное число (больше 0).");
                return;
            }

            settings.TIMEFRAME = timeframe;
            bot.sendMessage(chatId, `Новый таймфрейм установлен: ${timeframe} минут`);
        } else {
            bot.sendMessage(chatId, `Текущий таймфрейм: ${settings.TIMEFRAME} минут`);
        }
    }

    startFetchingSymbols(msg, bot) {
        const chatId = msg.chat.id;
        const settings = this.getSettings(chatId);

        if (this.intervals.has(chatId)) {
            bot.sendMessage(chatId, "Уже запущено!");
            return;
        }

        bot.sendMessage(chatId, `Запускаю парсинг каждые ${settings.INTERVAL_FETCHING} минут`);

        const interval = setInterval(async () => {
            await BotService.getFuturesSymbols(bot, chatId, settings);
        }, settings.INTERVAL_FETCHING * 60000);

        this.intervals.set(chatId, interval);
    }

    
    async startFetchingFollowCoin(msg, match, bot) {
        const chatId = msg.chat.id;
        const coin = match[1]; // Получаем название монеты из команды
        const isSignal = match[2] === '+' ? true : false;
        const settings = this.getSettings(chatId);
    
        if (!coin) {
            bot.sendMessage(chatId, 'Пожалуйста, укажите тикер монеты. Пример: /f BTCUSDT');
            return;
        }
    
        // Если уже есть интервал - останавливаем его
        if (this.intervals.has(chatId)) {
            clearInterval(this.intervals.get(chatId)); // Останавливаем предыдущее отслеживание
            this.intervals.delete(chatId);
            bot.sendMessage(chatId, 'Предыдущее отслеживание остановлено.');
        }
    
        bot.sendMessage(chatId, `Запускаю отслеживание монеты ${coin} каждые ${settings.INTERVAL_FETCHING} минут`);
    
        const interval = setInterval(async () => {
            try {
                await BotService.getFuturesSymbols(bot, chatId, settings, coin, isSignal);
            } catch (error) {
                console.error(`Ошибка при парсинге монеты ${coin}:`, error);
                bot.sendMessage(chatId, `Произошла ошибка при парсинге ${coin}.`);
            }
        }, settings.INTERVAL_FETCHING * 60000);
    
        this.intervals.set(chatId, interval);
    }
        

    stopFetching(msg, bot) {
        const chatId = msg.chat.id;

        if (this.intervals.has(chatId)) {
            clearInterval(this.intervals.get(chatId));
            this.intervals.delete(chatId);
            bot.sendMessage(chatId, "Остановлено!");
        } else {
            bot.sendMessage(chatId, "Нечего останавливать!");
        }
    }

    infoBot(msg, bot) {
        const chatId = msg.chat.id;

        bot.sendMessage(chatId,
            `/s - запустить парсинг\n` +
            `/f - запустить слежение за конкретной монетой\n` +
            `/q - остановить парсинг\n` +
            `/h - получить помощь\n` +
            `/stf - получить или изменить таймфрейм\n` +
            `/stn - получить или изменить минимальный объем $ по монетам\n` +
            `/svm - получить или изменить мультипликатор объема\n` +
            `/sfi - получить или изменить интервал запросов к API\n` +
            `/r - сбросить настройки к значениям по умолчанию`
        );
    }
}

module.exports = BotController;
