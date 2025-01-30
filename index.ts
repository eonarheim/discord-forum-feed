import { Client, Events, GatewayIntentBits, Message } from 'discord.js'
import stripEmoji from 'emoji-strip'
import { mightFail } from 'might-fail'
import { RateLimiterMemory } from 'rate-limiter-flexible'

if (
  !process.env.DISCORD_TOKEN ||
  !process.env.SERVER_ID ||
  !process.env.SOURCE_CHANNEL_ID ||
  !process.env.DESTINATION_CHANNEL_ID
) {
  throw new Error('Missing env variables')
}

const discordToken = process.env.DISCORD_TOKEN
const serverId = process.env.SERVER_ID
const sourceChannelId = process.env.SOURCE_CHANNEL_ID
const destinationChannelId = process.env.DESTINATION_CHANNEL_ID

const createMessageLink = (message: Message) =>
  `https://discord.com/channels/${serverId}/${message.channelId}`

const stripMentions = (content: string) => content.replace(/<@!?\d+>/g, '`@mention`')

const rateLimiter = new RateLimiterMemory({ points: 5, duration: 60 * 60 * 5 }) // 5 messages per 5 hours

let lastThreadId: string | null = null

export const connectDiscord = () => {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  client.once(Events.ClientReady, () => console.log(`Logged in to Discord as ${client.user?.tag}`))

  client.on(Events.MessageCreate, async message => {
    const [error, result] = await mightFail(rateLimiter.consume(message.channelId, 1))

    if (error) return

    const destinationChannel = await client.channels.fetch(destinationChannelId)
    if (!destinationChannel) return

    if (message.content.length === 0 && message.attachments.size === 0) return

    // @ts-expect-error
    if (message.channel.parentId === sourceChannelId) {
      const truncatedChannelName =
        // @ts-expect-error
        message.channel.name.length > 40
          ? // @ts-expect-error
            message.channel.name.slice(0, 35) + '[...]'
          : // @ts-expect-error
            message.channel.name

      if (lastThreadId !== message.channelId) {
        // @ts-expect-error
        await destinationChannel.send(
          `🧵 ${`[**${stripEmoji(
            truncatedChannelName
          ).trim()}**](<https://discord.com/channels/${serverId}/${message.channelId}>)`}`
        )
        lastThreadId = message.channelId
      }

      const truncatedContent =
        message.content.length > 200 ? message.content.slice(0, 195) + '[...]' : message.content

      const destinationMessage = `**${message.author.displayName}**: ${stripMentions(
        truncatedContent
      )}`

      // @ts-expect-error
      await destinationChannel.send({
        content: destinationMessage,
        files: message.attachments.map(attachment => ({ attachment: attachment.url })),
      })
      if (result.remainingPoints === 0) {
        // @ts-expect-error
        await destinationChannel.send(
          `Message forwarding for this [thread](<${createMessageLink(
            message
          )}>) is paused for a bit.`
        )
      }
    }
  })

  client.login(discordToken)

  return () => client.destroy()
}

Bun.serve({ fetch: () => new Response('ok') })

const disconnectDiscord = connectDiscord()

const cleanup = async () => {
  await disconnectDiscord()
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
