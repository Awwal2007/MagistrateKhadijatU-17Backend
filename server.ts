import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { body, validationResult } from "express-validator";
import { v2 as cloudinary } from "cloudinary";
import { connectDB, dbTeam, dbPlayer, dbOfficial, dbMatch, Team, Player, Official, Match } from "./server/db.js";

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "MAGISTRATE_KHADIJAT_OLOYADE_SUPER_SECRET_KEY";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin@123";
const REFEREE_PASSWORD = process.env.REFEREE_PASSWORD || "referee@123";



// -------------------------------------------------------------
// Cloudinary Config
// -------------------------------------------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper to save a Base64 string directly to Cloudinary
async function handleImageSave(imageInput: string, prefix: string): Promise<string> {
  if (!imageInput) return "/placeholder-logo.png";
  if (imageInput.startsWith("/uploads/") || imageInput.startsWith("http")) {
    return imageInput;
  }
  if (imageInput.startsWith("data:image/")) {
    try {
      const result = await cloudinary.uploader.upload(imageInput, {
        folder: "magistrate_u17",
        public_id: `${prefix}-${Date.now()}`
      });
      return result.secure_url;
    } catch (error) {
      console.error("Cloudinary Upload Error:", error);
      throw new Error("Failed to upload image to Cloudinary");
    }
  }
  return imageInput;
}

// -------------------------------------------------------------
// Middlewares Setup
// -------------------------------------------------------------
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Enable CORS for external cross-resource calls
app.use(cors());

// Secure Express headers (with iframe source relaxation so that the local dev iframe displays smoothly)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", "https:", "http:", "data:", "blob:"],
        frameAncestors: ["'self'", "https:", "http:"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imggSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"]
      }
    },
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);



// Connect Database
connectDB();

// -------------------------------------------------------------
// Auth Middleware Interfaces & Helpers
// -------------------------------------------------------------
interface AuthenticatedRequest extends express.Request {
  user?: {
    id: string;
    username: string;
    role: "team" | "admin";
  };
}

const verifyToken = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    res.status(401).json({ message: "No Authorization header provided." });
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    res.status(401).json({ message: "Invalid authorization format. Must be Bearer <token>" });
    return;
  }

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string; role: "team" | "admin" };
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Token expired or invalid." });
  }
};

const verifyAdminToken = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  verifyToken(req, res, () => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ message: "Access forbidden. Admin privilege required." });
      return;
    }
    next();
  });
};

const verifyRefereeToken = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  verifyToken(req, res, () => {
    if (req.user?.role !== "referee" && req.user?.role !== "admin") {
      res.status(403).json({ message: "Access forbidden. Referee or Admin privilege required." });
      return;
    }
    next();
  });
};

// -------------------------------------------------------------
// API CONTROLLERS / ROUTING
// -------------------------------------------------------------

