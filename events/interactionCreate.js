// events/interactionCreate.js
// voting system for jury
const { Events, EmbedBuilder, MessageFlags } = require("discord.js");
const { concludeTrial, updateTrialEmbed } = require("../commands/report");

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
      content: `Vote recorded: **${choice === "guilty" ? "Guilty" : "Not Guilty"}**.`,
      flags: MessageFlags.Ephemeral,
    });

    await updateTrialEmbed(interaction.client, reportId);

    // Early auto-conclude if a decisive threshold is reached (e.g., first to 5)
    if (trial.counts.guilty >= 5 || trial.counts.notguilty >= 5) {
      await concludeTrial(client, reportId);
    }
  },
};
