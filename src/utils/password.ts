const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';

/** Generate a policy-compliant password with browser cryptographic randomness. */
export function generateSecurePassword(length = 16): string {
  if (!Number.isInteger(length) || length < 8 || length > 128) {
    throw new Error('طول کلمه عبور باید بین ۸ تا ۱۲۸ کاراکتر باشد.');
  }
  const required = ['A', 'a', '2', '!'];
  const values: number[] = [];
  const limit = Math.floor(256 / PASSWORD_ALPHABET.length) * PASSWORD_ALPHABET.length;
  while (values.length < length - required.length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    for (const byte of bytes) {
      if (byte < limit) values.push(byte % PASSWORD_ALPHABET.length);
      if (values.length === length - required.length) break;
    }
  }
  const chars = [...required, ...values.map(value => PASSWORD_ALPHABET[value])];
  const shuffle = crypto.getRandomValues(new Uint32Array(chars.length));
  return chars.map((char, index) => ({ char, order: shuffle[index] }))
    .sort((a, b) => a.order - b.order)
    .map(item => item.char)
    .join('');
}
