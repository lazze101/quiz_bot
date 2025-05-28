require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const domande = JSON.parse(fs.readFileSync('./domande.json', 'utf8'));


const quizStates = {};
const awaitingQuizLength = {};



bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `Benvenuto nel Quiz Bot!
Per iniziare un nuovo quiz, digita /quiz.`);
});

bot.onText(/\/quiz/, (msg) => {
    const chatId = msg.chat.id;
    awaitingQuizLength[chatId] = true;
    bot.sendMessage(chatId, "Quante domande vuoi nel quiz? (Inserisci un numero, es. 5 o 10)");
});


bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (awaitingQuizLength[chatId]) {
        const requestedLength = parseInt(text, 10); 

        if (!isNaN(requestedLength) && requestedLength > 0) {
            delete awaitingQuizLength[chatId]; 

            const quizLength = Math.min(requestedLength, domande.length);

            quizStates[chatId] = {
                currentQuestionIndex: 0,
                score: 0,
                quizQuestions: getRandomQuestions(quizLength) 
            };

            bot.sendMessage(chatId, `Ok, il quiz sarà di ${quizLength} domande.`);
            sendQuestion(chatId); 
        } else {
            bot.sendMessage(chatId, "Per favore, inserisci un numero valido e positivo.");
        }
    }
});



function getRandomQuestions(numQuestions) {
    const shuffled = [...domande].sort(() => 0.5 - Math.random()); 
    return shuffled.slice(0, numQuestions); 
}

function sendQuestion(chatId) {
    const state = quizStates[chatId];
    if (!state || !state.quizQuestions) { 
        bot.sendMessage(chatId, "Per favore, inizia il quiz con /quiz.");
        return;
    }

    const currentQuestionIndex = state.currentQuestionIndex;
    const currentQuizQuestions = state.quizQuestions; 

    if (currentQuestionIndex < currentQuizQuestions.length) {
        const question = currentQuizQuestions[currentQuestionIndex]; 

        const options = question.opzioni.map(option => ({
            text: option,
            callback_data: option
        }));

        const keyboard = {
            reply_markup: {
                inline_keyboard: [options]
            }
        };

        bot.sendMessage(chatId, question.domanda, keyboard);
    } else {
        bot.sendMessage(chatId, `Quiz terminato! Hai risposto correttamente a ${state.score} domande su ${currentQuizQuestions.length}.
Per ricominciare, digita /quiz.`);
        delete quizStates[chatId];
    }
}

bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userAnswer = callbackQuery.data;

    const state = quizStates[chatId];

    if (!state || !state.quizQuestions) {
        bot.sendMessage(chatId, "Sembra che il quiz non sia attivo. Inizia con /quiz.");
        return;
    }

    const currentQuestion = state.quizQuestions[state.currentQuestionIndex];

    if (currentQuestion.rispostaCorretta === userAnswer) {
        state.score++;
        bot.answerCallbackQuery(callbackQuery.id, { text: "Corretto! ✅" });
        bot.editMessageText(`Domanda: ${currentQuestion.domanda}\n\nLa tua risposta: ${userAnswer} (Corretta!)`, {
            chat_id: chatId,
            message_id: msg.message_id,
            reply_markup: { inline_keyboard: [] }
        });
    } else {
        bot.answerCallbackQuery(callbackQuery.id, { text: `Sbagliato. La risposta corretta era: ${currentQuestion.rispostaCorretta} ❌` });
        bot.editMessageText(`Domanda: ${currentQuestion.domanda}\n\nLa tua risposta: ${userAnswer} (Sbagliata!)
La risposta corretta era: ${currentQuestion.rispostaCorretta}`, {
            chat_id: chatId,
            message_id: msg.message_id,
            reply_markup: { inline_keyboard: [] }
        });
    }

    setTimeout(() => {
        state.currentQuestionIndex++;
        sendQuestion(chatId);
    }, 1500);
});

bot.on('polling_error', (err) => console.error("Errore di polling:", err));