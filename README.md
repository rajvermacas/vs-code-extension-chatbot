# Codebase Chatbot VS Code Extension

## Overview
Codebase Chatbot is a VS Code extension that allows you to interact with your codebase using a local Large Language Model (LLM).

## Features
- Chat interface within VS Code
- Configurable local LLM endpoint
- Easy-to-use command to start chatting

## Installation
1. Clone this repository
2. Run `npm install`
3. Press F5 to run the extension in debug mode

## Configuration
You can configure the extension in your VS Code settings:

```json
{
    "codebaseChatbot.apiEndpoint": "http://host.docker.internal:1234/v1/chat/completions",
    "codebaseChatbot.modelName": "codeqwen1.5-7b-chat"
}
```

## Usage
1. Open the command palette (Ctrl+Shift+P)
2. Type "Codebase Chatbot: Start Chat"
3. The chatbot interface will open

## Requirements
- A local LLM server running at the specified endpoint
- OpenAI-compatible chat completions API

## Troubleshooting
- Ensure the LLM server is running
- Check the API endpoint configuration
- Verify network connectivity

## Contributing
Contributions are welcome! Please submit pull requests or open issues.

## License
[Your License Here]
