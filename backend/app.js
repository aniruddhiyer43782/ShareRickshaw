import express from "express";
import cors from "cors";
import fareRoutes from "./routes/fare.js";

const app = express();
app.use(cors());
app.use(express.json());

// route for testing
app.get("/", (req, res) => {
  res.send("🚖 ShareRickshaw Backend Running...");
});

// connect fare route
app.use("/api/fare", fareRoutes);

const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Node.js backend running on http://localhost:${PORT}`));
