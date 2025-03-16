import { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, Routes } from 'discord.js';
import dotenv from 'dotenv';
import axios from 'axios';
import { load } from 'cheerio';
import { REST } from '@discordjs/rest';

// 1️⃣ Load environment variables from .env in the project root
dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ ERROR: Missing required environment variables. Check your .env file.");
  process.exit(1);
}

// 2️⃣ Channel ID mappings (optional if you want to auto-post to certain channels)
const backendChannelMap = {
  python: process.env.PYTHON_CHANNEL_ID,
  cpp: process.env.CPP_CHANNEL_ID,
  clang: process.env.CLANG_CHANNEL_ID,
  java: process.env.JAVA_CHANNEL_ID,
  golang: process.env.GOLANG_CHANNEL_ID,
  databases: process.env.DATABASES_CHANNEL_ID,
  rust: process.env.RUST_CHANNEL_ID
};

const frontendChannelMap = {
  javascript: process.env.JAVASCRIPT_CHANNEL_ID,
  react: process.env.REACT_CHANNEL_ID,
  nextjs: process.env.NEXTJS_CHANNEL_ID,
  node: process.env.NODE_CHANNEL_ID,
  typescript: process.env.TYPESCRIPT_CHANNEL_ID
};

// 3️⃣ Backend doc URLs
const backendDocsUrls = {
  python: 'https://docs.python.org/3/',
  cpp: 'https://en.cppreference.com/w/',
  clang: 'https://clang.llvm.org/docs/index.html',
  java: 'https://docs.oracle.com/en/java/javase/17/docs/api/index.html',
  golang: 'https://golang.org/doc/',
  databases: 'https://www.mongodb.com/docs/manual/',
  rust: 'https://doc.rust-lang.org/std/'
};

// 4️⃣ Frontend doc URLs
const frontendDocsUrls = {
  javascript: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
  react: 'https://react.dev/docs/getting-started',
  nextjs: 'https://nextjs.org/docs',
  node: 'https://nodejs.org/en/docs',
  typescript: 'https://www.typescriptlang.org/docs/'
};

// 5️⃣ Junk patterns to ignore while scraping
const junkPatterns = [
  /^theme$/i, /^auto$/i, /^light$/i, /^dark$/i,
  /^navigation$/i, /^index$/i, /^modules$/i,
  /^previous topic$/i, /^next topic$/i, /^show source$/i,
  /^report a bug$/i, /^changelog$/i, /^\s*$/
];

// 6️⃣ Thumbnail mappings for styling the embed
const backendThumbnails = {
  python: 'https://www.python.org/static/community_logos/python-logo.png',
  cpp: 'https://isocpp.org/assets/images/cpp_logo.png',
  clang: 'https://clang.llvm.org/images/clang-logo.svg',
  java: 'https://www.oracle.com/a/ocom/img/cb71-java-logo.png',
  golang: 'https://blog.golang.org/go-brand/Go-Logo/PNG/Go-Logo_Aqua.png',
  databases: 'https://www.mongodb.com/assets/images/global/mongodb-logo-white.png',
  rust: 'https://www.rust-lang.org/logos/rust-logo-512x512.png'
};

const frontendThumbnails = {
  javascript: 'https://upload.wikimedia.org/wikipedia/commons/6/6a/JavaScript-logo.png',
  react: 'https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg',
  nextjs: 'https://nextjs.org/static/favicon/favicon-32x32.png',
  node: 'https://nodejs.org/static/images/logo.svg',
  typescript: 'https://www.typescriptlang.org/icons/icon-48x48.png'
};

// ==============================
// HELPER FUNCTIONS FOR SCRAPING
// ==============================

/**
 * extractLinks($, baseUrl) - Finds all internal links on the doc page.
 */
function extractLinks($, baseUrl) {
  let foundLinks = [];
  $('a').each((_, el) => {
    let href = $(el).attr('href');
    if (href) {
      // Convert relative -> absolute
      if (href.startsWith('/')) {
        href = baseUrl.replace(/\/+$/, '') + href;
      } else if (!/^https?:\/\//i.test(href)) {
        href = baseUrl.replace(/\/+$/, '') + '/' + href;
      }
      // Only keep links that start with baseUrl
      if (href.startsWith(baseUrl)) {
        foundLinks.push(href);
      }
    }
  });
  return foundLinks;
}

