require('dotenv').config()
const path = require('path')
const Telegraf = require('telegraf')
const TelegrafI18n = require('telegraf-i18n')
const Stage = require('telegraf/stage')
const WizardScene = require('telegraf/scenes/wizard')
const Extra = require('telegraf/extra')
const AnyCase = require('telegraf-anycase-commands')
const mongoose = require('mongoose')
const { TelegrafMongoSession } = require('telegraf-session-mongodb')
const delay = require('delay')
const axios = require('axios')

// Constants
const URL = process.env.URL
const TOKEN = process.env.TOKEN
const BOTNAME = process.env.BOTNAME
const GROUP_ID = process.env.GROUP_ID
const MODERATORS = process.env.MODERATORS?.split(',') || [ 123456789 ]
const ADMIN = MODERATORS[0]
const isModerator = (id) => MODERATORS.includes(id)

// Languages
const i18n = new TelegrafI18n({
  defaultLanguage: 'en',
  useSession: true,
  defaultLanguageOnMissing: true,
  directory: path.resolve(__dirname, 'locales')
})

// Production bot
const production = new Telegraf(process.env.NODE_ENV == 'development' ? process.env.PRODUCTION_TOKEN : process.env.TOKEN)

// Create sessions and database connect
mongoose.connect(`mongodb+srv://${process.env.DBUSER}:${process.env.DBPASSWORD}@${process.env.DBCLUSTER}.mongodb.net/${process.env.DBNAME}?retryWrites=true&w=majority`, { useNewUrlParser: true, useUnifiedTopology: true }).then(res => { console.log('Database connected') }).catch(error => console.log(error))
const db = mongoose.connection
const Users = mongoose.model('Session', new mongoose.Schema({ key: { type: String }, data: Object }))

// Telegram group notifier, add bot and give rules to your group
const notify = (msg) => {
  if (GROUP_ID) axios.post('https://api.telegram.org/bot' + TOKEN + '/sendMessage', { chat_id: GROUP_ID, text: msg, disable_web_page_preview: false, reply_markup: {} }).catch((e) => {})
}

// Generate code (captcha or other verification)
const randomInt = (value) => Math.floor(Math.random() * value)
const getCode = () => Array.from({length: 6}, () => randomInt(10)).join('')

// Only Date
const withZero = (i) => i < 10 ? `0${i}` : i
Date.prototype.onlyDate = function(){
  return withZero(this.getDate()) +
  "." + withZero(this.getMonth() + 1) + 
  "." + withZero(this.getFullYear() - 2000)
}

// Chank big arrays
const chunk = (array, size) => {
  const chunked_arr = []
  let index = 0
  while (index < array.length) {
    chunked_arr.push(array.slice(index, size + index))
    index += size
  }
  return chunked_arr
}

// Count form for specific languages
const countForm = (number, titles) => {
  number = Math.abs(number)
  if (Number.isInteger(number)) {
    const cases = [2, 0, 1, 1, 1, 2]  
    return titles[ (number%100>4 && number%100<20)? 2 : cases[(number%10<5)?number%10:5] ]
  }
  return titles[1]
}

// Find dublicates in array
const findDuplicates = (arr) => {
  let sorted_arr = arr.slice().sort()
  let results = []
  for (let i = 0; i < sorted_arr.length - 1; i++) {
    if (sorted_arr[i + 1] == sorted_arr[i]) {
      results.push(sorted_arr[i])
    }
  }
  return results
}

// Create bot
const bot = new Telegraf(TOKEN)

// Admin functions
const ib = (text, callback_data) => !callback_data ? { text: text } : [{ text: text, callback_data: callback_data }]
const userButtons = (user, markdown = true) => {
  let actions = []
  actions.push(ib('User button', 'action_' + user.id))

  if (markdown)
    return Extra.markdown().markup((m) => m.inlineKeyboard(actions))
  else
    return Extra.HTML().markup((m) => m.inlineKeyboard(actions))
}

const getUser = (ctx, id) => {
  try {
    keyword = id.toString().replace('@', '')
  } catch (e) {}

  return Users.find({'data.id': { $ne: null },
    $or: [
      { 'data.id': parseInt(keyword) || null },
      { 'data.first_name': keyword },
      { 'data.last_name': keyword },
      { 'data.username': keyword }
    ]})
    .then(users => {
      users = users.filter(user => user.data.id)

      if (users.length <= 0)
        return ctx.reply('User not found :(')

      return Promise.all(users.map(async user => {
        user = user.data
        
        return `
*ID:* ${user.id} - [@${user.username}](https://t.me/${user.username})
Name: \`${user.first_name} ${user.last_name || ''}\` ${user.language_code ? ('(' + user.language_code + ')') : ''}

Register: ${user.registered_at.toString().replace('GMT+0500 ', '')}
Active: ${user.active_at.toString().replace('GMT+0500 ', '')}

`
      })).then(values => {
        values.map(msg => {
          ctx.replyWithMarkdown(msg, users.length === 1 ? userButtons(users[0].data) : Extra.markdown())
            .catch((e) => {
              console.log(e)
              ctx.reply(msg, Extra.HTML())
            })
        })
      })
    }).catch((e) => {
      console.log(e)
    })
}

