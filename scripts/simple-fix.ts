import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

console.log('🔧 Creating utils.ts...\n');

// Create common directory if it doesn't exist
const commonDir = join(__dirname, '../src/common');
if (!existsSync(commonDir)) {
  mkdirSync(commonDir, { recursive: true });
}

// Create utils.ts
const utilsPath = join(commonDir, 'utils.ts');
const utilsContent = `import { Types } from 'mongoose';

export function getIdString(id: any): string {
  if (id instanceof Types.ObjectId) {
    return id.toString();
  }
  if (typeof id === 'string') {
    return id;
  }
  if (id && id._id) {
    return getIdString(id._id);
  }
  if (id && typeof id.toString === 'function') {
    return id.toString();
  }
  return String(id);
}

export function assertId(id: any): Types.ObjectId {
  if (id instanceof Types.ObjectId) {
    return id;
  }
  if (typeof id === 'string') {
    return new Types.ObjectId(id);
  }
  throw new Error('Invalid id format');
}
`;

writeFileSync(utilsPath, utilsContent);
console.log('✅ Created src/common/utils.ts');

console.log('\n📋 Manual fixes needed:');
console.log('\n1. Add this import to files using _id.toString():');
console.log('   import { getIdString } from \'../common/utils\';');
console.log('\n2. Replace all _id.toString() with getIdString(_id)');
console.log('\n3. In auth.service.ts, add missing methods:');
console.log('   - validateUser()');
console.log('   - getUserById()');
console.log('\n4. In campaign.service.ts, remove ICampaign from import');
console.log('\n5. In test-data.ts, fix imports to use require()');
console.log('\n🎯 Quick fix commands:');
console.log('cd backend');
console.log('npm run build');
console.log('\nIf still errors, run: npx tsc --noEmit');