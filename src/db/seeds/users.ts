import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
    const sampleUsers = [
        {
            id: 'owner1',
            name: 'Canteen Owner 1',
            email: 'owner1@school.com',
            password: 'owner123',
            role: 'owner',
            wallet_balance: 0,
            pin: '123456',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
        {
            id: 'owner2',
            name: 'Canteen Owner 2',
            email: 'owner2@school.com',
            password: 'owner123',
            role: 'owner',
            wallet_balance: 0,
            pin: '123456',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }
    ];

    for (const user of sampleUsers) {
        const existingUser = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
        
        if (existingUser.length === 0) {
            await db.insert(users).values(user);
            console.log(`✅ Inserted user: ${user.name}`);
        } else {
            console.log(`⚠️ User ${user.name} already exists, skipping...`);
        }
    }
    
    console.log('✅ Users seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});