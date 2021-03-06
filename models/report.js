const Sequelize = require('sequelize')

const sequelize = require('../config/database')

const Report = sequelize.define('Report', {
  id: {
    type: Sequelize.INTEGER,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true
  },
  user_id: { // Who reported
    type: Sequelize.INTEGER,
    allowNull: false
  },
  post_id: {
    type: Sequelize.INTEGER,
    allowNull: false
  },
  type: {
    type: Sequelize.STRING, // One of 'spam', 'violence', 'sex', 'other'
    allowNull: false
  },
  description: {
    type: Sequelize.STRING, // Additional description about the report
    allowNull: true
  }
})

module.exports = Report
