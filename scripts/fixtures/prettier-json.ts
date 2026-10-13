import prettier from 'prettier';

/** Formats JSON exactly as the repository's Prettier config would (thin adapter; used by the CLIs). */
export async function prettierJson(path: string, value: unknown): Promise<string> {
  const config = (await prettier.resolveConfig(path)) ?? {};
  return prettier.format(JSON.stringify(value), { ...config, parser: 'json', filepath: path });
}
