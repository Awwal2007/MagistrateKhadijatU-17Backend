import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { dbTeam, connectDB } from "./server/db.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not defined in .env file");
  process.exit(1);
}

const seedClubs = async () => {
  try {
    await connectDB();

    // Drop legacy email index if it exists
    try {
      await mongoose.connection.collection('teams').dropIndex('email_1');
      console.log("🗑️ Dropped legacy 'email' index.");
    } catch (e: any) {
      if (e.codeName !== 'IndexNotFound') {
        console.warn("⚠️ Could not drop email index:", e.message);
      }
    }

    const passwordHash = await bcrypt.hash("abc123", 10);

    const clubsToSeed = [
      {
        clubName: "Telu FC",
        username: "telufc",
        passwordHash,
        logoUrl: "https://i.postimg.cc/crMtjypP/Whats-App-Image-2026-06-04-at-9-41-16-PM.jpg",
      },
      {
        clubName: "Al-Eeman FC",
        username: "al-eeman",
        passwordHash,
        logoUrl: "https://i.postimg.cc/YL7qfjCj/Whats-App-Image-2026-06-04-at-9-34-14-PM-(1).jpg",
      },
      {
        clubName: "Sparkle FA",
        username: "sparklefa",
        passwordHash,
        logoUrl: "https://i.postimg.cc/QV6MwQSf/Whats-App-Image-2026-06-04-at-9-34-12-PM.jpg",
      },
      {
        clubName: "FC Dynamic",
        username: "fcdynamic",
        passwordHash,
        logoUrl: "https://i.postimg.cc/cKmWYWbh/Whats-App-Image-2026-06-04-at-9-34-14-PM.jpg",
      },
      {
        clubName: "Bright Stars FC",
        username: "brightstar",
        passwordHash,
        logoUrl: "https://i.postimg.cc/BjffVtWk/Whats-App-Image-2026-06-04-at-9-34-16-PM.jpg",
      },
      {
        clubName: "Emperor FC",
        username: "emperorfc",
        passwordHash,
        logoUrl: "https://i.postimg.cc/dD9WY1TB/Whats-App-Image-2026-06-04-at-10-30-16-PM.jpg",
      },
      {
        clubName: "Lillafi FC",
        username: "lillafifc",
        passwordHash,
        logoUrl: "https://i.postimg.cc/xCWnnPZN/Whats-App-Image-2026-06-05-at-4-19-54-AM.jpg",
      },
      {
        clubName: "Greater FC",
        username: "greaterfc",
        passwordHash,
        logoUrl: "https://i.postimg.cc/TyHkBHLR/Whats-App-Image-2026-06-04-at-9-32-52-PM.jpg",
      },
      {
        clubName: "D Prince FC",
        username: "dprincefc",
        passwordHash,
        logoUrl: "https://i.postimg.cc/kVZcT6zX/Whats-App-Image-2026-06-04-at-9-34-13-PM.jpg",
      },
      {
        clubName: "IMO FA",
        username: "imofa",
        passwordHash,
        logoUrl: "https://i.postimg.cc/bZVHvSzs/Whats-App-Image-2026-06-04-at-9-32-51-PM.jpg",
      },
      {
        clubName: "Mascot FC",
        username: "mascotfc",
        passwordHash,
        logoUrl: "https://i.postimg.cc/RJmwYcRZ/Whats-App-Image-2026-06-04-at-9-42-20-PM.jpg",
      },
      {
        clubName: "Professor FC",
        username: "professorfc",
        passwordHash,
        logoUrl: "https://i.postimg.cc/fk7PRC17/Whats-App-Image-2026-06-04-at-9-37-00-PM.jpg",
      },
      {
        clubName: "Alamu Testing",
        username: "alamutest",
        passwordHash,
        logoUrl: "https://i.postimg.cc/crMtjypP/Whats-App-Image-2026-06-04-at-9-41-16-PM.jpg",
      },
    ];

    let createdCount = 0;
    for (const club of clubsToSeed) {
      const existing = await dbTeam.findOne({ username: club.username });
      if (!existing) {
        await dbTeam.create(club);
        console.log(`➕ Created club: ${club.clubName} (User: ${club.username})`);
        createdCount++;
      } else {
        console.log(`⏭️ Club already exists: ${club.clubName}`);
      }
    }

    console.log(`🎉 Seeding completed successfully! Created ${createdCount} new clubs.`);
    console.log("Default password for all seeded clubs is: abc123");
    
    // Disconnect properly
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding clubs:", err);
    process.exit(1);
  }
};

seedClubs();
