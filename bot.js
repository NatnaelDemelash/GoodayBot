require("dotenv").config();
const { Telegraf, Scenes, session, Markup } = require("telegraf");
const { BaseScene, Stage } = Scenes;
const JiraClient = require("jira-client");
const admin = require("firebase-admin");
const path = require("path");
const ntpClient = require("ntp-client");

const serviceAccountPath = path.resolve(
  process.env.GOOGLE_APPLICATION_CREDENTIALS
);

// Check if the serviceAccount variable is already declared
if (!global.serviceAccount) {
  global.serviceAccount = require(serviceAccountPath);
}

// Initialize Firebase Firestore only if it hasn't been initialized yet
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(global.serviceAccount),
  });
}

const db = admin.firestore();

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

const getNetworkTime = () => {
  return new Promise((resolve, reject) => {
    ntpClient.getNetworkTime("pool.ntp.org", 123, (err, date) => {
      if (err) {
        reject(err);
      } else {
        resolve(date);
      }
    });
  });
};

// Function to format date and time for Jira
const jiraDateFormat = (dd) => {
  return dd.toISOString();
};

// Phone scene
phoneScene.enter((ctx) => {
  ctx.replyWithHTML(
    `🟠 ትዕዛዝዎን ለመቀበል እንዲረዳን <b>"ስልክ ቁጥርዎን ያጋሩ"</b> የሚለውን በመጫን ስልክ ቁጥርዎን ያጋሩን`,
    Markup.keyboard([Markup.button.contactRequest("ስልክ ቁጥርዎን ያጋሩ")])
      .oneTime()
      .resize()
  );
});
phoneScene.on("contact", async (ctx) => {
  ctx.session.phone = ctx.message.contact.phone_number;
  await ctx.reply(`እናመሰግናለን! የሞባይል ቁጥርዎ በተሳካ ሁኔታ ደርሶናል!`);
  await ctx.scene.enter("name");
});

// Name scene
nameScene.enter((ctx) => ctx.reply("🟠 እባክዎ ሙሉ ስምዎን ያስገቡ"));
nameScene.on("text", async (ctx) => {
  ctx.session.name = ctx.message.text;
  await ctx.scene.enter("location");
});

// Location scene
locationScene.enter((ctx) => ctx.reply("🟠 ባለሙያ እንዲላክ የሚፈልጉበትን አድራሻ ያስገቡ"));
locationScene.on("text", async (ctx) => {
  ctx.session.location = ctx.message.text;
  await ctx.scene.enter("service");
});

const categoryMapping = {
  "Domestic Help": "👩🏽‍🍳ተመላላሽ የቤት ሰራተኛ",
  "Technician & Maintenance": "👨🏻‍🔧የጥገና ባለሙያ",
  "Technic & Vocational (TVET)": "👷‍♂️የቤት እድሳት ባለሙያ",
  "Business Operation": "💼ለድርጅት ባለሙያዎች",
};

const serviceMapping = {
  "Cooking Maid": "የቤት ምግብ ሰራተኛ",
  "Cleaning Maid": "የቤት ጽዳት ሰራተኛ",
  Catering: "ምግብ ዝግጅት",
  Tutor: "አስጠኚ",
  "Satellite Dish Tech": "የዲሽ ቴክኒሺያን",
  Electrician: "ኤሌክትሪሽያን",
  Plumber: "ቧንቧ ሰራተኛ",
  "Home Appliance Repair": "ፍሪጅ፣ ምጣድ፣ ልብስ-ማጠቢያ ጥገና",
  "Electronics Repair": "የኤሌክትሮኒክስ ጥገና",
  Construction: "ግንባታ",
  Painter: "ቀለም ቀቢ",
  "Gypsum Works": "የጂፕሰም ስራ",
  "Aluminium Works": "የአሉሚኒየም ስራ",
  Carpenter: "አናጺ",
  "Tiling Works": "ታይል ንጣፍ ስራ",
  Accountant: "የሒሳብ ባለሙያ",
  Salesman: "የሽያጭ ሰራተኛ",
  Receptionist: "እንግዳ ተቀባይ",
  Secretary: "ፀሃፊ",
  Cashier: "ካሸር",
};

