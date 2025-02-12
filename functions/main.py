# Welcome to Cloud Functions for Firebase for Python!
# To get started, simply uncomment the below code or create your own.
# Deploy with `firebase deploy`

import firebase_functions
from firebase_admin import initialize_app, firestore, credentials
import json
from flask import jsonify, request
from firebase_functions import https_fn
from flask_cors import CORS
import os
import openai
import traceback

# Initialize Firebase Admin with service account
cred = credentials.Certificate('service-account.json')
initialize_app(cred)

# Get Firestore client
db = firestore.client()

class LLMHandler:
    def __init__(self, db):
        self.db = db

    def handle_request(self, req, headers):
        try:
            # Parse request data first
            data = json.loads(req.data)
            print(f"[DEBUG] Received LLM request data: {data}")

            # Get API key from headers or request body
            api_key = req.headers.get('X-API-Key') or data.get('apiKey')
            if not api_key:
                return (jsonify({
                    'error': 'API key is required',
                    'details': 'Please provide an OpenAI API key in the settings'
                }), 400, headers)

            # Initialize OpenAI client
            openai.api_key = api_key

            # Get required fields
            task_id = data.get('taskId')
            user_response = data.get('userResponse')
            prompt_template = data.get('promptTemplate')
            subtask_id = data.get('subtaskId')
            task_goal = data.get('taskGoal')
            knowledge_base = data.get('knowledgeBase', [])

            if not task_id or not user_response:
                return (jsonify({
                    'error': 'Missing required fields',
                    'details': 'Task ID and user response are required'
                }), 400, headers)

            # Get task details
            task_doc = self.db.collection('tasks').document(task_id).get()
            if not task_doc.exists:
                return (jsonify({
                    'error': 'Task not found',
                    'details': f'Task with ID {task_id} does not exist'
                }), 404, headers)

            task = task_doc.to_dict()
            print(f"[DEBUG] Retrieved task: {task}")

            # If it's a subtask request, get the subtask goal
            goal = task_goal
            if subtask_id:
                subtask = next((st for st in task.get('subtasks', []) if st.get('id') == subtask_id), None)
                if subtask:
                    goal = subtask.get('goal') or task.get('goal')
                print(f"[DEBUG] Using subtask goal: {goal}")
            else:
                goal = task.get('goal')
                print(f"[DEBUG] Using main task goal: {goal}")

            if not goal:
                return (jsonify({
                    'error': 'No goal found',
                    'details': 'Neither task nor subtask has a defined goal'
                }), 400, headers)
            
            # Process knowledge base content
            kb_content = ""
            if knowledge_base:
                print(f"[DEBUG] Processing {len(knowledge_base)} knowledge base files")
                kb_content = "\n\n".join([f"From {kb['name']}:\n{kb['content']}" for kb in knowledge_base])
                print(f"[DEBUG] Combined knowledge base content length: {len(kb_content)}")
                print(f"[DEBUG] Knowledge base content: {kb_content[:200]}...")  # Log first 200 chars
            
            # Prepare the prompt
            if prompt_template:
                try:
                    # Create a dictionary with all possible template variables
                    template_vars = {
                        'goal': goal,
                        'taskGoal': goal,  # support both formats
                        'response': user_response,
                        'userResponse': user_response,  # support both formats
                        'kbContent': kb_content if kb_content else "No knowledge base content provided.",
                    }
                    
                    # Try to format the template with all possible variables
                    prompt = prompt_template.format(**template_vars)
                    print(f"[DEBUG] Successfully formatted prompt template with knowledge base")
                except KeyError as e:
                    print(f"[ERROR] Invalid template variable in prompt: {str(e)}")
                    return (jsonify({
                        'error': 'Invalid prompt template',
                        'details': f'Template contains invalid variable: {str(e)}'
                    }), 400, headers)
                except Exception as e:
                    print(f"[ERROR] Failed to format prompt template: {str(e)}")
                    return (jsonify({
                        'error': 'Failed to format prompt',
                        'details': str(e)
                    }), 400, headers)
            else:
                # Build default prompt with knowledge base integration
                kb_section = ""
                if kb_content:
                    kb_section = f"\nRelevant Knowledge Base Content:\n{kb_content}\n\nPlease incorporate relevant concepts from the knowledge base in your feedback."
                
                prompt = f"""Please provide feedback on the following response to a learning task.

Task Goal: {goal}{kb_section}

User Response: {user_response}

Please provide constructive feedback that:
1. Acknowledges what was done well
2. Identifies areas for improvement
3. Offers specific suggestions for enhancement
4. Maintains an encouraging tone
5. References and incorporates relevant concepts from the knowledge base when available

Feedback:"""

            print(f"[DEBUG] Using prompt with knowledge base integration. Prompt length: {len(prompt)}")

            # Get feedback from OpenAI
            try:
                response = openai.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "You are a helpful teaching assistant providing constructive feedback on student responses. When knowledge base content is provided, incorporate relevant concepts from it in your feedback."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=200,
                    temperature=0.5
                )

                feedback = response.choices[0].message.content
                print(f"[DEBUG] Received OpenAI response: {feedback}")

                # Store feedback in Firestore
                feedback_doc = {
                    'taskId': task_id,
                    'subtaskId': subtask_id,
                    'response': user_response,
                    'feedback': feedback,
                    'createdAt': firestore.SERVER_TIMESTAMP
                }
                # Add document and get the document reference
                doc_ref = self.db.collection('feedback').document()
                doc_ref.set(feedback_doc)
                feedback_id = doc_ref.id

                print(f"[DEBUG] Saved feedback with ID: {feedback_id}")
                return (jsonify({'feedback': feedback, 'feedbackId': feedback_id}), 200, headers)

            except openai.AuthenticationError as e:
                error_msg = 'Invalid OpenAI API key. Please check your settings.'
                print(f"[ERROR] OpenAI authentication error: {str(e)}")
                return (jsonify({
                    'error': error_msg,
                    'details': str(e)
                }), 401, headers)
            except openai.RateLimitError as e:
                error_msg = 'OpenAI API rate limit exceeded. Please try again later.'
                print(f"[ERROR] OpenAI rate limit error: {str(e)}")
                return (jsonify({
                    'error': error_msg,
                    'details': str(e)
                }), 429, headers)
            except openai.APIError as e:
                error_msg = f'OpenAI API error: {str(e)}'
                print(f"[ERROR] OpenAI API error: {str(e)}")
                return (jsonify({
                    'error': error_msg,
                    'details': str(e)
                }), 500, headers)

        except json.JSONDecodeError as e:
            error_msg = 'Invalid request format'
            print(f"[ERROR] Invalid JSON in request: {str(e)}")
            return (jsonify({
                'error': error_msg,
                'details': str(e)
            }), 400, headers)
        except Exception as e:
            error_msg = 'An unexpected error occurred'
            print(f"[ERROR] Unexpected error in LLM endpoint: {str(e)}")
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            return (jsonify({
                'error': error_msg,
                'details': str(e)
            }), 500, headers)

