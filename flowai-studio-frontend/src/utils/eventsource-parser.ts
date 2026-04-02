// SSE 事件解析器
// 参考：https://html.spec.whatwg.org/multipage/server-sent-events.html

export interface SSEChunk {
  type: 'event'
  data: string
  event?: string
  id?: string
  retry?: number
}

export async function* eventsourceParser(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<SSEChunk, void, unknown> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line === '') {
        // 空行表示事件结束
        yield parseEvent(buffer)
        buffer = ''
      } else {
        buffer += line + '\n'
      }
    }
  }

  // 处理剩余的缓冲区
  if (buffer) {
    yield parseEvent(buffer)
  }
}

function parseEvent(buffer: string): SSEChunk {
  const lines = buffer.split('\n')
  let data = ''
  let event = 'message'
  let id: string | undefined
  let retry: number | undefined

  for (const line of lines) {
    if (line.startsWith('data:')) {
      data += line.slice(5).trim() + '\n'
    } else if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('id:')) {
      id = line.slice(3).trim()
    } else if (line.startsWith('retry:')) {
      const retryValue = parseInt(line.slice(6).trim(), 10)
      if (!isNaN(retryValue)) {
        retry = retryValue
      }
    }
  }

  return {
    type: 'event',
    data: data.trim(),
    event: event || undefined,
    id,
    retry,
  }
}