// POST /api/auth/register
app.post(
  "/api/auth/register",
  [
    body("clubName").trim().notEmpty().withMessage("Club Name is required"),
    body("username").trim().isLength({ min: 3 }).withMessage("Username must be at least 3 characters long"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  async (req: express.Request, res: express.Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { clubName, username, password, logo } = req.body;

    try {
      // Check existing username
      const existing = await dbTeam.findOne({ username });
      if (existing) {
        return res.status(400).json({ message: "A club with this username has already registered." });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Save logo
      let finalLogoUrl = "/placeholder-logo.png";
      if (logo) {
        finalLogoUrl = await handleImageSave(logo, "logo");
      }

      const team = await dbTeam.create({
        clubName,
        username,
        passwordHash,
        logoUrl: finalLogoUrl
      });

      const token = jwt.sign({ id: team._id, username: team.username, role: "team" }, JWT_SECRET, { expiresIn: "7d" });

      res.status(201).json({
        message: "Registration successful!",
        token,
        team: {
          id: team._id,
          clubName: team.clubName,
          username: team.username,
          logoUrl: team.logoUrl
        }
      });
    } catch (err: any) {
      console.error("Register Error:", err);
      res.status(500).json({ message: "An error occurred while creating your team registration.", error: err.message });
    }
  }
);

// POST /api/auth/login
app.post(
  "/api/auth/login",
  [
    body("username").trim().isLength({ min: 3 }).withMessage("Username is required"),
    body("password").notEmpty().withMessage("Password is required")
  ],
  async (req: express.Request, res: express.Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { username, password } = req.body;

    try {
      const team = await dbTeam.findOne({ username });
      if (!team) {
        return res.status(401).json({ message: "Invalid username or password." });
      }

      const isMatch = await bcrypt.compare(password, team.passwordHash);
      if (!isMatch) {
        res.status(401).json({ message: "Invalid username or password." });
        return;
      }

      const token = jwt.sign({ id: team._id, username: team.username, role: "team" }, JWT_SECRET, { expiresIn: "7d" });

      res.json({
        message: "Login successful!",
        token,
        team: {
          id: team._id,
          clubName: team.clubName,
          username: team.username,
          logoUrl: team.logoUrl
        }
      });
    } catch (err: any) {
      res.status(500).json({ message: "An error occurred during sign-in.", error: err.message });
    }
  }
);

// POST /api/auth/admin-login
app.post("/api/auth/admin-login", async (req: express.Request, res: express.Response) => {
  const { password } = req.body;
  if (!password) {
    res.status(400).json({ message: "Admin password is required." });
    return;
  }

  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ message: "Invalid administrator credentials." });
    return;
  }

  const token = jwt.sign({ id: "admin", username: "admin", role: "admin" }, JWT_SECRET, { expiresIn: "3d" });
  res.json({
    message: "Admin verification successful!",
    token,
    admin: {
      username: "admin",
      role: "admin"
    }
  });
});

// POST /api/auth/referee-login
app.post("/api/auth/referee-login", async (req: express.Request, res: express.Response) => {
  const { refereeName, password } = req.body;
  if (!refereeName || !password) {
    res.status(400).json({ message: "Referee Name and Password are required." });
    return;
  }

  if (password !== REFEREE_PASSWORD) {
    res.status(401).json({ message: "Invalid referee credentials." });
    return;
  }

  const token = jwt.sign({ id: refereeName, username: refereeName, role: "referee" }, JWT_SECRET, { expiresIn: "1d" });
  res.json({
    message: "Referee authenticated.",
    token,
    referee: { username: refereeName, role: "referee" }
  });
});

// GET /api/teams/:id
app.get("/api/teams/:id", verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;

  // Enforce self-access or admin access
  if (req.user?.role !== "admin" && req.user?.id !== id) {
    res.status(403).json({ message: "Access forbidden. Unauthorized view." });
    return;
  }

  try {
    const team = await dbTeam.findById(id);
    if (!team) {
      res.status(404).json({ message: "Team not found." });
      return;
    }

    const players = await dbPlayer.find({ teamId: id });
    const officials = await dbOfficial.find({ teamId: id });

    res.json({
      team: {
        id: team._id,
        clubName: team.clubName,
        username: team.username,
        logoUrl: team.logoUrl,
        createdAt: team.createdAt
      },
      players,
      officials
    });
  } catch (err: any) {
    res.status(500).json({ message: "Error retrieval of team files.", error: err.message });
  }
});

// GET /api/teams/:id/players (for admin live scoring)
app.get("/api/teams/:id/players", verifyAdminToken, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;

  try {
    const players = await dbPlayer.find({ teamId: id });
    res.json({ players });
  } catch (err: any) {
    res.status(500).json({ message: "Error fetching players.", error: err.message });
  }
});