serviceScene.enter(async (ctx) => {
  try {
    // Send a loading message
    const loadingMessage = await ctx.reply("⏳ እባክዎ ትንሽ ይታገሱን...");

    // Fetch data from Firestore
    const serviceDoc = await db
      .collection("services")
      .doc("gooday_headline_services")
      .get();

    if (!serviceDoc.exists) {
      console.error("Service document does not exist.");
      return;
    }

    const categories = serviceDoc.data().services || [];
    if (categories.length === 0) {
      console.error("No categories found in the document.");
      return;
    }

    // Update the message with the fetched categories
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loadingMessage.message_id,
      null,
      "🟠 እባክዎ በቅድሚያ የአገልግሎት ዘርፍ ይምረጡ",
      Markup.inlineKeyboard(
        chunkArray(
          categories.map((category) =>
            Markup.button.callback(
              categoryMapping[category.category] || category.category,
              `category_${category.category}`
            )
          ),
          2
        )
      )
        .oneTime()
        .resize()
    );
  } catch (error) {
    console.error("Error fetching services:", error);
  }
});

serviceScene.on("callback_query", async (ctx) => {
  const selectedCategory = ctx.callbackQuery.data;

  if (selectedCategory.startsWith("category_")) {
    const categoryName = selectedCategory.replace("category_", "");

    try {
      const serviceDoc = await db
        .collection("services")
        .doc("gooday_headline_services")
        .get();

      if (!serviceDoc.exists) {
        console.error("Service document does not exist.");
        return;
      }

      const categories = serviceDoc.data().services || [];
      const category = categories.find((cat) => cat.category === categoryName);

      if (!category) {
        console.error("Selected category not found.");
        return;
      }

      ctx.session.selectedCategory = categoryName;

      await ctx.reply(
        `🟠 ከመረጡት ${
          categoryMapping[categoryName] || categoryName
        } ውስጥ የሚፈልጉትን የባለሙያ አይነት ይምረጡ`,
        Markup.inlineKeyboard(
          chunkArray(
            category.services.map((service) =>
              Markup.button.callback(
                serviceMapping[service] || service,
                `service_${service}`
              )
            ),
            2
          )
        )
          .oneTime()
          .resize()
      );
    } catch (error) {
      console.error("Error fetching services:", error);
    }
  } else if (selectedCategory.startsWith("service_")) {
    const selectedService = selectedCategory.replace("service_", "");
    ctx.session.selectedService = selectedService;

    await ctx.reply(
      `የጠየቁት ባለሙያ: ${serviceMapping[selectedService] || selectedService}`
    );
    ctx.scene.enter("description");
  }
});

