export interface Subtask {
  id: string;
  title: string;
  description: string;
  goal?: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  goal: string; // The specific goal or outcome expected for this task
  learningObjectives?: string[];
  media?: {
    type: 'image' | 'video';
    url: string;
    isLocal: boolean; // true for uploaded images, false for URLs
  }[];
  createdAt: string;
  updatedAt: string;
  subtasks: Subtask[];
  completed: boolean;
  parentTaskId?: string; // Optional field to reference parent task
}

export interface FeedbackHistory {
  id: string;
  taskId: string;
  subtaskId?: string;
  response: string;
  feedback: string;
  editedFeedback?: string;
  createdAt: string;
  updatedAt: string;
  rating?: number;
  comment?: string;
}

export interface APIError {
  error: string;
} 