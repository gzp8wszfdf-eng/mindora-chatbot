export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Mindora is running!");
    }

    try {
      const update = await request.json();
      const message = update.message;

      if (!message?.text || !message.chat?.id) {
        return new Response("OK");
      }

      const chatId = message.chat.id;
      const question = message.text;

      if (question === "/start") {
        await sendTelegram(
          env.TELEGRAM_BOT_TOKEN,
          chatId,
          "Привет! Я Mindora — твой ИИ-помощник 🤖 Чем могу помочь?"
        );
        return new Response("OK");
      }

      const authResponse = await fetch(
        "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${env.GIGACHAT_AUTH_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
            RqUID: crypto.randomUUID()
          },
          body: "scope=GIGACHAT_API_PERS"
        }
      );

      if (!authResponse.ok) {
        throw new Error("Ошибка авторизации GigaChat");
      }

      const auth = await authResponse.json();

      const aiResponse = await fetch(
        "https://gigachat.devices.sberbank.ru/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${auth.access_token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "GigaChat",
            messages: [
              {
                role: "system",
                content: "Ты Mindora — дружелюбный, умный ИИ-помощник. Отвечай понятно, полезно и на русском языке."
              },
              {
                role: "user",
                content: question
              }
            ],
            temperature: 0.7,
            max_tokens: 1500
          })
        }
      );

      if (!aiResponse.ok) {
        throw new Error("Ошибка ответа GigaChat");
      }

      const result = await aiResponse.json();
      const answer =
        result.choices?.[0]?.message?.content ||
        "Не получилось сформировать ответ. Попробуй ещё раз.";

      await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, answer);

    } catch (error) {
      return new Response("Ошибка: " + error.message, { status: 200 });
    }

    return new Response("OK");
  }
};

async function sendTelegram(token, chatId, text) {
  const parts = text.match(/[\s\S]{1,4000}/g) || ["Пустой ответ"];

  for (const part of parts) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: part
      })
    });
  }
}
