const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { noEvidence } = require('../assets/images.js')

module.exports = {
data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('File a report against a miscreant! 📝')
    .addUserOption(option =>
        option.setName('offender')
        .setDescription('The user who you are reporting')
        .setRequired(true))
    .addStringOption(option =>
        option.setName('reason')
        .setDescription('What did they do?')
        .setRequired(true))
    .addAttachmentOption(option =>
        option.setName('evidence')
        .setDescription('Is there any evidence you\'d like to add?')
        .setRequired(false)
    ),

    async execute(interaction) {
        const offender = interaction.options.getUser('offender');
        const offense = interaction.options.getString('reason');
        const evidence = interaction.options.getAttachment('evidence');

        var reportEmbed;

        if(evidence) {
        reportEmbed = new EmbedBuilder()
            .setTitle('**INTERNAL REPORT FILED**')
            .setDescription(`A report has been filed against <@${offender.id}>.`)
            .addFields(
                {name: 'Offense', value: offense, inline: true},
                {name: 'Evidence', value: ''}
            )
            .setImage(evidence.url)
            .setFooter({text: 'This report is now under review.'})
            .setColor(0xff0000)
            .setTimestamp();
        } else {
            reportEmbed = new EmbedBuilder()
            .setTitle('**INTERNAL REPORT FILED**')
            .setDescription(`A report has been filed against <@${offender.id}>.`)
            .addFields(
                {name: 'Offense', value: offense, inline: true},
            )
            .setImage(noEvidence[Math.floor(Math.random() * noEvidence.length)])
            .setFooter({text: 'This report is now under review.'})
            .setColor(0xff0000)
            .setTimestamp();
        }

        interaction.reply( {embeds: [reportEmbed]});
    }
}