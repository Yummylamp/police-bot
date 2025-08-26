// commands/report.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
} = require("discord.js");
const { noEvidence, innocent, guilty } = require("../assets/images.js");

// ====== tweakables ======
const TRIAL_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const JAIL_ROLE_NAME = "Jail 👮🚔";     // the role to add on conviction
const JAIL_DURATION_MS = 24 * 60 * 60 * 1000; // time in conviction role
// ========================

function getOrInitTrials(client) {
  if (!client.trials) client.trials = new Map(); // reportId -> trialState
  return client.trials;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("report")
    .setDescription("File a report against a miscreant! 📝")
    .addUserOption((option) =>
      option
        .setName("offender")
        .setDescription("The user who you are reporting")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("What did they do?")
        .setRequired(true)
    )
    .addAttachmentOption((option) =>
      option
        .setName("evidence")
        .setDescription("Is there any evidence you'd like to add?")
        .setRequired(false)
    ),

  async execute(interaction) {
    const offender = interaction.options.getUser("offender");
    const offense = interaction.options.getString("reason");
    const evidence = interaction.options.getAttachment("evidence");

    const reportId  = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const closesAt  = Date.now() + TRIAL_DURATION_MS;      // ms
    const endTsSec  = Math.floor(closesAt / 1000);         // seconds for Discord <t:...>

    // Build the report embed
    const reportEmbed = new EmbedBuilder()
      .setTitle("**INTERNAL REPORT FILED**")
      .setDescription(
        `A report has been filed against <@${offender}>.\n\n` +
        `**Offense:** ${offense}`
      )
      .addFields({name: `<a:time:1409680128874909857> Voting ends:`, value: `<t:${endTsSec}:R>`})
      .addFields({ name: "Guilty", value: "0", inline: true },
                 { name: "Not Guilty", value: "0", inline: true },)
      .setImage(
        evidence
          ? evidence.url
          : noEvidence[Math.floor(Math.random() * noEvidence.length)]
      )
      .setFooter({
    text: '⚖️ This report is now under review.'}) // timer
      .setColor(0xff0000)
      .setTimestamp();

    // Buttons for the jury
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`trial_guilty:${reportId}`)
        .setLabel("Guilty")
        .setEmoji("🚔")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`trial_notguilty:${reportId}`)
        .setLabel("Not Guilty")
        .setEmoji("🕊️")
        .setStyle(ButtonStyle.Success)
    );

    // Send the message to the channel
    const msg = await interaction.reply({ embeds: [reportEmbed], components: [row], fetchReply: true });

    // Track the trial in memory
    const trials = getOrInitTrials(interaction.client);
    trials.set(reportId, {
      guildId: interaction.guildId,
      channelId: msg.channelId,
      messageId: msg.id,
      offenderId: offender.id,
      reporterId: interaction.user.id,
      reason: offense,
      votes: new Map(), // userId -> 'guilty' | 'notguilty'
      counts: { guilty: 0, notguilty: 0 },
      closesAt: Date.now() + TRIAL_DURATION_MS,
      closed: false,
    });

    // Auto-close timer
    setTimeout(async () => {
      const trial = trials.get(reportId);
      if (!trial || trial.closed) return;
      await concludeTrial(interaction.client, reportId);
    }, TRIAL_DURATION_MS);
  },
};


async function updateTrialEmbed(client, reportId) {
  const trials = client.trials;
  const t = trials?.get(reportId);
  if (!t) return;

  const channel = await client.channels.fetch(t.channelId).catch(() => null);

  const msg = await channel.messages.fetch(t.messageId).catch(() => null);
  if (!msg) return;

  const endTs = Math.floor(t.closesAt / 1000);
  const guilty = t.counts.guilty;
  const notguilty = t.counts.notguilty;
  const total = Math.max(guilty + notguilty, 1);

  // cute little progress bar (optional)
  const BAR_LEN = 12;
  const gBars = Math.round((guilty / total) * BAR_LEN);
  const bar = "█".repeat(gBars) + "░".repeat(BAR_LEN - gBars);

  // Start from existing embed (keeps title, color, image, footer, timestamp)
  const base = EmbedBuilder.from(msg.embeds[0] ?? new EmbedBuilder());

  // Refresh description (keeps offender + countdown)
  base.setDescription(
    `A report has been filed against <@${t.offenderId}>.\n\n` +
    `**Offense:** ${t.reason}`
  );

  // Replace fields so counts stay in fixed places
  base.setFields(
    { name: "<a:time:1409680128874909857> Voting Ends:", value: `<t:${endTs}:R>\n`, inline: false },
    { name: "Guilty", value: String(guilty), inline: true },
    { name: "Not Guilty", value: String(notguilty), inline: true },
    { name: '', value: `${bar}`}
  );

  await msg.edit({ embeds: [base] }).catch(() => {});
}
module.exports.updateTrialEmbed = updateTrialEmbed;



