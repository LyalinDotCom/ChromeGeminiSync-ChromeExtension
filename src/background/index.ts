/**
 * Background Service Worker
 * Manages WebSocket connection to backend and bridges communication
 * between the side panel (terminal) and content scripts (browser context)
 */

import type {
  WebSocketMessage,
  BrowserContextRequest,
  BrowserContextResponse,
  ContentScriptMessage,
  ContentScriptResponse,
  ExtensionMessage,
} from '../types/messages';

const BACKEND_URL = 'ws://localhost:3456';
let socket: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 2000;

// Pending browser context requests (used for future async request tracking)
const _pendingRequests = new Map<string, {
  resolve: (response: BrowserContextResponse) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();
void _pendingRequests; // Silence unused warning

// Console logs storage per tab (using debugger API)
interface ConsoleLogEntry {
  level: 'error' | 'warning' | 'info' | 'log' | 'debug';
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
  stackTrace?: string;
}

const consoleLogs = new Map<number, ConsoleLogEntry[]>();
const attachedTabs = new Set<number>();
const MAX_LOGS_PER_TAB = 500;

/**
 * Initialize WebSocket connection to backend
 */
function connectToBackend(): void {
  if (socket?.readyState === WebSocket.OPEN) {
    return;
  }

  console.log('[Background] Connecting to backend:', BACKEND_URL);
  broadcastToExtension({ type: 'connection:status', status: 'connecting' });

  try {
    socket = new WebSocket(BACKEND_URL);

    socket.onopen = () => {
      console.log('[Background] Connected to backend');
      reconnectAttempts = 0;
      broadcastToExtension({ type: 'connection:status', status: 'connected' });
    };

    socket.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleBackendMessage(message);
      } catch (error) {
        console.error('[Background] Failed to parse message:', error);
      }
    };

    socket.onclose = () => {
      console.log('[Background] Disconnected from backend');
      socket = null;
      broadcastToExtension({ type: 'connection:status', status: 'disconnected' });
      scheduleReconnect();
    };

    socket.onerror = (error) => {
      console.error('[Background] WebSocket error:', error);
      broadcastToExtension({
        type: 'connection:status',
        status: 'error',
        message: 'Failed to connect to backend server'
      });
    };
  } catch (error) {
    console.error('[Background] Failed to create WebSocket:', error);
    scheduleReconnect();
  }
}

/**
 * Schedule reconnection attempt
 */
function scheduleReconnect(): void {
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    console.log(`[Background] Reconnecting in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    setTimeout(connectToBackend, RECONNECT_DELAY);
  } else {
    console.log('[Background] Max reconnection attempts reached');
    broadcastToExtension({
      type: 'connection:status',
      status: 'error',
      message: 'Failed to connect after multiple attempts. Is the backend running?'
    });
  }
}

/**
 * Send message to backend
 */
function sendToBackend(message: WebSocketMessage): boolean {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
    return true;
  }
  console.warn('[Background] Cannot send message, socket not connected');
  return false;
}

/**
 * Broadcast message to all extension contexts (side panel)
 */
function broadcastToExtension(message: WebSocketMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Ignore errors when no listeners are available
  });
}

/**
 * Handle messages from backend
 */
async function handleBackendMessage(message: WebSocketMessage): Promise<void> {
  switch (message.type) {
    case 'terminal:output':
      // Forward terminal output to side panel
      console.log('[Background] Terminal output received:', message.data?.length || 0, 'chars');
      broadcastToExtension(message);
      break;

    case 'browser:request':
      // Backend is requesting browser context
      await handleBrowserContextRequest(message as BrowserContextRequest);
      break;

    default:
      console.log('[Background] Unknown message type:', message);
  }
}

/**
 * Handle browser context requests from backend
 */
async function handleBrowserContextRequest(request: BrowserContextRequest): Promise<void> {
  console.log('[Background] Browser context request:', request.action);

  try {
    let response: BrowserContextResponse;

    switch (request.action) {
      case 'getDom':
        response = await getActiveTabDom(request);
        break;
      case 'getSelection':
        response = await getActiveTabSelection(request);
        break;
      case 'getUrl':
        response = await getActiveTabUrl(request);
        break;
      case 'screenshot':
        response = await captureActiveTabScreenshot(request);
        break;
      case 'executeScript':
        response = await executeScriptInTab(request);
        break;
      case 'modifyDom':
        response = await modifyDomInTab(request);
        break;
      case 'getConsoleLogs':
        response = await getConsoleLogs(request);
        break;
      default:
        response = {
          type: 'browser:response',
          requestId: request.requestId,
          success: false,
          error: `Unknown action: ${request.action}`
        };
    }

    sendToBackend(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendToBackend({
      type: 'browser:response',
      requestId: request.requestId,
      success: false,
      error: errorMessage
    });
  }
}

/**
 * Get the active tab
 */
async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab found');
  }

  // Check for restricted URLs
  const url = tab.url || '';
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') || url.startsWith('about:') ||
      url.startsWith('devtools://')) {
    throw new Error(`Cannot access restricted page: ${url.split('/')[0]}//...`);
  }

  console.log('[Background] Active tab:', tab.id, url.slice(0, 50));
  return tab;
}

