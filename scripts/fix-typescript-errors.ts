import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

console.log('🔧 Fixing TypeScript errors...\n');

// 1. Fix campaign.service.ts
const campaignServicePath = join(__dirname, '../src/campaign/campaign.service.ts');
let campaignService = readFileSync(campaignServicePath, 'utf8');

// Remove ICampaign import
campaignService = campaignService.replace(
  "import { Campaign, CampaignEmail, ICampaign } from '../schemas/campaign.schema';",
  "import { Campaign, CampaignEmail } from '../schemas/campaign.schema';"
);

// Add utils import at the top
if (!campaignService.includes("import { getIdString } from '../common/utils';")) {
  campaignService = campaignService.replace(
    "import { DataService } from '../data/data.service';",
    "import { DataService } from '../data/data.service';\nimport { getIdString } from '../common/utils';"
  );
}

// Replace all _id.toString() with getIdString(_id)
campaignService = campaignService.replace(/smtpConfig\._id\.toString\(\)/g, 'getIdString(smtpConfig._id)');
campaignService = campaignService.replace(/campaign\._id\.toString\(\)/g, 'getIdString(campaign._id)');

writeFileSync(campaignServicePath, campaignService);
console.log('✅ Fixed campaign.service.ts');

// 2. Create utils file
const utilsPath = join(__dirname, '../src/common/utils.ts');
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

if (!require('fs').existsSync(utilsPath)) {
  writeFileSync(utilsPath, utilsContent);
  console.log('✅ Created utils.ts');
}

// 3. Fix other files
const filesToFix = [
  {
    path: '../src/auth/auth.service.ts',
    find: '_id.toString()',
    replace: 'getIdString(_id)'
  },
  {
    path: '../src/data/data.service.ts',
    find: 'col.createdAt,',
    replace: '(col as any).createdAt,'
  },
  {
    path: '../src/email/email.service.ts',
    find: '_id.toString()',
    replace: 'getIdString(_id)'
  },
  {
    path: '../src/job/job.service.ts',
    find: '_id.toString()',
    replace: 'getIdString(_id)'
  }
];

filesToFix.forEach(file => {
  const fullPath = join(__dirname, file.path);
  if (require('fs').existsSync(fullPath)) {
    let content = readFileSync(fullPath, 'utf8');
    
    // Add utils import if not present
    if (!content.includes("import { getIdString } from '../common/utils';") && file.find.includes('getIdString')) {
      content = content.replace(
        /import.*from.*;/,
        match => `${match}\nimport { getIdString } from '../common/utils';`
      );
    }
    
    content = content.replace(new RegExp(file.find, 'g'), file.replace);
    writeFileSync(fullPath, content);
    console.log(`✅ Fixed ${file.path}`);
  }
});

// 4. Fix data.controller.ts
const dataControllerPath = join(__dirname, '../src/data/data.controller.ts');
let dataController = readFileSync(dataControllerPath, 'utf8');

if (!dataController.includes("import { getIdString } from '../common/utils';")) {
  dataController = dataController.replace(
    /import.*from.*;/,
    match => `${match}\nimport { getIdString } from '../common/utils';`
  );
}

dataController = dataController.replace(/col\._id\.toString\(\)/g, 'getIdString(col._id)');
writeFileSync(dataControllerPath, dataController);
console.log('✅ Fixed data.controller.ts');

console.log('\n🎉 All TypeScript errors should be fixed!');
console.log('\nRun: npm run build');