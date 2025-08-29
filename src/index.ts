import { Api, sessions, TelegramClient } from "teleproto";
import delay from "delay";
import BigInteger from "big-integer";
import { Markup, Telegraf } from "telegraf";

import { env } from "./env.js";
import { ask, formatConfig } from "./helpers.js";
import { loadConfig, saveConfig } from "./config.js";

import GetPaymentForm = Api.payments.GetPaymentForm;
import SendStarsForm = Api.payments.SendStarsForm;
import InputPeerSelf = Api.InputPeerSelf;
import GetStarGifts = Api.payments.GetStarGifts;
import InputPeerChannel = Api.InputPeerChannel;
import { message } from "telegraf/filters";
import CreateChannel = Api.channels.CreateChannel;
import Channel = Api.Channel;
import InputPeerUser = Api.InputPeerUser;
import TextWithEntities = Api.TextWithEntities;

const storeSession = new sessions.StoreSession("session_folder");
const client = new TelegramClient(storeSession, Number(env.API_ID), env.API_HASH, {
  connectionRetries: 5,
});

await client.start({
  phoneNumber: async () => ask("Введите номер телефона:"),
  password: async () => ask("Введите пароль:"),
  phoneCode: async () => ask("Введите код телеграмм:"),
  onError: (err) => {
    console.error("Telegram error:", err);
    process.exit(0);
  },
});

const telegraf = new Telegraf(env.BOT_TOKEN);

const me = await client.getMe();
const myId = me.id.toString();
let lastMessageId: null | number = null;
let isBotStopped = false;

const config = await loadConfig();

async function updateStatus() {
  try {
    if (!lastMessageId) {
      const message = await telegraf.telegram.sendMessage(
        myId,
        `Бот исправен, последнее обновление: ${new Date().toLocaleString()}(UTC+0)\n${formatConfig(config)}`,
      );
      lastMessageId = message.message_id;
    } else {
      await telegraf.telegram.editMessageText(
        myId,
        lastMessageId,
        undefined,
        `Бот исправен, последнее обновление: ${new Date().toLocaleString()}(UTC+0)\n${formatConfig(config)}`,
      );
    }
  } catch (err) {
    console.log("Ошибка отправки сообщения в тг бота", err);
  }
}

await telegraf.telegram.setMyCommands([
  {
    command: "stopbuys",
    description: "Остановить бота",
  },
  {
    command: "startbuys",
    description: "Запустить бота",
  },
  {
    command: "addpeer",
    description: "Добавить получателя",
  },
  { command: "deletepeer", description: "Удалить последнего получателя" },
]);

telegraf.command("stopbuys", (ctx) => {
  isBotStopped = true;
  lastMessageId = null;
  ctx.reply("бот остановлен");
});

telegraf.command("startbuys", (ctx) => {
  isBotStopped = false;
  ctx.reply("бот запущен");
});

telegraf.command("deletepeer", async (ctx) => {
  config.peers = config.peers.slice(0, -1);
  await saveConfig(config);
  await updateStatus();
});

type Step = "choose_target" | "wait_username" | "wait_gift_count" | "wait_collection_count";

interface UserState {
  step: Step;
  target?: "self" | "channel" | "user";
  username?: string;
  gifts?: number;
}

const userStates = new Map<number, UserState>();

telegraf.command("addpeer", async (ctx) => {
  const userId = ctx.from.id;
  userStates.set(userId, { step: "choose_target" });

  await ctx.reply(
    "Кто должен получить подарки?",
    Markup.inlineKeyboard([
      [Markup.button.callback("Профиль", "peer_self")],
      [Markup.button.callback("Канал", "peer_channel")],
      [Markup.button.callback("Другой пользователь", "peer_user")],
    ]),
  );
});

// ================== CALLBACKS ==================
telegraf.action("peer_self", async (ctx) => {
  const userId = ctx.from.id;
  userStates.set(userId, { step: "wait_gift_count", target: "self" });
  await ctx.answerCbQuery();
  await ctx.reply("Сколько подарков нужно отправить?");
});

telegraf.action("peer_channel", async (ctx) => {
  const userId = ctx.from.id;
  userStates.set(userId, { step: "wait_gift_count", target: "channel" });
  await ctx.answerCbQuery();
  await ctx.reply("Сколько подарков нужно отправить?");
});

telegraf.action("peer_user", async (ctx) => {
  const userId = ctx.from.id;
  userStates.set(userId, { step: "wait_username", target: "user" });
  await ctx.answerCbQuery();
  await ctx.reply("Введите username пользователя (с @):");
});

