import type { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service.js';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

function service(configured = true) {
  return new EmailService({
    get: (key: string) =>
      key === 'RESEND_API_KEY' && configured ? 'test-key' : undefined,
  } as unknown as ConfigService);
}
const message = { to: 'test@e2e.test', subject: 'Test', html: '<p>Test</p>' };
const rejected = (name: string) => ({
  data: null,
  error: { name, message: 'Provider rejected the request' },
});

describe('email delivery results and safe retries', () => {
  beforeEach(() => {
    send.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('does not claim an unconfigured provider sent an email', async () => {
    await expect(service(false).send(message)).resolves.toEqual({
      delivered: false,
      error: 'not_configured',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('reports provider validation errors instead of false success, without retrying', async () => {
    send.mockResolvedValue(rejected('validation_error'));
    const result = await service().send(message);
    expect(result.delivered).toBe(false);
    expect(result.error).toBeTruthy();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reports success only when the provider accepts an email', async () => {
    send.mockResolvedValue({ data: { id: 'accepted' }, error: null });
    await expect(service().send(message)).resolves.toEqual({ delivered: true });
  });

  it('retries rate limits with the same idempotency key', async () => {
    send
      .mockResolvedValueOnce(rejected('rate_limit_exceeded'))
      .mockResolvedValueOnce({ data: { id: 'accepted' }, error: null });
    const pending = service().send(message);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ delivered: true });
    expect(send).toHaveBeenCalledTimes(2);
    const keys = send.mock.calls.map((call) => call[1]?.idempotencyKey);
    expect(keys[0]).toEqual(expect.any(String));
    expect(new Set(keys).size).toBe(1);
  });

  it('bounds retries when the provider stays unavailable', async () => {
    send.mockResolvedValue(rejected('application_error'));
    const pending = service().send(message);
    await vi.runAllTimersAsync();
    expect((await pending).delivered).toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('returns a failure without throwing after repeated request exceptions', async () => {
    send.mockRejectedValue(new Error('Network unavailable'));
    const pending = service().send(message);
    await vi.runAllTimersAsync();
    expect((await pending).delivered).toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
  });
});
