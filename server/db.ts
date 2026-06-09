import "dotenv/config";
import mongoose from "mongoose";

// Define TypeScript interfaces for our models
export interface Team {
  _id: string;
  clubName: string;
  username: string;
  passwordHash: string;
  logoUrl: string;
  createdAt: string;
  group?: "A" | "B" | "C" | null;
}

export interface Player {
  _id: string;
  teamId: string;
  name: string;
  age: number;
  position: "Goalkeeper" | "Defender" | "Midfielder" | "Forward";
  category: "Under-17" | "Free Age";
  photoUrl: string;
  jerseyNumber: number;
}

export interface Official {
  _id: string;
  teamId: string;
  name: string;
  position: "Head Coach" | "Assistant Coach" | "Team Doctor" | "Kit Manager" | "Manager";
  photoUrl: string;
}

export interface Match {
  _id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: "Scheduled" | "Live" | "Completed";
  stage: "Group Stage" | "Quarter Final" | "Semi Final" | "Final";
  round: string | null;
  group: "A" | "B" | "C" | null;
  matchDate: string;
  refereeId?: string | null;
  goals?: Array<{
    playerId: string;
    playerName: string;
    jerseyNumber: number;
    team: "home" | "away";
    timestamp: string;
    matchTime?: number;
  }>;
  cards?: Array<{
    playerId: string;
    playerName: string;
    jerseyNumber: number;
    team: "home" | "away";
    type: "Yellow" | "Red";
    timestamp: string;
    matchTime?: number;
  }>;
  timerLastStarted: string | null;
  timerAccumulatedTime: number;
  homeLineup: {
    starting11: string[];
    bench: string[];
  };
  awayLineup: {
    starting11: string[];
    bench: string[];
  };
}

// -------------------------------------------------------------
// MongoDB configuration with Mongoose
// -------------------------------------------------------------
const MONGODB_URI = process.env.MONGODB_URI;

const TeamSchema = new mongoose.Schema<Team>({
  clubName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  logoUrl: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  group: { type: String, enum: ["A", "B", "C", null], default: null }
});

const PlayerSchema = new mongoose.Schema<Player>({
  teamId: { type: String, required: true },
  name: { type: String, required: true },
  age: { type: Number, required: true },
  position: { type: String, required: true },
  category: { type: String, required: true },
  photoUrl: { type: String, required: true },
  jerseyNumber: { type: Number, required: true }
});

const OfficialSchema = new mongoose.Schema<Official>({
  teamId: { type: String, required: true },
  name: { type: String, required: true },
  position: { type: String, required: true },
  photoUrl: { type: String, required: true }
});

const MatchSchema = new mongoose.Schema<Match>({
  homeTeamId: { type: String, required: true },
  awayTeamId: { type: String, required: true },
  homeScore: { type: Number, default: null },
  awayScore: { type: Number, default: null },
  status: { type: String, enum: ["Scheduled", "Live", "Completed"], default: "Scheduled" },
  stage: { type: String, enum: ["Group Stage", "Quarter Final", "Semi Final", "Final"], required: true },
  round: { type: String, default: null },
  group: { type: String, enum: ["A", "B", "C", null], default: null },
  matchDate: { type: String, required: true },
  refereeId: { type: String, default: null },
  goals: [{
    playerId: { type: String, required: true },
    playerName: { type: String, required: true },
    jerseyNumber: { type: Number, required: true },
    team: { type: String, enum: ["home", "away"], required: true },
    timestamp: { type: String, required: true },
    matchTime: { type: Number }
  }],
  cards: [{
    playerId: { type: String, required: true },
    playerName: { type: String, required: true },
    jerseyNumber: { type: Number, required: true },
    team: { type: String, enum: ["home", "away"], required: true },
    type: { type: String, enum: ["Yellow", "Red"], required: true },
    timestamp: { type: String, required: true },
    matchTime: { type: Number }
  }],
  timerLastStarted: { type: String, default: null },
  timerAccumulatedTime: { type: Number, default: 0 },
  homeLineup: {
    formation: { type: String, default: "4-4-2" },
    starting11: [{ type: String }],
    bench: [{ type: String }]
  },
  awayLineup: {
    formation: { type: String, default: "4-4-2" },
    starting11: [{ type: String }],
    bench: [{ type: String }]
  }
});

