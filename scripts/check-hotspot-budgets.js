#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const REPO_ROOT = process.cwd();
const CONFIG_PATH = path.join(REPO_ROOT, 'scripts', 'hotspot-budgets.json');
const REPORT_PATH = path.join(REPO_ROOT, 'docs', 'maintainability', 'hotspot-metrics.md');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getRelativePath(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function getPropertyNameText(name) {
  if (!name) {
    return null;
  }

  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  if (ts.isNoSubstitutionTemplateLiteral(name)) {
    return name.text;
  }

  return null;
}

function getFunctionName(node, sourceFile) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.text;
  }

  if (
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    const memberName = getPropertyNameText(node.name) ?? '<anonymous-member>';
    const classNode = node.parent && ts.isClassLike(node.parent) ? node.parent : null;
    const className = classNode && classNode.name ? classNode.name.text : null;
    return className ? `${className}.${memberName}` : memberName;
  }

  if (ts.isConstructorDeclaration(node)) {
    const classNode = node.parent && ts.isClassLike(node.parent) ? node.parent : null;
    const className = classNode && classNode.name ? classNode.name.text : 'AnonymousClass';
    return `${className}.constructor`;
  }

  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.parent) {
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
      return node.parent.name.text;
    }

    if (ts.isPropertyAssignment(node.parent)) {
      return getPropertyNameText(node.parent.name) ?? '<anonymous-property>';
    }

    let current = node.parent;
    while (current) {
      if (ts.isFunctionLike(current)) {
        const parentName = getFunctionName(current, sourceFile);
        if (parentName) {
          return `${parentName}::closure@${line + 1}`;
        }
      }

      current = current.parent;
    }
  }

  return null;
}

function calculateComplexity(rootNode) {
  let complexity = 1;

  function visit(node) {
    if (node !== rootNode && ts.isFunctionLike(node)) {
      return;
    }

    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
        complexity += 1;
        break;
      case ts.SyntaxKind.CaseClause:
        complexity += 1;
        break;
      default:
        break;
    }

    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      complexity += 1;
    }

    ts.forEachChild(node, visit);
  }

  if (rootNode.body) {
    visit(rootNode.body);
  }

  return complexity;
}

function analyzeFile(relativeFilePath) {
  const absoluteFilePath = path.join(REPO_ROOT, relativeFilePath);
  const sourceText = fs.readFileSync(absoluteFilePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    absoluteFilePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    absoluteFilePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const results = [];

  function visit(node) {
    if (ts.isFunctionLike(node) && node.body) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      results.push({
        complexity: calculateComplexity(node),
        line: line + 1,
        name: getFunctionName(node, sourceFile) ?? `<anonymous@${line + 1}>`,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results.sort((left, right) => {
    if (right.complexity !== left.complexity) {
      return right.complexity - left.complexity;
    }

    return left.line - right.line;
  });
}

function formatBudgetFailure(filePath, metric, budget) {
  return `${filePath}:${metric.line} ${metric.name} complexity ${metric.complexity} exceeds budget ${budget.max}`;
}

function renderReport(config, metricsByFile) {
  const generatedAt = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push('# Hotspot Metrics');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push(
    'Tracked maintainability hotspots and their current cyclomatic complexity budgets. The CI check fails if any monitored function exceeds its budget, and this report should be refreshed after each maintainability wave.',
  );
  lines.push('');
  lines.push('## Wave History');
  lines.push('');
  lines.push('| Wave | Date | Summary |');
  lines.push('|------|------|---------|');

  config.waves.forEach((wave) => {
    lines.push(`| ${wave.name} | ${wave.date} | ${wave.summary} |`);
  });

  lines.push('');
  lines.push('## Budgeted Hotspots');
  lines.push('');

  Object.entries(config.files).forEach(([filePath, fileConfig]) => {
    const metrics = metricsByFile.get(filePath) ?? [];
    const metricByName = new Map(metrics.map((metric) => [metric.name, metric]));

    lines.push(`### ${filePath}`);
    lines.push('');
    lines.push(fileConfig.reason);
    lines.push('');
    lines.push('| Function | Line | Current complexity | Budget | Status |');
    lines.push('|----------|------|--------------------|--------|--------|');

    fileConfig.budgets.forEach((budget) => {
      const metric = metricByName.get(budget.name);
      if (!metric) {
        lines.push(`| ${budget.name} | — | Missing | ${budget.max} | Needs review |`);
        return;
      }

      const status = metric.complexity <= budget.max ? 'PASS' : 'FAIL';
      lines.push(
        `| ${budget.name} | ${metric.line} | ${metric.complexity} | ${budget.max} | ${status} |`,
      );
    });

    lines.push('');
  });

  return `${lines.join('\n')}\n`;
}

function main() {
  const shouldWrite = process.argv.includes('--write-report');
  const config = readJson(CONFIG_PATH);
  const metricsByFile = new Map();
  const failures = [];

  Object.entries(config.files).forEach(([filePath, fileConfig]) => {
    const metrics = analyzeFile(filePath);
    metricsByFile.set(filePath, metrics);

    const metricByName = new Map(metrics.map((metric) => [metric.name, metric]));
    fileConfig.budgets.forEach((budget) => {
      const metric = metricByName.get(budget.name);
      if (!metric) {
        failures.push(`${filePath}: missing tracked function ${budget.name}`);
        return;
      }

      if (metric.complexity > budget.max) {
        failures.push(formatBudgetFailure(filePath, metric, budget));
      }
    });
  });

  if (shouldWrite) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, renderReport(config, metricsByFile));
    console.log(`Wrote hotspot report to ${getRelativePath(REPORT_PATH)}`);
  }

  if (failures.length > 0) {
    console.error('Hotspot complexity budget check failed.\n');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  const trackedFunctions = Object.values(config.files).reduce(
    (count, fileConfig) => count + fileConfig.budgets.length,
    0,
  );
  console.log(
    `Hotspot complexity budgets passed: ${trackedFunctions} tracked functions across ${Object.keys(config.files).length} files.`,
  );
}

main();
