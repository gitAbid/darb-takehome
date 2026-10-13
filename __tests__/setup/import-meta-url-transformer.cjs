/**
 * Jest transform for unpdf's PDF.js bundle: an ESM file that reads `import.meta.url`. esbuild converts it to CommonJS
 * (robust on minified bundles, unlike a TypeScript down-level) and pins `import.meta.url` to the file's own URL.
 * Test infrastructure only; production runs the real ESM.
 */
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { transformSync, version } = require('esbuild');

module.exports = {
  process(source, path) {
    const { code } = transformSync(source, {
      format: 'cjs',
      target: 'node20',
      loader: 'js',
      define: { 'import.meta.url': JSON.stringify(pathToFileURL(path).href) },
    });
    return { code };
  },
  getCacheKey(source, path) {
    return createHash('sha256').update(`${version}\0${path}\0${source}`).digest('hex');
  },
};
