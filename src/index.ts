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
import InputPeerSelf = Api.InputPeerSelf;

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

let j = 0;
while (true) {
  if (isBotStopped) {
    await delay(1000);
  } else {
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
        if (!lastMessageId) {
          const message = await telegraf.telegram.sendMessage(
            me.id.toString(),
            `Бот исправен, последнее обновление: ${new Date().toLocaleString()}(UTC+0)`,
          );
          lastMessageId = message.message_id;
        } else if (k % 100 === 0) {
          await telegraf.telegram.editMessageText(
            me.id.toString(),
            lastMessageId,
            undefined,
            `Бот исправен, последнее обновление: ${new Date().toLocaleString()}(UTC+0)`,
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

        const giftToBuy = giftsSortedBySupply[j];
        if (!giftToBuy) {
          j = 0;
        }

        const { balance } = await client.invoke(
          new Api.payments.GetStarsTransactions({
            peer: new InputPeerSelf(),
            offset: "",
            limit: 1,
          }),
        );

        if (!giftToBuy) {
          await telegraf.telegram.sendMessage(myId, `Ни один подарок не подошел под фильтр`);
          continue;
        }
        if (balance.amount.toJSNumber() < giftToBuy.price) {
          await telegraf.telegram.sendMessage(
            myId,
            `Нет баланса для покупки. Баланс: ${balance.amount.toJSNumber()}`,
          );
        }

        let giftsToSend = giftToBuy.supply <= 50000 ? 2 : 5;

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
      j++;
      console.error(error);
      console.log("Some unhandled error, restarting in 3 secs");
      await telegraf.telegram.sendMessage(myId, `Ошибка в slave-боте!`);
      await delay(1500);
    }
  }
}