/**
 * Send message to content script and wait for response
 * (Currently unused but available for future content script communication)
 */
async function _sendToContentScript(
  tabId: number,
  message: ContentScriptMessage
): Promise<ContentScriptResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Content script response timeout'));
    }, 10000);

    chrome.tabs.sendMessage(tabId, message, (response: ContentScriptResponse) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
void _sendToContentScript; // Silence unused warning

/**
 * Get DOM from active tab
 */
async function getActiveTabDom(request: BrowserContextRequest): Promise<BrowserContextResponse> {
  const tab = await getActiveTab();

  // Use scripting API to get DOM
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: (options: { includeStyles?: boolean; selector?: string }) => {
      const selector = options?.selector || 'body';
      const element = document.querySelector(selector);
      if (!element) {
        return { html: null, error: `Element not found: ${selector}` };
      }

      return {
        html: element.outerHTML,
        url: window.location.href,
        title: document.title,
        selector
      };
    },
    args: [request.params as { includeStyles?: boolean; selector?: string } || {}]
  });

  const result = results[0]?.result;
  if (result?.error) {
    return {
      type: 'browser:response',
      requestId: request.requestId,
      success: false,
      error: result.error
    };
  }

  return {
    type: 'browser:response',
    requestId: request.requestId,
    success: true,
    data: result
  };
}

/**
 * Get selected text from active tab
 */
async function getActiveTabSelection(request: BrowserContextRequest): Promise<BrowserContextResponse> {
  const tab = await getActiveTab();

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: () => {
      const selection = window.getSelection();
      return {
        text: selection?.toString() || '',
        url: window.location.href,
        title: document.title
      };
    }
  });

  return {
    type: 'browser:response',
    requestId: request.requestId,
    success: true,
    data: results[0]?.result
  };
}

/**
 * Get URL of active tab
 */
async function getActiveTabUrl(request: BrowserContextRequest): Promise<BrowserContextResponse> {
  const tab = await getActiveTab();

  return {
    type: 'browser:response',
    requestId: request.requestId,
    success: true,
    data: {
      url: tab.url,
      title: tab.title,
      id: tab.id
    }
  };
}

/**
 * Capture screenshot of active tab
 */
async function captureActiveTabScreenshot(request: BrowserContextRequest): Promise<BrowserContextResponse> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab({
      format: 'png',
      quality: 90
    });

    return {
      type: 'browser:response',
      requestId: request.requestId,
      success: true,
      data: {
        dataUrl,
        format: 'png'
      }
    };
  } catch (error) {
    return {
      type: 'browser:response',
      requestId: request.requestId,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to capture screenshot'
    };
  }
}


/**
 * Execute script in active tab
 * Uses MAIN world to bypass CSP restrictions
 */
