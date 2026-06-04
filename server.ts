import express from "express";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { body, validationResult } from "express-validator";
import { v2 as cloudinary } from "cloudinary";
import { connectDB, dbTeam, dbPlayer, dbOfficial, Team, Player, Official } from "./server/db.js";

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "MAGISTRATE_KHADIJAT_OLOYADE_SUPER_SECRET_KEY";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";



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
    email: string;
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
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: "team" | "admin" };
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

// -------------------------------------------------------------
// API CONTROLLERS / ROUTING
// -------------------------------------------------------------

// POST /api/auth/register
app.post(
  "/api/auth/register",
  [
    body("clubName").trim().notEmpty().withMessage("Club Name is required"),
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  async (req: express.Request, res: express.Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { clubName, email, password, logo } = req.body;

    try {
      // Check existing email
      const existing = await dbTeam.findOne({ email });
      if (existing) {
        res.status(400).json({ message: "A club with this email address has already registered." });
        return;
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
        email,
        passwordHash,
        logoUrl: finalLogoUrl
      });

      const token = jwt.sign({ id: team._id, email: team.email, role: "team" }, JWT_SECRET, { expiresIn: "7d" });

      res.status(201).json({
        message: "Registration successful!",
        token,
        team: {
          id: team._id,
          clubName: team.clubName,
          email: team.email,
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
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required")
  ],
  async (req: express.Request, res: express.Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { email, password } = req.body;

    try {
      const team = await dbTeam.findOne({ email });
      if (!team) {
        res.status(401).json({ message: "Invalid email or password." });
        return;
      }

      const isMatch = await bcrypt.compare(password, team.passwordHash);
      if (!isMatch) {
        res.status(401).json({ message: "Invalid email or password." });
        return;
      }

      const token = jwt.sign({ id: team._id, email: team.email, role: "team" }, JWT_SECRET, { expiresIn: "7d" });

      res.json({
        message: "Login successful!",
        token,
        team: {
          id: team._id,
          clubName: team.clubName,
          email: team.email,
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

  const token = jwt.sign({ id: "admin", email: "admin@competition.org", role: "admin" }, JWT_SECRET, { expiresIn: "3d" });
  res.json({
    message: "Admin verification successful!",
    token,
    admin: {
      email: "admin@competition.org",
      role: "admin"
    }
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
        email: team.email,
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

    const { name, age, position, photo } = req.body;

    try {
      // Validate Quota server-side
      const currentPlayers = await dbPlayer.find({ teamId: id });
      
      const parsedAge = parseInt(age, 10);
      const isUnder17Str = parsedAge <= 17;
      const category: "Under-17" | "Free Age" = isUnder17Str ? "Under-17" : "Free Age";

      const totalCount = currentPlayers.length;
      const u17Count = currentPlayers.filter(p => p.category === "Under-17").length;
      const freeAgeCount = currentPlayers.filter(p => p.category === "Free Age").length;

      if (totalCount >= 25) {
        res.status(400).json({ message: "Roster has reached the maximum capacity of 25 players." });
        return;
      }

      if (category === "Under-17" && u17Count >= 21) {
        res.status(400).json({ message: "Under-17 quota is full (Max 21 players)." });
        return;
      }

      if (category === "Free Age" && freeAgeCount >= 4) {
        res.status(400).json({ message: "Free Age quota is full (Max 4 players)." });
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
          email: t.email,
          logoUrl: t.logoUrl,
          createdAt: t.createdAt,
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


if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`⚽ Magistrate Khadijat Oloyade Under 17 Portal listening on: http://localhost:${PORT}`);
  });
}

export default app;
