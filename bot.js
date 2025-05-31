require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const domande = JSON.parse(fs.readFileSync('./domande.json', 'utf8'));

const quizStates = {};
const awaitingQuizLength = {};

const CLASSIFICA_FILE = './classifica.json';

function readClassifica() {
    try {
        const data = fs.readFileSync(CLASSIFICA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        console.error("Errore nella lettura del file classifica.json:", error);
        return [];
    }
}

function saveClassifica(classificaData) {
    try {
        fs.writeFileSync(CLASSIFICA_FILE, JSON.stringify(classificaData, null, 2), 'utf8');
    } catch (error) {
        console.error("Errore nel salvataggio del file classifica.json:", error);
    }
}


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = `Benvenuto nel Quiz Bot!
Ecco i comandi disponibili:
/quiz - Inizia un nuovo quiz
/classifica - Mostra la classifica globale dei migliori punteggi`;
    bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/quiz/, (msg) => {
    const chatId = msg.chat.id;
    awaitingQuizLength[chatId] = true;
    bot.sendMessage(chatId, "Quante domande vuoi nel quiz? (Inserisci un numero, es. 5 o 10)");
});

bot.onText(/\/classifica/, (msg) => {
    const chatId = msg.chat.id;
    const classifica = readClassifica();

    if (classifica.length === 0) {
        bot.sendMessage(chatId, "La classifica è attualmente vuota. Gioca almeno un quiz da 10 o più domande per apparire!");
        return;
    }


    const sortedClassifica = classifica.sort((a, b) => {
        if (b.percentage !== a.percentage) {
            return b.percentage - a.percentage;
        }
        if (b.totalQuestions !== a.totalQuestions) {
            return b.totalQuestions - a.totalQuestions;
        }
        return b.score - a.score;
    });

    let classificaText = "🏆 **Classifica Globale Quiz Bot** 🏆\n\n";
    sortedClassifica.slice(0, 10).forEach((entry, index) => { 
        const username = entry.username || `Utente ${entry.userId}`;
        classificaText += `${index + 1}. **${username}**: ${entry.percentage.toFixed(2)}% (${entry.score}/${entry.totalQuestions})\n`;
    });

    bot.sendMessage(chatId, classificaText, { parse_mode: 'Markdown' });
});


bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text && text.startsWith('/')) {
        return;
    }

    if (awaitingQuizLength[chatId]) {
        const requestedLength = parseInt(text, 10);

        if (!isNaN(requestedLength) && requestedLength > 0) {
            delete awaitingQuizLength[chatId];

            const quizLength = Math.min(requestedLength, domande.length);
            

            const shuffledDomande = [...domande].sort(() => 0.5 - Math.random());
            const selectedQuestions = shuffledDomande.slice(0, quizLength);


            quizStates[chatId] = {
                currentQuestionIndex: 0,
                score: 0,
                quizQuestions: selectedQuestions,
                requestedQuizLength: requestedLength, 
                username: msg.from.username || msg.from.first_name || `Utente ${chatId}`
            };

            bot.sendMessage(chatId, `Ok, il quiz sarà di ${quizLength} domande.`);
            sendQuestion(chatId);
        } else {
            bot.sendMessage(chatId, "Per favore, inserisci un numero valido e positivo.");
        }
    }
});


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
                inline_keyboard: options.map(opt => [opt])
            }
        };

        bot.sendMessage(chatId, question.domanda, keyboard);
    } else {
        const finalScore = state.score;
        const totalQuestions = currentQuizQuestions.length;
        const percentage = (finalScore / totalQuestions) * 100;

        bot.sendMessage(chatId, `Quiz terminato! Hai risposto correttamente a ${finalScore} domande su ${totalQuestions}.
La tua percentuale di risposte corrette è del ${percentage.toFixed(2)}%.
Per ricominciare, digita /quiz.`);

        if (totalQuestions >= 10) {
            const userId = chatId; 
            const username = state.username;

            const classifica = readClassifica();
            
            let userFound = false;
            for (let i = 0; i < classifica.length; i++) {
                if (classifica[i].userId === userId) {
                    if (percentage > classifica[i].percentage || 
                        (percentage === classifica[i].percentage && finalScore > classifica[i].score) ||
                        (percentage === classifica[i].percentage && finalScore === classifica[i].score && totalQuestions > classifica[i].totalQuestions)) {
                        classifica[i] = { userId, username, score: finalScore, totalQuestions, percentage: percentage };
                    }
                    userFound = true;
                    break;
                }
            }

            if (!userFound) {
                classifica.push({ userId, username, score: finalScore, totalQuestions, percentage: percentage });
            }
            
            saveClassifica(classifica);
            bot.sendMessage(chatId, "Complimenti! Il tuo risultato è stato salvato in classifica.");
        } else {
            bot.sendMessage(chatId, "Per apparire in classifica, devi completare un quiz di almeno 10 domande!");
        }

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