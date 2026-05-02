# Scratch Copilot AI

Scratch Copilot AI is a powerful Chrome extension that acts as an intelligent assistant for the [Scratch](https://scratch.mit.edu) editor. It empowers users to create, modify, and control their Scratch projects using natural language through an integrated Gemini AI chat interface.

## 🚀 Features

- **Natural Language Coding**: Generate complex Scratch block scripts using simple English prompts.
- **Automated Asset Management**: Automatically create and add sprites, costumes, sounds, and backdrops to your project.
- **Smart VM Control**: Real-time control of the Scratch VM, including green flag triggers, variable setting, and sprite manipulation.
- **Project Inspection**: Quickly summarize your current Scratch project state.
- **Modern UI**: Sleek, dark-themed, and responsive interface with an easy-to-access 🤖 launcher.

## 🛠 Installation

1. Clone this repository to your local machine.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the directory containing these files.

## ⚙ Usage

1. Open any Scratch project in the [Scratch Editor](https://scratch.mit.edu/projects/*/editor).
2. Click the 🤖 floating button in the bottom-right corner.
3. Configure your [Gemini API Key](https://aistudio.google.com/) in the extension settings panel.
4. Start chatting with the AI to begin building your games!

## 🧩 Architecture

The extension follows a modular architecture with all source files organized in the `src/` directory:

- **`src/aiClient.js`**: Integrates with Google's Gemini API to process prompts and output Scratch-compatible JSON.
- **`src/vmController.js`**: Interfaces directly with the Scratch VM instance to perform actions like creating sprites, adding costumes, and injecting block scripts.
- **`src/ui.js`**: Manages the visual components, chat interface, and user interactions.
- **`src/content.js`**: Handles the injection of the extension's scripts into the Scratch editor's main execution context.
- **`src/vmHook.js`**: Establishes and manages connections to the Scratch VM.
- **`src/assetManager.js`**: Handles sprite, costume, sound, and backdrop asset management.
- **`src/blockBuilder.js`**: Constructs and validates Scratch block structures.
- **`src/spriteController.js`**: Controls sprite-specific operations and properties.
- **`src/variableManager.js`**: Manages variables and broadcasts across the project.
- **`src/extensionLoader.js`**: Loads and registers required Scratch extensions.
- **`src/projectSerializer.js`**: Serializes and deserializes project state for persistence.
- **`src/debugPanel.js`**: Provides debugging utilities and logging for development.
- **`src/logger.js`**: Centralized logging system for the extension.

## ⚖ License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
