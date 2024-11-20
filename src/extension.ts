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
                            // Show thinking indicator
                            panel.webview.postMessage({
                                command: 'receiveMessage',
                                text: '__thinking__'
                            });

                            // Send message to LLM with streaming enabled
                            const response = await axios.post(apiEndpoint, {
                                model: modelName,
                                messages: [
                                    { role: 'user', content: message.text }
                                ],
                                stream: true
                            }, {
                                responseType: 'stream'
                            });

                            // Clear thinking indicator and start stream
                            panel.webview.postMessage({
                                command: 'receiveMessage',
                                text: '__clear_thinking__'
                            });
                            panel.webview.postMessage({
                                command: 'receiveMessage',
                                text: '__start_stream__'
                            });

                            let currentMessage = '';
                            response.data.on('data', (chunk: Buffer) => {
                                const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                                for (const line of lines) {
                                    if (line.includes('[DONE]')) {
                                        panel.webview.postMessage({
                                            command: 'receiveMessage',
                                            text: '__end_stream__'
                                        });
                                        continue;
                                    }
                                    if (line.startsWith('data: ')) {
                                        try {
                                            const data = JSON.parse(line.slice(6));
                                            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                                                currentMessage += data.choices[0].delta.content;
                                                panel.webview.postMessage({
                                                    command: 'receiveMessage',
                                                    text: currentMessage
                                                });
                                            }
                                        } catch (e) {
                                            console.error('Error parsing streaming response:', e);
                                        }
                                    }
                                }
                            });

                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to send message: ${error}`);
                            // Clear thinking indicator in case of error
                            panel.webview.postMessage({
                                command: 'receiveMessage',
                                text: '__clear_thinking__'
                            });
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
            .thinking {
                background-color: #2d2d2d;
                border: 1px solid #404040;
                border-bottom-left-radius: 4px;
                color: #888888;
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
                switch (message.command) {
                    case 'receiveMessage':
                        if (message.text === '__thinking__') {
                            const botMessageEl = document.createElement('div');
                            botMessageEl.classList.add('message', 'bot-message', 'thinking');
                            botMessageEl.id = 'thinking-message';
                            botMessageEl.textContent = 'Thinking...';
                            chatContainer.appendChild(botMessageEl);
                            chatContainer.scrollTop = chatContainer.scrollHeight;
                        } else if (message.text === '__clear_thinking__') {
                            const thinkingMessage = document.getElementById('thinking-message');
                            if (thinkingMessage) {
                                thinkingMessage.remove();
                            }
                        } else if (message.text === '__start_stream__') {
                            const botMessageEl = document.createElement('div');
                            botMessageEl.classList.add('message', 'bot-message');
                            botMessageEl.id = 'current-stream-message';
                            chatContainer.appendChild(botMessageEl);
                            chatContainer.scrollTop = chatContainer.scrollHeight;
                        } else if (message.text === '__end_stream__') {
                            const streamMessage = document.getElementById('current-stream-message');
                            if (streamMessage) {
                                streamMessage.id = '';  // Clear the ID as this message is complete
                            }
                        } else {
                            const streamMessage = document.getElementById('current-stream-message');
                            if (streamMessage) {
                                streamMessage.textContent = message.text;
                                chatContainer.scrollTop = chatContainer.scrollHeight;
                            }
                        }
                        break;
                }
            });
        </script>
    </body>
    </html>
    `;
}

export function deactivate() {}
