import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
try {
  await db.$transaction([
    db.reviewAttempt.deleteMany(),
    db.star.deleteMany(),
    db.card.deleteMany(),
    db.tree.deleteMany(),
    db.document.deleteMany(),
  ]);
} finally {
  await db.$disconnect();
}
