import { existsSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { ask, validateApiId, validateNotEmpty } from "./helpers.js";
import { sessions, TelegramClient } from "teleproto";

type Answers = {
  API_ID: string;
  API_HASH: string;
  BOT_TOKEN: string;
};

const ENV_PATH = path.resolve(process.cwd(), ".env");

async function main() {
  console.log("⚙️  Настройка окружения (.env)\n");

  if (existsSync(ENV_PATH)) {
    console.log(`Удаляю существующий .env: ${ENV_PATH}`);
    await unlink(ENV_PATH);
  }

  const API_ID = await ask("Введите API_ID (число): ", validateApiId);
  const API_HASH = await ask("Введите API_HASH: ", validateNotEmpty("API_HASH"));
  const BOT_TOKEN = await ask("Введите BOT_TOKEN: ", validateNotEmpty("BOT_TOKEN"));

  const answers: Answers = { API_ID, API_HASH, BOT_TOKEN };

  console.log("\nВы ввели:");
  console.log(`  API_ID    = ${answers.API_ID}`);
  console.log(`  API_HASH  = ${answers.API_HASH}`);
  console.log(`  BOT_TOKEN = ${answers.BOT_TOKEN}`);

  const content = `API_ID=${answers.API_ID}\n` + `API_HASH=${answers.API_HASH}\n` + `BOT_TOKEN=${answers.BOT_TOKEN}\n`;

  await writeFile(ENV_PATH, content, "utf8");
  console.log(`\n✅ Готово! Создан новый .env, переходим к созданию сессии`);

  const storeSession = new sessions.StoreSession("session_folder");
  const client = new TelegramClient(storeSession, Number(API_ID), API_HASH, { connectionRetries: 5 });

  await client.start({
    phoneNumber: async () => ask("Введите номер телефона:"),
    password: async () => ask("Введите пароль:"),
    phoneCode: async () => ask("Введите код телеграмм:"),
    onError: (err) => {
      console.error("Telegram error:", err);
      process.exit(0);
    },
  });

  console.log(`✅ Готово! Можете продолжать.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Ошибка:", err);
  process.exit(1);
});