// POST /api/teams/:id/players
app.post(
  "/api/teams/:id/players",
  verifyToken,
  [
    body("name").trim().notEmpty().withMessage("Player Name is required"),
    body("age").isInt({ min: 1, max: 99 }).withMessage("Age must be between 1 and 99"),
    body("position").isIn(["Goalkeeper", "Defender", "Midfielder", "Forward"]).withMessage("Invalid player position"),
    body("photo").notEmpty().withMessage("Player Photo is required")
  ],
  async (req: AuthenticatedRequest, res: express.Response) => {
    const { id } = req.params;

    if (req.user?.role !== "admin" && req.user?.id !== id) {
      res.status(403).json({ message: "Access forbidden. Unauthorized roster modification." });
      return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { name, age, position, photo, category } = req.body;

    try {
      // Validate Quota server-side
      const currentPlayers = await dbPlayer.find({ teamId: id });
      
      const parsedAge = parseInt(age, 10);

      const totalCount = currentPlayers.length;
      const u17Count = currentPlayers.filter(p => p.category === "Under-17").length;
      const freeAgeCount = currentPlayers.filter(p => p.category === "Free Age").length;

      if (totalCount >= 25) {
        res.status(400).json({ message: "Roster has reached the maximum capacity of 25 players." });
        return;
      }

      if (category === "Under-17" && u17Count >= 20) {
        res.status(400).json({ message: "Under-17 quota is full (Max 20 players)." });
        return;
      }

      if (category === "Free Age" && freeAgeCount >= 6) {
        res.status(400).json({ message: "Free Age quota is full (Max 6 players)." });
        return;
      }

      // Save player photo
      let finalPhotoUrl = "/placeholder-card.png";
      if (photo) {
        finalPhotoUrl = await handleImageSave(photo, `player-${id}`);
      }

      // Auto assign jersey number as chronological added order (or fallback math to avoid conflicts)
      let nextJersey = currentPlayers.length + 1;
      // Ensure it is unique in this roster
      const usedJerseys = new Set(currentPlayers.map(p => p.jerseyNumber));
      while (usedJerseys.has(nextJersey)) {
        nextJersey++;
      }

      const player = await dbPlayer.create({
        teamId: id,
        name,
        age: parsedAge,
        position,
        category,
        photoUrl: finalPhotoUrl,
        jerseyNumber: nextJersey
      });

      res.status(201).json({
        message: "Player added successfully!",
        player
      });
    } catch (err: any) {
      console.error("Add Player Error:", err);
      res.status(500).json({ message: "Error adding player.", error: err.message });
    }
  }
);

// POST /api/teams/:id/officials
app.post(
  "/api/teams/:id/officials",
  verifyToken,
  [
    body("name").trim().notEmpty().withMessage("Official Name is required"),
    body("position").isIn(["Head Coach", "Assistant Coach", "Team Doctor", "Kit Manager", "Manager"]).withMessage("Invalid official position"),
    body("photo").notEmpty().withMessage("Official Photo is required")
  ],
  async (req: AuthenticatedRequest, res: express.Response) => {
    const { id } = req.params;

    if (req.user?.role !== "admin" && req.user?.id !== id) {
      res.status(403).json({ message: "Access forbidden. Unauthorized roster modification." });
      return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { name, position, photo } = req.body;

    try {
      const officials = await dbOfficial.find({ teamId: id });
      if (officials.length >= 4) {
        res.status(400).json({ message: "Officials quota is full (Max 4 officials)." });
        return;
      }

      let finalPhotoUrl = "/placeholder-card.png";
      if (photo) {
        finalPhotoUrl = await handleImageSave(photo, `official-${id}`);
      }

      const official = await dbOfficial.create({
        teamId: id,
        name,
        position,
        photoUrl: finalPhotoUrl
      });

      res.status(201).json({
        message: "Official added successfully!",
        official
      });
    } catch (err: any) {
      res.status(500).json({ message: "Error adding official.", error: err.message });
    }
  }
);

// DELETE /api/admin/players/:id
app.delete("/api/admin/players/:id", verifyAdminToken, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    const deleted = await dbPlayer.deleteById(id);
    if (deleted) {
      res.json({ message: "Player removed successfully." });
    } else {
      res.status(404).json({ message: "Player not found." });
    }
  } catch (err: any) {
    res.status(500).json({ message: "Error removing player.", error: err.message });
  }
});

