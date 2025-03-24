import puppeteer from "puppeteer";
import fetch from "node-fetch";

// Telegram configuration - REPLACE WITH YOUR VALUES
const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  "7971649577:AAGLCFsXlNW-JP7SZOVEyKqslfmoHCkI5L8";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "6795485219";

// Define the list of available IPL teams for reference
const iplTeams = [
  "Chennai Super Kings",
  "Delhi Capitals",
  "Gujarat Titans",
  "Kolkata Knight Riders",
  "Lucknow Super Giants",
  "Mumbai Indians",
  "Punjab Kings",
  "Rajasthan Royals",
  "Sunrisers Hyderabad",
];

// Function to send Telegram messages
async function sendTelegramMessage(message) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error("Failed to send Telegram message:", data);
    } else {
      console.log("Telegram notification sent successfully");
    }
  } catch (error) {
    console.error("Error sending Telegram message:", error);
  }
}

async function monitorTicketAvailability(opponentTeam, refreshInterval = 3) {
  // Validate the input team
  if (!iplTeams.includes(opponentTeam)) {
    console.log(`Warning: "${opponentTeam}" may not be a valid IPL team name.`);
    console.log(`Valid teams are: ${iplTeams.join(", ")}`);
    console.log("Continuing with the search anyway...\n");
  }

  let browser = null;
  let page = null;
  let isAvailable = false;
  let checkCount = 0;
  let intervalId = null;

  // Function to create a new browser instance
  async function createBrowser() {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore errors on closing
      }
    }

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    page = await browser.newPage();
    return { browser, page };
  }

  try {
    // Initial browser setup
    ({ browser, page } = await createBrowser());

    console.log(`Starting monitoring for RCB vs ${opponentTeam} tickets`);
    console.log(`Will refresh every ${refreshInterval} minutes`);
    console.log("-------------------------------------------");

    // Send initial Telegram notification
    await sendTelegramMessage(
      `🏏 *Monitoring Started*\nLooking for tickets: RCB vs ${opponentTeam}\nWill check every ${refreshInterval} minutes`,
    );

    // Function to check availability
    const checkAvailability = async () => {
      checkCount++;
      const currentTime = new Date().toLocaleTimeString();
      console.log(
        `\n[${currentTime}] Check #${checkCount}: Refreshing page...`,
      );

      try {
        // Check if page is still valid, otherwise recreate browser and page
        if (!page || page.isClosed()) {
          console.log(
            "Page is closed or invalid, recreating browser session...",
          );
          ({ browser, page } = await createBrowser());
        }

        // Navigate to the page (fresh load each time)
        await page.goto("https://shop.royalchallengers.com/ticket", {
          waitUntil: "networkidle2",
          timeout: 60000, // 60 second timeout
        });

        console.log(
          `Checking ticket availability for RCB vs ${opponentTeam}...`,
        );

        // Evaluate page for ticket availability
        const ticketsAvailable = await page.evaluate((opponent) => {
          // Find all match cards
          const matchCards = Array.from(
            document.querySelectorAll(".css-q38j1a"),
          );

          // Filter cards for RCB vs the specified opponent team
          const matchCard = matchCards.find((card) => {
            return (
              card.textContent.includes("Royal Challengers Bengaluru") &&
              card.textContent.includes(opponent)
            );
          });

          if (!matchCard) {
            return {
              found: false,
              message: `RCB vs ${opponent} match not found`,
            };
          }

          // Check if BUY TICKETS button exists and is not sold out
          const buyButton = matchCard.querySelector(
            "button.chakra-button.css-9le7ot",
          );

          // Use standard DOM methods to find status buttons
          const buttons = matchCard.querySelectorAll("button");
          const statusButton = Array.from(buttons).find(
            (btn) =>
              btn.textContent.includes("COMING SOON") ||
              btn.textContent.includes("SOLD OUT") ||
              btn.textContent.includes("PHASE 1 SOLD OUT"),
          );

          // Get match date
          const dateElement = matchCard.querySelector(
            ".chakra-text.css-1nm99ps",
          );
          const date = dateElement ? dateElement.textContent : "Date not found";

          // Get price range if available
          const priceElement = matchCard.querySelector(".css-1eveppl");
          const price = priceElement
            ? priceElement.textContent
            : "Price not available";

          if (buyButton && buyButton.textContent.includes("BUY TICKETS")) {
            return {
              found: true,
              available: true,
              date,
              price,
              buttonClass: buyButton.className,
            };
          } else if (statusButton) {
            return {
              found: true,
              available: false,
              date,
              price,
              status: statusButton.textContent.trim(),
              message: `Tickets for RCB vs ${opponent} are ${statusButton.textContent.trim()}`,
            };
          } else {
            return {
              found: true,
              available: false,
              date,
              price,
              message: `BUY TICKETS button not found for RCB vs ${opponent} match`,
            };
          }
        }, opponentTeam);

        // Process the result
        if (ticketsAvailable.found) {
          console.log(`Match found: RCB vs ${opponentTeam}`);
          console.log(`Date: ${ticketsAvailable.date}`);

          if (ticketsAvailable.available) {
            // Update our ticket status
            isAvailable = true;

            // Play a system sound on macOS or other platforms if possible
            try {
              // This uses console bell character which might beep on some terminals
              process.stdout.write("\u0007");
            } catch (e) {
              // Ignore errors from bell
            }

            console.log("\n🔔🔔🔔 TICKETS ARE NOW AVAILABLE! 🔔🔔🔔");
            console.log(`Price Range: ${ticketsAvailable.price}`);
            console.log(`Button Class: ${ticketsAvailable.buttonClass}`);
            console.log(
              "The browser window is kept open for you to proceed with booking",
            );

            // Send Telegram alert - this is the key notification
            const alertMessage =
              `🚨 *TICKETS NOW AVAILABLE!* 🚨\n\n` +
              `*Match:* RCB vs ${opponentTeam}\n` +
              `*Date:* ${ticketsAvailable.date}\n` +
              `*Price:* ${ticketsAvailable.price}\n\n` +
              `Hurry! Go book your tickets now!\n` +
              `https://shop.royalchallengers.com/ticket`;

            // Send the alert message 3 times to ensure it's noticed
            await sendTelegramMessage(alertMessage);
            await sendTelegramMessage("⚠️ *URGENT: TICKETS AVAILABLE!* ⚠️");
            await sendTelegramMessage("⚠️ *URGENT: TICKETS AVAILABLE!* ⚠️");

            // Stop further monitoring
            return true;
          } else {
            console.log(ticketsAvailable.message || "Tickets not available");
            console.log(`Price (if shown): ${ticketsAvailable.price}`);
            return false;
          }
        } else {
          console.log(ticketsAvailable.message);
          return false;
        }
      } catch (error) {
        console.error("Error during scheduled check:", error);

        // If there's an error during the check, recreate the browser session
        try {
          if (browser) await browser.close();
        } catch (e) {}

        ({ browser, page } = await createBrowser());
        return false;
      }
    };

    // Start the first check
    isAvailable = await checkAvailability();

    // Set up interval for continuous checking if tickets aren't available yet
    if (!isAvailable) {
      const intervalMinutes = refreshInterval * 60 * 1000; // Convert minutes to milliseconds
      intervalId = setInterval(async () => {
        try {
          isAvailable = await checkAvailability();
          if (isAvailable) {
            // If tickets become available, stop the interval
            clearInterval(intervalId);
            console.log("\nMonitoring stopped. Tickets are now available!");
            await sendTelegramMessage(
              "✅ *Monitoring stopped*. Tickets are now available! Browser window kept open for booking.",
            );
          }
        } catch (error) {
          console.error("Error in interval handler:", error);
        }
      }, intervalMinutes);

      // Keep the script running
      console.log(`\nMonitoring continues every ${refreshInterval} minutes...`);
      console.log(
        "(The browser will remain open for you to interact with it when tickets become available)",
      );

      // Clean up on process exit (Ctrl+C)
      process.on("SIGINT", async () => {
        if (intervalId) clearInterval(intervalId);
        console.log("\nMonitoring stopped by user.");
        await sendTelegramMessage("🛑 *Monitoring stopped* by user request.");
        if (browser) await browser.close();
        process.exit(0);
      });
    }
  } catch (error) {
    console.error("An error occurred:", error);
    if (browser) await browser.close();
    return {
      error: error.message,
    };
  }
}

// Example usage with the team you want to monitor
//const targetTeam = "Chennai Super Kings";
const targetTeam = "Chennai Super Kings";
const refreshIntervalMinutes = 3;

// Start monitoring
monitorTicketAvailability(targetTeam, refreshIntervalMinutes);
