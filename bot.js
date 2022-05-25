require('dotenv').config()
const path = require('path')
const fs = require('fs')
const { readFile, writeFile, readdir } = require("fs").promises
const Telegraf = require('telegraf')
const TelegrafI18n = require('telegraf-i18n')
const Extra = require('telegraf/extra')
const AnyCase = require('telegraf-anycase-commands')
const mongoose = require('mongoose')
const { TelegrafMongoSession } = require('telegraf-session-mongodb')
const delay = require('delay')
const axios = require('axios')
const { GoogleSpreadsheet } = require('google-spreadsheet')
const creds = require('./weighty-obelisk-289112-9d724e80c44b.json')

// Constants
const URL = process.env.URL
const TOKEN = process.env.TOKEN
const BOTNAME = process.env.BOTNAME
const GROUP_ID = process.env.GROUP_ID
const MODERATORS = process.env.MODERATORS?.replace(' ', '').split(',').map(Number) || [ 123456789 ]
const ADMIN = MODERATORS[0]
console.log('MODERATORS', MODERATORS)

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

      if (users.length <= 0) {
        // ctx.reply('User not found :(')
        return false
      } else {
        return Promise.all(users.map(async user => {
          user = user.data
          
          return `
*ID: *${user.id} - [@${user.username}](https://t.me/${user.username})
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
      }
    }).catch((e) => {
      console.log(e)
    })
}

bot
  .hears(/^\/check[ =](.+)$/, ctx => getUser(ctx, ctx.match[1]))
  .hears(/^\/info[ =](.+)$/, ctx => getUser(ctx, ctx.match[1]))

// Custom buttons helpers for easy bots (or use telegraf-inline-menu library)
const singleButton = (text, action) => Extra.markdown().markup((m) => m.inlineKeyboard([[m.callbackButton(text || 'No text!', action || false)]]))
const twoButtons = (first_text, first_action, second_text, second_action) => Extra.webPreview(false).markdown().markup((m) => m.inlineKeyboard([[m.callbackButton(first_text, first_action), m.callbackButton(second_text, second_action)]]))
const twoMultilineButtons = (first_text, first_action, second_text, second_action) => Extra.webPreview(false).markdown().markup((m) => m.inlineKeyboard([[m.callbackButton(first_text, first_action)],[m.callbackButton(second_text, second_action)]]))
const buttonsWithURL = (anchor, url, button_text, button_action) => Extra.markdown().markup((m) => m.inlineKeyboard([[m.urlButton(anchor, url)], [m.callbackButton(button_text, button_action)]]))

let instructions = {}
let CLOSED = false

let langs = {
  "en": "🇺🇸 English",
  "ru": "🇷🇺 Русский",
  "es": "🇪🇸 Español",
  "id": "🇮🇩 Bahasa Indonesia",
  "pt": "🇵🇹 Português",
  "vi": "🇻🇳 Tiếng Việt"
}

const parseGoogle = async (url = 'https://docs.google.com/spreadsheets/d/1ZuRuV8K1kj5J03uoupLLdinzibooZl93OqQDRSAquVk/edit#gid=0') => {
  // bot.telegram.sendMessage(ADMIN, 'Парсим гугл').catch(e => console.log(e))
  let temp = {}
  try {
    let id = /\/([\w-_]{15,})\/(.*?gid=(\d+))?/.exec(url)
    const doc = new GoogleSpreadsheet(id[1])
    await doc.useServiceAccountAuth(creds)
    await doc.loadInfo()

    let sheet = await doc.sheetsByIndex[1]
    let categories = await sheet.getRows();
    let catNames = {}
    Object.keys(langs).forEach(lang => catNames[lang] = {})
    categories.forEach((row, index) => {
      catNames.ru[row.KEY] = row.RU
      catNames.en[row.KEY] = row.EN
      catNames.es[row.KEY] = row.ES
      catNames.vi[row.KEY] = row.VI
      catNames.pt[row.KEY] = row.PT
      catNames.id[row.KEY] = row.ID
    })

    sheet = await doc.sheetsByIndex[0]
    let articles = await sheet.getRows();
    let device = 'browser'
    let category = 'none'

    Object.keys(langs).forEach(lang => temp[lang] = [])
    CLOSED = false
    articles.forEach((row, index) => {
      if (row.device) device = row.device.toLowerCase();
      if (row.category) category = row.category;
      if (row.state === 'OFF') CLOSED = true
      Object.keys(langs).forEach(lang => {
        let langlink = `${lang}_link`
        if (row[langlink]) {
          temp[lang].push({
            id: index,
            device: device,
            category: catNames[lang][category],
            title: row[lang],
            link: row[langlink]
          })
        }
      })

    })

    if (Object.keys(temp).length > 0)
      await writeFile('instructions.json', JSON.stringify(temp))

  } catch (e) {
    console.log(e)
  }

  return temp
}

const getUserArticles = (ctx) => instructions[ctx.i18n.locale()]?.filter(item => item.device === ctx.session.device) || []
const getUserCategories = (ctx) => [...new Set(instructions[ctx.i18n.locale()]?.filter(item => item.device === ctx.session.device).map(item => item.category))] || []

const list = async (ctx, category = 'none', markdown = true) => {
  let mark = Extra.webPreview(false)
  if (markdown) mark = mark.markdown()
  else mark = mark.HTML()
  
  let buttons = []

  if (Object.keys(instructions).length <= 0) instructions = await parseGoogle()
  let articles = getUserArticles(ctx).filter(item => item.category === category)

  if (articles.length === 0)
    return changeDevice(ctx)
  
  articles.map(item => buttons.push(ib(item.title, `link_${item.id}`)))
  
  buttons.push([
    { text: ctx.i18n.t('buttons.back'), callback_data: 'back' },
  ])

  return mark.markup((m) => m.inlineKeyboard(buttons))
}

const categories = async (ctx, markdown = true) => {
  let mark = Extra.webPreview(false)
  if (markdown) mark = mark.markdown()
  else mark = mark.HTML()
  
  let buttons = []

  if (Object.keys(instructions).length <= 0) instructions = await parseGoogle()
  let articles = getUserCategories(ctx)

  if (articles.length === 0)
    return changeDevice(ctx)
  
  articles
    .map((item, index) => buttons.push(ib(item, `category_${index}`)))
  
  buttons.push([
    { text: ctx.i18n.t('buttons.back'), callback_data: 'changeDevice' },
    { text: ctx.i18n.t('buttons.changeLang'), callback_data: 'changeLang' }
  ])

  if (isModerator(ctx.session.id)) buttons.push(ib('Скачать обновки с гугла', 'refresh'))

  return mark.markup((m) => m.inlineKeyboard(buttons))
}

// Main menu

const changeDevice = (ctx) => ctx.reply(ctx.i18n.t('mainMenu') + '\n\n' + ctx.i18n.t('device'), twoButtons(ctx.i18n.t('buttons.browser'), 'browser', ctx.i18n.t('buttons.mobile'), 'mobile'))

const main = async (ctx) => {
  if (!ctx.session.device) return changeDevice(ctx)
  ctx.reply('*' + ctx.i18n.t('category') + ':*', await categories(ctx)).catch(e => console.log(e))
}

// Command and other
AnyCase.apply(bot)

// Bot start, actions, commands
let session
bot.use((...args) => session.middleware(...args))
bot.use(i18n.middleware())
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
      if (ctx?.update?.message?.forward_from || ctx?.update?.message?.forward_sender_name || ctx?.update?.message?.forward_from_chat) {
        if (ctx.session.send_mode) {
          ctx.session.send_message = ctx.message
          return ctx.reply(`Сообщение выше ^^^^.\n\nФильтр рассылки: "*${ctx.session.send_mode}*"\nПодходящих пользователей: *${ctx.session.send_users}*\n\nВы готовы?`, singleButton('Начать рассылку!', 'send_spam'))
        } else {
          if (!(await getUser(ctx, (ctx.update.message.forward_from && ctx.update.message.forward_from.id) || ctx.update.message.forward_sender_name)))
            return ctx.reply('У вас не выбран режим рассылки!\n\nДля начала введите команду /send_to_all, /send_to_ru, /send_to_en и другие...')
        }
      }
    }
  }

  if (CLOSED)
    return ctx.reply(ctx.i18n.t('errors.mainterance'), isModerator(ctx.session.id) ? singleButton('Скачать обновки с гугла', 'refresh') : null)

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
const toLangs = (ctx) => {
  let buttons = []
  Object.keys(langs).forEach((lang, index) => { 
    if (instructions[lang].length > 0)
      buttons.push(ib(Object.values(langs)[index], lang))
  })
  ctx.replyWithMarkdown('*Choose language:*', 
    Extra
      .webPreview(false)
      .markdown()
      .markup((m) => m.inlineKeyboard(buttons))
  )
}

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
  .action(Object.keys(langs), ctx => {
    ctx.i18n.locale(ctx.match)
    ctx.answerCbQuery('Ok!')
    return main(ctx)
  })
  .action(['browser', 'mobile'], ctx => {
    ctx.session.device = ctx.match
    ctx.answerCbQuery('Ok!')
    return main(ctx)
  })
  .action(/category_(.+)/, async ctx => {
    return ctx.reply('*' + ctx.i18n.t('instruction') + ':*', await list(ctx, getUserCategories(ctx)[ctx.match[1]])).catch(e => console.log(e))
  })
  .action(/link_(.+)/, ctx => {
    try {
      const article = getUserArticles(ctx).filter(item => item.id === parseInt(ctx.match[1]))[0]
      ctx.reply(`*${article.title}*\n\n${article.link}`, singleButton(ctx.i18n.t('buttons.back'), 'back'))
    } catch (e) {
      ctx.reply(ctx.i18n.t('errors.somethingWrong'), singleButton(ctx.i18n.t('buttons.back'), 'back'))
    }
  })
  .action('changeLang', (ctx) => toLangs(ctx))
  .action('changeDevice', (ctx) => changeDevice(ctx))
  .action('refresh', async ctx => {
    ctx.answerCbQuery('Скачиваем!')
    instructions = await parseGoogle()
    await ctx.reply('Для подгрузки превью введите команду /preview')
    return main(ctx)
  })
  .action('back', async ctx => {
    ctx.reply('*' + ctx.i18n.t('category') + ':*', await categories(ctx)).catch(e => console.log(e))
  })
  .command('preview', async ctx => {
    let links = []
    await Promise.all(Object.values(instructions).map(lang => {
      links = [...links, ...lang.map(item => item.link)]
    }))
    links.forEach(async (link, index) => {
      await delay(300 * index)
      console.log(link)
      ctx.reply(link)
    })
  })
  .command('stats', async ctx => {
    const stats = await axios('https://api.dex.guru/v3/tokens/search/0X7DACC2327528A99AA1DE0C1F757539A9A2380C04%20?network=bsc').then(r => r.data.data[0])
    console.log(stats)
    ctx.replyWithMarkdown(`
Contract: \`0x7dAcc2327528A99aa1De0C1F757539A9A2380c04\`

Transactions (24h): *${stats.txns24h.toFixed(0)}*
Transactions change (24h): *${stats.txns24hChange.toFixed(2)}*

Trading volume (24h): *${stats.volume24hUSD.toFixed(2)}*
Trading volume change (24h): *${stats.volumeUSDChange24h.toFixed(2)}%*

Liquidity USD: *${stats.liquidityUSD.toFixed(2)}*
Liquidity change USD: *${stats.liquidityUSDChange24h.toFixed(2)}%*

Price USD: *${stats.priceUSD.toFixed(2)}*
Price change (24h): *${stats.priceUSDChange24h.toFixed(2)}%*`,
      Extra.markdown().markup((m) => m.inlineKeyboard([
        [m.urlButton('Dex.guru', 'https://dex.guru/token/0x7dacc2327528a99aa1de0c1f757539a9a2380c04-bsc'),
        m.urlButton('DexTools', 'https://www.dextools.io/app/bsc/pair-explorer/0x8430f8f2ebb56ff6729616b0f80ba0d36823ed9a')],
        [m.urlButton('BscScan', 'https://bscscan.com/address/0x7dacc2327528a99aa1de0c1f757539a9a2380c04')],
        [m.urlButton('CoinGecko', 'https://www.coingecko.com/ru/%D0%9A%D1%80%D0%B8%D0%BF%D1%82%D0%BE%D0%B2%D0%B0%D0%BB%D1%8E%D1%82%D1%8B/international-blockchain-technology')],
        [m.urlButton('CoinMarketCap', 'https://coinmarketcap.com/currencies/international-blockchain-technology')]
      ]))
    )
    const pools = await axios('https://api.x314.info/get/pools', { method: 'GET' }).then(r => r.data)
    console.log('pools', pools)
    const stakes = pools?.find(p => p.id === 1)?.stakes?.filter(s => s.stakeIndex === 0)?.length?.toString() || null
    console.log('stakes', stakes)
    ctx.reply(`Unique stakes: ${stakes}`)
  })

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

// Сендер
const getUsers = async (mode) => {
  let users = []
  if (mode === 'all')
    users = await Users.find({'data.id': { $ne: null }}).sort('registered_at').select('data.id').then(users => [...new Set(users.map(user => user.data.id))])
  if (Object.keys(langs).includes(mode))
    users = await Users.find({
      'data.id': { $ne: null },
      'data.__language_code': mode
    }).sort('registered_at').select('data.id').then(users => [...new Set(users.map(user => user.data.id))])
  if (parseInt(mode) > 0)
    users = await Users.find({ 'data.id': parseInt(mode) }).select('data.id').then(users => [...new Set(users.map(user => user.data.id))])
  return users
}

bot.hears(/^\/send_to_([a-z\d]*)[ =]*([\n\s]*.+)*$/, async ctx => {
  let mode = ctx.match[1]
  console.log(ctx.message.text)
  let message = ctx.message.text.replace(/^\/send_to_([a-z\d]*)[ =]*/g, '')
  console.log(message)
  if(isModerator(ctx.from.id)) {
    ctx.reply('Выбран режим "' + mode + '", собираем базу...')
    let users = await getUsers(mode)
    ctx.session.send_mode = mode
    ctx.session.send_users = users.length
    if (message.length > 5) {
      console.log(message)
      ctx.session.send_message = message
      return ctx.reply(`Фильтр рассылки: "*${ctx.session.send_mode}*"\nПодходящих пользователей: *${ctx.session.send_users}*\nСообщение:\n\n${message}\n\nВы готовы?`, singleButton('Начать рассылку!', 'send_spam'))
    }
    return ctx.reply(`Найдено ${users.length} подходящих под фильтр "${mode}" пользователей.\n\nСверстайте и перешлите в бот сообщение, которое хотите им разослать. Бот создаст его точную копию и начнет рассылку, как только получит подтверждение, что вы готовы.`)
  }
  ctx.reply('Не хватает прав для этой команды!')
})

bot.action('send_spam', async ctx => {
  ctx.deleteMessage()
  let users = await getUsers(ctx.session.send_mode)
  return Promise.all(users.map(async (id, index) => {
    await delay(100 * index)
    let send_to = process.env.NODE_ENV === 'development1'
      ? ctx.from.id
      : id

    if (typeof ctx.session.send_message === "string")
      return bot.telegram.sendMessage(send_to, ctx.session.send_message, singleButton('OK »', 'back'))
        .then(msg => {
          console.log(send_to,': отправлено')
          return { chat_id: send_to, msg_id: msg.message_id }
        })
        .catch(e => {
          return false
        })  
    return bot.telegram.sendCopy(send_to, ctx.session.send_message)
    .then(msg => {
      console.log(send_to,': отправлено')
      return { chat_id: send_to, msg_id: msg.message_id }
    })
    .catch(e => {
      return false
    })
  })).then(values => {
    values = values.filter(Boolean)
    return MODERATORS.map(user => bot.telegram.sendMessage(user.id, `Рассылка закончена!\nПолучили: *${values.length}*\nОшибок: *${(users.length - values.length)}*`, singleButton('OK »', 'back')))
  })
})

// All other messages
bot.use(async (ctx) => {
  if (ctx?.update?.message?.chat.id < 0)
    return
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
    try {
      instructions = JSON.parse(fs.readFileSync('instructions.json'))
      if (Object.keys(instructions).length <= 0) instructions = await parseGoogle()
      setInterval(async () => {
        instructions = await parseGoogle()
      }, 1000 * 60 * 60)

    } catch (e) {
      bot.telegram.sendMessage(ADMIN, e.message).catch(e => console.log(e))
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