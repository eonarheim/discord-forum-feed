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
  `https://discord.com/channels/${serverId}/${message.channelId}/${message.id}`

const stripMentions = (content: string) => content.replace(/<@!?\d+>/g, '`@mention`')

const rateLimiter = new RateLimiterMemory({ points: 6, duration: 60 * 60 * 4 }) // 6 messages per 4 hours

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

    // @ts-expect-error
    if (message.channel.parentId === sourceChannelId) {
      const truncatedChannelName =
        // @ts-expect-error
        message.channel.name.length > 30
          ? // @ts-expect-error
            message.channel.name.slice(0, 27) + '...'
          : // @ts-expect-error
            message.channel.name

      const truncatedContent =
        message.content.length > 300 ? message.content.slice(0, 297) + '...' : message.content

      const destinationMessage = `[${stripEmoji(truncatedChannelName)}](<${createMessageLink(
        message
      )}>) | **${message.author.username}**: ${stripMentions(truncatedContent)}`

      const destinationChannel = await client.channels.fetch(destinationChannelId)
      if (!destinationChannel) return
      // @ts-expect-error
      await destinationChannel.send(destinationMessage)
      if (result.remainingPoints === 0) {
        // @ts-expect-error
        await destinationChannel.send(
          `Message forwarding from this thread is paused for a bit, [check the full conversation](<${createMessageLink(
            message
          )}>).`
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
