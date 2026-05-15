import {
  isPlatformAdminPath,
  isPlatformHost,
  isPlatformLoginPath,
  isRetiredAdminPath,
  isSocketIoPath,
  normaliseHost,
} from '../../middleware';

describe('stealth subdomain middleware helpers', () => {
  it('normalises host casing and ports', () => {
    expect(normaliseHost('DUA.EDUPOD.APP:443')).toBe('dua.edupod.app');
    expect(normaliseHost('dua.localhost:5551')).toBe('dua.localhost');
  });

  it('recognises only the production and local stealth hosts', () => {
    expect(isPlatformHost('dua.edupod.app')).toBe(true);
    expect(isPlatformHost('dua.localhost:5551')).toBe(true);
    expect(isPlatformHost('admin.edupod.app')).toBe(false);
    expect(isPlatformHost('nhqs.edupod.app')).toBe(false);
  });

  it('allows only English platform login and admin paths on the stealth host', () => {
    expect(isPlatformLoginPath('/en/login')).toBe(true);
    expect(isPlatformLoginPath('/en/login/help')).toBe(true);
    expect(isPlatformLoginPath('/ar/login')).toBe(false);
    expect(isPlatformAdminPath('/en/admin')).toBe(true);
    expect(isPlatformAdminPath('/en/admin/health')).toBe(true);
    expect(isPlatformAdminPath('/it/admin')).toBe(false);
  });

  it('retires locale-prefixed admin paths on tenant hosts', () => {
    expect(isRetiredAdminPath('/en/admin')).toBe(true);
    expect(isRetiredAdminPath('/en/admin/health')).toBe(true);
    expect(isRetiredAdminPath('/en/dashboard')).toBe(false);
    expect(isRetiredAdminPath('/admin')).toBe(false);
  });

  it('recognises Socket.IO transport paths for middleware bypass', () => {
    expect(isSocketIoPath('/socket.io')).toBe(true);
    expect(isSocketIoPath('/socket.io/')).toBe(true);
    expect(isSocketIoPath('/socket.io/admin')).toBe(true);
    expect(isSocketIoPath('/en/socket.io')).toBe(false);
  });
});
