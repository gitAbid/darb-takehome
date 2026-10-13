import { maskEmail, maskPhone } from '@/lib/logging/redact';

describe('maskPhone', () => {
  it.each([
    ['+966551234567', '+9665•••••567'],
    ['966551234567', '96655••••567'],
    ['+97150123456', '+9715••••456'],
  ])('masks %s as %s', (phone, expected) => {
    expect(maskPhone(phone)).toBe(expected);
  });

  it.each(['', '12345', 'not-a-phone', '+966 55 123 4567', '+9665512345678901234'])(
    'fully masks malformed input %p without throwing',
    (phone) => {
      expect(maskPhone(phone)).toBe('•••');
    },
  );

  it('never reveals the middle digits', () => {
    expect(maskPhone('+966551234567')).not.toContain('1234');
  });
});

describe('maskEmail', () => {
  it.each([
    ['fleet@najd-logistics.example', 'f•••@najd-logistics.example'],
    ['a@b.co', 'a•••@b.co'],
    ['first.last+tag@darb.example.com', 'f•••@darb.example.com'],
  ])('masks %s as %s', (email, expected) => {
    expect(maskEmail(email)).toBe(expected);
  });

  it.each(['', 'no-at-sign', '@domain.example', 'local@'])('fully masks malformed input %p', (email) => {
    expect(maskEmail(email)).toBe('•••');
  });
});
