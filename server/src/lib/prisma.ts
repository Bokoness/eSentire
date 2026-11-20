import { PrismaClient } from '@prisma/client';

// One shared client per process. Tests point DATABASE_URL at the test database before importing this.
export const prisma = new PrismaClient();
