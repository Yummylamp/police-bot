// commands/report.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require("discord.js");
const { noEvidence } = require("../assets/images.js");

// ====== tweakables ======
const TRIAL_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const JAIL_ROLE_NAME = "Jail 👮🚔";     // the role to add on conviction
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
      .setDescription(`A report has been filed against <@${offender.id}>.`)
      .addFields({ name: "Offense", value: offense, inline: true })
      .addFields({name: `<a:time:1409680128874909857> Voting ends:`, value: `<t:${endTsSec}:R>`})
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

  const { guilty, notguilty } = trial.counts;
  let verdict = "Hung Jury";
  let convicted = false;

    if (guilty > notguilty) {
      verdict = "GUILTY";
      convicted = true;
    }
  if (notguilty > guilty) {
    verdict = "NOT GUILTY";
  }

  // Apply Jail role on conviction (if possible)
  if (convicted) {
    try {
      const member = await guild.members.fetch(trial.offenderId);
      let jailRole =
        guild.roles.cache.find((r) => r.name === JAIL_ROLE_NAME) ||
        (await guild.roles.create({
          name: JAIL_ROLE_NAME,
          color: "#6b7280",
          reason: "YummyPolice bot verdict",
          permissions: [], // customize if you want to restrict
        }));

      // Make sure bot can manage roles
      const me = guild.members.me;
      if (
        me.permissions.has(PermissionsBitField.Flags.ManageRoles) &&
        jailRole.position < me.roles.highest.position
      ) {
        await member.roles.add(jailRole, "Convicted by the jury");
      }
    } catch (e) {
        console.log('ERROR! I do not have permission to arrest anyone!');
    }
  }

  // Post the verdict
  const verdictEmbed = new EmbedBuilder()
    .setTitle("🧑‍⚖️ Trial Concluded")
    .setDescription(
      `**Verdict:** ${verdict}\n**Offender:** <@${trial.offenderId}>\n**Reporter:** <@${trial.reporterId}>\n**Reason:** ${trial.reason}`
    )
    .addFields(
      { name: "Guilty", value: String(guilty), inline: true },
      { name: "Not Guilty", value: String(notguilty), inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [verdictEmbed] }).catch(() => {});
  trials.delete(reportId);

  // (Optional) persist outcome to DB here
  // await saveVerdictToDB({ reportId, verdict, counts: trial.counts, ... })
}

module.exports.concludeTrial = concludeTrial;
