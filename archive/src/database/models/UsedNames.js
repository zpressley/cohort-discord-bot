const { DataTypes } = require('sequelize');

// Tracks every commander name that has been used in the live game so that
// procedural generators can enforce global uniqueness over time.
module.exports = (sequelize) => {
  const UsedNames = sequelize.define('UsedNames', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    archetype: {
      type: DataTypes.STRING,
      allowNull: false
    },
    philosophy: {
      type: DataTypes.ENUM('glory', 'survival'),
      allowNull: false
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    surname: {
      type: DataTypes.STRING,
      allowNull: true
    },
    hasSurname: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    usedBy: {
      // For now this is the Discord user id; later it can point at Commander.
      type: DataTypes.STRING,
      allowNull: false
    },
    usedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    retired: {
      // When a commander dies or a name is taken out of circulation, mark here.
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  });

  UsedNames.associate = (models) => {
    // Optional: later we can associate to Commander by discordId if desired.
    // UsedNames.belongsTo(models.Commander, { foreignKey: 'usedBy', targetKey: 'discordId', as: 'commander' });
  };

  return UsedNames;
};
