import { confirmService } from '#root/dist/src/app/services/confirm/confirm.service.js';

describe('ConfirmService', () => {
  const options = { title: 'Delete?', message: 'Sure?', confirmLabel: 'Delete' };

  it('answers no when no dialog is there to ask', async () => {
    expect(await confirmService.ask(options)).toBe(false);
  });

  it('asks the attached dialog, until it detaches', async () => {
    const asked = [];
    const detach = confirmService.attach({ ask: async (o) => { asked.push(o); return true; } });
    expect(await confirmService.ask(options)).toBe(true);
    expect(asked).toEqual([options]);

    detach();
    expect(await confirmService.ask(options)).toBe(false);
  });

  it('keeps a newer dialog attached when an older one detaches', async () => {
    const detachOld = confirmService.attach({ ask: async () => false });
    const detachNew = confirmService.attach({ ask: async () => true });
    detachOld();
    expect(await confirmService.ask(options)).toBe(true);
    detachNew();
  });
});
