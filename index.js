import puppeteer from "puppeteer";
import fetch from "node-fetch";
import http from "http";

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

// Global variables to track last check time
let lastCheckTime = null;
let lastCheckResult = null;
let checkCount = 0;
let monitoringStartTime = null;

// Function to format date in a human-readable way
function formatDate(date) {
  if (!date) return "Not available";

  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  };

  return new Date(date).toLocaleString("en-US", options);
}

// Function to get time elapsed since last check
function getTimeElapsedSinceLastCheck() {
  if (!lastCheckTime) return "No checks performed yet";

  const now = new Date();
  const elapsed = now - new Date(lastCheckTime);

  // Convert to minutes and seconds
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);

  if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""} and ${seconds} second${seconds !== 1 ? "s" : ""} ago`;
  } else {
    return `${seconds} second${seconds !== 1 ? "s" : ""} ago`;
  }
}

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
  // Set monitoring start time
  monitoringStartTime = new Date();

  // Validate the input team
  if (!iplTeams.includes(opponentTeam)) {
    console.log(`Warning: "${opponentTeam}" may not be a valid IPL team name.`);
    console.log(`Valid teams are: ${iplTeams.join(", ")}`);
    console.log("Continuing with the search anyway...\n");
  }

  let browser = null;
  let page = null;
  let isAvailable = false;
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
      const currentTime = new Date();
      lastCheckTime = currentTime;

      console.log(
        `\n[${currentTime.toLocaleTimeString()}] Check #${checkCount}: Refreshing page...`,
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

        // Save the result
        lastCheckResult = ticketsAvailable;

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

// Set up a dummy HTTP server to keep the service running and respond to health checks
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  // Set CORS headers to allow access from anywhere
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Get monitoring status information with human-readable date
  const monitoringStatus = {
    status: "active",
    monitoring: "RCB tickets",
    team: targetTeam,
    refreshInterval: refreshIntervalMinutes,
    lastCheck: lastCheckTime
      ? formatDate(lastCheckTime)
      : "No checks performed yet",
    lastCheckISO: lastCheckTime ? lastCheckTime.toISOString() : null,
    timeElapsed: getTimeElapsedSinceLastCheck(),
    checksPerformed: checkCount,
    monitoringSince: monitoringStartTime
      ? formatDate(monitoringStartTime)
      : "Not started",
    ticketsAvailable: lastCheckResult?.available || false,
    matchStatus: lastCheckResult?.status || "Unknown",
  };

  // Handle basic routes
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.write(`
      <html>
        <head>
          <title>RCB Ticket Monitor</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
            h1 { color: #E42629; } /* RCB red */
            .status-box { background-color: #f8f9fa; border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .tickets-available { background-color: #FFF9C4; border: 1px solid #FFC107; font-weight: bold; }
            .data-grid { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
            .label { font-weight: bold; }
            .refresh-btn { background-color: #E42629; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; }
            .refresh-btn:hover { background-color: #C62023; }
          </style>
          <meta http-equiv="refresh" content="60">
        </head>
        <body>
          <h1>RCB Ticket Monitor Service</h1>
          
          <div class="status-box ${lastCheckResult?.available ? "tickets-available" : ""}">
            <h2>Monitor Status: ${lastCheckResult?.available ? "🚨 TICKETS AVAILABLE!" : "✅ Active"}</h2>
            <div class="data-grid">
              <div class="label">Team:</div>
              <div>RCB vs ${targetTeam}</div>
              
              <div class="label">Check Frequency:</div>
              <div>Every ${refreshIntervalMinutes} minutes</div>
              
              <div class="label">Last Check:</div>
              <div>${monitoringStatus.lastCheck}</div>
              
              <div class="label">Time Since Last Check:</div>
              <div>${monitoringStatus.timeElapsed}</div>
              
              <div class="label">Checks Performed:</div>
              <div>${monitoringStatus.checksPerformed}</div>
              
              <div class="label">Monitoring Since:</div>
              <div>${monitoringStatus.monitoringSince}</div>
              
              ${
                lastCheckResult
                  ? `
                <div class="label">Match Status:</div>
                <div>${lastCheckResult.status || (lastCheckResult.available ? "TICKETS AVAILABLE" : "Not Available")}</div>
                
                ${
                  lastCheckResult.date
                    ? `
                  <div class="label">Match Date:</div>
                  <div>${lastCheckResult.date}</div>
                `
                    : ""
                }
                
                ${
                  lastCheckResult.price
                    ? `
                  <div class="label">Price:</div>
                  <div>${lastCheckResult.price}</div>
                `
                    : ""
                }
              `
                  : ""
              }
            </div>
          </div>
          
          <p>This page auto-refreshes every 60 seconds. <button class="refresh-btn" onclick="window.location.reload()">Refresh Now</button></p>
          
          <h3>API Endpoints:</h3>
          <ul>
            <li><code>/health</code> - Get monitor status in JSON format</li>
            <li><code>/</code> - This status page</li>
          </ul>
        </body>
      </html>
    `);
  } else if (req.url === "/health" || req.url === "/status") {
    // Health check endpoint
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify(monitoringStatus));
  } else {
    // Not found
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.write("404 Not Found");
  }

  res.end();
});

// Example usage with the team you want to monitor
const targetTeam = "Chennai Super Kings";
const refreshIntervalMinutes = 3;

// Start the HTTP server
server.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
  console.log(`Status page available at http://localhost:${PORT}/`);

  // Start monitoring
  monitorTicketAvailability(targetTeam, refreshIntervalMinutes);
});
