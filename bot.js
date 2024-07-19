require("dotenv").config();
const { Telegraf, Scenes, session, Markup } = require("telegraf");
const { BaseScene, Stage } = Scenes;
const JiraClient = require("jira-client");

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
    category: "🧹 ተመላላሽ የቤት ሰራተኛ",
    options: [
      { amharic: "የቤት ምግብ ሰራተኛ", english: "Cooking Maid" },
      { amharic: "የቤት ጽዳት ሰራተኛ", english: "Cleaning Maid" },
      { amharic: "ምግብ ዝግጅት", english: "Catering" },
      { amharic: "አስጠኚ", english: "Tutor" },
    ],
  },
  {
    category: "👨🏻‍🔧 የጥገና ባለሙያ ",
    options: [
      { amharic: "የዲሽ ቴክኒሺያን", english: "Satellite Dish" },
      { amharic: "ኤሌክትሪሽያን", english: "Electrician" },
      { amharic: "ቧንቧ ሰራተኛ", english: "Plumber" },
      { amharic: "ፍሪጅ፣ ምጣድ፣ ልብስ-ማጠቢያ ጥገና", english: "Home Appliance Repair" },
      { amharic: "የኤሌክትሮኒክስ ጥገና", english: "Electronics Repair" },
    ],
  },
  {
    category: "👷‍♂️ የቤት እድሳት ባለሙያ",
    options: [
      { amharic: "ግንባታ", english: "Construction" },
      { amharic: "ቀለም ቀቢ", english: "Painting" },
      { amharic: "የጂፕሰም ስራ", english: "Gypsum Works" },
      { amharic: "ቧንቧ ሰራተኛ", english: "Plumber" },
      { amharic: "የአሉሚኒየም ስራ", english: "Aluminium Works" },
      { amharic: "አናጺ", english: "Carpenter" },
      { amharic: "ታይል ንጣፍ ስራ", english: "Tiling Works" },
    ],
  },
  {
    category: "📈 ለድርጅቶች",
    options: [
      { amharic: "የሒሳብ ባለሙያ", english: "Accountant" },
      { amharic: "የሽያጭ ሰራተኛ", english: "Salesman" },
      { amharic: "እንግዳ ተቀባይ", english: "Receptionist" },
      { amharic: "ፀሃፊ", english: "Secretary" },
      { amharic: "ካሸር", english: "Cashier" },
    ],
  },
];

// Scenes for each step
const phoneScene = new BaseScene("phone");
const nameScene = new BaseScene("name");
const locationScene = new BaseScene("location");
const serviceScene = new BaseScene("service");
const descriptionScene = new BaseScene("description");

// Function to split array into chunks
const chunkArray = (array, chunkSize) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

// Function to format date and time for Jira
const jiraDateFormat = (dd) => {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const m = months[dd.getMonth()];
  const d = dd.getDate();
  const y = dd.getFullYear();
  let h = dd.getHours();
  const M = dd.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  h = h ? h : 12; // the hour '0' should be '12'

  return `${m} ${d}, ${y}, ${h}:${M <= 9 ? `0${M}` : M} ${ampm}`;
};

// Phone scene
phoneScene.enter((ctx) => {
  ctx.reply(
    "እባክዎን የሞባይል ቁጥርዎትን ማየት እንድንችል ይፍቀዱልን",
    Markup.keyboard([Markup.button.contactRequest("የሞባይል ቁጥር አጋራ")])
      .oneTime()
      .resize()
  );
});
phoneScene.on("contact", (ctx) => {
  ctx.session.phone = ctx.message.contact.phone_number;
  ctx.reply(`እናመሰግናለን! የሞባይል ቁጥርዎን በተሳካ ሁኔታ ደርሶናል!`);
  ctx.scene.enter("name");
});

// Name scene
nameScene.enter((ctx) => ctx.reply("ሙሉ ስም :"));
nameScene.on("text", (ctx) => {
  ctx.session.name = ctx.message.text;
  ctx.scene.enter("location");
});

// Location scene
locationScene.enter((ctx) => ctx.reply("ባለሙያ እንዲላክ የሚፈልጉበትን አድራሻ:"));
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
      chunk.map((option) =>
        Markup.button.callback(option.amharic, option.amharic)
      )
    );

    ctx.reply(
      `ከመረጡት ${selectedCategory} ውስጥ የሚፈልጉትን የባለሙያ አይነት ይምረጡ:`,
      Markup.inlineKeyboard(serviceOptionButtons)
    );
  }
);

