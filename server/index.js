import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getProfileReport } from "./src/github.js";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), ".env") });

const app = express();
const port = Number(process.env.PORT) || 4000;
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), "../client/dist");

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/profile/:username", async (request, response, next) => {
  try {
    const report = await getProfileReport(request.params.username);
    response.json(report);
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "API endpoint not found." });
});

app.use(express.static(clientDist));
app.get(/.*/, (_request, response) => {
  response.sendFile(resolve(clientDist, "index.html"));
});

app.use((error, _request, response, _next) => {
  const status = Number.isInteger(error.status) ? error.status : 500;
  response.status(status).json({
    error: error.message || "Unable to load this GitHub profile.",
  });
});

app.listen(port, () => {
  console.log(`gh-profiler API listening on http://localhost:${port}`);
});