async function concludeTrial(client, reportId) {
  const trials = client.trials;
  const trial = trials?.get(reportId);
  if (!trial || trial.closed) return;
  trial.closed = true;

  const guild = await client.guilds.fetch(trial.guildId).catch(() => null);
  if (!guild) return;

  const channel = await client.channels.fetch(trial.channelId).catch(() => null);
  if (!channel) {
    console.log('channel not found');
    return;}

  // Fetch the original message to disable buttons
  const msg = await channel.messages.fetch(trial.messageId).catch(() => null);
  if (msg) {
    const disabledRow = msg.components.map((row) => {
      const newRow = ActionRowBuilder.from(row);
      newRow.components = newRow.components.map((c) =>
        ButtonBuilder.from(c).setDisabled(true)
      );
      return newRow;
    });
    await msg.edit({ components: disabledRow }).catch(() => {});
  }

  const { guilty: guiltyCount, notguilty } = trial.counts;
  let verdict = "Hung Jury";
  let convicted = false;
  let releaseTs = null;

    if (guiltyCount > notguilty) {
      verdict = "GUILTY";
      convicted = true;
    }
  if (notguilty > guiltyCount) {
    verdict = "NOT GUILTY";
  }

  // Apply Jail role on conviction (if possible)
  if (convicted) {
    const member = await guild.members.fetch(trial.offenderId);
    const jailRole = await ensureJailRole(guild);
    await member.roles.add(jailRole, trial.reason);

    const releaseAt = Date.now() + JAIL_DURATION_MS;
    releaseTs = Math.floor(releaseAt / 1000);
  }

  // Post the verdict
  const verdictEmbed = new EmbedBuilder()
    .setTitle("🧑‍⚖️ Trial Concluded")
    .setColor(verdict == 'GUILTY' ? Colors.DarkRed : Colors.Green)
    .setDescription(
      `**Verdict:** ${verdict}\n\n**Offender:** <@${trial.offenderId}>\n**Reporter:** <@${trial.reporterId}>\n**Offense:** ${trial.reason}`
    )
    .addFields(
      { name: "Guilty", value: String(guiltyCount), inline: true },
      { name: "Not Guilty", value: String(notguilty), inline: true },
      convicted ? { name: "Release Date", value: `<t:${releaseTs}:R> (<t:${releaseTs}:T>)`, inline: true } : {}
    ).setThumbnail('https://i.pinimg.com/736x/be/c7/a1/bec7a13873db255ab767e85495fa649f.jpg')
    .setImage(
        !convicted
          ? innocent[Math.floor(Math.random() * innocent.length)]
          : guilty[Math.floor(Math.random() * guilty.length)])
    .setTimestamp();

  await channel.send({ embeds: [verdictEmbed] }).catch(() => {});
  trials.delete(reportId);

  // release from jail after time served
  setTimeout(async () => {
  try {
    const freshGuild = await client.guilds.fetch(trial.guildId);
    const member = await freshGuild.members.fetch(trial.offenderId);
    const jailRoleAgain = freshGuild.roles.cache.find(r => r.name === JAIL_ROLE_NAME);
    if (jailRoleAgain) {
      await member.roles.remove(jailRoleAgain, "Time served");
    }
  } catch (_) { /* ignore */ }
}, JAIL_DURATION_MS);
}

module.exports.concludeTrial = concludeTrial;


async function ensureJailRole(guild) {
  let jailRole = guild.roles.cache.find(r => r.name === JAIL_ROLE_NAME);
  if (!jailRole) {
    jailRole = await guild.roles.create({
      name: JAIL_ROLE_NAME,
      color: 0x6b7280,      // distinct grey
      hoist: true,          // display separately in member list
      mentionable: false,
      permissions: [],      // keep empty; don't grant perms accidentally
      reason: "YummyPolice jail role",
    });
  } else {
    // make sure it's hoisted + colored
    if (!jailRole.hoist || jailRole.color === 0) {
      await jailRole.edit({ hoist: true, color: 0x6b7280 }).catch(() => {});
    }
  }

  // Put Jail just under the bot’s top role (as high as we’re allowed)
  const botTop = guild.members.me.roles.highest;
  const targetPos = Math.max(botTop.position - 1, 1);
  if (jailRole.position !== targetPos) {
    await jailRole.setPosition(targetPos).catch(() => {});
  }

  return jailRole;
}