const fs = require('fs');
const path = require('path');

console.log('🔍 Listing backend routes...\n');

const srcPath = path.join(__dirname, '../src');

function findRoutes(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findRoutes(filePath);
    } else if (file.endsWith('.controller.ts') || file.endsWith('.controller.js')) {
      console.log(`📄 ${file}`);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Find @Controller decorators
        const controllerMatch = content.match(/@Controller\(['"]([^'"]+)['"]\)/);
        if (controllerMatch) {
          console.log(`   Controller: ${controllerMatch[1]}`);
        }
        
        // Find route decorators
        const routeRegex = /@(Get|Post|Put|Delete|Patch)\(['"]([^'"]*)['"]\)/g;
        let match;
        while ((match = routeRegex.exec(content)) !== null) {
          const method = match[1];
          const route = match[2] || '/';
          console.log(`   ${method.padEnd(6)} ${route}`);
        }
        
        console.log();
      } catch (error) {
        console.log(`   Error reading: ${error.message}`);
      }
    }
  });
}

findRoutes(srcPath);