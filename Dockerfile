# Используем официальный Node.js образ (желательно LTS-версию)
FROM node:20-alpine

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install --production

# Копируем остальной исходный код в контейнер
COPY . .

# Если у тебя есть переменные окружения, можно использовать dotenv или передать через docker-compose

# Команда запуска твоего бота
CMD ["node", "telegramBot.js"]