async function executeScriptInTab(request: BrowserContextRequest): Promise<BrowserContextResponse> {
  console.log('[Background] executeScriptInTab called');
  const tab = await getActiveTab();
  console.log('[Background] Active tab:', tab.id, tab.url);
  const script = (request.params as { script?: string })?.script;

  if (!script) {
    console.log('[Background] No script provided');
    return {
      type: 'browser:response',
      requestId: request.requestId,
      success: false,
      error: 'No script provided'
    };
  }

  console.log('[Background] Executing script, length:', script.length);

  try {
    // Wrap user script in an IIFE that catches errors and returns result
    const wrappedScript = `
      (function() {
        try {
          ${script}
        } catch (e) {
          return { __error: e.message || 'Script execution failed' };
        }
      })();
    `;

    // Use MAIN world to run in page context and bypass CSP
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      world: 'MAIN',
      func: (code: string) => {
        const scriptEl = document.createElement('script');
        scriptEl.textContent = code;
        document.documentElement.appendChild(scriptEl);
        scriptEl.remove();
        return { success: true };
      },
      args: [wrappedScript]
    });

    console.log('[Background] Script injected');
    const result = results[0]?.result;

    return {
      type: 'browser:response',
      requestId: request.requestId,
      success: true,
      data: result
    };
  } catch (error) {
    console.error('[Background] executeScript error:', error);
    return {
      type: 'browser:response',
      requestId: request.requestId,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute script'
    };
  }
}

/**
 * Modify DOM elements in active tab
 */
async function modifyDomInTab(request: BrowserContextRequest): Promise<BrowserContextResponse> {
  console.log('[Background] modifyDomInTab called');
  const tab = await getActiveTab();

  const params = request.params as {
    selector?: string;
    action?: string;
    value?: string;
    attributeName?: string;
    all?: boolean;
  };

  if (!params?.selector) {
    return {
      type: 'browser:response',
      requestId: request.requestId,
      success: false,
      error: 'No selector provided'
    };
  }

  if (!params?.action) {
    return {
      type: 'browser:response',
      requestId: request.requestId,
      success: false,
      error: 'No action provided'
    };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: (selector: string, action: string, value: string | null, attributeName: string | null, all: boolean) => {
        try {
          const elements = all
            ? Array.from(document.querySelectorAll(selector))
            : [document.querySelector(selector)].filter(Boolean) as Element[];

          if (elements.length === 0) {
            return { success: false, error: `No elements found matching: ${selector}` };
          }

          let modifiedCount = 0;

          for (const element of elements) {
            switch (action) {
              case 'setHTML':
                (element as HTMLElement).innerHTML = value || '';
                modifiedCount++;
                break;
              case 'setOuterHTML':
                element.outerHTML = value || '';
                modifiedCount++;
                break;
              case 'setText':
                (element as HTMLElement).textContent = value || '';
                modifiedCount++;
                break;
              case 'setAttribute':
                if (!attributeName) {
                  return { success: false, error: 'attributeName required for setAttribute action' };
                }
                element.setAttribute(attributeName, value || '');
                modifiedCount++;
                break;
              case 'removeAttribute':
                if (!attributeName) {
                  return { success: false, error: 'attributeName required for removeAttribute action' };
                }
                element.removeAttribute(attributeName);
                modifiedCount++;
                break;
              case 'addClass':
                if (!value) {
                  return { success: false, error: 'value (class name) required for addClass action' };
                }
                element.classList.add(value);
                modifiedCount++;
                break;
              case 'removeClass':
                if (!value) {
                  return { success: false, error: 'value (class name) required for removeClass action' };
                }
                element.classList.remove(value);
                modifiedCount++;
                break;
              case 'remove':
                element.remove();
                modifiedCount++;
                break;
              case 'insertBefore':
                if (!value) {
                  return { success: false, error: 'value (HTML content) required for insertBefore action' };
                }
                element.insertAdjacentHTML('beforebegin', value);
                modifiedCount++;
                break;
              case 'insertAfter':
                if (!value) {
                  return { success: false, error: 'value (HTML content) required for insertAfter action' };
                }
                element.insertAdjacentHTML('afterend', value);
                modifiedCount++;
                break;
              default:
                return { success: false, error: `Unknown action: ${action}` };
            }
          }

          return {
            success: true,
            modifiedCount,
            message: `Modified ${modifiedCount} element(s) using ${action}`
          };
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : 'DOM modification failed' };
        }
      },
      args: [params.selector, params.action, params.value ?? null, params.attributeName ?? null, params.all ?? false]
    });

    const result = results[0]?.result;
    if (!result?.success) {
      return {
        type: 'browser:response',
        requestId: request.requestId,
        success: false,
        error: result?.error || 'DOM modification failed'
      };
    }

    return {
      type: 'browser:response',
      requestId: request.requestId,
      success: true,
      data: {
        modifiedCount: result.modifiedCount,
        message: result.message
      }
    };
  } catch (error) {
    console.error('[Background] modifyDom error:', error);
    return {
      type: 'browser:response',
      requestId: request.requestId,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to modify DOM'
    };
  }
}

