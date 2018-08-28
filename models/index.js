const User = require('./user')
const Post = require('./post')
const Category = require('./category')
const Vote = require('./vote')
const Report = require('./report')
const Verify = require('./verify')

User.sync()
Post.sync()
Category.sync()
Vote.sync()
Report.sync()
Verify.sync()