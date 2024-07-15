require("dotenv").config();
const { Telegraf, Scenes, session, Markup } = require("telegraf");
const { BaseScene, Stage } = Scenes;
const JiraClient = require("jira-client");
const { formatISO } = require("date-fns");
// const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

// Jira credentials and endpoint
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;
const JIRA_EMAIL = process.env.JIRA_EMAIL;

// Initialize Jira client
const jira = new JiraClient({
  protocol: "https",
  host: JIRA_BASE_URL.replace("https://", ""),
  username: JIRA_EMAIL,
  password: JIRA_API_TOKEN,
  apiVersion: "2",
  strictSSL: true,
});

// Function to create a Jira ticket
const createJiraTicket = async (summary, description, additionalFields) => {
  try {
    const issue = await jira.addNewIssue({
      fields: {
        project: {
          key: JIRA_PROJECT_KEY,
        },
        summary,
        description,
        issuetype: {
          name: "Task",
        },
        ...additionalFields, // Add additional fields to the Jira issue
      },
    });
    return issue;
  } catch (error) {
    console.error("Error creating Jira ticket:", error);
    throw error;
  }
};

// Define service categories
const services = [
  {
    category: "🧹 Domestic Help",
    options: ["Cooking Maid", "Cleaning Maid", "Catering", "Tutor"],
  },
  {
    category: "👨🏻‍🔧 Maintenance",
    options: [
      "Satellite Dish",
      "Electrician",
      "Plumber",
      "Home Appliance Repair",
      "Electronics Repair",
    ],
  },
  {
    category: "👷‍♂️ Home Renovation",
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
    category: "📈 Business",
    options: ["Accountant", "Salesman", "Receptionist", "Secretary", "Cashier"],
  },
];

// Scenes for each step
const nameScene = new BaseScene("name");
const locationScene = new BaseScene("location");
const serviceScene = new BaseScene("service");
const descriptionScene = new BaseScene("description");
const phoneScene = new BaseScene("phone");

// Function to split array into chunks
const chunkArray = (array, chunkSize) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

// Name scene
nameScene.enter((ctx) => ctx.reply("እባክዎ ሙሉ ስምዎትን ያስገቡ:"));
nameScene.on("text", (ctx) => {
  ctx.session.name = ctx.message.text;
  ctx.scene.enter("location");
});

// Location scene
locationScene.enter((ctx) => ctx.reply("ባለሙያ እንዲላክ የሚፈልጉበትን አድራሻ ያስገቡ:"));
locationScene.on("text", (ctx) => {
  ctx.session.location = ctx.message.text;
  ctx.scene.enter("service");
});

// Service scene
serviceScene.enter((ctx) => {
  const serviceOptions = services.map((category) => category.category);
  const serviceButtons = chunkArray(serviceOptions, 2).map((chunk) =>
    chunk.map((option) => Markup.button.callback(option, option))
  );

  ctx.reply(
    "እባክዎ በቅድሚያ የአገልግሎት ዘርፍ ይምረጡ:",
    Markup.inlineKeyboard(serviceButtons)
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

    const serviceOptionButtons = chunkArray(options, 2).map((chunk) =>
      chunk.map((option) => Markup.button.callback(option, option))
    );

    ctx.reply(
      `ከመረጡት የአገልግሎት ዘርፍ ውስጥ የሚፈልጉትን የባለሙያ አይነት ይምረጡ ${selectedCategory}:`,
      Markup.inlineKeyboard(serviceOptionButtons)
    );
  }
);

// Handle specific service selection
serviceScene.action(
  services.flatMap((category) => category.options),
  (ctx) => {
    ctx.session.selectedService = ctx.match[0];
    ctx.reply(`የጠየቁት ባለሙያ: ${ctx.session.selectedService}`);
    ctx.scene.enter("description");
  }
);

// Description scene
descriptionScene.enter((ctx) =>
  ctx.reply("የተሟላ አገልግሎት እንድንሰጥዎ ስለሚጠይቁት አገልግሎት የተወሰነ ማብራሪያ ያስገቡ")
);
descriptionScene.on("text", (ctx) => {
  ctx.session.description = ctx.message.text;
  ctx.scene.enter("phone");
});

// Phone scene
phoneScene.enter((ctx) => ctx.reply("የሞባይል ቁጥርዎትን ያስገቡ:"));
phoneScene.on("text", async (ctx) => {
  ctx.session.phone = ctx.message.text;

  const requestTime = formatISO(new Date());
  // Collect all the information
  const requestDetails = `
    ሙሉ ስም: ${ctx.session.name}
    አድራሻ: ${ctx.session.location}
    የተጠየቁት አገልግሎት: ${ctx.session.selectedService}
    ለጠየቁት አገልግሎት ያስገቡት ማብራሪያ: ${ctx.session.description}
    ስልክ ቁጥር: ${ctx.session.phone}
  `;

  // Create a Jira ticket
  try {
    const summary = `${ctx.session.selectedService}`;
    const description = `${ctx.session.description}`;
    const additionalFields = {
      customfield_10035: ctx.session.name,
      customfield_10036: ctx.session.phone,
      customfield_10038: ctx.session.location,
      customfield_10034: ctx.session.selectedService,
      customfield_10045: requestTime,
    };

    const jiraResponse = await createJiraTicket(
      summary,
      description,
      additionalFields
    );
    await ctx.reply(
      `ተሳክቷል! ትዕዛዝዎን ተቀብለናል.\n${requestDetails}\n\n የደንበኛ ግልጋሎት ባለሙያዎቻችን በ 10 ደቂቃ ውስጥ ትዕዛዝዎን ማስተናገድ ይጀምራሉ.\n\nየአገልግሎት ትዕዛዝ ቁጥርዎ: ${jiraResponse.key}\n\n ባስገቡት የአገልግሎት ጥያቄ ላይ ተጨማሪ ማብራሪያ ካስፈለገን እንደውልሎታለን።\n\nጉዳይን ስለመረጡ እናመሰግናለን!`
    );
  } catch (error) {
    await ctx.reply("ጥያቄዎን በአግባቡ መቀበል አልተቻለም። እባክዎን እንደገና ይሞክሩ!");
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
    `🖐️ Welcome to GoodayOn telegram bot! \n\n💁 GoodayOn is a gig platform that connects skilled professionals with individuals and businesses in need of their services\n\nጉዳይኦን በቅርብ ርቀት ላይ የሚገኙ ስራ እና ሰራተኛን በቀላሉ የሚያገናኝ የሞባይል መተግበሪያ ነው፡፡
    `
  );
  ctx.reply(`
     Here's how you can interact with me:\n
      - Use /start to start the bot(የቴሌግራም ቦቱን ለማስጘመር)
      - Use /request to request for a service provider(ባለሙያ/ሰራተኛ ለመጠየቅ)
      - Use /help if you need assistance(እገዛ ለማግኘት)`);
});

// Command to initiate the request scene
bot.command("request", (ctx) => ctx.scene.enter("name"));

// Help command
bot.help((ctx) =>
  ctx.reply(`
  Here's how you can interact with me:\n
   - Use /start to start the bot(የቴሌግራም ቦቱን ለማስጘመር)
   - Use /request to request for a service provider(ባለሙያ/ሰራተኛ ለመጠየቅ)
   - Use /help if you need assistance(እገዛ ለማግኘት)`)
);

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
