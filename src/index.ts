// @ts-ignore
import input from "input";
import { Api, sessions, TelegramClient } from "telegram-gifts";
import delay from "delay";
import BigInteger from "big-integer";
import { Telegraf } from "telegraf";

import { env } from "./env.js";

import GetPaymentForm = Api.payments.GetPaymentForm;
import SendStarsForm = Api.payments.SendStarsForm;
import Channel = Api.Channel;

interface NewGift {
  id: string;
  supply: number;
  price: number;
}

interface Status {
  new_gifts: NewGift[];
  status: string;
  error: null | string;
  lastUpdate: number;
}

const stringSession = new sessions.StringSession(env.API_SESSION);
const client = new TelegramClient(stringSession, Number(env.API_ID), env.API_HASH, {
  connectionRetries: 5,
});

const telegraf = new Telegraf(env.BOT_TOKEN);

telegraf.launch();

await client
  .start({
    phoneNumber: async () => input.text("Номер телефона:"),
    password: async () => input.text("TFA Password:"),
    phoneCode: async () => input.text("Код телеграмм:"),
    onError: (err) => {
      console.error("Telegram error:", err);
      process.exit(0);
    },
  })
  .then(() => {
    if (!env.API_SESSION) {
      console.log(client.session.save());
    }
  });

let i = 1;
let k = 0;
const me = await client.getMe();
const myId = me.id.toString();
let lastMessageId: null | number = null;

while (true) {
  try {
    const response = await fetch("http://38.180.240.96:3001/status");
    const json = (await response.json()) as Status;
    if (json.status !== "ok") {
      await telegraf.telegram.sendMessage(
        myId,
        `!Ошибка в рут-боте!
${json.error}`,
      );
    } else {
      a;
      if (!lastMessageId) {
        const message = await telegraf.telegram.sendMessage(
          me.id.toString(),
          `Бот исправен, последнее обновление: ${new Date().toLocaleString()}`,
        );
        lastMessageId = message.message_id;
      } else if (k % 100 === 0) {
        await telegraf.telegram.editMessageText(
          me.id.toString(),
          lastMessageId,
          undefined,
          `Бот исправен, последнее обновление: ${new Date().toLocaleString()}`,
        );
      }
      k++;
    }

    if (json.new_gifts.length) {
      await telegraf.telegram.sendMessage(
        myId,
        `Появились новые подарки:
${json.new_gifts.map((x) => `Id: ${x.id}, Supply: ${x.supply}, Price: ${x.price}\n`)}
`,
      );

      const giftsSortedBySupply = json.new_gifts.sort((a, b) => a.supply - b.supply);

      const giftToBuy = giftsSortedBySupply.find((gift) => {
        const { supply, price } = gift;
        if (supply <= 2500) {
          return true;
        } else if (supply <= 5000 && price <= 25000) {
          return true;
        } else if (supply <= 25000 && price <= 10000) {
          return true;
        } else if (supply <= 50000 && price <= 5000) {
          return true;
        } else if (supply <= 150000 && price <= 2000) {
          return true;
        } else if (price < 500) {
          return true;
        }
      });

      if (!giftToBuy) {
        await telegraf.telegram.sendMessage(myId, `Ни один подарок не подошел под фильтр`);
        continue;
      }

      let giftsToSend = giftToBuy.supply < 100000 ? 10 : 50;

      const updates = (await client.invoke(
        new Api.channels.CreateChannel({
          title: `Gifts ${i}`,
          about: `My favourite collection of gifts ${i}`,
        }),
      )) as Api.Updates;

      const channel = updates.chats[0] as Channel;
      await telegraf.telegram.sendMessage(
        myId,
        `Создан канал Gifts ${i}, отгружаем на него ${giftsToSend} подарков с id ${giftToBuy.id}.`,
      );

      let isError = false;

      while (!isError && giftToBuy && giftsToSend > 0) {
        const invoice = new Api.InputInvoiceStarGift({
          peer: new Api.InputPeerChannel({
            channelId: channel.id,
            accessHash: channel.accessHash!,
          }),
          giftId: BigInteger(giftToBuy.id),
          hideName: true,
        });

        const paymentForm = await client.invoke(new GetPaymentForm({ invoice }));

        if (
          paymentForm.invoice.className === "Invoice" &&
          paymentForm.invoice.prices.length === 1 &&
          paymentForm.invoice.prices[0].amount.toJSNumber() === giftToBuy.price
        ) {
          await client.invoke(new SendStarsForm({ invoice, formId: paymentForm.formId }));
          giftsToSend--;
        }
      }
      i++;
    } else {
      await delay(100);
    }
  } catch (error) {
    console.error(error);
    console.log("Some unhandled error, restarting in 3 secs");
    await telegraf.telegram.sendMessage(myId, `Ошибка в slave-боте!`);
    await delay(3000);
  }
}
