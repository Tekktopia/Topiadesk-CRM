import { proxy } from '../_lib/proxy';

export const runtime = 'nodejs';

export async function GET() {
  return proxy('/identity/role-grants');
}
