import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { Config } from "./config.js";

export async function ask(question: string, validate?: (v: string) => string | null) {
  const rl = createInterface({ input, output });
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const answer = (await rl.question(question)).trim();
      const error = validate?.(answer) ?? null;
      if (!error) return answer;
      console.log(`✖ ${error}\n`);
    }
  } finally {
    await rl.close();
  }
}

export function validateNotEmpty(name: string) {
  return (v: string) => (v ? null : `${name} не может быть пустым`);
}

export function validateApiId(v: string) {
  if (!v) return "API_ID не может быть пустым";
  if (!/^\d+$/.test(v)) return "API_ID должен быть числом";
  return null;
}

export function formatConfig(config: Config) {
  return `
Минимальный supply: ${config.minSupply}
Максимальный supply: ${config.maxSupply}
Приоритет: ${config.sort === "supply_asc" ? "По возрастанию supply" : "По убыванию supply"}

Получатели:
${config.peers
  .map((peer) => {
    const receiver =
      peer.peerType === "self"
        ? "Профиль ->"
        : peer.peerType === "channel"
          ? `Канал ${peer.id} ->`
          : `Пользователь ${peer.username} -> `;
    return `${receiver}${peer.maxGifts} Подарков, ${peer.maxCollections} Коллекций`;
  })
  .join("\n")}
`;
}