/**
 * Attach debugger to tab and start capturing console logs
 */
async function attachDebuggerToTab(tabId: number): Promise<void> {
  if (attachedTabs.has(tabId)) {
    return; // Already attached
  }

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attachedTabs.add(tabId);
    consoleLogs.set(tabId, []);

    // Enable Log and Runtime domains
    await chrome.debugger.sendCommand({ tabId }, 'Log.enable');
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');

    console.log(`[Background] Debugger attached to tab ${tabId}`);
  } catch (error) {
    console.error(`[Background] Failed to attach debugger to tab ${tabId}:`, error);
    throw error;
  }
}

/**
 * Detach debugger from tab
 */
async function detachDebuggerFromTab(tabId: number): Promise<void> {
  if (!attachedTabs.has(tabId)) {
    return;
  }

  try {
    await chrome.debugger.detach({ tabId });
    attachedTabs.delete(tabId);
    // Keep logs for a bit in case they're requested
    console.log(`[Background] Debugger detached from tab ${tabId}`);
  } catch (error) {
    console.error(`[Background] Failed to detach debugger from tab ${tabId}:`, error);
  }
}

/**
 * Get console logs for active tab
 */
async function getConsoleLogs(request: BrowserContextRequest): Promise<BrowserContextResponse> {
  const tab = await getActiveTab();
  const tabId = tab.id!;

  const params = request.params as {
    level?: 'all' | 'error' | 'warning' | 'info';
    clear?: boolean;
  };

  // Attach debugger if not already attached
  if (!attachedTabs.has(tabId)) {
    try {
      await attachDebuggerToTab(tabId);
      // Give it a moment to collect any immediate logs
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      return {
        type: 'browser:response',
        requestId: request.requestId,
        success: false,
        error: `Failed to attach debugger: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  let logs = consoleLogs.get(tabId) || [];

  // Filter by level if specified
  if (params?.level && params.level !== 'all') {
    const levelMap: Record<string, string[]> = {
      'error': ['error'],
      'warning': ['warning'],
      'info': ['info', 'log']
    };
    const allowedLevels = levelMap[params.level] || [];
    logs = logs.filter(log => allowedLevels.includes(log.level));
  }

  // Clear logs if requested
  if (params?.clear) {
    consoleLogs.set(tabId, []);
  }

  return {
    type: 'browser:response',
    requestId: request.requestId,
    success: true,
    data: {
      logs,
      tabId,
      url: tab.url,
      isCapturing: attachedTabs.has(tabId)
    }
  };
}

// Handle debugger events
chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (!tabId || !attachedTabs.has(tabId)) return;

  let entry: ConsoleLogEntry | null = null;

  // Handle Log.entryAdded events (errors, warnings from browser)
  if (method === 'Log.entryAdded') {
    const logEntry = (params as any).entry;
    entry = {
      level: logEntry.level as ConsoleLogEntry['level'],
      text: logEntry.text,
      timestamp: Date.now(),
      url: logEntry.url,
      lineNumber: logEntry.lineNumber,
      stackTrace: logEntry.stackTrace?.callFrames?.map((f: any) =>
        `  at ${f.functionName || '(anonymous)'} (${f.url}:${f.lineNumber}:${f.columnNumber})`
      ).join('\n')
    };
  }

  // Handle Runtime.consoleAPICalled events (console.log, console.error, etc)
  if (method === 'Runtime.consoleAPICalled') {
    const consoleEvent = params as any;
    const levelMap: Record<string, ConsoleLogEntry['level']> = {
      'log': 'log',
      'info': 'info',
      'warn': 'warning',
      'warning': 'warning',
      'error': 'error',
      'debug': 'debug'
    };

    const text = consoleEvent.args?.map((arg: any) => {
      if (arg.type === 'string') return arg.value;
      if (arg.type === 'number') return String(arg.value);
      if (arg.type === 'boolean') return String(arg.value);
      if (arg.type === 'undefined') return 'undefined';
      if (arg.type === 'object' && arg.preview) {
        return arg.preview.description || JSON.stringify(arg.preview.properties?.slice(0, 5));
      }
      return arg.description || `[${arg.type}]`;
    }).join(' ') || '';

    entry = {
      level: levelMap[consoleEvent.type] || 'log',
      text,
      timestamp: Date.now(),
      stackTrace: consoleEvent.stackTrace?.callFrames?.map((f: any) =>
        `  at ${f.functionName || '(anonymous)'} (${f.url}:${f.lineNumber}:${f.columnNumber})`
      ).join('\n')
    };
  }

  // Handle Runtime.exceptionThrown events
  if (method === 'Runtime.exceptionThrown') {
    const exception = (params as any).exceptionDetails;
    entry = {
      level: 'error',
      text: exception.text || exception.exception?.description || 'Unknown error',
      timestamp: Date.now(),
      url: exception.url,
      lineNumber: exception.lineNumber,
      stackTrace: exception.stackTrace?.callFrames?.map((f: any) =>
        `  at ${f.functionName || '(anonymous)'} (${f.url}:${f.lineNumber}:${f.columnNumber})`
      ).join('\n')
    };
  }

  if (entry) {
    const logs = consoleLogs.get(tabId) || [];
    logs.push(entry);
    // Trim if too many logs
    if (logs.length > MAX_LOGS_PER_TAB) {
      logs.splice(0, logs.length - MAX_LOGS_PER_TAB);
    }
    consoleLogs.set(tabId, logs);
  }
});

// Clean up when debugger is detached (by user or DevTools)
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId);
    console.log(`[Background] Debugger detached from tab ${source.tabId}: ${reason}`);
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
  consoleLogs.delete(tabId);
});

// Listen for messages from side panel
chrome.runtime.onMessage.addListener((message: ExtensionMessage | WebSocketMessage, _sender, sendResponse) => {
  if (message.type === 'ping') {
    // Respond with current connection status
    const status = socket?.readyState === WebSocket.OPEN ? 'connected' : 'disconnected';
    sendResponse({ type: 'pong', connectionStatus: status });
    // Also broadcast the status so the sidepanel gets it
    setTimeout(() => broadcastToExtension({ type: 'connection:status', status }), 100);
    return true;
  }

  if (message.type === 'terminal:input' || message.type === 'terminal:resize') {
    sendToBackend(message as WebSocketMessage);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'connection:status' && (message as any).action === 'reconnect') {
    reconnectAttempts = 0;
    connectToBackend();
    sendResponse({ success: true });
    return true;
  }

  return false;
});

// Handle extension icon click - open side panel
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Initialize connection on service worker start
connectToBackend();

// Keep service worker alive with periodic connection checks
setInterval(() => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    connectToBackend();
  }
}, 30000);

console.log('[Background] Service worker initialized');
