import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function checkDB() {
    console.log("Checking Database Environment...");
    const url = process.env.DATABASE_URL || '';
    console.log(`\nLAST 4 CHARS OF DATABASE_URL: ${url.slice(-4)}\n`);

    const log = await prisma.floremoriaLog.findUnique({ where: { id: 6 } });
    if (log && log.fullText) {
        console.log(`DB RECORD ID 6 SNIPPET:\n\n${log.fullText.substring(0, 150)}...\n`);
    } else {
        console.log("No valid fullText for ID 6!");
    }
}

checkDB().catch(console.error).finally(() => prisma.$disconnect());
