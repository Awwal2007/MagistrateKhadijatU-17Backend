import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";

// Define TypeScript interfaces for our models
export interface Team {
  _id: string;
  clubName: string;
  email: string;
  passwordHash: string;
  logoUrl: string;
  createdAt: string;
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

// -------------------------------------------------------------
// MongoDB configuration with Mongoose
// -------------------------------------------------------------
const MONGODB_URI = process.env.MONGODB_URI;

const TeamSchema = new mongoose.Schema<Team>({
  clubName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  logoUrl: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() }
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

// Avoid re-compiling models if they are hot-reloaded
const TeamModel = mongoose.models.Team || mongoose.model("Team", TeamSchema);
const PlayerModel = mongoose.models.Player || mongoose.model("Player", PlayerSchema);
const OfficialModel = mongoose.models.Official || mongoose.model("Official", OfficialSchema);

let isUsingMongo = false;

export async function connectDB() {
  if (!MONGODB_URI) {
    console.log("⚠️ No MONGODB_URI environment variable found. Falling back to local JSON database storage.");
    initLocalDB();
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    isUsingMongo = true;
    console.log("✅ Successfully connected to MongoDB database.");
  } catch (err: any) {
    console.error("❌ Failed to connect to MongoDB. Falling back to local JSON database storage. Error:", err.message);
    initLocalDB();
  }
}

// -------------------------------------------------------------
// Local JSON File Database Fallback (For Sandbox & Development)
// -------------------------------------------------------------
const dbFilePath = path.join(process.cwd(), "data", "db.json");

interface LocalStore {
  teams: Team[];
  players: Player[];
  officials: Official[];
}

function initLocalDB() {
  const dataDir = path.dirname(dbFilePath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dbFilePath)) {
    fs.writeFileSync(dbFilePath, JSON.stringify({ teams: [], players: [], officials: [] }, null, 2));
  }
}

function readLocalDB(): LocalStore {
  try {
    initLocalDB();
    const content = fs.readFileSync(dbFilePath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    return { teams: [], players: [], officials: [] };
  }
}

function writeLocalDB(data: LocalStore) {
  try {
    initLocalDB();
    fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("❌ Error writing local JSON database:", err);
  }
}

function generateId() {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

// -------------------------------------------------------------
// Unified Database Operations Adapter
// -------------------------------------------------------------
export const dbTeam = {
  async create(teamData: Omit<Team, "_id" | "createdAt">): Promise<Team> {
    if (isUsingMongo) {
      const doc = await TeamModel.create(teamData);
      return doc.toObject() as Team;
    } else {
      const db = readLocalDB();
      const newTeam: Team = {
        _id: generateId(),
        ...teamData,
        createdAt: new Date().toISOString()
      };
      db.teams.push(newTeam);
      writeLocalDB(db);
      return newTeam;
    }
  },

  async find(): Promise<Team[]> {
    if (isUsingMongo) {
      const docs = await TeamModel.find().lean();
      return docs as unknown as Team[];
    } else {
      const db = readLocalDB();
      return db.teams;
    }
  },

  async findOne(query: Partial<Team>): Promise<Team | null> {
    if (isUsingMongo) {
      const doc = await (TeamModel as any).findOne(query as any).lean();
      return doc ? (doc as unknown as Team) : null;
    } else {
      const db = readLocalDB();
      const match = db.teams.find(t => {
        return Object.entries(query).every(([key, val]) => (t as any)[key] === val);
      });
      return match || null;
    }
  },

  async findById(id: string): Promise<Team | null> {
    if (isUsingMongo) {
      const doc = await (TeamModel as any).findById(id).lean();
      return doc ? (doc as unknown as Team) : null;
    } else {
      const db = readLocalDB();
      const match = db.teams.find(t => t._id === id);
      return match || null;
    }
  },

  async deleteById(id: string): Promise<boolean> {
    if (isUsingMongo) {
      const result = await (TeamModel as any).findByIdAndDelete(id);
      return result !== null;
    } else {
      const db = readLocalDB();
      const initialLength = db.teams.length;
      db.teams = db.teams.filter(t => t._id !== id);
      writeLocalDB(db);
      return db.teams.length < initialLength;
    }
  }
};

export const dbPlayer = {
  async create(playerData: Omit<Player, "_id">): Promise<Player> {
    if (isUsingMongo) {
      const doc = await PlayerModel.create(playerData);
      return doc.toObject() as Player;
    } else {
      const db = readLocalDB();
      const newPlayer: Player = {
        _id: generateId(),
        ...playerData
      };
      db.players.push(newPlayer);
      writeLocalDB(db);
      return newPlayer;
    }
  },

  async find(query: Partial<Player>): Promise<Player[]> {
    if (isUsingMongo) {
      const docs = await (PlayerModel as any).find(query as any).sort({ jerseyNumber: 1 }).lean();
      return docs as unknown as Player[];
    } else {
      const db = readLocalDB();
      const matches = db.players.filter(p => {
        return Object.entries(query).every(([key, val]) => (p as any)[key] === val);
      });
      return matches.sort((a, b) => a.jerseyNumber - b.jerseyNumber);
    }
  },

  async deleteById(id: string): Promise<boolean> {
    if (isUsingMongo) {
      const result = await (PlayerModel as any).findByIdAndDelete(id);
      return result !== null;
    } else {
      const db = readLocalDB();
      const initialLength = db.players.length;
      db.players = db.players.filter(p => p._id !== id);
      writeLocalDB(db);
      return db.players.length < initialLength;
    }
  },

  async deleteByTeamId(teamId: string): Promise<void> {
    if (isUsingMongo) {
      await (PlayerModel as any).deleteMany({ teamId });
    } else {
      const db = readLocalDB();
      db.players = db.players.filter(p => p.teamId !== teamId);
      writeLocalDB(db);
    }
  }
};

export const dbOfficial = {
  async create(officialData: Omit<Official, "_id">): Promise<Official> {
    if (isUsingMongo) {
      const doc = await OfficialModel.create(officialData);
      return doc.toObject() as Official;
    } else {
      const db = readLocalDB();
      const newOfficial: Official = {
        _id: generateId(),
        ...officialData
      };
      db.officials.push(newOfficial);
      writeLocalDB(db);
      return newOfficial;
    }
  },

  async find(query: Partial<Official>): Promise<Official[]> {
    if (isUsingMongo) {
      const docs = await (OfficialModel as any).find(query as any).lean();
      return docs as unknown as Official[];
    } else {
      const db = readLocalDB();
      const matches = db.officials.filter(o => {
        return Object.entries(query).every(([key, val]) => (o as any)[key] === val);
      });
      return matches;
    }
  },

  async deleteById(id: string): Promise<boolean> {
    if (isUsingMongo) {
      const result = await (OfficialModel as any).findByIdAndDelete(id);
      return result !== null;
    } else {
      const db = readLocalDB();
      const initialLength = db.officials.length;
      db.officials = db.officials.filter(o => o._id !== id);
      writeLocalDB(db);
      return db.officials.length < initialLength;
    }
  },

  async deleteByTeamId(teamId: string): Promise<void> {
    if (isUsingMongo) {
      await (OfficialModel as any).deleteMany({ teamId });
    } else {
      const db = readLocalDB();
      db.officials = db.officials.filter(o => o.teamId !== teamId);
      writeLocalDB(db);
    }
  }
};
