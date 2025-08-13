import { Api, sessions, TelegramClient } from "teleproto";
import delay from "delay";
import BigInteger from "big-integer";
import { Telegraf } from "telegraf";

import { env } from "./env.js";
import { ask } from "./helpers.js";

import GetPaymentForm = Api.payments.GetPaymentForm;
import SendStarsForm = Api.payments.SendStarsForm;
import Channel = Api.Channel;
import InputPeerSelf = Api.InputPeerSelf;
import GetStarGifts = Api.payments.GetStarGifts;

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

await telegraf.telegram.setMyCommands([
  {
    command: "stopbuys",
    description: "Остановить бота",
  },
  {
    command: "startbuys",
    description: "Запустить бота",
  },
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

telegraf.launch();

let cycleCount = 1;

while (true) {
  cycleCount++;
  if (isBotStopped) {
    await delay(1000);
  } else {
    try {
      if (!lastMessageId) {
        const message = await telegraf.telegram.sendMessage(
          me.id.toString(),
          `Бот исправен, последнее обновление: ${new Date().toLocaleString()}(UTC+0)`,
        );
        lastMessageId = message.message_id;
      } else if (cycleCount % 50 === 0) {
        await telegraf.telegram.editMessageText(
          me.id.toString(),
          lastMessageId,
          undefined,
          `Бот исправен, последнее обновление: ${new Date().toLocaleString()}(UTC+0)`,
        );
      }
    } catch (err) {
      console.log("Ошибка отправки сообщения в тг бота", err);
    }

    const starGifts = (await client.invoke(new GetStarGifts({ hash: 0 }))) as Api.payments.StarGifts;

    const gifts = starGifts.gifts.filter((gift) => gift.className === "StarGift");
    const limitedGifts = gifts.filter((gift) => gift.limited);
    const availableLimitedGifts = limitedGifts.filter((gift) => !gift.soldOut);

    const starsStatus = await client.invoke(new Api.payments.GetStarsStatus({ peer: new InputPeerSelf() }));
    const balance = starsStatus.balance.amount.toJSNumber();

    if (availableLimitedGifts.length === 0) {
      await delay(1000);
      continue;
    }

    const giftsSortedBySupply = availableLimitedGifts.sort((a, b) => a.availabilityTotal! - b.availabilityTotal!);

    const giftToBuy = giftsSortedBySupply.find((gift) => {
      const giftPrice = gift.stars.toJSNumber();
      if (balance < giftPrice) {
        return false;
      }
      if (gift.limitedPerUser) {
        return !!gift.perUserRemains;
      }
      return true;
    });

    if (!giftToBuy) {
      continue;
    }

    try {
      let giftsToSend = giftToBuy.availabilityTotal! <= 30000 ? 2 : 5;
      const updates = (await client.invoke(
        new Api.channels.CreateChannel({
          title: `@giftsatellite autobuy`,
          about: `Supply = ${giftToBuy.availabilityTotal}`,
        }),
      )) as Api.Updates;

      const channel = updates.chats[0] as Channel;

      await telegraf.telegram.sendMessage(
        myId,
        `Создан канал, отгружаем на него ${giftsToSend} подарков с id ${giftToBuy.id}.`,
      );

      while (giftsToSend > 0) {
        const invoice = new Api.InputInvoiceStarGift({
          peer: new Api.InputPeerChannel({
            channelId: channel.id,
            accessHash: channel.accessHash!,
          }),
          giftId: BigInteger(giftToBuy.id),
          hideName: true,
        });

        const paymentForm = await client.invoke(new GetPaymentForm({ invoice }));
        await client.invoke(new SendStarsForm({ invoice, formId: paymentForm.formId }));
        giftsToSend--;
      }
    } catch (error) {
      lastMessageId = null;
      await telegraf.telegram.sendMessage(myId, `Ошибка в slave-боте!`);
      await delay(1500);
    }
  }
}