/**
 * extractRelevantSnippet(fullText, query) - Finds lines matching query and keeps some context lines.
 */
function extractRelevantSnippet(fullText, query) {
  const lines = fullText
    .split('\n')
    .map(line => line.trim())
    .filter(line => !junkPatterns.some(pattern => pattern.test(line)));

  const matchedIndices = [];
  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes(query.toLowerCase())) {
      matchedIndices.push(idx);
    }
  });

  const keepSet = new Set();
  matchedIndices.forEach(idx => {
    for (let i = Math.max(0, idx - 2); i <= idx + 2 && i < lines.length; i++) {
      keepSet.add(i);
    }
  });

  const keptLines = Array.from(keepSet).sort((a, b) => a - b).map(i => lines[i]);
  let snippet = keptLines.join('\n');
  if (snippet.length > 1000) {
    snippet = snippet.substring(0, 1000) + "... [Read more]";
  }
  return snippet;
}

/**
 * fetchCompleteDocumentation(baseUrl, query) - Scrapes multiple pages for the query.
 */
async function fetchCompleteDocumentation(baseUrl, query) {
  try {
    const { data: mainData } = await axios.get(baseUrl);
    let pagesToScrape = [baseUrl];
    let results = [];

    const $main = load(mainData);
    const mainText = $main('body').text().trim();
    if (mainText.toLowerCase().includes(query.toLowerCase())) {
      results.push({ url: baseUrl, text: mainText });
    }
    const links = extractLinks($main, baseUrl);
    pagesToScrape.push(...links);

    const uniqueLinks = [...new Set(pagesToScrape)];
    const pagePromises = uniqueLinks.map(async (link) => {
      try {
        const { data } = await axios.get(link);
        const $page = load(data);
        const text = $page('body').text().trim();
        if (text.toLowerCase().includes(query.toLowerCase())) {
          return { url: link, text };
        }
      } catch (err) {
        console.error(`❌ Error fetching ${link}: ${err.message}`);
      }
      return null;
    });

    const pages = await Promise.all(pagePromises);
    const matchedPages = pages.filter(Boolean);

    // Score & sort by occurrences
    matchedPages.forEach(page => {
      const count = (page.text.match(new RegExp(query, 'gi')) || []).length;
      page.count = count;
    });
    matchedPages.sort((a, b) => b.count - a.count);

    let combinedText = '';
    const topPages = matchedPages.slice(0, 5);
    for (const page of topPages) {
      const snippet = extractRelevantSnippet(page.text, query);
      if (snippet) {
        combinedText += `**From [Click here for more information](${page.url}):**\n${snippet}\n\n`;
      }
    }

    return combinedText || '❌ No relevant documentation found.';
  } catch (error) {
    console.error("❌ Error in fetchCompleteDocumentation:", error);
    return '❌ Failed to retrieve documentation.';
  }
}

// =====================
// DISCORD BOT SETUP
// =====================

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Build slash commands for both backend & frontend docs
const commandsData = [
  new SlashCommandBuilder()
    .setName('docs')
    .setDescription('Fetches backend documentation.')
    .addStringOption(option =>
      option.setName('language')
        .setDescription('One of: python, cpp, clang, java, golang, databases, rust')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Search term for documentation')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('frontenddocs')
    .setDescription('Fetches frontend documentation.')
    .addStringOption(option =>
      option.setName('topic')
        .setDescription('One of: javascript, react, nextjs, node, typescript')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Search term for documentation')
        .setRequired(true))
].map(cmd => cmd.toJSON());

// Register slash commands
const restAPI = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('🔄 Registering slash commands...');
    await restAPI.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commandsData });
    console.log('✅ Slash commands registered successfully.');
  } catch (error) {
    console.error('❌ Error registering slash commands:', error);
    process.exit(1);
  }
})();

