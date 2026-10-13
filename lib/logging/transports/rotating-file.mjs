// pino transport, runs in a worker thread (plain JS: workers cannot load TypeScript).
// Options are built and tested in ../rotating-file-options.ts.
import { createStream } from 'rotating-file-stream';

export default function rotatingFileTransport({ fileName, streamOptions }) {
  return createStream(fileName, streamOptions);
}