// DELETE /api/admin/teams/:id
app.delete("/api/admin/teams/:id", verifyAdminToken, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    const deleted = await dbTeam.deleteById(id);
    if (deleted) {
      // Cascade delete players and officials
      await dbPlayer.deleteByTeamId(id);
      await dbOfficial.deleteByTeamId(id);
      res.json({ message: "Team account and all associated rosters deleted successfully." });
    } else {
      res.status(404).json({ message: "Team not found." });
    }
  } catch (err: any) {
    res.status(500).json({ message: "Error deleting team.", error: err.message });
  }
});

// GET /api/admin/teams
app.get("/api/admin/teams", verifyAdminToken, async (req: express.Request, res: express.Response) => {
  try {
    const teams = await dbTeam.find();
    
    // Stitch rosters to each team
    const fullTeams = await Promise.all(
      teams.map(async (t) => {
        const players = await dbPlayer.find({ teamId: t._id });
        const officials = await dbOfficial.find({ teamId: t._id });
        return {
          id: t._id,
          clubName: t.clubName,
          username: t.username,
          logoUrl: t.logoUrl,
          createdAt: t.createdAt,
          group: t.group,
          players,
          officials
        };
      })
    );

    res.json({ teams: fullTeams });
  } catch (err: any) {
    res.status(500).json({ message: "Error fetching administrator dashboard records.", error: err.message });
  }
});


// -------------------------------------------------------------
// TOURNAMENT ROUTES
// -------------------------------------------------------------

// PUT /api/admin/teams/:id/group
app.put("/api/admin/teams/:id/group", verifyAdminToken, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { group } = req.body; // "A", "B", "C", or null

  try {
    const updated = await dbTeam.updateById(id, { group });
    if (!updated) {
      return res.status(404).json({ message: "Team not found." });
    }
    res.json({ message: "Team group updated.", team: updated });
  } catch (err: any) {
    res.status(500).json({ message: "Error updating team group.", error: err.message });
  }
});

// GET /api/matches
app.get("/api/matches", async (req: express.Request, res: express.Response) => {
  try {
    const matches = await dbMatch.find();
    
    // Populate team names and logos
    const populatedMatches = await Promise.all(
      matches.map(async (m) => {
        const homeTeam = await dbTeam.findById(m.homeTeamId);
        const awayTeam = await dbTeam.findById(m.awayTeamId);
        return {
          ...m,
          homeTeamName: homeTeam?.clubName || "Unknown Team",
          homeTeamLogo: homeTeam?.logoUrl || "/placeholder-logo.png",
          awayTeamName: awayTeam?.clubName || "Unknown Team",
          awayTeamLogo: awayTeam?.logoUrl || "/placeholder-logo.png",
        };
      })
    );

    res.json({ matches: populatedMatches });
  } catch (err: any) {
    res.status(500).json({ message: "Error fetching matches.", error: err.message });
  }
});

// POST /api/admin/matches
app.post(
  "/api/admin/matches",
  verifyAdminToken,
  [
    body("homeTeamId").notEmpty().withMessage("Home team is required"),
    body("awayTeamId").notEmpty().withMessage("Away team is required"),
    body("stage").isIn(["Group Stage", "Quarter Final", "Semi Final", "Final"]).withMessage("Invalid match stage"),
    body("matchDate").notEmpty().withMessage("Match date is required"),
    body("round").optional()
  ],
  async (req: express.Request, res: express.Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { homeTeamId, awayTeamId, stage, group, matchDate } = req.body;
    const round = req.body.round || null;

    if (homeTeamId === awayTeamId) {
      return res.status(400).json({ message: "Home team and away team cannot be the same." });
    }

    try {
      const match = await dbMatch.create({
        homeTeamId,
        awayTeamId,
        stage,
        group: group || null,
        round,
        matchDate,
        homeScore: null,
        awayScore: null,
        homePenaltyScore: null,
        awayPenaltyScore: null,
        status: "Scheduled"
      });
      res.status(201).json({ message: "Match scheduled successfully.", match });
    } catch (err: any) {
      res.status(500).json({ message: "Error scheduling match.", error: err.message });
    }
  }
);

