const fs = require('fs');
const path = require('path');

function getSpecFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getSpecFiles(fullPath, fileList);
    } else if (fullPath.endsWith('.spec.ts')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const specs = getSpecFiles('apps/api/src/modules');

let updatedCount = 0;

for (const specPath of specs) {
  let code = fs.readFileSync(specPath, 'utf8');

  // Find lines like: expect(e).toBeInstanceOf(ForbiddenException);
  const regex = /expect\(([^)]+)\)\.toBeInstanceOf\(([^)]+Exception)\);/g;

  if (regex.test(code)) {
    code = code.replace(regex, (match, errVar, exceptionClass) => {
      return `expect(${errVar}).toBeInstanceOf(${exceptionClass});\n      expect(${errVar}).toMatchObject({ response: { code: expect.any(String) } });`;
    });

    fs.writeFileSync(specPath, code);
    console.log('Upgraded assertions in:', specPath);
    updatedCount++;
  }
}

console.log('Total files upgraded:', updatedCount);