# Initialize handlers
llm_handler = LLMHandler(db)

# Enable CORS
@https_fn.on_request()
def api(req: https_fn.Request) -> https_fn.Response:
    # Set CORS headers for all responses
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
        'Access-Control-Max-Age': '3600'
    }

    # Handle preflight requests
    if req.method == 'OPTIONS':
        return ('', 204, headers)

    try:
        # Handle the request based on the path and method
        path_parts = req.path.strip('/').split('/')
        collection = path_parts[0] if len(path_parts) > 0 else None

        if collection == 'tasks':
            if req.method == 'GET':
                if len(path_parts) == 1:
                    # Get all tasks
                    tasks = []
                    docs = db.collection('tasks').stream()
                    for doc in docs:
                        task = doc.to_dict()
                        task['id'] = doc.id
                        tasks.append(task)
                    return (jsonify(tasks), 200, headers)
                else:
                    # Get specific task
                    task_id = path_parts[1]
                    doc = db.collection('tasks').document(task_id).get()
                    if doc.exists:
                        task = doc.to_dict()
                        task['id'] = doc.id
                        return (jsonify(task), 200, headers)
                    return (jsonify({'error': 'Task not found'}), 404, headers)

            elif req.method == 'POST':
                # Create new task
                data = json.loads(req.data)
                doc_ref = db.collection('tasks').document()
                data['createdAt'] = firestore.SERVER_TIMESTAMP
                data['updatedAt'] = firestore.SERVER_TIMESTAMP
                doc_ref.set(data)
                task = doc_ref.get().to_dict()
                task['id'] = doc_ref.id
                return (jsonify(task), 201, headers)

            elif req.method == 'PUT':
                # Update task
                task_id = path_parts[1]
                data = json.loads(req.data)
                data['updatedAt'] = firestore.SERVER_TIMESTAMP
                doc_ref = db.collection('tasks').document(task_id)
                doc_ref.update(data)
                task = doc_ref.get().to_dict()
                task['id'] = doc_ref.id
                return (jsonify(task), 200, headers)

            elif req.method == 'DELETE':
                # Delete task
                task_id = path_parts[1]
                db.collection('tasks').document(task_id).delete()
                return ('', 204, headers)

        elif collection == 'feedback':
            if req.method == 'GET':
                # Get feedback history for a task
                task_id = request.args.get('taskId')
                if not task_id:
                    return (jsonify({'error': 'Task ID is required'}), 400, headers)
                
                feedback_list = []
                docs = db.collection('feedback').where('taskId', '==', task_id).stream()
                for doc in docs:
                    feedback = doc.to_dict()
                    feedback['id'] = doc.id
                    feedback_list.append(feedback)
                return (jsonify(feedback_list), 200, headers)

            elif req.method == 'PATCH':
                # Update feedback
                feedback_id = path_parts[1]
                data = json.loads(req.data)
                data['updatedAt'] = firestore.SERVER_TIMESTAMP
                doc_ref = db.collection('feedback').document(feedback_id)
                doc_ref.update(data)
                feedback = doc_ref.get().to_dict()
                feedback['id'] = doc_ref.id
                return (jsonify(feedback), 200, headers)

        elif collection == 'llm':
            return llm_handler.handle_request(req, headers)

        elif collection == 'health':
            return ('OK', 200, headers)

        return (jsonify({'error': 'Not found'}), 404, headers)

    except Exception as e:
        print(f"[ERROR] Global error handler: {str(e)}")
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return (jsonify({'error': 'Internal server error', 'details': str(e)}), 500, headers)