// PUT /api/admin/matches/:id
app.put("/api/admin/matches/:id", verifyAdminToken, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { homeScore, awayScore, homePenaltyScore, awayPenaltyScore, status, matchDate, round, homeTeamId, awayTeamId, refereeId } = req.body;
  
  try {
    const updated = await dbMatch.updateById(id, {
      homeScore: homeScore !== undefined ? homeScore : null,
      awayScore: awayScore !== undefined ? awayScore : null,
      homePenaltyScore: homePenaltyScore !== undefined ? homePenaltyScore : null,
      awayPenaltyScore: awayPenaltyScore !== undefined ? awayPenaltyScore : null,
      status: status || "Scheduled",
      homeTeamId: homeTeamId !== undefined ? homeTeamId : undefined,
      awayTeamId: awayTeamId !== undefined ? awayTeamId : undefined,
      round: round !== undefined ? (round || null) : undefined,
      refereeId: refereeId !== undefined ? (refereeId || null) : undefined,
      matchDate
    });

    if (!updated) return res.status(404).json({ message: "Match not found." });
    res.json({ message: "Match updated.", match: updated });
  } catch (err: any) {
    res.status(500).json({ message: "Error updating match.", error: err.message });
  }
});

// DELETE /api/admin/matches/:id
app.delete("/api/admin/matches/:id", verifyAdminToken, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    const deleted = await dbMatch.deleteById(id);
    if (deleted) res.json({ message: "Match deleted successfully." });
    else res.status(404).json({ message: "Match not found." });
  } catch (err: any) {
    res.status(500).json({ message: "Error deleting match.", error: err.message });
  }
});

// POST /api/admin/matches/:id/start-live
app.post("/api/admin/matches/:id/start-live", verifyAdminToken, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    const updated = await dbMatch.updateById(id, { 
      status: "Live", 
      goals: [], 
      cards: [],
      timerLastStarted: new Date().toISOString(),
      timerAccumulatedTime: 0
    });
    if (!updated) return res.status(404).json({ message: "Match not found." });
    res.json({ message: "Match started live.", match: updated });
  } catch (err: any) {
    res.status(500).json({ message: "Error starting match.", error: err.message });
  }
});

// POST /api/admin/matches/:id/record-goal
app.post("/api/admin/matches/:id/record-goal", verifyRefereeToken, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { playerId, playerName, jerseyNumber, team, timerLastStarted, timerAccumulatedTime, matchTime } = req.body;

  try {
    const match = await dbMatch.findById(id);
    if (!match) return res.status(404).json({ message: "Match not found." });

    if (!match.goals) match.goals = [];
    
    match.goals.push({
      playerId,
      playerName,
      jerseyNumber,
      team,
      timestamp: new Date().toISOString(),
      matchTime
    });

    // Update scores based on goals
    const homeGoals = match.goals.filter(g => g.team === "home").length;
    const awayGoals = match.goals.filter(g => g.team === "away").length;

    const updated = await dbMatch.updateById(id, {
      goals: match.goals,
      homeScore: homeGoals,
      awayScore: awayGoals,
      timerLastStarted: timerLastStarted !== undefined ? timerLastStarted : match.timerLastStarted,
      timerAccumulatedTime: timerAccumulatedTime !== undefined ? timerAccumulatedTime : match.timerAccumulatedTime
    });

    res.json({ message: "Goal recorded.", match: updated });
  } catch (err: any) {
    res.status(500).json({ message: "Error recording goal.", error: err.message });
  }
});

