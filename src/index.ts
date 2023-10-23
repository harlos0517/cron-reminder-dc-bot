import '@/env'

import {
  ChannelType,
  Client,
  GatewayIntentBits,
  Message,
} from 'discord.js'
import cron from 'node-cron'

type Reminder = {
  cronExp: string
  content: string
  task: cron.ScheduledTask
}

const reminders: Map<string, Reminder> = new Map()

const CRON_CHANNEL_ID = process.env.CRON_CHANNEL_ID || ''
const REMINDER_CHANNEL_ID = process.env.REMINDER_CHANNEL_ID || ''

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.username}!`)
})

const getTextChannel = async(channelId: string) => {
  const channel = await client.channels.fetch(channelId)
  if (!channel)
    throw Error(`Channel ${channelId} not found!`)
  if (channel.type !== ChannelType.GuildText)
    throw Error(`Channel ${channelId} is not a text channel!`)
  return channel
}

const deleteReminderfromMessage = (message: Message) => {
  const reminder = reminders.get(message.id)
  if (!reminder) return
  reminder.task.stop()
  console.log(`Reminder "${reminder.content}" removed`)
  reminders.delete(message.id)
}

const updateReminder = async(message: Message) => {
  await message.reactions.removeAll()
  deleteReminderfromMessage(message)

  const [rawCronExp, reminderContent] = message.content.split('\n', 2)
  const cronExp = rawCronExp.slice(1, -1)
  if (
    !rawCronExp.startsWith('`') ||
    !rawCronExp.endsWith('`') ||
    !cron.validate(cronExp)
  ) {
    message.react('❌')
    return
  }


  const task = cron.schedule(cronExp, async() => {
    try {
      const reminderChannel = await getTextChannel(REMINDER_CHANNEL_ID)
      reminderChannel.send(reminderContent)
      console.log(`Reminder "${reminderContent}" sent`)
    } catch (err) {
      console.error(`Reminder "${reminderContent}" failed sending!`)
      console.error(err)
    }
  })
  reminders.set(message.id, {
    cronExp,
    content: reminderContent,
    task,
  })
  console.log(`Reminder "${reminderContent}" set`)
  message.react('✅')
}


client.on('messageUpdate', async(_oldMessage, newMessage) => {
  if (newMessage.channelId !== CRON_CHANNEL_ID) return
  updateReminder(await newMessage.fetch())
})

client.on('messageCreate', async message => {
  if (message.channelId !== CRON_CHANNEL_ID) return
  updateReminder(message)
})

client.on('messageDelete', async message => {
  if (message.channelId !== CRON_CHANNEL_ID) return
  deleteReminderfromMessage(message as Message)
})

;(async() => {
  await client.login(process.env.BOT_TOKEN)
  const cronChannel = await getTextChannel(CRON_CHANNEL_ID)
  const messages = await cronChannel.messages.fetch({ limit: 100 })
  messages.each(message => {
    updateReminder(message)
  })
})()
