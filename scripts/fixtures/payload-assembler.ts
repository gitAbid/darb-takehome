import type { DocumentReader } from './document-reader';
import { buildIngestionPayloads } from './ingestion-payloads';
import { buildEmailPayload, buildWhatsAppImageMessage, buildWhatsAppPayload } from './payload-builders';
import type { EmailScenarioSpec, ScenarioPayloadSpec, WhatsAppScenarioSpec } from './payload-specs';

export interface PayloadFile {
  /** Relative to the fixtures directory. */
  path: string;
  content: unknown;
}

export type MediaMap = Record<string, { file: string; mimeType: string }>;

/** Every generated JSON file: one payload per scenario, the media map, and the ingestion-only payloads. */
export function assemblePayloadFiles(
  specs: readonly ScenarioPayloadSpec[],
  readDocument: DocumentReader,
  logo: Uint8Array,
): PayloadFile[] {
  const scenarioFiles = specs.map((spec) => ({
    path: `scenarios/${spec.folder}/payload.json`,
    content: spec.channel === 'email' ? emailPayload(spec, readDocument, logo) : whatsAppPayload(spec, readDocument),
  }));
  const ingestion = Object.entries(buildIngestionPayloads(readDocument('01-exact-match').bytes)).map(
    ([name, content]) => ({ path: `payloads/ingestion/${name}`, content }),
  );
  return [...scenarioFiles, { path: 'media-map.json', content: buildMediaMap(specs, readDocument) }, ...ingestion];
}

export function buildMediaMap(specs: readonly ScenarioPayloadSpec[], readDocument: DocumentReader): MediaMap {
  const entries = specs
    .filter((spec): spec is WhatsAppScenarioSpec => spec.channel === 'whatsapp')
    .map((spec) => {
      const document = readDocument(spec.documentFolder);
      return [spec.mediaId, { file: document.file, mimeType: document.contentType }] as const;
    })
    .sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

function emailPayload(spec: EmailScenarioSpec, readDocument: DocumentReader, logo: Uint8Array) {
  const document = readDocument(spec.folder);
  const attachments = [
    { filename: `${spec.filename}${document.extension}`, contentType: document.contentType, bytes: document.bytes },
  ];
  if (spec.includeLogo) attachments.push({ filename: 'logo.png', contentType: 'image/png', bytes: logo });
  return buildEmailPayload({ ...spec, attachments });
}

function whatsAppPayload(spec: WhatsAppScenarioSpec, readDocument: DocumentReader) {
  const document = readDocument(spec.documentFolder);
  return buildWhatsAppPayload([
    buildWhatsAppImageMessage({
      id: spec.wamid,
      fromPhone: spec.fromPhone,
      sentAt: spec.sentAt,
      mediaId: spec.mediaId,
      mimeType: document.contentType,
      bytes: document.bytes,
    }),
  ]);
}
