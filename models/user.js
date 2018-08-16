var sequelize = require('../config/database');


var User = sequelize.define('User', {
    id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
    },
    first_name: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    last_name: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    password: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    email: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    cell_phone: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    country: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    hospital: {
        type: Sequelize.STRING,
        allowNull: false,
    },
});

User.associate = function (models) {
    User.hasMany(models.Category,
        {
            foreignKey: 'user_id',
            constraints: false
        }
    )
};

User.associate = function (models) {
    User.hasOne(models.Votes,
        {
            foreignKey: 'voteBy',
            constraints: false
        }
    )
};



module.exports = User;