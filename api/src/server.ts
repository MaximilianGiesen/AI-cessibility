import Fastify from "fastify";
import cors   from "@fastify/cors";
import { scanRoutes } from "./routes/scan.js";
import { jiraRoutes } from "./routes/jira.js";

const app = Fastify({ logger: true });

await app.register(cors, {
    origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",")
        : ["http://localhost:5173", "http://localhost:5174"],
    methods:        ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
});
await app.register(scanRoutes);
await app.register(jiraRoutes);

await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });