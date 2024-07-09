require("dotenv").config();
const { Telegraf, Scenes, session, Markup } = require("telegraf");
const { BaseScene, Stage } = Scenes;
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// Jira credentials and endpoint
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;
const JIRA_EMAIL = process.env.JIRA_EMAIL;

// Function to create a Jira ticket
const createJiraTicket = async (summary, description) => {
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString(
    "base64"
  );
  const response = await axios.post(
    `${JIRA_BASE_URL}/rest/api/2/issue`,
    {
      fields: {
        project: {
          key: JIRA_PROJECT_KEY,
        },
        summary,
        description,
        issuetype: {
          name: "Task",
        },
      },
    },
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data;
};

// Define service categories
const services = [
  {
    category: "Domestic Help",
    options: ["Cooking Maid", "Cleaning Maid", "Catering", "Tutor"],
  },
  {
    category: "Maintenance",
    options: [
      "Satellite Dish",
      "Electrician",
      "Plumber",
      "Home Appliance Repair",
      "Electronics Repair",
    ],
  },
  {
    category: "Home Renovation",
    options: [
      "Construction",
      "House Painting",
      "Gypsum Works",
      "Plumber",
      "Aluminium Works",
      "Carpenter",
      "Tiling Works",
    ],
  },
  {
    category: "Business",
    options: ["Accountant", "Salesman", "Receptionist", "Secretary", "Cashier"],
  },
];

// Scenes for each step
const nameScene = new BaseScene("name");
const locationScene = new BaseScene("location");
const serviceScene = new BaseScene("service");
const descriptionScene = new BaseScene("description");
const phoneScene = new BaseScene("phone");

// Name scene
nameScene.enter((ctx) => ctx.reply("Please Enter Your Full Name:"));
nameScene.on("text", (ctx) => {
  ctx.session.name = ctx.message.text;
  ctx.scene.enter("location");
});

// Location scene
locationScene.enter((ctx) => ctx.reply("Please Enter Your Location:"));
locationScene.on("text", (ctx) => {
  ctx.session.location = ctx.message.text;
  ctx.scene.enter("service");
});

// Service scene
serviceScene.enter((ctx) => {
  const serviceOptions = services.map((category) => category.category);
  ctx.reply(
    "Please select the requested service category:",
    Markup.inlineKeyboard(
      serviceOptions.map((option) => Markup.button.callback(option, option))
    )
  );
});

// Handle category selection
serviceScene.action(
  services.map((category) => category.category),
  (ctx) => {
    const selectedCategory = ctx.match[0];
    const options = services.find(
      (category) => category.category === selectedCategory
    ).options;

    ctx.session.serviceCategory = selectedCategory;
    ctx.session.serviceOptions = options;

    ctx.reply(
      `Please select the specific service from ${selectedCategory}:`,
      Markup.inlineKeyboard(
        options.map((option) => Markup.button.callback(option, option))
      )
    );
  }
);

// Handle specific service selection
serviceScene.action(
  services.flatMap((category) => category.options),
  (ctx) => {
    ctx.session.selectedService = ctx.match[0];
    ctx.reply(`You selected: ${ctx.session.selectedService}`);
    ctx.scene.enter("description");
  }
);

// Description scene
descriptionScene.enter((ctx) =>
  ctx.reply("Please provide a description for the requested service:")
);
descriptionScene.on("text", (ctx) => {
  ctx.session.description = ctx.message.text;
  ctx.scene.enter("phone");
});

// Phone scene
phoneScene.enter((ctx) => ctx.reply("Please Enter Your Phone Number:"));
phoneScene.on("text", async (ctx) => {
  ctx.session.phone = ctx.message.text;

  // Collect all the information
  const requestDetails = `
  Full Name: ${ctx.session.name}
  Location: ${ctx.session.location}
  Requested Service: ${ctx.session.selectedService}
  Description: ${ctx.session.description}
  Phone Number: ${ctx.session.phone}
  `;

  // Create a Jira ticket
  try {
    const summary = `TR - ${ctx.session.selectedService}`;
    const description = requestDetails;

    const jiraResponse = await createJiraTicket(summary, description);
    await ctx.reply(
      `Thank you! Your request has been received.\n${requestDetails}\n\nOur customer service specialist will start processing within 10 mins.\n\nYour service request number is: ${jiraResponse.key}\n\n We may contact you if we require additional information to process your service request.\n\nThank you for choosing GoodayOn!`
    );
  } catch (error) {
    await ctx.reply(
      "There was an error on accepting your request. Please try again later."
    );
    console.error(error);
  }

  // Clear session data but don't set it to null
  ctx.session.name = null;
  ctx.session.location = null;
  ctx.session.selectedService = null;
  ctx.session.description = null;
  ctx.session.phone = null;

  // Leave the current scene and go back to the start
  ctx.scene.leave();
  // ctx.scene.enter("name");
});

// Create a stage with the scenes
const stage = new Stage([
  nameScene,
  locationScene,
  serviceScene,
  descriptionScene,
  phoneScene,
]);

// Register session middleware and stage
bot.use(session());
bot.use(stage.middleware());

// Start command to initiate the scene
bot.start((ctx) => {
  ctx.reply(
    `🖐️ Welcome to GoodayOn telegram bot! \n\n💁 GoodayOn is a gig platform that connects skilled professionals with individuals and businesses in need of their services
    `
  );
  ctx.reply(`
     Here's how you can interact with me:\n
      - Use /request to request for a service provider.
      - Use /help if you need assistance.`);
});

// Command to initiate the request scene
bot.command("request", (ctx) => ctx.scene.enter("name"));

// Help command
bot.help((ctx) => ctx.reply("This is the help message."));

// Launch the bot
bot
  .launch()
  .then(() => {
    console.log("Bot is running...");
  })
  .catch((err) => {
    console.error("Bot startup error:", err);
  });

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
