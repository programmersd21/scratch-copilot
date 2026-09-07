# Scratch Copilot AI

![Demo](screenshots/demo.png)

Scratch Copilot AI is a powerful Chrome extension that acts as an intelligent assistant for the [Scratch](https://scratch.mit.edu) editor. It empowers users to create, modify, and control their Scratch projects using natural language through an integrated AI chat interface — powered by your choice of **Google Gemini**, **OpenAI**, **OpenRouter**, or **Groq**.

## 🚀 Features

- **Multi-Provider AI**: Choose between Google Gemini, OpenAI, OpenRouter, and Groq — switch anytime in the settings menu, with optional custom model overrides.
- **Expert Level Coding**: Generates code based on the "Griffpatch Manifesto"—enforcing single-script architectures, high-performance game loops, and velocity-based physics.
- **Advanced Extension Support**: Built-in support for Face Sensing, Video Sensing, Pen, Music, and more with verified opcode mapping.
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
3. Click the ⚙️ icon in the panel header to open the **settings menu** and configure the AI:
   - **AI Provider**: Pick one of Google Gemini, OpenAI, OpenRouter, or Groq.
   - **API Key**: Paste the API key for the selected provider (see [AI Providers](#-ai-providers) below to get one).
   - **Model**: Optionally override the provider's default model (leave blank to use the default).
   - Click **Save** — your key is stored only in your browser.
4. Start chatting with the AI to begin building your games!

> 💡 You can configure API keys for several providers and switch between them at any time — each provider keeps its own key and model setting.

## 🔑 AI Providers

Scratch Copilot supports four AI providers. Get a free or paid API key from any of them:

| Provider | Default Model | Get an API Key |
|----------|---------------|----------------|
| **Google Gemini** | `gemini-2.0-flash` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **OpenAI** | `gpt-4o` | [platform.openai.com](https://platform.openai.com/api-keys) |
| **OpenRouter** | `openrouter/free` | [openrouter.ai](https://openrouter.ai/keys) |
| **Groq** (default) | `openai/gpt-oss-120b` | [console.groq.com](https://console.groq.com/keys) |

⚠️ Models change quickly and may differ in the future

- **Groq** is a great free starting point with very fast responses.
- **OpenRouter** gives you access to hundreds of models (including Claude, GPT, Llama, and more) through a single key — set any model ID in the Model field.
- **Gemini** and **OpenAI** require accounts with their respective platforms.
- Model IDs follow each provider's naming; when overriding, make sure the model exists on the selected provider.

## 🧩 Architecture

The extension follows a modular architecture with all source files organized in the `src/` directory:

- **`src/aiClient.js`**: Multi-provider AI integration (Google Gemini, OpenAI, OpenRouter, Groq) that processes prompts and outputs Scratch-compatible JSON.
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
