describe('tenants public barrel', () => {
  it('exports the module and service API surface', async () => {
    const exports = await import('./index');

    expect(exports.TenantsModule).toBeDefined();
    expect(exports.TenantsService).toBeDefined();
    expect(exports.SequenceService).toBeDefined();
  });
});
