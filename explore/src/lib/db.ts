import { PrismaClient } from "@prisma/client";
import { databasePath } from "./paths";

process.env.DATABASE_URL ||= `file:${databasePath().replaceAll("\\", "/")}`;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
