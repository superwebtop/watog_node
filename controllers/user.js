const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { validationResult } = require('express-validator/check')
const randomstring = require('randomstring')
const Sequelize = require('sequelize')

const User = require('../models/user')
const Post = require('../models/post')
const Verify = require('../models/verify')
const EmailCtrl = require('./email')
const SmsCtrl = require('./sms')

const Op = Sequelize.Op

const signup = async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: false,
      error: errors.array()
    })
  }

  const hash = await bcrypt.hash(req.body.password, 8)

  const user = new User({
    ...req.body,
    password: hash,
    settings: `{"notifications":{"vote":true,"participate":true,"spam_mark":true}}` // default setting
  })
  let data
  try {
    const res = await user.save()
    data = res.get({plain: true})
    // Remove password
    delete data.password
  } catch (e) {
    // Remove password
    let errors
    if (e.errors) {
      errors = e.errors.map(err => {
        delete err.instance
        return err
      })
    }

    return res.status(500).send({
      status: false,
      error: errors || e
    })
  }

  res.send({
    status: true,
    data
  })
}

const login = async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(401).json({
      status: false,
      error: 'Invalid email or password!'
    })
  }

  const { email, password } = req.body

  const _user = await User.findOne({ where: {
    [Op.or]: [{
      email
    }, {
      user_name: email
    }]
  } })

  if (!_user) {
    return res.status(401).json({
      status: false,
      error: 'Invalid email or password!'
    })
  }

  const user = _user.get({plain: true})

  // Check password
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({
      status: false,
      error: 'Invalid email or password!'
    })
  }

  // TODO: Include only email for now
  const token = jwt.sign({email}, process.env.JWT_SECRET)

  // prevent user's password to be returned
  delete user.password
  res.send({
    status: true,
    data: {
      token,
      user
    }
  })
}

const checkAuth = async (req, res, next) => {
  const token = req.get('Authorization')
  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch (err) {
    console.error(err)
    return res.status(401).send({
      status: false,
      error: 'Invalid Authorization'
    })
    // err
  }

  req.currentUser = await User.findOne({ where: { email: decoded.email } })

  if (req.currentUser) {
    next()
  } else {
    console.error('Valid JWT but no user:', decoded)
    res.send({
      status: false,
      error: 'Invalid User'
    })
  }
}

const getMe = async (req, res) => {
  const { currentUser } = req
  const profile = currentUser.get({
    plain: true
  })
  delete profile.password
  // Screen - https://xd.adobe.com/view/ee55407e-335b-4af6-5267-f70e85f9b552-9864/screen/01041a99-bf7b-4e0f-a5b8-9335ee702275/WATOGApp-MyProfil
  // TODO: https://xd.adobe.com/view/ee55407e-335b-4af6-5267-f70e85f9b552-9864/screen/01041a99-bf7b-4e0f-a5b8-9335ee702275/WATOGApp-MyProfil
  // TODO: rank - https://stackoverflow.com/questions/33900750/sequelize-order-by-count-association

  // Calculate Rank
  const rank = await User.count({
    where: {
      vote_score: {
        [Op.gt]: currentUser.vote_score
      }
    }
  })

  profile.vote_rank = rank + 1

  // Find Best Ranked photo
  const good_posts = await Post.findAll({
    where: {
      user_id: currentUser.id
    },
    order: [ 'up_vote_count'],
    limit: 5
  })

  profile.good_posts = good_posts

  res.send({
    status: true,
    data: profile
  })
}

const getUser = async (req, res) => {
  // TODO: limit access for fields: https://gitlab.com/watog-app/sql-nodejs/issues/1
  const user = await User.findById(req.params.id)

  if (!user) {
    return res.status(400).send({
      status: false,
      error: 'No such user with id:' + req.params.id
    })
  }

  const userObj = user.get({
    plain: true
  })

  delete userObj.password
  res.send({
    status: true,
    data: userObj
  })
}

const queryUsers = async (req, res) => {
  // TODO: query condition should be defined in route
  // TODO: limit access to users
  // TODO: should add sort option
  const allowed_queries = ['limit', 'offset', 'first_name', 'last_name', 'country', 'hospital', 'name']
  const query = {...req.query}
  const cquery = {...query}

  // Check valid queries
  for (let key of allowed_queries) {
    delete cquery[key]
  }

  if (Object.keys(cquery).length > 0) { // Other queries
    console.error('Query not allowed:', cquery)
    return res.status(400).send({
      status: false,
      error: {
        msg: 'Query not allowed',
        data: cquery
      }
    })
  }

  const limit = query.limit || 10
  const offset = query.offset || 0

  if (query.name) { // name query
    // TODO: we should use MySQL or PostgreSQL to use regexp operator
    // SQLite only supports like
    const likeQuery = {
      [Op.like]: '%' + query.name
    }
    query[Op.or] = [{
      'first_name': likeQuery
    }, {
      'last_name': likeQuery
    }]
  }

  // Remove offset, limit, name
  delete query.limit
  delete query.offset
  delete query.name

  const users = await User.findAll({
    where: query,
    attributes: ['id', 'first_name', 'last_name', 'country', 'hospital', 'cell_phone', 'picture_profile', 'picture_cover'],
    limit,
    offset,
    raw: true
  })

  res.send({
    status: true,
    data: users
  })
}

const editMe = async (req, res) => {
  const user = req.currentUser

  const editData = req.body
  // TODO: should limit the editing fields here
  delete editData.password
  delete editData.proof_of_status_date
  delete editData.email_verified_date
  delete editData.sms_verified_date

  // Check settings is valid

  if ('settings' in editData) {
    try {
      JSON.parse(editData.settings)
    } catch (e) {
      return res.status(400).send({
        status: true,
        error: 'invalid_settings'
      })
    }
  }

  for (let key in editData) {
    user[key] = editData[key]
  }

  await user.save()

  const data = user.get({
    plain: true
  })
  delete data.password

  res.send({
    status: true,
    data
  })
}

const sendVerifyEmail = async (req, res) => {
  const { currentUser } = req
  const { email, id } = currentUser
  const subject = 'Please confirm your email address in Watog'
  const code = randomstring.generate(12)
  const link = process.env.WATOG_DOMAIN + '/api/user/verify/email/' + code
  const text = `<html>
    <head></head>
    <body style="font-family:sans-serif;">
      <h1 style="text-align:center">Please confirm your email address</h1>
      <p>
        We here at Watog are happy to have you on 
        board! Just click the following
        link to verify your email address. 
        <a href="${link}">Verify</a>
        ${link}
      </p>
    </body>
    </html>`

  const verify = new Verify({
    user_id: id,
    type: 'email',
    code
  })

  // Save Verification Object
  await verify.save()
  await EmailCtrl.send('support@watog.com', email, subject, text)
  res.send({
    status: true
  })
}

const sendVerifySms = async (req, res) => {
  const { currentUser } = req
  const { cell_phone, id } = currentUser
  const subject = 'Please confirm your email address in Watog'
  const code = randomstring.generate(4)
  const link = process.env.WATOG_DOMAIN + '/api/user/verify/email/' + code

  const verify = new Verify({
    user_id: id,
    type: 'sms',
    code
  })

  // Save Verification Object
  await verify.save()
  await SmsCtrl.send(cell_phone, code)
  res.send({
    status: true
  })
}

const verifyEmail = async (req, res) => {
  const { code } = req.params
  const verify = await Verify.findOne({
    where: {
      code: code,
      type: 'email'
    }
  })

  if (!verify) {
    return res.status(400).send(`<h2>Invalid Link!</h2>`)
  }

  const created = verify.createdAt.getTime()
  const now = new Date().getTime()

  if (now - created > 1000 * 60 * 60) { // 1 hr expire
    return res.status(400).send(`<h2>Expired Link!</h2>`)
  }

  const currentUser = await User.findById(verify.user_id)

  if (!currentUser) {
    return res.status(400).send(`<h2>Expired Link!</h2>`)
  }

  if (currentUser.email_verified_date) { // already verified
    return res.status(400).send('Your email address is already verified!')
  }

  currentUser.email_verified_date = new Date()
  await currentUser.save()
  const { first_name, last_name, email } = currentUser

  res.send(`
    <h2>Welcome ${first_name} ${last_name}!</h2>
    <p>Your email: <b> ${email} </b> is now verified!</p>
    `)
}

const verifySms = async (req, res) => {
  const { code } = req.params
  const verify = await Verify.findOne({
    where: {
      code: code,
      type: 'sms'
    }
  })

  if (!verify) {
    return res.status(400).send(`<h2>Invalid Link!</h2>`)
  }

  const created = verify.createdAt.getTime()
  const now = new Date().getTime()

  if (now - created > 1000 * 60 * 60) { // 1 hr expire
    return res.status(400).send({
      status: false,
      error: 'expired_code'
    })
  }

  const { currentUser } = req

  if (currentUser.id !== verify.user_id) { // user_id is not matched
    return res.status(400).send({
      status: false,
      error: 'invalid_code'
    })
  }

  if (currentUser.sms_verified_date) { // already verified
    return res.status(400).send({
      status: false,
      error: 'already_verified'
    })
  }

  currentUser.sms_verified_date = new Date()
  await currentUser.save()

  const data = currentUser.get({
    plain: true
  })
  delete data.password

  res.send({
    status: true,
    data
  })
}

module.exports = {
  signup,
  login,
  checkAuth,
  getMe,
  editMe,
  getUser,
  queryUsers,
  sendVerifyEmail,
  sendVerifySms,
  verifyEmail,
  verifySms
}