telegraf.on(message("text"), async (ctx) => {
  const userId = ctx.from.id;
  const state = userStates.get(userId);
  if (!state) return;

  if (state.step === "wait_username") {
    const username = ctx.message.text.trim();
    if (!username.startsWith("@")) {
      await ctx.reply("❌ Username должен начинаться с @. Попробуйте снова:");
      return;
    }
    state.username = username;
    state.step = "wait_gift_count";
    userStates.set(userId, state);
    await ctx.reply(`Ок, пользователь: ${username}. Теперь введите количество подарков:`);
    return;
  }

  if (state.step === "wait_gift_count") {
    const count = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(count) || count <= 0) {
      await ctx.reply("❌ Введите корректное число больше 0:");
      return;
    }
    state.gifts = count;
    state.step = "wait_collection_count";
    userStates.set(userId, state);
    await ctx.reply("Теперь введите количество коллекций подарков:");
    return;
  }

  if (state.step === "wait_collection_count") {
    const collections = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(collections) || collections <= 0) {
      await ctx.reply("❌ Введите корректное число больше 0:");
      return;
    }

    if (state.target === "self") {
      config.peers.push({ peerType: "self", maxGifts: state.gifts!, maxCollections: collections });
      await ctx.reply(`✅ Отправим ${state.gifts} подарков себе (${collections} коллекций)!`);
    } else if (state.target === "channel") {
      const updates = await client.invoke(
        new CreateChannel({ title: `${state.gifts} Подарков, ${collections} Коллекций`, about: "@giftsatellite" }),
      );
      const channel = (updates as Api.Updates).chats[0] as Channel;
      config.peers.push({
        peerType: "channel",
        maxGifts: state.gifts!,
        maxCollections: collections,
        id: channel.id.toJSNumber(),
      });
      await ctx.reply(`✅ Отправим ${state.gifts} подарков каналу (${collections} коллекций)!`);
    } else if (state.target === "user") {
      config.peers.push({
        peerType: "user",
        username: state.username!,
        maxCollections: collections,
        maxGifts: state.gifts!,
      });
      await ctx.reply(`✅ Отправим ${state.gifts} подарков пользователю ${state.username} (${collections} коллекций)!`);
    }
    await saveConfig(config);
    lastMessageId = null;
    await updateStatus();

    userStates.delete(userId);
  }
});

telegraf.launch();

let cycleCount = 1;

while (true) {
  cycleCount++;
  if (isBotStopped) {
    await delay(1000);
  } else {
    if (!lastMessageId || cycleCount % 50 === 0) {
      await updateStatus();
    }
    const starGifts = (await client.invoke(new GetStarGifts({ hash: 0 }))) as Api.payments.StarGifts;

    const gifts = starGifts.gifts.filter((gift) => gift.className === "StarGift");
    const limitedGifts = gifts.filter((gift) => !gift.limited);
    const availableLimitedGifts = limitedGifts.filter((gift) => !gift.soldOut);

    const starsStatus = await client.invoke(new Api.payments.GetStarsStatus({ peer: new InputPeerSelf() }));
    let balance = starsStatus.balance.amount.toJSNumber();

    if (availableLimitedGifts.length === 0) {
      await delay(1000);
      continue;
    }

    const matchingGifts = availableLimitedGifts.filter((gift) => {
      const giftSupply = gift.availabilityTotal!;
      if (gift.stars.toJSNumber() > balance) {
        return false;
      }
      if (giftSupply > config.maxSupply) {
        return false;
      }
      if (giftSupply < config.minSupply) {
        return false;
      }
      return true;
    });

    const giftsSortedBySupply = matchingGifts.sort((a, b) => {
      if (config.sort === "supply_asc") {
        return a.availabilityTotal! - b.availabilityTotal!;
      }
      return b.availabilityTotal! - a.availabilityTotal!;
    });

    const peerConfig = config.peers[0];
    if (!peerConfig) {
      continue;
    }

    const giftToBuy = giftsSortedBySupply.find((gift) => {
      if (gift.limitedPerUser) {
        return !!gift.perUserRemains;
      }
      return true;
    });

    if (!giftToBuy) {
      continue;
    }

    const peer = await (async () => {
      if (peerConfig.peerType === "channel" && peerConfig.id) {
        try {
          const entity = await client.getEntity(`-100${peerConfig.id}`);
          if (entity.className === "Channel") {
            return new InputPeerChannel({ channelId: entity.id, accessHash: entity.accessHash! });
          } else {
            throw new Error("Канал не найден");
          }
        } catch (err) {
          return null;
        }
      }
      if (peerConfig.peerType === "user" && peerConfig.username) {
        try {
          const entity = await client.getEntity(peerConfig.username!);
          if (entity.className === "User") {
            return new InputPeerUser({ userId: entity.id, accessHash: entity.accessHash! });
          } else {
            throw new Error("Юзер не найден");
          }
        } catch (err) {
          return null;
        }
      }
      if (peerConfig.peerType === "self") {
        return new InputPeerSelf();
      }
    })();

    config.peers = config.peers.slice(1);
    await saveConfig(config);

    if (!peer) {
      continue;
    }

    if (giftToBuy.limitedPerUser) {
      peerConfig.maxGifts = giftToBuy.availabilityRemains!;
    }
    await telegraf.telegram.sendMessage(myId, `Отправляем ${peerConfig.maxGifts} подарков на ${peerConfig.peerType}`);

    while (peerConfig.maxGifts > 0) {
      try {
        const invoice = new Api.InputInvoiceStarGift({
          peer: peer,
          giftId: BigInteger(giftToBuy.id),
          hideName: false,
          message: new TextWithEntities({ text: "@giftsatellite", entities: [] }),
        });

        const paymentForm = await client.invoke(new GetPaymentForm({ invoice }));
        await client.invoke(new SendStarsForm({ invoice, formId: paymentForm.formId }));
        peerConfig.maxGifts -= 1;
      } catch (error) {
        peerConfig.maxGifts = 0;
      }
    }
    await saveConfig(config);
  }
}
