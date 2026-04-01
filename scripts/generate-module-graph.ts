/**
 * generate-module-graph.ts
 *
 * Scans all *.module.ts files in apps/api/src/modules/, parses their
 * imports: [...] arrays, and writes a Mermaid dependency diagram to
 * architecture/module-dependency-graph.md
 *
 * Usage:
 *   npx tsx scripts/generate-module-graph.ts
 *
 * The script uses simple regex/string parsing (no AST) and handles:
 *   - Standard module imports: SomeModule
 *   - forwardRef(() => SomeModule) patterns
 *   - BullModule.registerQueue(...) — skipped (not a module dep)
 *   - ConfigModule from @nestjs/config — skipped (infrastructure)
 *
 * Infrastructure modules excluded from the diagram:
 *   PrismaModule, RedisModule, CommonModule, SentryModule, BullModule
 */
import * as fs from 'fs';
import * as path from 'path';

// ─── Resolve paths ────────────────────────────────────────────────────────────

const __scriptDir: string =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(path.resolve(process.argv[1]));

const MODULES_ROOT = path.resolve(__scriptDir, '..', 'apps', 'api', 'src', 'modules');
const OUTPUT_FILE = path.resolve(__scriptDir, '..', 'architecture', 'module-dependency-graph.md');

// ─── Infrastructure modules to exclude ───────────────────────────────────────
// These are plumbing — their presence in the diagram adds noise, not insight.

const EXCLUDED_MODULES = new Set([
  'PrismaModule',
  'RedisModule',
  'CommonModule',
  'SentryModule',
  'BullModule',
  // NestJS built-ins often referenced by name
  'ConfigModule',
  'NestConfigModule',
]);

// ─── Domain groupings for Mermaid subgraphs ───────────────────────────────────

interface Tier {
  label: string;
  // Partial module name matches (case-insensitive prefix or substring)
  matches: string[];
}

