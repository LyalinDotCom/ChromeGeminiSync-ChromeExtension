/**
 * Message types for communication between extension components and backend
 */

// Terminal I/O messages
export interface TerminalInputMessage {
  type: 'terminal:input';
  data: string;
}

export interface TerminalOutputMessage {
  type: 'terminal:output';
  data: string;
}

export interface TerminalResizeMessage {
  type: 'terminal:resize';
  cols: number;
  rows: number;
}

// Browser context request/response messages
export interface BrowserContextRequest {
  type: 'browser:request';
  requestId: string;
  action: 'getDom' | 'getSelection' | 'getUrl' | 'screenshot' | 'executeScript' | 'modifyDom' | 'getConsoleLogs';
  params?: Record<string, unknown>;
}

export interface BrowserContextResponse {
  type: 'browser:response';
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// Connection status messages
export interface ConnectionStatusMessage {
  type: 'connection:status';
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  message?: string;
}

// Content script messages (internal extension communication)
export interface ContentScriptMessage {
  type: 'content:getDom' | 'content:getSelection' | 'content:executeScript';
  requestId: string;
  params?: Record<string, unknown>;
}

export interface ContentScriptResponse {
  type: 'content:response';
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// Union type for all WebSocket messages
export type WebSocketMessage =
  | TerminalInputMessage
  | TerminalOutputMessage
  | TerminalResizeMessage
  | BrowserContextRequest
  | BrowserContextResponse
  | ConnectionStatusMessage;

// Union type for all internal extension messages
export type ExtensionMessage =
  | ContentScriptMessage
  | ContentScriptResponse
  | { type: 'ping' }
  | { type: 'pong' };
