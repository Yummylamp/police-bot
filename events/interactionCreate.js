// events/interactionCreate.js
// voting system for jury
const { Events, EmbedBuilder, MessageFlags } = require("discord.js");
const { concludeTrial } = require("../commands/report"); // import helper

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;

    // match customIds like: trial_guilty:12345-678
    const match = interaction.customId.match(/^trial_(guilty|notguilty):(.+)$/);
    if (!match) return;

    const [, choice, reportId] = match;
    const client = interaction.client;
    const trials = client.trials;
    const trial = trials?.get(reportId);
    if (!trial) {
      return interaction.reply({ content: "This trial no longer exists.", ephemeral: true });
    }
    if (trial.closed || Date.now() > trial.closesAt) {
      // close if somehow expired
      await concludeTrial(client, reportId);
      return interaction.reply({ content: "The trial has already concluded.", ephemeral: true });
    }

    // Enforce one vote per user (they can change votes though)
    const previous = trial.votes.get(interaction.user.id);
    if (previous === choice) {
      return interaction.reply({ content: `You already voted **${choice.replace("notguilty", "not guilty")}**.`, ephemeral: true });
    }

    // Update counts
    if (previous) {
      trial.counts[previous]--;
    }
    trial.votes.set(interaction.user.id, choice);
    trial.counts[choice]++;

    // Acknowledge + show live tally
    await interaction.reply({
      content: `Vote recorded: **${choice === "guilty" ? "Guilty" : "Not Guilty"}**.\nCurrent tally — Guilty: **${trial.counts.guilty}**, Not Guilty: **${trial.counts.notguilty}**.`,
      flags: MessageFlags.Ephemeral,
    });

    // (Optional) live-update the original embed footer with a mini tally
    try {
      const guild = await client.guilds.fetch(trial.guildId);
      const channel = await guild.channels.fetch(trial.channelId);
      const msg = await channel.messages.fetch(trial.messageId);
      const embed = EmbedBuilder.from(msg.embeds[0]);
      embed.setFooter({
        text: `Under review • Guilty: ${trial.counts.guilty} | Not Guilty: ${trial.counts.notguilty} • Ends soon`,
      });
      await msg.edit({ embeds: [embed] });
    } catch (_) {}

    // Early auto-conclude if a decisive threshold is reached (e.g., first to 5)
    if (trial.counts.guilty >= 5 || trial.counts.notguilty >= 5) {
      await concludeTrial(client, reportId);
    }
  },
};
