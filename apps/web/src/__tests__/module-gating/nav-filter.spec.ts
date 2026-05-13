import { MODULE_REGISTRY } from '@school/shared/modules';
import type { ModuleKey } from '@school/shared/modules';

import { filterNavByModules, navSectionConfigs, type NavSectionConfig } from '@/lib/nav-config';

describe('Nav filter module gating contract', () => {
  it.each(MODULE_REGISTRY)('hides entries gated by $key when disabled', ({ key }) => {
    const sections: NavSectionConfig[] = [
      {
        labelKey: 'nav.core',
        items: [{ labelKey: 'nav.home', href: '/dashboard' }],
      },
      {
        labelKey: `nav.${key}`,
        moduleKey: key,
        items: [{ labelKey: `nav.${key}.dashboard`, href: `/${key}` }],
      },
      {
        labelKey: 'nav.mixed',
        items: [
          { labelKey: 'nav.always', href: '/always' },
          { labelKey: `nav.${key}.item`, href: `/${key}/item`, moduleKey: key },
        ],
      },
    ];
    const enabledModules = MODULE_REGISTRY.map((definition) => definition.key).filter(
      (moduleKey): moduleKey is ModuleKey => moduleKey !== key,
    );

    const filtered = filterNavByModules(sections, enabledModules);

    expect(filtered.find((section) => section.labelKey === `nav.${key}`)).toBeUndefined();
    expect(filtered.find((section) => section.labelKey === 'nav.core')).toBeDefined();
    expect(
      filtered
        .find((section) => section.labelKey === 'nav.mixed')
        ?.items.find((item) => item.moduleKey === key),
    ).toBeUndefined();
  });

  it('gates the communications admin entry without removing core inbox routes', () => {
    const operations = navSectionConfigs.find((section) => section.labelKey === 'nav.operations');

    expect(operations?.items.find((item) => item.href === '/communications')?.moduleKey).toBe(
      'communications_outbound',
    );
    expect(
      navSectionConfigs.flatMap((section) => section.items).find((item) => item.href === '/inbox')
        ?.moduleKey,
    ).toBeUndefined();
  });

  it('annotates already-enforced wellbeing modules in the real nav config', () => {
    const allItems = navSectionConfigs.flatMap((section) => [
      { href: `__section:${section.labelKey}`, moduleKey: section.moduleKey },
      ...section.items,
    ]);

    expect(allItems.find((item) => item.href === '/behaviour')?.moduleKey).toBe('behaviour');
    expect(allItems.find((item) => item.href === '/pastoral')?.moduleKey).toBe('pastoral');
    expect(allItems.find((item) => item.href === '/parent/sen')?.moduleKey).toBe('sen');
    expect(allItems.find((item) => item.href === '__section:nav.sen')?.moduleKey).toBe('sen');
    expect(allItems.find((item) => item.href === '/wellbeing/my-workload')?.moduleKey).toBe(
      'staff_wellbeing',
    );
  });

  it('annotates partial-enforcement completion modules in the real nav config', () => {
    const allItems = navSectionConfigs.flatMap((section) => [
      { href: `__section:${section.labelKey}`, moduleKey: section.moduleKey },
      ...section.items,
    ]);

    expect(allItems.find((item) => item.href === '/inquiries')?.moduleKey).toBe('parent_inquiries');
    expect(allItems.find((item) => item.href === '/payroll')?.moduleKey).toBe('payroll');
    expect(allItems.find((item) => item.href === '/website')?.moduleKey).toBe('website');
  });

  it('annotates admissions entries in the real nav config', () => {
    const allItems = navSectionConfigs.flatMap((section) => section.items);

    expect(allItems.find((item) => item.href === '/admissions')?.moduleKey).toBe('admissions');
    expect(allItems.find((item) => item.href === '/applications')?.moduleKey).toBe('admissions');
  });

  it('annotates gradebook and report-card entries in the real nav config', () => {
    const allItems = navSectionConfigs.flatMap((section) => section.items);

    expect(allItems.find((item) => item.href === '/gradebook')?.moduleKey).toBe('gradebook');
    expect(allItems.find((item) => item.href === '/report-cards')?.moduleKey).toBe('gradebook');
    expect(allItems.find((item) => item.href === '/report-comments')?.moduleKey).toBe('gradebook');
  });

  it('annotates finance entries in the real nav config', () => {
    const allItems = navSectionConfigs.flatMap((section) => section.items);

    expect(allItems.find((item) => item.href === '/finance')?.moduleKey).toBe('finance');
    expect(allItems.find((item) => item.href === '/payroll')?.moduleKey).toBe('payroll');
  });

  it('annotates homework entries in the real nav config', () => {
    const allItems = navSectionConfigs.flatMap((section) => section.items);

    expect(allItems.find((item) => item.href === '/homework')?.moduleKey).toBe('homework');
  });

  it('annotates auto-scheduling entries without gating rooms', () => {
    const allItems = navSectionConfigs.flatMap((section) => section.items);

    expect(allItems.find((item) => item.href === '/scheduling')?.moduleKey).toBe('auto_scheduling');
    expect(allItems.find((item) => item.href === '/rooms')?.moduleKey).toBeUndefined();
  });

  it('annotates leave entries in the real nav config', () => {
    const allItems = navSectionConfigs.flatMap((section) => section.items);

    expect(allItems.find((item) => item.href === '/leave')?.moduleKey).toBe('leave');
  });

  it('annotates school-closure management without gating core settings', () => {
    const allItems = navSectionConfigs.flatMap((section) => section.items);

    expect(allItems.find((item) => item.href === '/settings')?.moduleKey).toBeUndefined();
    expect(allItems.find((item) => item.href === '/settings/closures')?.moduleKey).toBe(
      'school_closures',
    );
  });

  it('annotates advanced regulatory entries while keeping core regulatory routes visible', () => {
    const allItems = navSectionConfigs.flatMap((section) => section.items);

    expect(allItems.find((item) => item.href === '/regulatory')?.moduleKey).toBeUndefined();
    expect(
      allItems.find((item) => item.href === '/regulatory/calendar')?.moduleKey,
    ).toBeUndefined();
    expect(
      allItems.find((item) => item.href === '/regulatory/transfers')?.moduleKey,
    ).toBeUndefined();
    expect(
      allItems.find((item) => item.href === '/regulatory/anti-bullying')?.moduleKey,
    ).toBeUndefined();
    expect(
      allItems.find((item) => item.href === '/regulatory/safeguarding')?.moduleKey,
    ).toBeUndefined();

    expect(allItems.find((item) => item.href === '/regulatory/tusla')?.moduleKey).toBe(
      'compliance_advanced',
    );
    expect(allItems.find((item) => item.href === '/regulatory/des-returns')?.moduleKey).toBe(
      'compliance_advanced',
    );
    expect(allItems.find((item) => item.href === '/regulatory/october-returns')?.moduleKey).toBe(
      'compliance_advanced',
    );
    expect(allItems.find((item) => item.href === '/regulatory/ppod')?.moduleKey).toBe(
      'compliance_advanced',
    );
    expect(allItems.find((item) => item.href === '/regulatory/cba')?.moduleKey).toBe(
      'compliance_advanced',
    );
    expect(allItems.find((item) => item.href === '/regulatory/submissions')?.moduleKey).toBe(
      'compliance_advanced',
    );
  });
});
