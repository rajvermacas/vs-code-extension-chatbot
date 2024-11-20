import * as vscode from 'vscode';
import axios from 'axios';

interface ChatMessage {
    text: string;
    sender: 'user' | 'assistant';
    timestamp: number;
    complete?: boolean;
}

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    let chatHistory: ChatMessage[] = [];
    outputChannel = vscode.window.createOutputChannel('Codebase Chat');

    let disposable = vscode.commands.registerCommand('codebase-chat.startChat', async () => {
        const panel = vscode.window.createWebviewPanel(
            'codebaseChat',
            'Codebase Chat',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Initialize chat UI
        panel.webview.html = getWebviewContent(chatHistory);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'sendMessage':
                        try {
                            const userMessage: ChatMessage = {
                                text: message.text,
                                sender: 'user',
                                timestamp: Date.now(),
                                complete: true
                            };
                            chatHistory.push(userMessage);

                            // Show user message immediately
                            panel.webview.postMessage({ 
                                command: 'updateChat',
                                messages: chatHistory
                            });

                            // Add a placeholder for assistant's response
                            const assistantMessage: ChatMessage = {
                                text: '',
                                sender: 'assistant',
                                timestamp: Date.now(),
                                complete: false
                            };
                            chatHistory.push(assistantMessage);

                            // Start streaming response
                            try {
                                await streamFromLLM(message.text, (chunk) => {
                                    // Update the last message with new content
                                    assistantMessage.text += chunk;
                                    panel.webview.postMessage({ 
                                        command: 'updateChat',
                                        messages: chatHistory
                                    });
                                });
                                // Mark the message as complete
                                assistantMessage.complete = true;
                                panel.webview.postMessage({ 
                                    command: 'updateChat',
                                    messages: chatHistory
                                });
                            } catch (error) {
                                // Remove the incomplete assistant message
                                chatHistory.pop();
                                throw error;
                            }
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                            vscode.window.showErrorMessage(`Error communicating with LLM: ${errorMessage}`);
                            outputChannel.appendLine(`Error: ${errorMessage}`);
                        }
                        break;
                    case 'clearHistory':
                        chatHistory = [];
                        panel.webview.postMessage({ 
                            command: 'updateChat',
                            messages: chatHistory
                        });
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

async function streamFromLLM(message: string, onChunk: (chunk: string) => void): Promise<void> {
    const config = vscode.workspace.getConfiguration('codebase-chat');
    let modelEndpoint = config.get<string>('modelEndpoint');
    const modelName = config.get<string>('modelName');

    if (!modelEndpoint) {
        throw new Error('Model endpoint not configured');
    }

    if (!modelName) {
        throw new Error('Model name not configured');
    }

    // Ensure the endpoint has a protocol
    if (!modelEndpoint.startsWith('http://') && !modelEndpoint.startsWith('https://')) {
        modelEndpoint = 'http://' + modelEndpoint;
    }

    const context = await getCodeContext();
    const payload = {
        model: modelName,
        messages: [
            {
                role: "system",
                content: "You are a helpful coding assistant. Use the following context to help answer the user's question:\n" + context
            },
            {
                role: "user",
                content: message
            }
        ],
        temperature: 0.7,
        max_tokens: -1,
        stream: true
    };

    outputChannel.appendLine(`Sending streaming request to: ${modelEndpoint}`);
    outputChannel.appendLine(`Request payload: ${JSON.stringify(payload, null, 2)}`);

    try {
        const response = await axios.post(modelEndpoint, payload, {
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            responseType: 'stream',
            validateStatus: null
        });

        if (response.status !== 200) {
            throw new Error(`HTTP ${response.status}: Connection failed`);
        }

        return new Promise((resolve, reject) => {
            let buffer = '';
            
            response.data.on('data', (chunk: Buffer) => {
                const lines = (buffer + chunk.toString()).split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            resolve();
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.choices?.[0]?.delta?.content) {
                                onChunk(parsed.choices[0].delta.content);
                            }
                        } catch (e) {
                            outputChannel.appendLine(`Error parsing chunk: ${e}`);
                        }
                    }
                }
            });

            response.data.on('end', () => {
                resolve();
            });

            response.data.on('error', (err: Error) => {
                reject(err);
            });
        });
    } catch (error) {
        if (axios.isAxiosError(error)) {
            outputChannel.appendLine(`Axios error: ${error.message}`);
            if (error.response) {
                outputChannel.appendLine(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
            }

            if (error.code === 'ECONNREFUSED') {
                const suggestions = [
                    "1. Check if the LLM server is running on the host machine",
                    "2. Since you're running in Docker, make sure to use 'host.docker.internal' instead of 'localhost' or '127.0.0.1'",
                    "3. Verify that your Docker container has access to the host network",
                    "4. Check if the host machine's firewall allows connections from Docker",
                    "5. Verify the port number matches your LLM server (current: " + new URL(modelEndpoint).port + ")",
                    "6. Try adding the following to your Docker run command: '--add-host=host.docker.internal:host-gateway'",
                    "7. Make sure LMStudio is running and the API server is started",
                    `8. Current endpoint: ${modelEndpoint}`
                ].join('\n');
                throw new Error(`Could not connect to LLM service.\n${suggestions}`);
            }

            const errorMessage = error.response?.data?.error || error.message;
            throw new Error(`LLM service error: ${errorMessage}`);
        }
        throw error;
    }
}

