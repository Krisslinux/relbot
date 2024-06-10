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
        // Ensure a trailing slash for the webhook URL
        const webhookUrl = process.env.YOUR_HEROKU_APP_URL.endsWith('/')
            ? process.env.YOUR_HEROKU_APP_URL + bot.secretPathComponent()
            : process.env.YOUR_HEROKU_APP_URL + '/' + bot.secretPathComponent();

        bot.telegram.setWebhook(webhookUrl);
        console.log(`Webhook set to: ${webhookUrl}`);
    }
});


bot.start((ctx) => ctx.reply('Send me an Instagram Reels link!'));

// ... (Rest of your bot.on 'text' handler and other logic) ...
