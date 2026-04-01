#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const REPO_ROOT = process.cwd();
const WEB_SRC_DIR = path.join(REPO_ROOT, 'apps', 'web', 'src');
const BASELINE_PATH = path.join(REPO_ROOT, 'scripts', 'i18n-baseline.json');
const LOCALE_FILES = {
  en: path.join(REPO_ROOT, 'apps', 'web', 'messages', 'en.json'),
  ar: path.join(REPO_ROOT, 'apps', 'web', 'messages', 'ar.json'),
};
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const TEST_FILE_PATTERN = /\.(spec|test)\.tsx?$/;
const TRANSLATION_FACTORY_NAMES = new Set(['useTranslations', 'getTranslations']);
const TRANSLATION_METHOD_NAMES = new Set(['rich', 'has', 'markup', 'raw']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function flattenMessages(value, prefix = '', target = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const nextPrefix = prefix ? `${prefix}.${index}` : String(index);
      flattenMessages(entry, nextPrefix, target);
    });
    return target;
  }

  if (value !== null && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenMessages(entry, nextPrefix, target);
    });
    return target;
  }

  target.set(prefix, value);
  return target;
}

function walkFiles(rootDir) {
  const files = [];

  function visit(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.next') {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !TEST_FILE_PATTERN.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  visit(rootDir);
  return files.sort();
}

function isStringLiteralLike(node) {
  return (
    ts.isStringLiteral(node) ||
    (ts.isNoSubstitutionTemplateLiteral(node) && typeof node.text === 'string')
  );
}

function getLiteralText(node) {
  return node.text;
}

function getPropertyNameText(node) {
  if (!node) {
    return null;
  }

  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  return null;
}

function getNamespaceArgument(callExpression) {
  const [firstArgument] = callExpression.arguments;
  if (!firstArgument || !isStringLiteralLike(firstArgument)) {
    return null;
  }

  return getLiteralText(firstArgument);
}

function buildQualifiedKey(namespace, key) {
  if (!namespace) {
    return key;
  }

  return key ? `${namespace}.${key}` : namespace;
}

function getRelativePath(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function collectTranslatorBindings(sourceFile) {
  const bindings = new Map();
  const staticUsages = [];
  const dynamicUsages = [];

  function registerBinding(name, namespace) {
    bindings.set(name, namespace);
  }

  function recordUsage(key, filePath, line, column) {
    staticUsages.push({ key, filePath, line, column });
  }

  function recordDynamicUsage(expressionText, filePath, line, column) {
    dynamicUsages.push({ expressionText, filePath, line, column });
  }

  function getTranslatorNamespaceFromCall(callExpression) {
    if (!ts.isIdentifier(callExpression.expression)) {
      return undefined;
    }

    if (!TRANSLATION_FACTORY_NAMES.has(callExpression.expression.text)) {
      return undefined;
    }

    return getNamespaceArgument(callExpression);
  }

  function resolveCalleeBinding(expression) {
    if (ts.isIdentifier(expression)) {
      return bindings.get(expression.text);
    }

    if (ts.isPropertyAccessExpression(expression)) {
      if (!ts.isIdentifier(expression.expression)) {
        return undefined;
      }

      const binding = bindings.get(expression.expression.text);
      if (binding === undefined) {
        return undefined;
      }

      if (!TRANSLATION_METHOD_NAMES.has(expression.name.text)) {
        return undefined;
      }

      return binding;
    }

    return undefined;
  }

  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (ts.isCallExpression(node.initializer)) {
        const namespace = getTranslatorNamespaceFromCall(node.initializer);
        if (namespace !== undefined) {
          registerBinding(node.name.text, namespace);
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      ts.isCallExpression(node.right)
    ) {
      const namespace = getTranslatorNamespaceFromCall(node.right);
      if (namespace !== undefined) {
        registerBinding(node.left.text, namespace);
      }
    }

    if (ts.isCallExpression(node)) {
      const namespace = resolveCalleeBinding(node.expression);
      if (namespace !== undefined) {
        const [firstArgument] = node.arguments;
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        const filePath = getRelativePath(sourceFile.fileName);

        if (firstArgument && isStringLiteralLike(firstArgument)) {
          recordUsage(
            buildQualifiedKey(namespace, getLiteralText(firstArgument)),
            filePath,
            line + 1,
            character + 1,
          );
        } else {
          recordDynamicUsage(
            firstArgument ? firstArgument.getText(sourceFile) : '<missing key>',
            filePath,
            line + 1,
            character + 1,
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    dynamicUsages,
    staticUsages,
  };
}

function compareLocaleParity(localeMaps) {
  const missingByLocale = new Map();
  const allKeys = new Set();

  Object.values(localeMaps).forEach((messagesMap) => {
    messagesMap.forEach((_, key) => {
      allKeys.add(key);
    });
  });

  for (const [locale, messagesMap] of Object.entries(localeMaps)) {
    const missingKeys = [];
    for (const key of allKeys) {
      if (!messagesMap.has(key)) {
        missingKeys.push(key);
      }
    }

    missingByLocale.set(locale, missingKeys.sort());
  }

  return missingByLocale;
}

function toSortedArrays(recordLike) {
  return Object.fromEntries(
    Object.entries(recordLike).map(([key, values]) => [key, [...values].sort()]),
  );
}

function diffValues(currentValues, baselineValues) {
  const baselineSet = new Set(baselineValues);
  return currentValues.filter((value) => !baselineSet.has(value));
}

function main() {
  const shouldWriteBaseline = process.argv.includes('--write-baseline');
  const localeMaps = Object.fromEntries(
    Object.entries(LOCALE_FILES).map(([locale, filePath]) => [
      locale,
      flattenMessages(readJson(filePath)),
    ]),
  );

  const files = walkFiles(WEB_SRC_DIR);
  const usedKeys = new Map();
  const dynamicUsages = [];

  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const { staticUsages, dynamicUsages: fileDynamicUsages } =
      collectTranslatorBindings(sourceFile);

    for (const usage of staticUsages) {
      if (!usedKeys.has(usage.key)) {
        usedKeys.set(usage.key, usage);
      }
    }

    dynamicUsages.push(...fileDynamicUsages);
  }

  const missingByLocale = new Map();
  for (const [locale, messagesMap] of Object.entries(localeMaps)) {
    const missingKeys = [];
    for (const [key, usage] of usedKeys.entries()) {
      if (!messagesMap.has(key)) {
        missingKeys.push({ key, usage });
      }
    }

    missingByLocale.set(
      locale,
      missingKeys.sort((left, right) => left.key.localeCompare(right.key)),
    );
  }

  const parityGaps = compareLocaleParity(localeMaps);
  const currentSnapshot = {
    missingReferencedKeys: Object.fromEntries(
      [...missingByLocale.entries()].map(([locale, values]) => [
        locale,
        values.map((entry) => entry.key),
      ]),
    ),
    parityGaps: toSortedArrays(Object.fromEntries(parityGaps.entries())),
  };

  if (shouldWriteBaseline || !fs.existsSync(BASELINE_PATH)) {
    writeJson(BASELINE_PATH, currentSnapshot);
    console.log(`Wrote i18n baseline to ${getRelativePath(BASELINE_PATH)}`);
    return;
  }

  const baseline = readJson(BASELINE_PATH);
  const failures = [];

  for (const locale of Object.keys(LOCALE_FILES)) {
    const currentMissing = currentSnapshot.missingReferencedKeys[locale] ?? [];
    const baselineMissing = baseline.missingReferencedKeys?.[locale] ?? [];
    const unexpectedMissing = diffValues(currentMissing, baselineMissing);

    if (unexpectedMissing.length > 0) {
      failures.push(`New missing referenced keys in ${locale}.json:`);
      unexpectedMissing.slice(0, 50).forEach((key) => {
        const usage = missingByLocale.get(locale)?.find((entry) => entry.key === key)?.usage;
        if (usage) {
          failures.push(`  - ${key} (${usage.filePath}:${usage.line}:${usage.column})`);
        } else {
          failures.push(`  - ${key}`);
        }
      });

      if (unexpectedMissing.length > 50) {
        failures.push(`  ... ${unexpectedMissing.length - 50} more`);
      }
    }

    const currentParity = currentSnapshot.parityGaps[locale] ?? [];
    const baselineParity = baseline.parityGaps?.[locale] ?? [];
    const unexpectedParity = diffValues(currentParity, baselineParity);

    if (unexpectedParity.length > 0) {
      failures.push(`New locale parity gaps for ${locale}.json:`);
      unexpectedParity.slice(0, 50).forEach((key) => {
        failures.push(`  - ${key}`);
      });

      if (unexpectedParity.length > 50) {
        failures.push(`  ... ${unexpectedParity.length - 50} more`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('i18n completeness check failed.\n');
    failures.forEach((line) => console.error(line));

    if (dynamicUsages.length > 0) {
      console.error('\nDynamic translation keys were skipped during static validation:');
      dynamicUsages.slice(0, 25).forEach((usage) => {
        console.error(
          `  - ${usage.expressionText} (${usage.filePath}:${usage.line}:${usage.column})`,
        );
      });

      if (dynamicUsages.length > 25) {
        console.error(`  ... ${dynamicUsages.length - 25} more`);
      }
    }

    process.exitCode = 1;
    return;
  }

  console.log(
    `i18n completeness check passed: ${usedKeys.size} static translation keys verified across ${files.length} source files.`,
  );
  console.log(
    `Baseline tracked missing keys: en=${currentSnapshot.missingReferencedKeys.en.length}, ar=${currentSnapshot.missingReferencedKeys.ar.length}`,
  );
  console.log(
    `Baseline tracked parity gaps: en=${currentSnapshot.parityGaps.en.length}, ar=${currentSnapshot.parityGaps.ar.length}`,
  );

  if (dynamicUsages.length > 0) {
    console.log(`Dynamic translation keys skipped: ${dynamicUsages.length}`);
  }
}

main();