async function getCodeContext(): Promise<string> {
    let context = '';
    
    // Get active editor content
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const document = activeEditor.document;
        const selection = activeEditor.selection;
        
        context += `Active file: ${document.fileName}\n`;
        
        if (!selection.isEmpty) {
            // If there's selected text, use that as context
            const selectedText = document.getText(selection);
            context += `Selected code:\n${selectedText}\n`;
        } else {
            // Otherwise use the full file content
            const fullText = document.getText();
            context += `File content:\n${fullText}\n`;
        }

        // Add cursor position information
        context += `Cursor position: Line ${selection.active.line + 1}, Column ${selection.active.character + 1}\n`;
    }

    // Get workspace folder information
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        context += `\nWorkspace root: ${workspaceRoot}\n`;

        // Get list of workspace files
        try {
            const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
            context += `\nWorkspace files:\n${files.map(file => file.fsPath).join('\n')}\n`;
        } catch (error) {
            // Ignore file listing errors
        }
    }

    return context;
}

function getWebviewContent(messages: ChatMessage[]) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Codebase Chat</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                margin: 0;
                padding: 20px;
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
            }
            #chat-container {
                display: flex;
                flex-direction: column;
                height: calc(100vh - 40px);
            }
            #messages {
                flex-grow: 1;
                overflow-y: auto;
                margin-bottom: 20px;
                padding: 10px;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
            }
            .message {
                margin-bottom: 10px;
                padding: 8px;
                border-radius: 4px;
                max-width: 80%;
                word-wrap: break-word;
                position: relative;
            }
            .message pre {
                white-space: pre-wrap;
                word-wrap: break-word;
                background-color: var(--vscode-textBlockQuote-background);
                padding: 12px;
                border-radius: 6px;
                margin: 8px 0;
                font-family: var(--vscode-editor-font-family);
                border: 1px solid var(--vscode-input-border);
                position: relative;
            }
            .message pre code {
                font-family: var(--vscode-editor-font-family);
                background-color: transparent;
                padding: 0;
                border-radius: 0;
                display: block;
                overflow-x: auto;
            }
            .message code {
                font-family: var(--vscode-editor-font-family);
                background-color: var(--vscode-textBlockQuote-background);
                padding: 2px 4px;
                border-radius: 3px;
                border: 1px solid var(--vscode-input-border);
            }
            .code-language {
                position: absolute;
                top: 0;
                right: 8px;
                font-size: 0.8em;
                color: var(--vscode-descriptionForeground);
                background-color: var(--vscode-editor-background);
                padding: 2px 6px;
                border-radius: 0 0 0 4px;
                opacity: 0.8;
            }
            .user-message {
                background-color: var(--vscode-editor-selectionBackground);
                margin-left: auto;
            }
            .assistant-message {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                margin-right: auto;
            }
            .message.incomplete::after {
                content: '';
                display: inline-block;
                width: 10px;
                height: 10px;
                margin-left: 5px;
                border-radius: 50%;
                background-color: var(--vscode-editor-foreground);
                animation: blink 1s infinite;
                vertical-align: middle;
            }
            @keyframes blink {
                0% { opacity: 0.2; }
                50% { opacity: 1; }
                100% { opacity: 0.2; }
            }
            .timestamp {
                font-size: 0.8em;
                color: var(--vscode-descriptionForeground);
                margin-top: 4px;
            }
            #input-container {
                display: flex;
                gap: 10px;
                position: relative;
            }
            #message-input {
                flex-grow: 1;
                padding: 8px;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                font-family: var(--vscode-font-family);
                resize: vertical;
                min-height: 60px;
                margin: 0;
            }
            #message-input:disabled {
                opacity: 0.7;
                cursor: not-allowed;
            }
            button {
                padding: 8px 16px;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 4px;
                cursor: pointer;
                align-self: flex-start;
            }
            button:hover:not(:disabled) {
                background-color: var(--vscode-button-hoverBackground);
            }
            button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            #toolbar {
                display: flex;
                justify-content: flex-end;
                margin-bottom: 10px;
            }
        </style>
    </head>
    <body>
        <div id="chat-container">
            <div id="toolbar">
                <button id="clear-button">Clear History</button>
            </div>
            <div id="messages"></div>
            <div id="input-container">
                <textarea id="message-input" placeholder="Type your message..." rows="3"></textarea>
                <button id="send-button">Send</button>
            </div>
        </div>
        <script>
            const vscode = acquireVsCodeApi();
            const messagesContainer = document.getElementById('messages');
            const messageInput = document.getElementById('message-input');
            const sendButton = document.getElementById('send-button');
            const clearButton = document.getElementById('clear-button');

            // Initialize with existing messages
            const messages = ${JSON.stringify(messages)};
            messages.forEach(message => addMessage(message));

            function formatTimestamp(timestamp) {
                return new Date(timestamp).toLocaleTimeString();
            }

            function extractLanguage(codeBlock) {
                const match = codeBlock.match(/^\`\`\`([a-zA-Z0-9+#]+)?\n/);
                return match ? match[1] || '' : '';
            }

            function addMessage(message) {
                const messageDiv = document.createElement('div');
                messageDiv.className = \`message \${message.sender}-message\`;
                if (!message.complete) {
                    messageDiv.className += ' incomplete';
                }
                
                // Format message text (handle code blocks and inline code)
                let formattedText = message.text;
                
                // Handle code blocks with language specification
                formattedText = formattedText.replace(/\`\`\`([a-zA-Z0-9+#]*)\n([\s\S]*?)\`\`\`/g, (match, lang, code) => {
                    const language = lang || '';
                    const languageLabel = language ? \`<div class="code-language">\${language}</div>\` : '';
                    return \`<pre>\${languageLabel}<code class="language-\${language}">\${code.trim()}</code></pre>\`;
                });
                
                // Handle inline code
                formattedText = formattedText.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
                
                messageDiv.innerHTML = formattedText;

                const timestampDiv = document.createElement('div');
                timestampDiv.className = 'timestamp';
                timestampDiv.textContent = formatTimestamp(message.timestamp);
                messageDiv.appendChild(timestampDiv);

                messagesContainer.appendChild(messageDiv);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }

            function sendMessage() {
                const text = messageInput.value.trim();
                if (text) {
                    messageInput.disabled = true;
                    sendButton.disabled = true;
                    
                    vscode.postMessage({
                        command: 'sendMessage',
                        text: text
                    });
                    
                    messageInput.value = '';
                }
            }

            // Handle messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'updateChat':
                        messagesContainer.innerHTML = '';
                        message.messages.forEach(msg => addMessage(msg));
                        const lastMessage = message.messages[message.messages.length - 1];
                        if (!lastMessage || lastMessage.complete) {
                            messageInput.disabled = false;
                            sendButton.disabled = false;
                            messageInput.focus();
                        }
                        break;
                }
            });

            // Initialize event listeners
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });

            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                }
            });

            sendButton.addEventListener('click', () => {
                sendMessage();
            });

            clearButton.addEventListener('click', () => {
                vscode.postMessage({ command: 'clearHistory' });
            });

            // Focus input on load
            messageInput.focus();
        </script>
    </body>
    </html>`;
}

export function deactivate() {}
