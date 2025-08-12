import dotenv from "dotenv-safe";
import { z } from "zod";

dotenv.config({ allowEmptyValues: true });

const envSchema = z.object({
  API_ID: z.string().min(1).transform(Number),
  API_HASH: z.string().min(1),
  BOT_TOKEN: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