const TIERS: Tier[] = [
  {
    label: 'Core Infrastructure',
    matches: ['AuthModule', 'TenantsModule', 'ApprovalsModule'],
  },
  {
    label: 'Student & Academic',
    matches: [
      'StudentsModule',
      'AcademicsModule',
      'ClassesModule',
      'AttendanceModule',
      'GradebookModule',
      'HomeworkModule',
      'SchedulingModule',
      'SchedulingRunsModule',
      'SchedulesModule',
      'PeriodGridModule',
      'ClassRequirementsModule',
      'StaffAvailabilityModule',
      'StaffPreferencesModule',
      'SchoolClosuresModule',
      'RoomsModule',
      'AcademicPeriodsModule',
      'ReportCardModule',
    ],
  },
  {
    label: 'Pastoral & Wellbeing',
    matches: [
      'PastoralModule',
      'PastoralCoreModule',
      'PastoralCasesModule',
      'PastoralAdminModule',
      'PastoralCheckinsSubModule',
      'PastoralCriticalIncidentsModule',
      'PastoralSstModule',
      'BehaviourModule',
      'BehaviourCoreModule',
      'BehaviourAdminModule',
      'BehaviourAnalyticsModule',
      'BehaviourDisciplineModule',
      'BehaviourRecognitionModule',
      'BehaviourSafeguardingModule',
      'SenModule',
      'ChildProtectionModule',
      'CriticalIncidentsModule',
      'SecurityIncidentsModule',
      'HealthModule',
      'StaffWellbeingModule',
      'PastoralCheckinsModule',
      'PastoralDsarModule',
    ],
  },
  {
    label: 'Finance & HR',
    matches: ['FinanceModule', 'PayrollModule', 'HouseholdsModule'],
  },
  {
    label: 'People',
    matches: ['StaffProfilesModule', 'ParentsModule', 'AdmissionsModule', 'RegistrationModule'],
  },
  {
    label: 'Communications & Engagement',
    matches: ['CommunicationsModule', 'EngagementModule', 'ParentInquiriesModule', 'WebsiteModule'],
  },
  {
    label: 'Platform & Config',
    matches: [
      'ConfigurationModule',
      'PreferencesModule',
      'RbacModule',
      'DashboardModule',
      'ReportsModule',
      'SearchModule',
      'ImportsModule',
      'AuditLogModule',
      'EarlyWarningModule',
      'ComplianceModule',
      'RegulatoryModule',
      'GdprModule',
    ],
  },
  {
    label: 'Shared Services',
    matches: ['PdfRenderingModule', 'S3Module'],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModuleInfo {
  className: string; // e.g. "BehaviourModule"
  filePath: string;
  imports: string[]; // Other module class names this module imports
}

// ─── File collection ──────────────────────────────────────────────────────────

function collectModuleFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectModuleFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.module.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Import parsing ───────────────────────────────────────────────────────────

/**
 * Extracts the class name declared in the @Module({...}) imports array.
 * Handles:
 *   - Plain tokens:           SomeModule
 *   - forwardRef:             forwardRef(() => SomeModule)
 *   - BullModule.register...: skipped entirely
 *   - TypeOrmModule.for...:   skipped
 */
function parseImportsArray(content: string): string[] {
  // Find the @Module decorator block. We capture everything from @Module( to
  // the matching closing paren. To handle nesting, we walk character by character.
  const moduleStart = content.indexOf('@Module(');
  if (moduleStart === -1) return [];

  // Locate the imports: [...] key inside the decorator
  const importsKeyMatch = content.indexOf('imports:', moduleStart);
  if (importsKeyMatch === -1) return [];

  // Find the opening bracket of the imports array
  const bracketOpen = content.indexOf('[', importsKeyMatch);
  if (bracketOpen === -1) return [];

  // Walk to find matching close bracket
  let depth = 1;
  let i = bracketOpen + 1;
  while (i < content.length && depth > 0) {
    if (content[i] === '[') depth++;
    else if (content[i] === ']') depth--;
    i++;
  }
  const bracketClose = i - 1;

  const importsBody = content.slice(bracketOpen + 1, bracketClose);

  const found: string[] = [];

  // Split by commas at the top level (don't split inside nested parens)
  const tokens = splitTopLevel(importsBody);

  for (const rawToken of tokens) {
    const token = rawToken.trim().replace(/\s+/g, ' ');
    if (!token) continue;

    // Skip BullModule.register*, TypeOrmModule.for*, etc.
    if (/^BullModule\s*\./.test(token)) continue;
    if (/^TypeOrmModule\s*\./.test(token)) continue;
    if (/^ConfigModule\s*\./.test(token)) continue;
    if (/^NestConfigModule\s*\./.test(token)) continue;
    if (/^JwtModule\s*\./.test(token)) continue;
    if (/^PassportModule\s*\./.test(token)) continue;
    if (/^SequelizeModule\s*\./.test(token)) continue;
    if (/^MongooseModule\s*\./.test(token)) continue;
    if (/^MulterModule\s*\./.test(token)) continue;
    if (/^ThrottlerModule\s*\./.test(token)) continue;
    if (/^EventEmitterModule\s*\./.test(token)) continue;
    if (/^ScheduleModule\s*\./.test(token)) continue;
    if (/^ServeStaticModule\s*\./.test(token)) continue;

    // Handle forwardRef(() => SomeName)
    const forwardRefMatch = token.match(/forwardRef\s*\(\s*\(\s*\)\s*=>\s*(\w+)\s*\)/);
    if (forwardRefMatch) {
      const name = forwardRefMatch[1];
      if (name && !EXCLUDED_MODULES.has(name)) {
        found.push(name);
      }
      continue;
    }

    // Plain identifier — must match a PascalCase module name
    const plainMatch = token.match(/^([A-Z]\w*)$/);
    if (plainMatch) {
      const name = plainMatch[1];
      if (!EXCLUDED_MODULES.has(name)) {
        found.push(name);
      }
      continue;
    }

    // Chained call like NestConfigModule.forRoot(...) already filtered above.
    // Any other chained call we don't recognise — skip silently.
  }

  return [...new Set(found)]; // deduplicate
}

/**
 * Splits a string by commas, but respects parentheses and bracket nesting
 * so that e.g. `BullModule.registerQueue({ name: 'a' }, { name: 'b' })`
 * is not split in the middle.
 */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

/**
 * Extract the exported class name from a module file.
 * Looks for: export class SomeName {
 */
function extractClassName(content: string): string | null {
  const match = content.match(/export\s+class\s+(\w+)/);
  return match ? (match[1] ?? null) : null;
}

// ─── Graph building ───────────────────────────────────────────────────────────

function buildGraph(files: string[]): ModuleInfo[] {
  const modules: ModuleInfo[] = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const className = extractClassName(content);
    if (!className) continue;

    // Skip excluded infrastructure modules
    if (EXCLUDED_MODULES.has(className)) continue;

    const imports = parseImportsArray(content);
    modules.push({ className, filePath, imports });
  }

  return modules;
}

// ─── Mermaid generation ───────────────────────────────────────────────────────

function assignTier(className: string): string | null {
  for (const tier of TIERS) {
    if (tier.matches.includes(className)) {
      return tier.label;
    }
  }
  return null;
}

function sanitizeId(name: string): string {
  // Mermaid node IDs cannot contain spaces — names are already PascalCase so fine as-is
  return name;
}

function generateMermaid(modules: ModuleInfo[]): string {
  const allClassNames = new Set(modules.map((m) => m.className));

  // Build a map: tier label → module names
  const tierMap = new Map<string, string[]>();
  const untiered: string[] = [];

  for (const mod of modules) {
    const tier = assignTier(mod.className);
    if (tier) {
      const existing = tierMap.get(tier) ?? [];
      existing.push(mod.className);
      tierMap.set(tier, existing);
    } else {
      untiered.push(mod.className);
    }
  }

  const lines: string[] = [];
  lines.push('graph TD');
  lines.push('');

  // Emit subgraphs for each tier (in TIERS order)
  for (const tier of TIERS) {
    const members = tierMap.get(tier.label);
    if (!members || members.length === 0) continue;

    // Sanitize subgraph ID (no spaces)
    const subgraphId = tier.label.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
    lines.push(`  subgraph ${subgraphId}["${tier.label}"]`);
    for (const name of members.sort()) {
      lines.push(`    ${sanitizeId(name)}`);
    }
    lines.push('  end');
    lines.push('');
  }

  // Emit any untiered modules as loose nodes
  if (untiered.length > 0) {
    lines.push('  %% Unclassified modules');
    for (const name of untiered.sort()) {
      lines.push(`  ${sanitizeId(name)}`);
    }
    lines.push('');
  }

  // Emit edges — only when target module exists in our graph
  const edgeLines: string[] = [];
  for (const mod of modules) {
    for (const dep of mod.imports) {
      if (allClassNames.has(dep)) {
        edgeLines.push(`  ${sanitizeId(mod.className)} --> ${sanitizeId(dep)}`);
      }
    }
  }

  if (edgeLines.length > 0) {
    lines.push('  %% Dependencies');
    lines.push(...edgeLines.sort());
  }

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  if (!fs.existsSync(MODULES_ROOT)) {
    console.error(`ERROR: modules directory not found: ${MODULES_ROOT}`);
    process.exit(1);
  }

  const architectureDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(architectureDir)) {
    console.error(`ERROR: architecture directory not found: ${architectureDir}`);
    process.exit(1);
  }

  console.log(`Scanning ${MODULES_ROOT} ...`);
  const files = collectModuleFiles(MODULES_ROOT);
  console.log(`Found ${files.length} module files`);

  const modules = buildGraph(files);
  console.log(`Parsed ${modules.length} application modules`);

  const mermaid = generateMermaid(modules);

  // Count edges
  const edgeCount = (mermaid.match(/-->/g) ?? []).length;
  console.log(`Generated ${edgeCount} dependency edges`);

  // Build stats for the header
  const totalModules = modules.length;
  const generatedAt = new Date().toISOString().slice(0, 10);

  const output = [
    '# Module Dependency Graph',
    '',
    `> Auto-generated by \`scripts/generate-module-graph.ts\` — do not edit manually.  `,
    `> Last generated: ${generatedAt}  `,
    `> Modules: ${totalModules} | Edges: ${edgeCount}`,
    '',
    '## How to Read This',
    '',
    '- Arrow direction: **consumer → dependency** (e.g. `AttendanceModule --> AuthModule` means Attendance imports Auth)',
    '- Infrastructure modules excluded: `PrismaModule`, `RedisModule`, `CommonModule`, `SentryModule`, `BullModule`, `ConfigModule`',
    '- Regenerate at any time: `npx tsx scripts/generate-module-graph.ts`',
    '',
    '## Dependency Graph',
    '',
    '```mermaid',
    mermaid,
    '```',
    '',
  ].join('\n');

  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');
  console.log(`Written: ${OUTPUT_FILE}`);
}

main();
