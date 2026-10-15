import { adminSend } from './supabase'

export type CommandType = 'reprint' | 'test_print' | 'retry_sync'

export interface CommandResult {
  status: 'done' | 'failed' | 'timeout'
  error?: string | null
}

const POLL_MS = 2000
// booth mengambil perintah tiap ±10 dtk; lebih dari ini berarti booth offline / tidak tersambung cloud
const TIMEOUT_MS = 60000

/** Kirim perintah ke booth lalu tunggu hasil eksekusinya (bukan sekadar "terkirim"). */
export async function sendCommandAndWait(type: CommandType, sessionId?: string): Promise<CommandResult> {
  const command = await adminSend<{ id: string }>('/api/admin/commands', {
    method: 'POST',
    body: JSON.stringify({ type, session_id: sessionId })
  })

  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    const current = await adminSend<{ status: string; error_message: string | null }>(`/api/admin/commands/${command.id}`)
    if (current.status === 'done') return { status: 'done' }
    if (current.status === 'failed') return { status: 'failed', error: current.error_message }
  }
  return { status: 'timeout' }
}
