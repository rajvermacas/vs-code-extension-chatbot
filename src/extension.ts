import * as vscode from 'vscode';
import axios from 'axios';

export function activate(context: vscode.ExtensionContext) {
    // Register the chat command
    let disposable = vscode.commands.registerCommand('codebase-chatbot.startChat', () => {
        // Create and show the webview panel
        const panel = vscode.window.createWebviewPanel(
            'codebaseChatbot',
            'Codebase Chatbot',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true
            }
        );

        // Get configuration
        const config = vscode.workspace.getConfiguration('codebaseChatbot');
        const apiEndpoint = config.get<string>('apiEndpoint', 'http://host.docker.internal:1234/v1/chat/completions');
        const modelName = config.get<string>('modelName', 'codeqwen1.5-7b-chat');

        // Set up the webview content
        panel.webview.html = getWebviewContent();

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'sendMessage':
                        try {
                            // Send message to LLM
                            const response = await axios.post(apiEndpoint, {
                                model: modelName,
                                messages: [
                                    { role: 'user', content: message.text }
                                ],
                                stream: false
                            });

                            // Send response back to webview
                            panel.webview.postMessage({
                                command: 'receiveMessage',
                                text: response.data.choices[0].message.content
                            });
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to send message: ${error}`);
                        }
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

function getWebviewContent() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Codebase Chatbot</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                display: flex;
                flex-direction: column;
                height: 100vh;
                margin: 0;
                background-color: #1e1e1e;
                color: #e0e0e0;
            }
            #chat-container {
                flex-grow: 1;
                overflow-y: auto;
                padding: 16px;
                scroll-behavior: smooth;
            }
            #message-form {
                display: flex;
                padding: 16px;
                background-color: #2d2d2d;
                border-top: 1px solid #404040;
                gap: 12px;
            }
            #message-input {
                flex-grow: 1;
                padding: 12px;
                border-radius: 8px;
                border: 1px solid #404040;
                background-color: #363636;
                color: #e0e0e0;
                font-size: 14px;
                transition: border-color 0.2s;
            }
            #message-input:focus {
                outline: none;
                border-color: #0078d4;
            }
            #message-input::placeholder {
                color: #888888;
            }
            button {
                padding: 8px 16px;
                background-color: #0078d4;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
                transition: background-color 0.2s;
            }
            button:hover {
                background-color: #0086ef;
            }
            .message {
                margin-bottom: 12px;
                padding: 12px 16px;
                border-radius: 8px;
                max-width: 80%;
                line-height: 1.4;
            }
            .user-message {
                background-color: #0078d4;
                color: white;
                margin-left: auto;
                border-bottom-right-radius: 4px;
            }
            .bot-message {
                background-color: #2d2d2d;
                border: 1px solid #404040;
                border-bottom-left-radius: 4px;
            }
        </style>
    </head>
    <body>
        <div id="chat-container"></div>
        <form id="message-form">
            <input type="text" id="message-input" placeholder="Type your message...">
            <button type="submit">Send</button>
        </form>

        <script>
            const vscode = acquireVsCodeApi();
            const chatContainer = document.getElementById('chat-container');
            const messageForm = document.getElementById('message-form');
            const messageInput = document.getElementById('message-input');

            // Auto-focus the input box when the window opens
            messageInput.focus();

            messageForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const message = messageInput.value.trim();
                if (message) {
                    // Display user message
                    const userMessageEl = document.createElement('div');
                    userMessageEl.classList.add('message', 'user-message');
                    userMessageEl.textContent = message;
                    chatContainer.appendChild(userMessageEl);
                    
                    // Send message to extension
                    vscode.postMessage({
                        command: 'sendMessage',
                        text: message
                    });

                    // Clear input
                    messageInput.value = '';
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            });

            // Listen for messages from the extension
            window.addEventListener('message', (event) => {
                const message = event.data;
                if (message.command === 'receiveMessage') {
                    const botMessageEl = document.createElement('div');
                    botMessageEl.classList.add('message', 'bot-message');
                    botMessageEl.textContent = message.text;
                    chatContainer.appendChild(botMessageEl);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            });
        </script>
    </body>
    </html>
    `;
}

export function deactivate() {}
