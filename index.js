const express = require('express')
const minify = require('express-minify')
const path = require('path')
const cookieParser = require('cookie-parser')
const morgan = require('morgan')
const cors = require('cors')
const delay = require('delay')
// const axios = require('axios')
// const forceSsl = require("force-ssl-heroku");

const { bot, production, Users } = require('./bot')
const { default: axios } = require('axios')
const URL = process.env.URL;
const PORT = process.env.PORT || 3000;

const app = express()

app
  .use(minify())
  // .use(forceSsl)
  .use(express.static(path.join(__dirname, 'public')))
  // .use('/fontawesome', express.static(__dirname + '/node_modules/@fortawesome/fontawesome-free/'))
  .use('/bulma', express.static(__dirname + '/node_modules/bulma/css/'))
  .use('/css', express.static(path.join(__dirname, 'public/css')))
  .use('/js', express.static(path.join(__dirname, 'public/js')))
  .use(bot.webhookCallback('/' + process.env.WEBHOOK))
  .use(cors())
  .options('*', cors())
  .use(morgan('combined', {
    skip: function (req, res) { return res.statusCode < 400 }
  }))
  .use(express.json())
  .use(express.urlencoded({ extended: true }))
  .use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", '*')
    res.header("Access-Control-Allow-Credentials", true)
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    res.header("Access-Control-Allow-Headers", 'Origin,X-Requested-With,Content-Type,Accept,content-type,application/json')
    next()
  })
  .use(cookieParser())
  .set('view engine', 'pug')
  .set('views', './src/views')

app
  .get('/', async (req, res) => {
    stats = await axios('https://api.dex.guru/v3/tokens/search/0X7DACC2327528A99AA1DE0C1F757539A9A2380C04%20?network=bsc').then(r => r.data.data[0])
    res.render('index', { stats: stats })
  })
  .get('/:id', (req, res) => {
    return Users
      .findOne({ 'data.id': parseInt(req.params.id) })
      .then(async user => {
        res.render('user', { user: user?.data || null })
      })
      .catch(e => {
        res.render('user')
      })
  })

  .get('/:id/:message', (req, res) => {
    return Users
      .findOne({ 'data.id': parseInt(req.params.id) })
      .then(async user => {
        if (user) {
          let id = parseInt(req.params.id)
          bot.telegram
            .sendMessage(id, req.params.message || 'Some message')
            .then(msg => {
              res.render('user', { message: 'Success!', user: user.data  })
            })
            .catch(e => {
              res.render('user', { message: 'User block!', user: user.data  })
            })
        } else {
          res.send('User not found!')
        }
      })
  })
  .use(function(req, res, next) {
    next()
  })
  .use(function(err, req, res, next) {  
    res.status( err.code || 500 )
    .json({
      status: 'error',
      message: err.message
    })
  })

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Example app listening on port ${PORT}!`)
})