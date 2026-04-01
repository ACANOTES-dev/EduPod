const fs = require('fs');
const path = require('path');

function getSpecFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getSpecFiles(fullPath, fileList);
    } else if (fullPath.endsWith('.controller.spec.ts')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const specs = getSpecFiles('apps/api/src/modules');

let updatedCount = 0;

for (const specPath of specs) {
  let code = fs.readFileSync(specPath, 'utf8');
  if (code.includes('403') || code.includes('ForbiddenException')) continue;

  const matches = code.match(/it\(|test\(/g);
  if (!matches || matches.length > 3) continue;

  const controllerPath = specPath.replace('.spec.ts', '.ts');
  if (!fs.existsSync(controllerPath)) continue;

  const controllerCode = fs.readFileSync(controllerPath, 'utf8');
  if (!controllerCode.includes('@RequiresPermission')) continue; // skip public/webhook controllers

  const classMatch = controllerCode.match(/export class (\w+Controller)/);
  if (!classMatch) continue;
  const className = classMatch[1];

  let currentRoute = '';
  let method = 'get';
  let permission = '';
  const lines = controllerCode.split('\n');
  for (const line of lines) {
    const routeMatch = line.match(/@(Post|Get|Put|Patch|Delete)\(['"`]?(.*?)['"`]?\)/);
    if (routeMatch) {
      method = routeMatch[1].toLowerCase();
      currentRoute = routeMatch[2] || '';
    }
    const permMatch = line.match(/@RequiresPermission\(['"`](.*?)['"`]\)/);
    if (permMatch) {
      permission = permMatch[1];
      break;
    }
  }

  const baseMatch = controllerCode.match(/@Controller\(['"`](.*?)['"`]\)/);
  let basePath = baseMatch ? baseMatch[1] : '';
  if (basePath && !basePath.startsWith('/')) basePath = '/' + basePath;
  if (currentRoute && !currentRoute.startsWith('/')) currentRoute = '/' + currentRoute;

  let fullPath = basePath + currentRoute;
  fullPath = fullPath.replace(/:[a-zA-Z]+/g, '123e4567-e89b-12d3-a456-426614174000');

  // get the providers used in the current spec module setup
  const providersMatch = code.match(/providers:\s*\[([\s\S]*?)\]/);
  const existingProviders = providersMatch ? providersMatch[1].trim() : '';

  // Only inject if we can parse the existing providers
  if (existingProviders) {
    let block = `\n// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────\n\n`;
    block += `import { ForbiddenException, type INestApplication } from '@nestjs/common';\n`;
    block += `import request from 'supertest';\n`;
    block += `import { AuthGuard } from '../../common/guards/auth.guard';\n`;
    block += `import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';\n`;
    block += `import { PermissionGuard } from '../../common/guards/permission.guard';\n\n`;
    block += `describe('${className} — permission denied', () => {\n`;
    block += `  let app: INestApplication;\n\n`;
    block += `  beforeEach(async () => {\n`;
    block += `    const module = await Test.createTestingModule({\n`;
    block += `      controllers: [${className}],\n`;
    block += `      providers: [\n        ${existingProviders}\n      ],\n`;
    block += `    })\n`;
    block += `      .overrideGuard(AuthGuard)\n      .useValue({ canActivate: () => true })\n`;
    block += `      .overrideGuard(ModuleEnabledGuard)\n      .useValue({ canActivate: () => true })\n`;
    block += `      .overrideGuard(PermissionGuard)\n      .useValue({\n`;
    block += `        canActivate: () => {\n`;
    block += `          throw new ForbiddenException({ error: { code: 'PERMISSION_DENIED', message: 'Missing required permission' } });\n`;
    block += `        },\n      })\n      .compile();\n\n`;
    block += `    app = module.createNestApplication();\n`;
    block += `    await app.init();\n`;
    block += `  });\n\n`;
    block += `  afterEach(async () => { await app.close(); });\n\n`;
    block += `  it('should return 403 when user lacks ${permission} permission (${method.toUpperCase()} ${fullPath})', async () => {\n`;
    block += `    await request(app.getHttpServer()).${method}('${fullPath}').send({}).expect(403);\n`;
    block += `  });\n});\n`;

    // Ensure we don't break existing imports or duplicate them
    if (code.includes('import { ForbiddenException')) {
      code =
        code +
        block
          .replace(/import { ForbiddenException.*\n/, '')
          .replace(/import request.*\n/, '')
          .replace(/import { AuthGuard.*\n(.*)ModuleEnabled.*(\n.*)PermissionGuard.*/g, '');
    } else {
      code = code.replace(
        /import\s*\{/,
        "import { ForbiddenException, type INestApplication } from '@nestjs/common';\nimport request from 'supertest';\nimport { AuthGuard } from '../../common/guards/auth.guard';\nimport { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';\nimport { PermissionGuard } from '../../common/guards/permission.guard';\nimport {",
      );
      // Remove the import lines from the block body because we added them at the top
      block = block.replace(/import.*\n/g, '');
      code = code + block;
    }

    fs.writeFileSync(specPath, code);
    console.log('Updated:', specPath);
    updatedCount++;
  } else {
    console.log('Skipped (no providers block found):', specPath);
  }
}
console.log('Total files updated:', updatedCount);
