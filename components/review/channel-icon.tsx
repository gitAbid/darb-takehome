import { Mail, MessageCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

export function ChannelIcon({ channel, className }: { channel: 'email' | 'whatsapp'; className?: string }) {
  const Icon = channel === 'email' ? Mail : MessageCircle;
  return <Icon aria-label={channel === 'email' ? 'Email' : 'WhatsApp'} className={cn('size-4 shrink-0', className)} />;
}
