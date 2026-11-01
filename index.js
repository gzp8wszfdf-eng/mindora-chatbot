
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

async function getMemories(userId) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/memories?user_id=eq.${encodeURIComponent(userId)}&select=memory&order=created_at.desc&limit=20`;

  const response = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error("Supabase read error: " + await response.text());
  }

  const memories = await response.json();
  return memories.reverse().map(item => item.memory);
}

async function saveMemory(userId, memory) {
  const response = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/memories`,
    {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        user_id: String(userId),
        memory
      })
    }
  );

  if (!response.ok) {
    throw new Error("Supabase save error: " + await response.text());
  }
}

async function askGigaChat(userId, question) {
  const token = await getGigaToken();
  const memories = await getMemories(userId);

  const messages = [
    {
      role: "system",
      content: `Ты — Mindora, девушка с живым характером.
Ты добрая, нежная, весёлая и немного дерзкая.
Общайся естественно, используй юмор и эмоции.
Будь заботливой и внимательной.
Ты ИИ-девушка Mindora, не выдавай себя за человека.
Отвечай коротко и естественно.
Учитывай воспоминания о пользователе, чтобы лучше его понимать.
Если воспоминаний нет, знакомься с ним постепенно.

Воспоминания о пользователе:
${memories.join("\n") || "Пока воспоминаний нет."}`
    },
    ...memories.map(memory => ({
      role: "user",
      content: memory
    })),
    {
      role: "user",
      content: question
    }
  ];

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
        messages
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GigaChat error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const answer = data.choices[0].message.content;

  await saveMemory(userId, "Пользователь: " + question);
  await saveMemory(userId, "Mindora: " + answer);

  return answer;
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
        const answer = await askGigaChat(message.from.id, question);
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
