import { cookies } from 'next/headers'
import { findPeer } from './peers'

/** REST 端点统一的节点身份校验；无效时返回 null（调用方回 401） */
export async function requirePeerId(): Promise<string | null> {
  const jar = await cookies()
  const peerId = jar.get('nw_peer')?.value
  if (!peerId || !findPeer(peerId)) return null
  return peerId
}
