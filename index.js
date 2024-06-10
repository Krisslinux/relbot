const { Telegraf } = require('telegraf');
const axios = require('axios');
const instagramGetUrl = require('instagram-url-direct');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const express = require('express');
const app = express(); // Initialize Express

// Load environment variables with error handling
try {
    require('dotenv').config();
} catch (err) {
    console.error("Error loading environment variables:", err);
    process.exit(1); 
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Webhook Setup (for Heroku)
app.use(bot.webhookCallback(`/${bot.secretPathComponent()}`));
app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
    //Set Webhook on Start. Only when running on Heroku.
    if(process.env.NODE_ENV === "production") {
        bot.telegram.setWebhook(process.env.YOUR_HEROKU_APP_URL + `/${bot.secretPathComponent()}`);
        console.log(`Webhook set to: ${process.env.YOUR_HEROKU_APP_URL + `/${bot.secretPathComponent()}`}`);
    }
});
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
            exec(`instabot-py --login ${process.env.INSTAGRAM_USERNAME} --password ${process.env.INSTAGRAM_PASSWORD} post_video --video output.mp4 --caption "${caption}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error posting to Instagram: ${error.message}`);
                    ctx.reply("Error posting to Instagram.");
                    return;
                }
                ctx.replyWithHTML('Reels reposted successfully!  \n\n<b><a href="https://www.instagram.com/${process.env.INSTAGRAM_USERNAME}">View it on your Instagram profile</a></b>');
                fs.unlinkSync(tempFilePath); // Delete the temporary file
                fs.unlinkSync("output.mp4");
            });
        });

    } catch (error) {
        console.error('Error reposting Reels:', error);
        ctx.reply('Sorry, there was an error reposting the Reels.');
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath); 
        }
    }
});


// Start the bot (it will use polling on Replit and webhooks on Heroku)
//bot.launch(); 
