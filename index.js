
const http = require("http");
const { randomUUID } = require("crypto");

const PORT = process.env.PORT || 3000;

async function getGigaToken() {
  const response = await fetch(
    "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${process.env.GIGACHAT_AUTH_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        RqUID: randomUUID()
      },
      body: "scope=GIGACHAT_API_PERS"
    }
  );

  if (!response.ok) {
    throw new Error("GigaChat auth error: " + response.status);
  }

  const data = await response.json();
  return data.access_token;
}

async function askGigaChat(question) {
  const token = await getGigaToken();

  const response = await fetch(
    "https://api.giga.chat/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "GigaChat-2",
        messages: [
          {
            role: "system",
            content: "Ты Mindora — дружелюбный, умный и полезный ИИ-помощник. Отвечай понятно и доброжелательно."
          },
          {
            role: "user",
            content: question
          }
        ]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
throw new Error(`GigaChat error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function sendTelegram(chatId, message) {
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message.slice(0, 4000)
      })
    }
  );

  if (!response.ok) {
    throw new Error("Telegram send error: " + response.status);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200);
    res.end("Mindora is running!");
    return;
  }

  const secretPath = process.env.WEBHOOK_SECRET_PATH;

  if (
    req.method !== "POST" ||
    !secretPath ||
    req.url !== `/telegram/${secretPath}`
  ) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  let body = "";

  req.on("data", chunk => {
    body += chunk;

    if (body.length > 1000000) {
      req.destroy();
    }
  });

  req.on("end", async () => {
    try {
      const update = JSON.parse(body);
      const message = update.message;

      if (!message?.text || !message.chat?.id) {
        res.writeHead(200);
        res.end("OK");
        return;
      }

      const chatId = message.chat.id;
      const question = message.text.trim();

      if (question === "/start") {
        await sendTelegram(
          chatId,
          "Привет! Я Mindora ❤️ Твой ИИ-помощник. Напиши мне что-нибудь!"
        );
      } else {
        const answer = await askGigaChat(question);
        await sendTelegram(chatId, answer);
      }

      res.writeHead(200);
      res.end("OK");
    } catch (error) {
      console.error(error);
      res.writeHead(200);
      res.end("OK");
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Mindora started on port " + PORT);
});