// Handle specific service selection
serviceScene.action(
  services.flatMap((category) =>
    category.options.map((option) => option.amharic)
  ),
  (ctx) => {
    const selectedAmharicService = ctx.match[0];
    ctx.session.selectedServiceAmharic = selectedAmharicService;
    ctx.session.selectedServiceEnglish = services
      .flatMap((category) => category.options)
      .find((option) => option.amharic === selectedAmharicService).english;
    ctx.reply(`የጠየቁት ባለሙያ: ${selectedAmharicService}`);
    ctx.scene.enter("description");
  }
);

// Description scene
descriptionScene.enter((ctx) =>
  ctx.reply("ብቁ የሆነ ባለሞያ ለመምረጥ እንዲረዳን ስለስራው ጥቂት ማብራሪያ ይጻፉ፡")
);
descriptionScene.on("text", async (ctx) => {
  ctx.session.description = ctx.message.text;

  const currentDate = new Date();
  const formattedDate = jiraDateFormat(currentDate);

  // Collect all the information
  const requestDetails = `
    ሙሉ ስም: ${ctx.session.name}
    አድራሻ: ${ctx.session.location}
    የጠየቁት አገልግሎት: ${ctx.session.selectedServiceAmharic}
    የአገልግሎት ማብራሪያ: ${ctx.session.description}
    ስልክ ቁጥር: ${ctx.session.phone}
  `;

  // Create a Jira ticket
  try {
    const summary = `${ctx.session.selectedServiceEnglish}`;
    const description = `${ctx.session.description}`;
    const additionalFields = {
      // customfield_10035: ctx.session.name,
      // customfield_10036: ctx.session.phone,
      // customfield_10038: ctx.session.location,
      // customfield_10034: ctx.session.selectedServiceEnglish,
      // customfield_10298: formattedDate,

      // Test (Personal KAN Project)
      customfield_10031: ctx.session.name,
      customfield_10035: ctx.session.location,
      customfield_10034: ctx.session.phone,
      customfield_10036: ctx.session.selectedServiceEnglish,
      customfield_10040: formattedDate,
    };

    const jiraResponse = await createJiraTicket(
      summary,
      description,
      additionalFields
    );
    await ctx.replyWithHTML(
      `ተሳክቷል! ትዕዛዝዎን ተቀብለናል.\n <b>${requestDetails}</b>\n\nየደንበኛ ግልጋሎት ባለሙያዎቻችን በ 10 ደቂቃ ውስጥ ትዕዛዝዎን ማስተናገድ ይጀምራሉ.\n\n <b>የአገልግሎት ትዕዛዝ ቁጥርዎ:</b> ${jiraResponse.key}\n\n ባስገቡት የአገልግሎት ጥያቄ ላይ ተጨማሪ ማብራሪያ ካስፈለገን እንደውልሎታለን።\n\nጉዳይን ስለመረጡ እናመሰግናለን!`
    );
  } catch (error) {
    await ctx.reply("ጥያቄዎን በአግባቡ መቀበል አልተቻለም። እባክዎን እንደገና ይሞክሩ!");
    console.error("Error creating Jira ticket:", error);
  }

  ctx.scene.leave();
});

// Stage
const stage = new Stage([
  phoneScene,
  nameScene,
  locationScene,
  serviceScene,
  descriptionScene,
]);

bot.use(session());
bot.use(stage.middleware());

// Start command to initiate the scene
bot.start((ctx) => {
  ctx.reply(
    `💁 GoodayOn is a gig platform that connects skilled professionals with individuals and businesses in need of their services\n\nጉዳይኦን ማንነታቸው እና የሙያ ብቃታቸው የተረጋገጠ ባለሞያዎችን በቀላሉ ማግኘት የሚያስችል ዲጂታል አገልግሎት ነው
    `
  );
  ctx.reply(`
     Here's how you can interact with me:\n
      - Use /start to start the bot(የቴሌግራም ቦቱን ለማስጘመር)
      - Use /request to request for a service provider(ባለሙያ/ሰራተኛ ለመጠየቅ)
      - Use /help if you need assistance(እገዛ ለማግኘት)`);
});

// Command to initiate the request scene
bot.command("request", (ctx) => ctx.scene.enter("phone"));

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