// Helper to get the docs URL & channel ID based on command and key
function getDocsUrl(commandName, key) {
  if (commandName === 'docs') {
    return backendDocsUrls[key];
  } else if (commandName === 'frontenddocs') {
    return frontendDocsUrls[key];
  }
  return null;
}

function getChannelId(commandName, key) {
  if (commandName === 'docs') {
    return backendChannelMap[key];
  } else if (commandName === 'frontenddocs') {
    return frontendChannelMap[key];
  }
  return null;
}

// =====================
// COMMAND HANDLERS
// =====================

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;
  
  // Defer reply so we have more time to process
  await interaction.deferReply();

  if (commandName === 'docs') {
    const language = interaction.options.getString('language');
    const query = interaction.options.getString('query');

    // Validate language
    if (!backendDocsUrls[language]) {
      return interaction.editReply({ content: '❌ Invalid backend language.' });
    }

    const baseUrl = getDocsUrl('docs', language);
    let docsText = await fetchCompleteDocumentation(baseUrl, query);

    // Truncate if needed
    if (docsText.length > 4096) {
      docsText = docsText.slice(0, 4000) + "... [Truncated]";
    }

    // Build the embed with enhanced styling
    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Documentation Bot', iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png' })
      .setTitle(`📜 ${language.toUpperCase()} Documentation`)
      .setDescription(`**🔍 Search Term:** \`${query}\`\n\n${docsText}`)
      .setColor(0x0099ff)
      .setThumbnail(backendThumbnails[language] || null)
      .setImage(backendThumbnails[language] || null)
      .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

    // Check if the command was issued in the correct channel
    const expectedChannelId = getChannelId('docs', language);
    if (interaction.channelId !== expectedChannelId && expectedChannelId) {
      // Forward the embed to the expected channel
      try {
        const offTopicChannel = await client.channels.fetch(expectedChannelId);
        if (offTopicChannel) {
          await offTopicChannel.send({ embeds: [embed] });
          return interaction.editReply({ content: `This question is off-topic for this channel. The answer has been forwarded to <#${expectedChannelId}>.`, embeds: [] });
        }
      } catch (err) {
        console.error(`❌ Error fetching target channel: ${err.message}`);
      }
    }
    // If already in the correct channel or unable to forward, reply here.
    await interaction.editReply({ embeds: [embed] });

  } else if (commandName === 'frontenddocs') {
    const topic = interaction.options.getString('topic');
    const query = interaction.options.getString('query');

    // Validate topic
    if (!frontendDocsUrls[topic]) {
      return interaction.editReply({ content: '❌ Invalid frontend topic.' });
    }

    const baseUrl = getDocsUrl('frontenddocs', topic);
    let docsText = await fetchCompleteDocumentation(baseUrl, query);

    // Truncate if needed
    if (docsText.length > 4096) {
      docsText = docsText.slice(0, 4000) + "... [Truncated]";
    }

    // Build the embed with enhanced styling
    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Documentation Bot', iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png' })
      .setTitle(`📜 ${topic.toUpperCase()} Documentation`)
      .setDescription(`**🔍 Search Term:** \`${query}\`\n\n${docsText}`)
      .setColor(0x0099ff)
      .setThumbnail(frontendThumbnails[topic] || null)
      .setImage(frontendThumbnails[topic] || null)
      .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

    // Check if the command was issued in the correct channel
    const expectedChannelId = getChannelId('frontenddocs', topic);
    if (interaction.channelId !== expectedChannelId && expectedChannelId) {
      // Forward the embed to the expected channel
      try {
        const offTopicChannel = await client.channels.fetch(expectedChannelId);
        if (offTopicChannel) {
          await offTopicChannel.send({ embeds: [embed] });
          return interaction.editReply({ content: `This question is off-topic for this channel. The answer has been forwarded to <#${expectedChannelId}>.`, embeds: [] });
        }
      } catch (err) {
        console.error(`❌ Error fetching target channel: ${err.message}`);
      }
    }
    // If already in the correct channel or unable to forward, reply here.
    await interaction.editReply({ embeds: [embed] });
  }
});

client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}!`);
});

client.login(TOKEN).catch(err => {
  console.error("❌ ERROR: Invalid bot token!");
  process.exit(1);
});
