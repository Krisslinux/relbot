const { Telegraf } = require('telegraf');
const axios = require('axios');
const instagramGetUrl = require('instagram-url-direct');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const express = require('express');
const app = express(); // Initialize Express
const { IgApiClient } = require('instagram-private-api');


// Load environment variables with error handling
try {
    require('dotenv').config();
} catch (err) {
    console.error("Error loading environment variables:", err);
    process.exit(1); 
}

// Create Telegram bot instance
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Webhook Setup (for Heroku)
app.use(bot.webhookCallback(`/${bot.secretPathComponent()}`));
app.listen(process.env.PORT || 3000, async () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
    //Set Webhook on Start. Only when running on Heroku.
    if(process.env.NODE_ENV === "production") {
        // Exponential backoff for webhook setup
        let retryDelay = 1000; // Initial retry delay in milliseconds
        const maxRetryDelay = 60000; // Maximum retry delay

        while (true) {
          try {
            await bot.telegram.setWebhook(process.env.YOUR_HEROKU_APP_URL + `/${bot.secretPathComponent()}`);
            console.log(`Webhook set to: ${process.env.YOUR_HEROKU_APP_URL + `/${bot.secretPathComponent()}`}`);
            break; // Exit the loop on success
          } catch (error) {
            if (error.response && error.response.status === 429) {
              console.warn("Rate limited: Retrying webhook setup after", retryDelay, "ms");
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              retryDelay = Math.min(retryDelay * 2, maxRetryDelay); // Double the delay, up to the max
            } else {
              console.error("Error setting webhook:", error);
              // Handle other errors if needed
              break;
            }
          }
        }
    }
});


// Initialize Instagram API Client
const ig = new IgApiClient();

// Instagram Login (async IIFE)
(async () => {
    ig.state.generateDevice(process.env.INSTAGRAM_USERNAME);
    await ig.simulate.preLoginFlow();
    try {
        await ig.account.login(process.env.INSTAGRAM_USERNAME, process.env.INSTAGRAM_PASSWORD);
    } catch (err) {
        console.error("Error logging into Instagram:", err);
        process.exit(1); 
    }
})();

// Telegram Bot Commands
bot.start((ctx) => ctx.reply('Send me an Instagram Reels link!'));

bot.on('text', async (ctx) => {
    const reelsUrl = ctx.message.text;
    const tempFilePath = path.join(__dirname, 'temp_reels.mp4'); 
    const caption = "Reposted from Telegram bot"; 

    try {
        const directUrl = await instagramGetUrl(reelsUrl); 
        
        // Download the Reels media
        const response = await axios({
            method: 'get',
            url: directUrl,
            responseType: 'stream'
        });
        response.data.pipe(fs.createWriteStream(tempFilePath));

        // Repost to Instagram 
        exec(`ffmpeg -i ${tempFilePath} -vf "pad=ih*16/9:ih:(ow-iw)/2:(oh-ih)/2,scale='min(1080,iw)':min'(1920,ih)':force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"  output.mp4`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error formatting video: ${error.message}`);
                ctx.reply("Error formatting the video.");
                return;
            }
            console.log('Video formatted successfully!');
            (async () => {
                const publishResult = await ig.publish.video({
                    //video: tempFilePath, // Path to your video file
                    video: './output.mp4',
                    caption: caption
                });

                ctx.replyWithHTML(`Reels reposted successfully!  \n\n<b><a href="${publishResult.media.product_type === "feed" ? "https://www.instagram.com/p/" + publishResult.media.code : latestMedia[0].image_versions2.candidates[0].url}">View it on your Instagram profile</a></b>`);
                fs.unlinkSync(tempFilePath); // Delete the temporary file
                fs.unlinkSync("output.mp4");
            })();
        });

    } catch (error) {
        console.error('Error reposting Reels:', error);
        ctx.reply('Sorry, there was an error reposting the Reels.');
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath); 
        }
    }
});
