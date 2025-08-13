import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

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
