# NovaMind AI Backend

The server-side system of NovaMind AI, powering real-time chat communication and vector RAG operations.

## Architecture

The backend is built as a modular TypeScript/Express application:
- **`src/config`**: Houses system configurations (db, sockets, winston logger, AI, multer uploads).
- **`src/modules`**: Individual app domain modules (auth, user, chat, conversation, document parsing/chunking, RAG, AI orchestration).
- **`src/models`**: Database persistence layers utilizing Mongoose schemas.
- **`src/middleware`**: Authentication, rate limit, upload parsing, and error-handling filters.
- **`src/services`**: Standalone backend utility operations (JWT, email services, cache/queue clients).
- **`src/sockets`**: Real-time Socket.io event orchestration.
- **`src/utils`**: Custom helpers, custom errors (`ApiError`), and token counters.

## Prerequisites

- Node.js (v18+)
- MongoDB
- ChromaDB (for vector search)

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Build for production:
   ```bash
   npm run build
   ```
