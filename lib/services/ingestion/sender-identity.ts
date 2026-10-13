import type { DocumentSource } from '@/lib/domain/statuses';
import type { StoredDocument } from '@/lib/repositories/records';
import type { InboundMessage } from '@/lib/webhooks/inbound-message';

import type { SenderIdentity } from './sender-resolver';

export function senderOfMessage(message: InboundMessage): SenderIdentity {
  return identity(message.source, message.sender, message.recipient);
}

export function senderOfDocument(document: StoredDocument): SenderIdentity {
  return identity(document.source, document.senderIdentifier, document.recipientIdentifier);
}

function identity(source: DocumentSource, sender: string, recipient: string | null): SenderIdentity {
  return source === 'WHATSAPP' ? { source, phone: sender } : { source, from: sender, to: recipient };
}
