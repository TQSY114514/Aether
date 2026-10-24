import type { Session, Message, ToolResult } from '../types/domain'

// Compile-time verification of Session interface
const _testSession: Session = {
  id: 1,
  title: null,
  persona_id: null,
  parent_session_id: null,
  pinned: 0,
  config: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

// Compile-time verification of Message interface
const _testMessage: Message = {
  id: 999999999,
  session_id: 1,
  role: 'assistant',
  content: '',
  token_count: 0,
  latency_ms: 1000000,
  status: 'fallback',
  error_message: null,
}

// Compile-time verification of ToolResult interface
const _testToolResult: ToolResult = {
  tool_call_id: 'call_123',
  name: 'run_command',
  error: 'error payload',
  isError: true,
}

export { _testSession, _testMessage, _testToolResult }
