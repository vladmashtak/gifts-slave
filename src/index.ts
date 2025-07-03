// @ts-ignore
import input from "input";
import { Api, sessions, TelegramClient } from "telegram-gifts";
import { env } from "./env.js";

import StarGift = Api.StarGift;
import StarGifts = Api.payments.StarGifts;
import GetStarGifts = Api.payments.GetStarGifts;
import GetPaymentForm = Api.payments.GetPaymentForm;
import SendStarsForm = Api.payments.SendStarsForm;

const stringSession = new sessions.StringSession(env.API_SESSION);

const client = new TelegramClient(stringSession, Number(env.API_ID), env.API_HASH, {
  connectionRetries: 5,
});

await client
  .start({
    phoneNumber: async () => await input.text("Phone number"),
    password: async () => await input.text("2FA password"),
    phoneCode: async () => await input.text("📩 Telegram code: "),
    onError: (err) => console.error("Telegram error:", err),
  })
  .then(() => {
    if (!env.API_SESSION) {
      console.log("📄 Session:(save it to .env file API_SESSION=XXX)", client.session.save());
    }
  });

while (true) {
  const starGifts = (await client.invoke(new GetStarGifts({ hash: 0 }))) as StarGifts;

  const gifts = starGifts.gifts as StarGift[];

  const limitedGifts = gifts.filter((gift) => {
    return gift.limited;
  });

  const sortedLimitedGifts = limitedGifts.sort(
    (a, b) => b.stars.toJSNumber() - a.stars.toJSNumber(),
  );

  const notSoldOut = sortedLimitedGifts.filter(
    (gift) => gift.className === "StarGift" && !gift.soldOut,
  );

  if (notSoldOut.length) {
    console.log("ALERT: new gifts");
  }

  if (!notSoldOut.length) {
    console.log("new gifts not found");
    await new Promise((f) => setTimeout(f, 500));
    continue;
  }

  for (const gift of notSoldOut) {
    if (env.MAXIMUM_PRICE && env.MAXIMUM_PRICE < gift.stars.toJSNumber()) {
      continue;
    }
    if (env.MAXIMUM_SUPPLY < (gift.availabilityTotal || Infinity)) {
      continue;
    }

    const invoice = new Api.InputInvoiceStarGift({
      peer: new Api.InputPeerSelf(),
      giftId: gift.id,
      hideName: true,
      message: new Api.TextWithEntities({
        text: "@giftsatellite", // Текст комментария
        entities: [],
      }),
    });

    const paymentForm = await client.invoke(new GetPaymentForm({ invoice }));

    if (
      paymentForm.invoice.className === "Invoice" &&
      paymentForm.invoice.prices.length === 1 &&
      paymentForm.invoice.prices[0].amount.toJSNumber() === gift.stars.toJSNumber()
    ) {
      try {
        await client.invoke(new SendStarsForm({ invoice, formId: paymentForm.formId }));
      } catch (err) {
        console.log(err);
      }
    }
  }
}
