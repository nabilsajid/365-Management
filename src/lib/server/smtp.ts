import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';

// Sends email through a normal mailbox (Gmail, Outlook…) over SMTP, with no
// library: port 465 starts encrypted, port 587 upgrades with STARTTLS. Only
// what alerts need: one message, plain text plus HTML, to one person.

export const MAIL_PROVIDERS = {
  gmail: { host: 'smtp.gmail.com', port: 465 },
  outlook: { host: 'smtp.office365.com', port: 587 },
} as const;

/** The key that encrypts saved mailbox passwords, derived from a server-only secret. */
function key(): Buffer {
  const secret = process.env.MAIL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('The server has no secret to protect mail passwords with.');
  return createHash('sha256').update(`unidock-mail:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64')).join('.');
}

export function decryptSecret(stored: string): string {
  const [iv, tag, body] = stored.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(body!), decipher.final()]).toString('utf8');
}

export interface MailAccount {
  host: string;
  port: number;
  username: string;
  password: string;
  fromName?: string | null;
}

/** "=?UTF-8?B?…?=" so names and subjects in any language arrive intact. */
const encodeWord = (value: string) => (/^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`);
const wrap = (base64: string) => base64.replace(/.{1,76}/g, '$&\r\n');

/** The full message: headers, then a text part and an HTML part. */
export function buildMessage(from: { name?: string | null; address: string }, to: string, subject: string, text: string, html: string): string {
  const boundary = `b${randomBytes(12).toString('hex')}`;
  const fromHeader = from.name ? `${encodeWord(from.name.replace(/["\r\n]/g, ''))} <${from.address}>` : from.address;
  return [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${encodeWord(subject.replace(/[\r\n]/g, ' '))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomBytes(16).toString('hex')}@unidock>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(Buffer.from(text, 'utf8').toString('base64')),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(Buffer.from(html, 'utf8').toString('base64')),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

/** Reads SMTP replies line by line; a reply ends at a line like "250 OK" (not "250-…"). */
class Replies {
  private buffer = '';
  private waiting: ((reply: { code: number; text: string }) => void)[] = [];
  private ready: { code: number; text: string }[] = [];
  private lines: string[] = [];
  feed(chunk: string) {
    this.buffer += chunk;
    let at: number;
    while ((at = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, at).replace(/\r$/, '');
      this.buffer = this.buffer.slice(at + 1);
      this.lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        const reply = { code: Number(line.slice(0, 3)), text: this.lines.join('\n') };
        this.lines = [];
        const next = this.waiting.shift();
        if (next) next(reply);
        else this.ready.push(reply);
      }
    }
  }
  next(): Promise<{ code: number; text: string }> {
    const reply = this.ready.shift();
    return reply ? Promise.resolve(reply) : new Promise((resolve) => this.waiting.push(resolve));
  }
}

/**
 * Sends one email. Resolves when the server accepted it; rejects with the
 * server's own words when it refused (wrong password, blocked sign-in…).
 */
export async function sendSmtp(account: MailAccount, to: string, subject: string, text: string, html: string): Promise<void> {
  const replies = new Replies();
  let socket: net.Socket | tls.TLSSocket | undefined;
  const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The mail server did not answer in time.')), ms));

  const open = () =>
    new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
      const s =
        account.port === 465
          ? tls.connect({ host: account.host, port: 465, servername: account.host }, () => resolve(s))
          : net.connect({ host: account.host, port: account.port }, () => resolve(s));
      s.once('error', reject);
    });

  const run = async () => {
    let current = await open();
    socket = current;
    current.setEncoding('utf8');
    current.on('data', (chunk: string) => replies.feed(chunk));
    const send = async (command: string, expect: number[], hide = false): Promise<string> => {
      current.write(`${command}\r\n`);
      const reply = await replies.next();
      if (!expect.includes(reply.code)) throw new Error(`${hide ? 'Sign-in' : command.split(' ')[0]} refused: ${reply.text}`);
      return reply.text;
    };
    const greeting = await replies.next();
    if (greeting.code !== 220) throw new Error(`The mail server refused the connection: ${greeting.text}`);
    await send('EHLO unidock', [250]);

    if (account.port === 587) {
      await send('STARTTLS', [220]);
      const plain = current as net.Socket;
      plain.removeAllListeners('data');
      current = await new Promise<tls.TLSSocket>((resolve, reject) => {
        const secure = tls.connect({ socket: plain, servername: account.host }, () => resolve(secure));
        secure.once('error', reject);
      });
      socket = current;
      current.setEncoding('utf8');
      current.on('data', (chunk: string) => replies.feed(chunk));
      await send('EHLO unidock', [250]);
    }

    await send('AUTH LOGIN', [334]);
    await send(Buffer.from(account.username).toString('base64'), [334], true);
    await send(Buffer.from(account.password).toString('base64'), [235], true);
    await send(`MAIL FROM:<${account.username}>`, [250]);
    await send(`RCPT TO:<${to}>`, [250, 251]);
    await send('DATA', [354]);
    // Lines starting with a dot are doubled, then the message ends with a lone dot.
    const body = buildMessage({ name: account.fromName, address: account.username }, to, subject, text, html).replace(/\r\n\./g, '\r\n..');
    await send(`${body}\r\n.`, [250]);
    current.write('QUIT\r\n');
  };

  try {
    await Promise.race([run(), timeout(20000)]);
  } finally {
    socket?.end();
  }
}
