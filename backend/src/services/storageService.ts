import fs from 'fs';
import path from 'path';
import { Task, FeedbackHistory } from '../types';

interface Storage {
  tasks: Task[];
  feedbackHistory: FeedbackHistory[];
}

const DATA_DIR = path.join(__dirname, '../../data');
const STORAGE_FILE = path.join(DATA_DIR, 'storage.json');

// Initialize storage
function initializeStorage(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.log('[INFO] Created data directory:', DATA_DIR);
    }
    
    if (!fs.existsSync(STORAGE_FILE)) {
      const initialData: Storage = {
        tasks: [],
        feedbackHistory: []
      };
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(initialData, null, 2));
      console.log('[INFO] Created storage file:', STORAGE_FILE);
    }
  } catch (error) {
    console.error('[ERROR] Failed to initialize storage:', error);
    throw new Error('Storage initialization failed');
  }
}

// Read storage
function readStorage(): Storage {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      console.warn('[WARN] Storage file not found, initializing new storage');
      initializeStorage();
    }
    const data = fs.readFileSync(STORAGE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[ERROR] Failed to read storage:', error);
    return { tasks: [], feedbackHistory: [] };
  }
}

// Write storage
function writeStorage(data: Storage): void {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[ERROR] Failed to write storage:', error);
    throw new Error('Failed to write to storage');
  }
}

// Task management
export function getAllTasks(): Task[] {
  return readStorage().tasks;
}

export function getTaskById(id: string): Task | undefined {
  return readStorage().tasks.find(task => task.id === id);
}

export function createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
  const storage = readStorage();
  const newTask: Task = {
    id: Date.now().toString(),
    ...taskData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    subtasks: taskData.subtasks || [],
    completed: taskData.completed || false
  };
  
  storage.tasks.push(newTask);
  writeStorage(storage);
  console.log(`[INFO] Successfully created task:`, newTask);
  return newTask;
}

export function updateTask(id: string, updates: Partial<Task>): Task | undefined {
  const storage = readStorage();
  const taskIndex = storage.tasks.findIndex(task => task.id === id);
  
  if (taskIndex === -1) {
    console.error(`[ERROR] Task not found with id: ${id}`);
    return undefined;
  }
  
  const existingTask = storage.tasks[taskIndex];
  
  // Handle media updates carefully
  const updatedMedia = updates.media !== undefined ? updates.media : existingTask.media;
  
  const updatedTask = {
    ...existingTask,
    ...updates,
    media: updatedMedia,
    updatedAt: new Date().toISOString(),
    subtasks: updates.subtasks || existingTask.subtasks || []
  };
  
  storage.tasks[taskIndex] = updatedTask;
  writeStorage(storage);
  console.log(`[INFO] Successfully updated task: ${id}`, updatedTask);
  return updatedTask;
}

export function deleteTask(id: string): boolean {
  const storage = readStorage();
  storage.tasks = storage.tasks.filter(task => task.id !== id);
  writeStorage(storage);
  return true;
}

// Add new function to handle subtask operations
export function updateSubtask(taskId: string, subtaskId: string, updates: Partial<Task['subtasks'][0]>): Task | undefined {
  const storage = readStorage();
  const taskIndex = storage.tasks.findIndex(task => task.id === taskId);
  
  if (taskIndex === -1) {
    console.error(`[ERROR] Task not found with id: ${taskId}`);
    return undefined;
  }
  
  const task = storage.tasks[taskIndex];
  const subtaskIndex = task.subtasks.findIndex(st => st.id === subtaskId);
  
  if (subtaskIndex === -1) {
    console.error(`[ERROR] Subtask not found with id: ${subtaskId}`);
    return undefined;
  }
  
  task.subtasks[subtaskIndex] = {
    ...task.subtasks[subtaskIndex],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  task.updatedAt = new Date().toISOString();
  storage.tasks[taskIndex] = task;
  writeStorage(storage);
  
  return task;
}

// Feedback history management
export function getFeedbackHistory(taskId?: string): FeedbackHistory[] {
  const storage = readStorage();
  if (taskId) {
    return storage.feedbackHistory.filter(feedback => feedback.taskId === taskId);
  }
  return storage.feedbackHistory;
}

export function saveFeedback(feedback: Omit<FeedbackHistory, 'id' | 'createdAt' | 'updatedAt'>): FeedbackHistory {
  const storage = readStorage();
  const newFeedback: FeedbackHistory = {
    id: Date.now().toString(),
    ...feedback,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  storage.feedbackHistory.push(newFeedback);
  writeStorage(storage);
  return newFeedback;
}

export function updateFeedback(id: string, updates: Partial<FeedbackHistory>): FeedbackHistory | undefined {
  const storage = readStorage();
  const feedbackIndex = storage.feedbackHistory.findIndex(feedback => feedback.id === id);
  
  if (feedbackIndex === -1) {
    return undefined;
  }
  
  const updatedFeedback = {
    ...storage.feedbackHistory[feedbackIndex],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  storage.feedbackHistory[feedbackIndex] = updatedFeedback;
  writeStorage(storage);
  return updatedFeedback;
}

export function deleteFeedback(id: string): boolean {
  const storage = readStorage();
  const initialLength = storage.feedbackHistory.length;
  storage.feedbackHistory = storage.feedbackHistory.filter(feedback => feedback.id !== id);
  writeStorage(storage);
  return storage.feedbackHistory.length < initialLength;
}

// Initialize storage on module load
try {
  console.log('[INFO] Initializing storage...');
  initializeStorage();
  console.log('[INFO] Storage initialized successfully');
} catch (error) {
  console.error('[ERROR] Failed to initialize storage:', error);
  process.exit(1);
} 