// Avoid re-compiling models if they are hot-reloaded
const TeamModel = mongoose.models.Team || mongoose.model("Team", TeamSchema);
const PlayerModel = mongoose.models.Player || mongoose.model("Player", PlayerSchema);
const OfficialModel = mongoose.models.Official || mongoose.model("Official", OfficialSchema);
const MatchModel = mongoose.models.Match || mongoose.model("Match", MatchSchema);

export async function connectDB() {
  if (!MONGODB_URI) {
    throw new Error("❌ MONGODB_URI environment variable is required. Please set it in your .env file.");
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("✅ Successfully connected to MongoDB database.");
  } catch (err: any) {
    console.error("❌ Failed to connect to MongoDB:", err.message);
    throw err;
  }
}

// -------------------------------------------------------------
// Database Operations (MongoDB Only)
// -------------------------------------------------------------
export const dbTeam = {
  async create(teamData: Omit<Team, "_id" | "createdAt">): Promise<Team> {
    const doc = await TeamModel.create(teamData);
    return doc.toObject() as Team;
  },

  async find(): Promise<Team[]> {
    const docs = await TeamModel.find().lean();
    return docs as unknown as Team[];
  },

  async findOne(query: Partial<Team>): Promise<Team | null> {
    const doc = await (TeamModel as any).findOne(query as any).lean();
    return doc ? (doc as unknown as Team) : null;
  },

  async findById(id: string): Promise<Team | null> {
    const doc = await (TeamModel as any).findById(id).lean();
    return doc ? (doc as unknown as Team) : null;
  },

  async updateById(id: string, updateData: Partial<Team>): Promise<Team | null> {
    const doc = await (TeamModel as any).findByIdAndUpdate(id, updateData, { returnDocument: "after" }).lean();
    return doc ? (doc as unknown as Team) : null;
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await (TeamModel as any).findByIdAndDelete(id);
    return result !== null;
  }
};

export const dbPlayer = {
  async create(playerData: Omit<Player, "_id">): Promise<Player> {
    const doc = await PlayerModel.create(playerData);
    return doc.toObject() as Player;
  },

  async find(query: Partial<Player>): Promise<Player[]> {
    const docs = await (PlayerModel as any).find(query as any).sort({ jerseyNumber: 1 }).lean();
    return docs as unknown as Player[];
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await (PlayerModel as any).findByIdAndDelete(id);
    return result !== null;
  },

  async deleteByTeamId(teamId: string): Promise<void> {
    await (PlayerModel as any).deleteMany({ teamId });
  }
};

export const dbOfficial = {
  async create(officialData: Omit<Official, "_id">): Promise<Official> {
    const doc = await OfficialModel.create(officialData);
    return doc.toObject() as Official;
  },

  async find(query: Partial<Official>): Promise<Official[]> {
    const docs = await (OfficialModel as any).find(query as any).lean();
    return docs as unknown as Official[];
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await (OfficialModel as any).findByIdAndDelete(id);
    return result !== null;
  },

  async deleteByTeamId(teamId: string): Promise<void> {
    await (OfficialModel as any).deleteMany({ teamId });
  }
};

export const dbMatch = {
  async create(matchData: Omit<Match, "_id">): Promise<Match> {
    const doc = await MatchModel.create(matchData);
    return doc.toObject() as Match;
  },

  async find(query: Partial<Match> = {}): Promise<Match[]> {
    const docs = await (MatchModel as any).find(query as any).sort({ matchDate: 1 }).lean();
    return docs as unknown as Match[];
  },

  async findById(id: string): Promise<Match | null> {
    const doc = await (MatchModel as any).findById(id).lean();
    return doc ? (doc as unknown as Match) : null;
  },

  async updateById(id: string, updateData: Partial<Match>): Promise<Match | null> {
    const doc = await (MatchModel as any).findByIdAndUpdate(id, updateData, { returnDocument: "after" }).lean();
    return doc ? (doc as unknown as Match) : null;
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await (MatchModel as any).findByIdAndDelete(id);
    return result !== null;
  },

  async deleteByTeamId(teamId: string): Promise<void> {
    await (MatchModel as any).deleteMany({
      $or: [{ homeTeamId: teamId }, { awayTeamId: teamId }]
    });
  }
};
