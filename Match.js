const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  homeTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  awayTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  matchDate: { type: Date, required: true },
  status: { type: String, enum: ['Scheduled', 'Live', 'Completed'], default: 'Scheduled' },
  homeScore: { type: Number, default: 0 },
  awayScore: { type: Number, default: 0 },
  goals: [{
    team: { type: String, enum: ['home', 'away'] },
    playerName: String,
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    jerseyNumber: Number,
    timestamp: { type: Date, default: Date.now }
  }],
  cards: [{
    team: { type: String, enum: ['home', 'away'], required: true },
    type: { type: String, enum: ['Yellow', 'Red'], required: true },
    playerName: { type: String, required: true },
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    jerseyNumber: Number,
    timestamp: { type: Date, default: Date.now }
  }],
  stage: { type: String, required: true },
  round: { type: String, default: null },
  group: { type: String },
  venue: String
}, { timestamps: true });

module.exports = mongoose.model('Match', matchSchema);