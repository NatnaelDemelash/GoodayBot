const { Telegraf, Scenes, session } = require("telegraf");
const { BaseScene, Stage } = Scenes;

const bot = new Telegraf("7237989781:AAEWwnuXqKiu01BWfWdaxh1INJkpxl-d8a8");

// Create scenes for each step
const nameScene = new BaseScene("name");
const locationScene = new BaseScene("location");
const serviceScene = new BaseScene("service");
const phoneScene = new BaseScene("phone");

// Name scene
nameScene.enter((ctx) => ctx.reply("Please enter your full name:"));
nameScene.on("text", (ctx) => {
  ctx.session.name = ctx.message.text;
  ctx.scene.enter("location");
});

// Location scene
locationScene.enter((ctx) => ctx.reply("Please enter your location:"));
locationScene.on("text", (ctx) => {
  ctx.session.location = ctx.message.text;
  ctx.scene.enter("service");
});

// Service scene
serviceScene.enter((ctx) => ctx.reply("Please enter the requested service:"));
serviceScene.on("text", (ctx) => {
  ctx.session.service = ctx.message.text;
  ctx.scene.enter("phone");
});

// Phone scene
phoneScene.enter((ctx) => ctx.reply("Please enter your phone number:"));
phoneScene.on("text", (ctx) => {
  ctx.session.phone = ctx.message.text;

  const requestDetails = `
  Full Name: ${ctx.session.name}
  Location: ${ctx.session.location}
  Requested Service: ${ctx.session.service}
  Phone Number: ${ctx.session.phone}
  `;

  ctx.reply("Thank you! Your request has been received:\n" + requestDetails);

  ctx.session = null;
  ctx.scene.leave();
});

const stage = new Stage([nameScene, locationScene, serviceScene, phoneScene]);

bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => ctx.scene.enter("name"));

bot.launch();

console.log("Bot is running...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
