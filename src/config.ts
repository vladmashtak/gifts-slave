import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

const configPath = path.resolve(process.cwd(), "config.json");

export interface Config {
  peers: {
    peerType: "self" | "channel" | "user";
    id?: number;
    username?: string;
    maxGifts: number;
    maxCollections: number;
  }[];
  sort: "supply_asc" | "supply_desc";
  minSupply: number;
  maxSupply: number;
}

export async function loadConfig() {
  try {
    const buffer = await readFile(configPath);
    const json = buffer.toString("utf8");
    return JSON.parse(json) as Config;
  } catch (error) {
    return {
      peers: [
        {
          peerType: "self",
          maxGifts: 1000000,
          maxCollections: 10,
        },
      ],
      sort: "supply_asc",
      minSupply: 0,
      maxSupply: 1000000,
    } as Config;
  }
}

export async function saveConfig(config: Config) {
  await writeFile(configPath, JSON.stringify(config), "utf8");
}