bot
  .hears(/^\/check[ =](.+)$/, ctx => getUser(ctx, ctx.match[1]))
  .hears(/^\/info[ =](.+)$/, ctx => getUser(ctx, ctx.match[1]))

// Custom buttons helpers for easy bots (or use telegraf-inline-menu library)
const singleButton = (text, action) => Extra.webPreview(false).markdown().markup((m) => m.inlineKeyboard([[m.callbackButton(text || 'No text!', action || false)]]))
const twoButtons = (first_text, first_action, second_text, second_action) => Extra.webPreview(false).markdown().markup((m) => m.inlineKeyboard([[m.callbackButton(first_text, first_action), m.callbackButton(second_text, second_action)]]))
const twoMultilineButtons = (first_text, first_action, second_text, second_action) => Extra.webPreview(false).markdown().markup((m) => m.inlineKeyboard([[m.callbackButton(first_text, first_action)],[m.callbackButton(second_text, second_action)]]))

const buttons = (ctx, markdown = true) => {
  let mark = Extra.webPreview(false)
  mark = markdown ? mark.markdown() : mark.HTML()

  return mark.markup((m) => m.inlineKeyboard([
    [m.callbackButton(ctx.i18n.t('buttons.wizard'), 'wizard'), m.callbackButton(ctx.i18n.t('buttons.getPhoto'), 'getPhoto')],
    [m.callbackButton(ctx.i18n.t('buttons.alert'), 'alert')],
    [m.callbackButton(ctx.i18n.t('buttons.changeLang'), 'changeLang')]
  ]))
}

const buttonsWithURL = (anchor, url, button_text, button_action) => Extra.markdown().markup((m) => m.inlineKeyboard([[m.urlButton(anchor, url)], [m.callbackButton(button_text, button_action)]]))

// Main menu
const main = (ctx) => ctx.reply(ctx.i18n.t('mainMenu'), buttons(ctx))

const wizardExample = new WizardScene('wizardExample',
  (ctx) => {
    ctx.replyWithMarkdown('Question 1? Input answer:', singleButton(ctx.i18n.t('buttons.continue'), 'skip'))
    ctx.wizard.next()
  },
  async (ctx) => {
    try {
      const data = ctx.message.text.trim().toLowerCase()
      if (data) {
        ctx.replyWithMarkdown(`*You message:* \`\`\`${data}\`\`\``)
        ctx.wizard.next()
      } else {
        throw new Error('Debug message!')
      }
    } catch (e) {
      ctx.reply(ctx.i18n.t('errors.somethingWrong'))
    }
  },
  async (ctx) => {
    await ctx.reply('Message 2')
    ctx.scene.leave()
  })
  .action('skip', ctx => {
    ctx.replyWithMarkdown('You skip question!')
    ctx.scene.leave()
  })
  .leave(ctx => {
    ctx.reply('Wizard scene leave!')
  })

// Command and other
const stage = new Stage([ wizardExample ])
AnyCase.apply(bot)

// Bot start, actions, commands
let session
bot.use((...args) => session.middleware(...args))
bot.use(i18n.middleware())
bot.use(stage.middleware())
bot.use(async (ctx, next) => {
  const start = new Date()
  
  if (ctx.session && !ctx.session.id && (ctx.chat && ctx.chat.id && ctx.chat.id !== 'ch' && ctx.from && ctx.from.id)) {
    // Create session
    ctx.session.key = `${ctx.chat.id}:${ctx.from.id}`
    ctx.session.id = ctx.from.id || ctx.chat.id
    if (ctx.session.username)
      ctx.session.username = ctx.from.username
    if (ctx.from.first_name)
      ctx.session.first_name = ctx.from.first_name
    if (ctx.from.last_name)
      ctx.session.last_name = ctx.from.last_name
    ctx.session.registered_at = new Date()
    ctx.session.language_code = ctx.from.language_code
    ctx.session.code = getCode()
  } else {
    // Update userdata
    ctx.session.active_at = new Date()
    if (ctx.session.username !== ctx.from.username)
      ctx.session.username = ctx.from.username
    if (ctx.session.first_name !== ctx.from.first_name)
      ctx.session.first_name = ctx.from.first_name
    if (ctx.session.last_name !== ctx.from.last_name)
      ctx.session.last_name = ctx.from.last_name

    // User forward and finder
    if (isModerator(ctx.session.id)) {
      if (ctx.update && ctx.update.message && (ctx.update.message.forward_from || ctx.update.message.forward_sender_name))
        return getUser(ctx, (ctx.update.message.forward_from && ctx.update.message.forward_from.id) || ctx.update.message.forward_sender_name)
    }
  }

  return next()
    .then(() => {
      const ms = new Date() - start
      console.log('response time %sms', ms)
    })
})

