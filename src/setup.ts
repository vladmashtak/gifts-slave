import { existsSync } from "node:fs";
import { writeFile, unlink, rm } from "node:fs/promises";
import path from "node:path";
import { ask, validateApiId, validateNotEmpty } from "./helpers.js";
import { sessions, TelegramClient } from "teleproto";

type Answers = {
  API_ID: string;
  API_HASH: string;
  BOT_TOKEN: string;
  ADMIN_ID: string;
};

const ENV_PATH = path.resolve(process.cwd(), ".env");
const SESSION_PATH = path.resolve(process.cwd(), "session_folder");

async function main() {
  console.log("⚙️  Настройка окружения (.env)\n");

  if (existsSync(SESSION_PATH)) {
    console.log(`Удаляю существующую сессию: ${SESSION_PATH}`);
    await rm(SESSION_PATH, { recursive: true, force: true });
  }
  if (existsSync(ENV_PATH)) {
    console.log(`Удаляю существующий .env: ${ENV_PATH}`);
    await unlink(ENV_PATH);
  }

  const API_ID = await ask("Введите API_ID (число): ", validateApiId);
  const API_HASH = await ask("Введите API_HASH: ", validateNotEmpty("API_HASH"));
  const BOT_TOKEN = await ask("Введите BOT_TOKEN: ", validateNotEmpty("BOT_TOKEN"));
  const ADMIN_ID = await ask("Введите персональный TG ID: ", validateNotEmpty("ADMIN_ID"));

  const answers: Answers = { API_ID, API_HASH, BOT_TOKEN, ADMIN_ID };

  console.log("\nВы ввели:");
  console.log(`  API_ID    = ${answers.API_ID}`);
  console.log(`  API_HASH  = ${answers.API_HASH}`);
  console.log(`  BOT_TOKEN = ${answers.BOT_TOKEN}`);
  console.log(`  ADMIN_ID = ${answers.ADMIN_ID}`);

  const content = `API_ID=${answers.API_ID}\n` +
    `API_HASH=${answers.API_HASH}\n` +
    `BOT_TOKEN=${answers.BOT_TOKEN}\n` +
    `ADMIN_ID=${answers.ADMIN_ID}\n`;

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
    }
  });

  console.log(`✅ Готово! Можете продолжать.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Ошибка:", err);
  process.exit(1);
});
