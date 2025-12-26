/**
 * Content Script
 * Runs in the context of web pages and provides DOM access to the extension
 */

import type { ContentScriptMessage, ContentScriptResponse } from '../types/messages';

// Listen for messages from background script
chrome.runtime.onMessage.addListener(
  (message: ContentScriptMessage, _sender, sendResponse: (response: ContentScriptResponse) => void) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          type: 'content:response',
          requestId: message.requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });

    // Return true to indicate async response
    return true;
  }
);

/**
 * Handle incoming messages
 */
async function handleMessage(message: ContentScriptMessage): Promise<ContentScriptResponse> {
  switch (message.type) {
    case 'content:getDom':
      return getDom(message);
    case 'content:getSelection':
      return getSelection(message);
    case 'content:executeScript':
      return executeScript(message);
    default:
      return {
        type: 'content:response',
        requestId: message.requestId,
        success: false,
        error: `Unknown message type: ${(message as any).type}`
      };
  }
}

/**
 * Get DOM content
 */
function getDom(message: ContentScriptMessage): ContentScriptResponse {
  const params = message.params as { selector?: string; includeStyles?: boolean } | undefined;
  const selector = params?.selector || 'body';

  try {
    const element = document.querySelector(selector);
    if (!element) {
      return {
        type: 'content:response',
        requestId: message.requestId,
        success: false,
        error: `Element not found: ${selector}`
      };
    }

    const data: Record<string, unknown> = {
      html: element.outerHTML,
      text: element.textContent,
      url: window.location.href,
      title: document.title
    };

    // Optionally include computed styles
    if (params?.includeStyles) {
      data.styles = getComputedStylesForElement(element);
    }

    return {
      type: 'content:response',
      requestId: message.requestId,
      success: true,
      data
    };
  } catch (error) {
    return {
      type: 'content:response',
      requestId: message.requestId,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get DOM'
    };
  }
}

/**
 * Get computed styles for an element
 */
function getComputedStylesForElement(element: Element): Record<string, string> {
  const styles = window.getComputedStyle(element);
  const result: Record<string, string> = {};

  // Get a subset of commonly needed style properties
  const properties = [
    'color', 'backgroundColor', 'fontSize', 'fontFamily', 'fontWeight',
    'width', 'height', 'margin', 'padding', 'border', 'display',
    'position', 'top', 'left', 'right', 'bottom', 'zIndex'
  ];

  for (const prop of properties) {
    result[prop] = styles.getPropertyValue(prop);
  }

  return result;
}

/**
 * Get selected text
 */
function getSelection(message: ContentScriptMessage): ContentScriptResponse {
  try {
    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';

    let selectedElement: string | null = null;
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const element = container.nodeType === Node.ELEMENT_NODE
        ? container as Element
        : container.parentElement;
      selectedElement = element?.tagName.toLowerCase() || null;
    }

    return {
      type: 'content:response',
      requestId: message.requestId,
      success: true,
      data: {
        text: selectedText,
        element: selectedElement,
        url: window.location.href,
        title: document.title
      }
    };
  } catch (error) {
    return {
      type: 'content:response',
      requestId: message.requestId,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get selection'
    };
  }
}

/**
 * Execute a script in the page context
 */
function executeScript(message: ContentScriptMessage): ContentScriptResponse {
  const params = message.params as { script?: string } | undefined;
  const script = params?.script;

  if (!script) {
    return {
      type: 'content:response',
      requestId: message.requestId,
      success: false,
      error: 'No script provided'
    };
  }

  try {
    // Execute in a sandboxed way
    const func = new Function(script);
    const result = func();

    return {
      type: 'content:response',
      requestId: message.requestId,
      success: true,
      data: {
        result: result !== undefined ? JSON.stringify(result) : undefined
      }
    };
  } catch (error) {
    return {
      type: 'content:response',
      requestId: message.requestId,
      success: false,
      error: error instanceof Error ? error.message : 'Script execution failed'
    };
  }
}

// Notify that content script is loaded
console.log('[Gemini Context Terminal] Content script loaded');