// Description scene
descriptionScene.enter((ctx) =>
  ctx.reply("🟠 ብቁ የሆነ ባለሞያ ለመምረጥ እንዲረዳን ስለስራው ጥቂት ማብራሪያ ይጻፉ")
);
descriptionScene.on("text", async (ctx) => {
  ctx.session.description = ctx.message.text;

  // Getting Service Request Time
  const serviceRequestTime = await getNetworkTime();
  const formattedServiceRequestTime = jiraDateFormat(serviceRequestTime);

  const requestDetails = `
    ሙሉ ስም: ${ctx.session.name}
    አድራሻ: ${ctx.session.location}
    የጠየቁት አገልግሎት: ${
      serviceMapping[ctx.session.selectedService] || ctx.session.selectedService
    }
    የአገልግሎት ማብራሪያ: ${ctx.session.description}
    ስልክ ቁጥር: ${ctx.session.phone}
  `;

  // Create a Jira ticket
  try {
    const summary = `${ctx.session.selectedService}`;
    const description = `${ctx.session.description}`;
    const additionalFields = {
      // customfield_10035: ctx.session.name,
      // customfield_10036: ctx.session.phone,
      // customfield_10038: ctx.session.location,
      // customfield_10034: ctx.session.selectedService,
      // customfield_10045: formattedServiceRequestTime,

      // Test (Personal KAN Project)
      customfield_10031: ctx.session.name,
      customfield_10035: ctx.session.location,
      customfield_10034: ctx.session.phone,
      customfield_10036: ctx.session.selectedService,
      customfield_10039: formattedServiceRequestTime,
    };

    const jiraResponse = await createJiraTicket(
      summary,
      description,
      additionalFields
    );

    // Get Current hour
    const currentHour = serviceRequestTime.getHours();

    // Defining our working hour
    const startHour = 16;
    const endHour = 18;

    // Determine message based on current time
    let confirmationMessage;
    if (currentHour >= startHour && currentHour < endHour) {
      confirmationMessage = `የደንበኛ ግልጋሎት ባለሙያዎቻችን በ 10 ደቂቃ ውስጥ ትዕዛዝዎን ማስተናገድ ይጀምራሉ።`;
    } else {
      confirmationMessage = `ትዕዛዝዎ ከመደበኛው የስራ ሰዓት ውጪ ስለሆነ(ጠዋት 1:00 - ምሽት 12:00) ጥያቄዎን በሚቀጥለው ቀን በስራ ሰዓት ውስጥ እናስተናግዳለን`;
    }

    await ctx.replyWithHTML(
      `ተሳክቷል! ትዕዛዝዎን ተቀብለናል.\n <b>${requestDetails}</b>\n\n ${confirmationMessage}\n\n <b>የአገልግሎት ትዕዛዝ ቁጥርዎ:</b> ${jiraResponse.key}\n\n ባስገቡት የአገልግሎት ጥያቄ ላይ ተጨማሪ ማብራሪያ ካስፈለገን እንደውልሎታለን።\n\nጉዳይን ስለመረጡ እናመሰግናለን!`
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

// Function to create statrt Menu message
const getStartMenuMessage = (userName) => {
  return {
    text: `ሰላም ${userName}! 👋እንኳን ወደ GoodayOn ቦት በደህና መጡ!\n\n💁ጉዳይኦን ማንነታቸው እና የሙያ ብቃታቸው የተረጋገጠ ባለሞያዎችን በቀላሉ ማግኘት የሚያስችል ቀልጣፋ አገልግሎት ነው\n\n❇️ Request for Service Provider - ባለሙያ ለማዘዝ\n\n❇️ Information - ስለ ጉዳይኦን መረጃ ለማግኘት`,
    keyboard: Markup.keyboard([
      ["Request for Service Provider", "Information"],
    ]).resize(),
  };
};

bot.start((ctx) => {
  const userName = ctx.from.first_name;
  const startMenuMessage = getStartMenuMessage(userName);
  ctx.replyWithHTML(startMenuMessage.text, startMenuMessage.keyboard);
});

bot.hears("Request for Service Provider", (ctx) => ctx.scene.enter("phone"));

bot.hears("Information", (ctx) => {
  ctx.replyWithHTML(
    `🌐 <b>Company Website(ድረ-ገጽ):</b> <a href="https://gooday.io">gooday.io</a>\n\n📞 <b>Call Center(የጥሪ ማዕከል አጭር ቁጥር):</b> 9675\n\n<b>📍Office Address(አድራሻ)</b>:Gotera Pepsi\n\n 📱 <b>Download Our App(የጉዳይ መተግበሪያን ለማወረድ):</b>\n\n<a href="https://play.google.com/store/apps/details?id=ai.gooday.goodayon">Google Play</a> | <a href="https://apps.apple.com/us/app/goodayon/id1521933697">App Store</a>`,
    Markup.keyboard([["Back"]]).resize()
  );
});

bot.hears("Back", (ctx) => {
  const userName = ctx.from.first_name;
  const startMenuMessage = getStartMenuMessage(userName);
  ctx.replyWithHTML(startMenuMessage.text, startMenuMessage.keyboard);
});

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
