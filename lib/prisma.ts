import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
    return new PrismaClient();
};

declare global {
    var prismaGlobal3: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal3 ?? prismaClientSingleton();

export default prisma;

globalThis.prismaGlobal3 = prisma;