// DELETE /api/admin/matches/:id/goal/:goalIndex
app.delete("/api/admin/matches/:id/goal/:goalIndex", verifyAdminToken, async (req: express.Request, res: express.Response) => {
  const { id, goalIndex } = req.params;

  try {
    const match = await dbMatch.findById(id);
    if (!match) return res.status(404).json({ message: "Match not found." });

    if (!match.goals || !match.goals[goalIndex]) {
      return res.status(404).json({ message: "Goal not found." });
    }

    match.goals.splice(parseInt(goalIndex), 1);

    // Recalculate scores
    const homeGoals = match.goals.filter(g => g.team === "home").length;
    const awayGoals = match.goals.filter(g => g.team === "away").length;

    const updated = await dbMatch.updateById(id, {
      goals: match.goals,
      homeScore: homeGoals,
      awayScore: awayGoals
    });

    res.json({ message: "Goal removed.", match: updated });
  } catch (err: any) {
    res.status(500).json({ message: "Error removing goal.", error: err.message });
  }
});

// POST /api/admin/matches/:id/record-card
app.post("/api/admin/matches/:id/record-card", verifyRefereeToken, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { playerId, playerName, jerseyNumber, team, type, timestamp, timerLastStarted, timerAccumulatedTime, matchTime } = req.body;

  try {
    const match = await dbMatch.findById(id);
    if (!match) return res.status(404).json({ message: "Match not found" });

    if (!match.cards) match.cards = [];
    
    match.cards.push({
      playerId,
      playerName,
      jerseyNumber,
      team,
      type,
      timestamp: timestamp || new Date().toISOString(),
      matchTime
    });

    const updated = await dbMatch.updateById(id, {
      cards: match.cards,
      timerLastStarted: timerLastStarted !== undefined ? timerLastStarted : match.timerLastStarted,
      timerAccumulatedTime: timerAccumulatedTime !== undefined ? timerAccumulatedTime : match.timerAccumulatedTime
    });

    res.json({ message: "Card recorded.", match: updated });
  } catch (err: any) {
    res.status(500).json({ message: "Error recording card.", error: err.message });
  }
});

// DELETE /api/admin/matches/:id/card/:cardIndex
app.delete("/api/admin/matches/:id/card/:cardIndex", verifyAdminToken, async (req: express.Request, res: express.Response) => {
  const { id, cardIndex } = req.params;

  try {
    const match = await dbMatch.findById(id);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const index = parseInt(cardIndex);
    if (!match.cards || isNaN(index) || !match.cards[index]) {
      return res.status(404).json({ message: "Card not found." });
    }

    match.cards.splice(index, 1);

    const updated = await dbMatch.updateById(id, {
      cards: match.cards
    });

    res.json({ message: "Card removed.", match: updated });
  } catch (err: any) {
    res.status(500).json({ message: "Error removing card.", error: err.message });
  }
});

// POST /api/admin/matches/:id/end-live
app.post("/api/admin/matches/:id/end-live", verifyAdminToken, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    const updated = await dbMatch.updateById(id, { 
      status: "Completed",
      timerLastStarted: null,
      timerAccumulatedTime: 0
    });
    if (!updated) return res.status(404).json({ message: "Match not found." });
    res.json({ message: "Match ended.", match: updated });
  } catch (err: any) {
    res.status(500).json({ message: "Error ending match.", error: err.message });
  }
});

// POST /api/admin/matches/:id/sync-timer
app.post("/api/admin/matches/:id/sync-timer", verifyAdminToken, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { timerLastStarted, timerAccumulatedTime } = req.body;

  try {
    const updated = await dbMatch.updateById(id, {
      timerLastStarted,
      timerAccumulatedTime
    });

    if (!updated) return res.status(404).json({ message: "Match not found." });
    res.json({ message: "Timer synced.", match: updated });
  } catch (err: any) {
    res.status(500).json({ message: "Error syncing timer.", error: err.message });
  }
});

