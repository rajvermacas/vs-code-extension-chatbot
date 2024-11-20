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
            }
            #chat-container {
                flex-grow: 1;
                overflow-y: auto;
                padding: 10px;
            }
            #message-form {
                display: flex;
                padding: 10px;
                background-color: #f0f0f0;
            }
            #message-input {
                flex-grow: 1;
                margin-right: 10px;
                padding: 5px;
            }
            .message {
                margin-bottom: 10px;
                padding: 8px;
                border-radius: 4px;
            }
            .user-message {
                background-color: #e6f2ff;
                text-align: right;
            }
            .bot-message {
                background-color: #f0f0f0;
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
