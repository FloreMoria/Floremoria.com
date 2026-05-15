#!/usr/bin/env node
/**
 * Promozione Super Admin sul VPS (senza tsx / senza repo completa).
 * Uso dalla cartella app (es. /var/www/floremoria):
 *   node scripts/server-promote-super-admin.cjs email@esempio.it "SUPER_ADMIN_SETUP_TOKEN"
 */
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');

function loadEnvFiles() {
    const cwd = process.cwd();
    for (const name of ['.env', '.env.local']) {
        const p = resolve(cwd, name);
        if (!existsSync(p)) continue;
        for (const line of readFileSync(p, 'utf8').split('\n')) {
            const t = line.trim();
            if (!t || t.startsWith('#')) continue;
            const i = t.indexOf('=');
            if (i === -1) continue;
            let val = t.slice(i + 1).trim();
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1);
            }
            process.env[t.slice(0, i).trim()] = val;
        }
    }
}

function secureEqual(a, b) {
    if (a.length !== b.length) return false;
    let m = 0;
    for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return m === 0;
}

async function main() {
    loadEnvFiles();

    const email = (process.argv[2] || '').trim().toLowerCase();
    const token = (process.argv[3] || '').trim();
    const expected = (process.env.SUPER_ADMIN_SETUP_TOKEN || '').trim();

    if (!email || !email.includes('@')) {
        console.error('Uso: node scripts/server-promote-super-admin.cjs <email> <SUPER_ADMIN_SETUP_TOKEN>');
        process.exit(1);
    }
    if (!expected || !token || !secureEqual(token, expected)) {
        console.error('Token non valido o SUPER_ADMIN_SETUP_TOKEN assente in .env');
        process.exit(1);
    }
    if (!process.env.DATABASE_URL) {
        console.error('Manca DATABASE_URL in .env nella cartella corrente.');
        process.exit(1);
    }

    const prisma = new PrismaClient();

    try {
        const superAdminRole = await prisma.role.upsert({
            where: { name: 'SUPER_ADMIN' },
            update: { isSystem: true, permissions: { ALL_PRIVILEGES_GRANTED: true } },
            create: {
                name: 'SUPER_ADMIN',
                description: 'Super Admin (solo script offline)',
                isSystem: true,
                permissions: { ALL_PRIVILEGES_GRANTED: true },
            },
        });

        const user = await prisma.user.upsert({
            where: { email },
            update: {
                systemRole: 'SUPER_ADMIN',
                roleId: superAdminRole.id,
                roleExpiresAt: null,
            },
            create: {
                email,
                name: email.split('@')[0] || 'Super Admin',
                systemRole: 'SUPER_ADMIN',
                roleId: superAdminRole.id,
            },
        });

        console.log('OK:', user.email, '→ SUPER_ADMIN');
        console.log('Login su /login con questa email e SUPER_ADMIN_LOGIN_PASSWORD (da .env sul server).');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