// POST /api/matches/:id/lineup
app.post("/api/matches/:id/lineup", verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;
  const { formation, starting11, bench } = req.body;
  const teamId = req.user?.id;

  try {
    const match = await dbMatch.findById(id);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const isHome = match.homeTeamId === teamId;
    const isAway = match.awayTeamId === teamId;

    if (!isHome && !isAway && req.user?.role !== 'admin') {
      return res.status(403).json({ message: "Unauthorized: You are not a participant in this match." });
    }

    const update: any = {};
    if (isHome) update.homeLineup = { formation, starting11, bench };
    if (isAway) update.awayLineup = { formation, starting11, bench };

    const updated = await dbMatch.updateById(id, update);
    res.json({ message: "Lineup successfully submitted.", match: updated });
  } catch (err: any) {
    res.status(500).json({ message: "Error committing lineup.", error: err.message });
  }
});

// GET /api/matches/:id/rosters
app.get("/api/matches/:id/rosters", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    const match = await dbMatch.findById(id);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const [homePlayers, awayPlayers] = await Promise.all([
      dbPlayer.find({ teamId: match.homeTeamId }),
      dbPlayer.find({ teamId: match.awayTeamId })
    ]);

    res.json({ homePlayers, awayPlayers });
  } catch (err: any) {
    res.status(500).json({ message: "Error retrieving match rosters.", error: err.message });
  }
});

// GET /api/matches/:id/goal-scorers
app.get("/api/matches/:id/goal-scorers", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    const match = await dbMatch.findById(id);
    if (!match) return res.status(404).json({ message: "Match not found." });

    const goals = match.goals || [];
    const homeGoalScorers: Record<string, number> = {};
    const awayGoalScorers: Record<string, number> = {};

    goals.forEach(goal => {
      const key = `${goal.playerName} (#${goal.jerseyNumber})`;
      if (goal.team === "home") {
        homeGoalScorers[key] = (homeGoalScorers[key] || 0) + 1;
      } else {
        awayGoalScorers[key] = (awayGoalScorers[key] || 0) + 1;
      }
    });

    res.json({
      homeGoalScorers: Object.entries(homeGoalScorers).map(([name, goals]) => ({ name, goals })),
      awayGoalScorers: Object.entries(awayGoalScorers).map(([name, goals]) => ({ name, goals }))
    });
  } catch (err: any) {
    res.status(500).json({ message: "Error fetching goal scorers.", error: err.message });
  }
});

