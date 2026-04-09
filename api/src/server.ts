import Fastify from "fastify";
import cors   from "@fastify/cors";
import { scanRoutes } from "./routes/scan.js";
import { jiraRoutes } from "./routes/jira.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" });
await app.register(scanRoutes);
await app.register(jiraRoutes);

await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });