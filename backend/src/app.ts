import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';
import multer, { FileFilterCallback } from 'multer';
import fs from 'fs';
import { getRelevantKBContent } from './services/knowledgeBaseService';
import { callLLMApi } from './services/llmService';
import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getFeedbackHistory,
  saveFeedback,
  updateFeedback,
  deleteFeedback
} from './services/storageService';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const fallbackPorts = [3001, 3002, 3003, 3004, 3005];

// Configure multer for image uploads
const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (_req: express.Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (_req: express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (_req: express.Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  }
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL 
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:3002'],
  credentials: true
}));

app.use(bodyParser.json());
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[ERROR] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const openaiConfigured = !!process.env.OPENAI_API_KEY;
  res.json({ 
    status: 'OK',
    openaiConfigured,
    port,
    env: process.env.NODE_ENV || 'development'
  });
});

// Image upload endpoint
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ url: imageUrl });
  } catch (error) {
    console.error('[ERROR] Failed to upload image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Task management endpoints
app.get('/api/tasks', (req, res) => {
  try {
    const tasks = getAllTasks();
    res.json(tasks);
  } catch (error) {
    console.error('[ERROR] Failed to get tasks:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

app.get('/api/tasks/:id', (req, res) => {
  try {
    const task = getTaskById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    console.error('[ERROR] Failed to get task:', error);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

app.post('/api/tasks', (req, res) => {
  try {
    const { title, description, goal, learningObjectives, media } = req.body;
    
    if (!title || !description || !goal) {
      return res.status(400).json({ error: 'Title, description, and goal are required' });
    }

    // Validate media if present
    if (media) {
      if (!Array.isArray(media)) {
        return res.status(400).json({ error: 'Media must be an array' });
      }

      for (const item of media) {
        if (!item.type || !item.url) {
          return res.status(400).json({ error: 'Each media item must have type and url' });
        }
        if (item.type !== 'image' && item.type !== 'video') {
          return res.status(400).json({ error: 'Media type must be either image or video' });
        }
        if (item.type === 'video' && item.isLocal) {
          return res.status(400).json({ error: 'Videos must be from external URLs' });
        }
      }
    }
    
    const task = createTask({ 
      title, 
      description, 
      goal, 
      learningObjectives, 
      media,
      subtasks: [],
      completed: false
    });
    res.status(201).json(task);
  } catch (error) {
    console.error('[ERROR] Failed to create task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', (req, res) => {
  try {
    // Get the existing task first
    const existingTask = getTaskById(req.params.id);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // For completion status updates, we only need to validate the completed field
    if (Object.keys(req.body).length === 1 && 'completed' in req.body) {
      const task = updateTask(req.params.id, { completed: req.body.completed });
      return res.json(task);
    }

    // For full updates, validate all fields
    const { title, description, goal, learningObjectives, media, completed, subtasks, parentTaskId } = req.body;
    
    // Log the update request details
    console.log('[DEBUG] Task update request:', {
      taskId: req.params.id,
      existingMedia: existingTask.media,
      updatedMedia: media,
      body: req.body
    });

    // Validate media if present
    if (media !== undefined) {
      if (!Array.isArray(media)) {
        console.error('[ERROR] Invalid media format:', media);
        return res.status(400).json({ error: 'Media must be an array' });
      }

      for (const item of media) {
        if (!item.type || !item.url) {
          console.error('[ERROR] Invalid media item:', item);
          return res.status(400).json({ error: 'Each media item must have type and url' });
        }
        if (item.type !== 'image' && item.type !== 'video') {
          console.error('[ERROR] Invalid media type:', item.type);
          return res.status(400).json({ error: 'Media type must be either image or video' });
        }
        if (item.type === 'video' && item.isLocal) {
          console.error('[ERROR] Local video not allowed:', item);
          return res.status(400).json({ error: 'Videos must be from external URLs' });
        }
      }
    }

    const task = updateTask(req.params.id, { 
      title, 
      description, 
      goal, 
      learningObjectives, 
      media,
      completed,
      subtasks,
      parentTaskId
    });
    
    // Log the updated task
    console.log('[INFO] Task updated successfully:', task);
    res.json(task);
  } catch (error) {
    console.error('[ERROR] Failed to update task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  try {
    const success = deleteTask(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('[ERROR] Failed to delete task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Feedback history endpoints
app.get('/api/feedback', (req, res) => {
  try {
    const taskId = req.query.taskId as string | undefined;
    const subtaskId = req.query.subtaskId as string | undefined;
    const feedback = getFeedbackHistory(taskId).filter(f => 
      subtaskId ? f.subtaskId === subtaskId : true
    );
    res.json(feedback);
  } catch (error) {
    console.error('[ERROR] Failed to get feedback history:', error);
    res.status(500).json({ error: 'Failed to get feedback history' });
  }
});

app.delete('/api/feedback/:id', (req, res) => {
  try {
    const success = deleteFeedback(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('[ERROR] Failed to delete feedback:', error);
    res.status(500).json({ error: 'Failed to delete feedback' });
  }
});

// LLM feedback endpoint
app.post('/api/llm', async (req, res) => {
  const { taskId, subtaskId, userResponse, apiKey, promptTemplate } = req.body;

  // Validate input
  if (!taskId) {
    console.error('[ERROR] Missing taskId in request.');
    return res.status(400).json({ error: 'Missing taskId' });
  }
  if (typeof userResponse !== 'string') {
    console.error('[ERROR] userResponse must be a string.');
    return res.status(400).json({ error: 'Invalid userResponse' });
  }

  try {
    // Get task details
    const task = getTaskById(taskId);
    if (!task) {
      console.error('[ERROR] Task not found:', taskId);
      return res.status(404).json({ error: 'Task not found' });
    }

    // Get subtask if subtaskId is provided
    let goal = task.goal;
    if (subtaskId) {
      const subtask = task.subtasks.find(st => st.id === subtaskId);
      if (!subtask) {
        console.error('[ERROR] Subtask not found:', subtaskId);
        return res.status(404).json({ error: 'Subtask not found' });
      }
      goal = subtask.goal || task.goal; // Use task goal as fallback if subtask goal is undefined
    }

    // Retrieve relevant knowledge base snippet
    const kbExcerpt = await getRelevantKBContent(taskId, userResponse);
    
    // Build prompt and call LLM with task goal and custom settings
    const llmReply = await callLLMApi(userResponse, goal, kbExcerpt, {
      apiKey,
      promptTemplate
    });

    // Save feedback to history with proper response field
    const feedbackRecord = saveFeedback({
      taskId,
      subtaskId,
      response: userResponse,  // Use userResponse as response
      feedback: llmReply
    });

    // Log & return
    console.log('[INFO] LLM call successful for taskId:', taskId, subtaskId ? `subtaskId: ${subtaskId}` : '');
    return res.json({ feedback: llmReply, feedbackId: feedbackRecord.id });

  } catch (error) {
    console.error('[ERROR] LLM request failed:', error);
    
    // Handle specific OpenAI errors
    if (error instanceof Error) {
      if (error.message.includes('OpenAI API quota exceeded')) {
        return res.status(402).json({ error: error.message });
      }
      if (error.message.includes('Invalid OpenAI API key')) {
        return res.status(401).json({ error: error.message });
      }
      if (error.message.includes('rate limit')) {
        return res.status(429).json({ error: error.message });
      }
    }
    
    return res.status(500).json({ error: 'Failed to get AI feedback' });
  }
});

// Knowledge base endpoints
app.get('/api/kb/list', (req, res) => {
  try {
    const kbDir = path.join(__dirname, '../data/kb');
    if (!fs.existsSync(kbDir)) {
      fs.mkdirSync(kbDir, { recursive: true });
      return res.json([]);
    }
    
    const files = fs.readdirSync(kbDir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.basename(f));
      
    res.json(files);
  } catch (error) {
    console.error('[ERROR] Failed to list knowledge base files:', error);
    res.status(500).json({ error: 'Failed to list knowledge base files' });
  }
});

app.post('/api/subtasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const { title, description, goal } = req.body;
    
    const subtask = {
      id: `subtask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: title || '',
      description: description || '',
      goal: goal || '',  // Provide default empty string
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const task = getTaskById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updatedTask = updateTask(taskId, {
      subtasks: [...task.subtasks, subtask]
    });

    if (!updatedTask) {
      return res.status(500).json({ error: 'Failed to create subtask' });
    }

    res.status(201).json(subtask);
  } catch (error) {
    console.error('[ERROR] Failed to create subtask:', error);
    res.status(500).json({ error: 'Failed to create subtask' });
  }
});

// Function to try different ports
const startServer = async (port: number): Promise<number> => {
  try {
    await new Promise<void>((resolve, reject) => {
      const server = app.listen(port, () => {
        console.log(`[INFO] Server running on port ${port}`);
        console.log(`[INFO] API URL: http://localhost:${port}/api`);
        resolve();
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`[ERROR] Port ${port} is already in use. Please use a different port or stop the service using this port.`);
          process.exit(1);
        } else {
          reject(err);
        }
      });
    });

    return port;
  } catch (err) {
    console.error('[ERROR] Failed to start server:', err);
    process.exit(1);
  }
};

// Start the server
const PORT = parseInt(process.env.PORT || '3001', 10);

startServer(PORT)
  .then(port => {
    // Log successful startup
    console.log(`[INFO] Server started successfully on port ${port}`);
  })
  .catch(err => {
    console.error('[ERROR] Failed to start server:', err);
    process.exit(1);
  }); 