// GET /api/stats
app.get("/api/stats", async (req: express.Request, res: express.Response) => {
  try {
    const matches = await dbMatch.find();
    const teams = await dbTeam.find();
    
    const scorerMap: Record<string, { name: string, team: string, teamLogo: string, goals: number }> = {};
    const disciplinaryRecords: Array<{
      playerName: string,
      playerId: string,
      teamName: string,
      teamLogo: string,
      type: "Yellow" | "Red",
      date: string,
      matchMissed?: string
    }> = [];

    // Sort matches chronologically to find next fixtures for suspensions
    const sortedMatches = [...matches].sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());

    matches.forEach(m => {
      const homeTeam = teams.find(t => t._id.toString() === m.homeTeamId);
      const awayTeam = teams.find(t => t._id.toString() === m.awayTeamId);

      // Process Goals
      (m.goals || []).forEach(g => {
        const team = g.team === 'home' ? homeTeam : awayTeam;
        if (!scorerMap[g.playerId]) {
          scorerMap[g.playerId] = {
            name: g.playerName,
            team: team?.clubName || "Unknown",
            teamLogo: team?.logoUrl || "/placeholder-logo.png",
            goals: 0
          };
        }
        scorerMap[g.playerId].goals += 1;
      });

      // Process Cards
      (m.cards || []).forEach(c => {
        const team = c.team === 'home' ? homeTeam : awayTeam;
        const teamId = c.team === 'home' ? m.homeTeamId : m.awayTeamId;
        
        let matchMissed = undefined;
        if (c.type === 'Red') {
          // Find the next scheduled match for this team
          const nextMatch = sortedMatches.find(sm => 
            new Date(sm.matchDate) > new Date(m.matchDate) && 
            (sm.homeTeamId === teamId || sm.awayTeamId === teamId)
          );
          
          if (nextMatch) {
            const vsTeamId = nextMatch.homeTeamId === teamId ? nextMatch.awayTeamId : nextMatch.homeTeamId;
            const vsTeam = teams.find(t => t._id.toString() === vsTeamId);
            matchMissed = `vs ${vsTeam?.clubName || 'TBD'} (${new Date(nextMatch.matchDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
          } else {
            matchMissed = "Tournament Exit / Final";
          }
        }

        disciplinaryRecords.push({
          playerName: c.playerName,
          playerId: c.playerId,
          teamName: team?.clubName || "Unknown",
          teamLogo: team?.logoUrl || "/placeholder-logo.png",
          type: c.type,
          date: m.matchDate,
          matchMissed
        });
      });
    });

    const topScorers = Object.values(scorerMap)
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 15);

    // Sort disciplinary by date descending
    const disciplinary = disciplinaryRecords.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    res.json({
      topScorers,
      disciplinary
    });
  } catch (err: any) {
    res.status(500).json({ 
      message: "Error compiling tournament statistics.", 
      error: err.message 
    });
  }
});

// GET /api/standings
app.get("/api/standings", async (req: express.Request, res: express.Response) => {
  try {
    const teams = await dbTeam.find();
    const matches = await dbMatch.find({ stage: "Group Stage", status: "Completed" });

    const standings: Record<string, Record<string, any>> = {
      "A": {}, "B": {}, "C": {}
    };

    // Initialize standings for teams that have a group
    teams.forEach(t => {
      if (t.group && standings[t.group]) {
        standings[t.group][t._id.toString()] = {
          teamId: t._id,
          clubName: t.clubName,
          logoUrl: t.logoUrl,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0
        };
      }
    });

    // Calculate match results
    matches.forEach(m => {
      if (!m.group || !standings[m.group]) return;

      const homeStats = standings[m.group][m.homeTeamId];
      const awayStats = standings[m.group][m.awayTeamId];

      if (homeStats && awayStats && m.homeScore !== null && m.awayScore !== null) {
        homeStats.played += 1;
        awayStats.played += 1;
        homeStats.goalsFor += m.homeScore;
        homeStats.goalsAgainst += m.awayScore;
        awayStats.goalsFor += m.awayScore;
        awayStats.goalsAgainst += m.homeScore;

        if (m.homeScore > m.awayScore) {
          homeStats.won += 1;
          homeStats.points += 3;
          awayStats.lost += 1;
        } else if (m.homeScore < m.awayScore) {
          awayStats.won += 1;
          awayStats.points += 3;
          homeStats.lost += 1;
        } else {
          homeStats.drawn += 1;
          awayStats.drawn += 1;
          homeStats.points += 1;
          awayStats.points += 1;
        }

        homeStats.goalDifference = homeStats.goalsFor - homeStats.goalsAgainst;
        awayStats.goalDifference = awayStats.goalsFor - awayStats.goalsAgainst;
      }
    });

    // Convert to arrays and sort
    const formattedStandings = {
      A: Object.values(standings["A"]).sort((a: any, b: any) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor),
      B: Object.values(standings["B"]).sort((a: any, b: any) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor),
      C: Object.values(standings["C"]).sort((a: any, b: any) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor)
    };

    res.json({ standings: formattedStandings });
  } catch (err: any) {
    res.status(500).json({ message: "Error calculating standings.", error: err.message });
  }
});

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`⚽ Magistrate Khadijat Oloyade Under 17 Portal listening on: http://localhost:${PORT}`);
  });
}

export default app;