// Develop usefull commands
bot
  .command('session', ctx => !isModerator(ctx.from.id)
    ? ctx.reply(ctx.i18n.t('errors.notAdmin'))
    : ctx.reply(Object.keys(ctx.session).reduce((acc, key) => `${acc}/${key} - ${ctx.session[key]}\n`, '')))
  .command('scene', ctx => !isModerator(ctx.from.id)
    ? ctx.reply(ctx.i18n.t('errors.notAdmin'))
    : (ctx.session.__scenes && ctx.session.__scenes.current)
      ? ctx.reply(Object.keys(ctx.session.__scenes).reduce((acc, key) => `${acc}/${key} - ${JSON.stringify(ctx.session.__scenes[key])}\n`, ''))
      : ctx.reply('Scene undefined!'))
  .command('clear', async ctx => !isModerator(ctx.from.id)
    ? ctx.reply(ctx.i18n.t('errors.notAdmin'))
    : await Users.deleteMany({ 'data.id': ctx.from.id }).then(() => {
      delete ctx.session
      bot.telegram.sendMessage(ctx.from.id, 'You session cleared, input or click /start to start again!')
    }))

// Lang switcher
const langsList = ['ru', 'en']
const toLangs = (ctx) => ctx.replyWithMarkdown('🇷🇺 Выберите язык / Choose language 🇬🇧', Extra
  .webPreview(false).markdown()
  .markup((m) => m.inlineKeyboard([
    [
      m.callbackButton('🇷🇺 Русский', 'ru'),
      m.callbackButton('🇺🇸 English', 'en')
    ],
    // [
    //   m.callbackButton('🇪🇸 Español', 'es'),
    //   m.callbackButton('🇮🇩 Indonesia', 'id')
    // ],
    // [
    //   m.callbackButton('🇵🇹 Português', 'pt')
    // ]
  ])))

// Actions
bot
  .start(async (ctx) => {
    console.log(ctx.session.username, ctx.session.id, ' send /start')
    
    // Referral system by ID
    // if (ctx.startPayload && parseInt(ctx.startPayload) > 0
    //   && !ctx.session.leader
    //   && (parseInt(ctx.startPayload) !== parseInt(ctx.session.id))
    // ) {
    //   ctx.session.leader = parseInt(ctx.startPayload)
    //   ctx.session.leaderUsername = await Users.findOne({ 'data.id': parseInt(ctx.session.leader) }).then(user => user.data.username)
    //   console.log(`${ctx.session.leader} invites ${ctx.session.username}`)
    // }

    if (!ctx.session.lang)
      return toLangs(ctx)
  })
  .action(langsList, ctx => {
    ctx.i18n.locale(ctx.match)
    return main(ctx)
  })
  .action('wizard', (ctx) => {
    return ctx.scene.enter('wizardExample')
  })
  .action('alert', (ctx) => {
    return ctx.answerCbQuery('message!')
  })
  .action('getPhoto', async (ctx) => {
    let mark = buttons(ctx)
    mark.caption = `photo *description* _italic_`
    return ctx.replyWithPhoto(`https://picsum.photos/640/480`, mark)
  })
  .action('back', (ctx, next) => {
    ctx.scene.leave()
    return next()
  })
  .action('changeLang', (ctx) => toLangs(ctx))

// Telegram command settings (dropdown on interface or input)
bot.settings(async (ctx) => {
  let commands = [{ command: '/start', description: 'Start over' }]
  await ctx.setMyCommands(commands)
})

// Telegram help function
bot.help(async (ctx) => {
  let commands = await ctx.getMyCommands()
  const info = commands.reduce((acc, val) => `${acc}/${val.command} - ${val.description}\n\n`, '')
  return ctx.reply(info)
})

// All other messages
bot.use(async (ctx) => {
  return main(ctx)
})

// Catch any error
bot.catch(error => console.log('telegraf error', error.response, error.parameters, error.on || error))

// Load sessions and start bot
db.once('open', async () => {
  session = new TelegrafMongoSession(db, { collectionName: 'sessions', sessionName: 'session' })
  if (session) {
    console.log('Sessions database connected!')
    if (URL) {
      let webhook = await bot.telegram.setWebhook(URL + '/' + process.env.WEBHOOK)
      bot.telegram.sendMessage(ADMIN, 'Bot reloaded (webhook)!').catch(e => console.log(e))
    } else {
      bot.startPolling()
      bot.telegram.sendMessage(ADMIN, 'Bot start polling!').catch(e => console.log(e))
      // Sometimes you may want UP you current production bot
      // production.telegram.sendMessage(ADMIN, 'Bot polling mode!')
    }
  } else {
    console.error('Session database error!')
  }
})

module.exports = {
  bot: bot,
  production: production,
  Users: Users
}