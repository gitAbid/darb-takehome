import { contentHash } from '@/lib/domain/content-hash';

describe('contentHash', () => {
  it('is the hex SHA-256 of the bytes', () => {
    expect(contentHash(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('is identical for identical bytes and different for different bytes', () => {
    expect(contentHash(Buffer.from('receipt'))).toBe(contentHash(new Uint8Array(Buffer.from('receipt'))));
    expect(contentHash(Buffer.from('receipt'))).not.toBe(contentHash(Buffer.from('receipt ')));
  });

  it('hashes empty input', () => {
    expect(contentHash(Buffer.alloc(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
