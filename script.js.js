// Импорт необходимых модулей WebSocket и axios.
const WebSocket = require("ws");
const axios = require("axios");

// Определяются константы
const TELEGRAM_TOKEN = "YOIR_TOKEN";
const TELEGRAM_CHAT_ID = "@YOUR_ID";
const WS_URL = "wss://fstream.binance.com/stream?streams=!miniTicker@arr";

/*Переменная pairDataCache используется для кэширования данных о торговых парах, представленных объектами PairData.
Каждая пара данных содержит информацию о символе (торговой паре), объеме за 24 часа, цене и других характеристиках.
Кэширование позволяет хранить информацию о каждой торговой паре в течение выполнения программы и обновлять ее при получении новых данных.
Это упрощает доступ к данным и позволяет быстро и эффективно обрабатывать сообщения от WebSocket сервера.
*/
const pairDataCache = {};
/*
Переменная wsStartTime используется для отслеживания времени начала работы WebSocket соединения.
Это необходимо для контроля времени работы программы и выполнения определенных действий в зависимости от времени,
например, проверки изменений в открытом интересе в течение определенного периода времени после установки соединения.
В данном случае, это используется для проверки, прошло ли менее 15 минут с момента установки соединения, и выполнения соответствующих действий на основе этого условия.
*/
let wsStartTime;

/*
Создаётся Асинхронная функция websocketHandler, которая устанавливает соединение с WebSocket сервером,
добавляет обработчики событий open, message, close и error.
*/

async function websocketHandler() {
  const ws = new WebSocket(WS_URL);
  wsStartTime = new Date();

  ws.on("open", () => console.log("WebSocket connection is done♥"));
  ws.on("message", handleWebSocketMessage);
  ws.on("close", handleWebSocketClose);
  ws.on("error", handleWebSocketError);
}

/*
Объявляется функция handleWebSocketMessage, которая вызывается при получении сообщения от WebSocket сервера.
В этой функции данные обрабатываются, и вызывается функция checkAndSendMessage для обработки и отправки сообщения.  
*/

async function handleWebSocketMessage(response) {
  try {
    const data = JSON.parse(response).data;  
    for (const item of data) {
      const { s: symbol, q: volume_24h, c: price } = item;
      if (symbol.endsWith("USDT")) {           // Исключаем сигналы пар со стейблкоинами, кроме USDT.
        let pairData = pairDataCache[symbol];  // Получаем объект PairData из кеша pairDataCache по символу, если он уже существует
        if (!pairData) {                       
          pairData = new PairData(symbol);     
          pairDataCache[symbol] = pairData;
        }
        pairData.last_price = parseFloat(price);
        await checkAndSendMessage(  // Вызываем функцию checkAndSendMessage, передавая в нее объект PairData для данного символа, а также объем за 24 часа и цену в формате числа.
          pairData,
          symbol,
          parseFloat(volume_24h),
          parseFloat(price)
        );
      }
    }
  } catch (error) {
    console.error("Error processing WebSocket message:", error);
  }
}

/*
Объявляются функции handleWebSocketClose и handleWebSocketError,
которые вызываются при закрытии соединения или возникновении ошибки.
*/

function handleWebSocketClose() {
  console.log("WebSocket connection closed");
}

function handleWebSocketError(error) {
  console.error("WebSocket error:", error);
}

// Класс PairData, представляющий данные о торговой паре

class PairData {
  constructor(symbol) {
    this.symbol = symbol;
    this.volume_24h_start = null;
    this.volume_24h_start_time = null;
    this.price_start = null;
    this.last_price = null;
    this.signal_count = 0;
    this.open_interest_start = null;
    this.open_interest_start_time = null;
  }
}

/*
Вызывается функция checkAndSendMessage,
которая проверяет изменение открытого интереса и отправляет сообщение в телеграм, если условия выполнены
*/

async function checkAndSendMessage(pairData, symbol, openInterest, price) {
  if (!pairData.open_interest_start) {
    pairData.open_interest_start = openInterest;
    pairData.open_interest_start_time = new Date();
  }

  const timeDifference = new Date() - wsStartTime;
  if (timeDifference <= 15 * 60 * 1000) {
    const openInterestChangePercent =
      ((openInterest - pairData.open_interest_start) /
        pairData.open_interest_start) *
      100;
    if (openInterestChangePercent >= 5) {
      if (!pairData.price_start) {
        pairData.price_start = price;
      } else {
        const priceChangePercent =
          ((price - pairData.price_start) / pairData.price_start) * 100;
        pairData.signal_count += 1;

        const message = generateTelegramMessage(
          symbol,
          openInterestChangePercent,
          priceChangePercent,
          pairData.signal_count
        );
        await sendTelegramMessage(message);

        pairData.open_interest_start = openInterest;
        pairData.open_interest_start_time = new Date();
        pairData.price_start = price;
      }
    }
  }
}

// Определяется функция generateTelegramMessage, которая генерирует текст сообщения для отправки в телеграмм.

function generateTelegramMessage(
  symbol,
  openInterestChangePercent,
  priceChangePercent,
  signalCount
) {
  return (
    `🔸Binance ${symbol}\n` +
    `📈Рост открытого интереса: ${openInterestChangePercent.toFixed(2)}%\n` +
    `📊Изменение цены: ${priceChangePercent.toFixed(2)}%\n` +
    `🔘Сигнал за сутки: ${signalCount}`
  );
}

// Определяется функция sendTelegramMessage, которая отправляет сообщение в телеграм с использованием API.

async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(
    message
  )}`;
  await axios.get(url);
}

// Aсинхронная функция main, которая вызывает websocketHandler

async function main() {
  await websocketHandler();
}

main();     // main() для запуска основной логики программы.
