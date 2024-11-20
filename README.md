# Codebase Chat VS Code Extension

A VS Code extension that allows you to chat with your codebase using locally hosted LLM models.

## Features

- Chat interface within VS Code
- Support for locally hosted LLM models
- Context-aware responses based on your current file and workspace
- Modern and responsive UI that matches VS Code's theme

## Requirements

- VS Code 1.85.0 or higher
- Node.js and npm installed
- A locally hosted LLM model server (defaults to http://localhost:8080)

## Installation

1. Clone this repository
2. Run `npm install` to install dependencies
3. Press F5 to start debugging in a new VS Code window

## Usage

1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac) to open the command palette
2. Type "Start Codebase Chat" and select the command
3. A chat panel will open on the right side
4. Type your questions about the codebase and press Enter or click Send

## Configuration

You can configure the LLM model endpoint in VS Code settings:

1. Open VS Code settings (File > Preferences > Settings)
2. Search for "Codebase Chat"
3. Update the "Model Endpoint" setting with your local LLM server URL

## Local LLM Server Requirements

Your local LLM server should accept POST requests with the following JSON structure:

```json
{
    "message": "User's message",
    "context": "Current file and workspace context"
}
```

And should respond with:

```json
{
    "response": "LLM's response"
}
```

## Development

- `npm run compile` - Compile the extension
- `npm run watch` - Compile the extension and watch for changes
- `npm run lint` - Lint the code
- `npm run test` - Run the test suite

## License

MIT
