import {
  createClientSchema,
  loginSchema,
  publicBookingRequestSchema,
  registerSchema,
} from '@repo/shared';

// User.email and Client(ownerId, email) are unique, so casing decided whether
// two entries were the same record: "Foo@x.com" registered a second account,
// and logging in with different casing failed against an existing one.
describe('email normalization', () => {
  it('lowercases and trims on registration and login', () => {
    expect(
      registerSchema.parse({ name: 'A', email: '  Foo.Bar@Example.COM ', password: 'password1' })
        .email,
    ).toBe('foo.bar@example.com');
    expect(loginSchema.parse({ email: 'Foo@Example.com', password: 'x' }).email).toBe(
      'foo@example.com',
    );
  });

  it('lowercases client emails from the dashboard and the public portal', () => {
    expect(createClientSchema.parse({ name: 'A', email: 'Avery@Example.com' }).email).toBe(
      'avery@example.com',
    );
    expect(
      publicBookingRequestSchema.parse({
        clientName: 'A',
        clientEmail: 'Avery@Example.com',
        shootType: 'Portrait',
        scheduledAt: '2026-09-24T10:00:00Z',
        durationMins: 60,
      }).clientEmail,
    ).toBe('avery@example.com');
  });

  it('still rejects addresses that are not valid emails', () => {
    expect(loginSchema.safeParse({ email: 'NOT-AN-EMAIL', password: 'x' }).success).toBe(false);
  });
});
