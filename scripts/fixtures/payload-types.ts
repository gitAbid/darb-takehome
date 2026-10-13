/** Inbound-parse email webhook body (the brief's simplified shape). */
export interface EmailPayload {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  receivedAt: string;
  attachments: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

/** Meta Cloud API webhook body (the brief's simplified shape). */
export interface WhatsAppPayload<M = WhatsAppImageMessage> {
  entry: { changes: { value: { messages: M[] } }[] }[];
}

export interface WhatsAppImageMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'image';
  image: { id: string; mime_type: string; sha256: string };
}
