import dotenv from "dotenv-safe";
import { z } from "zod";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({
    example: ".env",
    allowEmptyValues: false,
  });
}

const envSchema = z.object({
  API_ID: z.string().min(1).transform(Number),
  API_HASH: z.string().min(1),
  API_SESSION: z.string(),
  MAXIMUM_SUPPLY: z.string().transform(Number),
  MAXIMUM_PRICE: z.string().transform(Number),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
