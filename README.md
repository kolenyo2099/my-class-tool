# Class Activity Management Tool

A tool for managing class activities with LLM-powered feedback, designed for teachers to facilitate group discussions and receive AI-assisted pedagogical guidance.

## Features

- Task/slide navigation for presenting discussion prompts
- Real-time group response input
- AI-powered feedback using OpenAI's GPT models
- Local markdown-based knowledge base integration
- Modern, responsive UI with Tailwind CSS
- TypeScript for type safety and better development experience

## Project Structure

```
my-class-tool/
├── backend/                 # Express.js backend
│   ├── src/
│   │   ├── app.ts          # Main server file
│   │   └── services/       # Backend services
│   │       ├── knowledgeBaseService.ts
│   │       └── llmService.ts
│   └── data/
│       └── kb/            # Knowledge base markdown files
└── frontend/              # Next.js frontend
    └── src/
        ├── app/          # Next.js app router
        ├── components/   # React components
        └── services/     # Frontend services
```

## Prerequisites

- Node.js 18+ and npm
- OpenAI API key

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend
   npm install
   ```

3. Set up environment variables:
   ```bash
   # Backend (.env)
   PORT=3001
   OPENAI_API_KEY=your_openai_api_key_here

   # Frontend (.env.local)
   NEXT_PUBLIC_API_URL=http://localhost:3001/api
   ```

4. Start the development servers:
   ```bash
   # Backend
   cd backend
   npm run dev

   # Frontend (in a new terminal)
   cd frontend
   npm run dev
   ```

5. Open http://localhost:3000 in your browser

## Usage

1. Navigate through tasks using the Previous/Next buttons
2. Type the group's response in the input area
3. Click "Get Feedback" to receive AI-powered guidance
4. Review and optionally edit the feedback before sharing with the class
5. Clear feedback when ready to move to the next task

## Knowledge Base

Add markdown files to `backend/data/kb/` to provide domain-specific context for the AI feedback. The system will automatically use relevant excerpts when generating feedback.

## Development

- Backend runs on http://localhost:3001
- Frontend runs on http://localhost:3000
- Uses TypeScript for both frontend and backend
- Tailwind CSS for styling
- Express.js for the API
- Next.js for the frontend

## Error Handling

The application includes comprehensive error handling:
- API errors with appropriate status codes
- User-friendly error messages
- Logging for debugging
- Loading states for better UX

## Future Improvements

- Advanced knowledge base search using embeddings
- Real-time collaboration features
- Task/response persistence
- Custom prompt templates
- Additional LLM model options

## License

Royalty-free I'm not responsible if you break something ;)