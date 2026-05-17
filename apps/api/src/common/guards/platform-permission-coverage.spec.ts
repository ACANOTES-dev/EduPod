import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const MODULES_DIR = join(__dirname, '../../modules');

function listControllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      return listControllerFiles(fullPath);
    }
    return fullPath.endsWith('.controller.ts') ? [fullPath] : [];
  });
}

describe('Platform admin permission coverage', () => {
  const adminControllerFiles = listControllerFiles(MODULES_DIR)
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    .filter(({ file, source }) => {
      if (file.endsWith('alert-magic-ack.controller.ts')) {
        return false;
      }
      if (file.endsWith('sentry-webhook.controller.ts')) {
        return false;
      }
      return /@Controller\(['"]v1\/admin/.test(source);
    });

  it('does not use the retired Redis-backed platform owner guard', () => {
    for (const { file, source } of adminControllerFiles) {
      expect({ file, hasLegacyGuard: source.includes('PlatformOwnerGuard') }).toEqual({
        file,
        hasLegacyGuard: false,
      });
      expect({ file, hasRedisOwnerSet: source.includes('platform_owner_user_ids') }).toEqual({
        file,
        hasRedisOwnerSet: false,
      });
    }
  });

  it('uses relational platform permissions on every platform-admin route', () => {
    for (const { file, source } of adminControllerFiles) {
      const adminControllerStart = source.search(/@Controller\(['"]v1\/admin/);
      const adminSource = source.slice(adminControllerStart);

      expect({ file, hasPlatformGuard: adminSource.includes('PlatformRoleGuard') }).toEqual({
        file,
        hasPlatformGuard: true,
      });

      const routeDecoratorCount =
        adminSource.match(/^\s*@(Get|Post|Patch|Put|Delete)\b/gm)?.length ?? 0;
      const permissionDecoratorCount =
        adminSource.match(/^\s*@RequiresPlatformPermission\(/gm)?.length ?? 0;

      expect({
        file,
        covered: permissionDecoratorCount >= routeDecoratorCount,
      }).toEqual({ file, covered: true });
    }
  });
});
